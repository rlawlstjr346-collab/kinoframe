#!/usr/bin/env python3
"""
KINOFRAME measured clip analysis (shared by auto_harvester.py and curate_catalog.py).

Every value is measured from the decoded clip, nothing is assigned by rotation or template:
- crop:      active-picture box inside baked-in letterbox / pillarbox bars (normalized 0..1)
- camera:    global motion from phase correlation (static, pan, tilt, handheld, push-in, pull-out)
- cuts:      hard cuts from frame-difference spikes
- light:     key (low/high/contrast) from luma statistics, colour temperature from R-B balance
- framing:   symmetry, negative space, backlit silhouette, geometric line structure
"""

from __future__ import annotations

import subprocess
from pathlib import Path

import numpy as np

ANALYSIS_W, ANALYSIS_H = 320, 180
ANALYSIS_FPS = 8
BAR_LUMA_MAX = 24.0  # 0..255; a bar row/column never rises above this in any frame
BAR_MIN_FRACTION = 0.012  # ignore sub-1.2% slivers
BAR_MAX_FRACTION = 0.30  # never crop more than 30% from one side
CROP_SAFETY_INSET = 0.004  # hide anti-aliased bar edges


def decode_frames(mp4: Path) -> np.ndarray:
    """Returns uint8 RGB frames shaped (n, H, W, 3) at ANALYSIS_W x ANALYSIS_H, ANALYSIS_FPS."""
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(mp4),
        "-vf", f"fps={ANALYSIS_FPS},scale={ANALYSIS_W}:{ANALYSIS_H}:flags=area",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
    ]
    raw = subprocess.run(cmd, capture_output=True, timeout=90, check=True).stdout
    frame_bytes = ANALYSIS_W * ANALYSIS_H * 3
    n = len(raw) // frame_bytes
    if n < 3:
        raise ValueError("too few frames")
    return np.frombuffer(raw[: n * frame_bytes], dtype=np.uint8).reshape(n, ANALYSIS_H, ANALYSIS_W, 3)


def luma(frames: np.ndarray) -> np.ndarray:
    f = frames.astype(np.float32)
    return 0.299 * f[..., 0] + 0.587 * f[..., 1] + 0.114 * f[..., 2]


def _edge_run(profile: np.ndarray, from_end: bool) -> int:
    seq = profile[::-1] if from_end else profile
    run = 0
    for v in seq:
        if v > BAR_LUMA_MAX:
            break
        run += 1
    return run


def detect_active_crop(y: np.ndarray) -> dict | None:
    """Box of real picture inside bars that stay black for the whole clip. None when there are no bars."""
    _, h, w = y.shape
    row_peak = np.percentile(y, 99.5, axis=(0, 2))
    col_peak = np.percentile(y, 99.5, axis=(0, 1))
    top, bottom = _edge_run(row_peak, False), _edge_run(row_peak, True)
    left, right = _edge_run(col_peak, False), _edge_run(col_peak, True)

    def keep(px: int, total: int) -> int:
        frac = px / total
        return px if BAR_MIN_FRACTION <= frac <= BAR_MAX_FRACTION else 0

    top, bottom, left, right = keep(top, h), keep(bottom, h), keep(left, w), keep(right, w)
    if not (top or bottom or left or right):
        return None
    x0 = left / w + (CROP_SAFETY_INSET if left else 0)
    y0 = top / h + (CROP_SAFETY_INSET if top else 0)
    x1 = 1 - right / w - (CROP_SAFETY_INSET if right else 0)
    y1 = 1 - bottom / h - (CROP_SAFETY_INSET if bottom else 0)
    if x1 - x0 < 0.4 or y1 - y0 < 0.4:
        return None
    return {"x": round(x0, 4), "y": round(y0, 4), "w": round(x1 - x0, 4), "h": round(y1 - y0, 4)}


def apply_crop(y: np.ndarray, rgb: np.ndarray, crop: dict | None) -> tuple[np.ndarray, np.ndarray]:
    if not crop:
        return y, rgb
    _, h, w = y.shape
    x0, y0 = int(round(crop["x"] * w)), int(round(crop["y"] * h))
    x1, y1 = int(round((crop["x"] + crop["w"]) * w)), int(round((crop["y"] + crop["h"]) * h))
    return y[:, y0:y1, x0:x1], rgb[:, y0:y1, x0:x1]


def _phase_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    win = np.outer(np.hanning(a.shape[0]), np.hanning(a.shape[1]))
    fa, fb = np.fft.fft2((a - a.mean()) * win), np.fft.fft2((b - b.mean()) * win)
    r = fa * np.conj(fb)
    r /= np.abs(r) + 1e-9
    corr = np.abs(np.fft.ifft2(r))
    py, px = np.unravel_index(np.argmax(corr), corr.shape)
    if py > a.shape[0] // 2:
        py -= a.shape[0]
    if px > a.shape[1] // 2:
        px -= a.shape[1]
    return float(px), float(py)


def detect_cuts(y: np.ndarray) -> tuple[int, list[int]]:
    small = y[:, ::4, ::4]
    diffs = np.abs(np.diff(small, axis=0)).mean(axis=(1, 2)) / 255.0
    med = float(np.median(diffs)) if len(diffs) else 0.0
    cut_idx = [i for i, d in enumerate(diffs) if d > 0.16 and d > med * 4.0]
    return len(cut_idx), cut_idx


def classify_camera(y: np.ndarray, cut_idx: list[int]) -> tuple[str, float]:
    small = y[:, ::2, ::2]
    half = small.shape[2] // 2
    shifts, spread = [], []
    for i in range(len(small) - 1):
        if i in cut_idx:
            continue
        dx, dy = _phase_shift(small[i + 1], small[i])
        shifts.append((dx, dy))
        lx, _ = _phase_shift(small[i + 1][:, :half], small[i][:, :half])
        rx, _ = _phase_shift(small[i + 1][:, half:], small[i][:, half:])
        spread.append(rx - lx)  # >0: halves move apart (push-in), <0: together (pull-out)
    if not shifts:
        return "고정 숏", 0.0
    v = np.array(shifts)
    mags = np.hypot(v[:, 0], v[:, 1])
    mean_mag = float(mags.mean())
    consistency = float(np.hypot(*v.mean(axis=0)) / (mean_mag + 1e-6))
    mean_spread = float(np.mean(spread))
    if abs(mean_spread) >= 0.35 and abs(mean_spread) > mean_mag * 0.6:
        return ("푸시인" if mean_spread > 0 else "풀아웃"), mean_mag
    if mean_mag < 0.22:
        return "고정 숏", mean_mag
    if consistency >= 0.55 and mean_mag >= 0.35:
        horizontal = abs(v[:, 0].mean()) >= abs(v[:, 1].mean())
        return ("패닝" if horizontal else "틸트"), mean_mag
    if consistency < 0.45:
        return "핸드헬드", mean_mag
    return "슬로 무빙", mean_mag


def classify_light(y: np.ndarray, rgb: np.ndarray) -> dict:
    f = rgb.astype(np.float32) / 255.0
    l_mean = float(y.mean() / 255.0)
    l_std = float(y.std() / 255.0)
    r, g, b = (float(f[..., c].mean()) for c in range(3))
    mx, mn = f.max(axis=-1), f.min(axis=-1)
    sat = float(np.where(mx > 0.04, (mx - mn) / (mx + 1e-6), 0).mean())
    warmth = r - b
    if l_mean < 0.27:
        key = "로우키"
    elif l_mean > 0.58 and l_std < 0.24:
        key = "하이키"
    elif l_std > 0.27:
        key = "고대비"
    else:
        key = "미드톤"
    tone = "웜톤" if warmth > 0.06 else "쿨톤" if warmth < -0.03 else "뉴트럴"
    saturation = "고채도" if sat > 0.42 else "저채도" if sat < 0.16 else "중채도"
    return {
        "key": key, "tone": tone, "saturation": saturation,
        "luma": round(l_mean, 3), "contrast": round(l_std, 3),
        "warmth": round(warmth, 3), "chroma": round(sat, 3),
    }


def classify_framing(y_mid: np.ndarray) -> list[str]:
    """Composition tags measurable from one representative frame (cropped luma)."""
    tags: list[str] = []
    yl = y_mid / 255.0
    h, w = yl.shape
    if float(np.abs(yl - yl[:, ::-1]).mean()) < 0.055:
        tags.append("대칭 구도")
    gy, gx = np.gradient(yl)
    mag = np.hypot(gx, gy)
    bh, bw = h // 8, w // 8
    blocks = mag[: bh * 8, : bw * 8].reshape(8, bh, 8, bw).mean(axis=(1, 3))
    if float((blocks < 0.012).mean()) > 0.58:
        tags.append("극단적 여백")
    cy0, cy1, cx0, cx1 = h // 4, 3 * h // 4, w // 4, 3 * w // 4
    center = float(yl[cy0:cy1, cx0:cx1].mean())
    ring = (float(yl.sum()) - center * (cy1 - cy0) * (cx1 - cx0)) / (h * w - (cy1 - cy0) * (cx1 - cx0))
    if ring > 0.45 and center < ring * 0.55:
        tags.append("역광 실루엣")
    strong = mag > 0.08
    if strong.mean() > 0.03:
        ang = np.degrees(np.arctan2(gy[strong], gx[strong])) % 180
        axis_aligned = ((ang < 6) | (ang > 174) | (np.abs(ang - 90) < 6)).mean()
        if axis_aligned > 0.5:
            tags.append("기하학 조형")
    return tags


RHYTHM_NOTE = {0: "단일 테이크로 호흡을 길게 유지한다", 1: "한 번의 컷으로 리듬을 끊어 장면을 전환한다"}
CAMERA_NOTE = {
    "고정 숏": "카메라를 고정한 채",
    "패닝": "수평 패닝으로 공간을 훑으며",
    "틸트": "틸트로 수직 공간을 드러내며",
    "핸드헬드": "핸드헬드의 흔들림으로 현장감을 살리며",
    "푸시인": "피사체로 다가가는 푸시인으로",
    "풀아웃": "뒤로 물러나는 풀아웃으로",
    "슬로 무빙": "느린 카메라 이동으로",
}
KEY_NOTE = {"로우키": "어두운 로우키 조명", "하이키": "밝은 하이키 조명", "고대비": "강한 명암 대비", "미드톤": "고른 미드톤 노출"}
TONE_NOTE = {"웜톤": "따뜻한 색온도", "쿨톤": "차가운 색온도", "뉴트럴": "중성 색온도"}
FRAMING_NOTE = {
    "대칭 구도": "좌우 대칭으로 화면 무게를 중앙에 모은다",
    "극단적 여백": "넓은 여백 속에 피사체를 작게 배치한다",
    "역광 실루엣": "밝은 배경 앞 역광으로 형태만 남긴다",
    "기하학 조형": "수직·수평 직선 구조로 화면을 분할한다",
}


def build_directing_note(camera: str, cuts: int, light: dict, framing: list[str], duration: float) -> str:
    rhythm = RHYTHM_NOTE.get(cuts) or f"{cuts}번의 빠른 컷으로 템포를 끌어올린다"
    if cuts == 0:
        rhythm = f"{duration:.0f}초 " + rhythm
    note = f"{CAMERA_NOTE[camera]} {KEY_NOTE[light['key']]}에 {TONE_NOTE[light['tone']]}를 얹고, {rhythm}."
    if framing:
        note += f" {FRAMING_NOTE[framing[0]]}."
    return note


def build_optics_tags(camera: str, cuts: int, light: dict, framing: list[str]) -> list[str]:
    tags = [camera, "단일 테이크" if cuts == 0 else "빠른 컷" if cuts >= 2 else "원 컷 전환"]
    if light["key"] != "미드톤":
        tags.append(light["key"])
    if light["tone"] != "뉴트럴":
        tags.append(light["tone"])
    if light["saturation"] != "중채도":
        tags.append(light["saturation"])
    return tags + framing


def analyze_clip(mp4: Path) -> dict:
    rgb = decode_frames(mp4)
    y = luma(rgb)
    crop = detect_active_crop(y)
    yc, rgbc = apply_crop(y, rgb, crop)
    cuts, cut_idx = detect_cuts(yc)
    camera, motion = classify_camera(yc, cut_idx)
    light = classify_light(yc, rgbc)
    framing = classify_framing(yc[len(yc) // 2])
    duration = len(rgb) / ANALYSIS_FPS
    return {
        "crop": crop,
        "optics": {"camera": camera, "cuts": cuts, "motion": round(motion, 3), **light},
        "compositionTags": framing,
        "opticsTags": build_optics_tags(camera, cuts, light, framing),
        "directingNote": build_directing_note(camera, cuts, light, framing, duration),
    }


if __name__ == "__main__":
    import json
    import sys

    for p in sys.argv[1:]:
        print(p, json.dumps(analyze_clip(Path(p)), ensure_ascii=False))


def detect_bar_crop(mp4: Path) -> dict | None:
    """Active-picture box (fractions) inside bars that stay black for the whole clip."""
    return detect_active_crop(luma(decode_frames(mp4)))


def bar_crop_filter(mp4: Path, crop: dict | None = None) -> str | None:
    """ffmpeg crop expression (applied after SAR normalisation) that removes baked-in bars, or None."""
    crop = crop if crop is not None else detect_bar_crop(mp4)
    if not crop:
        return None
    return (
        f"crop=trunc(iw*{crop['w']}/2)*2:trunc(ih*{crop['h']}/2)*2:"
        f"trunc(iw*{crop['x']}):trunc(ih*{crop['y']})"
    )
