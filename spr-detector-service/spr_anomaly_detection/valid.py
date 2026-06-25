# -*- coding: utf-8 -*-
# Author: Qinghua Liu <liu.11085@osu.edu>
# License: Apache-2.0 License

import torch
import random, argparse
from pathlib import Path
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import roc_auc_score
from Detectors.model_wrapper import *
from Detectors.HP_list import Optimal_Uni_algo_HP_dict
from Detectors.dataloader import SPRValidSegLoader
import numpy as np
from sklearn.metrics import precision_recall_fscore_support
from sklearn.metrics import accuracy_score

# seeding
seed = 2024
torch.manual_seed(seed)
torch.cuda.manual_seed(seed)
torch.cuda.manual_seed_all(seed)
np.random.seed(seed)
random.seed(seed)
torch.backends.cudnn.benchmark = False
torch.backends.cudnn.deterministic = True

print("CUDA Available: ", torch.cuda.is_available())
print("cuDNN Version: ", torch.backends.cudnn.version())


def save_valid_params(save_path, score_min, score_max, threshold):
    import os
    os.makedirs(save_path, exist_ok=True)
    score_params = np.array([score_min, score_max, threshold])
    np.save(os.path.join(save_path, 'score_params'), score_params)


def load_valid_params(save_path):
    import os
    if os.path.exists(os.path.join(save_path, 'score_params.npy')):
        score_params = np.load(os.path.join(save_path, 'score_params.npy'))
        score_min, score_max, threshold = score_params[0], score_params[1], score_params[2]
        return score_min, score_max, threshold
    else:
        raise Exception("No score_params.npy found")


def get_dataset_save_folder(base_save_folder, data_path, ad_name):
    dataset_name = Path(data_path).resolve().name
    if not dataset_name:
        dataset_name = "dataset"
    base_path = Path(base_save_folder)
    root = base_path.parent if base_path.name else base_path
    if base_path.name == dataset_name:
        return str(base_path)
    if root.name != ad_name:
        root = Path("models") / ad_name
    return str(root / dataset_name)


if __name__ == '__main__':
    default_AD_models = [
        'MARPP'
    ]

    parser = argparse.ArgumentParser(description='Running mTSB')
    parser.add_argument('--data_path', type=str, default='Datasets/SPR')
    parser.add_argument('--save', type=bool, default=False)
    parser.add_argument('--threshold', type=float, default=7)
    parser.add_argument('--score_mode', type=str, default=None,
                        choices=['mean_mse', 'topk_mean_mse'],
                        help='Anomaly score mode. Defaults to the model HP setting.')
    parser.add_argument('--topk_ratio', type=float, default=None,
                        help='Top-k ratio for topk_mean_mse score mode.')

    args = parser.parse_args()

    spr_dataloader = SPRValidSegLoader(args.data_path)

    samples = spr_dataloader.samples

    samples = samples.reshape(-1, samples.shape[-1])

    for AD_Name in default_AD_models:
        Optimal_Det_HP = dict(Optimal_Uni_algo_HP_dict[AD_Name])
        Optimal_Det_HP['save_folder'] = get_dataset_save_folder(
            Optimal_Det_HP['save_folder'], args.data_path, AD_Name)
        if args.score_mode is not None:
            Optimal_Det_HP['score_mode'] = args.score_mode
        if args.topk_ratio is not None:
            Optimal_Det_HP['topk_ratio'] = args.topk_ratio
        score_min, score_max, thresh = load_valid_params(Optimal_Det_HP['save_folder'])

        if AD_Name in Semisupervise_AD_Pool:
            output = run_Semisupervise_AD(AD_Name, [samples, samples], samples, **Optimal_Det_HP)
        elif AD_Name in Unsupervise_AD_Pool:
            output = run_Unsupervise_AD(AD_Name, samples, **Optimal_Det_HP)
        else:
            raise Exception(f"{AD_Name} is not defined")

        if isinstance(output, np.ndarray):
            output = (output-score_min)/(score_max-score_min)
            print("AD method:", AD_Name)
            print("Threshold:", thresh)
            pred = np.array((output >= thresh).astype(int))
            print(pred.sum(), pred.shape)
        else:
            print(output)

        print()
