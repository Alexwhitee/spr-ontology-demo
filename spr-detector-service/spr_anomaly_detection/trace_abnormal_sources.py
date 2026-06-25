#!/usr/bin/env python3
"""
Trace each sample in abnormal_samples.npy back to its raw anomaly CSV row.

This script does not require numpy. It parses a standard C-order .npy file,
loads all anomaly CSV rows from the raw package, and matches samples by exact
float32 curve content.
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import struct
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trace abnormal_samples.npy entries back to raw anomaly CSV rows."
    )
    parser.add_argument(
        "--samples",
        type=Path,
        default=Path("sjtu_dataset/abnormal_samples.npy"),
        help="Path to abnormal_samples.npy",
    )
    parser.add_argument(
        "--input-root",
        type=Path,
        default=Path("NIO_dataset/Anomaly"),
        help="Root directory containing raw anomaly CSV files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("sjtu_dataset/abnormal_trace.json"),
        help="Where to save the trace result.",
    )
    return parser.parse_args()


def load_npy_float_samples(path: Path) -> List[Tuple[float, ...]]:
    with path.open("rb") as f:
        if f.read(6) != b"\x93NUMPY":
            raise ValueError(f"Not a .npy file: {path}")
        major = f.read(1)[0]
        _minor = f.read(1)[0]
        if major == 1:
            header_len = struct.unpack("<H", f.read(2))[0]
        elif major in (2, 3):
            header_len = struct.unpack("<I", f.read(4))[0]
        else:
            raise ValueError(f"Unsupported .npy version {major}")

        header = ast.literal_eval(f.read(header_len).decode("latin1"))
        descr = header["descr"]
        shape = header["shape"]
        if header["fortran_order"]:
            raise ValueError("Fortran-order .npy arrays are not supported.")
        if descr != "<f4":
            raise ValueError(f"Expected float32 .npy, got {descr}")
        if len(shape) != 3 or shape[1] != 1:
            raise ValueError(f"Expected shape (N, 1, L), got {shape}")

        sample_count, _channels, curve_len = shape
        fmt = "<" + "f" * curve_len
        sample_bytes = 4 * curve_len
        samples: List[Tuple[float, ...]] = []
        for _ in range(sample_count):
            chunk = f.read(sample_bytes)
            if len(chunk) != sample_bytes:
                raise ValueError("Unexpected EOF while reading sample data.")
            samples.append(struct.unpack(fmt, chunk))
        return samples


def curve_to_float32_key(curve_values: Sequence[str]) -> bytes:
    values = [float(item) for item in curve_values]
    return struct.pack("<" + "f" * len(values), *values)


def npy_sample_to_key(sample: Sequence[float]) -> bytes:
    return struct.pack("<" + "f" * len(sample), *sample)


def get_curve_column(fieldnames: Sequence[str]) -> str:
    for key in ("曲线数据", "ActualCurveData"):
        if key in fieldnames:
            return key
    raise KeyError(f"Missing curve column in CSV: {fieldnames}")


def build_raw_index(root: Path, expected_len: int) -> Dict[bytes, List[dict]]:
    index: Dict[bytes, List[dict]] = defaultdict(list)
    for csv_path in sorted(root.rglob("*.csv")):
        with csv_path.open("r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            if reader.fieldnames is None:
                continue
            curve_key = get_curve_column(reader.fieldnames)
            for row_idx, row in enumerate(reader, start=2):
                raw_curve = row.get(curve_key, "")
                parts = [item.strip() for item in raw_curve.split(",") if item.strip()]
                if len(parts) != expected_len:
                    continue
                key = curve_to_float32_key(parts)
                index[key].append(
                    {
                        "csv_path": str(csv_path),
                        "row_number": row_idx,
                        "filename": csv_path.name,
                        "spot": csv_path.stem,
                    }
                )
    return index


def trace_samples(samples: Sequence[Sequence[float]], raw_index: Dict[bytes, List[dict]]) -> dict:
    matched = []
    unmatched = []
    ambiguous = []

    for sample_idx, sample in enumerate(samples):
        key = npy_sample_to_key(sample)
        candidates = raw_index.get(key, [])
        item = {
            "sample_index": sample_idx,
            "match_count": len(candidates),
            "matches": candidates,
        }
        if not candidates:
            unmatched.append(item)
        elif len(candidates) == 1:
            matched.append(item)
        else:
            ambiguous.append(item)

    return {
        "sample_count": len(samples),
        "matched_count": len(matched),
        "unmatched_count": len(unmatched),
        "ambiguous_count": len(ambiguous),
        "matched": matched,
        "unmatched": unmatched,
        "ambiguous": ambiguous,
    }


def main() -> None:
    args = parse_args()
    samples = load_npy_float_samples(args.samples)
    if not samples:
        raise RuntimeError("No samples found in the npy file.")

    raw_index = build_raw_index(args.input_root, expected_len=len(samples[0]))
    result = trace_samples(samples, raw_index)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"sample_count: {result['sample_count']}")
    print(f"matched_count: {result['matched_count']}")
    print(f"ambiguous_count: {result['ambiguous_count']}")
    print(f"unmatched_count: {result['unmatched_count']}")
    print(f"saved to: {args.output}")


if __name__ == "__main__":
    main()
