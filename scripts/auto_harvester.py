#!/usr/bin/env python3
"""
KINOFRAME Autonomous Dawn Harvester (Zero-Secret GitHub Releases Cloud Engine)
- Designed to run twice daily on GitHub Actions (02:17 & 04:43 KST) using built-in GITHUB_TOKEN.
- Never commits binaries or JSON to `main` (zero Vercel rebuild triggers).
- Multi-source parallel extraction (`ThreadPoolExecutor(max_workers=4)`):
    1) Internet Archive API (`mediatype:movies`, vivid color cinema & 1950s-2000s color TVCF/brand films;
       multi-cut extraction: 3~4 distinct non-overlapping highlights per source via HTTP Byte-Range)
    2) Vimeo cinematography / commercial clips (fast opportunistic)
    3) YouTube opportunistic fallback (3s fast-fail circuit breaker on bot-check)
- Quality gates on every clip:
    * Cinema: 5.0s, scdet=threshold=12 == 0 cuts (uncut single take)
    * TVCF: 4.5s, scdet=threshold=12 <= 1 cut
    * Vivid color check (rejects B&W/monochrome, dark blackouts, white flashes, flat title/text cards)
    * cropdetect=24:2:0 letterbox/pillarbox removal
    * 960px H.264 (-crf 21, fallback 24 if >2.2MB) -an -pix_fmt yuv420p -movflags +faststart
    * Mid-frame .webp + real-pixel 5-color HEX palette
- Sharding & Perpetual 8.5GB Rotation:
    * Media shards `kinoframe-media-s01` .. `kinoframe-media-s20` (max 450 clips / 900 files per shard)
    * `kinoframe-meta/wall-active.json`: max 600 active clips (60% Cinema : 40% TVCF balanced)
    * `kinoframe-meta/catalog-full.json`: cumulative archive up to 10,000 clips (archived clips remain playable)
    * Automatic LRU deletion of oldest `archived` Release assets when cumulative storage exceeds 8.5 GB.
"""

import argparse
import concurrent.futures
import datetime
import io
import json
import math
import os
import random
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from PIL import Image

DEFAULT_REPO = "rlawlstjr346-collab/kinoframe"
META_TAG = "kinoframe-meta"
MAX_CLIPS_PER_SHARD = 450
MAX_SHARDS = 20
ACTIVE_WALL_CAP = 600
CATALOG_MAX_ITEMS = 10_000
STORAGE_CAP_BYTES = int(8.5 * 1024 * 1024 * 1024)  # 8.5 GB hard ceiling

BLOCKED_TITLE_RE = re.compile(
    r"(newsreel|black\s*and\s*white|b&w|monochrome|lecture|sermon|speech|seminar|"
    r"webinar|podcast|interview|slideshow|powerpoint|audiobook|gameplay|minecraft|"
    r"cartoon|popeye|tfa-319b|lucky\s*strike|silent\s*film|home\s*movie|amateur|"
    r"bible|church|preach|congress|hearing|c-span|council\s*meeting|board\s*meeting|"
    r"karaoke|lyrics|reaction|review|explained|unboxing|trailer\s*reaction)",
    re.I,
)

IA_CINEMA_QUERIES = [
    'mediatype:movies AND (color OR technicolor OR eastmancolor) AND (cinema OR feature OR drama OR thriller OR noir OR sci-fi) AND year:[1958 TO 2024]',
    'mediatype:movies AND (kodachrome OR technicolor) AND (film OR movie OR story) AND year:[1955 TO 2015]',
    'mediatype:movies AND collection:(feature_films OR classic_tv OR sci_fi_horror) AND (color OR technicolor) AND year:[1960 TO 2020]',
    'mediatype:movies AND ("short film" OR "independent film" OR "cinematography") AND color AND year:[1965 TO 2024]',
    'mediatype:movies AND (italian OR french OR japanese OR european) AND (film OR cinema) AND color AND year:[1960 TO 2018]',
]

IA_TVCF_QUERIES = [
    'mediatype:movies AND (commercial OR "tv commercial" OR tvcf OR advertisement) AND (color OR 1970 OR 1980 OR 1990) AND year:[1962 TO 2024]',
    'mediatype:movies AND collection:(prelinger OR classic_tv_commercials OR television) AND (commercial OR advertisement OR spot) AND color AND year:[1960 TO 2008]',
    'mediatype:movies AND ("vintage commercial" OR "retro commercial" OR "japanese commercial" OR "brand film") AND year:[1965 TO 2022]',
    'mediatype:movies AND (coca-cola OR pepsi OR sony OR toyota OR honda OR kodak OR nike OR apple OR canon OR panasonic) AND commercial AND year:[1964 TO 2022]',
    'mediatype:movies AND ("industrial film" OR "promotional film" OR "car commercial" OR "fashion film") AND color AND year:[1964 TO 2018]',
]

VIMEO_FALLBACK_QUERIES = [
    ("CLASSIC_FILM", "https://vimeo.com/channels/staffpicks"),
    ("TVCF", "https://vimeo.com/channels/commercials"),
]

YT_OPPORTUNISTIC_QUERIES = [
    ("CLASSIC_FILM", "ytsearch3:classic cinema scene 1080p clip"),
    ("TVCF", "ytsearch3:iconic vintage TV commercial HD"),
]

COMPOSITION_POOL = [
    ["1점 투시", "프레임 속 프레임", "역광 실루엣"],
    ["대칭 구도", "기하학 조형", "극단적 여백"],
    ["초근접 클로즈업", "프레임 속 프레임", "매치 컷"],
    ["역광 실루엣", "극단적 여백", "1점 투시"],
]

PERSUASION_POOL = [
    ["시각적 은유", "무대사 직관 전달"],
    ["초반 3초 시선 강탈", "스케일 반전"],
    ["카피×구도 일체형", "다큐 리얼리즘"],
]

PRIMARY_GRIDS = ["perspective", "thirds", "symmetry", "golden"]


def run_cmd(cmd: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def http_get_json(url: str, timeout: int = 15):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "KinoframeDawnHarvester/1.0 (+https://github.com/rlawlstjr346-collab/kinoframe)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def rgb_to_hsv(r: int, g: int, b: int):
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    mx = max(rf, gf, bf)
    mn = min(rf, gf, bf)
    df = mx - mn
    if df == 0:
        h = 0.0
    elif mx == rf:
        h = (60 * ((gf - bf) / df) + 360) % 360
    elif mx == gf:
        h = (60 * ((bf - rf) / df) + 120) % 360
    else:
        h = (60 * ((rf - gf) / df) + 240) % 360
    s = 0.0 if mx == 0 else df / mx
    return h, s, mx


def get_pixels(im: Image.Image):
    if hasattr(im, "get_flattened_data"):
        return list(im.get_flattened_data())
    return list(im.getdata())


def score_color_frame(png_bytes: bytes):
    """Strict color & visual richness gate: rejects B&W, blackouts, white flashes, and flat text cards."""
    try:
        im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    except Exception:
        return -1.0, "decode_err"

    w, h = im.size
    crop = im.crop((int(w * 0.10), int(h * 0.12), int(w * 0.90), int(h * 0.88)))
    small = crop.resize((96, 54), Image.Resampling.BILINEAR)
    pixels = get_pixels(small)
    total = len(pixels)

    near_black = 0
    near_white = 0
    lums = []
    sats = []
    chromas = []
    buckets = {}

    for r, g, b in pixels:
        mx = max(r, g, b)
        mn = min(r, g, b)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        lums.append(lum)
        if mx < 20:
            near_black += 1
        if mn > 236:
            near_white += 1
        bkey = (r >> 4, g >> 4, b >> 4)
        buckets[bkey] = buckets.get(bkey, 0) + 1
        _, sv, vv = rgb_to_hsv(r, g, b)
        if vv > 0.10:
            sats.append(sv)
            chromas.append((mx - mn) / 255.0)

    mean_lum = sum(lums) / total
    lum_std = math.sqrt(sum((x - mean_lum) ** 2 for x in lums) / total)
    max_bucket_ratio = max(buckets.values()) / total

    if near_black / total > 0.60 or mean_lum < 24:
        return -1.0, "too_dark"
    if near_white / total > 0.54 or mean_lum > 228:
        return -1.0, "too_white"
    if max_bucket_ratio > 0.46:
        return -1.0, "flat_text_or_logo_card"
    if lum_std < 22.0:
        return -1.0, "low_contrast"

    avg_sat = sum(sats) / max(1, len(sats))
    avg_chroma = sum(chromas) / max(1, len(chromas))
    # Reject monochrome / black-and-white / washed-out sepia lectures
    if avg_chroma < 0.085 or avg_sat < 0.14:
        return -1.0, "monochrome_or_low_color"

    score = avg_sat * 1.4 + avg_chroma * 2.4 + min(lum_std, 80.0) / 100.0
    return score, "ok"


def extract_palette_and_aspect(webp_path: Path):
    im = Image.open(webp_path).convert("RGB")
    w, h = im.size
    ratio = w / max(1, h)
    if ratio >= 2.02:
        aspect = "2.39:1"
    elif ratio >= 1.60:
        aspect = "16:9"
    elif ratio >= 1.42:
        aspect = "3:2"
    else:
        aspect = "4:3"

    small = im.resize(
        (96, max(40, int(96 / max(0.5, ratio)))), Image.Resampling.BILINEAR
    )
    q_im = small.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    raw_pal = q_im.getpalette() or []
    counts = q_im.getcolors(maxcolors=16) or []
    counts.sort(key=lambda x: x[0], reverse=True)

    swatches = []
    for cnt, idx in counts:
        r, g, b = raw_pal[idx * 3], raw_pal[idx * 3 + 1], raw_pal[idx * 3 + 2]
        hv, sv, vv = rgb_to_hsv(r, g, b)
        rgb_chroma = (max(r, g, b) - min(r, g, b)) / 255.0
        hex_c = f"#{r:02X}{g:02X}{b:02X}"
        swatches.append((cnt, hex_c, hv, sv, vv, r, g, b, rgb_chroma))

    distinct = []
    for sw in swatches:
        if all(
            abs(sw[5] - d[5]) + abs(sw[6] - d[6]) + abs(sw[7] - d[7]) >= 24
            for d in distinct
        ):
            distinct.append(sw)
        if len(distinct) >= 5:
            break
    for sw in swatches:
        if len(distinct) >= 5:
            break
        if sw[1] not in [d[1] for d in distinct]:
            distinct.append(sw)
    while len(distinct) < 5:
        distinct.append(
            swatches[0]
            if swatches
            else (1, "#C89E52", 39, 0.59, 0.78, 200, 158, 82, 0.46)
        )

    def hero_score(d):
        cnt, _, _, sv, vv, _, _, _, rgb_chroma = d
        lum_w = 1.0 if 0.20 <= vv <= 0.90 else 0.22
        return (rgb_chroma * 0.75 + sv * 0.25) * lum_w * math.sqrt(max(1, cnt))

    hero = max(distinct, key=hero_score)
    others = [d for d in distinct if d is not hero]
    others.sort(key=lambda d: d[4])
    palette = [hero[1]] + [d[1] for d in others[:4]]
    return palette, aspect, w, h


def count_scene_cuts(raw_mp4: Path, clip_dur: float, threshold: float = 12.0) -> int:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        str(raw_mp4),
        "-vf",
        f"scdet=threshold={threshold}",
        "-f",
        "null",
        "-",
    ]
    p = run_cmd(cmd, timeout=22)
    cuts = re.findall(r"lavfi\.scd\.time:\s*([0-9.]+)", p.stderr)
    interior = [float(t) for t in cuts if 0.14 <= float(t) <= max(0.5, clip_dur - 0.14)]
    return len(interior)


def detect_crop(raw_mp4: Path, orig_w: int, orig_h: int):
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-i",
        str(raw_mp4),
        "-vf",
        "cropdetect=24:2:0",
        "-f",
        "null",
        "-",
    ]
    p = run_cmd(cmd, timeout=20)
    matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", p.stderr)
    if not matches:
        return None
    half = matches[len(matches) // 3 :] or matches
    most_common, _ = Counter(half).most_common(1)[0]
    cw, ch, cx, cy = map(int, most_common)
    if cw < orig_w * 0.58 or ch < orig_h * 0.50:
        return None
    cw = cw & ~1
    ch = ch & ~1
    if cw >= orig_w - 4 and ch >= orig_h - 4:
        return None
    return f"crop={cw}:{ch}:{cx}:{cy}"


def score_raw_segment(raw_mp4: Path, clip_dur: float):
    scores = []
    for st in (0.6, clip_dur * 0.5, max(1.0, clip_dur - 0.6)):
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{st:.2f}",
            "-i",
            str(raw_mp4),
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-vcodec",
            "png",
            "-",
        ]
        res = subprocess.run(cmd, capture_output=True, timeout=14)
        if res.returncode != 0 or not res.stdout:
            return -1.0, "frame_err"
        sc, reason = score_color_frame(res.stdout)
        if sc < 0:
            return -1.0, reason
        scores.append(sc)
    return sum(scores) / len(scores), "ok"


def parse_year(raw) -> int:
    if isinstance(raw, int):
        return raw if 1950 <= raw <= 2026 else 1984
    m = re.search(r"(19[5-9]\d|20[0-2]\d)", str(raw or ""))
    return int(m.group(1)) if m else 1984


def year_to_era(year: int) -> str:
    if year < 1970:
        return "1950-60s"
    if year < 1980:
        return "1970s"
    if year < 1990:
        return "1980s"
    return "1990-00s"


def clean_title(raw_title: str) -> str:
    t = re.sub(r"\[[^\]]*\]", "", str(raw_title or ""))
    t = re.sub(r"[_]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:72] if len(t) > 72 else (t or "Cinema Archive Clip")


def discover_ia_sources(category: str, max_items: int = 45) -> list[dict]:
    """Query Internet Archive Advanced Search for color movies or color commercials."""
    queries = IA_CINEMA_QUERIES if category == "CLASSIC_FILM" else IA_TVCF_QUERIES
    shuffled_queries = list(queries)
    random.shuffle(shuffled_queries)

    discovered = []
    seen_ids = set()

    for q in shuffled_queries:
        if len(discovered) >= max_items:
            break
        page = random.randint(1, 6)
        params = urllib.parse.urlencode(
            {
                "q": q,
                "fl[]": ["identifier", "title", "year", "creator", "downloads"],
                "sort[]": "downloads desc",
                "rows": 30,
                "page": page,
                "output": "json",
            },
            doseq=True,
        )
        url = f"https://archive.org/advancedsearch.php?{params}"
        try:
            data = http_get_json(url, timeout=16)
        except Exception:
            continue
        docs = ((data or {}).get("response") or {}).get("docs") or []
        random.shuffle(docs)

        for doc in docs:
            ident = str(doc.get("identifier") or "").strip()
            title = str(doc.get("title") or "").strip()
            if not ident or ident in seen_ids:
                continue
            if BLOCKED_TITLE_RE.search(title) or BLOCKED_TITLE_RE.search(ident):
                continue
            seen_ids.add(ident)
            discovered.append(
                {
                    "origin": "ia",
                    "source_id": ident,
                    "title": clean_title(title or ident),
                    "year": parse_year(doc.get("year")),
                    "creator": str(doc.get("creator") or "Internet Archive")[:60],
                    "category": category,
                    "source_url": f"https://archive.org/details/{urllib.parse.quote(ident)}",
                }
            )
            if len(discovered) >= max_items:
                break

    return discovered


def resolve_ia_stream(item: dict):
    """Fetch IA metadata and locate best direct H.264 MP4 stream + duration."""
    ident = item["source_id"]
    try:
        meta = http_get_json(f"https://archive.org/metadata/{urllib.parse.quote(ident)}", timeout=12)
    except Exception:
        return None
    files = meta.get("files") or []
    mp4_candidates = []
    for f in files:
        name = str(f.get("name") or "")
        if not name.lower().endswith(".mp4"):
            continue
        size = int(f.get("size") or 0)
        if size < 1_500_000:
            continue
        dur_raw = f.get("length")
        dur = 0.0
        if dur_raw:
            try:
                if ":" in str(dur_raw):
                    parts = [float(p) for p in str(dur_raw).split(":")]
                    if len(parts) == 3:
                        dur = parts[0] * 3600 + parts[1] * 60 + parts[2]
                    elif len(parts) == 2:
                        dur = parts[0] * 60 + parts[1]
                else:
                    dur = float(dur_raw)
            except Exception:
                dur = 0.0
        if dur < 22 or dur > 10800:
            continue
        h = int(f.get("height") or 0)
        w = int(f.get("width") or 0)
        # Prefer >= 480p and non-512kb when HD MP4 exists, else 512kb fallback
        rank = (1 if h >= 720 else (0 if h >= 480 else -1), 0 if "_512kb" in name else 1, size)
        mp4_candidates.append((rank, name, dur, w, h))

    if not mp4_candidates:
        return None
    mp4_candidates.sort(key=lambda x: x[0], reverse=True)
    _, fname, dur, w, h = mp4_candidates[0]
    stream_url = f"https://archive.org/download/{urllib.parse.quote(ident)}/{urllib.parse.quote(fname)}"
    return {
        **item,
        "stream_url": stream_url,
        "duration": dur,
        "height": h or 480,
        "width": w or 640,
    }


def discover_opportunistic_yt_vimeo(yt_blocked_event: threading.Event) -> list[dict]:
    """Fast opportunistic Vimeo / YouTube candidate discovery (strict 3s fail-fast on bot blocks)."""
    results = []
    if not yt_blocked_event.is_set():
        for cat, q in YT_OPPORTUNISTIC_QUERIES:
            try:
                p = subprocess.run(
                    [
                        "yt-dlp",
                        "--dump-json",
                        "--skip-download",
                        "--no-warnings",
                        "--socket-timeout",
                        "3",
                        q,
                    ],
                    capture_output=True,
                    text=True,
                    timeout=9,
                )
            except Exception:
                yt_blocked_event.set()
                break
            err_low = (p.stderr or "").lower()
            if "sign in" in err_low or "bot" in err_low or "429" in err_low or p.returncode != 0:
                yt_blocked_event.set()
                break
            for line in p.stdout.splitlines():
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    info = json.loads(line)
                except Exception:
                    continue
                dur = float(info.get("duration") or 0)
                if dur < 25 or dur > 600:
                    continue
                title = clean_title(info.get("title") or "")
                if BLOCKED_TITLE_RE.search(title):
                    continue
                fmts = [
                    f
                    for f in (info.get("formats") or [])
                    if f.get("url")
                    and f.get("vcodec") not in (None, "none")
                    and 720 <= (f.get("height") or 0) <= 1080
                    and f.get("ext") == "mp4"
                    and not str(f.get("protocol") or "").startswith("m3u8")
                ]
                if not fmts:
                    continue
                fmts.sort(key=lambda f: f.get("height") or 0, reverse=True)
                best = fmts[0]
                results.append(
                    {
                        "origin": "yt",
                        "source_id": str(info.get("id")),
                        "title": title,
                        "year": parse_year(info.get("upload_date") or title),
                        "creator": str(info.get("uploader") or "YouTube HD")[:60],
                        "category": cat,
                        "source_url": info.get("webpage_url")
                        or f"https://www.youtube.com/watch?v={info.get('id')}",
                        "stream_url": best["url"],
                        "duration": dur,
                        "height": best.get("height") or 720,
                        "width": best.get("width") or 1280,
                    }
                )
    return results


def extract_clips_from_source(
    src: dict,
    work_dir: Path,
    existing_source_keys: set,
    lock: threading.Lock,
    deadline: float,
    max_cuts_per_source: int = 3,
) -> list[dict]:
    """Extract 1~4 distinct non-overlapping high-quality color loops from a single source."""
    if time.time() >= deadline:
        return []

    if src["origin"] == "ia":
        resolved = resolve_ia_stream(src)
        if not resolved:
            return []
        src = resolved

    is_film = src["category"] == "CLASSIC_FILM"
    clip_dur = 5.0 if is_film else 4.5
    max_cuts_allowed = 0 if is_film else 1
    dur = float(src["duration"])

    # Skip opening studio logos / credits and end credits
    lo = max(12.0, dur * 0.14) if dur > 90 else max(4.0, dur * 0.16)
    hi = min(dur - 12.0, dur * 0.84) if dur > 90 else min(dur - 6.0, dur * 0.78)
    if hi <= lo + clip_dur:
        return []

    # 4 non-overlapping candidate windows spread across the film/spot
    fracs = (0.12, 0.36, 0.60, 0.84) if dur >= 120 else (0.18, 0.50, 0.78)
    timestamps = [lo + (hi - lo) * f for f in fracs]

    produced = []
    tid = threading.get_ident()

    for idx, start_t in enumerate(timestamps):
        if len(produced) >= max_cuts_per_source or time.time() >= deadline:
            break
        if start_t + clip_dur >= dur - 2.0:
            continue

        bucket = int(start_t // 15)
        skey = f"{src['origin']}:{src['source_id']}:b{bucket}"
        with lock:
            if skey in existing_source_keys:
                continue

        raw_mp4 = work_dir / f"raw_{tid}_{idx}.mp4"
        out_mp4 = work_dir / f"out_{tid}_{idx}_{int(time.time() * 1000)}.mp4"
        out_webp = out_mp4.with_suffix(".webp")

        try:
            cut_cmd = [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{start_t:.2f}",
                "-i",
                src["stream_url"],
                "-t",
                f"{clip_dur:.2f}",
                "-an",
                "-c:v",
                "libx264",
                "-crf",
                "17",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                str(raw_mp4),
            ]
            res = run_cmd(cut_cmd, timeout=35)
            if res.returncode != 0 or not raw_mp4.exists() or raw_mp4.stat().st_size < 14_000:
                continue

            # 1) Strict color + anti-blackout + anti-text-card quality check
            fscore, _ = score_raw_segment(raw_mp4, clip_dur)
            if fscore < 0:
                continue

            # 2) Strict scene-cut verification (scdet=threshold=12: 0 for films, <=1 for TVCF)
            cuts = count_scene_cuts(raw_mp4, clip_dur, threshold=12.0)
            if cuts > max_cuts_allowed:
                continue

            # 3) Probe dimensions & run cropdetect=24:2:0
            probe = run_cmd(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=width,height",
                    "-of",
                    "csv=p=0:s=x",
                    str(raw_mp4),
                ],
                timeout=10,
            )
            try:
                orig_w, orig_h = map(int, probe.stdout.strip().split("x"))
            except Exception:
                orig_w, orig_h = 960, 540
            if orig_w < 360 or orig_h < 240:
                continue

            crop_filter = detect_crop(raw_mp4, orig_w, orig_h)
            vf_parts = []
            if crop_filter:
                vf_parts.append(crop_filter)
            vf_parts.append("scale='min(960,iw)':-2:flags=lanczos")
            vf = ",".join(vf_parts)

            # 4) Final H.264 960px faststart encode
            enc_ok = False
            for crf in ("21", "24"):
                er = run_cmd(
                    [
                        "ffmpeg",
                        "-y",
                        "-hide_banner",
                        "-loglevel",
                        "error",
                        "-i",
                        str(raw_mp4),
                        "-vf",
                        vf,
                        "-an",
                        "-c:v",
                        "libx264",
                        "-crf",
                        crf,
                        "-preset",
                        "fast",
                        "-pix_fmt",
                        "yuv420p",
                        "-movflags",
                        "+faststart",
                        "-t",
                        f"{clip_dur:.2f}",
                        str(out_mp4),
                    ],
                    timeout=35,
                )
                if er.returncode == 0 and out_mp4.exists() and out_mp4.stat().st_size > 25_000:
                    enc_ok = True
                    if out_mp4.stat().st_size <= 2_250_000:
                        break
            if not enc_ok:
                continue

            # 5) Mid-frame WebP + real 5-color HEX palette
            wr = run_cmd(
                [
                    "ffmpeg",
                    "-y",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{clip_dur * 0.5:.2f}",
                    "-i",
                    str(out_mp4),
                    "-frames:v",
                    "1",
                    "-c:v",
                    "libwebp",
                    "-quality",
                    "86",
                    str(out_webp),
                ],
                timeout=18,
            )
            if wr.returncode != 0 or not out_webp.exists():
                continue

            palette, aspect, cw, ch = extract_palette_and_aspect(out_webp)
            with lock:
                if skey in existing_source_keys:
                    continue
                existing_source_keys.add(skey)

            produced.append(
                {
                    "mp4": out_mp4,
                    "webp": out_webp,
                    "source_key": skey,
                    "title": src["title"],
                    "year": src["year"],
                    "creator": src["creator"],
                    "category": src["category"],
                    "source_url": src["source_url"],
                    "aspect": aspect,
                    "duration_sec": clip_dur,
                    "width": cw,
                    "height": ch,
                    "cuts": cuts,
                    "palette": palette,
                    "bytes": out_mp4.stat().st_size + out_webp.stat().st_size,
                }
            )
        except Exception:
            continue
        finally:
            if raw_mp4.exists():
                try:
                    raw_mp4.unlink()
                except Exception:
                    pass

    return produced


def get_root_commit() -> str:
    p = run_cmd(["git", "rev-list", "--max-parents=0", "HEAD"], timeout=15)
    if p.returncode == 0 and p.stdout.strip():
        return p.stdout.strip().splitlines()[0]
    return "main"


def ensure_release_exists(repo: str, tag: str, target_commit: str):
    chk = run_cmd(["gh", "release", "view", tag, "-R", repo], timeout=25)
    if chk.returncode == 0:
        return
    p = run_cmd(
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
            f"KINOFRAME Storage ({tag})",
            "--notes",
            f"Automated sharded storage release {tag}.",
        ],
        timeout=30,
    )
    if p.returncode != 0:
        raise RuntimeError(f"Failed creating release {tag}: {p.stderr}")


def download_existing_catalog(repo: str) -> list[dict]:
    url = f"https://github.com/{repo}/releases/download/{META_TAG}/catalog-full.json"
    try:
        data = http_get_json(url, timeout=20)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data["items"]
    except Exception:
        pass
    return []


def next_harvest_number(catalog: list[dict]) -> int:
    max_n = 0
    for item in catalog:
        m = re.match(r"^KF-HV-(\d+)$", str(item.get("id") or ""))
        if m:
            max_n = max(max_n, int(m.group(1)))
    return max_n + 1


def pick_target_shard(shard_counts: dict[str, int]) -> str:
    for idx in range(1, MAX_SHARDS + 1):
        tag = f"kinoframe-media-s{idx:02d}"
        if shard_counts.get(tag, 0) < MAX_CLIPS_PER_SHARD:
            return tag
    # Fallback to least-populated shard if all 20 are near capacity
    return min(
        (f"kinoframe-media-s{i:02d}" for i in range(1, MAX_SHARDS + 1)),
        key=lambda t: shard_counts.get(t, 0),
    )


def upload_files_chunked(repo: str, tag: str, files: list[Path], chunk_size: int = 30):
    for i in range(0, len(files), chunk_size):
        batch = files[i : i + chunk_size]
        p = run_cmd(
            [
                "gh",
                "release",
                "upload",
                tag,
                "-R",
                repo,
                "--clobber",
                *[str(f) for f in batch],
            ],
            timeout=180,
        )
        if p.returncode != 0:
            raise RuntimeError(f"gh release upload failed ({tag}): {p.stderr}")


def delete_release_asset(repo: str, tag: str, asset_name: str):
    run_cmd(
        ["gh", "release", "delete-asset", tag, asset_name, "-R", repo, "-y"],
        timeout=30,
    )


def rotate_active_wall(catalog: list[dict]) -> tuple[list[dict], list[dict]]:
    """Select up to 600 active clips (60% Cinema / 40% TVCF balanced) and mark rest archived."""
    # Sort newest first so fresh harvests surface immediately while preserving seed masterpieces
    ordered = sorted(
        catalog,
        key=lambda x: (
            str(x.get("harvestedAt") or x.get("addedAt") or ""),
            str(x.get("id") or ""),
        ),
        reverse=True,
    )
    films = [x for x in ordered if x.get("category") != "TVCF"]
    tvcfs = [x for x in ordered if x.get("category") == "TVCF"]

    film_target = int(ACTIVE_WALL_CAP * 0.60)  # 360
    tvcf_target = ACTIVE_WALL_CAP - film_target  # 240

    picked_films = films[:film_target]
    picked_tvcfs = tvcfs[:tvcf_target]
    active_ids = {x["id"] for x in picked_films} | {x["id"] for x in picked_tvcfs}

    # Fill remainder up to 600 if one category has fewer than its quota
    if len(active_ids) < ACTIVE_WALL_CAP:
        for x in ordered:
            if x["id"] not in active_ids:
                active_ids.add(x["id"])
                if len(active_ids) >= ACTIVE_WALL_CAP:
                    break

    active_list = []
    for item in catalog:
        if item["id"] in active_ids:
            item["status"] = "active"
            active_list.append(item)
        else:
            item["status"] = "archived"

    return active_list, catalog


def enforce_storage_cap(repo: str, catalog: list[dict]) -> list[dict]:
    """When cumulative bytes exceed 8.5 GB (or > 10,000 items), LRU-evict oldest archived assets."""
    total_bytes = sum(int(x.get("bytes") or 850_000) for x in catalog)
    if total_bytes <= STORAGE_CAP_BYTES and len(catalog) <= CATALOG_MAX_ITEMS:
        return catalog

    # Candidates for eviction: archived non-seed items first (oldest harvestedAt first)
    archived = [
        x
        for x in catalog
        if x.get("status") == "archived" and not x.get("seedMasterpiece")
    ]
    archived.sort(
        key=lambda x: (
            str(x.get("harvestedAt") or x.get("addedAt") or ""),
            str(x.get("id") or ""),
        )
    )

    evict_ids = set()
    for victim in archived:
        if total_bytes <= STORAGE_CAP_BYTES and (len(catalog) - len(evict_ids)) <= CATALOG_MAX_ITEMS:
            break
        shard = str(victim.get("shard") or "")
        vid = str(victim.get("id") or "")
        if shard and vid:
            delete_release_asset(repo, shard, f"{vid}.mp4")
            delete_release_asset(repo, shard, f"{vid}.webp")
        total_bytes -= int(victim.get("bytes") or 850_000)
        evict_ids.add(vid)
        print(f"[EVICT] Removed archived asset {vid} from {shard} (8.5GB cap)", flush=True)

    return [x for x in catalog if x.get("id") not in evict_ids]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--target-count", type=int, default=160)
    parser.add_argument("--max-minutes", type=float, default=21.0)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    repo = args.repo
    target_count = max(1, min(args.target_count, 300))
    start_ts = time.time()
    deadline = start_ts + max(2.0, args.max_minutes) * 60.0
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    today_str = now_iso[:10]

    print(
        f"=== KINOFRAME DAWN HARVESTER START === repo={repo} target={target_count} max_min={args.max_minutes}",
        flush=True,
    )

    catalog = download_existing_catalog(repo)
    print(f"[CATALOG] Loaded {len(catalog)} existing clips from {META_TAG}", flush=True)

    existing_source_keys = {
        str(x.get("sourceKey")) for x in catalog if x.get("sourceKey")
    }
    shard_counts: dict[str, int] = Counter(
        str(x.get("shard") or "kinoframe-media-s01") for x in catalog
    )
    next_num = next_harvest_number(catalog)
    root_commit = get_root_commit()

    # Build 60% Cinema / 40% TVCF candidate pool
    film_goal = max(1, round(target_count * 0.60))
    tvcf_goal = max(1, target_count - film_goal)

    ia_films = discover_ia_sources("CLASSIC_FILM", max_items=max(20, film_goal * 2))
    ia_tvcfs = discover_ia_sources("TVCF", max_items=max(16, tvcf_goal * 2))

    yt_blocked = threading.Event()
    opp_sources = discover_opportunistic_yt_vimeo(yt_blocked)

    # Interleave cinema and TVCF candidates at 6:4 ratio
    candidates = []
    fi, ti = 0, 0
    while fi < len(ia_films) or ti < len(ia_tvcfs):
        for _ in range(3):
            if fi < len(ia_films):
                candidates.append(ia_films[fi])
                fi += 1
        for _ in range(2):
            if ti < len(ia_tvcfs):
                candidates.append(ia_tvcfs[ti])
                ti += 1
    candidates.extend(opp_sources)
    print(
        f"[DISCOVER] Candidates={len(candidates)} (IA Film={len(ia_films)}, IA TVCF={len(ia_tvcfs)}, Opp={len(opp_sources)})",
        flush=True,
    )

    harvested_raw: list[dict] = []
    lock = threading.Lock()
    stop_event = threading.Event()

    with tempfile.TemporaryDirectory(prefix="kf_harvest_") as tmp_dir:
        work_dir = Path(tmp_dir)

        def worker_task(src_item: dict):
            if stop_event.is_set() or time.time() >= deadline:
                return []
            cuts_limit = 3 if target_count >= 24 else 2
            return extract_clips_from_source(
                src_item, work_dir, existing_source_keys, lock, deadline, cuts_limit
            )

        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = [pool.submit(worker_task, c) for c in candidates]
            for fut in concurrent.futures.as_completed(futures):
                if time.time() >= deadline:
                    stop_event.set()
                    break
                try:
                    clips = fut.result()
                except Exception:
                    continue
                for cl in clips:
                    harvested_raw.append(cl)
                    print(
                        f"  [HARVEST {len(harvested_raw)}/{target_count}] {cl['category']} | {cl['width']}x{cl['height']} ({cl['aspect']}) | {cl['bytes'] // 1024}KB | cuts={cl['cuts']} | pal={cl['palette'][0]} | {cl['title'][:40]}",
                        flush=True,
                    )
                    if len(harvested_raw) >= target_count:
                        stop_event.set()
                        break
                if stop_event.is_set():
                    for pending in futures:
                        pending.cancel()
                    break

        if not harvested_raw:
            print("[HARVEST] 0 new clips produced in this window; leaving Releases untouched.", flush=True)
            return

        # Assign IDs, target shards, rename files, and group uploads by shard
        uploads_by_shard: dict[str, list[Path]] = {}
        new_items: list[dict] = []

        for idx, cl in enumerate(harvested_raw[:target_count]):
            clip_id = f"KF-HV-{next_num:04d}"
            next_num += 1
            shard = pick_target_shard(shard_counts)
            shard_counts[shard] = shard_counts.get(shard, 0) + 1

            final_mp4 = work_dir / f"{clip_id}.mp4"
            final_webp = work_dir / f"{clip_id}.webp"
            shutil.move(str(cl["mp4"]), str(final_mp4))
            shutil.move(str(cl["webp"]), str(final_webp))
            uploads_by_shard.setdefault(shard, []).extend([final_mp4, final_webp])

            base_dl = f"https://github.com/{repo}/releases/download/{shard}"
            cat = cl["category"]
            item_doc = {
                "id": clip_id,
                "titleKo": cl["title"],
                "originalTitle": f"{cl['title']} ({cl['year']})",
                "brandOrSource": cl["creator"],
                "year": cl["year"],
                "era": year_to_era(cl["year"]),
                "mediaType": "TVCF" if cat == "TVCF" else "NEWS",
                "category": cat,
                "country": "GLOBAL",
                "aspectRatio": cl["aspect"],
                "durationSec": cl["duration_sec"],
                "startSec": 0,
                "mediaSource": "archive_mp4",
                "thumbnailUrl": f"{base_dl}/{clip_id}.webp",
                "previewVideoUrl": f"{base_dl}/{clip_id}.mp4",
                "youtubeId": None,
                "sourceUrl": cl["source_url"],
                "licenseNote": f"Dawn Harvest ({cl['width']}x{cl['height']}, {cl['bytes'] // 1024}KB, cuts={cl['cuts']})",
                "compositionTags": COMPOSITION_POOL[idx % len(COMPOSITION_POOL)],
                "persuasionTags": PERSUASION_POOL[idx % len(PERSUASION_POOL)],
                "palette": cl["palette"],
                "viewfinder": {
                    "vanishingPoint": [50, 48],
                    "eyePath": [[25, 58], [50, 48], [75, 38]],
                    "primaryGrid": PRIMARY_GRIDS[idx % len(PRIMARY_GRIDS)],
                },
                "beats": [
                    {
                        "label": "오프닝 프레임",
                        "timeOrZone": "0:00",
                        "noteKo": f"{cl['title']} 컬러 루프 하이라이트",
                        "focusCrop": "50% 48%",
                    }
                ],
                "breakdown": {
                    "hook3s": f"{cl['title']} 컬러 무빙 하이라이트",
                    "framing": f"무여백 크롭({cl['width']}x{cl['height']}) · 주조색 {cl['palette'][0]}",
                    "marketingApply": "시네마·TVCF 구도와 색채 레퍼런스 보드 즉시 활용",
                },
                "addedAt": today_str,
                "harvestedAt": now_iso,
                "shard": shard,
                "status": "active",
                "bytes": cl["bytes"],
                "sourceKey": cl["source_key"],
            }
            new_items.append(item_doc)

        # Ensure releases exist & upload media shards
        ensure_release_exists(repo, META_TAG, root_commit)
        for shard, file_list in uploads_by_shard.items():
            ensure_release_exists(repo, shard, root_commit)
            print(
                f"[UPLOAD] Pushing {len(file_list)} files ({len(file_list) // 2} clips) to {shard}...",
                flush=True,
            )
            upload_files_chunked(repo, shard, file_list, chunk_size=30)

        # Merge catalog, rotate active 600 wall, enforce 8.5 GB perpetual LRU ceiling
        merged_catalog = catalog + new_items
        active_wall, merged_catalog = rotate_active_wall(merged_catalog)
        merged_catalog = enforce_storage_cap(repo, merged_catalog)
        active_wall, merged_catalog = rotate_active_wall(merged_catalog)

        wall_path = work_dir / "wall-active.json"
        full_path = work_dir / "catalog-full.json"
        total_bytes = sum(int(x.get("bytes") or 0) for x in merged_catalog)

        wall_path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "updatedAt": now_iso,
                    "activeCount": len(active_wall),
                    "items": active_wall,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            "utf-8",
        )
        full_path.write_text(
            json.dumps(
                {
                    "version": 1,
                    "updatedAt": now_iso,
                    "totalCount": len(merged_catalog),
                    "totalBytes": total_bytes,
                    "items": merged_catalog,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            "utf-8",
        )
        upload_files_chunked(repo, META_TAG, [wall_path, full_path], chunk_size=2)

    elapsed = time.time() - start_ts
    print(
        f"\n=== DAWN HARVEST COMPLETE === Added={len(new_items)} | ActiveWall={len(active_wall)} | FullCatalog={len(merged_catalog)} | TotalStorage={total_bytes / (1024 * 1024):.2f}MB | Elapsed={elapsed:.1f}s",
        flush=True,
    )


if __name__ == "__main__":
    main()
