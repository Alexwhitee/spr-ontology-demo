#!/usr/bin/env python3
import argparse
import csv
import json
import random
from datetime import datetime
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score

from Detectors.HP_list import Optimal_Uni_algo_HP_dict
from Detectors.dataloader import SPRSegLoader
from Detectors.model_wrapper import (
    Semisupervise_AD_Pool,
    Unsupervise_AD_Pool,
    run_Semisupervise_AD,
    run_Unsupervise_AD,
)


SEED = 2024


def parse_float_list(raw):
    return [float(item.strip()) for item in raw.split(",") if item.strip()]


def set_seed(seed):
    torch.manual_seed(seed)
    torch.cuda.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    np.random.seed(seed)
    random.seed(seed)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True


def scale_scores(scores, score_min, score_max):
    denominator = score_max - score_min
    if denominator == 0:
        return np.zeros_like(scores, dtype=np.float32)
    return (scores - score_min) / denominator


def select_threshold_by_target_recall(scores, labels, target_recall):
    if not 0 < target_recall <= 1:
        raise ValueError("--target-recalls values must be in the range (0, 1].")

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
            labels, pred, average="binary", zero_division=0)
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
        raise ValueError("No threshold satisfies target recall on the calibration set.")

    return best_threshold, best_precision, best_recall, best_f_score


def select_threshold_by_target_precision(scores, labels, target_precision):
    if not 0 < target_precision <= 1:
        raise ValueError("--target-precisions values must be in the range (0, 1].")

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
            labels, pred, average="binary", zero_division=0)
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
        raise ValueError("No threshold satisfies target precision on the calibration set.")

    return best_threshold, best_precision, best_recall, best_f_score


def evaluate_scores(labels, scores, threshold):
    pred = (scores >= threshold).astype(int)
    labels = np.asarray(labels).astype(int).ravel()
    precision, recall, f_score, _ = precision_recall_fscore_support(
        labels, pred, average="binary", zero_division=0)
    return {
        "accuracy": accuracy_score(labels, pred),
        "auc": roc_auc_score(labels, scores),
        "precision": precision,
        "recall": recall,
        "f_score": f_score,
        "predicted_positive": int(pred.sum()),
        "true_positive": int(((pred == 1) & (labels == 1)).sum()),
        "false_positive": int(((pred == 1) & (labels == 0)).sum()),
        "false_negative": int(((pred == 0) & (labels == 1)).sum()),
    }


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


def score_dataset(ad_name, hp, data_train, data_val, data_thre, data_test):
    if ad_name in Semisupervise_AD_Pool:
        thre_output = run_Semisupervise_AD(ad_name, [data_train, data_val], data_thre, **hp)
        test_output = run_Semisupervise_AD(ad_name, [data_train, data_val], data_test, **hp)
    elif ad_name in Unsupervise_AD_Pool:
        thre_output = run_Unsupervise_AD(ad_name, data_thre, **hp)
        test_output = run_Unsupervise_AD(ad_name, data_test, **hp)
    else:
        raise ValueError("{} is not defined".format(ad_name))

    if not isinstance(thre_output, np.ndarray) or not isinstance(test_output, np.ndarray):
        raise RuntimeError("Model scoring failed: {}".format(test_output))
    return thre_output.ravel(), test_output.ravel()


def write_csv(path, rows):
    if not rows:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Sweep MARPP top-k score settings.")
    parser.add_argument("--data-path", type=str, default="sjtu_dataset_clean_all_both")
    parser.add_argument("--topk-ratios", type=str, default="0.15,0.2,0.25,0.3,0.4")
    parser.add_argument("--target-recalls", type=str, default="0.85,0.88,0.9")
    parser.add_argument("--target-precisions", type=str, default="")
    parser.add_argument("--output-dir", type=Path, default=Path("results"))
    parser.add_argument("--ad-name", type=str, default="MARPP")
    parser.add_argument("--min-test-recall", type=float, default=0.9)
    parser.add_argument("--min-test-precision", type=float, default=None)
    parser.add_argument("--include-mean", action="store_true")
    parser.add_argument("--seed", type=int, default=SEED)
    args = parser.parse_args()

    set_seed(args.seed)

    topk_ratios = parse_float_list(args.topk_ratios)
    target_recalls = parse_float_list(args.target_recalls)
    target_precisions = parse_float_list(args.target_precisions)

    loader = SPRSegLoader(args.data_path)
    data_train = loader.train.reshape(-1, loader.train.shape[-1])
    data_val = loader.val.reshape(-1, loader.val.shape[-1])
    data_thre = loader.thre.reshape(-1, loader.thre.shape[-1])
    data_test = loader.test.reshape(-1, loader.test.shape[-1])
    data_thre_label = np.asarray(loader.thre_label).astype(int).ravel()
    data_test_label = np.asarray(loader.test_label).astype(int).ravel()

    base_hp = dict(Optimal_Uni_algo_HP_dict[args.ad_name])
    base_hp["save_folder"] = get_dataset_save_folder(
        base_hp["save_folder"], args.data_path, args.ad_name)

    settings = []
    if args.include_mean:
        settings.append(("mean_mse", None))
    settings.extend(("topk_mean_mse", ratio) for ratio in topk_ratios)

    rows = []
    for score_mode, topk_ratio in settings:
        hp = dict(base_hp)
        hp["score_mode"] = score_mode
        if topk_ratio is not None:
            hp["topk_ratio"] = topk_ratio

        print("Scoring {} topk_ratio={} ...".format(score_mode, topk_ratio))
        thre_raw, test_raw = score_dataset(
            args.ad_name, hp, data_train, data_val, data_thre, data_test)

        score_min, score_max = float(thre_raw.min()), float(thre_raw.max())
        thre_scores = scale_scores(thre_raw, score_min, score_max)
        test_scores = scale_scores(test_raw, score_min, score_max)

        for target_recall in target_recalls:
            threshold, calib_precision, calib_recall, calib_f_score = select_threshold_by_target_recall(
                thre_scores, data_thre_label, target_recall)
            test_metrics = evaluate_scores(data_test_label, test_scores, threshold)
            row = {
                "score_mode": score_mode,
                "topk_ratio": "" if topk_ratio is None else topk_ratio,
                "selection_mode": "target_recall",
                "target_recall": target_recall,
                "target_precision": "",
                "threshold": float(threshold),
                "score_min": score_min,
                "score_max": score_max,
                "calibration_precision": float(calib_precision),
                "calibration_recall": float(calib_recall),
                "calibration_f_score": float(calib_f_score),
                "test_accuracy": float(test_metrics["accuracy"]),
                "test_auc": float(test_metrics["auc"]),
                "test_precision": float(test_metrics["precision"]),
                "test_recall": float(test_metrics["recall"]),
                "test_f_score": float(test_metrics["f_score"]),
                "test_predicted_positive": test_metrics["predicted_positive"],
                "test_true_positive": test_metrics["true_positive"],
                "test_false_positive": test_metrics["false_positive"],
                "test_false_negative": test_metrics["false_negative"],
            }
            rows.append(row)
            print(
                "  target_recall={:.3f} precision={:.4f} recall={:.4f} f1={:.4f} fp={}".format(
                    target_recall,
                    row["test_precision"],
                    row["test_recall"],
                    row["test_f_score"],
                    row["test_false_positive"],
                )
            )

        for target_precision in target_precisions:
            threshold, calib_precision, calib_recall, calib_f_score = select_threshold_by_target_precision(
                thre_scores, data_thre_label, target_precision)
            test_metrics = evaluate_scores(data_test_label, test_scores, threshold)
            row = {
                "score_mode": score_mode,
                "topk_ratio": "" if topk_ratio is None else topk_ratio,
                "selection_mode": "target_precision",
                "target_recall": "",
                "target_precision": target_precision,
                "threshold": float(threshold),
                "score_min": score_min,
                "score_max": score_max,
                "calibration_precision": float(calib_precision),
                "calibration_recall": float(calib_recall),
                "calibration_f_score": float(calib_f_score),
                "test_accuracy": float(test_metrics["accuracy"]),
                "test_auc": float(test_metrics["auc"]),
                "test_precision": float(test_metrics["precision"]),
                "test_recall": float(test_metrics["recall"]),
                "test_f_score": float(test_metrics["f_score"]),
                "test_predicted_positive": test_metrics["predicted_positive"],
                "test_true_positive": test_metrics["true_positive"],
                "test_false_positive": test_metrics["false_positive"],
                "test_false_negative": test_metrics["false_negative"],
            }
            rows.append(row)
            print(
                "  target_precision={:.3f} precision={:.4f} recall={:.4f} f1={:.4f} fp={}".format(
                    target_precision,
                    row["test_precision"],
                    row["test_recall"],
                    row["test_f_score"],
                    row["test_false_positive"],
                )
            )

    dataset_name = Path(args.data_path).resolve().name
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_stem = "{}_{}_score_sweep".format(dataset_name, timestamp)
    csv_path = args.output_dir / "{}.csv".format(output_stem)
    json_path = args.output_dir / "{}.json".format(output_stem)

    best_candidates = [row for row in rows if row["test_recall"] >= args.min_test_recall]
    best_row = None
    if best_candidates:
        best_row = max(best_candidates, key=lambda row: (row["test_precision"], row["test_f_score"]))
    best_precision_row = None
    if args.min_test_precision is not None:
        best_precision_candidates = [
            row for row in rows if row["test_precision"] >= args.min_test_precision
        ]
        if best_precision_candidates:
            best_precision_row = max(
                best_precision_candidates,
                key=lambda row: (row["test_recall"], row["test_f_score"]),
            )

    write_csv(csv_path, rows)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(
            {
                "data_path": args.data_path,
                "save_folder": base_hp["save_folder"],
                "topk_ratios": topk_ratios,
                "target_recalls": target_recalls,
                "target_precisions": target_precisions,
                "min_test_recall": args.min_test_recall,
                "min_test_precision": args.min_test_precision,
                "best_row": best_row,
                "best_precision_row": best_precision_row,
                "rows": rows,
            },
            handle,
            ensure_ascii=False,
            indent=2,
        )

    print("Saved CSV:", csv_path)
    print("Saved JSON:", json_path)
    if best_row is not None:
        print("Best row with test_recall >= {:.3f}:".format(args.min_test_recall))
        print(json.dumps(best_row, ensure_ascii=False, indent=2))
    if best_precision_row is not None:
        print("Best row with test_precision >= {:.3f}:".format(args.min_test_precision))
        print(json.dumps(best_precision_row, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
