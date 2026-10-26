#!/usr/bin/env python3
"""Generate every bundled MoodPad sound from scratch.

Needs only numpy and the standard library. No audio is downloaded or sampled:
each file is synthesised below. These are original works, released as CC0 1.0.

    python3 scripts/generate_sounds.py

Writes sounds/<character>/*.wav and sounds/manifest.json.
"""
import json
import wave
from pathlib import Path

import numpy as np

SR = 44100
OUT = Path(__file__).resolve().parent.parent / "sounds"
rng = np.random.default_rng(1234)


# ---------------------------------------------------------------- helpers

def t(d):
    return np.arange(int(SR * d)) / SR


def sweep(points, d):
    """Frequency curve through (position 0..1, Hz) keyframes."""
    xs, ys = zip(*points)
    return np.interp(np.linspace(0, 1, int(SR * d)), xs, ys)


def osc(freq, d, harmonics=(1.0,)):
    """Additive oscillator. `freq` is a number or a per-sample array in Hz."""
    n = int(SR * d)
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, dtype=float)
    phase = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros(n)
    for k, amp in enumerate(harmonics, start=1):
        out += amp * np.sin(k * phase)
    return out


def vowel(f0, d, formants, n_harm=30):
    """Glottal-ish buzz shaped by formant peaks (centre Hz, bandwidth Hz)."""
    n = int(SR * d)
    f = np.full(n, float(f0)) if np.isscalar(f0) else np.asarray(f0, dtype=float)
    phase = 2 * np.pi * np.cumsum(f) / SR
    out = np.zeros(n)
    for k in range(1, n_harm + 1):
        fk = k * f
        w = sum(np.exp(-((fk - fc) / bw) ** 2) for fc, bw in formants) + 0.03 / k
        out += (w / k ** 0.3) * np.sin(k * phase) * (fk < SR / 2.2)
    return out


def square(freq, d, n_harm=9):
    return osc(freq, d, [1 / k if k % 2 else 0 for k in range(1, n_harm + 1)])


def saw(freq, d, n_harm=14):
    return osc(freq, d, [1 / k for k in range(1, n_harm + 1)])


def noise(d):
    return rng.standard_normal(int(SR * d))


def lowpass(x, cutoff):
    k = max(1, int(SR / cutoff))
    return np.convolve(x, np.ones(k) / k, mode="same")


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def env(d, attack=0.005, release=0.05):
    n = int(SR * d)
    e = np.ones(n)
    a, r = min(int(SR * attack), n), min(int(SR * release), n)
    if a:
        e[:a] = np.linspace(0, 1, a, endpoint=False)
    if r:
        e[n - r:] *= np.linspace(1, 0, r)
    return e


def decay(d, tau):
    return np.exp(-t(d) / tau)


def silence(d):
    return np.zeros(int(SR * d))


def mix(length, *placed):
    """Overlay (start_seconds, signal) pairs on a silent canvas."""
    out = np.zeros(int(SR * length))
    for start, sig in placed:
        i = int(SR * start)
        j = min(len(out), i + len(sig))
        out[i:j] += sig[: j - i]
    return out


def finish(x, gain=0.8):
    x = x * env(len(x) / SR, 0.003, 0.006)
    peak = np.max(np.abs(x)) or 1.0
    return x / peak * gain


def write_wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# ---------------------------------------------------------------- wizard

def wizard_yawn():
    d = 1.3
    f = sweep([(0, 170), (0.3, 330), (0.5, 310), (1, 120)], d)
    voice = vowel(f, d, [(550, 250), (1100, 300)])
    breath = lowpass(noise(d), 2500) * 0.6
    body = (voice + breath) * env(d, 0.35, 0.45)
    return finish(body, 0.7)


def wizard_mumble():
    d = 0.32
    f = 125 + 18 * np.sin(2 * np.pi * 7 * t(d)) + sweep([(0, 0), (1, -25)], d)
    return finish(vowel(f, d, [(450, 200), (900, 250)]) * env(d, 0.04, 0.14), 0.6)


def wizard_chime():
    d = 0.6
    parts = [(1318.5, 1.0, 0.18), (1976.0, 0.5, 0.12), (2637.0, 0.3, 0.08), (3322.0, 0.15, 0.05)]
    x = sum(a * osc(f, d) * decay(d, tau) for f, a, tau in parts)
    return finish(x * env(d, 0.002, 0.1), 0.55)


# ---------------------------------------------------------------- robot

def robot_signature():
    a = square(660, 0.13) * env(0.13, 0.004, 0.02)
    b = square(990, 0.22) * env(0.22, 0.004, 0.08)
    x = mix(0.42, (0.0, a), (0.17, b))
    return finish(lowpass(x, 6000), 0.6)


def robot_beep(freq):
    def build():
        d = 0.07
        return finish(lowpass(square(freq, d), 5000) * env(d, 0.003, 0.02), 0.5)
    return build


def robot_servo():
    d = 0.24
    f = sweep([(0, 180), (0.5, 380), (1, 260)], d)
    x = saw(f, d, 10) * (0.6 + 0.4 * np.sin(2 * np.pi * 38 * t(d)))
    return finish(lowpass(x, 3500) * env(d, 0.02, 0.08), 0.5)


# ---------------------------------------------------------------- mouse

def squeak(points, d, gain=0.5):
    f = sweep(points, d)
    return finish(osc(f, d, [1, 0.25, 0.08]) * env(d, 0.008, 0.03), gain)


def tick(freq=2300, d=0.03):
    click = highpass(noise(d), 1500) * decay(d, 0.004)
    ping = osc(freq, d) * decay(d, 0.006) * 0.8
    return (click + ping) * env(d, 0.001, 0.004)


def mouse_ticks():
    return finish(tick(2000) , 0.5)


def mouse_signature():
    placed, at = [], 0.0
    for i in range(11):
        placed.append((at, tick(1800 + 90 * (i % 5)) * (0.7 + 0.03 * i)))
        at += 0.075 - 0.004 * i
    placed.append((at + 0.04, squeak([(0, 2600), (0.5, 3900), (1, 3300)], 0.12, 0.7)))
    return finish(mix(at + 0.25, *placed), 0.6)


# ---------------------------------------------------------------- goose

GOOSE_FORMANTS = [(700, 250), (1250, 300), (2300, 400)]


def goose_honk(base, d):
    def build():
        f = sweep([(0, base * 0.85), (0.25, base * 1.12), (1, base * 0.8)], d)
        x = vowel(f, d, GOOSE_FORMANTS) * (0.75 + 0.25 * np.sin(2 * np.pi * 85 * t(d)))
        x += lowpass(noise(d), 3000) * 0.08
        return finish(x * env(d, 0.015, 0.07), 0.8)
    return build


def goose_hiss(d):
    def build():
        x = highpass(noise(d), 1200)
        x = x * (0.8 + 0.2 * np.sin(2 * np.pi * 30 * t(d)))
        return finish(x * env(d, 0.03, d * 0.45), 0.55)
    return build


def goose_signature():
    hiss = goose_hiss(0.45)()
    honk = goose_honk(360, 0.34)()
    return finish(mix(0.85, (0.0, hiss), (0.42, honk)), 0.8)


# ---------------------------------------------------------------- cat

def cat_chirp(points, d):
    def build():
        f = sweep(points, d)
        return finish(osc(f, d, [1, 0.3, 0.1]) * env(d, 0.01, 0.04), 0.5)
    return build


def cat_purr():
    d = 0.5
    am = 0.55 + 0.45 * np.sign(np.sin(2 * np.pi * 26 * t(d)))
    x = (lowpass(noise(d), 450) * 2.5 + osc(110, d, [1, 0.5, 0.3])) * am
    return finish(x * env(d, 0.1, 0.2), 0.55)


def cat_meow(d, scale=1.0):
    def build():
        f = sweep([(0, 520 * scale), (0.28, 980 * scale), (0.65, 780 * scale), (1, 430 * scale)], d)
        x = vowel(f, d, [(900, 260), (2300, 400)]) + lowpass(noise(d), 4000) * 0.04
        return finish(x * env(d, 0.06, d * 0.35), 0.75)
    return build


# ---------------------------------------------------------------- owl

def owl_hum(freq):
    def build():
        d = 0.24
        x = osc(freq, d, [1, 0.3, 0.1]) * (0.85 + 0.15 * np.sin(2 * np.pi * 5 * t(d)))
        return finish(x * env(d, 0.05, 0.12), 0.5)
    return build


def owl_hoot(base=410, d=0.4):
    f = sweep([(0, base), (0.35, base * 1.03), (1, base * 0.82)], d)
    x = osc(f, d, [1, 0.18, 0.05]) * (0.9 + 0.1 * np.sin(2 * np.pi * 6 * t(d)))
    return finish(x * env(d, 0.07, 0.22), 0.7)


def owl_double_hoot():
    return finish(mix(1.05, (0.0, owl_hoot(430, 0.38)), (0.5, owl_hoot(380, 0.5))), 0.7)


# ---------------------------------------------------------------- catalogue
# (character, file, description, builder)

SOUNDS = [
    ("wizard", "signature", "Slow sleepy yawn", wizard_yawn),
    ("wizard", "key_mumble", "Low sleepy mumble", wizard_mumble),
    ("wizard", "key_chime", "Soft magical chime", wizard_chime),

    ("robot", "signature", "Two-tone acknowledgment", robot_signature),
    ("robot", "key_beep1", "Short digital beep", robot_beep(880)),
    ("robot", "key_beep2", "Higher short digital beep", robot_beep(1175)),
    ("robot", "key_servo", "Servo whirr", robot_servo),

    ("mouse", "signature", "Scurrying ticks ending in a squeak", mouse_signature),
    ("mouse", "key_squeak1", "Tiny rising squeak", lambda: squeak([(0, 2600), (0.5, 3600), (1, 3000)], 0.09)),
    ("mouse", "key_squeak2", "Tiny high squeak", lambda: squeak([(0, 3300), (1, 4300)], 0.07)),
    ("mouse", "key_tick", "Scurry tick", mouse_ticks),

    ("goose", "signature", "Angry hiss followed by a honk", goose_signature),
    ("goose", "key_honk1", "Short honk", goose_honk(360, 0.26)),
    ("goose", "key_honk2", "Higher short honk", goose_honk(440, 0.22)),
    ("goose", "backspace", "Angry hiss (played on backspace)", goose_hiss(0.35)),

    ("cat", "signature", "Long meow", cat_meow(0.8, 0.9)),
    ("cat", "key_chirp1", "Short chirp", cat_chirp([(0, 900), (0.4, 1500), (1, 1100)], 0.1)),
    ("cat", "key_chirp2", "Higher short chirp", cat_chirp([(0, 1100), (0.5, 1750), (1, 1000)], 0.12)),
    ("cat", "key_purr", "Short purr", cat_purr),
    ("cat", "first", "Meow (played on the first key of a burst)", cat_meow(0.5, 1.1)),

    ("owl", "signature", "Double hoot", owl_double_hoot),
    ("owl", "key_hum1", "Soft low hum", owl_hum(280)),
    ("owl", "key_hum2", "Soft higher hum", owl_hum(330)),
    ("owl", "space", "Single hoot (played on space)", lambda: owl_hoot()),
]


def main():
    manifest = []
    for character, name, description, build in SOUNDS:
        write_wav(OUT / character / f"{name}.wav", build())
        manifest.append({
            "file": f"{character}/{name}.wav",
            "character": character,
            "description": description,
            "source": "generated by scripts/generate_sounds.py",
            "license": "CC0-1.0",
        })
    (OUT / "manifest.json").write_text(json.dumps({"sounds": manifest}, indent=2) + "\n")
    print(f"Wrote {len(manifest)} sounds to {OUT}")


if __name__ == "__main__":
    main()
