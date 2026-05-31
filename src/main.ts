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
	private injectTimer: number | null = null;
	private pendingInjectionRoots = new Set<HTMLElement | Document>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BasesButtonsSettingTab(this.app, this));

		this.observer = new MutationObserver((mutations) => {
			this.handleMutations(mutations);
		});

		this.app.workspace.onLayoutReady(() => {
			this.startObserver();
			this.injectButtons(document.body);
		});
	}

	onunload() {
		if (this.injectTimer !== null) {
			window.clearTimeout(this.injectTimer);
			this.injectTimer = null;
		}
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
		const propertyContainers = this.queryWithSelf<HTMLElement>(container, ".metadata-property");
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
			const cells = this.queryWithSelf<HTMLElement>(container, `.bases-td[data-property="${dataProperty}"]`);

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
		for (const mutation of mutations) {
			if (mutation.type !== "childList" || mutation.addedNodes.length === 0) continue;
			if (mutation.target instanceof HTMLElement && mutation.target.closest(".bases-buttons-plugin-button")) continue;

			Array.from(mutation.addedNodes).forEach(node => {
				const root = this.getInjectionRoot(node);
				if (root) this.queueInject(root);
			});
		}
	}

	private startObserver() {
		this.observer.observe(document.body, { childList: true, subtree: true });
	}

	private queueInject(root: HTMLElement | Document) {
		this.pendingInjectionRoots.add(root);
		if (this.injectTimer !== null) return;

		this.injectTimer = window.setTimeout(() => {
			this.injectTimer = null;
			const roots = Array.from(this.pendingInjectionRoots);
			this.pendingInjectionRoots.clear();
			this.injectWithoutObserving(roots);
		}, 50);
	}

	private injectWithoutObserving(roots: Array<HTMLElement | Document>) {
		this.observer.disconnect();
		roots.forEach(root => {
			if (root instanceof Document || root.isConnected) {
				this.injectButtons(root);
			}
		});
		this.startObserver();
	}

	private getInjectionRoot(node: Node): HTMLElement | null {
		if (this.isOwnButtonNode(node)) return null;

		const el = node instanceof HTMLElement ? node : node.parentElement;
		if (!el) return null;

		const parentRoot = el.closest<HTMLElement>(".metadata-property, .bases-td, .bases-view");
		if (parentRoot) return parentRoot;

		if (el.matches(".metadata-property, .bases-td, .bases-view")) return el;
		if (el.querySelector(".metadata-property, .bases-td, .bases-view")) return el;

		return null;
	}

	private isOwnButtonNode(node: Node): boolean {
		if (node instanceof HTMLElement) {
			return node.matches(".bases-buttons-plugin-button") || node.closest(".bases-buttons-plugin-button") !== null;
		}

		return node.parentElement?.closest(".bases-buttons-plugin-button") !== null;
	}

	private queryWithSelf<T extends Element>(container: HTMLElement | Document, selector: string): T[] {
		const matches = Array.from(container.querySelectorAll<T>(selector));
		if (container instanceof HTMLElement && container.matches(selector)) {
			matches.unshift(container as unknown as T);
		}
		return matches;
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
		const buttonEl = this.createButton(config);
		buttonEl.classList.add("mod-base");

		buttonEl.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();

			const link = row.querySelector<HTMLElement>(".internal-link[data-href]");
			const href = link?.getAttribute("data-href");
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
		this.updateButton(buttonEl, config);
		return buttonEl;
	}

	private updateButton(buttonEl: HTMLButtonElement, config: ButtonConfig) {
		const label = this.getButtonLabel(config);
		const title = config.templatePath ? `Run ${config.templatePath}` : "No Templater file set";
		const ariaLabel = `${label} using ${config.templatePath || "no template set"}`;

		if (buttonEl.dataset.label !== label) {
			buttonEl.textContent = label;
			buttonEl.dataset.label = label;
		}

		if (buttonEl.dataset.templatePath !== config.templatePath) {
			buttonEl.dataset.templatePath = config.templatePath;
		}

		if (buttonEl.getAttribute("title") !== title) {
			buttonEl.setAttribute("title", title);
		}

		if (buttonEl.getAttribute("aria-label") !== ariaLabel) {
			buttonEl.setAttribute("aria-label", ariaLabel);
		}
	}

	private getButtonLabel(config: ButtonConfig): string {
		return config.label.trim() || config.name.replace(/^button\./, "") || "Run template";
	}
}
