#!/usr/bin/env python3
"""
KINOFRAME Initial 40-Masterpiece GitHub Releases Cloud Sync
- Creates immutable-target releases `kinoframe-media-s01` and `kinoframe-meta`
  pointing to the repository's root commit (never triggers Vercel `main` rebuilds).
- Uploads all 40 local `.mp4` + `.webp` files from `public/poc-loops/` to `kinoframe-media-s01`.
- Rewrites URLs to GitHub Releases download endpoints and uploads `wall-active.json` &
  `catalog-full.json` to `kinoframe-meta` (`--clobber`).
- Verifies HTTP 200 (after 302 redirect) on metadata JSON and sample media assets.
"""

import argparse
import datetime
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

DEFAULT_REPO = "rlawlstjr346-collab/kinoframe"
MEDIA_SHARD = "kinoframe-media-s01"
META_TAG = "kinoframe-meta"
ROOT = Path(__file__).resolve().parent.parent
POC_DIR = ROOT / "public" / "poc-loops"


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def get_root_commit() -> str:
    p = run(["git", "rev-list", "--max-parents=0", "HEAD"], check=True)
    return p.stdout.strip().splitlines()[0]


def ensure_release(repo: str, tag: str, title: str, notes: str, target_commit: str):
    check = run(["gh", "release", "view", tag, "-R", repo], check=False)
    if check.returncode == 0:
        print(f"[RELEASE] Exists: {tag}", flush=True)
        return
    print(f"[RELEASE] Creating {tag} targeting {target_commit[:10]}...", flush=True)
    p = run(
        [
            "gh",
            "release",
            "create",
            tag,
            "-R",
            repo,
            "--target",
            target_commit,
            "--title",
            title,
            "--notes",
            notes,
        ],
        check=False,
    )
    if p.returncode != 0:
        raise RuntimeError(f"Failed to create release {tag}: {p.stderr}")


def upload_assets_chunked(repo: str, tag: str, files: list[Path], chunk_size: int = 20):
    total = len(files)
    for i in range(0, total, chunk_size):
        batch = files[i : i + chunk_size]
        print(
            f"[UPLOAD] {tag}: batch {i + 1}..{min(total, i + len(batch))}/{total}...",
            flush=True,
        )
        cmd = [
            "gh",
            "release",
            "upload",
            tag,
            "-R",
            repo,
            "--clobber",
            *[str(f) for f in batch],
        ]
        p = run(cmd, check=False)
        if p.returncode != 0:
            raise RuntimeError(f"Upload failed on {tag}: {p.stderr}")


def verify_http_200(url: str) -> tuple[int, int]:
    req = urllib.request.Request(
        url, headers={"User-Agent": "KinoframeVerify/1.0"}, method="HEAD"
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            cl = int(resp.headers.get("Content-Length") or 0)
            return resp.status, cl
    except Exception:
        req_get = urllib.request.Request(
            url, headers={"User-Agent": "KinoframeVerify/1.0", "Range": "bytes=0-1023"}
        )
        with urllib.request.urlopen(req_get, timeout=20) as resp:
            body = resp.read(1024)
            return resp.status, len(body)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=DEFAULT_REPO)
    args = parser.parse_args()
    repo = args.repo

    manifest_path = POC_DIR / "manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Missing {manifest_path}")

    local_items = json.loads(manifest_path.read_text("utf-8"))
    if not isinstance(local_items, list) or len(local_items) == 0:
        raise RuntimeError("Local manifest.json is empty")

    target_commit = get_root_commit()
    ensure_release(
        repo,
        MEDIA_SHARD,
        "KINOFRAME Media Shard S01",
        "Automated media asset shard S01 (up to 450 clips / 900 files: .mp4 + .webp).",
        target_commit,
    )
    ensure_release(
        repo,
        META_TAG,
        "KINOFRAME Live Metadata Catalog",
        "Dynamic wall-active.json (max 600 active clips) & catalog-full.json (up to 10,000 cumulative clips).",
        target_commit,
    )

    asset_files: list[Path] = []
    cloud_items: list[dict] = []
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    base_url = f"https://github.com/{repo}/releases/download/{MEDIA_SHARD}"

    for item in local_items:
        clip_id = item["id"]
        mp4 = POC_DIR / f"{clip_id}.mp4"
        webp = POC_DIR / f"{clip_id}.webp"
        if not mp4.exists() or not webp.exists():
            raise FileNotFoundError(f"Missing media pair for {clip_id}")
        asset_files.extend([mp4, webp])
        total_bytes = mp4.stat().st_size + webp.stat().st_size

        cloud_item = dict(item)
        cloud_item["thumbnailUrl"] = f"{base_url}/{clip_id}.webp"
        cloud_item["previewVideoUrl"] = f"{base_url}/{clip_id}.mp4"
        cloud_item["shard"] = MEDIA_SHARD
        cloud_item["status"] = "active"
        cloud_item["bytes"] = total_bytes
        cloud_item["harvestedAt"] = cloud_item.get("harvestedAt") or now_iso
        cloud_item["seedMasterpiece"] = True
        cloud_items.append(cloud_item)

    upload_assets_chunked(repo, MEDIA_SHARD, asset_files, chunk_size=20)

    with tempfile.TemporaryDirectory(prefix="kf_meta_") as tmp_dir:
        tmp = Path(tmp_dir)
        wall_path = tmp / "wall-active.json"
        full_path = tmp / "catalog-full.json"

        wall_payload = {
            "version": 1,
            "updatedAt": now_iso,
            "activeCount": len(cloud_items),
            "items": cloud_items,
        }
        full_payload = {
            "version": 1,
            "updatedAt": now_iso,
            "totalCount": len(cloud_items),
            "totalBytes": sum(x["bytes"] for x in cloud_items),
            "items": cloud_items,
        }
        wall_path.write_text(
            json.dumps(wall_payload, ensure_ascii=False, indent=2) + "\n", "utf-8"
        )
        full_path.write_text(
            json.dumps(full_payload, ensure_ascii=False, indent=2) + "\n", "utf-8"
        )
        upload_assets_chunked(repo, META_TAG, [wall_path, full_path], chunk_size=2)

    checks = [
        f"https://github.com/{repo}/releases/download/{META_TAG}/wall-active.json",
        f"https://github.com/{repo}/releases/download/{META_TAG}/catalog-full.json",
        f"{base_url}/{cloud_items[0]['id']}.mp4",
        f"{base_url}/{cloud_items[-1]['id']}.mp4",
    ]
    print("\n=== VERIFYING GITHUB RELEASES DOWNLOAD ENDPOINTS ===", flush=True)
    for url in checks:
        st, size = verify_http_200(url)
        print(f"  [HTTP {st}] ({size}B) {url}", flush=True)
        if st not in (200, 206):
            raise RuntimeError(f"Unexpected HTTP {st} for {url}")

    total_mb = sum(x["bytes"] for x in cloud_items) / (1024 * 1024)
    print(
        f"\n=== SYNC COMPLETE === Uploaded {len(cloud_items)} clips ({len(asset_files)} files, {total_mb:.2f}MB) to {MEDIA_SHARD} + {META_TAG}",
        flush=True,
    )


if __name__ == "__main__":
    main()
