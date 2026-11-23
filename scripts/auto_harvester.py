#!/usr/bin/env python3
"""
KINOFRAME Autonomous Dawn Harvester (Two-Track 1080p HD Cinema & Vintage CF Restoration Engine)
- Designed to run twice daily on GitHub Actions (02:17 & 04:43 KST) using built-in GITHUB_TOKEN.
- Never commits binaries or JSON to `main` (zero Vercel rebuild triggers).
- Strict Safety & Quality Architecture:
    1) Hard NSFW / adult / porn / cartoon / compilation / gameplay / broadcast-news blocklist.
    2) Zero-distortion 5-point symmetric `cropdetect` guardrail:
       * Normalizes SAR first (`scale='trunc(iw*sar/2)*2:trunc(ih/2)*2',setsar=1`).
       * Samples 5 distributed points across source and takes the median crop rectangle.
       * Applies crop ONLY when margins are symmetric AND resulting aspect ratio is in 1.30..2.45
         (and >= 1.66 for post-1995 cinema). Rejects portrait/vertical videos (< 1.25).
    3) Two-Track Era & Resolution Encoding:
       * Track A (Modern Cinema & TVCF, year >= 2002 OR CLASSIC_FILM):
         Requires source height >= 720p (1080p preferred), encodes up to 1920px with
         `-crf 18 -preset fast -tune film -pix_fmt yuv420p -movflags +faststart` (`isArchivalSd: false`).
       * Track B (Vintage TVCF, year <= 2001):
         Allows SD sources, restores with `hqdn3d=1.5:1.5:3:3,scale=960:-2:flags=lanczos,cas=0.3`
         and `-crf 18` (`isArchivalSd: true`).
    4) 4-Pillar Cinematic/Photographic Hook Scoring (excluding first 18% & last 15% credits):
       * Pillar 1: Subject-background sharpness separation (center focus vs periphery bokeh/DoF).
       * Pillar 2: Lighting & color contrast (P85 bright-pixel saturation + chiaroscuro/neon/golden-hour tonal spread).
       * Pillar 3: Uncut stability (`scdet=threshold=12`: 0 cuts for Cinema, <= 1 cut for TVCF).
       * Pillar 4: Zero corner watermarks, zero burned-in subtitles, zero flat title cards / talking heads.
       * Selects ONLY the highest-scoring highlight window per candidate.
    5) Wikidata public API (`ko|en`) multilingual alias enrichment for instant cross-language search.
    6) Perpetual Sharded Storage:
       * Media shards `kinoframe-media-s01` .. `kinoframe-media-s20` (max 450 clips / 900 files per shard).
       * `kinoframe-meta/wall-active.json`: max 600 active clips (60% Cinema : 40% TVCF balanced).
       * `kinoframe-meta/catalog-full.json`: cumulative archive within 8.5 GB hard ceiling (~3,500 HD clips LRU rotation).
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
import statistics
import subprocess
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from PIL import Image, ImageFilter

DEFAULT_REPO = "rlawlstjr346-collab/kinoframe"
META_TAG = "kinoframe-meta"
MAX_CLIPS_PER_SHARD = 450
MAX_SHARDS = 20
ACTIVE_WALL_CAP = 600
CATALOG_MAX_ITEMS = 10_000
STORAGE_CAP_BYTES = int(8.5 * 1024 * 1024 * 1024)  # 8.5 GB hard ceiling

BLOCKED_TITLE_RE = re.compile(
    r"(newsreel|afvn|vietnam|military|army|navy|air\s*force|war\s*dept|us\s*gov|"
    r"government|museum|national\s*air|space\s*museum|semiconductor|circuit|microchip|"
    r"gremlin|tape\s*archive|rom\s*dump|hardware|computer\s*chronicles|black\s*and\s*white|"
    r"b&w|monochrome|lecture|university|educational|classroom|instructional|training\s*film|"
    r"safety\s*film|psa|public\s*service|sermon|speech|seminar|religious|church|bible|gospel|"
    r"choir|sing[\s-]*along|karaoke|disney\s*sing|christmas\s*songs|webinar|podcast|interview|"
    r"slideshow|powerpoint|audiobook|gameplay|minecraft|nintendo\s*switch|playstation|xbox|"
    r"cartoon|animation|animated|anime|pixar|popeye|tfa-319b|lucky\s*strike|silent\s*film|"
    r"home\s*movie|amateur|family\s*reel|infomercial|home\s*shopping|teleshopping|qvc|"
    r"photo\s*album|tv\s*series|complete\s*series|episode|sitcom|soap\s*opera|game\s*show|"
    r"talk\s*show|newscast|broadcast\s*news|radio\s*station|tv\s*station|weather|c-span|"
    r"congress|hearing|lyrics|reaction|review|explained|unboxing|trailer\s*reaction|"
    r"vhs\s*variant|tape\s*transfer|opening\s*credits|compilation|commercial\s*collection|"
    r"toy\s*commercial|fast\s*food\s*chain|"
    # Strict NSFW / Adult / Exploitation blocklist
    r"porn|xxx|nsfw|erotic|erotica|hentai|femdom|bdsm|fetish|humillaci|humiliation|"
    r"joi\b|cei\b|pene\b|penis|vagina|nude|nudity|naked|stripper|playboy|penthouse|"
    r"sex\s*tape|adult\s*film|softcore|hardcore|onlyfans|camgirl|virgin\s*witch|exploitation)",
    re.I,
)

BLOCKED_IA_COLLECTIONS = {
    "newsandpublicaffairs",
    "fedflix",
    "us_government",
    "opensource_audio",
    "software",
    "education",
    "television_news",
    "tvnews",
    "cartoons",
    "animationandcartoons",
    "home_movies",
    "spiritualityandreligion",
    "vhs_vault",
    "computerchronicles",
    "video_games",
    "classic_cartoons",
    "adult",
    "erotica",
    "pornography",
    "nsfw",
}

IA_CINEMA_QUERIES = [
    'mediatype:movies AND collection:(feature_films OR short_films OR independent_film) AND (technicolor OR eastmancolor OR color) AND year:[1965 TO 2024] NOT (newsreel OR military OR cartoon OR lecture OR church OR museum OR series OR episode OR adult OR erotic OR compilation)',
    'mediatype:movies AND collection:(feature_films OR short_films) AND (cinematography OR drama OR thriller OR noir OR sci-fi) AND color AND year:[1975 TO 2024] NOT (newsreel OR cartoon OR lecture OR documentary OR museum OR adult OR erotic OR compilation)',
    'mediatype:movies AND ("short film" OR "independent film" OR "cinematography") AND (1080p OR 720p OR HD) AND color AND year:[1990 TO 2024] NOT (review OR interview OR podcast OR lecture OR cartoon OR animation OR adult OR gameplay)',
]

IA_TVCF_QUERIES = [
    'mediatype:movies AND collection:(classic_tv_commercials OR commercials) AND color AND year:[1970 TO 2001] NOT (newsreel OR infomercial OR cartoon OR sing-along OR military OR museum OR psa OR lecture OR compilation OR collection OR toy)',
    'mediatype:movies AND ("brand film" OR "fashion film" OR "commercial spot" OR "director reel") AND (1080p OR 720p OR HD) AND color AND year:[2002 TO 2024] NOT (interview OR podcast OR lecture OR museum OR cartoon OR compilation OR gameplay)',
]

YT_OPPORTUNISTIC_QUERIES = [
    ("CLASSIC_FILM", "ytsearch3:classic cinema cinematography scene 1080p"),
    ("TVCF", "ytsearch3:award winning commercial director film 1080p"),
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
            "User-Agent": "KinoframeDawnHarvester/2.0 (https://kinoframe.vercel.app)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def fetch_wikidata_aliases(title: str, creator: str = "") -> list[str]:
    """Enrich clip with official Korean & English Wikidata labels/aliases."""
    aliases: set[str] = set()
    queries = [q for q in (title.strip(), creator.strip()) if q and len(q) >= 3 and q.lower() != "internet archive"]
    for q in queries[:2]:
        try:
            search_url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
                {
                    "action": "wbsearchentities",
                    "search": q[:64],
                    "language": "en",
                    "format": "json",
                    "limit": 1,
                }
            )
            data = http_get_json(search_url, timeout=8)
            hits = data.get("search") or []
            if not hits:
                continue
            qid = hits[0].get("id")
            if not qid:
                continue
            ent_url = "https://www.wikidata.org/w/api.php?" + urllib.parse.urlencode(
                {
                    "action": "wbgetentities",
                    "ids": qid,
                    "props": "labels|aliases",
                    "languages": "ko|en",
                    "format": "json",
                }
            )
            ent = (http_get_json(ent_url, timeout=8).get("entities") or {}).get(qid) or {}
            for lang in ("ko", "en"):
                lbl = (ent.get("labels") or {}).get(lang, {}).get("value")
                if lbl and len(lbl) <= 48:
                    aliases.add(lbl.strip())
                for al in (ent.get("aliases") or {}).get(lang, [])[:3]:
                    val = al.get("value")
                    if val and len(val) <= 44:
                        aliases.add(val.strip())
        except Exception:
            continue
    return sorted(aliases)[:10]


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


def has_text_subtitle_or_tv_bug(im: Image.Image) -> bool:
    """Reject burned-in subtitles, opening credit names, title cards, and all 4-corner watermarks."""
    g = im.convert("L").resize((160, 90), Image.Resampling.BILINEAR)
    px = g.load()

    # 1) Bottom subtitle / karaoke text band (y: 78%..96%)
    sub_rows = 0
    sub_bright = 0
    for y in range(70, 86):
        edges = 0
        for x in range(20, 140):
            v = px[x, y]
            if v > 212:
                sub_bright += 1
            if abs(v - px[x - 1, y]) > 72:
                edges += 1
        if edges >= 13:
            sub_rows += 1
    if sub_rows >= 4 and sub_bright >= 40:
        return True

    # 2) Center opening credit / station logo / title card text band
    center_rows = 0
    center_bright = 0
    center_dark = 0
    for y in range(24, 66):
        edges = 0
        for x in range(28, 132):
            v = px[x, y]
            if v > 218:
                center_bright += 1
            elif v < 45:
                center_dark += 1
            if abs(v - px[x - 1, y]) > 82:
                edges += 1
        if edges >= 15:
            center_rows += 1
    if center_rows >= 6 and center_bright >= 75 and center_dark >= 400:
        return True

    # 3) All 4 corners watermark/channel bug scan (CulturePub.fr, Movieclips, TV station bugs)
    corner_boxes = [
        (126, 156, 3, 16),   # top-right
        (4, 34, 3, 16),      # top-left
        (126, 156, 74, 87),  # bottom-right
        (4, 34, 74, 87),     # bottom-left
    ]
    for x0, x1, y0, y1 in corner_boxes:
        bug_bright = 0
        bug_edges = 0
        for y in range(y0, y1):
            for x in range(x0, x1):
                v = px[x, y]
                if v > 210:
                    bug_bright += 1
                if abs(v - px[x - 1, y]) > 84:
                    bug_edges += 1
        if 12 <= bug_bright <= 165 and bug_edges >= 15:
            return True

    return False


def score_aesthetic_frame(png_bytes: bytes) -> tuple[float, str]:
    """
    4-Pillar Photographic/Cinematic Hook Frame Scorer:
    1) Subject-background sharpness separation (shallow DoF / focal clarity)
    2) Lighting & color contrast (P85 bright-pixel saturation + chiaroscuro/neon/golden-hour tonal spread)
    3) Anti-blackout / anti-washout / anti-flat-talking-head filter
    4) Zero subtitles, zero title cards, zero 4-corner watermarks
    """
    try:
        im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    except Exception:
        return -1.0, "decode_err"

    if has_text_subtitle_or_tv_bug(im):
        return -1.0, "text_subtitle_or_watermark"

    w, h = im.size
    crop = im.crop((int(w * 0.08), int(h * 0.10), int(w * 0.92), int(h * 0.90)))
    small = crop.resize((120, 68), Image.Resampling.BILINEAR)
    pixels = get_pixels(small)
    total = len(pixels)

    near_black = 0
    near_white = 0
    lums = []
    bright_sats = []
    chromas = []
    buckets = {}

    for r, g, b in pixels:
        mx = max(r, g, b)
        mn = min(r, g, b)
        lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        lums.append(lum)
        if mx < 22:
            near_black += 1
        if mn > 236:
            near_white += 1
        bkey = (r >> 4, g >> 4, b >> 4)
        buckets[bkey] = buckets.get(bkey, 0) + 1
        _, sv, vv = rgb_to_hsv(r, g, b)
        if vv > 0.14:
            bright_sats.append(sv)
            chromas.append((mx - mn) / 255.0)

    mean_lum = sum(lums) / total
    lum_std = math.sqrt(sum((x - mean_lum) ** 2 for x in lums) / total)
    max_bucket_ratio = max(buckets.values()) / total

    if near_black / total > 0.58 or mean_lum < 24:
        return -1.0, "too_dark"
    if near_white / total > 0.45 or mean_lum > 224:
        return -1.0, "too_white"
    if max_bucket_ratio > 0.42:
        return -1.0, "flat_text_or_logo_card"
    if lum_std < 23.0:
        return -1.0, "low_contrast"
    if not bright_sats:
        return -1.0, "no_bright_pixels"

    # Pillar 2: P85 bright-pixel saturation (supports moody chiaroscuro/neon without requiring whole frame bright)
    bright_sats.sort()
    p85_sat = bright_sats[int(len(bright_sats) * 0.85)]
    avg_chroma = sum(chromas) / max(1, len(chromas))
    if p85_sat < 0.26 or avg_chroma < 0.105:
        return -1.0, "monochrome_sepia_or_low_color"

    # Pillar 1: Subject-background sharpness separation (center focus vs background softness)
    gray = crop.convert("L").resize((120, 68), Image.Resampling.BILINEAR)
    edge_im = gray.filter(ImageFilter.FIND_EDGES)
    epx = edge_im.load()
    center_edges = []
    border_edges = []
    for y in range(4, 64):
        for x in range(4, 116):
            val = epx[x, y]
            if 30 <= x <= 90 and 15 <= y <= 53:
                center_edges.append(val)
            else:
                border_edges.append(val)

    c_sharp = sum(center_edges) / max(1, len(center_edges))
    b_sharp = sum(border_edges) / max(1, len(border_edges))
    if c_sharp < 9.0:
        return -1.0, "blurry_or_out_of_focus"
    dof_separation = min(2.4, c_sharp / max(6.0, b_sharp))

    # Combined photographic/cinematic hook score
    score = p85_sat * 2.1 + avg_chroma * 2.2 + min(lum_std, 82.0) / 85.0 + dof_separation * 0.95
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


def probe_stream_dims(media_path: str | Path) -> tuple[int, int, float]:
    """Return (width, height, sar_float) for video stream 0."""
    p = run_cmd(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,sample_aspect_ratio",
            "-of",
            "json",
            str(media_path),
        ],
        timeout=12,
    )
    if p.returncode != 0:
        return 0, 0, 1.0
    try:
        st = json.loads(p.stdout)["streams"][0]
        w, h = int(st.get("width") or 0), int(st.get("height") or 0)
        sar_raw = str(st.get("sample_aspect_ratio") or "1:1")
        if ":" in sar_raw:
            n, d = sar_raw.split(":")
            sar = float(n) / max(1.0, float(d)) if float(n) > 0 and float(d) > 0 else 1.0
        else:
            sar = 1.0
        return w, h, sar
    except Exception:
        return 0, 0, 1.0


def detect_safe_median_crop(
    stream_url: str,
    dur: float,
    orig_w: int,
    orig_h: int,
    sar: float,
    year: int,
    is_film: bool,
) -> str | None:
    """
    Zero-distortion 5-point median cropdetect guardrail:
    - Normalizes SAR first (`scale='trunc(iw*sar/2)*2:trunc(ih/2)*2',setsar=1`).
    - Samples 5 distributed timestamps across the video to avoid night-scene false crops.
    - Requires symmetric margins (left~=right, top~=bottom) and valid output aspect ratio
      (1.30..2.45; >= 1.66 for post-1995 cinema).
    """
    norm_w = int(round(orig_w * sar)) & ~1
    norm_h = orig_h & ~1
    if norm_w < 320 or norm_h < 240 or dur < 10.0:
        return None

    sample_pts = [dur * f for f in (0.18, 0.34, 0.50, 0.66, 0.82)]
    cws, chs, cxs, cys = [], [], [], []
    for t in sample_pts:
        p = run_cmd(
            [
                "ffmpeg",
                "-hide_banner",
                "-ss",
                f"{t:.2f}",
                "-i",
                stream_url,
                "-t",
                "0.7",
                "-vf",
                "scale='trunc(iw*sar/2)*2:trunc(ih/2)*2',setsar=1,cropdetect=24:2:0",
                "-f",
                "null",
                "-",
            ],
            timeout=20,
        )
        matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", p.stderr)
        if matches:
            cw, ch, cx, cy = map(int, matches[-1])
            cws.append(cw)
            chs.append(ch)
            cxs.append(cx)
            cys.append(cy)

    if len(cws) < 3:
        return None

    cw = int(statistics.median(cws)) & ~1
    ch = int(statistics.median(chs)) & ~1
    cx = int(statistics.median(cxs))
    cy = int(statistics.median(cys))

    # Enforce horizontal & vertical margin symmetry (blocks dark night-scene side over-crops)
    left_m, right_m = cx, max(0, norm_w - (cx + cw))
    top_m, bot_m = cy, max(0, norm_h - (cy + ch))
    if abs(left_m - right_m) > max(18, norm_w * 0.03):
        cw, cx = norm_w, 0
    if abs(top_m - bot_m) > max(18, norm_h * 0.03):
        ch, cy = norm_h, 0

    if cw >= norm_w - 8 and ch >= norm_h - 8:
        return None
    if cw < norm_w * 0.62 or ch < norm_h * 0.52:
        return None

    res_ratio = cw / max(1, ch)
    min_ar = 1.66 if (is_film and year >= 1995) else 1.30
    if not (min_ar <= res_ratio <= 2.45):
        return None

    return f"crop={cw}:{ch}:{cx}:{cy}"


def score_raw_segment(raw_mp4: Path, clip_dur: float) -> tuple[float, str]:
    scores = []
    for st in (0.5, clip_dur * 0.5, max(1.0, clip_dur - 0.5)):
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
        sc, reason = score_aesthetic_frame(res.stdout)
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
    """Fetch IA metadata and locate best direct H.264 MP4 stream matching two-track resolution policy."""
    ident = item["source_id"]
    try:
        meta = http_get_json(f"https://archive.org/metadata/{urllib.parse.quote(ident)}", timeout=12)
    except Exception:
        return None
    meta_obj = meta.get("metadata") or {}
    colls = meta_obj.get("collection") or []
    if isinstance(colls, str):
        colls = [colls]
    if any(str(c).lower() in BLOCKED_IA_COLLECTIONS for c in colls):
        return None
    subj_text = f"{meta_obj.get('subject') or ''} {meta_obj.get('description') or ''} {meta_obj.get('title') or ''}"
    if BLOCKED_TITLE_RE.search(subj_text[:800]):
        return None

    is_vintage_tvcf = item["category"] == "TVCF" and int(item.get("year") or 2000) <= 2001
    min_height = 360 if is_vintage_tvcf else 720

    files = meta.get("files") or []
    mp4_candidates = []
    for f in files:
        name = str(f.get("name") or "")
        if not name.lower().endswith(".mp4"):
            continue
        size = int(f.get("size") or 0)
        if size < (2_000_000 if is_vintage_tvcf else 4_500_000):
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
        if dur < 20 or dur > 10800:
            continue
        h = int(f.get("height") or 0)
        w = int(f.get("width") or 0)
        if h < min_height:
            continue
        # Reject vertical / portrait videos outright (ratio < 1.25)
        if w > 0 and h > 0 and (w / h) < 1.25:
            continue
        # Prefer 1080p for modern cinema/TVCF
        hd_pref = 1 if 1000 <= h <= 1200 else 0
        rank = (hd_pref, h, 0 if "_512kb" in name else 1, size)
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
        "height": h or 720,
        "width": w or 1280,
    }


def discover_opportunistic_yt_vimeo(yt_blocked_event: threading.Event) -> list[dict]:
    """Fast opportunistic YouTube candidate discovery (strict 3s fail-fast on bot blocks)."""
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
                bw, bh = int(best.get("width") or 1280), int(best.get("height") or 720)
                if bw / max(1, bh) < 1.25:
                    continue
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
                        "height": bh,
                        "width": bw,
                    }
                )
    return results


def extract_clips_from_source(
    src: dict,
    work_dir: Path,
    existing_source_keys: set,
    lock: threading.Lock,
    deadline: float,
    max_cuts_per_source: int = 2,
) -> list[dict]:
    """
    Two-Track Aesthetic Hook Extractor:
    - Excludes first 18% & last 15% credits.
    - Evaluates multiple candidate windows with 4-pillar aesthetic scoring + scdet.
    - Keeps ONLY the highest-scoring highlight window(s), discarding ordinary dialogue shots.
    """
    if time.time() >= deadline:
        return []

    if src["origin"] == "ia":
        resolved = resolve_ia_stream(src)
        if not resolved:
            return []
        src = resolved

    is_film = src["category"] == "CLASSIC_FILM"
    year = int(src.get("year") or 2000)
    is_vintage_sd = (not is_film) and year <= 2001 and int(src.get("height") or 0) < 720
    clip_dur = 5.0 if is_film else 4.5
    max_cuts_allowed = 0 if is_film else 1
    dur = float(src["duration"])

    # Strictly forbid first 18% (opening credits/station IDs) and last 15% (end credits/logos)
    lo = max(18.0, dur * 0.18) if dur > 90 else max(5.0, dur * 0.18)
    hi = min(dur - 15.0, dur * 0.85 - clip_dur) if dur > 90 else min(dur - 5.0, dur * 0.85 - clip_dur)
    if hi <= lo + clip_dur:
        return []

    # Probe true SAR/dims & compute 5-point symmetric median crop ONCE per source
    pw, ph, sar = probe_stream_dims(src["stream_url"])
    orig_w = pw or int(src.get("width") or 1280)
    orig_h = ph or int(src.get("height") or 720)
    if orig_w < 320 or orig_h < 240:
        return []
    if (orig_w * sar) / max(1, orig_h) < 1.25:
        return []
    if (is_film or year >= 2002) and orig_h < 720:
        return []

    crop_filter = detect_safe_median_crop(
        src["stream_url"], dur, orig_w, orig_h, sar, year, is_film
    )

    # Evaluate 5 distributed candidate windows and keep only top-scoring hook cuts
    fracs = (0.10, 0.30, 0.50, 0.70, 0.88) if dur >= 120 else (0.15, 0.45, 0.75)
    timestamps = [lo + (hi - lo) * f for f in fracs]

    scored_candidates = []
    tid = threading.get_ident()

    for idx, start_t in enumerate(timestamps):
        if time.time() >= deadline:
            break
        if start_t + clip_dur >= dur - 2.0:
            continue

        bucket = int(start_t // 15)
        skey = f"{src['origin']}:{src['source_id']}:b{bucket}"
        with lock:
            if skey in existing_source_keys:
                continue

        raw_mp4 = work_dir / f"raw_{tid}_{idx}.mp4"
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
            if res.returncode != 0 or not raw_mp4.exists() or raw_mp4.stat().st_size < 16_000:
                raw_mp4.unlink(missing_ok=True)
                continue

            # 4-pillar aesthetic hook score (discard mundane / flat shots < 2.15)
            fscore, _ = score_raw_segment(raw_mp4, clip_dur)
            if fscore < 2.15:
                raw_mp4.unlink(missing_ok=True)
                continue

            cuts = count_scene_cuts(raw_mp4, clip_dur, threshold=12.0)
            if cuts > max_cuts_allowed:
                raw_mp4.unlink(missing_ok=True)
                continue

            scored_candidates.append((fscore, cuts, start_t, skey, raw_mp4))
        except Exception:
            raw_mp4.unlink(missing_ok=True)

    if not scored_candidates:
        return []

    # Sort best hook cuts first; discard lower-scoring raw files
    scored_candidates.sort(key=lambda x: x[0], reverse=True)
    winners = scored_candidates[:max_cuts_per_source]
    for _, _, _, _, loser_mp4 in scored_candidates[max_cuts_per_source:]:
        loser_mp4.unlink(missing_ok=True)

    # Fetch Wikidata ko|en aliases once per source
    wd_aliases = fetch_wikidata_aliases(src["title"], src.get("creator", ""))

    produced = []
    for fscore, cuts, start_t, skey, raw_mp4 in winners:
        out_mp4 = work_dir / f"out_{tid}_{int(time.time() * 1000)}_{len(produced)}.mp4"
        out_webp = out_mp4.with_suffix(".webp")
        try:
            vf_parts = ["scale='trunc(iw*sar/2)*2:trunc(ih/2)*2'", "setsar=1"]
            if crop_filter:
                vf_parts.append(crop_filter)

            if is_vintage_sd:
                # Track B: Vintage SD TVCF restoration (deblock + Lanczos 960px + subtle CAS sharpening)
                vf_parts.extend(["hqdn3d=1.5:1.5:3:3", "scale=960:-2:flags=lanczos", "cas=0.3"])
                crf_ladder = ("18", "20")
                tune_args: list[str] = []
                size_cap = 3_600_000
            else:
                # Track A: Modern 1080p HD Cinema / TVCF master (-crf 18 -preset fast -tune film)
                vf_parts.append("scale='min(1920,iw)':-2:flags=lanczos")
                crf_ladder = ("18", "20", "22")
                tune_args = ["-tune", "film"]
                size_cap = 4_800_000

            vf = ",".join(vf_parts)

            enc_ok = False
            for crf in crf_ladder:
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
                        *tune_args,
                        "-pix_fmt",
                        "yuv420p",
                        "-movflags",
                        "+faststart",
                        "-t",
                        f"{clip_dur:.2f}",
                        str(out_mp4),
                    ],
                    timeout=55,
                )
                if er.returncode == 0 and out_mp4.exists() and out_mp4.stat().st_size > 30_000:
                    enc_ok = True
                    if out_mp4.stat().st_size <= size_cap:
                        break
            if not enc_ok:
                continue

            # Mid-frame high-quality WebP + real 5-color HEX palette
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
                    "88",
                    str(out_webp),
                ],
                timeout=18,
            )
            if wr.returncode != 0 or not out_webp.exists():
                continue

            palette, aspect, cw, ch = extract_palette_and_aspect(out_webp)
            # Final aspect-ratio sanity guardrail
            final_ratio = cw / max(1, ch)
            if final_ratio < 1.25 or (is_film and year >= 1995 and final_ratio < 1.66):
                out_mp4.unlink(missing_ok=True)
                out_webp.unlink(missing_ok=True)
                continue

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
                    "year": year,
                    "creator": src["creator"],
                    "category": src["category"],
                    "source_url": src["source_url"],
                    "aspect": aspect,
                    "duration_sec": clip_dur,
                    "width": cw,
                    "height": ch,
                    "is_archival_sd": is_vintage_sd or (cw <= 1024 and final_ratio < 1.58),
                    "cuts": cuts,
                    "hook_score": round(fscore, 2),
                    "palette": palette,
                    "aliases": wd_aliases,
                    "bytes": out_mp4.stat().st_size + out_webp.stat().st_size,
                }
            )
        except Exception:
            continue
        finally:
            raw_mp4.unlink(missing_ok=True)

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
    ordered = sorted(
        catalog,
        key=lambda x: (
            1 if x.get("seedMasterpiece") else 0,
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
    total_bytes = sum(int(x.get("bytes") or 2_200_000) for x in catalog)
    if total_bytes <= STORAGE_CAP_BYTES and len(catalog) <= CATALOG_MAX_ITEMS:
        return catalog

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
        total_bytes -= int(victim.get("bytes") or 2_200_000)
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
        f"=== KINOFRAME TWO-TRACK DAWN HARVESTER START === repo={repo} target={target_count} max_min={args.max_minutes}",
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

    film_goal = max(1, round(target_count * 0.60))
    tvcf_goal = max(1, target_count - film_goal)

    ia_films = discover_ia_sources("CLASSIC_FILM", max_items=max(24, film_goal * 2))
    ia_tvcfs = discover_ia_sources("TVCF", max_items=max(16, tvcf_goal * 2))

    yt_blocked = threading.Event()
    opp_sources = discover_opportunistic_yt_vimeo(yt_blocked)

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
            cuts_limit = 2
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
                    track = "SD-RESTORE" if cl["is_archival_sd"] else "1080P-HD"
                    print(
                        f"  [HARVEST {len(harvested_raw)}/{target_count}] [{track}] {cl['category']} | {cl['width']}x{cl['height']} ({cl['aspect']}) | {cl['bytes'] // 1024}KB | hook={cl['hook_score']} cuts={cl['cuts']} | {cl['title'][:38]}",
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
                "width": cl["width"],
                "height": cl["height"],
                "isArchivalSd": cl["is_archival_sd"],
                "durationSec": cl["duration_sec"],
                "startSec": 0,
                "mediaSource": "archive_mp4",
                "thumbnailUrl": f"{base_dl}/{clip_id}.webp",
                "previewVideoUrl": f"{base_dl}/{clip_id}.mp4",
                "youtubeId": None,
                "sourceUrl": cl["source_url"],
                "licenseNote": f"Dawn Harvest ({cl['width']}x{cl['height']}, {cl['bytes'] // 1024}KB, hook={cl['hook_score']})",
                "compositionTags": COMPOSITION_POOL[idx % len(COMPOSITION_POOL)],
                "persuasionTags": PERSUASION_POOL[idx % len(PERSUASION_POOL)],
                "palette": cl["palette"],
                "aliases": cl.get("aliases") or [],
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
                    "framing": f"정비율 크롭({cl['width']}x{cl['height']}) · 주조색 {cl['palette'][0]}",
                    "marketingApply": "시네마·TVCF 구도와 색채 레퍼런스 즉시 활용",
                },
                "addedAt": today_str,
                "harvestedAt": now_iso,
                "shard": shard,
                "status": "active",
                "bytes": cl["bytes"],
                "sourceKey": cl["source_key"],
            }
            new_items.append(item_doc)

        ensure_release_exists(repo, META_TAG, root_commit)
        for shard, file_list in uploads_by_shard.items():
            ensure_release_exists(repo, shard, root_commit)
            print(
                f"[UPLOAD] Pushing {len(file_list)} files ({len(file_list) // 2} clips) to {shard}...",
                flush=True,
            )
            upload_files_chunked(repo, shard, file_list, chunk_size=30)

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
        f"=== DAWN HARVEST COMPLETE === added={len(new_items)} active={len(active_wall)} total={len(merged_catalog)} storage={total_bytes / (1024 * 1024):.1f}MB in {elapsed:.1f}s",
        flush=True,
    )


if __name__ == "__main__":
    main()
