"""
audio_helper.py — librosa-based audio analysis utilities.

Provides:
  - load_audio          : load audio file as mono float32
  - analyze_beats       : extract tempo + beat timestamps
  - analyze_onsets      : detect onset / transient times
  - get_strong_beats    : filter beats that coincide with onsets
  - analyze_sections    : split track into energy-based sections
  - compute_cut_points  : sample beat_times every N beats
"""
import numpy as np


# ---------------------------------------------------------------------------
# Audio loading
# ---------------------------------------------------------------------------

def load_audio(audio_path: str) -> tuple:
    """
    Load an audio file as a mono float32 numpy array.

    Uses soundfile as primary backend; falls back to audioread if needed.
    Returns (y: np.ndarray, sr: int).
    """
    import librosa
    y, sr = librosa.load(audio_path, sr=None, mono=True)
    return y, sr


# ---------------------------------------------------------------------------
# Beat tracking
# ---------------------------------------------------------------------------

def analyze_beats(y: np.ndarray, sr: int) -> dict:
    """
    Extract global tempo and beat timestamps using librosa.beat.beat_track.

    Returns:
        {
            "tempo": float,               # BPM
            "beat_times": list[float],    # timestamps in seconds
            "avg_beat_interval": float    # mean seconds between beats
        }
    """
    import librosa

    tempo_arr, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    beat_times = librosa.frames_to_time(beat_frames, sr=sr).tolist()

    tempo = float(np.atleast_1d(tempo_arr)[0])
    intervals = np.diff(beat_times).tolist() if len(beat_times) > 1 else []
    avg_interval = float(np.mean(intervals)) if intervals else 0.0

    return {
        "tempo": round(tempo, 2),
        "beat_times": [round(t, 4) for t in beat_times],
        "avg_beat_interval": round(avg_interval, 4),
    }


# ---------------------------------------------------------------------------
# Onset detection
# ---------------------------------------------------------------------------

def analyze_onsets(y: np.ndarray, sr: int) -> list:
    """
    Detect onset (transient / hit) times using librosa.onset.onset_detect.

    Returns list of timestamps in seconds (float, rounded to 4dp).
    """
    import librosa

    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="frames")
    onset_times = librosa.frames_to_time(onset_frames, sr=sr).tolist()
    return [round(t, 4) for t in onset_times]


# ---------------------------------------------------------------------------
# Strong beat filtering
# ---------------------------------------------------------------------------

def get_strong_beats(
    beat_times: list,
    onset_times: list,
    tolerance: float = 0.05,
) -> list:
    """
    Filter beat_times to those that coincide with a detected onset.

    A beat is "strong" if there exists an onset within ±tolerance seconds.

    Args:
        beat_times  : all beat timestamps
        onset_times : onset timestamps
        tolerance   : window in seconds (default 50ms)

    Returns list of strong beat timestamps.
    """
    if not onset_times:
        return beat_times[:]

    onset_arr = np.array(onset_times)
    strong = []
    for bt in beat_times:
        dists = np.abs(onset_arr - bt)
        if dists.min() <= tolerance:
            strong.append(round(bt, 4))
    return strong


# ---------------------------------------------------------------------------
# Section analysis
# ---------------------------------------------------------------------------

def analyze_sections(y: np.ndarray, sr: int, n_segments: int = 8) -> list:
    """
    Divide the track into energy-based sections using RMS energy.

    Algorithm:
      1. Compute frame-level RMS energy
      2. Divide into n_segments equal time windows
      3. Classify each window as "high" or "low" energy relative to median
      4. Assign labels: intro / main / bridge / outro based on position and energy

    Returns list of:
        {"start": float, "end": float, "energy": "high"|"low", "label": str}
    """
    import librosa

    # Frame-level RMS
    rms = librosa.feature.rms(y=y)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
    duration = float(times[-1]) if len(times) > 0 else len(y) / sr

    # Split into n_segments windows
    window_size = duration / n_segments
    median_rms = float(np.median(rms))

    sections = []
    for i in range(n_segments):
        seg_start = round(i * window_size, 3)
        seg_end = round(min((i + 1) * window_size, duration), 3)

        # Get RMS values within this time window
        mask = (times >= seg_start) & (times < seg_end)
        seg_rms = rms[mask]
        seg_energy_val = float(seg_rms.mean()) if len(seg_rms) > 0 else 0.0
        energy = "high" if seg_energy_val >= median_rms else "low"

        # Heuristic label based on position
        label = _section_label(i, n_segments, energy)

        sections.append({
            "start": seg_start,
            "end": seg_end,
            "energy": energy,
            "label": label,
        })

    return sections


def _section_label(idx: int, total: int, energy: str) -> str:
    """Assign a human-readable label based on position and energy level."""
    if idx == 0:
        return "intro"
    if idx == total - 1:
        return "outro"
    if idx == 1 and energy == "low":
        return "verse"
    if idx == total - 2 and energy == "low":
        return "bridge"
    if energy == "high":
        return "chorus" if idx < total // 2 else "drop"
    return "verse"


# ---------------------------------------------------------------------------
# Cut point generation
# ---------------------------------------------------------------------------

def compute_cut_points(beat_times: list, every_n_beats: int = 2) -> list:
    """
    Sample beat_times every N beats to produce recommended video cut points.

    every_n_beats = 1 → every beat (very fast cuts)
    every_n_beats = 2 → every other beat (standard)
    every_n_beats = 4 → every 4 beats (slow / cinematic)

    Returns list of timestamps.
    """
    if not beat_times or every_n_beats < 1:
        return beat_times[:]
    return [round(beat_times[i], 4) for i in range(0, len(beat_times), every_n_beats)]
