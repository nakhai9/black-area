"""Helicopter engine loop: rotor blade chop ("whop-whop") and a faint turbine whine, no hum.

Writes ui/public/sounds/engine-heli.wav (4 s, 22050 Hz mono, loops seamlessly).
Run: python tools/heli_rotor_sound.py
"""
import wave
from pathlib import Path

import numpy as np

SR = 22050
SECONDS = 4.0
CHOP_HZ = 7.0  # blade passes per second (28 chops in 4 s: whole number, so the loop is seamless)
rng = np.random.default_rng(7)

n = int(SR * SECONDS)
out = np.zeros(n)
period = SR / CHOP_HZ
length = int(0.07 * SR)  # each chop: a short slap of air, silence in between
t = np.arange(length) / SR
env = np.exp(-t / 0.018) * (1 - np.exp(-t / 0.002))
for k in range(int(SECONDS * CHOP_HZ)):
    start = int(k * period)
    noise = rng.standard_normal(length)
    # Band-limit the noise to 80-700 Hz (a soft "whop", nothing shrill): moving-average low-pass minus a slower one.
    low = np.convolve(noise, np.ones(16) / 16, mode='same')
    lower = np.convolve(noise, np.ones(140) / 140, mode='same')
    slap = (low - lower) * 2.2 + np.sin(2 * np.pi * 90 * t) * 0.5  # air slap + low thud of the blade
    gain = 0.9 + 0.1 * rng.random()
    seg = slap * env * gain
    end = min(n, start + length)
    out[start:end] += seg[: end - start]

# Turbine whine ("iiii"): one soft steady tone with a slow gentle wobble, well under the chop so it is never shrill.
# A whole number of cycles in the loop (WHINE_HZ * SECONDS) and of wobble cycles keeps the loop seamless.
WHINE_HZ = 1100.0
WHINE_LEVEL = 0.015  # share of the chop's peak
tt = np.arange(n) / SR
whine = np.sin(2 * np.pi * WHINE_HZ * tt + 0.6 * np.sin(2 * np.pi * 0.5 * tt))
out = out / np.max(np.abs(out)) + whine * WHINE_LEVEL
out /= np.max(np.abs(out)) / 0.8
pcm = (out * 32767).astype(np.int16)
path = Path(__file__).resolve().parent.parent / 'ui' / 'public' / 'sounds' / 'engine-heli.wav'
with wave.open(str(path), 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', path)
