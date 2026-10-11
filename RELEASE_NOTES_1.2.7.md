# Bases Buttons 1.2.7

## Compliance fixes

- Use `activeDocument` / `activeWindow` instead of `document` / `window` for pop-out window compatibility.
- Use cross-window safe `.instanceOf(HTMLElement)` / `.instanceOf(Node)` / `UIEvent.targetNode` checks.
- Removed unnecessary type assertion.
- Migrated settings from deprecated `display()` to declarative `getSettingDefinitions()` so settings are searchable on Obsidian 1.13.0+. Bumped `minAppVersion` to 1.13.0.
  - `Confirm on mobile` is now a bound toggle control.
  - Buttons are now a searchable list with add / delete / reorder; each button opens an edit dialog for property name, label, and Templater file.
- Added `package-lock.json` for reproducible builds (`npm ci` in release workflow).
- Added GitHub artifact attestations (`attest-build-provenance`) for `main.js`, `manifest.json`, `styles.css`.
