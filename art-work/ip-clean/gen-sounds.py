#!/usr/bin/env python3
"""Synthesize replacement SFX + short ambient loop (no third-party samples).

Keeps event mapping: bg, drop, split1-6, splitb1-10, stack1-14.
Target total ≈ 650KB MP3.
"""
from __future__ import annotations

import math
import struct
import subprocess
import wave
from pathlib import Path

OUT = Path("/workspace/public/assets/sounds")
SR = 22050


def write_wav(path: Path, samples):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = b"".join(struct.pack("<h", max(-32767, min(32767, int(s * 32767)))) for s in samples)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(raw)


def to_mp3(wav: Path, mp3: Path, bitrate="48k"):
    subprocess.check_call(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(wav),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            bitrate,
            str(mp3),
        ]
    )
    wav.unlink(missing_ok=True)


def env(t, attack, hold, release):
    if t < attack:
        return t / max(1e-6, attack)
    if t < attack + hold:
        return 1.0
    if t < attack + hold + release:
        return 1.0 - (t - attack - hold) / max(1e-6, release)
    return 0.0


def synth_impact(dur, freq0, freq1, noise=0.4, seed=1.0):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        # deterministic pseudo noise
        nse = math.sin(i * 12.9898 * seed) * 43758.5453
        nse = nse - math.floor(nse)
        nse = nse * 2 - 1
        f = freq0 + (freq1 - freq0) * (t / dur)
        tone = math.sin(2 * math.pi * f * t) * math.exp(-t * 8)
        click = nse * math.exp(-t * 40) * noise
        a = env(t, 0.002, 0.01, dur - 0.02)
        out.append((tone * 0.55 + click * 0.45) * a * 0.7)
    return out


def synth_wood_break(dur, seed=2.0):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        nse = math.sin(i * 78.233 * seed) * 43758.5453
        nse = nse - math.floor(nse)
        nse = nse * 2 - 1
        crack = 0.0
        for k in range(4):
            ft = 180 + k * 90 + seed * 17
            crack += math.sin(2 * math.pi * ft * t) * math.exp(-t * (6 + k * 3)) * (0.4 - k * 0.05)
        body = nse * math.exp(-t * 12)
        a = env(t, 0.001, 0.02, dur - 0.03)
        out.append((crack + body * 0.5) * a * 0.65)
    return out


def synth_stack(dur, pitch, seed=3.0):
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        nse = math.sin(i * 45.1 * seed) * 43758.5453
        nse = nse - math.floor(nse)
        nse = nse * 2 - 1
        thump = math.sin(2 * math.pi * pitch * t) * math.exp(-t * 14)
        rattle = nse * math.exp(-t * 25) * 0.35
        a = env(t, 0.002, 0.015, dur - 0.025)
        out.append((thump * 0.7 + rattle) * a * 0.6)
    return out


def synth_bg(dur=18.0):
    """Soft forest-ish pad + sparse birds (synthetic)."""
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        # low wind-ish noise filtered
        nse = math.sin(i * 2.17) * 43758.5453
        nse = nse - math.floor(nse)
        nse = nse * 2 - 1
        wind = nse * 0.04
        pad = (
            0.03 * math.sin(2 * math.pi * 110 * t)
            + 0.02 * math.sin(2 * math.pi * 164.8 * t)
            + 0.015 * math.sin(2 * math.pi * 220 * t)
        ) * (0.6 + 0.4 * math.sin(2 * math.pi * 0.05 * t))
        # sparse chirp
        chirp = 0.0
        for c in (2.5, 7.2, 11.8, 15.1):
            if abs(t - c) < 0.18:
                ct = t - c
                chirp += 0.08 * math.sin(2 * math.pi * (1800 + ct * 400) * ct) * math.exp(-ct * 18)
        out.append(max(-0.9, min(0.9, wind + pad + chirp)))
    return out


def main():
    tmp = Path("/tmp/ip-clean-sounds")
    tmp.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    # bg longer but heavily compressed
    wav = tmp / "bg.wav"
    write_wav(wav, synth_bg(16.0))
    to_mp3(wav, OUT / "bg.mp3", "40k")

    write_wav(tmp / "drop.wav", synth_impact(0.18, 90, 60, 0.5, 1.1))
    to_mp3(tmp / "drop.wav", OUT / "drop.mp3", "48k")

    for i in range(1, 7):
        write_wav(tmp / f"split{i}.wav", synth_impact(0.16 + i * 0.01, 140 - i * 8, 70, 0.45, 1.0 + i))
        to_mp3(tmp / f"split{i}.wav", OUT / f"split{i}.mp3", "48k")

    for i in range(1, 11):
        write_wav(tmp / f"splitb{i}.wav", synth_wood_break(0.22 + (i % 3) * 0.04, 2.0 + i * 0.3))
        to_mp3(tmp / f"splitb{i}.wav", OUT / f"splitb{i}.mp3", "48k")

    for i in range(1, 15):
        write_wav(tmp / f"stack{i}.wav", synth_stack(0.14 + (i % 4) * 0.02, 70 + i * 3, 3.0 + i))
        to_mp3(tmp / f"stack{i}.wav", OUT / f"stack{i}.mp3", "48k")

    total = sum(p.stat().st_size for p in OUT.glob("*.mp3"))
    print("sounds total", total, "bytes", round(total / 1024), "KB", "count", len(list(OUT.glob('*.mp3'))))


if __name__ == "__main__":
    main()
