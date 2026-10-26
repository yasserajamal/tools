# Contributing to MoodPad

Thanks for helping. MoodPad reads *how* people type, never *what*, so keep that in mind with every change.

## Ground rules

- **Privacy first.** A key's identity is read only in `categorize()` in [`index.html`](index.html), which turns it into a category and a pitch offset and keeps neither. Nothing else may read, store, log or send a key or character.
- **No network requests and no analytics.** No CDNs, web fonts or trackers; the page must work offline from disk.
- Run `make test` before opening a PR. Engine changes need tests.

## Add a character

1. Add its rule to `classify` in [`mood-engine.js`](mood-engine.js), in the right priority position, with any new thresholds in `DEFAULT_CONFIG`.
2. Add it to `CHARACTERS` and `CAST_ORDER` in `index.html`, plus an `<symbol id="s-<name>">` mascot in the SVG sprite at the top of the page.
3. Add sounds under `sounds/<name>/` (see below) via `scripts/generate_sounds.py`, then run `make sounds`.
4. Add tests for the trigger and its interaction with the characters above and below it.
5. Add it to the README table.

## Sounds and packs

A character folder holds:

| File | Required | Plays |
| --- | --- | --- |
| `signature.wav` | yes | when the character takes over |
| `key_*.wav` (2 to 4) | yes | on ordinary keys, chosen at random |
| `backspace.wav` | no | on backspace |
| `space.wav` | no | on space |
| `first.wav` | no | on the first key of a burst |

**Any sound you contribute must be CC0 or entirely your own original work, and needs an entry in [`sounds/manifest.json`](sounds/manifest.json)** with `file`, `character`, `description`, `source` and `license`. No samples from sound libraries, games, films or other people's recordings unless explicitly CC0. Prefer adding a generator to `scripts/generate_sounds.py` so the sound is reproducible; the script rewrites the manifest.
