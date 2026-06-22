import { AbstractInputSuggest, App, PluginSettingTab, Setting, SettingDefinitionItem, TFile } from "obsidian";
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
		const defs: SettingDefinitionItem[] = [];

		const headingDesc = (activeDocument ?? document).createDocumentFragment();
		headingDesc.append(
			"Define properties that display as buttons in Bases tables. Each button runs a Templater template against the note represented by that Base row. To use a button, add ",
			headingDesc.createEl("code", { text: "button.<name>" }),
			" as a property column in your Base view."
		);

		defs.push({
			name: "Buttons",
			desc: headingDesc,
			render: (setting) => {
				setting.setHeading();
			}
		});

		defs.push({
			name: "Confirm on mobile",
			desc: "Ask for confirmation before running a button on mobile devices.",
			render: (setting) => {
				setting.addToggle(toggle => toggle
					.setValue(this.plugin.settings.confirmMobileRuns)
					.onChange(async (value) => {
						this.plugin.settings.confirmMobileRuns = value;
						await this.plugin.saveSettings();
					})
				);
			}
		});

		this.plugin.settings.buttons.forEach((button, index) => {
			const shortName = button.name.replace(/^button\./, "");

			defs.push({
				name: button.label || shortName || "New button",
				render: (setting) => {
					setting.setHeading()
						.addExtraButton(btn => btn
							.setIcon("trash")
							.setTooltip("Delete this button")
							.onClick(async () => {
								this.plugin.settings.buttons.splice(index, 1);
								await this.plugin.saveSettings();
								this.update();
							})
						);
				}
			});

			defs.push({
				type: "group",
				cls: "bb-setting-group",
				items: [
					{
						name: "Property name",
						render: (setting) => {
							const frag = (activeDocument ?? document).createDocumentFragment();
							frag.append("Add ");
							const code = frag.createEl("code", { text: `button.${shortName || "<name>"}` });
							frag.append(" as a property column in your Base view.");
							setting.setDesc(frag);
							setting.addText(text => text
								.setPlaceholder("run")
								.setValue(shortName)
								.onChange(async (value) => {
									const normalized = value.replace(/^button\./, "").trim();
									button.name = `button.${normalized}`;
									const newFrag = (activeDocument ?? document).createDocumentFragment();
									newFrag.append("Add ");
									newFrag.createEl("code", { text: `button.${normalized || "<name>"}` });
									newFrag.append(" as a property column in your Base view.");
									setting.setDesc(newFrag);
									await this.plugin.saveSettings();
								})
							);
						}
					},
					{
						name: "Button label",
						desc: "The text shown on the button.",
						render: (setting) => {
							setting.addText(text => text
								.setPlaceholder("Run template")
								.setValue(button.label)
								.onChange(async (value) => {
									button.label = value;
									await this.plugin.saveSettings();
								})
							);
						}
					},
					{
						name: "Templater file",
						desc: "Start typing a template file path and choose a Markdown file from the suggestions.",
						render: (setting) => {
							setting.addSearch(search => {
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
						}
					}
				]
			});
		});

		defs.push({
			name: "",
			render: (setting) => {
				setting.addButton(btn => btn
					.setButtonText("Add button")
					.onClick(async () => {
						this.plugin.settings.buttons.push({ name: "button.", label: "Run template", templatePath: "" });
						await this.plugin.saveSettings();
						this.update();
					})
				);
			}
		});

		return defs;
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
