#!/usr/bin/env python3
"""sync-journal.py — materialize the storefront's /journal from the ONE canonical
Karma asset library. The editorial twin of sync-library.py.

sync-library.py handles the CATALOG (approved image shots -> site/img). This
handles WRITTEN CONTENT: it reads the same manifest
(``s3://hanzo-studio/orgs/karma/output/library.json``), takes every marketing
``blog``/``campaign`` asset that has been **queued** or **published**, pulls its
markdown body, and writes:

  site/journal/<name>.md    the post/brief body (verbatim from the library)
  site/journal.json         the index the /journal page renders (title, teaser,
                            hero webp, design, channel, file)

The hero reference in each post's front-matter (``designs/<slug>/<kind>_<role>.png``)
is mapped to the catalog webp the site already serves (``/img/<slug>/<role>.webp``),
so the journal reuses the approved catalog imagery — no second image pipeline.

It NEVER invents copy and never touches products.json or site/img. Queue a post
with karma-queue.py and re-run this; that is the only way the journal changes.
Same ``hz:`` rclone remote + s3-credentials as sync-library.py; ``--local`` for a
spark dry run.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

REMOTE = "hz:hanzo-studio/orgs/karma/output"
PUBLISHABLE = {"queued", "published"}
JOURNAL_KINDS = {"blog", "campaign"}

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(os.path.dirname(HERE), "site")
JOURNAL_DIR = os.path.join(SITE, "journal")


def sh(*args: str) -> str:
    out = subprocess.run(args, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"{' '.join(args)} failed: {out.stderr.strip()}")
    return out.stdout


def load_manifest(local_root: str | None) -> dict:
    if local_root:
        with open(os.path.join(local_root, "library.json")) as fh:
            return json.load(fh)
    return json.loads(sh("rclone", "cat", f"{REMOTE}/library.json"))


def fetch_text(rel: str, local_root: str | None) -> str:
    if local_root:
        with open(os.path.join(local_root, rel)) as fh:
            return fh.read()
    return sh("rclone", "cat", f"{REMOTE}/{rel}")


def front_matter(md: str) -> tuple[dict, str]:
    """Parse a lightweight YAML-ish front-matter block. Stdlib only."""
    meta: dict = {}
    body = md
    if md.startswith("---"):
        _, fm, body = md.split("---", 2)
        for line in fm.strip().splitlines():
            m = re.match(r"^(\w+):\s*(.*)$", line)
            if m and m.group(2) and not m.group(2).startswith(("-", "[")):
                meta[m.group(1)] = m.group(2).strip().strip('"')
    return meta, body.strip()


def hero_webp(ref: str | None) -> str | None:
    """designs/<slug>/<kind>_<role>.png -> /img/<slug>/<role>.webp (what the site serves)."""
    if not ref:
        return None
    m = re.match(r"designs/([^/]+)/([^/]+)\.\w+$", ref)
    if not m:
        return None
    slug, stem = m.group(1), m.group(2)
    role = stem.split("_", 1)[1] if "_" in stem else stem
    return f"/img/{slug}/{role}.webp"


def main() -> None:
    ap = argparse.ArgumentParser(description="Sync queued journal posts -> site/journal.")
    ap.add_argument("--local", help="Read the library from a local root instead of S3.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    doc = load_manifest(args.local)
    posts = [
        a for a in doc.get("assets", [])
        if a.get("kind") in JOURNAL_KINDS and a.get("status") in PUBLISHABLE
        and a.get("path", "").endswith(".md")
    ]
    posts.sort(key=lambda a: (a["kind"] != "campaign", a.get("design") or "", a["path"]))
    print(f"# manifest: {doc['_meta']['count']} assets, {len(posts)} publishable journal posts")

    index = []
    if not args.dry_run:
        os.makedirs(JOURNAL_DIR, exist_ok=True)
    for a in posts:
        name = os.path.basename(a["path"])
        md = fetch_text(a["path"], args.local)
        meta, _ = front_matter(md)
        slug = (a.get("design")
                or (meta.get("collection") or os.path.splitext(name)[0]).lower().replace(" ", "-"))
        entry = {
            "file": f"journal/{name}",
            "slug": slug,
            "design": a.get("design"),
            "channel": a["kind"],
            "title": meta.get("title") or (a.get("design") or "Karma").title(),
            "teaser": meta.get("teaser") or a.get("caption") or "",
            "hero": hero_webp(meta.get("hero")),
            "status": a["status"],
        }
        index.append(entry)
        if args.dry_run:
            print(f"  would write site/{entry['file']:28} hero={entry['hero']}  \"{entry['title']}\"")
            continue
        with open(os.path.join(SITE, entry["file"]), "w") as fh:
            fh.write(md if md.endswith("\n") else md + "\n")
        print(f"  site/{entry['file']:28} hero={entry['hero']}  \"{entry['title']}\"")

    if not args.dry_run:
        with open(os.path.join(SITE, "journal.json"), "w") as fh:
            json.dump({"posts": index}, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print(f"# wrote {len(index)} posts + journal.json into site/journal")


if __name__ == "__main__":
    main()
