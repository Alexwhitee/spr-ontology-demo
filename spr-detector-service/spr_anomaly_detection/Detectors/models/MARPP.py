"""
This function is adapted from [pyod] by [yzhao062]
Original source: [https://github.com/yzhao062/pyod]
"""

from __future__ import division
from __future__ import print_function

import numpy as np
import torch, math
from networkx import attr_matrix
from sklearn.utils import check_array
from sklearn.utils.validation import check_is_fitted
from torch import nn
from sklearn.preprocessing import MinMaxScaler
import os

# from .feature import Window
from .base import BaseDetector
# from ..utils.stat_models import pairwise_distances_no_broadcast
from ..utils.dataset import TSDataset
from ..utils.utility import get_activation_by_name
import torch.nn.functional as F
from torch.utils.data import DataLoader
from tqdm import tqdm

from ..utils.dataset import ReconstructDataset
from ..utils.torch_utility import EarlyStoppingTorch, get_gpu
import pywt

def swt_transform(x,
                  wavelet: str = 'db4',
                  level: int = 1,
                  mode: str = 'symmetric'):
    """
    使用 Stationary Wavelet Transform（SWT）对输入时间序列做变换，
    SWT 在每层保持与输入相同长度（不下采样），适合需要长度不变的场景。

    输入:
      x: Tensor, shape (bs, length, feats)
      wavelet: 小波基名称（pywt 支持）
      level: 分解层数
      mode: 延拓模式（pywt 支持多种，如 'symmetric', 'periodization'）

    返回:
      coeffs_list: 长度为 level 的列表，每个元素为 Tensor，shape (bs, length, feats, 2)
                   最后一维为 (approx, detail) —— 两个 coeff（同 length）
                   或者你也可以按应用改成 (bs, level, length, feats*2) 等结构
    """
    assert x.ndim == 3, "输入应为 (bs, length, feats)"
    bs, length, feats = x.shape

    # 转为 numpy 便于调用 pywt.swt（pywt 支持 numpy）
    x_np = x  # (bs, length, feats)

    # 为简便，我们对 feats 维度逐个小波变换
    # swt 对每个一维序列返回一个列表，长度为 level，每层是 (approx, detail)，each shape == length
    coeffs_per_level = []  # will hold for each level: tensor shape (bs, length, feats, 2)
    for lev in range(level):
        coeffs_per_level.append(np.zeros((bs, length, feats, 2), dtype=x_np.dtype))

    for b in range(bs):
        for f in range(feats):
            sig = x_np[b, :, f]
            # pywt.swt 返回 list len=level, 每项 (cA, cD), shape == length
            swt_coeffs = pywt.swt(sig, wavelet, level=level, start_level=0, trim_approx=False, axis=-1)
            # swt_coeffs 是 list((cA, cD), ...)
            for lev, (cA, cD) in enumerate(swt_coeffs):
                coeffs_per_level[lev][b, :, f, 0] = cA
                coeffs_per_level[lev][b, :, f, 1] = cD

    # 每个元素 shape (bs, length, feats, 2)
    return coeffs_per_level

def dct_transform(signal):
    from scipy.fft import dct
    signal = dct(signal, type=2, norm='ortho', axis=1)
    return signal

def augment_time_series_by_interpolate(
    x,
    segment=20,
    m=5,
    same_source=True,
    allow_overlap=True,
    per_sample=True,
    seed=42
):
    """
    对输入 x (bs, length, feats) 进行增强。
    对每个样本（或整个 batch，取决 per_sample），
      - 随机选 segment 段 1: [s1, s1+segment)
      - 在段1内随机移除 m 个时间点（设为 NaN / 并记录索引）
      - 随机选 segment 段 2: [s2, s2+segment)
      - 对段2 内进行线性插值以生成 m 个时间点（基于段2的现有相邻点），
        将这些插值值填回段1 的被删除位置
    参数:
      x: ndarray, shape (bs, length, feats)
      segment: int, 段长度（必须 <= length）
      m: int, 在段1 中要删除并用插值补回的时间点个数 (m <= segment)
      same_source: bool, 若 True，从相同样本中选择段2；若 False，可从 batch 中其它样本随机选择
      allow_overlap: bool, 是否允许 s1 和 s2 段重叠
      per_sample: bool, 是否对每个样本独立选择 s1/s2/m；若 False，则对整个 batch 使用同一组 s1/s2/indices
      seed: 随机种子（可选）
    返回:
      x_aug: ndarray, shape (bs, length, feats)  增强后的数据（copy）
    注意:
      - 输入 x 不会被就地修改；返回新的数组
      - 若无法找到合法 s2（例如长度不足、禁止重叠等），会退回到允许重叠或抛出异常
    """

    if seed is not None:
        rng = np.random.default_rng(seed)
    else:
        rng = np.random.default_rng()

    bs, length, feats = x.shape
    if segment > length:
        raise ValueError("segment must be <= length")
    if m > segment:
        raise ValueError("m must be <= segment")

    x_aug = x.copy()

    # helper: 选择一个合法的起始位置列表
    def possible_starts():
        return np.arange(0, length - segment + 1)

    starts = possible_starts()
    if len(starts) == 0:
        raise ValueError("segment too large for the given length")

    # 如果不是 per_sample，则共享一次选择
    if not per_sample:
        s1 = rng.choice(starts)
        s2 = None
        # 选 s2: 若 same_source True 则在同一 sample 的位置随机；若 False 则在 batch 中任意 sample 选择位置（但这里先只选位置）
        # 我们在具体 sample 时再决定使用哪个 sample 的 s2 起始（若 same_source=False）
        # 选择段1中被删除的索引（相对于段内偏移）
        del_offsets = rng.choice(np.arange(segment), size=m, replace=False)
        del_offsets.sort()

    for i in range(bs):
        # 选择 s1/s2/del_offsets
        if per_sample:
            s1 = rng.choice(starts)
            # choose deletion offsets inside the segment
            del_offsets = rng.choice(np.arange(segment), size=m, replace=False)
            del_offsets.sort()
        # choose s2
        if same_source:
            # 从同一样本中选择 s2，若禁止重叠需要重试
            possible = starts.copy()
            if not allow_overlap:
                # 删除会与 s1 重叠的位置
                mask = np.ones_like(possible, dtype=bool)
                for cand in possible:
                    if not (cand + segment <= s1 or cand >= s1 + segment):
                        mask[cand] = False
                possible = possible[mask]
                if len(possible) == 0:
                    # 若无可用位置，允许重叠作为回退（或抛错）
                    possible = starts.copy()
            s2 = rng.choice(possible)
            src_sample_idx = i
        else:
            # 可从 batch 中其它样本随机选起始位置及样本
            # 先选样本 idx（可与 i 相同）
            src_sample_idx = rng.integers(0, bs)
            # 若不允许与 s1 重叠且选中相同样本则要确保起始不重叠；否则不限
            possible = starts.copy()
            if (not allow_overlap) and src_sample_idx == i:
                mask = np.ones_like(possible, dtype=bool)
                for cand in possible:
                    if not (cand + segment <= s1 or cand >= s1 + segment):
                        mask[cand] = False
                possible = possible[mask]
                if len(possible) == 0:
                    possible = starts.copy()
            s2 = rng.choice(possible)

        # 段索引（相对于整个序列）
        seg1_idx = np.arange(s1, s1 + segment)
        seg2_idx = np.arange(s2, s2 + segment)

        # 段数据
        seg1 = x_aug[i, seg1_idx, :]  # note: we operate on x_aug copy
        seg2 = x[src_sample_idx, seg2_idx, :]  # 使用原始 x 作为插值源（可改为 x_aug）

        # 需要删除的位置 (相对于 seg1 的偏移)
        del_pos = del_offsets  # array of offsets < segment
        # 对被删除位置标 NaN（便于调试和可视化），但实际我们会直接填入插值值
        seg1_deleted = seg1.copy()
        seg1_deleted[del_pos, :] = np.nan

        # 从 seg2 中进行线性插值以生成 m 个点：
        # 方法：对于 seg2 的每个特征维度，构造索引 0..segment-1 的已知点，
        # 用 segment 的相邻点对指定的 target positions 做线性插值。
        # 这里的策略：对 seg2 内选 m 个位置（del_pos 在 seg1 的位置），
        # 将这些位置对应映射为 seg2 中的相同偏移位置来插值。
        # 更灵活的方式是把 seg2 的连续序列作为已知曲线，用线性插值在任意位置采样。
        # 我们将 del_pos 映射到 seg2 的同等偏移 (mod 或 clip)：
        #   t_targets = del_pos (作为在 seg2 段内的位置)。
        # 若需要，可随机扰动 t_targets。

        t_known = np.arange(segment)  # positions in seg2
        t_targets = del_pos  # same relative offsets
        # 可选：随机扰动 t_targets，使插值更具随机性（注释掉以下两行以保持固定）
        # jitter = rng.uniform(-0.2, 0.2, size=t_targets.shape)
        # t_targets = np.clip(t_targets + jitter, 0, segment - 1)

        # 一维线性插值实现（对每个特征独立）
        interp_values = np.empty((m, feats), dtype=x.dtype)
        for f in range(feats):
            y = seg2[:, f]
            # 若 seg2 中存在常数或NaN，np.interp 也能工作，但需要 finite values
            # np.interp 要求 x (t_known) 单调，且 y 不含 NaN；若含 NaN，我们先用简单填充
            if np.any(np.isnan(y)):
                # 使用前向/后向填充替代 NaN
                y_valid = y.copy()
                isnan = np.isnan(y_valid)
                if isnan.all():
                    # 全 NaN 时退回为 0
                    y_valid[:] = 0.0
                else:
                    # forward fill then back fill
                    # forward
                    idxs = np.where(~isnan)[0]
                    for idx in range(len(y_valid)):
                        if isnan[idx]:
                            # find previous valid
                            prev = idxs[idxs < idx]
                            if prev.size > 0:
                                y_valid[idx] = y_valid[prev[-1]]
                            else:
                                # use next valid
                                nxt = idxs[idxs > idx]
                                if nxt.size > 0:
                                    y_valid[idx] = y_valid[nxt[0]]
                                else:
                                    y_valid[idx] = 0.0
                y = y_valid

            interp_values[:, f] = np.interp(t_targets, t_known, y)

        # 将插值填回 seg1 的删除位置
        seg1_filled = seg1.copy()
        seg1_filled[del_pos, :] = interp_values

        # 把修改后的 seg1 写回 x_aug
        x_aug[i, seg1_idx, :] = seg1_filled

    return x_aug

# relu based hard shrinkage function, only works for positive values
def hard_shrink_relu(input, lambd=0, epsilon=1e-12):
    output = (F.relu(input-lambd) * input) / (torch.abs(input - lambd) + epsilon)
    return output


class MemoryUnit(nn.Module):
    def __init__(self, mem_dim, fea_dim, shrink_thres):
        super(MemoryUnit, self).__init__()
        self.mem_dim = mem_dim
        self.fea_dim = fea_dim
        self.weight = torch.nn.Parameter(torch.Tensor(self.mem_dim, self.fea_dim))  # M x C
        self.bias = None
        self.shrink_thres= shrink_thres
        # self.hard_sparse_shrink_opt = nn.Hardshrink(lambd=shrink_thres)

        self.reset_parameters()

    def reset_parameters(self):
        stdv = 1. / math.sqrt(self.weight.size(1))
        self.weight.data.uniform_(-stdv, stdv)
        if self.bias is not None:
            self.bias.data.uniform_(-stdv, stdv)

    def forward(self, x):
        att_weight = F.linear(x, self.weight)  # Fea x Mem^T, (TxC) x (CxM) = TxM
        att_weight = F.softmax(att_weight, dim=1)  # TxM
        # ReLU based shrinkage, hard shrinkage for positive value
        if(self.shrink_thres>0):
            att_weight = hard_shrink_relu(att_weight, lambd=self.shrink_thres)
            # att_weight = F.softshrink(att_weight, lambd=self.shrink_thres)
            # normalize???
            att_weight = F.normalize(att_weight, p=1, dim=1)
            # att_weight = F.softmax(att_weight, dim=1)
            # att_weight = self.hard_sparse_shrink_opt(att_weight)
        mem_trans = self.weight.permute(1, 0)  # Mem^T, MxC
        output = F.linear(att_weight, mem_trans)  # AttWeight x Mem^T^T = AW x Mem, (TxM) x (MxC) = TxC
        return {'output': output, 'att': att_weight}  # output, att_weight

    def extra_repr(self):
        return 'mem_dim={}, fea_dim={}'.format(
            self.mem_dim, self.fea_dim is not None
        )


# NxCxHxW -> (NxHxW)xC -> addressing Mem, (NxHxW)xC -> NxCxHxW
class MemModule(nn.Module):
    def __init__(self, mem_dim, fea_dim, shrink_thres=0.0025):
        super(MemModule, self).__init__()
        self.mem_dim = mem_dim
        self.fea_dim = fea_dim
        self.shrink_thres = shrink_thres
        self.memory = MemoryUnit(self.mem_dim, self.fea_dim, self.shrink_thres)

    def forward(self, x):
        y_and = self.memory(x)
        #
        y = y_and['output']
        att = y_and['att']
        return y, att

class InnerAutoencoder(nn.Module):
    def __init__(self,
                 n_features,
                 hidden_neurons=(128, 64),
                 dropout_rate=0.2,
                 batch_norm=True,
                 n_mem=3,
                 hidden_activation='relu',
                 uncertain=False):

        # initialize the super class
        super(InnerAutoencoder, self).__init__()

        # save the default values
        self.n_features = n_features
        self.dropout_rate = dropout_rate
        self.batch_norm = batch_norm
        self.hidden_activation = hidden_activation

        self.hidden_dim = 256
        self.lstm = nn.GRU(self.n_features, self.hidden_dim, 2)

        # create the dimensions for the input and hidden layers
        self.layers_neurons_encoder_ = [self.n_features, *hidden_neurons]
        self.layers_neurons_decoder_ = self.layers_neurons_encoder_[::-1]
        self.layers_neurons_encoder_[0] = self.hidden_dim
        self.uncertain = uncertain

        # get the object for the activations functions
        self.activation = get_activation_by_name(hidden_activation)

        # initialize encoder and decoder as a sequential
        self.encoder = nn.Sequential()
        self.decoder = nn.Sequential()

        # fill the encoder sequential with hidden layers
        for idx, layer in enumerate(self.layers_neurons_encoder_[:-1]):

            # create a linear layer of neurons
            self.encoder.add_module(
                "linear" + str(idx),
                torch.nn.Linear(layer,self.layers_neurons_encoder_[idx + 1]))

            # add a batch norm per layer if wanted (leave out first layer)
            if batch_norm:
                self.encoder.add_module("batch_norm" + str(idx),
                                        nn.BatchNorm1d(self.layers_neurons_encoder_[idx + 1]))

            # create the activation
            self.encoder.add_module(self.hidden_activation + str(idx),
                                    self.activation)

            # create a dropout layer
            self.encoder.add_module("dropout" + str(idx),
                                    torch.nn.Dropout(dropout_rate))

        # fill the decoder layer
        for idx, layer in enumerate(self.layers_neurons_decoder_[:-1]):

            # create a linear layer of neurons
            self.decoder.add_module(
                "linear" + str(idx),
                torch.nn.Linear(layer,self.layers_neurons_decoder_[idx + 1]))

            # create a batch norm per layer if wanted (only if it is not the
            # last layer)
            if batch_norm and idx < len(self.layers_neurons_decoder_[:-1]) - 1:
                self.decoder.add_module("batch_norm" + str(idx),
                                        nn.BatchNorm1d(self.layers_neurons_decoder_[idx + 1]))

            # create the activation
            self.decoder.add_module(self.hidden_activation + str(idx),
                                    self.activation)

            # create a dropout layer (only if it is not the last layer)
            if idx < len(self.layers_neurons_decoder_[:-1]) - 1:
                self.decoder.add_module("dropout" + str(idx),
                                        torch.nn.Dropout(dropout_rate))

        if self.uncertain:
            self.decoder.add_module(
                "uncertain",
                torch.nn.Linear(self.layers_neurons_decoder_[-1], self.layers_neurons_decoder_[-1]*2))
        self.memory = MemModule(n_mem, self.layers_neurons_encoder_[-1])

    def forward(self, x, hidden = None):
        # we could return the latent representation here after the encoder
        # as the latent representation
        x_ = x.unsqueeze(0).permute(1, 0, 2)
        hidden = torch.rand(2, x.shape[0], self.n_hidden).to(self.device) if hidden is not None else hidden
        out, hidden = self.lstm(x_, hidden)
        x = out[-1] + x # res_net
        z = self.encoder(x)
        z_, att = self.memory(z)
        x = self.decoder(z_)
        if self.uncertain:
            x, uncertain = x.chunk(2, dim=1)
            x = torch.nn.functional.relu(x)
            uncertain = torch.nn.functional.tanh(uncertain)
            return {
                'x': x,
                'z': z,
                'z_': z_,
                'uncertain': uncertain,
                'att': att
            }

        return {
                'x': x,
                'z': z,
                'z_': z_,
                'att': att
            }

class AutoEncoder(BaseDetector):
    def __init__(self,
                 slidingWindow=100,
                 hidden_neurons=None,
                 hidden_activation='relu',
                 batch_norm=True,
                 learning_rate=1e-3,
                 epochs=100,
                 batch_size=32,
                 dropout_rate=0,
                 weight_decay=1e-5,
                 # validation_size=0.1,
                 preprocessing=False,
                 loss_fn=None,
                 verbose=False,
                 # random_state=None,
                 contamination=0.1,
                 device=None,
                 save_folder='./autoencoder',
                 score_mode='mean_mse',
                 topk_ratio=0.1,
                 checkpoint_mode='best_dev',):
        super(AutoEncoder, self).__init__(contamination=contamination)

        self.save_folder = save_folder
        self.save_path = os.path.join(save_folder, 'model.pkl')

        self.n_mem = 3
        self.uncertain = False
        self.augment = False

        # save the initialization values
        self.slidingWindow = slidingWindow
        self.hidden_neurons = hidden_neurons
        self.hidden_activation = hidden_activation
        self.batch_norm = batch_norm
        self.learning_rate = learning_rate
        self.epochs = epochs
        self.batch_size = batch_size
        self.dropout_rate = dropout_rate
        self.weight_decay = weight_decay
        self.preprocessing = preprocessing
        self.loss_fn = loss_fn
        self.verbose = verbose
        self.device = device
        self.score_mode = score_mode
        self.topk_ratio = topk_ratio
        self.checkpoint_mode = checkpoint_mode

        # create default loss functions
        if self.loss_fn is None:
            self.loss_fn = torch.nn.MSELoss()

        # create default calculation device (support GPU if available)
        if self.device is None:
            self.device = get_gpu(cuda=True)

        # default values for the amount of hidden neurons
        if self.hidden_neurons is None:
            self.hidden_neurons = [64, 32]

        if self.score_mode not in ('mean_mse', 'topk_mean_mse'):
            raise ValueError("score_mode must be one of: mean_mse, topk_mean_mse")
        if not 0 < self.topk_ratio <= 1:
            raise ValueError("topk_ratio must be in the range (0, 1].")
        if self.checkpoint_mode not in ('best_dev', 'last'):
            raise ValueError("checkpoint_mode must be one of: best_dev, last")

    def _reconstruction_score(self, data, preds):
        point_loss = (data - preds) ** 2
        if self.score_mode == 'mean_mse':
            return torch.mean(point_loss, dim=1)
        if self.score_mode == 'topk_mean_mse':
            k = max(1, math.ceil(point_loss.shape[1] * self.topk_ratio))
            topk_loss = torch.topk(point_loss, k=k, dim=1).values
            return torch.mean(topk_loss, dim=1)
        raise ValueError("Unsupported score_mode: {}".format(self.score_mode))

    def load_model(self):
        self.model.load_state_dict(torch.load(self.save_path))

    def save_model(self):
        if not os.path.exists(self.save_folder):
            os.makedirs(self.save_folder)
        torch.save(self.model.state_dict(), self.save_path)

    def data_wrap(self, X, augment=True):
        X = X.reshape(-1, self.slidingWindow, 1)
        if augment:
            X_augmented = augment_time_series_by_interpolate(X)
            X = np.concatenate((X, X_augmented), axis=0)
        X_swt = swt_transform(X)[0][:,:,:,0]
        X_dct = dct_transform(X)
        X = X.reshape(-1, self.slidingWindow)
        X_dct = X_dct.reshape(-1, self.slidingWindow)

        return X, X_dct


    # noinspection PyUnresolvedReferences
    def fit(self, X, y=None):
        """Fit detector. y is ignored in unsupervised methods.

        Parameters
        ----------
        X : numpy array of shape (n_samples, n_features)
            The input samples.

        y : Ignored
            Not used, present for API consistency by convention.

        Returns
        -------
        self : object
            Fitted estimator.
        """

        train_X = X[0] if isinstance(X, (list, tuple)) else X
        val_X = X[1] if isinstance(X, (list, tuple)) and len(X) > 1 else None

        X, X_dct = self.data_wrap(train_X, augment=self.augment)
        if val_X is not None:
            val_X, val_X_dct = self.data_wrap(val_X, augment=False)
        n_samples, n_features = X.shape

        # initialize the model
        self.model = InnerAutoencoder(
            n_features=n_features,
            hidden_neurons=self.hidden_neurons,
            dropout_rate=self.dropout_rate,
            batch_norm=self.batch_norm,
            hidden_activation=self.hidden_activation,
            n_mem = self.n_mem,
            uncertain = self.uncertain
        )

        # move to device and print model information
        self.model = self.model.to(self.device)
        if self.verbose:
            print(self.model)

        if os.path.exists(self.save_path):
            self.load_model()
        else:
            # if n_features == 1:
            #     # Converting time series data into matrix format
            #     X = Window(window = self.slidingWindow).convert(X)

            # validate inputs X and y (optional)
            X = check_array(X)
            self._set_n_classes(y)

            # X = MinMaxScaler(feature_range=(0,1)).fit_transform(X.T).T

            # conduct standardization if needed
            if self.preprocessing:
                self.mean, self.std = np.mean(X, axis=0), np.std(X, axis=0)
                self.std = np.where(self.std == 0, 1e-8, self.std)
                train_set = TSDataset(X=X, mean=self.mean, std=self.std)
                val_set = TSDataset(X=val_X, mean=self.mean, std=self.std) if val_X is not None else None
            else:
                train_set = TSDataset(X=X)
                val_set = TSDataset(X=val_X) if val_X is not None else None

            train_loader = torch.utils.data.DataLoader(train_set, batch_size=self.batch_size, shuffle=True, drop_last=True)
            val_loader = None
            if val_set is not None:
                val_loader = torch.utils.data.DataLoader(val_set, batch_size=self.batch_size, shuffle=False)

            # train the autoencoder to find the best one
            self._train_autoencoder(train_loader, val_loader)
            self.load_model()
            # The main evaluation path computes scores for calibration/test data explicitly.
            # Skip training-set scoring here because it runs a full batch_size=1 inference pass.
            # self.decision_scores_ = self.decision_function(X)
            # self._process_decision_scores()
        return self

    def _loss_from_batch(self, data):
        rt = self.model(data)
        if not self.uncertain:
            preds, att = rt['x'], rt['att']
            loss = self.loss_fn(data, preds) + torch.mean(-att * torch.log(att + 1e-12))
        else:
            preds, att = rt['x'], rt['att']
            logvar = rt['uncertain']
            loss1 = torch.mean(torch.exp(-logvar) * preds)
            loss2 = torch.mean(logvar)
            loss3 = torch.mean(-att * torch.log(att + 1e-12))
            loss = loss1 + loss2 + loss3
        return loss

    def _evaluate_autoencoder_loss(self, dataloader):
        self.model.eval()
        losses = []
        with torch.no_grad():
            for data, data_idx in dataloader:
                data = data.to(self.device).float()
                loss = self._loss_from_batch(data)
                losses.append(loss.item())
        self.model.train()
        return np.mean(losses)

    def _train_autoencoder(self, train_loader, val_loader=None):
        """Internal function to train the autoencoder

        Parameters
        ----------
        train_loader : torch dataloader
            Train data.
        """
        optimizer = torch.optim.Adam(
            self.model.parameters(), lr=self.learning_rate,
            weight_decay=self.weight_decay)

        self.best_loss = float('inf')
        self.best_val_loss = float('inf')
        self.best_model_dict = None

        epoch_iter = tqdm(range(self.epochs), desc="Training MARPP", unit="epoch", leave=False)
        for epoch in epoch_iter:
            overall_loss = []
            for data, data_idx in train_loader:
                data = data.to(self.device).float()
                loss = self._loss_from_batch(data)

                self.model.zero_grad()
                loss.backward()
                optimizer.step()
                overall_loss.append(loss.item())
            train_loss = np.mean(overall_loss)
            score_loss = train_loss
            if val_loader is not None:
                score_loss = self._evaluate_autoencoder_loss(val_loader)

            epoch_iter.set_postfix(train_loss=f"{train_loss:.6f}", dev_loss=f"{score_loss:.6f}")

            if self.verbose:
                tqdm.write('epoch {epoch}: training loss {train_loss}, validation loss {val_loss} '.format(
                    epoch=epoch, train_loss=train_loss, val_loss=score_loss))

            if self.checkpoint_mode == 'last':
                self.best_loss = train_loss
                self.best_val_loss = score_loss
                self.best_model_dict = self.model.state_dict()
                self.save_model()
            elif score_loss <= self.best_val_loss:
                self.best_loss = train_loss
                self.best_val_loss = score_loss
                self.best_model_dict = self.model.state_dict()
                self.save_model()
                tqdm.write(
                    "Saved checkpoint at epoch {epoch} with dev loss {dev_loss:.6f}".format(
                        epoch=epoch, dev_loss=score_loss))

    def decision_function(self, X):
        """Predict raw anomaly score of X using the fitted detector.

        The anomaly score of an input sample is computed based on different
        detector algorithms. For consistency, outliers are assigned with
        larger anomaly scores.

        Parameters
        ----------
        X : numpy array of shape (n_samples, n_features)
            The training input samples. Sparse matrices are accepted only
            if they are supported by the base estimator.

        Returns
        -------
        anomaly_scores : numpy array of shape (n_samples,)
            The anomaly score of the input samples.
        """
        # check_is_fitted(self, ['model', 'best_model_dict'])

        X = X.reshape(-1, 256)

        X, X_dct = self.data_wrap(X, augment=False)

        n_samples, n_features = X.shape

        # if n_features == 1:
        #     # Converting time series data into matrix format
        #     X = Window(window = self.slidingWindow).convert(X)

        # X = check_array(X)
        # X = MinMaxScaler(feature_range=(0,1)).fit_transform(X.T).T

        # note the shuffle may be true but should be False
        if self.preprocessing:
            dataset = TSDataset(X=X, mean=self.mean, std=self.std)
        else:
            dataset = TSDataset(X=X)

        dataloader = torch.utils.data.DataLoader(dataset,
                                                 batch_size=self.batch_size,
                                                 shuffle=False)

        # dataloader = DataLoader(
        #     dataset=ReconstructDataset(X, window_size=self.slidingWindow, stride=self.slidingWindow),
        #     batch_size=1,
        #     shuffle=False
        # )
        # enable the evaluation mode
        self.model.eval()

        # construct the vector for holding the reconstruction error
        outlier_scores = np.zeros([X.shape[0], ])
        z_embeddings = np.zeros([X.shape[0], 64])
        mem_z_embeddings = np.zeros([X.shape[0], 64])
        rec_x_embeddings = np.zeros([X.shape[0], 256])
        x_embeddings = np.zeros([X.shape[0], 256])
        #outlier_scores = np.zeros([len(dataloader), ])
        with torch.no_grad():
            # for data_idx, (data, _) in enumerate(dataloader):
            for data, data_idx in dataloader:
                # data = data.permute(1, 0)
                # print(data.shape)
                data_cuda = data.to(self.device).float()
                data_cuda = data_cuda.reshape(data_cuda.shape[0], -1)
                # this is the outlier score
                # outlier_scores[data_idx] = pairwise_distances_no_broadcast(
                #     data, self.model(data_cuda).cpu().numpy())
                rt = self.model(data_cuda)
                if not self.uncertain:
                    preds, att = rt['x'], rt['att']
                else:
                    preds, att = rt['x'], rt['att']

                loss = self._reconstruction_score(data_cuda, preds)
                data_idx = data_idx.detach().cpu().numpy()
                outlier_scores[data_idx] = loss.detach().cpu().numpy()
                z_embeddings[data_idx] = rt['z'].detach().cpu().numpy()
                mem_z_embeddings[data_idx] = rt['z_'].detach().cpu().numpy()
                rec_x_embeddings[data_idx] = rt['x'].detach().cpu().numpy()
                x_embeddings[data_idx] = data_cuda.detach().cpu().numpy()

        np.save(os.path.join(self.save_folder, 'embeddings'), z_embeddings)
        np.save(os.path.join(self.save_folder, 'mem_embeddings'), mem_z_embeddings)
        np.save(os.path.join(self.save_folder, 'x_rec'), rec_x_embeddings)
        np.save(os.path.join(self.save_folder, 'x'), x_embeddings)

        # if outlier_scores.shape[0] < n_samples:
        #     outlier_scores = np.array([outlier_scores[0]]*math.ceil((self.slidingWindow-1)/2) +
        #                 list(outlier_scores) + [outlier_scores[-1]]*((self.slidingWindow-1)//2))

        return outlier_scores
