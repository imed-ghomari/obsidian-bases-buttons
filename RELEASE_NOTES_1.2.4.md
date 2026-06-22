# Bases Buttons 1.2.4

## Fixes & Improvements

- **UI Fix**: Buttons inside the Bases table now properly scroll under sticky column/row headers instead of floating over them.
- **Performance**: Optimized the internal DOM mutation observer to only watch the Obsidian workspace, rather than the entire application window. This significantly reduces background CPU usage when typing or interacting with other parts of Obsidian.
