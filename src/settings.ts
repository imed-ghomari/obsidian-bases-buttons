import { AbstractInputSuggest, App, Modal, PluginSettingTab, Setting, SettingDefinitionItem, TFile } from "obsidian";
import BasesButtonsPlugin from "./main";

export interface ButtonConfig {
	name: string;
	label: string;
	templatePath: string;
}

export interface BasesButtonsSettings {
	buttons: ButtonConfig[];
	confirmMobileRuns: boolean;
}

export const DEFAULT_SETTINGS: BasesButtonsSettings = {
	buttons: [],
	confirmMobileRuns: true
};

export class BasesButtonsSettingTab extends PluginSettingTab {
	plugin: BasesButtonsPlugin;

	constructor(app: App, plugin: BasesButtonsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Buttons",
				desc: "Define properties that display as buttons in Bases tables. Each button runs a Templater template against the note represented by that Base row. To use a button, add button.<name> as a property column in your Base view.",
			},
			{
				name: "Confirm on mobile",
				desc: "Ask for confirmation before running a button on mobile devices.",
				control: {
					type: "toggle",
					key: "confirmMobileRuns",
				},
			},
			{
				type: "list",
				heading: "Buttons",
				emptyState: "No buttons yet. Add your first button to run Templater templates from Bases.",
				addItem: {
					name: "Add button",
					action: () => this.openButtonModal(-1),
				},
				onDelete: (index: number) => {
					this.plugin.settings.buttons.splice(index, 1);
					void this.plugin.saveSettings().then(() => this.update());
				},
				onReorder: (oldIndex: number, newIndex: number) => {
					const buttons = this.plugin.settings.buttons;
					const [moved] = buttons.splice(oldIndex, 1);
					if (moved) {
						buttons.splice(newIndex, 0, moved);
						void this.plugin.saveSettings().then(() => this.update());
					}
				},
				items: this.plugin.settings.buttons.map((button) => {
					const shortName = button.name.replace(/^button\./, "");
					const displayName = button.label.trim() || shortName || "New button";
					const templateSummary = button.templatePath || "No template selected";
					return {
						name: displayName,
						desc: `${button.name || "button.<name>"} → ${templateSummary}`,
						aliases: [button.name, shortName, button.label, button.templatePath].filter((s): s is string => Boolean(s)),
						action: (liveIndex: number) => this.openButtonModal(liveIndex),
					};
				}),
			},
		];
	}

	private openButtonModal(index: number): void {
		if (index < 0) {
			this.plugin.settings.buttons.push({ name: "button.", label: "Run template", templatePath: "" });
			const newIndex = this.plugin.settings.buttons.length - 1;
			void this.plugin.saveSettings().then(() => {
				this.update();
				new ButtonEditModal(this.app, this.plugin, this, newIndex).open();
			});
			return;
		}
		new ButtonEditModal(this.app, this.plugin, this, index).open();
	}
}

class ButtonEditModal extends Modal {
	private plugin: BasesButtonsPlugin;
	private tab: BasesButtonsSettingTab;
	private index: number;

	constructor(app: App, plugin: BasesButtonsPlugin, tab: BasesButtonsSettingTab, index: number) {
		super(app);
		this.plugin = plugin;
		this.tab = tab;
		this.index = index;
	}

	private get button(): ButtonConfig | undefined {
		return this.plugin.settings.buttons[this.index];
	}

	onOpen(): void {
		const button = this.button;
		if (!button) {
			this.close();
			return;
		}

		const shortName = button.name.replace(/^button\./, "");
		this.titleEl.setText(button.label.trim() || shortName || "Edit button");
		this.contentEl.empty();

		new Setting(this.contentEl)
			.setName("Property name")
			.setDesc(`Add button.${shortName || "<name>"} as a property column in your Base view.`)
			.addText((text) => {
				text
					.setPlaceholder("Run")
					.setValue(shortName)
					.onChange(async (value) => {
						const normalized = value.replace(/^button\./, "").trim();
						button.name = `button.${normalized}`;
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.contentEl)
			.setName("Button label")
			.setDesc("The text shown on the button.")
			.addText((text) => {
				text
					.setPlaceholder("Run template")
					.setValue(button.label)
					.onChange(async (value) => {
						button.label = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.contentEl)
			.setName("Templater file")
			.setDesc("Start typing a template file path and choose a Markdown file from the suggestions.")
			.addSearch((search) => {
				new TemplateFileSuggest(this.app, search.inputEl, async (file) => {
					button.templatePath = file.path;
					search.setValue(file.path);
					await this.plugin.saveSettings();
				});

				search
					.setPlaceholder("Templates/Button action.md")
					.setValue(button.templatePath)
					.onChange(async (value) => {
						button.templatePath = value.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(this.contentEl)
			.addButton((btn) =>
				btn.setButtonText("Done").setCta().onClick(() => this.close())
			);
	}

	onClose(): void {
		this.contentEl.empty();
		this.tab.update();
	}
}

class TemplateFileSuggest extends AbstractInputSuggest<TFile> {
	private onChoose: (file: TFile) => void | Promise<void>;

	constructor(app: App, inputEl: HTMLInputElement, onChoose: (file: TFile) => void | Promise<void>) {
		super(app, inputEl);
		this.onChoose = onChoose;
		this.limit = 20;
	}

	protected getSuggestions(query: string): TFile[] {
		const normalizedQuery = query.trim().toLowerCase();
		const markdownFiles = this.app.vault.getMarkdownFiles();

		if (!normalizedQuery) {
			return markdownFiles
				.filter(file => this.looksLikeTemplatePath(file.path))
				.slice(0, 20);
		}

		return markdownFiles
			.filter(file => file.path.toLowerCase().includes(normalizedQuery))
			.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile): void {
		void this.onChoose(file);
		this.close();
	}

	private looksLikeTemplatePath(path: string): boolean {
		return path.toLowerCase().includes("template");
	}
}
