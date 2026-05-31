import { App, Notice, normalizePath, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { BasesButtonsSettings, DEFAULT_SETTINGS, BasesButtonsSettingTab, ButtonConfig } from "./settings";

interface TemplaterRuntime {
	write_template_to_file?: (templateFile: TFile, targetFile: TFile) => Promise<void>;
}

interface TemplaterPluginApi {
	templater?: TemplaterRuntime;
}

interface AppWithPlugins extends App {
	plugins?: {
		getPlugin?: (id: string) => unknown;
		plugins?: Record<string, unknown>;
	};
}

export default class BasesButtonsPlugin extends Plugin {
	settings: BasesButtonsSettings;
	observer: MutationObserver;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BasesButtonsSettingTab(this.app, this));

		this.observer = new MutationObserver((mutations) => {
			this.handleMutations(mutations);
		});

		this.app.workspace.onLayoutReady(() => {
			this.observer.observe(document.body, { childList: true, subtree: true });
			this.injectButtons(document.body);
		});
	}

	onunload() {
		this.observer?.disconnect();
	}

	async loadSettings() {
		const loaded = await this.loadData() as Partial<BasesButtonsSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

		if (!Array.isArray(this.settings.buttons)) {
			this.settings.buttons = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Resolve the file associated with a DOM element by finding its parent
	 * workspace leaf. Falls back to getActiveFile() if the leaf can't be found.
	 */
	private getFileFromElement(el: HTMLElement): TFile | null {
		const leafEl = el.closest(".workspace-leaf");
		if (!leafEl) return this.app.workspace.getActiveFile();

		let targetFile: TFile | null = null;
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (leaf.view.containerEl.parentElement === leafEl) {
				const view = leaf.view;
				if ("file" in view && view.file instanceof TFile) {
					targetFile = view.file;
				}
			}
		});
		return targetFile ?? this.app.workspace.getActiveFile();
	}

	private getTemplaterPlugin(): TemplaterPluginApi | null {
		const plugins = (this.app as AppWithPlugins).plugins;
		const plugin = plugins?.getPlugin?.("templater-obsidian") ?? plugins?.plugins?.["templater-obsidian"];
		return (plugin as TemplaterPluginApi | undefined) ?? null;
	}

	private resolveTemplateFile(path: string): TFile | null {
		const trimmed = path.trim();
		if (!trimmed) return null;

		const normalized = normalizePath(trimmed);
		const candidates = normalized.endsWith(".md") ? [normalized] : [normalized, `${normalized}.md`];

		for (const candidate of candidates) {
			const file = this.app.vault.getAbstractFileByPath(candidate);
			if (file instanceof TFile) return file;

			const linkedFile = this.app.metadataCache.getFirstLinkpathDest(candidate, "");
			if (linkedFile instanceof TFile) return linkedFile;
		}

		return null;
	}

	private async runButton(config: ButtonConfig, targetFile: TFile | null, buttonEl: HTMLButtonElement) {
		if (!targetFile) {
			new Notice("No target note found for this button.");
			return;
		}

		const templaterPlugin = this.getTemplaterPlugin();
		const templaterRuntime = templaterPlugin?.templater;
		const writeTemplate = templaterRuntime?.write_template_to_file;
		if (typeof writeTemplate !== "function") {
			new Notice("Install and enable the Templater plugin to use Bases Buttons.");
			return;
		}

		const templateFile = this.resolveTemplateFile(config.templatePath);
		if (!(templateFile instanceof TFile)) {
			new Notice(`Template file not found: ${config.templatePath || "(not set)"}`);
			return;
		}

		buttonEl.disabled = true;
		buttonEl.addClass("is-loading");

		try {
			await writeTemplate.call(templaterRuntime, templateFile, targetFile);
			new Notice(`Ran ${this.getButtonLabel(config)} on ${targetFile.basename}.`);
		} catch (error) {
			console.error("Bases Buttons: Templater run failed", error);
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Templater failed: ${message}`);
		} finally {
			buttonEl.disabled = false;
			buttonEl.removeClass("is-loading");
		}
	}

	private injectButtons(container: HTMLElement | Document) {
		const propertyContainers = container.querySelectorAll(".metadata-property");
		propertyContainers.forEach((propEl) => {
			const keyEl = propEl.querySelector(".metadata-property-key-input") as HTMLInputElement;
			if (!keyEl) return;

			const key = keyEl.value || keyEl.textContent;
			if (!key) return;

			const buttonConfig = this.settings.buttons.find(button => button.name && button.name === key);
			if (!buttonConfig) return;

			const valueContainer = propEl.querySelector(".metadata-property-value");
			if (!valueContainer) return;

			const existingButton = valueContainer.querySelector<HTMLButtonElement>(".bases-buttons-plugin-button");
			if (existingButton) {
				this.updateButton(existingButton, buttonConfig);
				return;
			}

			this.replaceWithButton(valueContainer as HTMLElement, buttonConfig);
		});

		this.settings.buttons.forEach(buttonConfig => {
			if (!buttonConfig.name) return;

			const dataProperty = `note.${buttonConfig.name}`;
			const cells = container.querySelectorAll(`.bases-td[data-property="${dataProperty}"]`);

			cells.forEach(cellEl => {
				const cell = cellEl as HTMLElement;
				const existingButton = cell.querySelector<HTMLButtonElement>(".bases-buttons-plugin-button");
				if (existingButton) {
					this.updateButton(existingButton, buttonConfig);
					return;
				}

				const row = cell.closest(".bases-tr") as HTMLElement;
				if (!row) return;

				this.injectIntoBaseCell(cell, row, buttonConfig);
			});
		});
	}

	private handleMutations(mutations: MutationRecord[]) {
		let shouldInject = false;
		for (const mutation of mutations) {
			if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
				shouldInject = true;
				break;
			}
		}
		if (shouldInject) {
			this.injectButtons(document.body);
		}
	}

	private replaceWithButton(valueContainer: HTMLElement, config: ButtonConfig) {
		const children = Array.from(valueContainer.children);

		children.forEach((child: Element) => {
			if (child.classList.contains("bases-buttons-plugin-button")) return;

			if (child instanceof HTMLElement) {
				child.addClass("bb-hidden");
			}
		});

		const buttonEl = this.createButton(config);
		buttonEl.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			const file = this.getFileFromElement(valueContainer);
			void this.runButton(config, file, buttonEl);
		});

		valueContainer.appendChild(buttonEl);
	}

	private injectIntoBaseCell(cell: HTMLElement, row: HTMLElement, config: ButtonConfig) {
		const link = row.querySelector<HTMLElement>(".internal-link[data-href]");
		const href = link?.getAttribute("data-href");

		const buttonEl = this.createButton(config);
		buttonEl.classList.add("mod-base");

		buttonEl.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();

			const file = href ? this.app.metadataCache.getFirstLinkpathDest(href, "") : null;
			void this.runButton(config, file instanceof TFile ? file : null, buttonEl);
		});

		const stopInteraction = (e: Event) => {
			e.stopPropagation();
		};
		const evts = ["mousedown", "mouseup", "click", "pointerdown", "pointerup", "focusin"];
		evts.forEach(evt => {
			buttonEl.addEventListener(evt, stopInteraction);
			buttonEl.addEventListener(evt, stopInteraction, { capture: true });
		});

		cell.appendChild(buttonEl);
	}

	private createButton(config: ButtonConfig): HTMLButtonElement {
		const buttonEl = document.createElement("button");
		buttonEl.type = "button";
		buttonEl.classList.add("bases-buttons-plugin-button", "clickable-icon");
		buttonEl.setAttribute("aria-label", `${this.getButtonLabel(config)} using ${config.templatePath || "no template set"}`);
		this.updateButton(buttonEl, config);
		return buttonEl;
	}

	private updateButton(buttonEl: HTMLButtonElement, config: ButtonConfig) {
		buttonEl.textContent = this.getButtonLabel(config);
		buttonEl.dataset.templatePath = config.templatePath;
		buttonEl.setAttribute("title", config.templatePath ? `Run ${config.templatePath}` : "No Templater file set");
	}

	private getButtonLabel(config: ButtonConfig): string {
		return config.label.trim() || config.name.replace(/^button\./, "") || "Run template";
	}
}
