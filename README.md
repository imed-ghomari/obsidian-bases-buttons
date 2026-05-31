# Obsidian Bases Buttons Plugin

This is a plugin for [Obsidian](https://obsidian.md) that lets you define button properties, such as `button.run`, which render as clickable buttons in core Bases tables.

Each button runs a configured [Templater](https://github.com/SilentVoid13/Templater) template against the note represented by the property or Base row.

## Requirements

- Obsidian 1.8.0 or later.
- The community Templater plugin must be installed and enabled.

## Features

- **Global button configuration**: Define a button property, visible label, and Templater file path in one place.
- **Template file suggestions**: Start typing a template path in settings and choose from matching Markdown files.
- **Obsidian Bases support**: Injects buttons into matching Bases table cells only.
- **Keyboard support**: Press Enter on a selected button cell to run the button.
- **Mobile confirmation**: Optionally confirm before running buttons on mobile, enabled by default.
- **Row-aware execution**: Buttons clicked from a Base target the note in that Base row, even when that note is not open.
- **Templater integration**: Runs the configured Templater file through Templater's file-writing API so templates can update frontmatter or append content to the target note.

## How to use

1. Install and enable the Templater community plugin.
2. Enable this plugin in your Obsidian vault.
3. Go to **Settings > Bases Buttons**.
4. Keep **Confirm on mobile** enabled if you want a confirmation dialog before mobile button runs.
5. Click **Add button**.
6. Enter a property name, for example `run`; the plugin will use `button.run`.
7. Enter the button label to show in Bases.
8. Start typing the Templater file path and select a template from the suggestions, for example `Templates/Archive task.md`.
9. Add `button.run` as a property column in a Base.

The plugin does not render buttons in note frontmatter. It only renders buttons inside Bases tables.

When clicked, tapped, or activated with Enter from a selected button cell, the button runs the configured Templater file against the note for that Base row. In templates, prefer `tp.config.target_file` when you need the note that was clicked from a Base. The active file may be the Base itself or another open note.

Example Templater snippet:

```md
<%*
await app.fileManager.processFrontMatter(tp.config.target_file, (frontmatter) => {
	frontmatter.done = true;
	frontmatter.completed = tp.date.now("YYYY-MM-DD");
});
%>
```

## Manual installation

Since this plugin is not yet in the community directory, you can install it manually:

1. Download the latest release from the Releases page on GitHub.
2. Extract the archive into your vault's plugins folder: `<vault>/.obsidian/plugins/bases-buttons/`.
   - Ensure the folder contains `main.js`, `manifest.json`, and `styles.css`.
3. Reload Obsidian.
4. Go to **Settings > Community plugins** and turn off "Safe mode".
5. Enable the "Bases Buttons" plugin.

## Local development

If you want to build the plugin from source:

1. Clone this repository into your plugins directory.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start compilation in watch mode, or `npm run build` for a production build.

## Compatibility

This plugin manipulates the DOM of Bases views, so it may require updates if the Obsidian core UI changes significantly in future versions.

## Credits

Created by Imed Ghomari. This plugin is based on the original Custom Selectors plugin by hodie.

## License

This project is provided under the MIT License.
