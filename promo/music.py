#!/usr/bin/env python3
"""Original synthwave bed for the promo video (made here, no samples): pads, bass, arp and drums at 96 BPM.
Usage: python3 promo/music.py SECONDS OUT.wav"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR, BPM = 44100, 96
beat = 60 / BPM
dur = float(sys.argv[1])
n = int(dur * SR)
L = np.zeros(n); R = np.zeros(n)
rng = np.random.default_rng(7)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

def env(length, a, r):
    t = np.arange(length) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / r)
    return e

def saw(f, length, detune=0.0):
    t = np.arange(length) / SR
    return 2 * ((t * f * (1 + detune)) % 1) - 1

def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x)

def add(buf, start, x):
    s = int(start * SR)
    if s >= n: return
    e = min(n, s + len(x)); buf[s:e] += x[:e - s]

# Am - F - C - G, one bar each
chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
roots = [45, 41, 48, 43]
bar = 4 * beat
bars = int(dur / bar) + 1
for b in range(bars):
    t0 = b * bar
    ch = chords[b % 4]
    # Pad: detuned saws, slow attack, low-passed.
    ln = int(bar * SR * 1.1)
    pad = sum(saw(hz(m), ln, d) for m in ch for d in (-0.004, 0.004)) / 6
    pad = lp(pad, 1400) * env(ln, 0.5, 3.0) * 0.16
    add(L, t0, pad); add(R, t0, np.roll(pad, 300))
    # Bass: eighth notes on the root.
    for i in range(8):
        ln = int(beat / 2 * SR)
        x = lp(saw(hz(roots[b % 4] - 12), ln) + 0.5 * np.sign(np.sin(2 * np.pi * hz(roots[b % 4] - 12) * np.arange(ln) / SR)), 500)
        x *= env(ln, 0.003, 0.14) * 0.22
        add(L, t0 + i * beat / 2, x); add(R, t0 + i * beat / 2, x)
    # Arp from bar 2: chord tones an octave up, sixteenths, ping-pong.
    if b >= 2:
        for i in range(16):
            m = ch[[0, 1, 2, 1][i % 4]] + 12 + (12 if i % 8 >= 4 else 0)
            ln = int(beat / 4 * SR)
            x = lp(saw(hz(m), ln) + saw(hz(m), ln, 0.006), 3000) * env(ln, 0.002, 0.07) * 0.07
            add(L if i % 2 == 0 else R, t0 + i * beat / 4, x)
            add(R if i % 2 == 0 else L, t0 + i * beat / 4 + 0.18, x * 0.35)  # echo
    # Drums from bar 1.
    if b >= 1:
        for i in range(4):
            tb = t0 + i * beat
            ln = int(0.35 * SR); t = np.arange(ln) / SR
            kick = np.sin(2 * np.pi * (45 * t + 90 * (1 - np.exp(-t * 30)) / 30)) * np.exp(-t * 9) * 0.55
            add(L, tb, kick); add(R, tb, kick)
            if i % 2 == 1:
                ln = int(0.4 * SR); t = np.arange(ln) / SR
                sn = (lp(rng.standard_normal(ln), 6000) * np.exp(-t * 14) * 0.22 + np.sin(2 * np.pi * 190 * t) * np.exp(-t * 25) * 0.15)
                add(L, tb, sn); add(R, tb, sn * 0.9)
            for h in (0, 0.5):
                ln = int(0.06 * SR)
                hat = sosfilt(butter(2, 8000, 'high', fs=SR, output='sos'), rng.standard_normal(ln)) * np.exp(-np.arange(ln) / SR * 70) * 0.05
                add(L, tb + h * beat, hat * 0.7); add(R, tb + h * beat, hat)

mix = np.stack([L, R], 1)
# Fade in 1 s, out 2.5 s.
fade = np.ones(n); fade[:SR] = np.linspace(0, 1, SR); fade[-int(2.5 * SR):] = np.linspace(1, 0, int(2.5 * SR))
mix *= fade[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.85
wavfile.write(sys.argv[2], SR, (mix * 32767).astype(np.int16))
