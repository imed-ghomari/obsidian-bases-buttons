# Bases Buttons 1.2.1

## Fixes

- Removed hover tooltip text from Bases buttons.
- Matched button label sizing to the surrounding Bases cell text.
- Added direct cell-level Enter handling so selected button cells run on the first Enter press.
- Added stronger cell-level pointer guards so button presses do not also activate Bases cell selection.

## Notes

- Bases undo/redo integration is not included because the public plugin API does not expose the core Bases edit transaction stack, and button actions run arbitrary Templater scripts against files.
