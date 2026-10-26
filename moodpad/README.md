# MoodPad

Free writing, with feelings. A writing pad whose characters and sounds react to *how* you type, never *what* you type.

![MoodPad demo](docs/demo.gif)

**Try it: [yasserjamal.com/tools/moodpad](https://yasserjamal.com/tools/moodpad)** (or open `index.html`; no install or server needed).

| | | |
| --- | --- | --- |
| ![Angry goose](docs/screenshots/goose.png) | ![Distracted cat](docs/screenshots/cat.png) | ![Wise owl](docs/screenshots/owl.png) |
| Backspacing wakes the goose | A burst after a pause: the cat | Thinking pauses: the owl |

Six characters (goose, cat, owl, wizard, mouse and robot) take over based on backspaces, bursts, speed and rhythm. Thresholds live in [`mood-engine.js`](mood-engine.js).

**Privacy:** only key timing and category are used, never the key itself ([where keys are read](index.html#L355)). No network requests; your text stays in your browser.

`make test` runs the tests. See [CONTRIBUTING.md](CONTRIBUTING.md). Code is MIT; sounds are CC0.
