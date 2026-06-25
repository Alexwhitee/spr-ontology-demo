import os
import numpy as np
from sklearn.model_selection import train_test_split

def normalize(seq):
    '''
    normalize to [-1,1]
    :param seq:
    :return:
    '''
    return 2 * (seq - np.min(seq)) / (np.max(seq) - np.min(seq)) - 1


def getFloderK(data, folder, label):
    normal_cnt = data.shape[0]
    folder_num = int(normal_cnt / 5)
    folder_idx = folder * folder_num

    folder_data = data[folder_idx:folder_idx + folder_num]

    remain_data = np.concatenate([data[:folder_idx], data[folder_idx + folder_num:]])
    if label == 0:
        folder_data_y = np.zeros((folder_data.shape[0],), dtype=np.float32)
        remain_data_y = np.zeros((remain_data.shape[0],), dtype=np.float32)
    elif label == 1:
        folder_data_y = np.ones((folder_data.shape[0],1), dtype=np.float32)
        remain_data_y = np.ones((remain_data.shape[0],1), dtype=np.float32)
    else:
        raise Exception("label should be 0 or 1, get:{}".format(label))
    return folder_data, folder_data_y, remain_data, remain_data_y


def getPercent(data_x, data_y, percent, seed):
    train_x, test_x, train_y, test_y = train_test_split(data_x, data_y, test_size=percent, random_state=seed)
    return train_x, test_x, train_y, test_y


def validate_split_indices(split_data, normal_count, abnormal_count):
    required_keys = [
        "normal_train",
        "normal_dev",
        "normal_test",
        "abnormal_train",
        "abnormal_dev",
        "abnormal_test",
    ]
    missing = [key for key in required_keys if key not in split_data]
    if missing:
        raise ValueError("Split file is missing keys: {}".format(", ".join(missing)))

    for key in ("normal_train", "normal_dev", "normal_test"):
        values = np.asarray(split_data[key], dtype=np.int64)
        if values.size and (values.min() < 0 or values.max() >= normal_count):
            raise ValueError("{} contains indices outside normal_samples.npy.".format(key))
    for key in ("abnormal_train", "abnormal_dev", "abnormal_test"):
        values = np.asarray(split_data[key], dtype=np.int64)
        if values.size and (values.min() < 0 or values.max() >= abnormal_count):
            raise ValueError("{} contains indices outside abnormal_samples.npy.".format(key))


class SPRSegLoader(object):
    def __init__(self, data_path, mode="train", split_file=None,
                 include_abnormal_train_in_thre=False):
        self.mode = mode

        N_samples = np.load(os.path.join(data_path, "normal_samples.npy"))  # NxLxC
        AN_samples = np.load(os.path.join(data_path, "abnormal_samples.npy"))

        split_data = None
        if split_file is not None:
            split_data = np.load(split_file, allow_pickle=False)
            validate_split_indices(split_data, N_samples.shape[0], AN_samples.shape[0])
            print("Using split file: {}".format(split_file), flush=True)
        else:
            rng = np.random.default_rng(seed=42)  # 可指定 seed 以便复现
            rng.shuffle(N_samples)  # 在第一个轴上原地打乱
            rng.shuffle(AN_samples)

        # # normalize all
        # for i in range(N_samples.shape[0]):
        #     for j in range(1):
        #         N_samples[i][j] = normalize(N_samples[i][j][:])
        #
        # for i in range(AN_samples.shape[0]):
        #     for j in range(1):
        #         AN_samples[i][j] = normalize(AN_samples[i][j][:])

        N_samples = N_samples / 100
        AN_samples = AN_samples / 100

        N_samples = N_samples.transpose(0, 2, 1)
        AN_samples = AN_samples.transpose(0, 2, 1)

        N_y = np.zeros((N_samples.shape[0],), dtype=np.float32)
        AN_y = np.ones((AN_samples.shape[0],), dtype=np.float32)

        if split_data is not None:
            train_N = N_samples[split_data["normal_train"]]
            dev_N = N_samples[split_data["normal_dev"]]
            test_N = N_samples[split_data["normal_test"]]
            train_AN = AN_samples[split_data["abnormal_train"]]
            dev_AN = AN_samples[split_data["abnormal_dev"]]
            test_AN = AN_samples[split_data["abnormal_test"]]
            train_N_y = N_y[split_data["normal_train"]]
            dev_N_y = N_y[split_data["normal_dev"]]
            test_N_y = N_y[split_data["normal_test"]]
            train_AN_y = AN_y[split_data["abnormal_train"]]
            dev_AN_y = AN_y[split_data["abnormal_dev"]]
            test_AN_y = AN_y[split_data["abnormal_test"]]
            if include_abnormal_train_in_thre:
                calib_AN = np.concatenate((train_AN, dev_AN))
                calib_AN_y = np.concatenate((train_AN_y, dev_AN_y))
                print(
                    "abnormal train indices are included in MARPP threshold calibration: {}".format(
                        len(split_data["abnormal_train"])),
                    flush=True,
                )
            else:
                calib_AN = dev_AN
                calib_AN_y = dev_AN_y
                print(
                    "abnormal train indices are reserved for supervised baselines and ignored by MARPP: {}".format(
                        len(split_data["abnormal_train"])),
                    flush=True,
                )
        else:
            train_N, dev_test_N, train_N_y, dev_test_N_y = getPercent(
                N_samples, N_y, 0.2, 0)
            dev_N, test_N, dev_N_y, test_N_y = getPercent(
                dev_test_N, dev_test_N_y, 0.5, 0)
            test_AN, dev_AN, test_AN_y, dev_AN_y = getPercent(
                AN_samples, AN_y, 0.5, 0)
            calib_AN = dev_AN
            calib_AN_y = dev_AN_y

        val_data = dev_N
        val_y = dev_N_y

        thre_data = np.concatenate((dev_N, calib_AN))
        thre_y = np.concatenate((dev_N_y, calib_AN_y))

        test_data = np.concatenate([test_N, test_AN])
        test_y = np.concatenate([test_N_y, test_AN_y])

        self.train, self.train_label = train_N, train_N_y
        self.val, self.val_label = val_data, val_y
        self.thre, self.thre_label = thre_data, thre_y
        self.test, self.test_label = test_data, test_y

        print("train data size:{}".format(train_N.shape), flush=True)
        print("val data size:{}".format(val_data.shape), flush=True)
        print("thre data size:{}".format(thre_data.shape), flush=True)
        print("test N data size:{}".format(test_data.shape), flush=True)

    def __len__(self):
        """
        Number of images in the object dataset.
        """
        if self.mode == "train":
            return self.train.shape[0]
        elif (self.mode == 'val'):
            return self.val.shape[0]
        elif (self.mode == 'test'):
            return self.test.shape[0]
        else:
            return self.thre.shape[0]

    def __getitem__(self, index):
        if self.mode == "train":
            return np.float32(self.train[index]), np.float32(self.train_label[index])
        elif (self.mode == 'val'):
            return np.float32(self.val[index]), np.float32(self.val_label[index])
        elif (self.mode == 'test'):
            return np.float32(self.test[index]), np.float32(self.test_label[index])
        else:
            return np.float32(self.thre[index]), np.float32(self.thre_label[index])


class SPRValidSegLoader(object):
    def __init__(self, data_path, mode="test"):
        self.mode = mode

        samples = np.load(os.path.join(data_path, "inference_samples.npy"))  # NxLxC

        samples = samples / 100

        samples = samples.transpose(0, 2, 1)

        self.samples = samples

        print("test data size:{}".format(self.samples.shape), flush=True)

    def __len__(self):
        """
        Number of images in the object dataset.
        """
        if (self.mode == 'test'):
            return self.samples.shape[0]
        else:
            return self.samples.shape[0]

    def __getitem__(self, index):
        if (self.mode == 'test'):
            return np.float32(self.samples[index])
        else:
            return np.float32(self.samples[index])
