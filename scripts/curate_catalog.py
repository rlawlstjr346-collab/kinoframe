#!/usr/bin/env python3
"""
Re-curates the published KINOFRAME catalog in place (GitHub Releases `kinoframe-meta`).

For every clip it downloads the 5-second loop, measures it (scripts/kf_media_analysis.py) and
rewrites the derived metadata from those measurements:
  crop (letterbox/pillarbox box), optics, compositionTags, opticsTags, directingNote, breakdown, era.
Hand-reviewed decisions come from scripts/curation/catalog-curation.json:
  excluded clips (kept in catalog-full with `excluded: true`), Korean titles, factual corrections.

Usage:
  python3 scripts/curate_catalog.py --work-dir /tmp/kf-curate            # dry run, writes JSON locally
  python3 scripts/curate_catalog.py --work-dir /tmp/kf-curate --publish  # uploads wall-active/catalog-full
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))

from auto_harvester import (  # noqa: E402
    DEFAULT_REPO,
    META_TAG,
    rotate_active_wall,
    upload_files_chunked,
    year_to_era,
)
from kf_media_analysis import analyze_clip  # noqa: E402

CURATION_PATH = SCRIPTS / "curation" / "catalog-curation.json"


def download(url: str, dest: Path) -> Path:
    if not dest.exists() or dest.stat().st_size == 0:
        req = urllib.request.Request(url, headers={"User-Agent": "KinoframeCurator/1.0"})
        with urllib.request.urlopen(req, timeout=60) as res:
            dest.write_bytes(res.read())
    return dest


def load_catalog(repo: str, work: Path) -> list[dict]:
    url = f"https://github.com/{repo}/releases/download/{META_TAG}/catalog-full.json"
    path = download(url, work / "catalog-full.source.json")
    data = json.loads(path.read_text("utf-8"))
    return data["items"] if isinstance(data, dict) else data


def analyze_item(item: dict, media_dir: Path) -> tuple[str, dict]:
    url = item.get("previewVideoUrl") or ""
    if not url.startswith("https://"):
        return item["id"], {"error": "no remote preview"}
    try:
        mp4 = download(url, media_dir / f"{item['id']}.mp4")
        return item["id"], analyze_clip(mp4)
    except Exception as exc:  # noqa: BLE001 - report and keep the old metadata
        return item["id"], {"error": str(exc)}


def apply_measurements(item: dict, m: dict) -> None:
    for key in ("crop", "optics", "compositionTags", "opticsTags", "directingNote"):
        item[key] = m[key]
    if not item["crop"]:
        item.pop("crop")
    optics = m["optics"]
    cuts = optics["cuts"]
    item["persuasionTags"] = []  # not measurable from pixels; never guessed
    item["breakdown"] = {
        "hook3s": m["directingNote"],
        "camera": optics["camera"],
        "lighting": f"{optics['key']} · {optics['tone']} · {optics['saturation']}",
        "editing": "단일 테이크" if cuts == 0 else f"컷 {cuts}회",
        "framing": ", ".join(m["compositionTags"]),
    }
    item["beats"] = []


def apply_curation(item: dict, curation: dict) -> None:
    cid = item["id"]
    item.update(curation["corrections"].get(cid, {}))
    title_ko = curation["titlesKo"].get(cid)
    if title_ko:
        item["titleKo"] = title_ko
    reason = curation["excluded"].get(cid)
    if reason:
        item["excluded"] = True
        item["excludedReason"] = reason
    else:
        item.pop("excluded", None)
        item.pop("excludedReason", None)
    item["era"] = year_to_era(int(item.get("year") or 2022))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", default=DEFAULT_REPO)
    ap.add_argument("--work-dir", required=True)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()

    work = Path(args.work_dir)
    media = work / "media"
    media.mkdir(parents=True, exist_ok=True)
    curation = json.loads(CURATION_PATH.read_text("utf-8"))
    catalog = load_catalog(args.repo, work)
    (work / "catalog-full.backup.json").write_text(json.dumps(catalog, ensure_ascii=False), "utf-8")

    with concurrent.futures.ProcessPoolExecutor(args.workers) as ex:
        results = dict(ex.map(analyze_item, catalog, [media] * len(catalog)))

    failed = []
    for item in catalog:
        m = results.get(item["id"], {})
        if "error" in m:
            failed.append((item["id"], m["error"]))
        else:
            apply_measurements(item, m)
        apply_curation(item, curation)

    active, catalog = rotate_active_wall(catalog)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    total_bytes = sum(int(x.get("bytes") or 0) for x in catalog)
    wall_path, full_path = work / "wall-active.json", work / "catalog-full.json"
    wall_path.write_text(json.dumps({"version": 2, "updatedAt": now, "activeCount": len(active), "items": active}, ensure_ascii=False, indent=2) + "\n", "utf-8")
    full_path.write_text(json.dumps({"version": 2, "updatedAt": now, "totalCount": len(catalog), "totalBytes": total_bytes, "items": catalog}, ensure_ascii=False, indent=2) + "\n", "utf-8")

    print(f"[CURATE] items={len(catalog)} active={len(active)} excluded={sum(1 for x in catalog if x.get('excluded'))} "
          f"cropped={sum(1 for x in catalog if x.get('crop'))} analysis_failed={len(failed)}")
    for cid, err in failed:
        print(f"  [FAILED] {cid}: {err}")
    if args.publish:
        if failed:
            raise SystemExit("Refusing to publish with failed analyses.")
        upload_files_chunked(args.repo, META_TAG, [wall_path, full_path], chunk_size=2)
        print("[CURATE] Published wall-active.json and catalog-full.json")


if __name__ == "__main__":
    main()
