# Bases Buttons 1.2.8

## Review fixes

- Reworded Templater notice to sentence case without disabling the `sentence-case` rule.
- Reverted timer calls to `window.setTimeout()` / `window.clearTimeout()` per review guidance.
- Replaced `document.createElement` with Obsidian `createEl()` helper for button creation.
