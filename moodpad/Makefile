PYTHON ?= python3

.PHONY: sounds test open

# Regenerate the WAVs (needs numpy) and re-bundle them into sounds.js.
sounds:
	$(PYTHON) scripts/generate_sounds.py
	$(PYTHON) scripts/build_web_sounds.py

test:
	node --test test/engine.test.js

open:
	open index.html
