#!/usr/bin/env python3
"""Abnormal-only CNN baseline for anomaly type identification."""

from __future__ import annotations

import argparse
import json
import os
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import torch
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    precision_recall_fscore_support,
)
from torch import nn
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler

try:
    from tqdm import tqdm
except ImportError:  # pragma: no cover
    tqdm = None


SEED = 2024


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


def parse_ratio(raw: str, name: str) -> Tuple[float, float, float]:
    values = [float(item.strip()) for item in raw.split(",") if item.strip()]
    if len(values) != 3:
        raise ValueError(f"{name} must contain three comma-separated values.")
    if any(value < 0 for value in values) or sum(values) <= 0:
        raise ValueError(f"{name} values must be non-negative and not all zero.")
    return values[0], values[1], values[2]


def split_indices(sample_count: int, ratios: Tuple[float, float, float], seed: int):
    rng = np.random.default_rng(seed)
    indices = rng.permutation(sample_count).astype(np.int64)
    ratios_arr = np.asarray(ratios, dtype=np.float64)
    ratios_arr = ratios_arr / ratios_arr.sum()
    train_end = int(round(sample_count * ratios_arr[0]))
    dev_end = train_end + int(round(sample_count * ratios_arr[1]))
    return indices[:train_end], indices[train_end:dev_end], indices[dev_end:]


def normalize_shape(samples: np.ndarray) -> np.ndarray:
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


def load_label_names(data_path: Path, label_mode: str) -> List[str]:
    names_path = data_path / "abnormal_label_names.json"
    if not names_path.exists():
        raise FileNotFoundError(
            f"Missing {names_path}. Rebuild the dataset with build_spr_dataset.py first."
        )
    with names_path.open("r", encoding="utf-8") as handle:
        names = json.load(handle)
    key = {
        "anomaly_type": "anomaly_type_names",
        "vehicle_type": "vehicle_type_names",
    }[label_mode]
    return names[key]


def load_labels(data_path: Path, label_mode: str) -> np.ndarray:
    filename = {
        "anomaly_type": "abnormal_type_labels.npy",
        "vehicle_type": "abnormal_vehicle_type_labels.npy",
    }[label_mode]
    path = data_path / filename
    if not path.exists():
        raise FileNotFoundError(
            f"Missing {path}. Rebuild the dataset with build_spr_dataset.py first."
        )
    return np.load(path).astype(np.int64)


def make_split(data_path: Path, split_file: Path | None, ratios: Tuple[float, float, float], seed: int):
    abnormal = normalize_shape(np.load(data_path / "abnormal_samples.npy"))
    if split_file is not None:
        split_data = np.load(split_file, allow_pickle=False)
        train_idx = np.asarray(split_data["abnormal_train"], dtype=np.int64)
        dev_idx = np.asarray(split_data["abnormal_dev"], dtype=np.int64)
        test_idx = np.asarray(split_data["abnormal_test"], dtype=np.int64)
    else:
        train_idx, dev_idx, test_idx = split_indices(abnormal.shape[0], ratios, seed)
    return abnormal, train_idx, dev_idx, test_idx


class CurveDataset(Dataset):
    def __init__(self, x: np.ndarray, y: np.ndarray):
        self.x = torch.from_numpy(x).float()
        self.y = torch.from_numpy(y).long()

    def __len__(self) -> int:
        return self.x.shape[0]

    def __getitem__(self, index: int):
        return self.x[index], self.y[index]


class TypeCNN1D(nn.Module):
    def __init__(self, num_classes: int, dropout: float = 0.2):
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
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))


def build_train_loader(dataset: CurveDataset, labels: np.ndarray, batch_size: int, balanced_sampler: bool):
    if not balanced_sampler:
        return DataLoader(dataset, batch_size=batch_size, shuffle=True)
    class_counts = np.bincount(labels)
    if np.any(class_counts == 0):
        raise ValueError("Balanced sampler requires every class to appear in train labels.")
    class_weights = 1.0 / class_counts
    sample_weights = class_weights[labels]
    sampler = WeightedRandomSampler(
        weights=torch.as_tensor(sample_weights, dtype=torch.double),
        num_samples=len(sample_weights),
        replacement=True,
    )
    return DataLoader(dataset, batch_size=batch_size, sampler=sampler)


def predict(model: nn.Module, loader: DataLoader, device: torch.device):
    model.eval()
    logits_list = []
    labels_list = []
    losses = []
    criterion = nn.CrossEntropyLoss()
    with torch.no_grad():
        for x, y in loader:
            x = x.to(device)
            y = y.to(device)
            logits = model(x)
            losses.append(criterion(logits, y).item())
            logits_list.append(logits.detach().cpu().numpy())
            labels_list.append(y.detach().cpu().numpy())
    logits = np.concatenate(logits_list, axis=0)
    labels = np.concatenate(labels_list, axis=0)
    pred = logits.argmax(axis=1)
    return pred, labels, float(np.mean(losses))


def evaluate(labels: np.ndarray, pred: np.ndarray, class_names: List[str]) -> Dict[str, object]:
    labels_all = list(range(len(class_names)))
    precision, recall, f1, support = precision_recall_fscore_support(
        labels,
        pred,
        labels=labels_all,
        zero_division=0,
    )
    macro = precision_recall_fscore_support(
        labels, pred, average="macro", zero_division=0)
    weighted = precision_recall_fscore_support(
        labels, pred, average="weighted", zero_division=0)
    return {
        "accuracy": float(accuracy_score(labels, pred)),
        "balanced_accuracy": float(balanced_accuracy_score(labels, pred)),
        "macro_precision": float(macro[0]),
        "macro_recall": float(macro[1]),
        "macro_f1": float(macro[2]),
        "weighted_precision": float(weighted[0]),
        "weighted_recall": float(weighted[1]),
        "weighted_f1": float(weighted[2]),
        "confusion_matrix": confusion_matrix(labels, pred, labels=labels_all).tolist(),
        "per_class": {
            class_names[idx]: {
                "precision": float(precision[idx]),
                "recall": float(recall[idx]),
                "f1": float(f1[idx]),
                "support": int(support[idx]),
            }
            for idx in labels_all
        },
    }


def train(args: argparse.Namespace) -> Dict[str, object]:
    set_seed(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    if device.type == "cuda":
        print("----- Using CUDA GPU: {} -----".format(torch.cuda.get_device_name(0)))
    else:
        print("----- Using CPU -----")

    data_path = Path(args.data_path)
    class_names = load_label_names(data_path, args.label_mode)
    labels = load_labels(data_path, args.label_mode)
    abnormal, train_idx, dev_idx, test_idx = make_split(
        data_path,
        Path(args.split_file) if args.split_file is not None else None,
        parse_ratio(args.abnormal_split, "--abnormal-split"),
        args.seed,
    )
    if labels.shape[0] != abnormal.shape[0]:
        raise ValueError("Label count does not match abnormal sample count.")

    train_x, train_y = abnormal[train_idx], labels[train_idx]
    dev_x, dev_y = abnormal[dev_idx], labels[dev_idx]
    test_x, test_y = abnormal[test_idx], labels[test_idx]
    print("Split counts:", {
        "train": int(train_x.shape[0]),
        "dev": int(dev_x.shape[0]),
        "test": int(test_x.shape[0]),
    }, flush=True)
    print("Class names:", class_names, flush=True)

    train_dataset = CurveDataset(train_x, train_y)
    dev_dataset = CurveDataset(dev_x, dev_y)
    test_dataset = CurveDataset(test_x, test_y)
    train_loader = build_train_loader(
        train_dataset, train_y, args.batch_size, args.balanced_sampler)
    dev_loader = DataLoader(dev_dataset, batch_size=args.batch_size, shuffle=False)
    test_loader = DataLoader(test_dataset, batch_size=args.batch_size, shuffle=False)

    model = TypeCNN1D(num_classes=len(class_names), dropout=args.dropout).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    criterion = nn.CrossEntropyLoss()
    best_dev_loss = float("inf")
    best_state = None

    epoch_iter = range(args.epochs)
    if tqdm is not None:
        epoch_iter = tqdm(epoch_iter, desc="Training abnormal type CNN", unit="epoch", leave=False)
    for epoch in epoch_iter:
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
        _, _, dev_loss = predict(model, dev_loader, device)
        if tqdm is not None:
            epoch_iter.set_postfix(
                train_loss=f"{float(np.mean(train_losses)):.6f}",
                dev_loss=f"{dev_loss:.6f}",
            )
        if dev_loss <= best_dev_loss:
            best_dev_loss = dev_loss
            best_state = {key: value.detach().cpu().clone() for key, value in model.state_dict().items()}
            message = f"Saved checkpoint at epoch {epoch} with dev loss {dev_loss:.6f}"
            tqdm.write(message) if tqdm is not None else print(message)

    if best_state is None:
        raise RuntimeError("Training did not produce a checkpoint.")
    model.load_state_dict(best_state)
    dev_pred, dev_labels, dev_loss = predict(model, dev_loader, device)
    test_pred, test_labels, test_loss = predict(model, test_loader, device)
    dev_metrics = evaluate(dev_labels, dev_pred, class_names)
    test_metrics = evaluate(test_labels, test_pred, class_names)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    dataset_name = data_path.resolve().name
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = f"{dataset_name}_{timestamp}_abnormal_type_cnn"
    model_path = output_dir / f"{stem}.pt"
    result_path = output_dir / f"{stem}.json"
    torch.save(best_state, model_path)
    result = {
        "data_path": str(data_path),
        "split_file": args.split_file,
        "label_mode": args.label_mode,
        "class_names": class_names,
        "model_path": str(model_path),
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
        "Test accuracy={accuracy:.4f}, balanced_accuracy={balanced_accuracy:.4f}, "
        "macro_f1={macro_f1:.4f}, weighted_f1={weighted_f1:.4f}".format(**test_metrics)
    )
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train an abnormal-only anomaly type CNN.")
    parser.add_argument("--data-path", type=str, default="sjtu_dataset_clean_all_both")
    parser.add_argument("--split-file", type=str, default=None)
    parser.add_argument("--label-mode", choices=["anomaly_type", "vehicle_type"], default="anomaly_type")
    parser.add_argument("--abnormal-split", type=str, default="0.5,0.25,0.25")
    parser.add_argument("--output-dir", type=str, default="results")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--dropout", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument("--balanced-sampler", action="store_true", default=True)
    parser.add_argument("--no-balanced-sampler", dest="balanced_sampler", action="store_false")
    return parser.parse_args()


def main() -> None:
    train(parse_args())


if __name__ == "__main__":
    main()
