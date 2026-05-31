# Bases Buttons 1.1.0

## Changes

- Buttons now render only in Bases tables, not in note frontmatter Properties.
- Added template file suggestions in settings when choosing the Templater file path.
- Hardened Bases button activation so clicks run the configured template instead of selecting the Base row.
- Button activation targets the note represented by the clicked Base row.

## Fixes

- Keeps the scoped DOM injection fix from 1.0.2 to avoid the previous Bases column freeze.
