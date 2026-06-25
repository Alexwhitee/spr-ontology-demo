#!/usr/bin/env python3
"""Lightweight 1D CNN classification baseline for SPR anomaly detection.

This script is intentionally independent from the MARPP training path. It reads
the same `normal_samples.npy` / `abnormal_samples.npy` dataset files, trains a
small supervised classifier, selects a decision threshold on the dev split, and
reports final test metrics.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score,
    precision_recall_fscore_support,
    roc_auc_score,
)
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover - tqdm is available in the project env
    tqdm = None


SEED = 2024


def parse_ratio(raw: str, name: str) -> Tuple[float, float, float]:
    values = [float(item.strip()) for item in raw.split(",") if item.strip()]
    if len(values) != 3:
        raise ValueError(f"{name} must contain three comma-separated values.")
    if any(value < 0 for value in values) or sum(values) <= 0:
        raise ValueError(f"{name} values must be non-negative and not all zero.")
    return values[0], values[1], values[2]


def set_seed(seed: int) -> None:
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True
    torch.use_deterministic_algorithms(True)


def get_device() -> torch.device:
    if torch.cuda.is_available():
        print("----- Using CUDA GPU: {} -----".format(torch.cuda.get_device_name(0)))
        return torch.device("cuda")
    print("----- Using CPU -----")
    return torch.device("cpu")


def normalize_shape(samples: np.ndarray) -> np.ndarray:
    """Return samples as N x 1 x 256 float32 arrays."""
    samples = np.asarray(samples, dtype=np.float32)
    if samples.ndim != 3:
        raise ValueError(f"Expected 3D samples, got shape {samples.shape}.")
    if samples.shape[1] == 1:
        out = samples
    elif samples.shape[2] == 1:
        out = samples.transpose(0, 2, 1)
    else:
        raise ValueError(f"Expected channel dimension of size 1, got shape {samples.shape}.")
    return out / 100.0


def split_by_ratio(
    samples: np.ndarray,
    ratios: Tuple[float, float, float],
    rng: np.random.Generator,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    indices = rng.permutation(samples.shape[0])
    ratios_arr = np.asarray(ratios, dtype=np.float64)
    ratios_arr = ratios_arr / ratios_arr.sum()
    train_end = int(round(samples.shape[0] * ratios_arr[0]))
    dev_end = train_end + int(round(samples.shape[0] * ratios_arr[1]))
    train_idx = indices[:train_end]
    dev_idx = indices[train_end:dev_end]
    test_idx = indices[dev_end:]
    return samples[train_idx], samples[dev_idx], samples[test_idx]


def validate_split_indices(split_data, normal_count: int, abnormal_count: int) -> None:
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


def make_split(
    data_path: Path,
    normal_split: Tuple[float, float, float],
    abnormal_split: Tuple[float, float, float],
    seed: int,
    split_file: Path | None = None,
) -> Dict[str, np.ndarray]:
    normal = normalize_shape(np.load(data_path / "normal_samples.npy"))
    abnormal = normalize_shape(np.load(data_path / "abnormal_samples.npy"))

    if split_file is not None:
        split_data = np.load(split_file, allow_pickle=False)
        validate_split_indices(split_data, normal.shape[0], abnormal.shape[0])
        print("Using split file:", split_file, flush=True)
        train_n = normal[split_data["normal_train"]]
        dev_n = normal[split_data["normal_dev"]]
        test_n = normal[split_data["normal_test"]]
        train_a = abnormal[split_data["abnormal_train"]]
        dev_a = abnormal[split_data["abnormal_dev"]]
        test_a = abnormal[split_data["abnormal_test"]]
    else:
        rng = np.random.default_rng(seed)
        train_n, dev_n, test_n = split_by_ratio(normal, normal_split, rng)
        train_a, dev_a, test_a = split_by_ratio(abnormal, abnormal_split, rng)

    train_x = np.concatenate([train_n, train_a], axis=0)
    train_y = np.concatenate([
        np.zeros(train_n.shape[0], dtype=np.float32),
        np.ones(train_a.shape[0], dtype=np.float32),
    ])
    dev_x = np.concatenate([dev_n, dev_a], axis=0)
    dev_y = np.concatenate([
        np.zeros(dev_n.shape[0], dtype=np.float32),
        np.ones(dev_a.shape[0], dtype=np.float32),
    ])
    test_x = np.concatenate([test_n, test_a], axis=0)
    test_y = np.concatenate([
        np.zeros(test_n.shape[0], dtype=np.float32),
        np.ones(test_a.shape[0], dtype=np.float32),
    ])

    return {
        "train_x": train_x,
        "train_y": train_y,
        "dev_x": dev_x,
        "dev_y": dev_y,
        "test_x": test_x,
        "test_y": test_y,
        "counts": {
            "train_normal": int(train_n.shape[0]),
            "train_abnormal": int(train_a.shape[0]),
            "dev_normal": int(dev_n.shape[0]),
            "dev_abnormal": int(dev_a.shape[0]),
            "test_normal": int(test_n.shape[0]),
            "test_abnormal": int(test_a.shape[0]),
        },
    }


class CurveDataset(Dataset):
    def __init__(self, x: np.ndarray, y: np.ndarray):
        self.x = torch.from_numpy(x).float()
        self.y = torch.from_numpy(y).float()

    def __len__(self) -> int:
        return self.x.shape[0]

    def __getitem__(self, index: int) -> Tuple[torch.Tensor, torch.Tensor]:
        return self.x[index], self.y[index]


class LightCNN1D(nn.Module):
    def __init__(self, dropout: float = 0.2):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv1d(1, 32, kernel_size=7, padding=3),
            nn.BatchNorm1d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(2),
            nn.Conv1d(32, 64, kernel_size=5, padding=2),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(2),
            nn.Conv1d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm1d(128),
            nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool1d(1),
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(dropout),
            nn.Linear(128, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x)).squeeze(1)


def build_train_loader(
    dataset: CurveDataset,
    labels: np.ndarray,
    batch_size: int,
    balanced_sampler: bool,
) -> DataLoader:
    if not balanced_sampler:
        return DataLoader(dataset, batch_size=batch_size, shuffle=True)

    labels_int = labels.astype(int)
    class_counts = np.bincount(labels_int, minlength=2)
    if np.any(class_counts == 0):
        raise ValueError("Balanced sampler requires both normal and abnormal training samples.")
    class_weights = 1.0 / class_counts
    sample_weights = class_weights[labels_int]
    sampler = WeightedRandomSampler(
        weights=torch.as_tensor(sample_weights, dtype=torch.double),
        num_samples=len(sample_weights),
        replacement=True,
    )
    return DataLoader(dataset, batch_size=batch_size, sampler=sampler)


def predict_scores(
    model: nn.Module,
    loader: DataLoader,
    device: torch.device,
) -> Tuple[np.ndarray, np.ndarray, float]:
    model.eval()
    scores: List[np.ndarray] = []
    labels: List[np.ndarray] = []
    losses: List[float] = []
    criterion = nn.BCEWithLogitsLoss()
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            y = y.to(device)
            logits = model(x)
            loss = criterion(logits, y)
            probs = torch.sigmoid(logits)
            scores.append(probs.detach().cpu().numpy())
            labels.append(y.detach().cpu().numpy())
            losses.append(loss.item())
    return np.concatenate(scores), np.concatenate(labels), float(np.mean(losses))


def evaluate(labels: np.ndarray, scores: np.ndarray, threshold: float) -> Dict[str, float]:
    pred = (scores >= threshold).astype(int)
    labels = labels.astype(int)
    precision, recall, f_score, _ = precision_recall_fscore_support(
        labels, pred, average="binary", zero_division=0)
    return {
        "accuracy": float(accuracy_score(labels, pred)),
        "auc": float(roc_auc_score(labels, scores)),
        "precision": float(precision),
        "recall": float(recall),
        "f_score": float(f_score),
        "predicted_positive": int(pred.sum()),
        "true_positive": int(((pred == 1) & (labels == 1)).sum()),
        "false_positive": int(((pred == 1) & (labels == 0)).sum()),
        "false_negative": int(((pred == 0) & (labels == 1)).sum()),
    }


def select_threshold(
    labels: np.ndarray,
    scores: np.ndarray,
    mode: str,
    target_recall: float | None,
    target_precision: float | None,
) -> Tuple[float, Dict[str, float]]:
    labels = labels.astype(int)
    unique_thresholds = np.unique(scores)
    best_threshold = 0.5
    best_metrics = evaluate(labels, scores, best_threshold)

    if mode == "fixed":
        return best_threshold, best_metrics

    candidates: Iterable[Tuple[float, Dict[str, float]]] = (
        (float(threshold), evaluate(labels, scores, float(threshold)))
        for threshold in unique_thresholds
    )

    if mode == "best_f1":
        best_threshold, best_metrics = max(
            candidates,
            key=lambda item: (item[1]["f_score"], item[1]["precision"], item[1]["recall"]),
        )
    elif mode == "target_recall":
        if target_recall is None:
            raise ValueError("--target-recall is required when --threshold-mode target_recall.")
        valid = [item for item in candidates if item[1]["recall"] >= target_recall]
        if not valid:
            raise ValueError("No dev threshold satisfies target recall.")
        best_threshold, best_metrics = max(
            valid,
            key=lambda item: (item[1]["precision"], item[1]["f_score"], item[0]),
        )
    elif mode == "target_precision":
        if target_precision is None:
            raise ValueError("--target-precision is required when --threshold-mode target_precision.")
        valid = [item for item in candidates if item[1]["precision"] >= target_precision]
        if not valid:
            raise ValueError("No dev threshold satisfies target precision.")
        best_threshold, best_metrics = max(
            valid,
            key=lambda item: (item[1]["recall"], item[1]["f_score"], item[1]["precision"]),
        )
    else:
        raise ValueError(f"Unsupported threshold mode: {mode}")

    return best_threshold, best_metrics


def train(args: argparse.Namespace) -> Dict[str, object]:
    set_seed(args.seed)
    device = get_device()
    data_path = Path(args.data_path)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    split = make_split(
        data_path=data_path,
        normal_split=parse_ratio(args.normal_split, "--normal-split"),
        abnormal_split=parse_ratio(args.abnormal_split, "--abnormal-split"),
        seed=args.seed,
        split_file=Path(args.split_file) if args.split_file is not None else None,
    )
    print("Split counts:", split["counts"], flush=True)

    train_dataset = CurveDataset(split["train_x"], split["train_y"])
    dev_dataset = CurveDataset(split["dev_x"], split["dev_y"])
    test_dataset = CurveDataset(split["test_x"], split["test_y"])

    train_loader = build_train_loader(
        train_dataset,
        split["train_y"],
        batch_size=args.batch_size,
        balanced_sampler=args.balanced_sampler,
    )
    dev_loader = DataLoader(dev_dataset, batch_size=args.batch_size, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=args.batch_size, shuffle=False)

    model = LightCNN1D(dropout=args.dropout).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    criterion = nn.BCEWithLogitsLoss()

    best_dev_loss = float("inf")
    best_state = None
    epoch_range = range(args.epochs)
    if tqdm is not None:
        epoch_range = tqdm(epoch_range, desc="Training CNN baseline", unit="epoch", leave=False)

    for epoch in epoch_range:
        model.train()
        train_losses = []
        for x, y in train_loader:
            x = x.to(device)
            y = y.to(device)
            logits = model(x)
            loss = criterion(logits, y)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            train_losses.append(loss.item())

        _, _, dev_loss = predict_scores(model, dev_loader, device)
        train_loss = float(np.mean(train_losses))
        if tqdm is not None:
            epoch_range.set_postfix(train_loss=f"{train_loss:.6f}", dev_loss=f"{dev_loss:.6f}")
        if dev_loss <= best_dev_loss:
            best_dev_loss = dev_loss
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            if tqdm is not None:
                tqdm.write(f"Saved checkpoint at epoch {epoch} with dev loss {dev_loss:.6f}")
            else:
                print(f"Saved checkpoint at epoch {epoch} with dev loss {dev_loss:.6f}")

    if best_state is None:
        raise RuntimeError("Training did not produce a checkpoint.")
    model.load_state_dict(best_state)

    dev_scores, dev_labels, dev_loss = predict_scores(model, dev_loader, device)
    test_scores, test_labels, test_loss = predict_scores(model, test_loader, device)
    threshold, dev_metrics = select_threshold(
        dev_labels,
        dev_scores,
        args.threshold_mode,
        args.target_recall,
        args.target_precision,
    )
    test_metrics = evaluate(test_labels, test_scores, threshold)

    dataset_name = data_path.resolve().name
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    model_path = output_dir / f"{dataset_name}_{timestamp}_cnn_baseline.pt"
    result_path = output_dir / f"{dataset_name}_{timestamp}_cnn_baseline.json"
    torch.save(best_state, model_path)

    result = {
        "data_path": str(data_path),
        "model_path": str(model_path),
        "split_counts": split["counts"],
        "normal_split": args.normal_split,
        "abnormal_split": args.abnormal_split,
        "split_file": args.split_file,
        "threshold_mode": args.threshold_mode,
        "target_recall": args.target_recall,
        "target_precision": args.target_precision,
        "threshold": float(threshold),
        "best_dev_loss": float(best_dev_loss),
        "dev_loss": float(dev_loss),
        "test_loss": float(test_loss),
        "dev_metrics": dev_metrics,
        "test_metrics": test_metrics,
        "args": vars(args),
    }
    with result_path.open("w", encoding="utf-8") as handle:
        json.dump(result, handle, ensure_ascii=False, indent=2)

    print("Saved model:", model_path)
    print("Saved result:", result_path)
    print(
        "Dev  Precision: {precision:.4f}, Recall: {recall:.4f}, F1: {f_score:.4f}, AUC: {auc:.4f}".format(
            **dev_metrics
        )
    )
    print(
        "Test Precision: {precision:.4f}, Recall: {recall:.4f}, F1: {f_score:.4f}, AUC: {auc:.4f}".format(
            **test_metrics
        )
    )
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a lightweight 1D CNN classifier baseline.")
    parser.add_argument("--data-path", type=str, default="sjtu_dataset_clean_all_both")
    parser.add_argument("--output-dir", type=str, default="results")
    parser.add_argument("--normal-split", type=str, default="8,1,1")
    parser.add_argument("--abnormal-split", type=str, default="0.5,0.5,1")
    parser.add_argument("--split-file", type=str, default=None)
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--dropout", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--balanced-sampler", action="store_true", default=True)
    parser.add_argument("--no-balanced-sampler", dest="balanced_sampler", action="store_false")
    parser.add_argument(
        "--threshold-mode",
        type=str,
        default="best_f1",
        choices=["best_f1", "target_recall", "target_precision", "fixed"],
    )
    parser.add_argument("--target-recall", type=float, default=None)
    parser.add_argument("--target-precision", type=float, default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train(args)


if __name__ == "__main__":
    main()
