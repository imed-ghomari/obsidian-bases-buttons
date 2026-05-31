# Bases Buttons 1.0.1

## Fixes

- Fixed a DOM mutation loop that could make Obsidian unresponsive after adding a `button.<name>` property in frontmatter or as a Bases column.
- Button updates now skip DOM writes when the rendered label, template path, title, and aria label are already current.
- Bases buttons now resolve the row note at click time so late-rendered row links still target the correct file.

## Release

- Added a GitHub Actions release workflow that builds the plugin and uploads `main.js`, `manifest.json`, and `styles.css` when a version tag is pushed.
