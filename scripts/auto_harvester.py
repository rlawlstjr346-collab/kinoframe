#!/usr/bin/env python3
"""
KINOFRAME Autonomous Dawn Harvester v3 (Pro Cinema & Commercial Multi-Pipeline Engine)
- Designed to run twice daily on GitHub Actions (02:17 & 04:43 KST) using built-in GITHUB_TOKEN.
- Never commits binaries or JSON to `main` (zero Vercel rebuild triggers).
- Pro-Only Multi-Pipeline Architecture (Zero Amateur / Zero opensource_movies):
    1) Primary Pro Pipeline — Vimeo Curated Channels & Global Top Production Houses:
       * Staff Picks, Short of the Week, Best Short Films, NOWNESS, MUBI, Directors Notes,
         Booooooom, Cooke Optics, Leica Camera, RED Digital Cinema, Vimeo Commercials,
         Branded Content, Fashion Films, Car Commercials, CANADA, Caviar, DIVISION,
         Riff Raff Films, Pulse Films, Stink, Super Prime, Somesuch, PRETTYBIRD, RSA.
       * Discovers via public Vimeo v2 JSON API (no auth, cloud-IP resilient) and extracts
         1080p/720p streams via `yt-dlp` (`player.vimeo.com/video/<id>` with Referer).
    2) Strict Whitelist Classic Cinema & Vintage Brand TVCF Pipeline (Internet Archive):
       * ONLY explicitly whitelisted `feature_films` (color feature films) and
         `classic_tv_commercials` (1970-2001 official commercial spots).
       * Hard-blocks `opensource_movies`, `community_media`, `home_movies`, war/newsreels,
         personal handles (`@`), monochrome/B&W, cartoons/animation, reels/BTS/interviews.
    3) Expanded Vision Guardrail:
       * Single-frame 4-corner watermark, subtitle band, center title-card, AND inner
         bottom/bottom-left/bottom-right margin (`5%~22%` handle text zone, e.g. `@jcn`)
         temporal static high-contrast edge detector across 3 sampled frames.
       * Strict color saturation & chroma floor (blocks monochrome/B&W/sepia).
       * Zero-distortion SAR normalization & symmetric cropdetect (1.30..2.45 AR).
    4) Perpetual Storage & Fresh-First Main Wall:
       * `protectedSeed: true` (and `seedMasterpiece: true`) ONLY prevents eviction under 8.5GB cap.
       * `wall-active.json` (max 600 clips, 60% Cinema : 40% TVCF) prioritizes newest `createdAt`
         harvested clips first so the live wall refreshes automatically every day.
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
from PIL import Image, ImageDraw, ImageFilter

try:
    import numpy as np  # type: ignore
except Exception:
    np = None

from kf_media_analysis import analyze_clip, bar_crop_filter

REJECTED_SOURCES_ASSET = "rejected-sources.json"
REJECTED_SOURCE_TTL_DAYS = 30
REJECT_COUNTS: Counter = Counter()
_REJECT_LOCK = threading.Lock()


def _reject(reason: str, holder: dict | None = None) -> list:
    """Counts why a source produced no clip (printed at the end of the run) and returns []."""
    with _REJECT_LOCK:
        REJECT_COUNTS[reason] += 1
    if holder is not None:
        holder["reason"] = reason
    return []

DEFAULT_REPO = "rlawlstjr346-collab/kinoframe"
META_TAG = "kinoframe-meta"
MAX_CLIPS_PER_SHARD = 450
MAX_SHARDS = 20
ACTIVE_WALL_CAP = 600
CATALOG_MAX_ITEMS = 10_000
STORAGE_CAP_BYTES = int(8.5 * 1024 * 1024 * 1024)  # 8.5 GB hard ceiling

# Hard blocklist: amateur handles, home movies, war/ruins, newsreels, animation, BTS, tutorials, demos, NSFW
BLOCKED_TITLE_RE = re.compile(
    r"(^|\s)@[a-z0-9_.-]+|"
    r"(newsreel|afvn|vietnam|military|army|navy|air\s*force|war\s*dept|us\s*gov|\bwar\b|ruins|wreck|titanic|"
    r"government|museum|national\s*air|space\s*museum|semiconductor|circuit|microchip|"
    r"gremlin|tape\s*archive|rom\s*dump|hardware|computer\s*chronicles|black\s*and\s*white|"
    r"\bb&w\b|monochrome|lecture|university|educational|classroom|instructional|training\s*film|"
    r"safety\s*film|\bpsa\b|public\s*service|sermon|speech|seminar|religious|church|bible|gospel|"
    r"choir|sing[\s-]*along|karaoke|disney\s*sing|christmas\s*songs|webinar|podcast|interview|"
    r"slideshow|powerpoint|audiobook|gameplay|minecraft|nintendo\s*switch|playstation|xbox|"
    r"cartoon|animation|animated|anime|pixar|popeye|motion\s*graphics|3d\s*animation|2d\s*animation|\bcgi\b|"
    r"stop[\s-]*motion|claymation|hand[\s-]*drawn|illustrati|puppet|blender|cinema\s*4d|\bc4d\b|after\s*effects|"
    r"vfx\s*breakdown|breakdown|showreel|director'?s?\s*reel|\breel\b|"
    r"behind\s*the\s*scenes|\bbts\b|making\s*of|camera\s*test|lens\s*test|footage\s*test|\btest\b|"
    r"hall\s*of\s*fame|shop\s*mode|projector|product\s*demo|film\s*transfer|hd\s*transfer|sample\s*clip|"
    r"op[\s-]*docs|new\s*yorker|nytimes|"
    r"tutorial|masterclass|q&a|panel|talk\s*with|in\s*conversation|commentary|essay|video\s*essay|"
    r"silent\s*film|home\s*movie|amateur|family\s*reel|\bfamily\b|infomercial|home\s*shopping|"
    r"teleshopping|\bqvc\b|photo\s*album|tv\s*series|complete\s*series|episode|sitcom|soap\s*opera|"
    r"game\s*show|talk\s*show|newscast|broadcast\s*news|radio\s*station|tv\s*station|weather|c-span|"
    r"congress|hearing|lyrics|reaction|review|explained|unboxing|trailer\s*reaction|"
    r"vhs\s*variant|tape\s*transfer|opening\s*credits|compilation|commercial\s*collection|"
    r"excel|spreadsheet|screen\s*record|screencast|timelapse|time[\s-]*lapse|drone\s*reel|"
    r"joan\s*capdevila|els\s*infants|el\s*creuer|remix,\s*the\s*original|ghosts\s*of\s*the\s*abyss|"
    r"simpsons|coco\s*pops|rockin'?\s*eve|opening\s*&\s*ending|full\s*broadcast|commercials\s*from|wb17|wedding|bodas|"
    r"oprah|pokemon|nba\b|finals\b|disney\s*channel|retard|fuck|"
    # Strict NSFW / Adult / Exploitation blocklist
    r"porn|xxx|nsfw|erotic|erotica|hentai|femdom|bdsm|fetish|humillaci|humiliation|"
    r"joi\b|cei\b|pene\b|penis|vagina|nude|nudity|naked|stripper|playboy|penthouse|"
    r"sex\s*tape|adult\s*film|softcore|hardcore|onlyfans|camgirl|virgin\s*witch|exploitation)",
    re.I,
)

# Verified Live-Action Pro Vimeo Curated Channels & Global Top Production Houses (Vimeo v2 public JSON API)
VIMEO_PRO_FEEDS: list[tuple[str, str, int]] = [
    # (category, v2_api_slug, max_pages)
    # Cinema / Short Film / Live-Action Narrative
    ("CLASSIC_FILM", "channel/staffpicks", 3),
    ("CLASSIC_FILM", "channel/bestoftheyear", 3),
    ("CLASSIC_FILM", "channel/drama", 3),
    ("CLASSIC_FILM", "channel/scifi", 3),
    ("CLASSIC_FILM", "channel/premieres", 3),
    ("CLASSIC_FILM", "channel/shortfilms", 3),
    ("CLASSIC_FILM", "channel/shortoftheweek", 3),
    ("CLASSIC_FILM", "shortoftheweek", 2),
    ("CLASSIC_FILM", "channel/bestshortfilms", 3),
    ("CLASSIC_FILM", "channel/comedy", 2),
    ("CLASSIC_FILM", "channel/travel", 2),
    ("CLASSIC_FILM", "nowness", 3),
    ("CLASSIC_FILM", "mubi", 2),
    ("CLASSIC_FILM", "directorsnotes", 2),
    ("CLASSIC_FILM", "booooooom", 2),
    ("CLASSIC_FILM", "channel/narrative", 1),
    ("CLASSIC_FILM", "channel/kodak", 1),
    ("CLASSIC_FILM", "filmshortage", 1),
    ("CLASSIC_FILM", "channel/directors", 1),
    ("CLASSIC_FILM", "channel/hdvideos", 2),
    ("CLASSIC_FILM", "channel/architecture", 2),
    ("CLASSIC_FILM", "channel/noir", 2),
    ("CLASSIC_FILM", "channel/filmfestival", 2),
    ("CLASSIC_FILM", "channel/skate", 2),
    ("CLASSIC_FILM", "channel/ski", 2),
    ("CLASSIC_FILM", "channel/snowboard", 2),
    ("CLASSIC_FILM", "channel/surf", 1),
    ("CLASSIC_FILM", "channel/action", 1),
    # Global Top Commercial Production Houses, Color Studios & Branded Film Channels
    ("TVCF", "company3", 2),
    ("TVCF", "outsiders", 1),
    ("TVCF", "blacksheep", 1),
    ("TVCF", "nexusstudios", 2),
    ("TVCF", "psyop", 2),
    ("TVCF", "moonlightfilms", 1),
    ("CLASSIC_FILM", "channel/colorgrading", 2),
    ("TVCF", "electrictheatre", 3),
    ("TVCF", "goodoil", 3),
    ("TVCF", "finchcompany", 3),
    ("TVCF", "workeditorial", 3),
    ("TVCF", "academy", 2),
    ("TVCF", "artjail", 3),
    ("TVCF", "curiousfilm", 3),
    ("TVCF", "spindle", 2),
    ("TVCF", "timebasedarts", 2),
    ("TVCF", "glassworks", 2),
    ("TVCF", "sonny", 1),
    ("TVCF", "channel/commercials", 3),
    ("TVCF", "channel/brandedcontent", 3),
    ("TVCF", "channel/fashion", 3),
    ("TVCF", "channel/fashionfilms", 3),
    ("TVCF", "channel/carcommercials", 3),
    ("TVCF", "channel/commercial", 2),
    ("TVCF", "canadacanada", 3),
    ("TVCF", "caviarcontent", 3),
    ("TVCF", "friendlondon", 3),
    ("TVCF", "knucklehead", 3),
    ("TVCF", "rattlingstick", 3),
    ("TVCF", "motherlondon", 2),
    ("TVCF", "roguefilms", 2),
    ("TVCF", "division", 2),
    ("TVCF", "riffrafffilms", 2),
    ("TVCF", "bullion", 2),
    ("TVCF", "pulsefilms", 2),
    ("TVCF", "newland", 1),
    ("TVCF", "solab", 1),
    ("TVCF", "frenzyparis", 1),
    ("TVCF", "lief", 1),
    ("TVCF", "forsmanbodenfors", 1),
    ("TVCF", "stink", 1),
    ("TVCF", "superprime", 1),
    ("TVCF", "somesuch", 1),
    ("TVCF", "prettybird", 1),
    ("TVCF", "prettybirduk", 1),
    ("TVCF", "rsa", 1),
]

# Strict Whitelist-Only Internet Archive Collections (opensource_movies strictly forbidden)
ALLOWED_IA_FILM_COLLECTIONS = {"feature_films"}
ALLOWED_IA_TVCF_COLLECTIONS = {"classic_tv_commercials"}

BLOCKED_IA_COLLECTIONS = {
    "opensource_movies",
    "community_media",
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
    "prelinger",
    "stock_footage",
    "ephemera",
    "war",
}

IA_WHITELIST_CINEMA_QUERIES = [
    'mediatype:movies AND collection:feature_films AND (technicolor OR eastmancolor OR color) AND year:[1958 TO 2024] NOT collection:(opensource_movies OR home_movies OR newsandpublicaffairs OR fedflix OR cartoons) NOT (newsreel OR military OR war OR cartoon OR lecture OR church OR museum OR series OR episode OR adult OR erotic OR compilation OR amateur OR family)',
]

IA_WHITELIST_TVCF_QUERIES = [
    'mediatype:movies AND collection:classic_tv_commercials AND year:[1972 TO 2001] NOT collection:(opensource_movies OR home_movies OR newsandpublicaffairs OR cartoons) NOT (newsreel OR infomercial OR cartoon OR sing-along OR military OR war OR museum OR psa OR lecture OR compilation OR collection OR black OR monochrome OR amateur OR family)',
]


USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"


def run_cmd(cmd: list[str], timeout: int = 60) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def http_get_json(url: str, timeout: int = 15, extra_headers: dict | None = None):
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def fetch_wikidata_aliases(title: str, creator: str = "") -> list[str]:
    """Enrich clip with official Korean & English Wikidata labels/aliases."""
    aliases: set[str] = set()
    queries = [
        q
        for q in (title.strip(), creator.strip())
        if q and len(q) >= 3 and q.lower() not in ("internet archive", "vimeo")
    ]
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
            data = http_get_json(search_url, timeout=6)
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
            ent = (http_get_json(ent_url, timeout=6).get("entities") or {}).get(qid) or {}
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
    """
    Reject burned-in subtitles, opening credit names, title cards, all 4-corner watermarks,
    and inner bottom/bottom-left/bottom-right margin handle overlays (5%~22% from bottom edge).
    """
    g = im.convert("L").resize((160, 90), Image.Resampling.BILINEAR)
    px = g.load()

    # 1) Bottom subtitle / karaoke / handle text band (y: 74%..95%)
    sub_rows = 0
    sub_bright = 0
    for y in range(67, 86):
        edges = 0
        for x in range(12, 148):
            v = px[x, y]
            if v > 208:
                sub_bright += 1
            if abs(v - px[x - 1, y]) > 68:
                edges += 1
        if edges >= 10:
            sub_rows += 1
    if sub_rows >= 3 and sub_bright >= 24:
        return True

    # 2) Center opening credit / station logo / title card text band
    center_rows = 0
    center_bright = 0
    center_dark = 0
    for y in range(24, 66):
        edges = 0
        for x in range(24, 136):
            v = px[x, y]
            if v > 216:
                center_bright += 1
            elif v < 48:
                center_dark += 1
            if abs(v - px[x - 1, y]) > 80:
                edges += 1
        if edges >= 14:
            center_rows += 1
    if center_rows >= 6 and center_bright >= 70 and center_dark >= 360:
        return True

    # 3) All 4 corners + inner lower margin (5%~22% from edges, catches @jcn & channel handles)
    watermark_boxes = [
        (124, 156, 3, 18),    # top-right
        (4, 36, 3, 18),       # top-left
        (118, 156, 70, 86),   # bottom-right outer + inner (5%..22%)
        (4, 42, 70, 86),      # bottom-left outer + inner (5%..22%)
        (10, 52, 69, 85),     # inner bottom-left handle zone (@jcn position)
        (108, 150, 69, 85),   # inner bottom-right handle zone
    ]
    for x0, x1, y0, y1 in watermark_boxes:
        bug_bright = 0
        bug_edges = 0
        for y in range(y0, y1):
            for x in range(x0, x1):
                v = px[x, y]
                if v > 208:
                    bug_bright += 1
                if abs(v - px[x - 1, y]) > 82:
                    bug_edges += 1
        if 12 <= bug_bright <= 190 and bug_edges >= 15:
            return True

    return False


def has_static_temporal_watermark(images: list[Image.Image]) -> bool:
    """
    Temporal static high-contrast edge detector across 3 sampled frames (0.5s, mid, end-0.5s).
    Scans 4 corners AND bottom/bottom-left/bottom-right inner margins (5%~22% zone) for
    text/logo edges that remain temporally locked while the scene moves.
    """
    if len(images) < 3:
        return False

    W, H = 240, 135
    grays = [im.convert("L").resize((W, H), Image.Resampling.BILINEAR) for im in images[:3]]

    # First ensure the overall scene has at least minimal motion (so static landscapes aren't misflagged)
    if np is not None:
        arrs = [np.asarray(g, dtype=np.int16) for g in grays]
        a0, a1, a2 = arrs[0], arrs[1], arrs[2]
        center_motion = float(
            np.mean(np.abs(a0[25:105, 45:195] - a2[25:105, 45:195]))
        )
        if center_motion < 4.5:
            return False

        # Compute horizontal & vertical high-contrast edge masks for each frame
        edge_masks = []
        for a in arrs:
            gx = np.abs(a[:, 1:] - a[:, :-1])
            gy = np.abs(a[1:, :] - a[:-1, :])
            em = np.zeros_like(a, dtype=bool)
            em[:, 1:] |= gx > 56
            em[1:, :] |= gy > 56
            edge_masks.append(em)

        persistent_edges = edge_masks[0] & edge_masks[1] & edge_masks[2]
        temporal_diff = np.maximum(np.abs(a0 - a1), np.abs(a1 - a2))
        static_hi_contrast = persistent_edges & (temporal_diff <= 14)

        # Zones: 4 corners + bottom/bottom-left/bottom-right inner 5%~22% margin zones
        zones = [
            (int(W * 0.04), int(W * 0.36), int(H * 0.76), int(H * 0.95)),  # bottom-left inner (5%~24%)
            (int(W * 0.64), int(W * 0.96), int(H * 0.76), int(H * 0.95)),  # bottom-right inner (5%~24%)
            (int(W * 0.25), int(W * 0.75), int(H * 0.78), int(H * 0.95)),  # bottom-center inner (5%~22%)
            (int(W * 0.03), int(W * 0.28), int(H * 0.04), int(H * 0.20)),  # top-left
            (int(W * 0.72), int(W * 0.97), int(H * 0.04), int(H * 0.20)),  # top-right
        ]
        for x0, x1, y0, y1 in zones:
            z_static = static_hi_contrast[y0:y1, x0:x1]
            z_motion = float(np.mean(np.abs(a0[y0:y1, x0:x1] - a2[y0:y1, x0:x1])))
            cnt = int(np.sum(z_static))
            # If the zone itself has background motion (> 3.0) yet a crisp cluster of >= 28
            # temporally locked high-contrast edge pixels exists, it is a burned-in handle/logo.
            if cnt >= 28 and z_motion >= 3.0:
                # Check bright or stark-contrast overlay pixels among static edges
                z_vals = a1[y0:y1, x0:x1][z_static]
                bright_or_stark = int(np.sum((z_vals >= 185) | (z_vals <= 35)))
                if bright_or_stark >= 18:
                    return True
        return False

    # Pure-PIL fallback (when numpy is unavailable)
    pxs = [g.load() for g in grays]
    p0, p1, p2 = pxs[0], pxs[1], pxs[2]
    cm_sum = 0
    cm_cnt = 0
    for y in range(25, 105, 4):
        for x in range(45, 195, 4):
            cm_sum += abs(p0[x, y] - p2[x, y])
            cm_cnt += 1
    if cm_sum / max(1, cm_cnt) < 4.5:
        return False

    zones = [
        (int(W * 0.04), int(W * 0.36), int(H * 0.76), int(H * 0.95)),
        (int(W * 0.64), int(W * 0.96), int(H * 0.76), int(H * 0.95)),
        (int(W * 0.25), int(W * 0.75), int(H * 0.78), int(H * 0.95)),
        (int(W * 0.03), int(W * 0.28), int(H * 0.04), int(H * 0.20)),
        (int(W * 0.72), int(W * 0.97), int(H * 0.04), int(H * 0.20)),
    ]
    for x0, x1, y0, y1 in zones:
        static_cnt = 0
        stark_cnt = 0
        z_diff = 0
        z_n = 0
        for y in range(y0, y1):
            for x in range(x0, x1):
                v0, v1, v2 = p0[x, y], p1[x, y], p2[x, y]
                z_diff += abs(v0 - v2)
                z_n += 1
                if abs(v0 - v1) <= 14 and abs(v1 - v2) <= 14:
                    e0 = abs(v0 - p0[x - 1, y]) > 56 or abs(v0 - p0[x, y - 1]) > 56
                    e1 = abs(v1 - p1[x - 1, y]) > 56 or abs(v1 - p1[x, y - 1]) > 56
                    e2 = abs(v2 - p2[x - 1, y]) > 56 or abs(v2 - p2[x, y - 1]) > 56
                    if e0 and e1 and e2:
                        static_cnt += 1
                        if v1 >= 185 or v1 <= 35:
                            stark_cnt += 1
        if static_cnt >= 28 and stark_cnt >= 18 and (z_diff / max(1, z_n)) >= 3.0:
            return True
    return False


def score_aesthetic_image(im: Image.Image) -> tuple[float, str]:
    """
    4-Pillar Photographic/Cinematic Hook Frame Scorer:
    1) Subject-background sharpness separation (shallow DoF / focal clarity)
    2) Lighting & color contrast (P85 bright-pixel saturation + chiaroscuro/neon/golden-hour tonal spread)
    3) Anti-blackout / anti-washout / anti-monochrome / anti-sepia / anti-flat-card filter
    4) Zero subtitles, zero title cards, zero 4-corner & inner-margin watermarks
    """
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
    hue_bins: set[int] = set()
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
        hv, sv, vv = rgb_to_hsv(r, g, b)
        if vv > 0.14:
            bright_sats.append(sv)
            chromas.append((mx - mn) / 255.0)
            if sv > 0.18:
                hue_bins.add(int(hv // 30))

    mean_lum = sum(lums) / total
    lum_std = math.sqrt(sum((x - mean_lum) ** 2 for x in lums) / total)
    max_bucket_ratio = max(buckets.values()) / total

    if near_black / total > 0.56 or mean_lum < 26:
        return -1.0, "too_dark"
    if near_white / total > 0.42 or mean_lum > 222:
        return -1.0, "too_white"
    if max_bucket_ratio > 0.38:
        return -1.0, "flat_text_or_logo_card"
    if lum_std < 24.0:
        return -1.0, "low_contrast"
    if not bright_sats:
        return -1.0, "no_bright_pixels"

    # Pillar 2: Strict color gate (blocks B&W, silent monochrome, and single-tint sepia)
    bright_sats.sort()
    p85_sat = bright_sats[int(len(bright_sats) * 0.85)]
    avg_chroma = sum(chromas) / max(1, len(chromas))
    if p85_sat < 0.28 or avg_chroma < 0.115 or len(hue_bins) < 2:
        return -1.0, "monochrome_sepia_or_low_color"

    # Anti-2D-cartoon / flat-cel animation filter (real camera frames have natural film/sensor texture)
    rgb_px = small.load()
    flat_pairs = 0
    pair_total = 0
    for y in range(4, 64, 2):
        for x in range(4, 115, 2):
            r1, g1, b1 = rgb_px[x, y]
            r2, g2, b2 = rgb_px[x + 1, y]
            pair_total += 1
            if abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2) <= 3:
                flat_pairs += 1
    if flat_pairs / max(1, pair_total) > 0.66:
        return -1.0, "flat_cel_animation"

    # Pillar 1: Subject-background sharpness separation
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
    if c_sharp < 9.5:
        return -1.0, "blurry_or_out_of_focus"
    dof_separation = min(2.4, c_sharp / max(6.0, b_sharp))

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


def probe_stream_dims(media_path: str | Path, extra_input_args: list[str] | None = None) -> tuple[int, int, float]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        *(extra_input_args or []),
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,sample_aspect_ratio",
        "-of",
        "json",
        str(media_path),
    ]
    p = run_cmd(cmd, timeout=14)
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
    extra_input_args: list[str] | None = None,
) -> str | None:
    """
    Zero-distortion symmetric median cropdetect guardrail:
    - Normalizes SAR first.
    - Samples distributed points (3 for HLS/Vimeo speed, 5 for direct MP4).
    - Requires symmetric margins and valid output aspect ratio (1.30..2.45).
    """
    norm_w = int(round(orig_w * sar)) & ~1
    norm_h = orig_h & ~1
    if norm_w < 320 or norm_h < 240 or dur < 10.0:
        return None

    is_hls = ".m3u8" in stream_url or "vimeocdn.com" in stream_url
    sample_fracs = (0.25, 0.50, 0.75) if is_hls else (0.18, 0.34, 0.50, 0.66, 0.82)
    cws, chs, cxs, cys = [], [], [], []
    for f in sample_fracs:
        t = dur * f
        p = run_cmd(
            [
                "ffmpeg",
                "-hide_banner",
                *(extra_input_args or []),
                "-ss",
                f"{t:.2f}",
                "-i",
                stream_url,
                "-t",
                "0.5",
                "-vf",
                "scale='trunc(iw*sar/2)*2:trunc(ih/2)*2',setsar=1,cropdetect=24:2:0",
                "-f",
                "null",
                "-",
            ],
            timeout=16,
        )
        matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", p.stderr)
        if matches:
            cw, ch, cx, cy = map(int, matches[-1])
            cws.append(cw)
            chs.append(ch)
            cxs.append(cx)
            cys.append(cy)

    if len(cws) < (2 if is_hls else 3):
        return None

    cw = int(statistics.median(cws)) & ~1
    ch = int(statistics.median(chs)) & ~1
    cx = int(statistics.median(cxs))
    cy = int(statistics.median(cys))

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
    frames: list[Image.Image] = []
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
        try:
            im = Image.open(io.BytesIO(res.stdout)).convert("RGB")
        except Exception:
            return -1.0, "decode_err"
        sc, reason = score_aesthetic_image(im)
        if sc < 0:
            return -1.0, reason
        scores.append(sc)
        frames.append(im)

    if has_static_temporal_watermark(frames):
        return -1.0, "static_inner_watermark"

    return sum(scores) / len(scores), "ok"


def parse_year(raw) -> int:
    if isinstance(raw, int):
        return raw if 1950 <= raw <= 2026 else 2022
    m = re.search(r"(19[5-9]\d|20[0-2]\d)", str(raw or ""))
    return int(m.group(1)) if m else 2022


def year_to_era(year: int) -> str:
    if year < 1970:
        return "1950-60s"
    if year < 1980:
        return "1970s"
    if year < 1990:
        return "1980s"
    if year < 2010:
        return "1990-00s"
    if year < 2020:
        return "2010s"
    return "2020s"


def clean_title(raw_title: str) -> str:
    t = re.sub(r"\[[^\]]*\]", "", str(raw_title or ""))
    t = re.sub(r"[_]+", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:72] if len(t) > 72 else (t or "Cinema Archive Clip")


def discover_vimeo_pro_sources(max_films: int = 160, max_tvcfs: int = 140) -> tuple[list[dict], list[dict]]:
    """
    Pipeline 1: Discover curated pro cinema & global production house videos via
    Vimeo public v2 JSON API (zero auth, cloud-runner safe).
    """
    feeds = list(VIMEO_PRO_FEEDS)
    random.shuffle(feeds)

    films: list[dict] = []
    tvcfs: list[dict] = []
    seen_ids: set[str] = set()
    lock = threading.Lock()

    tasks = []
    for cat, slug, max_pages in feeds:
        pages = list(range(1, max_pages + 1))
        random.shuffle(pages)
        for pg in pages:
            tasks.append((cat, slug, pg))

    def fetch_page(task):
        cat, slug, pg = task
        url = f"https://vimeo.com/api/v2/{slug}/videos.json?page={pg}"
        try:
            data = http_get_json(url, timeout=12)
            if not isinstance(data, list):
                return []
        except Exception:
            return []
        out = []
        for entry in data:
            vid = str(entry.get("id") or "").strip()
            if not vid.isdigit():
                continue
            embed = str(entry.get("embed_privacy") or "anywhere").lower()
            if embed not in ("anywhere", ""):
                continue
            dur = float(entry.get("duration") or 0)
            if dur < 22 or dur > 2400:
                continue
            w = int(entry.get("width") or 0)
            h = int(entry.get("height") or 0)
            if h < 720 or w < 1100 or (w / max(1, h)) < 1.28:
                continue
            raw_title = str(entry.get("title") or "").strip()
            creator = str(entry.get("user_name") or "Vimeo Pro").strip()
            tags = str(entry.get("tags") or "")
            desc = str(entry.get("description") or "")[:400]
            check_text = f"{raw_title} {creator} {tags} {desc}"
            if BLOCKED_TITLE_RE.search(check_text):
                continue
            if "@" in raw_title or "@" in creator:
                continue
            out.append(
                {
                    "origin": "vimeo",
                    "source_id": vid,
                    "title": clean_title(raw_title or f"Vimeo Film {vid}"),
                    "year": parse_year(entry.get("upload_date") or raw_title),
                    "creator": creator[:60],
                    "category": cat,
                    "source_url": str(entry.get("url") or f"https://vimeo.com/{vid}"),
                    "duration": dur,
                    "width": w,
                    "height": h,
                }
            )
        return out

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        for batch in ex.map(fetch_page, tasks):
            for item in batch:
                with lock:
                    if item["source_id"] in seen_ids:
                        continue
                    seen_ids.add(item["source_id"])
                    if item["category"] == "CLASSIC_FILM":
                        if len(films) < max_films:
                            films.append(item)
                    else:
                        if len(tvcfs) < max_tvcfs:
                            tvcfs.append(item)

    random.shuffle(films)
    random.shuffle(tvcfs)
    return films, tvcfs


def resolve_vimeo_stream(item: dict) -> dict | None:
    """Resolve 1080p/720p stream URL via yt-dlp on player.vimeo.com/video/<id>."""
    vid = item["source_id"]
    try:
        p = subprocess.run(
            [
                "yt-dlp",
                "--dump-json",
                "--skip-download",
                "--no-warnings",
                "--socket-timeout",
                "10",
                "--referer",
                "https://vimeo.com/",
                f"https://player.vimeo.com/video/{vid}",
            ],
            capture_output=True,
            text=True,
            timeout=24,
        )
    except Exception:
        return None
    if p.returncode != 0 or not p.stdout.strip():
        return None
    first_line = next((l.strip() for l in p.stdout.splitlines() if l.strip().startswith("{")), "")
    if not first_line:
        return None
    try:
        info = json.loads(first_line)
    except Exception:
        return None

    fmts = []
    for f in info.get("formats") or []:
        url = f.get("url")
        if not url:
            continue
        if f.get("vcodec") in (None, "none"):
            continue
        h = int(f.get("height") or 0)
        w = int(f.get("width") or 0)
        if not (720 <= h <= 1440):
            continue
        if w > 0 and h > 0 and (w / h) < 1.28:
            continue
        # Prefer 1080p progressive HTTPS first, then 1080p HLS, then 720p
        is_1080 = 1 if 960 <= h <= 1200 else 0
        is_https = 1 if str(f.get("protocol") or "") == "https" else 0
        fmts.append(((is_1080, is_https, h, f.get("tbr") or 0), url, w, h))

    if not fmts:
        return None
    fmts.sort(key=lambda x: x[0], reverse=True)
    _, stream_url, w, h = fmts[0]
    dur = float(info.get("duration") or item.get("duration") or 0)
    if dur < 20:
        return None
    return {
        **item,
        "stream_url": stream_url,
        "duration": dur,
        "width": w or item["width"],
        "height": h or item["height"],
        "ffmpeg_headers": ["-headers", "Referer: https://vimeo.com/\r\n"],
    }


def discover_ia_whitelisted_sources(category: str, max_items: int = 24) -> list[dict]:
    """
    Pipeline 2: Strict Whitelist-Only Internet Archive discovery.
    ONLY `feature_films` (color) or `classic_tv_commercials` (1972-2001).
    Zero `opensource_movies`, zero home videos, zero personal handles.
    """
    queries = IA_WHITELIST_CINEMA_QUERIES if category == "CLASSIC_FILM" else IA_WHITELIST_TVCF_QUERIES
    discovered = []
    seen_ids = set()

    for q in queries:
        if len(discovered) >= max_items:
            break
        pages = random.sample(range(1, 18), k=6) if category == "TVCF" else random.sample(range(1, 7), k=3)
        for page in pages:
            if len(discovered) >= max_items:
                break
            params = urllib.parse.urlencode(
                {
                    "q": q,
                    "fl[]": ["identifier", "title", "year", "creator", "collection", "downloads"],
                    "sort[]": "downloads desc",
                    "rows": 40,
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

            allowed_set = ALLOWED_IA_FILM_COLLECTIONS if category == "CLASSIC_FILM" else ALLOWED_IA_TVCF_COLLECTIONS

            for doc in docs:
                ident = str(doc.get("identifier") or "").strip()
                title = str(doc.get("title") or "").strip()
                creator = str(doc.get("creator") or "Archive Cinema").strip()
                colls = doc.get("collection") or []
                if isinstance(colls, str):
                    colls = [colls]
                coll_low = {str(c).lower() for c in colls}
                if not (coll_low & allowed_set):
                    continue
                if coll_low & BLOCKED_IA_COLLECTIONS:
                    continue
                if not ident or ident in seen_ids:
                    continue
                if "@" in title or "@" in creator or "@" in ident:
                    continue
                if BLOCKED_TITLE_RE.search(f"{title} {ident} {creator}"):
                    continue
                seen_ids.add(ident)
                discovered.append(
                    {
                        "origin": "ia",
                        "source_id": ident,
                        "title": clean_title(title or ident),
                        "year": parse_year(doc.get("year")),
                        "creator": creator[:60],
                        "category": category,
                        "source_url": f"https://archive.org/details/{urllib.parse.quote(ident)}",
                    }
                )
                if len(discovered) >= max_items:
                    break

    return discovered


def resolve_ia_stream(item: dict):
    """Fetch IA metadata, verify strict whitelist collections, and locate best H.264 MP4 stream."""
    ident = item["source_id"]
    try:
        meta = http_get_json(f"https://archive.org/metadata/{urllib.parse.quote(ident)}", timeout=12)
    except Exception:
        return None
    meta_obj = meta.get("metadata") or {}
    colls = meta_obj.get("collection") or []
    if isinstance(colls, str):
        colls = [colls]
    coll_low = {str(c).lower() for c in colls}
    allowed_set = (
        ALLOWED_IA_FILM_COLLECTIONS
        if item["category"] == "CLASSIC_FILM"
        else ALLOWED_IA_TVCF_COLLECTIONS
    )
    if not (coll_low & allowed_set):
        return None
    if coll_low & BLOCKED_IA_COLLECTIONS:
        return None

    subj_text = f"{meta_obj.get('subject') or ''} {meta_obj.get('description') or ''} {meta_obj.get('title') or ''} {meta_obj.get('creator') or ''}"
    if "@" in subj_text[:500] or BLOCKED_TITLE_RE.search(subj_text[:1000]):
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
        if size < (1_500_000 if is_vintage_tvcf else 4_500_000):
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
        if w > 0 and h > 0 and (w / h) < 1.25:
            continue
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
        "ffmpeg_headers": [],
    }


def detect_local_safe_crop(
    raw_mp4: Path,
    orig_w: int,
    orig_h: int,
    sar: float,
    year: int,
    is_film: bool,
) -> str | None:
    """Fast local symmetric cropdetect on an already-downloaded 4.5-5.0s segment (0 network overhead)."""
    norm_w = int(round(orig_w * sar)) & ~1
    norm_h = orig_h & ~1
    if norm_w < 320 or norm_h < 240:
        return None
    p = run_cmd(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(raw_mp4),
            "-vf",
            "scale='trunc(iw*sar/2)*2:trunc(ih/2)*2',setsar=1,cropdetect=24:2:0",
            "-f",
            "null",
            "-",
        ],
        timeout=14,
    )
    matches = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", p.stderr)
    if not matches:
        return None
    cws = [int(m[0]) for m in matches]
    chs = [int(m[1]) for m in matches]
    cxs = [int(m[2]) for m in matches]
    cys = [int(m[3]) for m in matches]
    cw = int(statistics.median(cws)) & ~1
    ch = int(statistics.median(chs)) & ~1
    cx = int(statistics.median(cxs))
    cy = int(statistics.median(cys))
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


def extract_clips_from_source(
    src: dict,
    work_dir: Path,
    existing_source_keys: set,
    lock: threading.Lock,
    deadline: float,
    max_cuts_per_source: int = 2,
    skip_wikidata: bool = False,
    min_height: int = 720,
    outcome: dict | None = None,
) -> list[dict]:
    """
    Two-Track Aesthetic Hook Extractor:
    - Excludes first 18% & last 15% credits.
    - Evaluates candidate windows with 4-pillar aesthetic scoring + temporal inner-margin watermark check + scdet.
    - Keeps ONLY the highest-scoring highlight window(s).
    """
    if time.time() >= deadline:
        return []

    if src["origin"] == "vimeo":
        resolved = resolve_vimeo_stream(src)
        if not resolved:
            return _reject("stream_unresolved", outcome)
        src = resolved
    elif src["origin"] == "ia":
        resolved = resolve_ia_stream(src)
        if not resolved:
            return _reject("stream_unresolved", outcome)
        src = resolved

    is_film = src["category"] == "CLASSIC_FILM"
    year = int(src.get("year") or 2022)
    is_vintage_sd = (not is_film) and year <= 2001 and int(src.get("height") or 0) < 720
    clip_dur = 5.0 if is_film else 4.5
    max_cuts_allowed = 0 if is_film else 1
    dur = float(src["duration"])
    extra_hdrs = src.get("ffmpeg_headers") or []

    # Strictly forbid opening credits/slates (first 18%) and end credits/logos (last 15%)
    lo = max(14.0, dur * 0.18) if dur > 75 else max(4.0, dur * 0.18)
    hi = min(dur - 12.0, dur * 0.84 - clip_dur) if dur > 75 else min(dur - 4.0, dur * 0.84 - clip_dur)
    if hi <= lo + clip_dur:
        return _reject("too_short", outcome)

    if src["origin"] == "vimeo":
        orig_w, orig_h, sar = int(src.get("width") or 1920), int(src.get("height") or 1080), 1.0
    else:
        pw, ph, sar = probe_stream_dims(src["stream_url"], extra_hdrs)
        orig_w = pw or int(src.get("width") or 1280)
        orig_h = ph or int(src.get("height") or 720)

    if orig_w < 320 or orig_h < 240:
        return _reject("unreadable_dims", outcome)
    if (orig_w * sar) / max(1, orig_h) < 1.25:
        return _reject("portrait_or_square", outcome)
    # Resolution gate (default 720p): SD sources only pass when --min-height is lowered on purpose.
    if orig_h < min_height:
        return _reject(f"below_{min_height}p", outcome)

    # For direct MP4 (IA), probe remote median crop once; for Vimeo HLS, run instant local cropdetect per winner
    crop_filter = (
        None
        if src["origin"] == "vimeo"
        else detect_safe_median_crop(
            src["stream_url"], dur, orig_w, orig_h, sar, year, is_film, extra_hdrs
        )
    )

    effective_max_cuts = 1 if dur < 130 else max_cuts_per_source
    fracs = (0.14, 0.38, 0.62, 0.84) if dur >= 100 else (0.22, 0.55, 0.80)
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

        raw_mp4 = work_dir / f"raw_{tid}_{idx}_{int(time.time()*1000)%10000}.mp4"
        try:
            cut_cmd = [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                *extra_hdrs,
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
            res = run_cmd(cut_cmd, timeout=36)
            if res.returncode != 0 or not raw_mp4.exists() or raw_mp4.stat().st_size < 16_000:
                raw_mp4.unlink(missing_ok=True)
                continue

            fscore, _ = score_raw_segment(raw_mp4, clip_dur)
            if fscore < 2.25:
                raw_mp4.unlink(missing_ok=True)
                continue

            cuts = count_scene_cuts(raw_mp4, clip_dur, threshold=12.0)
            if cuts > max_cuts_allowed:
                raw_mp4.unlink(missing_ok=True)
                continue

            scored_candidates.append((fscore, cuts, start_t, skey, raw_mp4))
            # Fast-path: if we already have enough high-scoring cuts, stop probing this video
            if len(scored_candidates) >= effective_max_cuts and fscore >= 2.85:
                break
        except Exception:
            raw_mp4.unlink(missing_ok=True)

    if not scored_candidates:
        return _reject("no_segment_passed_quality", outcome)

    scored_candidates.sort(key=lambda x: x[0], reverse=True)
    winners = scored_candidates[:effective_max_cuts]
    for _, _, _, _, loser_mp4 in scored_candidates[effective_max_cuts:]:
        loser_mp4.unlink(missing_ok=True)

    wd_aliases = [] if skip_wikidata else fetch_wikidata_aliases(src["title"], src.get("creator", ""))

    produced = []
    for fscore, cuts, start_t, skey, raw_mp4 in winners:
        out_mp4 = work_dir / f"out_{tid}_{int(time.time() * 1000)}_{len(produced)}.mp4"
        out_webp = out_mp4.with_suffix(".webp")
        try:
            seg_crop = crop_filter
            if seg_crop is None and src["origin"] == "vimeo":
                seg_crop = detect_local_safe_crop(raw_mp4, orig_w, orig_h, sar, year, is_film)
            if seg_crop is None:
                # Bars that stay black for the whole segment are cut off before encoding.
                try:
                    seg_crop = bar_crop_filter(raw_mp4)
                except Exception:
                    seg_crop = None

            vf_parts = ["scale='trunc(iw*sar/2)*2:trunc(ih/2)*2'", "setsar=1"]
            if seg_crop:
                vf_parts.append(seg_crop)

            if is_vintage_sd:
                vf_parts.extend(["hqdn3d=1.5:1.5:3:3", "scale=960:-2:flags=lanczos", "cas=0.3"])
                crf_ladder = ("18", "20")
                tune_args: list[str] = []
                size_cap = 3_600_000
            else:
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
            final_ratio = cw / max(1, ch)
            if final_ratio < 1.25 or (is_film and year >= 1995 and final_ratio < 1.58):
                out_mp4.unlink(missing_ok=True)
                out_webp.unlink(missing_ok=True)
                _reject("final_aspect")
                continue

            with lock:
                if skey in existing_source_keys:
                    out_mp4.unlink(missing_ok=True)
                    out_webp.unlink(missing_ok=True)
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
    url = f"https://github.com/{repo}/releases/download/{META_TAG}/catalog-full.json?t={int(time.time())}"
    try:
        data = http_get_json(url, timeout=20)
        if isinstance(data, list):
            return data
        if isinstance(data, dict) and isinstance(data.get("items"), list):
            return data["items"]
    except Exception:
        pass
    return []


def sanitize_existing_catalog(catalog: list[dict]) -> list[dict]:
    """Remove any legacy polluted amateur/home-video/@jcn entries from catalog."""
    cleaned = []
    for item in catalog:
        # Preserve protected / curated HD seeds
        if item.get("seedMasterpiece") or item.get("protectedSeed"):
            item["protectedSeed"] = True
            if not item.get("createdAt"):
                item["createdAt"] = item.get("harvestedAt") or item.get("addedAt") or "2026-01-01T00:00:00+00:00"
            cleaned.append(item)
            continue
        blob = f"{item.get('titleKo', '')} {item.get('originalTitle', '')} {item.get('brandOrSource', '')} {item.get('sourceUrl', '')}"
        if "@" in blob or BLOCKED_TITLE_RE.search(blob):
            print(f"[SANITIZE] Purging polluted item {item.get('id')}: {item.get('titleKo')}", flush=True)
            continue
        if not item.get("createdAt"):
            item["createdAt"] = item.get("harvestedAt") or item.get("addedAt") or "2026-01-01T00:00:00+00:00"
        cleaned.append(item)
    return cleaned


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
            timeout=240,
        )
        if p.returncode != 0:
            raise RuntimeError(f"gh release upload failed ({tag}): {p.stderr}")


def delete_release_asset(repo: str, tag: str, asset_name: str):
    run_cmd(
        ["gh", "release", "delete-asset", tag, asset_name, "-R", repo, "-y"],
        timeout=30,
    )


def rotate_active_wall(catalog: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Separate catalog-full.json vs wall-active.json:
    - `protectedSeed` / `seedMasterpiece` ONLY protects from 8.5GB deletion (NOT pinned on main wall).
    - Main wall (`wall-active.json`, up to 600 clips) prioritizes newest `createdAt` harvested clips
      first while maintaining 60% Cinema : 40% TVCF balance.
    """
    eligible = [x for x in catalog if not x.get("excluded")]
    ordered = sorted(
        eligible,
        key=lambda x: (
            str(x.get("createdAt") or x.get("harvestedAt") or x.get("addedAt") or ""),
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

    # Emit wall-active.json in newest-first createdAt order
    active_list = []
    for item in catalog:
        if item.get("excluded"):
            item["status"] = "archived"
    for item in ordered:
        if item["id"] in active_ids:
            item["status"] = "active"
            active_list.append(item)
        else:
            item["status"] = "archived"

    return active_list, catalog


def enforce_storage_cap(repo: str, catalog: list[dict]) -> list[dict]:
    """When cumulative bytes exceed 8.5 GB (or > 10,000 items), LRU-evict oldest archived non-protected assets."""
    total_bytes = sum(int(x.get("bytes") or 2_200_000) for x in catalog)
    if total_bytes <= STORAGE_CAP_BYTES and len(catalog) <= CATALOG_MAX_ITEMS:
        return catalog

    archived = [
        x
        for x in catalog
        if x.get("status") == "archived"
        and not x.get("protectedSeed")
        and not x.get("seedMasterpiece")
    ]
    archived.sort(
        key=lambda x: (
            str(x.get("createdAt") or x.get("harvestedAt") or x.get("addedAt") or ""),
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


def build_contact_sheet(items: list[dict], media_dir: Path, out_path: Path, cols: int = 10):
    """Generate a crisp labeled contact sheet PNG of all harvested WebP frames for visual QA."""
    if not items:
        return
    tw, th = 220, 124
    pad = 6
    rows = math.ceil(len(items) / cols)
    sheet = Image.new("RGB", (cols * (tw + pad) + pad, rows * (th + pad) + pad), (12, 12, 14))
    draw = ImageDraw.Draw(sheet)

    for idx, it in enumerate(items):
        r, c = divmod(idx, cols)
        x = pad + c * (tw + pad)
        y = pad + r * (th + pad)
        webp = media_dir / f"{it['id']}.webp"
        if webp.exists():
            try:
                im = Image.open(webp).convert("RGB")
                im.thumbnail((tw, th), Image.Resampling.LANCZOS)
                ox = x + (tw - im.width) // 2
                oy = y + (th - im.height) // 2
                sheet.paste(im, (ox, oy))
            except Exception:
                pass
        draw.rectangle([x, y, x + 78, y + 14], fill=(0, 0, 0))
        draw.text((x + 3, y + 2), it["id"], fill=(220, 190, 110))

    sheet.save(out_path, "PNG")
    print(f"[QA] Saved contact sheet ({len(items)} clips, {sheet.size[0]}x{sheet.size[1]}) -> {out_path}", flush=True)


def publish_to_releases(repo: str, catalog: list[dict], new_items: list[dict], media_dir: Path, now_iso: str):
    root_commit = get_root_commit()
    uploads_by_shard: dict[str, list[Path]] = {}
    for it in new_items:
        cid = it["id"]
        shard = it["shard"]
        mp4 = media_dir / f"{cid}.mp4"
        webp = media_dir / f"{cid}.webp"
        if mp4.exists() and webp.exists():
            uploads_by_shard.setdefault(shard, []).extend([mp4, webp])

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

    with tempfile.TemporaryDirectory(prefix="kf_meta_") as mdir:
        mpath = Path(mdir)
        wall_path = mpath / "wall-active.json"
        full_path = mpath / "catalog-full.json"
        total_bytes = sum(int(x.get("bytes") or 0) for x in merged_catalog)

        wall_path.write_text(
            json.dumps(
                {
                    "version": 2,
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
                    "version": 2,
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

    # Auto-ping Naver Search Advisor & global IndexNow with newly harvested /shot/ URLs (fault-isolated)
    try:
        import sys as _sys

        _scripts_dir = str(Path(__file__).resolve().parent)
        if _scripts_dir not in _sys.path:
            _sys.path.insert(0, _scripts_dir)
        import ping_indexnow as _idxnow

        _site_url = _idxnow.resolve_site_url()
        _new_ids = [str(it["id"]) for it in new_items if it.get("id")]
        _submit_urls = _idxnow.build_default_urls(_site_url, _new_ids)
        _ping_res = _idxnow.ping_indexnow(_submit_urls, site_url=_site_url)
        for _ep_name, _ep_info in _ping_res.items():
            print(
                f"[INDEXNOW] {_ep_name}: HTTP {_ep_info.get('status')} (urls={_ep_info.get('submitted')}, ok={_ep_info.get('ok')})",
                flush=True,
            )
    except Exception as _idx_err:
        print(f"[INDEXNOW] Non-fatal ping skipped: {_idx_err}", flush=True)

    return active_wall, merged_catalog, total_bytes


def load_rejected_sources(repo: str) -> dict[str, dict]:
    url = f"https://github.com/{repo}/releases/download/{META_TAG}/{REJECTED_SOURCES_ASSET}?t={int(time.time())}"
    try:
        data = http_get_json(url, timeout=20)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def fresh_rejections(rejected: dict[str, dict], now: float) -> set[str]:
    """Source IDs rejected within the TTL; older ones get one more try (sources can change)."""
    ttl = REJECTED_SOURCE_TTL_DAYS * 86400
    return {sid for sid, info in rejected.items() if now - float(info.get("at") or 0) < ttl}


def publish_rejected_sources(repo: str, rejected: dict[str, dict]):
    with tempfile.TemporaryDirectory(prefix="kf_rej_") as d:
        path = Path(d) / REJECTED_SOURCES_ASSET
        path.write_text(json.dumps(rejected, ensure_ascii=False, indent=1) + "\n", "utf-8")
        upload_files_chunked(repo, META_TAG, [path], chunk_size=1)


def build_item_doc(cl: dict, clip_id: str, shard: str, repo: str, final_mp4: Path, today_str: str, now_iso: str) -> dict:
    """Catalog entry for a harvested clip; every descriptive field is measured from the clip itself."""
    m = analyze_clip(final_mp4)
    optics = m["optics"]
    base_dl = f"https://github.com/{repo}/releases/download/{shard}"
    cat = cl["category"]
    doc = {
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
        "compositionTags": m["compositionTags"],
        "persuasionTags": [],
        "opticsTags": m["opticsTags"],
        "optics": optics,
        "directingNote": m["directingNote"],
        "palette": cl["palette"],
        "aliases": cl.get("aliases") or [],
        "viewfinder": {"primaryGrid": "thirds"},
        "beats": [],
        "breakdown": {
            "hook3s": m["directingNote"],
            "camera": optics["camera"],
            "lighting": f"{optics['key']} · {optics['tone']} · {optics['saturation']}",
            "editing": "단일 테이크" if optics["cuts"] == 0 else f"컷 {optics['cuts']}회",
            "framing": ", ".join(m["compositionTags"]),
        },
        "addedAt": today_str,
        "createdAt": now_iso,
        "harvestedAt": now_iso,
        "shard": shard,
        "status": "active",
        "bytes": cl["bytes"],
        "sourceKey": cl["source_key"],
    }
    if m["crop"]:
        doc["crop"] = m["crop"]
    return doc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--target-count", type=int, default=160)
    parser.add_argument("--max-minutes", type=float, default=21.0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--stage-dir", default="", help="Stage clips locally without uploading yet (for visual QA)")
    parser.add_argument("--contact-sheet", default="", help="Optional PNG contact sheet output path")
    parser.add_argument("--commit-stage", default="", help="Upload previously staged & QA-approved directory")
    parser.add_argument("--exclude-ids", default="", help="Comma-separated staged clip IDs to drop before upload")
    parser.add_argument("--skip-wikidata", action="store_true", help="Skip Wikidata lookups for faster batch staging")
    parser.add_argument("--source-mode", choices=["all", "vimeo", "ia"], default="all", help="Restrict discovery pipeline")
    parser.add_argument("--min-height", type=int, default=720, help="Minimum source height in pixels (720p gate)")
    args = parser.parse_args()

    repo = args.repo
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Mode B: Upload previously staged & visually verified clips
    if args.commit_stage:
        stage_path = Path(args.commit_stage)
        manifest = json.loads((stage_path / "staged-items.json").read_text("utf-8"))
        exclude = {x.strip() for x in args.exclude_ids.split(",") if x.strip()}
        approved = [it for it in manifest if it["id"] not in exclude]
        catalog = sanitize_existing_catalog(download_existing_catalog(repo))
        existing_ids = {x["id"] for x in catalog}
        approved = [it for it in approved if it["id"] not in existing_ids]
        active_wall, merged_catalog, total_bytes = publish_to_releases(
            repo, catalog, approved, stage_path, now_iso
        )
        print(
            f"=== STAGED COMMIT COMPLETE === added={len(approved)} active={len(active_wall)} total={len(merged_catalog)} storage={total_bytes / (1024 * 1024):.1f}MB",
            flush=True,
        )
        return

    target_count = max(1, min(args.target_count, 300))
    start_ts = time.time()
    deadline = start_ts + max(2.0, args.max_minutes) * 60.0
    today_str = now_iso[:10]

    print(
        f"=== KINOFRAME PRO DAWN HARVESTER v3 START === repo={repo} target={target_count} max_min={args.max_minutes} workers={args.workers}",
        flush=True,
    )

    catalog = sanitize_existing_catalog(download_existing_catalog(repo))
    print(f"[CATALOG] Loaded {len(catalog)} clean existing clips from {META_TAG}", flush=True)

    existing_source_keys = {
        str(x.get("sourceKey")) for x in catalog if x.get("sourceKey")
    }
    existing_source_ids: set[str] = set()
    for sk in existing_source_keys:
        parts = sk.split(":")
        if len(parts) >= 2 and parts[1]:
            existing_source_ids.add(parts[1])
    shard_counts: dict[str, int] = Counter(
        str(x.get("shard") or "kinoframe-media-s01") for x in catalog
    )
    next_num = next_harvest_number(catalog)

    # Sources that produced nothing recently are skipped instead of being re-cut every run.
    rejected_sources = load_rejected_sources(repo)
    recently_rejected = fresh_rejections(rejected_sources, time.time())
    existing_source_ids |= recently_rejected
    print(f"[SKIP-CACHE] {len(recently_rejected)} recently rejected sources skipped", flush=True)

    stage_mode = bool(args.stage_dir)
    prior_staged: list[dict] = []
    if stage_mode:
        work_dir = Path(args.stage_dir)
        work_dir.mkdir(parents=True, exist_ok=True)
        staged_json = work_dir / "staged-items.json"
        if staged_json.exists():
            prior_staged = json.loads(staged_json.read_text("utf-8"))
            for ps in prior_staged:
                if ps.get("sourceKey"):
                    sk = str(ps["sourceKey"])
                    existing_source_keys.add(sk)
                    parts = sk.split(":")
                    if len(parts) >= 2 and parts[1]:
                        existing_source_ids.add(parts[1])
                m = re.match(r"^KF-HV-(\d+)$", str(ps.get("id") or ""))
                if m:
                    next_num = max(next_num, int(m.group(1)) + 1)
                sh = str(ps.get("shard") or "kinoframe-media-s01")
                shard_counts[sh] = shard_counts.get(sh, 0) + 1
            print(f"[STAGE] Resuming with {len(prior_staged)} already staged clips", flush=True)
        skip_file = work_dir / "skip-source-ids.txt"
        if skip_file.exists():
            for line in skip_file.read_text("utf-8").splitlines():
                s = line.strip()
                if s:
                    existing_source_ids.add(s)
        tmp_ctx = None
    else:
        tmp_ctx = tempfile.TemporaryDirectory(prefix="kf_harvest_")
        work_dir = Path(tmp_ctx.name)

    film_goal = max(1, round(target_count * 0.60))
    tvcf_goal = max(1, target_count - film_goal)

    vimeo_films, vimeo_tvcfs = (
        discover_vimeo_pro_sources(
            max_films=max(320, film_goal * 4),
            max_tvcfs=max(320, tvcf_goal * 4),
        )
        if args.source_mode in ("all", "vimeo")
        else ([], [])
    )
    ia_films = (
        discover_ia_whitelisted_sources("CLASSIC_FILM", max_items=80 if args.source_mode == "ia" else 35)
        if args.source_mode in ("all", "ia")
        else []
    )
    ia_tvcfs = (
        discover_ia_whitelisted_sources("TVCF", max_items=160 if args.source_mode == "ia" else 80)
        if args.source_mode in ("all", "ia")
        else []
    )

    # Filter out already-harvested/skipped source IDs and interleave Vimeo (3) : IA (1)
    vf_clean = [c for c in vimeo_films if c["source_id"] not in existing_source_ids]
    vt_clean = [c for c in vimeo_tvcfs if c["source_id"] not in existing_source_ids]
    if_clean = [c for c in ia_films if c["source_id"] not in existing_source_ids]
    it_clean = [c for c in ia_tvcfs if c["source_id"] not in existing_source_ids]

    def interleave_pair(primary: list[dict], secondary: list[dict], ratio: int = 3) -> list[dict]:
        merged = []
        pi, si = 0, 0
        while pi < len(primary) or si < len(secondary):
            for _ in range(ratio):
                if pi < len(primary):
                    merged.append(primary[pi])
                    pi += 1
            if si < len(secondary):
                merged.append(secondary[si])
                si += 1
        return merged

    all_films = interleave_pair(vf_clean, if_clean, ratio=3)
    all_tvcfs = interleave_pair(vt_clean, it_clean, ratio=3)

    # Interleave 60% Cinema : 40% TVCF (3 films : 2 tvcfs)
    candidates = []
    fi, ti = 0, 0
    while fi < len(all_films) or ti < len(all_tvcfs):
        for _ in range(3):
            if fi < len(all_films):
                candidates.append(all_films[fi])
                fi += 1
        for _ in range(2):
            if ti < len(all_tvcfs):
                candidates.append(all_tvcfs[ti])
                ti += 1

    print(
        f"[DISCOVER] Fresh Candidates={len(candidates)} (Film={len(all_films)}, TVCF={len(all_tvcfs)}, skipped_known={len(existing_source_ids)})",
        flush=True,
    )

    harvested_raw: list[dict] = []
    lock = threading.Lock()
    stop_event = threading.Event()

    try:
        def worker_task(src_item: dict):
            if stop_event.is_set() or time.time() >= deadline:
                return []
            outcome: dict = {}
            clips = extract_clips_from_source(
                src_item,
                work_dir,
                existing_source_keys,
                lock,
                deadline,
                max_cuts_per_source=2,
                skip_wikidata=args.skip_wikidata,
                min_height=args.min_height,
                outcome=outcome,
            )
            # Only a source that was fully evaluated (not cut short by the deadline) is remembered.
            if not clips and outcome.get("reason") and time.time() < deadline:
                with lock:
                    rejected_sources[str(src_item["source_id"])] = {
                        "reason": outcome["reason"],
                        "at": int(time.time()),
                        "origin": src_item.get("origin"),
                    }
            return clips

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

        print(f"[REJECTS] {dict(REJECT_COUNTS.most_common())}", flush=True)
        if not stage_mode:
            try:
                publish_rejected_sources(repo, rejected_sources)
                print(f"[SKIP-CACHE] saved {len(rejected_sources)} rejected sources", flush=True)
            except Exception as rej_err:
                print(f"[SKIP-CACHE] non-fatal save failure: {rej_err}", flush=True)

        if not harvested_raw and not prior_staged:
            print("[HARVEST] 0 new clips produced in this window; catalog left untouched.", flush=True)
            return

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

            try:
                item_doc = build_item_doc(cl, clip_id, shard, repo, final_mp4, today_str, now_iso)
            except Exception as an_err:
                print(f"  [ANALYSIS] skipped {clip_id}: {an_err}", flush=True)
                continue
            new_items.append(item_doc)

        all_staged = prior_staged + new_items

        if args.contact_sheet:
            build_contact_sheet(all_staged, work_dir, Path(args.contact_sheet), cols=10)

        if stage_mode:
            (work_dir / "staged-items.json").write_text(
                json.dumps(all_staged, ensure_ascii=False, indent=2) + "\n",
                "utf-8",
            )
            elapsed = time.time() - start_ts
            print(
                f"=== STAGE COMPLETE === newly_added={len(new_items)} total_staged={len(all_staged)} in {elapsed:.1f}s (dir={work_dir})",
                flush=True,
            )
            return

        active_wall, merged_catalog, total_bytes = publish_to_releases(
            repo, catalog, new_items, work_dir, now_iso
        )
        elapsed = time.time() - start_ts
        print(
            f"=== DAWN HARVEST COMPLETE === added={len(new_items)} active={len(active_wall)} total={len(merged_catalog)} storage={total_bytes / (1024 * 1024):.1f}MB in {elapsed:.1f}s",
            flush=True,
        )
    finally:
        if tmp_ctx is not None:
            tmp_ctx.cleanup()


if __name__ == "__main__":
    main()
