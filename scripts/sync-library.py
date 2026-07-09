#!/usr/bin/env python3
"""sync-library.py — materialize the storefront's product images from the ONE
canonical Karma asset library.

This is the DATA step of the content loop. It reads the manifest that studio
maintains (``s3://hanzo-studio/orgs/karma/output/library.json`` — see
``site/products.json`` ``_meta.library``), takes every asset that has been
**approved** for the catalog, and writes it to ``site/img/<slug>/<role>.webp``
where the SPA (``app.js``: ``/img/<slug>/<role>.webp``) already looks for it.

It is the exact contract documented in ``_meta.library.consume``:
  pull the manifest -> assets where status=='approved' and kind in
  [ecom, product, lifestyle] -> map entry.role -> /img/<slug>/<role>.webp
  (download entry.path PNG under the prefix, convert PNG -> webp).
  marketing/* is ignored (that's the socials/blog queue, not the catalog).

It NEVER touches products.json (curated name/price/copy the site owns), never
touches styling, and never deletes an image it did not just write — so a design
that is still ``draft`` in the library keeps whatever image the repo already
ships. Approving a shot in the queue and re-running this is the only way a
catalog image changes.

Source of truth is S3 (via the ``hz:`` rclone remote, same s3-credentials the
studio mirror uses — in CI they come from the KMS-synced Secret; nothing is
written to disk). For a spark-local dry run without S3, pass
``--local <library-root>``.

Usage:
  scripts/sync-library.py                 # pull s3 manifest, write approved -> site/img
  scripts/sync-library.py --local /home/z/work/hanzo/studio/output/orgs/karma/output
  scripts/sync-library.py --dry-run

rclone hz: remote (S3 mode) is configured from env:
  RCLONE_CONFIG_HZ_TYPE=s3 RCLONE_CONFIG_HZ_PROVIDER=Other
  RCLONE_CONFIG_HZ_ENDPOINT=https://s3.hanzo.ai RCLONE_CONFIG_HZ_FORCE_PATH_STYLE=true
  RCLONE_CONFIG_HZ_ACCESS_KEY_ID=... RCLONE_CONFIG_HZ_SECRET_ACCESS_KEY=...
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile

from PIL import Image

REMOTE = "hz:hanzo-studio/orgs/karma/output"
CATALOG_KINDS = {"ecom", "product", "lifestyle"}
# Longest-edge box (matches the storefront's committed 900x1350 portraits).
BOX = (1350, 1350)
WEBP_QUALITY = 82

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_IMG = os.path.join(os.path.dirname(HERE), "site", "img")


def load_manifest(local_root: str | None) -> dict:
    if local_root:
        with open(os.path.join(local_root, "library.json")) as fh:
            return json.load(fh)
    out = subprocess.run(
        ["rclone", "cat", f"{REMOTE}/library.json"],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        sys.exit(f"rclone cat library.json failed: {out.stderr.strip()}")
    return json.loads(out.stdout)


def fetch_png(rel_path: str, local_root: str | None, dst: str) -> None:
    if local_root:
        src = os.path.join(local_root, rel_path)
        if not os.path.isfile(src):
            raise FileNotFoundError(src)
        with open(src, "rb") as a, open(dst, "wb") as b:
            b.write(a.read())
        return
    out = subprocess.run(
        ["rclone", "copyto", f"{REMOTE}/{rel_path}", dst],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise RuntimeError(f"rclone copyto {rel_path}: {out.stderr.strip()}")


def to_webp(src_png: str, dst_webp: str) -> tuple[int, int, int]:
    im = Image.open(src_png).convert("RGB")
    im.thumbnail(BOX, Image.LANCZOS)
    os.makedirs(os.path.dirname(dst_webp), exist_ok=True)
    im.save(dst_webp, "WEBP", quality=WEBP_QUALITY, method=6)
    return im.width, im.height, os.path.getsize(dst_webp)


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync approved library shots -> site/img.")
    ap.add_argument("--local", help="Read the library from a local root instead of S3.")
    ap.add_argument("--dry-run", action="store_true", help="List what would be written; touch nothing.")
    args = ap.parse_args()

    doc = load_manifest(args.local)
    approved = [
        a for a in doc.get("assets", [])
        if a.get("status") == "approved" and a.get("kind") in CATALOG_KINDS
        and a.get("design") and a.get("role")
    ]
    print(f"# manifest: {doc['_meta']['count']} assets, {len(approved)} approved catalog shots")

    written = 0
    with tempfile.TemporaryDirectory() as tmp:
        for a in sorted(approved, key=lambda x: (x["design"], x["role"])):
            dst = os.path.join(SITE_IMG, a["design"], f"{a['role']}.webp")
            rel = os.path.relpath(dst, os.path.dirname(HERE))
            if args.dry_run:
                print(f"  would write {rel}  <- {a['path']}")
                continue
            png = os.path.join(tmp, "src.png")
            fetch_png(a["path"], args.local, png)
            w, h, size = to_webp(png, dst)
            print(f"  {rel:34} {w}x{h} {size:>7}B  <- {a['path']}")
            written += 1

    if not args.dry_run:
        print(f"# wrote {written} images into site/img (approved catalog only; nothing deleted)")


if __name__ == "__main__":
    main()
