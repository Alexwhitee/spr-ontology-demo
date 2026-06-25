#!/usr/bin/env python3
"""
Build SPR training datasets from the raw NIO package.

This script reconstructs the missing end-to-end pipeline around `clean.ipynb`:
1. Read labeled abnormal curves from `NIO_dataset/Anomaly/**/*.csv`.
2. Read unlabeled curves from `NIO_dataset/Nolabel/**/Unlabeled/*.xlsx`.
3. Keep only unlabeled files whose full point ID appears in the abnormal set.
4. Run the same coarse clean + Isolation Forest filtering logic used in
   `clean.ipynb` on each unlabeled workbook independently.
5. Sample abnormal / normal curves with deterministic random seeds.
6. Save `abnormal_samples.npy` and `normal_samples.npy` in `N x 1 x 256` format.

The original partner-provided pipeline is not fully documented, so the sampling
steps are configurable. By default this script keeps all abnormal curves and all
cleaned normal curves from matching full point IDs.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple
from xml.etree import ElementTree as ET
from zipfile import ZipFile

import numpy as np

try:
    from sklearn.ensemble import IsolationForest
except ImportError:  # pragma: no cover - depends on local environment
    IsolationForest = None


EXCEL_NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
DEFAULT_CURVE_LEN = 256
DEFAULT_SEED = 42


@dataclass
class CurveRecord:
    curve: np.ndarray
    spot: str
    source_path: str
    source_name: str
    line: str
    label: str
    vehicle: str = ""
    anomaly_type: str = ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build abnormal_samples.npy and normal_samples.npy from NIO_dataset."
    )
    parser.add_argument("--input-root", type=Path, default=Path("NIO_dataset"))
    parser.add_argument("--output-dir", type=Path, default=Path("spr_dataset_rebuilt"))
    parser.add_argument(
        "--vehicle",
        type=str,
        default=None,
        help="Optional vehicle scope such as Pegasus or Orion. When set, both anomaly and nolabel data are limited to that vehicle.",
    )
    parser.add_argument("--curve-len", type=int, default=DEFAULT_CURVE_LEN)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument(
        "--disable-iforest",
        action="store_true",
        help="Skip Isolation Forest and only run the coarse clean on nolabel data.",
    )
    parser.add_argument(
        "--iforest-contamination",
        type=float,
        default=0.1,
        help="Contamination used by Isolation Forest, matching clean.ipynb by default.",
    )
    parser.add_argument(
        "--iforest-gradient",
        action="store_true",
        help="Enable the optional gradient contamination schedule mentioned in clean.ipynb.",
    )
    parser.add_argument(
        "--abnormal-sample-size",
        type=int,
        default=None,
        help="Optional total number of abnormal curves to keep, sampled stratified by spot.",
    )
    parser.add_argument(
        "--normal-sample-size",
        type=int,
        default=None,
        help="Optional total number of normal curves to keep, sampled stratified by spot.",
    )
    parser.add_argument(
        "--normal-ratio",
        type=float,
        default=None,
        help="Optional per-spot multiplier: keep roughly ratio * abnormal_count normal curves per spot.",
    )
    parser.add_argument(
        "--cleaned-output-dir",
        type=Path,
        default=None,
        help="Optional directory for saving cleaned nolabel curves as new CSV files. Defaults to <output-dir>/cleaned_nolabel.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing output files.",
    )
    return parser.parse_args()


def ensure_ready(args: argparse.Namespace) -> None:
    if not args.input_root.exists():
        raise FileNotFoundError(f"Input root not found: {args.input_root}")
    if args.output_dir.exists() and not args.force:
        output_files = [
            args.output_dir / "abnormal_samples.npy",
            args.output_dir / "normal_samples.npy",
            args.output_dir / "build_summary.json",
        ]
        if any(path.exists() for path in output_files):
            raise FileExistsError(
                f"Output already exists in {args.output_dir}. Use --force to overwrite."
            )
    if args.cleaned_output_dir is None:
        args.cleaned_output_dir = args.output_dir / "cleaned_nolabel"
    if args.disable_iforest:
        return
    if IsolationForest is None:
        raise ImportError(
            "scikit-learn is required unless --disable-iforest is used. "
            "Please install scikit-learn in your environment."
        )


def parse_curve_string(raw: str, curve_len: int) -> Optional[np.ndarray]:
    if raw is None:
        return None
    parts = [item.strip() for item in str(raw).split(",") if item.strip()]
    if len(parts) != curve_len:
        return None
    try:
        values = np.asarray(parts, dtype=np.float32)
    except ValueError:
        return None
    return values


def spot_from_filename(filename: str) -> str:
    # The partner clarified that the full point ID includes the trailing suffix,
    # for example "FI-130R02-6" rather than only "FI-130R02".
    return Path(filename).stem


def get_csv_curve_column(fieldnames: Sequence[str]) -> str:
    for key in ("曲线数据", "ActualCurveData"):
        if key in fieldnames:
            return key
    raise KeyError(f"Could not find curve column in CSV headers: {fieldnames}")


def read_abnormal_records(root: Path, curve_len: int, vehicle: Optional[str] = None) -> List[CurveRecord]:
    records: List[CurveRecord] = []
    anomaly_root = root / "Anomaly"
    if vehicle is not None:
        anomaly_root = anomaly_root / vehicle

    for csv_path in sorted(anomaly_root.rglob("*.csv")):
        if csv_path.name.startswith("~"):
            continue
        spot = spot_from_filename(csv_path.name)
        record_vehicle = csv_path.parts[-3] if len(csv_path.parts) >= 3 else ""
        anomaly_type = csv_path.parts[-2] if len(csv_path.parts) >= 2 else ""
        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames is None:
                continue
            curve_key = get_csv_curve_column(reader.fieldnames)
            for row in reader:
                curve = parse_curve_string(row.get(curve_key, ""), curve_len)
                if curve is None:
                    continue
                records.append(
                    CurveRecord(
                        curve=curve,
                        spot=spot,
                        source_path=str(csv_path),
                        source_name=csv_path.name,
                        line=record_vehicle,
                        label="abnormal",
                        vehicle=record_vehicle,
                        anomaly_type=anomaly_type,
                    )
                )
    return records


def column_to_index(ref: str) -> int:
    letters = "".join(ch for ch in ref if ch.isalpha())
    index = 0
    for ch in letters:
        index = index * 26 + (ord(ch.upper()) - ord("A") + 1)
    return index - 1


def cell_text(cell: ET.Element, shared_strings: Sequence[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        node = cell.find("main:is/main:t", EXCEL_NS)
        return node.text if node is not None and node.text is not None else ""
    if cell_type == "s":
        node = cell.find("main:v", EXCEL_NS)
        if node is None or node.text is None:
            return ""
        return shared_strings[int(node.text)]
    node = cell.find("main:v", EXCEL_NS)
    return node.text if node is not None and node.text is not None else ""


def read_shared_strings(zf: ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    texts: List[str] = []
    for item in root.findall("main:si", EXCEL_NS):
        fragments = []
        for text_node in item.findall(".//main:t", EXCEL_NS):
            fragments.append(text_node.text or "")
        texts.append("".join(fragments))
    return texts


def read_xlsx_rows(xlsx_path: Path) -> List[Dict[str, str]]:
    with ZipFile(xlsx_path) as zf:
        shared_strings = read_shared_strings(zf)
        sheet_xml = zf.read("xl/worksheets/sheet1.xml")

    root = ET.fromstring(sheet_xml)
    rows = root.findall(".//main:sheetData/main:row", EXCEL_NS)
    if not rows:
        return []

    header_cells = rows[0].findall("main:c", EXCEL_NS)
    header_map: Dict[int, str] = {}
    for cell in header_cells:
        ref = cell.attrib.get("r", "")
        header_map[column_to_index(ref)] = cell_text(cell, shared_strings).strip()

    parsed_rows: List[Dict[str, str]] = []
    for row in rows[1:]:
        values: Dict[int, str] = {}
        for cell in row.findall("main:c", EXCEL_NS):
            ref = cell.attrib.get("r", "")
            values[column_to_index(ref)] = cell_text(cell, shared_strings)
        if not values:
            continue
        parsed_row: Dict[str, str] = {}
        for col_idx, col_name in header_map.items():
            parsed_row[col_name] = values.get(col_idx, "")
        parsed_rows.append(parsed_row)
    return parsed_rows


def coarse_clean_mask(data: np.ndarray, threshold: int = 5, eps: float = 1e-4) -> np.ndarray:
    if data.size == 0:
        return np.zeros((0,), dtype=bool)
    start_mean = data[:, :threshold].mean(axis=1)
    flag_start = np.abs(start_mean - data[:, 0]) < eps
    flag_end = data[:, -1] > 10
    return flag_start & flag_end


def compute_contamination(sample_count: int, base: float, gradient: bool) -> float:
    contamination = base
    if not gradient:
        return contamination
    for pivot in (200, 100, 50, 25, 12):
        if sample_count < pivot:
            contamination *= 2
        else:
            break
    return min(contamination, 0.5)


def clean_nolabel_records(
    records: Sequence[CurveRecord],
    random_seed: int,
    contamination: float,
    gradient: bool,
    disable_iforest: bool,
) -> List[CurveRecord]:
    if not records:
        return []

    data = np.stack([record.curve for record in records], axis=0)
    coarse_mask = coarse_clean_mask(data)
    coarse_records = [record for record, keep in zip(records, coarse_mask) if keep]
    if disable_iforest or len(coarse_records) <= 1:
        return coarse_records

    if IsolationForest is None:
        raise ImportError("IsolationForest is unavailable in the current environment.")

    coarse_data = np.stack([record.curve for record in coarse_records], axis=0)
    use_contamination = compute_contamination(len(coarse_records), contamination, gradient)
    rng = np.random.RandomState(random_seed)
    model = IsolationForest(contamination=use_contamination, random_state=rng)
    preds = model.fit_predict(coarse_data)
    return [record for record, pred in zip(coarse_records, preds) if pred == 1]


def read_nolabel_workbook(
    xlsx_path: Path,
    curve_len: int,
) -> List[CurveRecord]:
    rows = read_xlsx_rows(xlsx_path)
    records: List[CurveRecord] = []
    default_spot = spot_from_filename(xlsx_path.name)

    for row in rows:
        curve_raw = row.get("ActualCurveData") or row.get("曲线数据") or ""
        curve = parse_curve_string(curve_raw, curve_len)
        if curve is None:
            continue
        # `DeviceName` only stores the coarse device ID (for example RC025R04),
        # but the dataset is built on the finer-grained full point ID derived
        # from the workbook filename (for example RC025R04-1).
        spot = default_spot
        line = row.get("Seq") or row.get("线体") or ""
        record_vehicle = xlsx_path.parts[-3] if len(xlsx_path.parts) >= 3 else ""
        records.append(
            CurveRecord(
                curve=curve,
                spot=spot.strip(),
                source_path=str(xlsx_path),
                source_name=xlsx_path.name,
                line=str(line),
                label="normal",
                vehicle=record_vehicle,
                anomaly_type="",
            )
        )
    return records


def save_cleaned_records(
    records: Sequence[CurveRecord],
    source_workbook: Path,
    root: Path,
    cleaned_output_dir: Path,
) -> Path:
    relative = source_workbook.relative_to(root)
    output_path = cleaned_output_dir / relative.with_suffix(".csv")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["spot", "source_workbook", "line", "curve_data"],
        )
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "spot": record.spot,
                    "source_workbook": record.source_name,
                    "line": record.line,
                    "curve_data": ",".join(f"{value:.6f}" for value in record.curve),
                }
            )
    return output_path


def read_normal_candidates(
    root: Path,
    target_spots: Sequence[str],
    curve_len: int,
    random_seed: int,
    contamination: float,
    gradient: bool,
    disable_iforest: bool,
    cleaned_output_dir: Path,
    vehicle: Optional[str] = None,
) -> Tuple[List[CurveRecord], Dict[str, Dict[str, int]]]:
    spot_set = set(target_spots)
    summary: Dict[str, Dict[str, int]] = {}
    cleaned_records: List[CurveRecord] = []
    nolabel_root = root / "Nolabel"
    if vehicle is not None:
        nolabel_root = nolabel_root / vehicle

    for xlsx_path in sorted(nolabel_root.rglob("*.xlsx")):
        if xlsx_path.name.startswith("~"):
            continue
        spot = spot_from_filename(xlsx_path.name)
        if spot not in spot_set:
            continue
        records = read_nolabel_workbook(xlsx_path, curve_len)
        cleaned = clean_nolabel_records(
            records=records,
            random_seed=random_seed,
            contamination=contamination,
            gradient=gradient,
            disable_iforest=disable_iforest,
        )
        cleaned_records.extend(cleaned)
        cleaned_path = save_cleaned_records(
            records=cleaned,
            source_workbook=xlsx_path,
            root=nolabel_root,
            cleaned_output_dir=cleaned_output_dir,
        )
        summary[str(xlsx_path)] = {
            "raw": len(records),
            "cleaned": len(cleaned),
            "dropped": len(records) - len(cleaned),
            "cleaned_output": str(cleaned_path),
        }
    return cleaned_records, summary


def stratified_sample(
    records: Sequence[CurveRecord],
    sample_size: Optional[int],
    rng: np.random.Generator,
) -> List[CurveRecord]:
    if sample_size is None or sample_size >= len(records):
        return list(records)
    if sample_size <= 0:
        return []

    grouped: Dict[str, List[CurveRecord]] = defaultdict(list)
    for record in records:
        grouped[record.spot].append(record)

    total = len(records)
    desired: Dict[str, int] = {}
    remainders: List[Tuple[float, str]] = []
    for spot, bucket in grouped.items():
        exact = sample_size * len(bucket) / total
        base = min(len(bucket), math.floor(exact))
        desired[spot] = base
        remainders.append((exact - base, spot))

    assigned = sum(desired.values())
    for _, spot in sorted(remainders, reverse=True):
        if assigned >= sample_size:
            break
        if desired[spot] < len(grouped[spot]):
            desired[spot] += 1
            assigned += 1

    sampled: List[CurveRecord] = []
    for spot, bucket in grouped.items():
        take = desired[spot]
        if take <= 0:
            continue
        indices = rng.choice(len(bucket), size=take, replace=False)
        for idx in np.sort(indices):
            sampled.append(bucket[int(idx)])
    return sampled


def sample_normals_by_ratio(
    records: Sequence[CurveRecord],
    abnormal_spot_counts: Dict[str, int],
    normal_ratio: float,
    rng: np.random.Generator,
) -> List[CurveRecord]:
    grouped: Dict[str, List[CurveRecord]] = defaultdict(list)
    for record in records:
        grouped[record.spot].append(record)

    sampled: List[CurveRecord] = []
    for spot, bucket in sorted(grouped.items()):
        abnormal_count = abnormal_spot_counts.get(spot, 0)
        target = math.ceil(abnormal_count * normal_ratio)
        target = min(target, len(bucket))
        if target <= 0:
            continue
        indices = rng.choice(len(bucket), size=target, replace=False)
        for idx in np.sort(indices):
            sampled.append(bucket[int(idx)])
    return sampled


def to_sample_array(records: Sequence[CurveRecord], curve_len: int) -> np.ndarray:
    if not records:
        return np.empty((0, 1, curve_len), dtype=np.float32)
    data = np.stack([record.curve for record in records], axis=0).astype(np.float32)
    return data[:, np.newaxis, :]


def write_abnormal_metadata(output_dir: Path, records: Sequence[CurveRecord]) -> Dict[str, object]:
    type_names = sorted({record.anomaly_type for record in records})
    vehicle_names = sorted({record.vehicle for record in records})
    vehicle_type_names = sorted({f"{record.vehicle}/{record.anomaly_type}" for record in records})
    type_to_id = {name: idx for idx, name in enumerate(type_names)}
    vehicle_to_id = {name: idx for idx, name in enumerate(vehicle_names)}
    vehicle_type_to_id = {name: idx for idx, name in enumerate(vehicle_type_names)}

    type_labels = np.asarray([type_to_id[record.anomaly_type] for record in records], dtype=np.int64)
    vehicle_labels = np.asarray([vehicle_to_id[record.vehicle] for record in records], dtype=np.int64)
    vehicle_type_labels = np.asarray(
        [vehicle_type_to_id[f"{record.vehicle}/{record.anomaly_type}"] for record in records],
        dtype=np.int64,
    )

    np.save(output_dir / "abnormal_type_labels.npy", type_labels)
    np.save(output_dir / "abnormal_vehicle_labels.npy", vehicle_labels)
    np.save(output_dir / "abnormal_vehicle_type_labels.npy", vehicle_type_labels)

    names = {
        "anomaly_type_names": type_names,
        "vehicle_names": vehicle_names,
        "vehicle_type_names": vehicle_type_names,
    }
    with (output_dir / "abnormal_label_names.json").open("w", encoding="utf-8") as handle:
        json.dump(names, handle, ensure_ascii=False, indent=2)

    metadata_path = output_dir / "abnormal_metadata.csv"
    with metadata_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "sample_index",
                "vehicle",
                "anomaly_type",
                "vehicle_type",
                "spot",
                "source_path",
                "source_name",
                "line",
                "type_label",
                "vehicle_label",
                "vehicle_type_label",
            ],
        )
        writer.writeheader()
        for idx, record in enumerate(records):
            writer.writerow(
                {
                    "sample_index": idx,
                    "vehicle": record.vehicle,
                    "anomaly_type": record.anomaly_type,
                    "vehicle_type": f"{record.vehicle}/{record.anomaly_type}",
                    "spot": record.spot,
                    "source_path": record.source_path,
                    "source_name": record.source_name,
                    "line": record.line,
                    "type_label": int(type_labels[idx]),
                    "vehicle_label": int(vehicle_labels[idx]),
                    "vehicle_type_label": int(vehicle_type_labels[idx]),
                }
            )

    return {
        "abnormal_label_names": names,
        "abnormal_type_counts": dict(sorted(Counter(record.anomaly_type for record in records).items())),
        "abnormal_vehicle_counts": dict(sorted(Counter(record.vehicle for record in records).items())),
        "abnormal_vehicle_type_counts": dict(
            sorted(Counter(f"{record.vehicle}/{record.anomaly_type}" for record in records).items())
        ),
        "abnormal_metadata": str(metadata_path),
    }


def summarize_records(records: Sequence[CurveRecord]) -> Dict[str, int]:
    counter = Counter(record.spot for record in records)
    return dict(sorted(counter.items()))


def write_outputs(
    output_dir: Path,
    abnormal_records: Sequence[CurveRecord],
    normal_records: Sequence[CurveRecord],
    workbook_summary: Dict[str, Dict[str, int]],
    curve_len: int,
    args: argparse.Namespace,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    abnormal_array = to_sample_array(abnormal_records, curve_len)
    normal_array = to_sample_array(normal_records, curve_len)

    np.save(output_dir / "abnormal_samples.npy", abnormal_array)
    np.save(output_dir / "normal_samples.npy", normal_array)
    abnormal_metadata_summary = write_abnormal_metadata(output_dir, abnormal_records)

    summary = {
        "input_root": str(args.input_root),
        "vehicle": args.vehicle,
        "curve_len": curve_len,
        "seed": args.seed,
        "disable_iforest": args.disable_iforest,
        "iforest_contamination": args.iforest_contamination,
        "iforest_gradient": args.iforest_gradient,
        "abnormal_sample_size": args.abnormal_sample_size,
        "normal_sample_size": args.normal_sample_size,
        "normal_ratio": args.normal_ratio,
        "abnormal_count": int(abnormal_array.shape[0]),
        "normal_count": int(normal_array.shape[0]),
        "abnormal_shape": list(abnormal_array.shape),
        "normal_shape": list(normal_array.shape),
        "abnormal_spot_counts": summarize_records(abnormal_records),
        "normal_spot_counts": summarize_records(normal_records),
        **abnormal_metadata_summary,
        "nolabel_workbook_summary": workbook_summary,
    }
    with (output_dir / "build_summary.json").open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, ensure_ascii=False, indent=2)


def main() -> None:
    args = parse_args()
    ensure_ready(args)

    rng = np.random.default_rng(args.seed)
    abnormal_records = read_abnormal_records(args.input_root, args.curve_len, vehicle=args.vehicle)
    if not abnormal_records:
        raise RuntimeError("No abnormal curves were found.")

    abnormal_spot_counts = Counter(record.spot for record in abnormal_records)
    cleaned_normal_records, workbook_summary = read_normal_candidates(
        root=args.input_root,
        target_spots=list(abnormal_spot_counts.keys()),
        curve_len=args.curve_len,
        random_seed=args.seed,
        contamination=args.iforest_contamination,
        gradient=args.iforest_gradient,
        disable_iforest=args.disable_iforest,
        cleaned_output_dir=args.cleaned_output_dir,
        vehicle=args.vehicle,
    )

    if not cleaned_normal_records:
        raise RuntimeError("No normal curves remained after filtering.")

    sampled_abnormal_records = stratified_sample(
        abnormal_records,
        sample_size=args.abnormal_sample_size,
        rng=rng,
    )

    if args.normal_ratio is not None:
        sampled_normal_records = sample_normals_by_ratio(
            cleaned_normal_records,
            abnormal_spot_counts=Counter(record.spot for record in sampled_abnormal_records),
            normal_ratio=args.normal_ratio,
            rng=rng,
        )
    else:
        sampled_normal_records = list(cleaned_normal_records)

    sampled_normal_records = stratified_sample(
        sampled_normal_records,
        sample_size=args.normal_sample_size,
        rng=rng,
    )

    write_outputs(
        output_dir=args.output_dir,
        abnormal_records=sampled_abnormal_records,
        normal_records=sampled_normal_records,
        workbook_summary=workbook_summary,
        curve_len=args.curve_len,
        args=args,
    )

    print(f"abnormal samples: {len(sampled_abnormal_records)}")
    print(f"normal samples: {len(sampled_normal_records)}")
    print(f"saved to: {args.output_dir}")


if __name__ == "__main__":
    main()
