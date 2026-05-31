import { App, Modal, Notice, normalizePath, Platform, Plugin, Setting, TFile } from "obsidian";
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
	private buttonTargets = new WeakMap<HTMLButtonElement, {
		config: ButtonConfig;
		row: HTMLElement;
		lastActivation: number;
	}>();

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new BasesButtonsSettingTab(this.app, this));
		this.registerBaseInteractionGuards();

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

		this.settings.confirmMobileRuns = loaded.confirmMobileRuns ?? DEFAULT_SETTINGS.confirmMobileRuns;
	}

	async saveSettings() {
		await this.saveData(this.settings);
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

		if (buttonEl.disabled) {
			return;
		}

		buttonEl.disabled = true;
		buttonEl.addClass("is-loading");

		try {
			if (this.settings.confirmMobileRuns && Platform.isMobile) {
				const confirmed = await new MobileRunConfirmationModal(this.app, this.getButtonLabel(config), targetFile.basename).waitForChoice();
				if (!confirmed) return;
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

		const parentRoot = el.closest<HTMLElement>(".bases-td, .bases-view");
		if (parentRoot) return parentRoot;

		if (el.matches(".bases-td, .bases-view")) return el;
		if (el.querySelector(".bases-td, .bases-view")) return el;

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

	private injectIntoBaseCell(cell: HTMLElement, row: HTMLElement, config: ButtonConfig) {
		const buttonEl = this.createButton(config);
		buttonEl.classList.add("mod-base");
		this.buttonTargets.set(buttonEl, { config, row, lastActivation: 0 });
		cell.appendChild(buttonEl);
	}

	private getFileFromBaseRow(row: HTMLElement): TFile | null {
		const link = row.querySelector<HTMLElement>(".internal-link[data-href]");
		const href = link?.getAttribute("data-href");
		const file = href ? this.app.metadataCache.getFirstLinkpathDest(href, "") : null;
		return file instanceof TFile ? file : null;
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

	private registerBaseInteractionGuards() {
		const stopButtonSelection = (event: Event) => {
			const button = this.getEventButton(event);
			if (!button) return;

			event.preventDefault();
			event.stopImmediatePropagation();
		};

		const activateButton = (event: Event) => {
			const button = this.getEventButton(event);
			if (!button) return;

			event.preventDefault();
			event.stopImmediatePropagation();
			this.activateButton(button);
		};

		this.registerDomEvent(window, "pointerdown", stopButtonSelection, { capture: true });
		this.registerDomEvent(document, "pointerdown", stopButtonSelection, { capture: true });
		this.registerDomEvent(window, "mousedown", stopButtonSelection, { capture: true });
		this.registerDomEvent(document, "mousedown", stopButtonSelection, { capture: true });
		this.registerDomEvent(window, "touchstart", stopButtonSelection, { capture: true });
		this.registerDomEvent(document, "touchstart", stopButtonSelection, { capture: true });
		this.registerDomEvent(window, "dblclick", stopButtonSelection, { capture: true });
		this.registerDomEvent(document, "dblclick", stopButtonSelection, { capture: true });

		this.registerDomEvent(window, "pointerup", activateButton, { capture: true });
		this.registerDomEvent(document, "pointerup", activateButton, { capture: true });
		this.registerDomEvent(window, "click", activateButton, { capture: true });
		this.registerDomEvent(document, "click", activateButton, { capture: true });

		this.registerDomEvent(window, "keydown", (event) => this.handleKeyboardActivation(event), { capture: true });
		this.registerDomEvent(document, "keydown", (event) => this.handleKeyboardActivation(event), { capture: true });
	}

	private handleKeyboardActivation(event: KeyboardEvent) {
		if (event.key !== "Enter") return;

		const button = this.getEventButton(event) ?? this.getSelectedBaseButton(event);
		if (!button) return;

		event.preventDefault();
		event.stopImmediatePropagation();
		this.activateButton(button);
	}

	private getEventButton(event: Event): HTMLButtonElement | null {
		const target = event.target;
		if (!(target instanceof HTMLElement)) return null;

		const button = target.closest<HTMLButtonElement>(".bases-buttons-plugin-button");
		return button && this.buttonTargets.has(button) ? button : null;
	}

	private getSelectedBaseButton(event: Event): HTMLButtonElement | null {
		const target = event.target instanceof HTMLElement ? event.target : document.activeElement;
		const root = target?.closest<HTMLElement>(".bases-view") ?? document;
		const targetCell = target?.closest<HTMLElement>(".bases-td");
		const selectedCell = targetCell?.querySelector(".bases-buttons-plugin-button")
			? targetCell
			: root.querySelector<HTMLElement>([
				".bases-td.is-selected",
				".bases-td.mod-selected",
				".bases-td.is-focused",
				".bases-td.mod-focused",
				".bases-td[aria-selected='true']",
				".bases-td[aria-current='true']",
				".bases-td[tabindex='0']"
			].join(", "));

		const button = selectedCell?.querySelector<HTMLButtonElement>(".bases-buttons-plugin-button") ?? null;
		return button && this.buttonTargets.has(button) ? button : null;
	}

	private activateButton(button: HTMLButtonElement) {
		const target = this.buttonTargets.get(button);
		if (!target || button.disabled) return;

		const now = Date.now();
		if (now - target.lastActivation < 500) return;
		target.lastActivation = now;

		void this.runButton(target.config, this.getFileFromBaseRow(target.row), button);
	}
}

class MobileRunConfirmationModal extends Modal {
	private buttonLabel: string;
	private fileName: string;
	private resolveChoice: (confirmed: boolean) => void = () => undefined;
	private settled = false;

	constructor(app: App, buttonLabel: string, fileName: string) {
		super(app);
		this.buttonLabel = buttonLabel;
		this.fileName = fileName;
	}

	waitForChoice(): Promise<boolean> {
		return new Promise(resolve => {
			this.resolveChoice = resolve;
			this.open();
		});
	}

	onOpen() {
		this.titleEl.setText("Run button?");
		this.contentEl.empty();
		this.contentEl.createEl("p", {
			text: `Run "${this.buttonLabel}" on "${this.fileName}"?`
		});

		new Setting(this.contentEl)
			.addButton(button => button
				.setButtonText("Cancel")
				.onClick(() => this.choose(false))
			)
			.addButton(button => button
				.setButtonText("Run")
				.setCta()
				.onClick(() => this.choose(true))
			);
	}

	onClose() {
		this.choose(false);
	}

	private choose(confirmed: boolean) {
		if (this.settled) return;
		this.settled = true;
		this.resolveChoice(confirmed);
		this.close();
	}
}
