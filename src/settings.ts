import { App, PluginSettingTab, Setting } from "obsidian";
import BasesButtonsPlugin from "./main";

export interface ButtonConfig {
	name: string;
	label: string;
	templatePath: string;
}

export interface BasesButtonsSettings {
	buttons: ButtonConfig[];
}

export const DEFAULT_SETTINGS: BasesButtonsSettings = {
	buttons: []
};

export class BasesButtonsSettingTab extends PluginSettingTab {
	plugin: BasesButtonsPlugin;

	constructor(app: App, plugin: BasesButtonsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const headingDesc = document.createDocumentFragment();
		headingDesc.append(
			"Define properties that display as buttons in the Properties view and Bases tables. Each button runs a Templater template against the note represented by that property or Base row. To use a button in a Base, add ",
			headingDesc.createEl("code", { text: "button.<name>" }),
			" as a property column in your Base view."
		);
		new Setting(containerEl)
			.setName("Buttons")
			.setDesc(headingDesc)
			.setHeading();

		this.plugin.settings.buttons.forEach((button, index) => {
			const shortName = button.name.replace(/^button\./, "");

			new Setting(containerEl)
				.setName(button.label || shortName || "New button")
				.setHeading()
				.addExtraButton(btn => btn
					.setIcon("trash")
					.setTooltip("Delete this button")
					.onClick(async () => {
						this.plugin.settings.buttons.splice(index, 1);
						await this.plugin.saveSettings();
						this.display();
					})
				);

			const nameDesc = document.createDocumentFragment();
			nameDesc.append("Add ");
			const nameCode = nameDesc.createEl("code", { text: `button.${shortName || "<name>"}` });
			nameDesc.append(" as a property column in your Base view or as a property in note frontmatter.");

			const group = containerEl.createDiv({ cls: "bb-setting-group" });

			new Setting(group)
				.setName("Property name")
				.setDesc(nameDesc)
				.addText(text => text
					.setPlaceholder("run")
					.setValue(shortName)
					.onChange(async (value) => {
						const normalized = value.replace(/^button\./, "").trim();
						button.name = `button.${normalized}`;
						nameCode.textContent = `button.${normalized || "<name>"}`;
						await this.plugin.saveSettings();
					})
				);

			new Setting(group)
				.setName("Button label")
				.setDesc("The text shown on the button.")
				.addText(text => text
					.setPlaceholder("Run template")
					.setValue(button.label)
					.onChange(async (value) => {
						button.label = value;
						await this.plugin.saveSettings();
					})
				);

			new Setting(group)
				.setName("Templater file")
				.setDesc("Vault path to the Templater template file to run, for example Templates/Archive task.md.")
				.addText(text => text
					.setPlaceholder("Templates/Button action.md")
					.setValue(button.templatePath)
					.onChange(async (value) => {
						button.templatePath = value.trim();
						await this.plugin.saveSettings();
					})
				);
		});

		new Setting(containerEl)
			.addButton(btn => btn
				.setButtonText("Add button")
				.onClick(async () => {
					this.plugin.settings.buttons.push({ name: "button.", label: "Run template", templatePath: "" });
					await this.plugin.saveSettings();
					this.display();
				})
			);
	}
}
