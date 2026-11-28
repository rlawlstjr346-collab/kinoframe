#!/usr/bin/env python3
"""
KINOFRAME IndexNow Zero-Login Auto-Indexer (Naver Search Advisor + Global IndexNow)
- Uses Python standard library only (`urllib.request`, `json`).
- Submits `/`, all 6 `/discover/<slug>` landing hubs, and `/shot/<id>` URLs in batch
  to BOTH official IndexNow endpoints:
    1) https://searchadvisor.naver.com/indexnow
    2) https://api.indexnow.org/indexnow
- Safe to call directly from CLI (`python3 scripts/ping_indexnow.py`) or imported by
  `scripts/auto_harvester.py` after metadata upload.
"""

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_SITE_URL = "https://kinoframe.rlawlstjr346.workers.dev"
DEFAULT_REPO = "rlawlstjr346-collab/kinoframe"
META_TAG = "kinoframe-meta"
INDEXNOW_KEY = "51e58ede71e681c9ceef985dc0c9a62d"

INDEXNOW_ENDPOINTS = (
    ("naver", "https://searchadvisor.naver.com/indexnow"),
    ("indexnow", "https://api.indexnow.org/indexnow"),
)

DISCOVER_SLUGS = (
    "tvcf-reference",
    "cinema-composition",
    "one-take",
    "color-grading",
    "vintage-commercial",
    "visual-hook",
)


def resolve_site_url(cli_site_url: str | None = None) -> str:
    raw = (cli_site_url or os.environ.get("NEXT_PUBLIC_SITE_URL") or DEFAULT_SITE_URL).strip()
    return raw.rstrip("/") or DEFAULT_SITE_URL


def resolve_indexnow_key(cli_key: str | None = None) -> str:
    env_key = (cli_key or os.environ.get("INDEXNOW_KEY") or "").strip()
    if env_key:
        return env_key
    key_file = Path(__file__).resolve().parent.parent / "public" / f"{INDEXNOW_KEY}.txt"
    if key_file.exists():
        content = key_file.read_text("utf-8").strip()
        if content:
            return content
    return INDEXNOW_KEY


def active_endpoints() -> list[tuple[str, str]]:
    """Naver only accepts hosts verified in Naver Search Advisor; opt in with INDEXNOW_NAVER=1."""
    naver_enabled = os.environ.get("INDEXNOW_NAVER", "").strip() == "1"
    return [(n, e) for n, e in INDEXNOW_ENDPOINTS if n != "naver" or naver_enabled]


def key_file_is_live(key_location: str, key: str, timeout: int = 20) -> bool:
    try:
        req = urllib.request.Request(key_location, headers={"User-Agent": "KinoframeIndexNow/1.1"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read(200).decode("utf-8", errors="ignore").strip() == key
    except Exception:
        return False


def fetch_catalog_shot_ids(repo: str = DEFAULT_REPO) -> list[str]:
    """Load all current shot IDs from catalog-full.json (fallback wall-active.json)."""
    for filename in ("catalog-full.json", "wall-active.json"):
        url = f"https://github.com/{repo}/releases/download/{META_TAG}/{filename}"
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "KinoframeIndexNow/1.1",
                    "Accept": "application/json",
                },
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="ignore"))
            items = data if isinstance(data, list) else (data.get("items") or [])
            ids = []
            seen = set()
            for item in items:
                cid = str(item.get("id") or "").strip()
                if cid and cid not in seen:
                    seen.add(cid)
                    ids.append(cid)
            if ids:
                return ids
        except Exception:
            continue
    return []


def build_default_urls(site_url: str, shot_ids: list[str] | None = None) -> list[str]:
    urls = [f"{site_url}/"]
    for slug in DISCOVER_SLUGS:
        urls.append(f"{site_url}/discover/{urllib.parse.quote(slug)}")
    for cid in shot_ids or []:
        urls.append(f"{site_url}/shot/{urllib.parse.quote(cid)}")
    # Deduplicate while preserving order
    seen = set()
    out = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out[:10_000]


def ping_indexnow(
    urls: list[str],
    site_url: str | None = None,
    key: str | None = None,
    timeout: int = 20,
) -> dict[str, dict]:
    """
    Submit URL list via IndexNow JSON POST to both Naver Search Advisor and api.indexnow.org.
    Never raises on transient endpoint errors; returns per-endpoint status dictionary.
    """
    resolved_site = resolve_site_url(site_url)
    resolved_key = resolve_indexnow_key(key)
    parsed = urllib.parse.urlparse(resolved_site)
    host = parsed.netloc
    key_location = f"{resolved_site}/{resolved_key}.txt"

    clean_urls = [u.strip() for u in urls if u and u.strip().startswith(resolved_site)]
    if not clean_urls:
        clean_urls = [f"{resolved_site}/"]

    payload_bytes = json.dumps(
        {
            "host": host,
            "key": resolved_key,
            "keyLocation": key_location,
            "urlList": clean_urls[:10_000],
        },
        ensure_ascii=False,
    ).encode("utf-8")

    results: dict[str, dict] = {}

    # Pre-flight: IndexNow endpoints reject (403) when the key file is not served at keyLocation.
    if not key_file_is_live(key_location, resolved_key, timeout):
        for name, endpoint in INDEXNOW_ENDPOINTS:
            results[name] = {
                "endpoint": endpoint,
                "status": 0,
                "ok": False,
                "skipped": True,
                "submitted": 0,
                "error": f"key file not served at {key_location}",
            }
        return results

    for name, endpoint in active_endpoints():
        req = urllib.request.Request(
            endpoint,
            data=payload_bytes,
            method="POST",
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "User-Agent": "KinoframeIndexNow/1.1",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = int(resp.status)
                body = resp.read(300).decode("utf-8", errors="ignore").strip()
                ok = status in (200, 202)
                results[name] = {
                    "endpoint": endpoint,
                    "status": status,
                    "ok": ok,
                    "submitted": len(clean_urls),
                    "body": body,
                }
        except urllib.error.HTTPError as he:
            body = ""
            try:
                body = he.read(300).decode("utf-8", errors="ignore").strip()
            except Exception:
                pass
            results[name] = {
                "endpoint": endpoint,
                "status": int(he.code),
                "ok": int(he.code) in (200, 202),
                "submitted": len(clean_urls),
                "body": body,
            }
        except Exception as exc:
            results[name] = {
                "endpoint": endpoint,
                "status": 0,
                "ok": False,
                "submitted": len(clean_urls),
                "error": str(exc),
            }

    return results


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Submit KINOFRAME URLs to Naver Search Advisor & IndexNow"
    )
    parser.add_argument("--site-url", default=None, help="Base site URL")
    parser.add_argument("--repo", default=DEFAULT_REPO, help="GitHub repo for catalog lookup")
    parser.add_argument("--key", default=None, help="Override 32-char IndexNow key")
    parser.add_argument(
        "--urls",
        nargs="*",
        default=None,
        help="Optional explicit URLs to submit (defaults to /, /discover/*, and all /shot/*)",
    )
    args = parser.parse_args()

    site_url = resolve_site_url(args.site_url)
    key = resolve_indexnow_key(args.key)

    if args.urls:
        url_list = list(args.urls)
    else:
        shot_ids = fetch_catalog_shot_ids(args.repo)
        url_list = build_default_urls(site_url, shot_ids)

    print(
        f"[IndexNow] Submitting {len(url_list)} URLs for host={urllib.parse.urlparse(site_url).netloc} (key={key[:8]}...)",
        flush=True,
    )
    results = ping_indexnow(url_list, site_url=site_url, key=key)
    all_ok = True
    for name, info in results.items():
        st = info.get("status")
        ok = info.get("ok")
        detail = info.get("error") or info.get("body") or "accepted"
        print(
            f"  -> {name:8s} ({info['endpoint']}): HTTP {st} | ok={ok} | urls={info['submitted']} | {detail}",
            flush=True,
        )
        if not ok:
            all_ok = False
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
