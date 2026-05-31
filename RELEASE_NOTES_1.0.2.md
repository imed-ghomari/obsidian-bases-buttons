# Bases Buttons 1.0.2

## Fixes

- Further reduced the risk of Obsidian becoming unresponsive when adding `button.<name>` properties or Bases columns.
- Injection now scans only changed Properties and Bases subtrees instead of rescanning the whole document on every mutation.
- The mutation observer disconnects while plugin buttons are injected, preventing the plugin from reacting to its own DOM writes.
- Cleared community review warnings by pinning the `obsidian` package, removing `!important` CSS declarations, and shortening the manifest description.
