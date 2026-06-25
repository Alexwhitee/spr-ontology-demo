#!/usr/bin/env python3
"""Create a reusable train/dev/test split for MARPP and CNN experiments."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
from sklearn.model_selection import train_test_split


def parse_ratio(raw: str, name: str) -> Tuple[float, float, float]:
    values = [float(item.strip()) for item in raw.split(",") if item.strip()]
    if len(values) != 3:
        raise ValueError(f"{name} must contain three comma-separated values.")
    if any(value < 0 for value in values) or sum(values) <= 0:
        raise ValueError(f"{name} values must be non-negative and not all zero.")
    return values[0], values[1], values[2]


def load_label_names(data_path: Path) -> Dict[str, list]:
    names_path = data_path / "abnormal_label_names.json"
    if not names_path.exists():
        return {}
    with names_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def label_distribution(labels: Optional[np.ndarray], indices: np.ndarray, names: list) -> Dict[str, int]:
    if labels is None:
        return {}
    counts: Dict[str, int] = {}
    for label in labels[indices]:
        label_id = int(label)
        name = names[label_id] if label_id < len(names) else str(label_id)
        counts[name] = counts.get(name, 0) + 1
    return dict(sorted(counts.items()))


def load_optional_labels(data_path: Path, filename: str) -> Optional[np.ndarray]:
    path = data_path / filename
    if not path.exists():
        return None
    return np.load(path)


def split_indices(
    sample_count: int,
    ratios: Tuple[float, float, float],
    rng: np.random.Generator,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    indices = rng.permutation(sample_count).astype(np.int64)
    ratios_arr = np.asarray(ratios, dtype=np.float64)
    ratios_arr = ratios_arr / ratios_arr.sum()
    train_end = int(round(sample_count * ratios_arr[0]))
    dev_end = train_end + int(round(sample_count * ratios_arr[1]))
    return indices[:train_end], indices[train_end:dev_end], indices[dev_end:]


def split_legacy_marpp_normal_shuffled(
    shuffled: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Replicate the current MARPP dataloader normal split.

    The dataloader first shuffles samples with numpy default_rng(seed=42), then
    uses sklearn train_test_split(random_state=0) twice:
      normal train/dev/test = 80% / 10% / 10%.
    """
    train, dev_test = train_test_split(shuffled, test_size=0.2, random_state=0)
    dev, test = train_test_split(dev_test, test_size=0.5, random_state=0)
    return train.astype(np.int64), dev.astype(np.int64), test.astype(np.int64)


def split_legacy_marpp_abnormal_shuffled(
    shuffled: np.ndarray,
    calibration_train_ratio: float,
    seed: int,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Replicate MARPP abnormal dev/test, then split old dev for CNN train/dev."""
    if not 0 <= calibration_train_ratio <= 1:
        raise ValueError("--legacy-abnormal-calibration-train-ratio must be in [0, 1].")
    old_test, old_dev = train_test_split(shuffled, test_size=0.5, random_state=0)

    if calibration_train_ratio == 0:
        train = np.empty((0,), dtype=np.int64)
        dev = old_dev.astype(np.int64)
    elif calibration_train_ratio == 1:
        train = old_dev.astype(np.int64)
        dev = np.empty((0,), dtype=np.int64)
    else:
        train, dev = train_test_split(
            old_dev,
            train_size=calibration_train_ratio,
            random_state=seed,
        )
        train = train.astype(np.int64)
        dev = dev.astype(np.int64)
    return train, dev, old_test.astype(np.int64)


def legacy_marpp_indices(
    normal_count: int,
    abnormal_count: int,
    calibration_train_ratio: float,
    seed: int,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Replicate the old dataloader's shared RNG shuffle order exactly."""
    rng = np.random.default_rng(seed=42)
    normal_shuffled = np.arange(normal_count, dtype=np.int64)
    abnormal_shuffled = np.arange(abnormal_count, dtype=np.int64)
    rng.shuffle(normal_shuffled)
    rng.shuffle(abnormal_shuffled)

    normal_train, normal_dev, normal_test = split_legacy_marpp_normal_shuffled(
        normal_shuffled)
    abnormal_train, abnormal_dev, abnormal_test = split_legacy_marpp_abnormal_shuffled(
        abnormal_shuffled,
        calibration_train_ratio=calibration_train_ratio,
        seed=seed,
    )
    return normal_train, normal_dev, normal_test, abnormal_train, abnormal_dev, abnormal_test


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create shared split indices.")
    parser.add_argument("--data-path", type=Path, default=Path("sjtu_dataset_clean_all_both"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--normal-split", type=str, default="8,1,1")
    parser.add_argument("--abnormal-split", type=str, default="0.5,0.5,1")
    parser.add_argument("--seed", type=int, default=2024)
    parser.add_argument(
        "--legacy-marpp-split",
        action="store_true",
        help="Replicate the old MARPP normal split and abnormal 50/50 dev/test split.",
    )
    parser.add_argument(
        "--legacy-abnormal-calibration-train-ratio",
        type=float,
        default=0.5,
        help="With --legacy-marpp-split, fraction of old abnormal dev used as CNN abnormal_train.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    normal = np.load(args.data_path / "normal_samples.npy", mmap_mode="r")
    abnormal = np.load(args.data_path / "abnormal_samples.npy", mmap_mode="r")
    label_names = load_label_names(args.data_path)
    abnormal_type_labels = load_optional_labels(args.data_path, "abnormal_type_labels.npy")
    abnormal_vehicle_labels = load_optional_labels(args.data_path, "abnormal_vehicle_labels.npy")
    abnormal_vehicle_type_labels = load_optional_labels(args.data_path, "abnormal_vehicle_type_labels.npy")

    if args.legacy_marpp_split:
        (
            normal_train,
            normal_dev,
            normal_test,
            abnormal_train,
            abnormal_dev,
            abnormal_test,
        ) = legacy_marpp_indices(
            normal.shape[0],
            abnormal.shape[0],
            calibration_train_ratio=args.legacy_abnormal_calibration_train_ratio,
            seed=args.seed,
        )
        split_mode = "legacy_marpp"
    else:
        rng = np.random.default_rng(args.seed)
        normal_train, normal_dev, normal_test = split_indices(
            normal.shape[0], parse_ratio(args.normal_split, "--normal-split"), rng)
        abnormal_train, abnormal_dev, abnormal_test = split_indices(
            abnormal.shape[0], parse_ratio(args.abnormal_split, "--abnormal-split"), rng)
        split_mode = "ratio"

    args.output.parent.mkdir(parents=True, exist_ok=True)
    metadata = {
        "data_path": str(args.data_path),
        "normal_count": int(normal.shape[0]),
        "abnormal_count": int(abnormal.shape[0]),
        "normal_split": args.normal_split,
        "abnormal_split": args.abnormal_split,
        "seed": args.seed,
        "split_mode": split_mode,
        "legacy_marpp_split": args.legacy_marpp_split,
        "legacy_abnormal_calibration_train_ratio": args.legacy_abnormal_calibration_train_ratio,
        "counts": {
            "normal_train": int(normal_train.shape[0]),
            "normal_dev": int(normal_dev.shape[0]),
            "normal_test": int(normal_test.shape[0]),
            "abnormal_train": int(abnormal_train.shape[0]),
            "abnormal_dev": int(abnormal_dev.shape[0]),
            "abnormal_test": int(abnormal_test.shape[0]),
        },
        "abnormal_type_distribution": {
            "train": label_distribution(
                abnormal_type_labels,
                abnormal_train,
                label_names.get("anomaly_type_names", []),
            ),
            "dev": label_distribution(
                abnormal_type_labels,
                abnormal_dev,
                label_names.get("anomaly_type_names", []),
            ),
            "test": label_distribution(
                abnormal_type_labels,
                abnormal_test,
                label_names.get("anomaly_type_names", []),
            ),
        },
        "abnormal_vehicle_distribution": {
            "train": label_distribution(
                abnormal_vehicle_labels,
                abnormal_train,
                label_names.get("vehicle_names", []),
            ),
            "dev": label_distribution(
                abnormal_vehicle_labels,
                abnormal_dev,
                label_names.get("vehicle_names", []),
            ),
            "test": label_distribution(
                abnormal_vehicle_labels,
                abnormal_test,
                label_names.get("vehicle_names", []),
            ),
        },
        "abnormal_vehicle_type_distribution": {
            "train": label_distribution(
                abnormal_vehicle_type_labels,
                abnormal_train,
                label_names.get("vehicle_type_names", []),
            ),
            "dev": label_distribution(
                abnormal_vehicle_type_labels,
                abnormal_dev,
                label_names.get("vehicle_type_names", []),
            ),
            "test": label_distribution(
                abnormal_vehicle_type_labels,
                abnormal_test,
                label_names.get("vehicle_type_names", []),
            ),
        },
    }
    np.savez(
        args.output,
        normal_train=normal_train,
        normal_dev=normal_dev,
        normal_test=normal_test,
        abnormal_train=abnormal_train,
        abnormal_dev=abnormal_dev,
        abnormal_test=abnormal_test,
        metadata=np.asarray(json.dumps(metadata, ensure_ascii=False)),
    )

    print("Saved split:", args.output)
    print(json.dumps(metadata, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
