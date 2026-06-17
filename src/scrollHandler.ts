import { MarkdownView, Plugin } from 'obsidian';
import { VaultWithConfig } from './types';

const DOUBLE_G_TIMEOUT_MS = 500;
const FALLBACK_LINE_HEIGHT_PX = 24;

export class ReadingModeScrollHandler {
	private lastGPressTime = 0;
	private plugin: Plugin;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	register(): void {
		this.plugin.registerDomEvent(activeDocument, 'keydown', (evt: KeyboardEvent) => {
			this.handleKeyDown(evt);
		});
	}

	private handleKeyDown(evt: KeyboardEvent): void {
		// Don't intercept keys when a modal/dialog is open or focus is in an input
		if (this.isFocusInModal(evt)) return;

		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== 'preview') return;
		if (!this.isVimModeEnabled()) return;

		const scrollEl = this.getScrollElement(view);
		if (!scrollEl) return;

		const { key, ctrlKey, metaKey, altKey } = evt;

		// Ignore combinations with Meta/Alt to avoid interfering with system shortcuts
		if (metaKey || altKey) return;

		if (!ctrlKey) {
			switch (key) {
				case 'j':
					evt.preventDefault();
					scrollEl.scrollTop += this.getLineHeight(scrollEl);
					break;
				case 'k':
					evt.preventDefault();
					scrollEl.scrollTop -= this.getLineHeight(scrollEl);
					break;
				case 'd':
					evt.preventDefault();
					this.scrollHalfPage(scrollEl, 1);
					break;
				case 'u':
					evt.preventDefault();
					this.scrollHalfPage(scrollEl, -1);
					break;
				case 'g': {
					evt.preventDefault();
					const now = Date.now();
					if (now - this.lastGPressTime <= DOUBLE_G_TIMEOUT_MS) {
						scrollEl.scrollTop = 0;
						this.lastGPressTime = 0;
					} else {
						this.lastGPressTime = now;
					}
					break;
				}
				case 'G':
					evt.preventDefault();
					scrollEl.scrollTop = scrollEl.scrollHeight;
					break;
			}
		} else {
			switch (key) {
				case 'd':
					evt.preventDefault();
					this.scrollHalfPage(scrollEl, 1);
					break;
				case 'u':
					evt.preventDefault();
					this.scrollHalfPage(scrollEl, -1);
					break;
			}
		}
	}

	private scrollHalfPage(scrollEl: HTMLElement, direction: 1 | -1): void {
		scrollEl.scrollTop += direction * (scrollEl.clientHeight / 2);
	}

	private isFocusInModal(evt: KeyboardEvent): boolean {
		const target = evt.target as HTMLElement;
		// Yield to any focused input-like element
		if (
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.tagName === 'SELECT' ||
			target.isContentEditable
		) return true;
		// Yield to Obsidian modals, prompts, and suggestion dropdowns
		if (target.closest('.modal-container, .prompt, .suggestion-container')) return true;
		// Yield if any modal overlay is currently visible in the DOM
		if (activeDocument.querySelector('.modal-container')) return true;
		return false;
	}

	private isVimModeEnabled(): boolean {
		return (this.plugin.app.vault as VaultWithConfig).getConfig('vimMode') === true;
	}

	private getScrollElement(view: MarkdownView): HTMLElement | null {
		return view.containerEl.querySelector<HTMLElement>('.markdown-preview-view');
	}

	private getLineHeight(scrollEl: HTMLElement): number {
		const line = scrollEl.querySelector<HTMLElement>('p, li, h1, h2, h3, h4, h5, h6');
		if (line) {
			const height = line.getBoundingClientRect().height;
			if (height > 0) return height;
		}
		return FALLBACK_LINE_HEIGHT_PX;
	}
}
