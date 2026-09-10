#!/usr/bin/env python
"""Build the files the corpus explorer reads, from the released NeCast-simulations tree.

Outputs, copied to public/data/explorer/:
  windows.parquet  one row per window, Snappy-compressed (read in the browser with hyparquet)
  labels/NNN.bin   the 64 interval labels of 1,024 consecutive rows each, as little-endian int16
                   equal to round(1000 * log10 Ne); row r is in file r // 1024 at position r % 1024
  summary.json     category keys and counts, the time grid, file sizes and provenance

The window's file is not stored: window w is member w % 4 of fragment c = w // 4, in
windows/{c // 1000:03d}/fragment_{c:08d}.npz (checked here for every row).

    python build_explorer_data.py --corpus <NeCast-simulations tree> --out <dir> [--workers 8]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

EDGES = 50.0 * 10.0 ** (4.0 * np.arange(65) / 64.0)
CHUNK = 1024
SCALE = 1000
FAMILIES = ["constant", "exponential", "size_event", "multi_event", "bottleneck", "event_on_background",
            "spectral_walk", "sawtooth", "literature_sawtooth", "ooa_chain", "empirical_human_ne_template",
            "stdpopsim_single_pop"]
FAMILY_COLOURS = ["#7D838B", "#B07A3B", "#C8553D", "#9C3D54", "#C36F9A", "#7A5BA6", "#4E5BA6", "#2F7FA8",
                  "#4FA3C7", "#2E8C6E", "#4F7F3A", "#8AA33C"]          # the manuscript's Fig. 1b
MAPS = ["constant_clean", "constant_random_global", "synthetic_heterogeneous", "empirical_slice"]
SPLITS = ["train", "development", "reserved", "none"]
STAGES = ["fit", "validation", "test", "none"]


def fragment_path(window: int) -> str:
    chunk = window // 4
    return f"windows/{chunk // 1000:03d}/fragment_{chunk:08d}.npz"


def read_labels(task):
    root, rel, members = task
    with np.load(Path(root) / rel, allow_pickle=False) as z:
        ids = [str(s) for s in z["sample_id"]]
        target = np.asarray(z["target_log10_ne"], dtype=np.float64)
    return rel, {m: (ids[m], target[m]) for m in members}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--corpus", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--workers", type=int, default=8)
    args = ap.parse_args()
    t0 = time.time()
    index_path = args.corpus / "index/windows.parquet"
    idx = pd.read_parquet(index_path, columns=["sample_id", "window_number", "file", "member", "split", "stage",
                                               "generator_recipe", "map_type", "noise_profile", "n_variants"])
    idx = idx.sort_values("window_number").reset_index(drop=True)
    n = len(idx)
    if not (idx["file"] == idx["window_number"].map(fragment_path)).all():
        raise SystemExit("a window's file does not follow the chunk layout")
    if not (idx["member"] == idx["window_number"] % 4).all():
        raise SystemExit("a window's member is not its number mod 4")
    if not (idx["sample_id"] == idx["window_number"].map(lambda w: f"sim_{w:08d}")).all():
        raise SystemExit("a sample_id does not match its window number")
    for col, keys in (("generator_recipe", FAMILIES), ("map_type", MAPS), ("split", SPLITS), ("stage", STAGES)):
        unknown = set(idx[col]) - set(keys)
        if unknown:
            raise SystemExit(f"{col}: unknown values {unknown}")
    if not ((idx["noise_profile"] == "clean") == (idx["map_type"] == "constant_clean")).all():
        raise SystemExit("clean windows are not exactly the constant_clean ones")

    # labels, read from every fragment (only the small target member is decompressed)
    tasks = [(str(args.corpus), rel, sorted(g["member"].tolist())) for rel, g in idx.groupby("file")]
    labels = np.full((n, 64), np.nan)
    row_of = {sid: i for i, sid in enumerate(idx["sample_id"])}
    with Pool(args.workers) as pool:
        for k, (rel, got) in enumerate(pool.imap_unordered(read_labels, tasks, chunksize=32)):
            for m, (sid, target) in got.items():
                labels[row_of[sid]] = target
            if (k + 1) % 5000 == 0:
                print(f"  read {k + 1}/{len(tasks)} files ({time.time() - t0:.0f} s)", flush=True)
    if np.isnan(labels).any():
        raise SystemExit("some windows have no labels")
    q = np.round(labels * SCALE)
    if q.min() < -32768 or q.max() > 32767:
        raise SystemExit("labels do not fit in int16")
    q = q.astype("<i2")
    print(f"labels: log10 Ne {labels.min():.3f}..{labels.max():.3f}; max rounding error {np.abs(q / SCALE - labels).max():.2e}", flush=True)

    # file sizes (npz and jsonl.gz) per fragment
    frag = idx["window_number"].to_numpy() // 4
    sizes = {}
    for rel in idx["file"].unique():
        p = args.corpus / rel
        sizes[rel] = (os.stat(p).st_size, os.stat(p.with_name(p.name.replace(".npz", ".jsonl.gz"))).st_size)
    npz_bytes = idx["file"].map(lambda r: sizes[r][0]).to_numpy()
    jsonl_bytes = idx["file"].map(lambda r: sizes[r][1]).to_numpy()

    code = lambda col, keys: idx[col].map({k: i for i, k in enumerate(keys)}).astype("int8")
    table = pa.table({
        "window": pa.array(idx["window_number"].to_numpy(), pa.int32()),
        "family": pa.array(code("generator_recipe", FAMILIES), pa.int8()),
        "map": pa.array(code("map_type", MAPS), pa.int8()),
        "errors": pa.array((idx["noise_profile"] != "clean").to_numpy(), pa.bool_()),
        "split": pa.array(code("split", SPLITS), pa.int8()),
        "stage": pa.array(code("stage", STAGES), pa.int8()),
        "sites": pa.array(idx["n_variants"].to_numpy(), pa.int32()),
        "ne_min": pa.array(q.min(axis=1), pa.int16()),      # 1000 * log10 Ne, like the labels
        "ne_max": pa.array(q.max(axis=1), pa.int16()),
        "npz_bytes": pa.array(npz_bytes, pa.int32()),
        "jsonl_bytes": pa.array(jsonl_bytes, pa.int32()),
    })
    args.out.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, args.out / "windows.parquet", compression="snappy", row_group_size=n)
    (args.out / "labels").mkdir(exist_ok=True)
    n_chunks = (n + CHUNK - 1) // CHUNK
    for c in range(n_chunks):
        (args.out / "labels" / f"{c:03d}.bin").write_bytes(q[c * CHUNK:(c + 1) * CHUNK].tobytes())

    counts = lambda col, keys: [int((idx[col] == k).sum()) for k in keys]
    summary = {
        "generated": time.strftime("%Y-%m-%d"),
        "source": {"repository": "Larrivhan/NeCast-simulations",
                   "index_sha256": hashlib.sha256(index_path.read_bytes()).hexdigest()},
        "windows": n,
        "fragments": int(len(sizes)),
        "bytes": {"npz": int(sum(s[0] for s in sizes.values())), "jsonl": int(sum(s[1] for s in sizes.values()))},
        "time_edges": [float(x) for x in EDGES],
        "labels": {"scale": SCALE, "dtype": "int16-le", "rows_per_file": CHUNK, "files": n_chunks},
        "columns": {"ne_min": "1000 * min log10 Ne over the 64 labels", "ne_max": "1000 * max log10 Ne over the 64 labels"},
        "families": [{"key": k, "colour": c, "windows": w} for k, c, w in zip(FAMILIES, FAMILY_COLOURS, counts("generator_recipe", FAMILIES))],
        "maps": [{"key": k, "windows": w} for k, w in zip(MAPS, counts("map_type", MAPS))],
        "splits": [{"key": k, "windows": w} for k, w in zip(SPLITS, counts("split", SPLITS))],
        "stages": [{"key": k, "windows": w} for k, w in zip(STAGES, counts("stage", STAGES))],
        "sites": {"min": int(idx["n_variants"].min()), "max": int(idx["n_variants"].max())},
    }
    (args.out / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
    print(f"DONE {n} windows, {len(sizes)} files, {n_chunks} label files; "
          f"windows.parquet {os.path.getsize(args.out / 'windows.parquet') / 1e6:.2f} MB ({time.time() - t0:.0f} s)", flush=True)


if __name__ == "__main__":
    main()
