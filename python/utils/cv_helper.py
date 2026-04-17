"""
cv_helper.py — OpenCV utility functions for video analysis.

Covers:
  - Video metadata extraction
  - Frame quality scoring (blur, brightness, black screen)
  - Shot change detection (histogram correlation)
  - Face detection (Haar Cascade)
  - 9:16 crop suggestion (face-aware)
  - Black border detection
  - Color tone classification
  - Perceptual hash (duplicate detection)
  - Thumbnail extraction
"""
import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Video metadata
# ---------------------------------------------------------------------------

def get_video_info(video_path: str) -> dict:
    """Return basic video metadata: duration, resolution, fps, total_frames."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0.0

    cap.release()

    # Aspect ratio as simplified fraction string
    from math import gcd
    g = gcd(width, height) if width and height else 1
    ar_str = f"{width // g}:{height // g}"

    return {
        "duration": round(duration, 2),
        "resolution": [width, height],
        "fps": round(fps, 2),
        "total_frames": total_frames,
        "aspect_ratio": ar_str,
    }


# ---------------------------------------------------------------------------
# Frame quality
# ---------------------------------------------------------------------------

def score_frame_quality(frame) -> dict:
    """
    Evaluate a single frame for usability.

    Returns:
        blur_score  : float — Laplacian variance (>100 = clear, <30 = blurry)
        brightness  : float — mean pixel brightness 0-255
        is_black    : bool  — True if mean brightness < 8
        is_overexposed: bool — True if mean brightness > 240
        is_usable   : bool  — True if not black, not overexposed, and not too blurry
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    is_black = brightness < 8
    is_overexposed = brightness > 240
    is_blurry = blur_score < 30
    is_usable = not is_black and not is_overexposed and not is_blurry

    return {
        "blur_score": round(blur_score, 2),
        "brightness": round(brightness, 2),
        "is_black": is_black,
        "is_overexposed": is_overexposed,
        "is_usable": is_usable,
    }


def quality_fail_reason(q: dict) -> str:
    """Return a human-readable reason why a frame failed quality check."""
    if q["is_black"]:
        return "black_screen"
    if q["is_overexposed"]:
        return "overexposed"
    if not q["is_usable"]:
        return "blur"
    return ""


# ---------------------------------------------------------------------------
# Shot change detection
# ---------------------------------------------------------------------------

def detect_shot_changes(
    video_path: str,
    sensitivity: float = 0.4,
    sample_every: int = 5,
) -> list:
    """
    Detect shot changes using grayscale histogram correlation.

    A shot change is recorded when the correlation between consecutive
    sampled frames drops below (1 - sensitivity).

    Args:
        video_path   : path to video file
        sensitivity  : 0.0 (detect nothing) to 1.0 (detect every small change)
        sample_every : analyse every N-th frame to save time

    Returns:
        List of timestamps (seconds) where shot changes occur.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return []

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    threshold = 1.0 - sensitivity

    cut_times = []
    prev_hist = None
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % sample_every == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            hist = cv2.calcHist([gray], [0], None, [64], [0, 256])
            cv2.normalize(hist, hist)

            if prev_hist is not None:
                corr = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_CORREL)
                if corr < threshold:
                    ts = round(frame_idx / fps, 2)
                    cut_times.append(ts)
            prev_hist = hist

        frame_idx += 1

    cap.release()
    return cut_times


# ---------------------------------------------------------------------------
# Face detection
# ---------------------------------------------------------------------------

def load_face_cascade():
    """Load OpenCV's built-in frontal face Haar cascade."""
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    cascade = cv2.CascadeClassifier(cascade_path)
    if cascade.empty():
        raise RuntimeError("Failed to load Haar cascade for face detection")
    return cascade


def detect_faces(frame, face_cascade) -> list:
    """
    Detect faces in a BGR frame using Haar Cascade.

    Returns list of dicts: [{"x": int, "y": int, "w": int, "h": int}, ...]
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30),
    )
    if len(faces) == 0:
        return []
    return [{"x": int(x), "y": int(y), "w": int(w), "h": int(h)} for x, y, w, h in faces]


# ---------------------------------------------------------------------------
# 9:16 crop suggestion
# ---------------------------------------------------------------------------

def suggest_9_16_crop(frame_w: int, frame_h: int, faces: list) -> dict:
    """
    Suggest an optimal 9:16 crop rectangle.

    If faces are detected, center the crop on the largest face.
    Otherwise, center the crop in the frame.

    Returns {"x": int, "y": int, "w": int, "h": int}
    """
    target_w = int(frame_h * 9 / 16)

    if target_w > frame_w:
        # Video is already narrower than 9:16 — crop height instead
        target_h = int(frame_w * 16 / 9)
        if faces:
            largest = max(faces, key=lambda f: f["w"] * f["h"])
            face_cy = largest["y"] + largest["h"] // 2
            y = max(0, min(face_cy - target_h // 2, frame_h - target_h))
        else:
            y = (frame_h - target_h) // 2
        return {"x": 0, "y": int(y), "w": frame_w, "h": int(target_h)}

    if faces:
        largest = max(faces, key=lambda f: f["w"] * f["h"])
        face_cx = largest["x"] + largest["w"] // 2
        x = max(0, min(face_cx - target_w // 2, frame_w - target_w))
    else:
        x = (frame_w - target_w) // 2

    return {"x": int(x), "y": 0, "w": int(target_w), "h": frame_h}


# ---------------------------------------------------------------------------
# Black border detection
# ---------------------------------------------------------------------------

def detect_black_borders(frame, threshold: int = 15) -> dict:
    """
    Detect black borders on all four sides of the frame.

    Scans row/column averages until a row/column exceeds the brightness threshold.

    Returns {"top": int, "bottom": int, "left": int, "right": int}
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape

    def scan_top(g):
        for i in range(h):
            if g[i, :].mean() > threshold:
                return i
        return h

    def scan_bottom(g):
        for i in range(h - 1, -1, -1):
            if g[i, :].mean() > threshold:
                return h - 1 - i
        return h

    def scan_left(g):
        for j in range(w):
            if g[:, j].mean() > threshold:
                return j
        return w

    def scan_right(g):
        for j in range(w - 1, -1, -1):
            if g[:, j].mean() > threshold:
                return w - 1 - j
        return w

    return {
        "top": scan_top(gray),
        "bottom": scan_bottom(gray),
        "left": scan_left(gray),
        "right": scan_right(gray),
    }


def borders_to_crop(borders: dict, frame_w: int, frame_h: int) -> dict:
    """Convert border sizes to a clean crop rectangle."""
    x = borders["left"]
    y = borders["top"]
    w = frame_w - borders["left"] - borders["right"]
    h = frame_h - borders["top"] - borders["bottom"]
    return {"x": max(0, x), "y": max(0, y), "w": max(0, w), "h": max(0, h)}


# ---------------------------------------------------------------------------
# Color tone
# ---------------------------------------------------------------------------

def analyze_color_tone(frame) -> str:
    """
    Classify the dominant color tone of a frame.

    Logic (BGR):
      - If mean brightness < 40: "dark"
      - Compare B vs R channel mean:
        - R >> B: "warm"
        - B >> R: "cool"
        - Otherwise: "neutral"
    """
    mean_b = float(frame[:, :, 0].mean())
    mean_g = float(frame[:, :, 1].mean())
    mean_r = float(frame[:, :, 2].mean())
    brightness = (mean_b + mean_g + mean_r) / 3

    if brightness < 40:
        return "dark"
    diff = mean_r - mean_b
    if diff > 15:
        return "warm"
    if diff < -15:
        return "cool"
    return "neutral"


# ---------------------------------------------------------------------------
# Perceptual hash (duplicate detection)
# ---------------------------------------------------------------------------

def compute_frame_hash(frame) -> str:
    """
    Compute a perceptual hash string for a BGR frame using imagehash.pHash.
    Falls back to a simple MD5-based hash if imagehash is unavailable.
    """
    try:
        import imagehash
        from PIL import Image
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb)
        return str(imagehash.phash(pil_img))
    except ImportError:
        # Fallback: resize to 8×8 and compute mean hash manually
        small = cv2.resize(frame, (8, 8))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        mean = gray.mean()
        bits = "".join("1" if p > mean else "0" for p in gray.flatten())
        return format(int(bits, 2), "016x")


def hash_distance(h1: str, h2: str) -> int:
    """
    Hamming distance between two hex hash strings.
    Lower = more similar (0 = identical).
    """
    try:
        i1 = int(h1, 16)
        i2 = int(h2, 16)
        xor = i1 ^ i2
        return bin(xor).count("1")
    except ValueError:
        return 64  # maximum distance on error


# ---------------------------------------------------------------------------
# Thumbnail extraction
# ---------------------------------------------------------------------------

def extract_thumbnail(frame, output_path: str, max_dim: int = 640):
    """
    Save a resized JPEG thumbnail from a BGR frame.
    Maintains aspect ratio, max dimension = max_dim px.
    """
    h, w = frame.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
    cv2.imwrite(output_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
