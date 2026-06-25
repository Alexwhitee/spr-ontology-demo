# -*- coding: utf-8 -*-
# Author: Qinghua Liu <liu.11085@osu.edu>
# License: Apache-2.0 License

import torch
import random, argparse
from pathlib import Path
from sklearn.metrics import roc_auc_score
from Detectors.model_wrapper import *
from Detectors.HP_list import Optimal_Uni_algo_HP_dict
from Detectors.dataloader import SPRSegLoader
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


def scale_scores(scores, score_min, score_max):
    denominator = score_max - score_min
    if denominator == 0:
        return np.zeros_like(scores, dtype=np.float32)
    return (scores - score_min) / denominator


def select_threshold_by_target_recall(scores, labels, target_recall):
    if not 0 < target_recall <= 1:
        raise ValueError("--target_recall must be in the range (0, 1].")

    labels = np.asarray(labels).astype(int).ravel()
    scores = np.asarray(scores).ravel()
    if labels.sum() == 0:
        raise ValueError("Threshold calibration requires positive samples.")

    best_threshold = None
    best_precision = -1
    best_f_score = -1
    best_recall = -1

    for threshold in np.unique(scores):
        pred = (scores >= threshold).astype(int)
        precision, recall, f_score, _ = precision_recall_fscore_support(
            labels, pred, average='binary', zero_division=0)
        if recall < target_recall:
            continue
        if (precision > best_precision or
                (precision == best_precision and f_score > best_f_score) or
                (precision == best_precision and f_score == best_f_score and threshold > best_threshold)):
            best_threshold = threshold
            best_precision = precision
            best_f_score = f_score
            best_recall = recall

    if best_threshold is None:
        raise ValueError("No threshold satisfies --target_recall on the calibration set.")

    return best_threshold, best_precision, best_recall, best_f_score


def select_threshold_by_target_precision(scores, labels, target_precision):
    if not 0 < target_precision <= 1:
        raise ValueError("--target_precision must be in the range (0, 1].")

    labels = np.asarray(labels).astype(int).ravel()
    scores = np.asarray(scores).ravel()
    if labels.sum() == 0:
        raise ValueError("Threshold calibration requires positive samples.")

    best_threshold = None
    best_precision = -1
    best_f_score = -1
    best_recall = -1

    for threshold in np.unique(scores):
        pred = (scores >= threshold).astype(int)
        precision, recall, f_score, _ = precision_recall_fscore_support(
            labels, pred, average='binary', zero_division=0)
        if precision < target_precision:
            continue
        if (recall > best_recall or
                (recall == best_recall and f_score > best_f_score) or
                (recall == best_recall and f_score == best_f_score and precision > best_precision)):
            best_threshold = threshold
            best_precision = precision
            best_f_score = f_score
            best_recall = recall

    if best_threshold is None:
        raise ValueError("No threshold satisfies --target_precision on the calibration set.")

    return best_threshold, best_precision, best_recall, best_f_score


def evaluate_scores(labels, scores, threshold):
    pred = np.array((scores >= threshold).astype(int))
    gt = np.array(labels).astype(int).ravel()
    accuracy = accuracy_score(gt, pred)
    precision, recall, f_score, _ = precision_recall_fscore_support(
        gt, pred, average='binary', zero_division=0)
    auc = roc_auc_score(gt, scores)
    return accuracy, auc, precision, recall, f_score, pred


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


def append_save_suffix(save_folder, suffix):
    if not suffix:
        return save_folder
    safe_suffix = suffix.strip().strip("/\\")
    if not safe_suffix:
        return save_folder
    return str(Path(save_folder) / safe_suffix)


if __name__ == '__main__':
    default_AD_models = [
        'MARPP'
    ]


    parser = argparse.ArgumentParser(description='Running mTSB')
    parser.add_argument('--data_path', type=str, default='Datasets/SPR')
    parser.add_argument('--save', type=bool, default=False)
    parser.add_argument('--threshold', type=float, default=7)
    parser.add_argument('--target_recall', type=float, default=None,
                        help='Select threshold on the calibration set to reach this recall.')
    parser.add_argument('--target_precision', type=float, default=None,
                        help='Select threshold on the calibration set to reach this precision.')
    parser.add_argument('--score_mode', type=str, default=None,
                        choices=['mean_mse', 'topk_mean_mse'],
                        help='Anomaly score mode. Defaults to the model HP setting.')
    parser.add_argument('--topk_ratio', type=float, default=None,
                        help='Top-k ratio for topk_mean_mse score mode.')
    parser.add_argument('--split_file', type=str, default=None,
                        help='Optional shared split .npz file generated by create_shared_split.py.')
    parser.add_argument('--save_suffix', type=str, default=None,
                        help='Optional subfolder appended to the dataset-specific save folder.')
    parser.add_argument('--include_abnormal_train_in_calibration', action='store_true',
                        help='When using --split_file, include abnormal_train in MARPP threshold calibration.')

    args = parser.parse_args()
    if args.target_recall is not None and args.target_precision is not None:
        raise ValueError("Use only one of --target_recall and --target_precision.")

    spr_dataloader = SPRSegLoader(
        args.data_path,
        split_file=args.split_file,
        include_abnormal_train_in_thre=args.include_abnormal_train_in_calibration,
    )

    data_train = spr_dataloader.train
    data_val = spr_dataloader.val
    data_thre = spr_dataloader.thre
    data_thre_label = spr_dataloader.thre_label
    data_test = spr_dataloader.test
    data_test_label = spr_dataloader.test_label

    data_train = data_train.reshape(-1, data_train.shape[-1])
    data_val = data_val.reshape(-1, data_val.shape[-1])
    data_thre = data_thre.reshape(-1, data_thre.shape[-1])
    data_test = data_test.reshape(-1, data_test.shape[-1])

    for AD_Name in default_AD_models:
        Optimal_Det_HP = dict(Optimal_Uni_algo_HP_dict[AD_Name])
        Optimal_Det_HP['save_folder'] = get_dataset_save_folder(
            Optimal_Det_HP['save_folder'], args.data_path, AD_Name)
        Optimal_Det_HP['save_folder'] = append_save_suffix(
            Optimal_Det_HP['save_folder'], args.save_suffix)
        if args.score_mode is not None:
            Optimal_Det_HP['score_mode'] = args.score_mode
        if args.topk_ratio is not None:
            Optimal_Det_HP['topk_ratio'] = args.topk_ratio
        print("Save folder:", Optimal_Det_HP['save_folder'])
        print("Score mode:", Optimal_Det_HP.get('score_mode', 'mean_mse'))
        if Optimal_Det_HP.get('score_mode') == 'topk_mean_mse':
            print("Top-k ratio:", Optimal_Det_HP.get('topk_ratio'))

        if AD_Name in Semisupervise_AD_Pool:
            thre_output = run_Semisupervise_AD(AD_Name, [data_train, data_val], data_thre, **Optimal_Det_HP)
            test_output = run_Semisupervise_AD(AD_Name, [data_train, data_val], data_test, **Optimal_Det_HP)
        elif AD_Name in Unsupervise_AD_Pool:
            thre_output = run_Unsupervise_AD(AD_Name, data_thre, **Optimal_Det_HP)
            test_output = run_Unsupervise_AD(AD_Name, data_test, **Optimal_Det_HP)
        else:
            raise Exception(f"{AD_Name} is not defined")

        if isinstance(thre_output, np.ndarray) and isinstance(test_output, np.ndarray):
            score_min, score_max = thre_output.min(), thre_output.max()
            thre_output = scale_scores(thre_output, score_min, score_max)
            test_output = scale_scores(test_output, score_min, score_max)

            if args.target_recall is not None:
                thresh, calib_precision, calib_recall, calib_f_score = select_threshold_by_target_recall(
                    thre_output, data_thre_label, args.target_recall)
            elif args.target_precision is not None:
                thresh, calib_precision, calib_recall, calib_f_score = select_threshold_by_target_precision(
                    thre_output, data_thre_label, args.target_precision)
            else:
                thresh = np.percentile(thre_output, 100 - args.threshold)
                _, _, calib_precision, calib_recall, calib_f_score, _ = evaluate_scores(
                    data_thre_label, thre_output, thresh)

            save_valid_params(Optimal_Det_HP['save_folder'], score_min, score_max, thresh)
            print("AD method:", AD_Name)
            print("Threshold:", thresh)
            print(
                "Calibration Precision : {:0.4f}, Recall : {:0.4f}, F-score : {:0.4f} ".format(
                    calib_precision, calib_recall, calib_f_score))

            accuracy, auc, precision, recall, f_score, pred = evaluate_scores(
                data_test_label, test_output, thresh)
            print(
                "Accuracy: {:0.4f}, AUC : {:0.4f}, Precision : {:0.4f}, Recall : {:0.4f}, F-score : {:0.4f} ".format(accuracy, auc, precision,
                                                                                           recall, f_score))
        else:
            print(test_output)

        print()
