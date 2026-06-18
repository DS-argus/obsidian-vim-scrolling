import { MarkdownView, Plugin } from 'obsidian';
import { VaultWithConfig } from './types';

const HINT_CHARS = 'asdfghjklqwertyuiopzxcvbnm';
const HOVER_LINK_SOURCE = 'vim-reading-nav';

interface Hint {
	label: string;
	link: HTMLAnchorElement;
	el: HTMLElement;
}

/**
 * Vimium-style link hint mode for reading mode.
 *
 * Press `f` to label every visible link with a hint. Type the hint to focus
 * that link — internal links also trigger Obsidian's page preview popover.
 * With a link focused, press Enter to activate it (navigate internal links,
 * open external URLs) or Escape to clear the focus.
 */
export class LinkHintHandler {
	private plugin: Plugin;
	private hints: Hint[] = [];
	private typed = '';
	private active = false;
	private focusedLink: HTMLAnchorElement | null = null;
	// Reused across hover-link triggers so the Page Preview plugin can dedupe
	// and replace the previous popover instead of stacking new ones.
	private hoverParent: { hoverPopover: unknown } = { hoverPopover: null };

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	register(): void {
		// Register as a hover source so the Page Preview core plugin shows
		// popovers for hover-link events triggered by this plugin.
		this.plugin.registerHoverLinkSource(HOVER_LINK_SOURCE, {
			display: 'Vim Reading Navigation',
			defaultMod: false,
		});

		this.plugin.registerDomEvent(activeDocument, 'keydown', (evt: KeyboardEvent) => {
			this.handleKeyDown(evt);
		});

		// Dismiss hints when the document scrolls or the window resizes — the
		// fixed-position overlays would otherwise drift away from their links.
		// scroll doesn't bubble, so listen in the capture phase.
		this.plugin.registerDomEvent(
			activeDocument,
			'scroll',
			() => { if (this.active) this.exitHintMode(); },
			{ capture: true }
		);
		this.plugin.registerDomEvent(activeWindow, 'resize', () => {
			if (this.active) this.exitHintMode();
		});

		// Reset transient state when the user switches panes or toggles between
		// reading and editing mode, so no hints or highlights are left stranded.
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', () => this.cleanup())
		);
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('layout-change', () => this.cleanup())
		);
	}

	/** Tear down all transient state (hints + focus). Safe to call any time. */
	cleanup(): void {
		this.exitHintMode();
		this.clearFocus();
	}

	private handleKeyDown(evt: KeyboardEvent): void {
		// Don't intercept keys when a modal/dialog is open or focus is in an input
		if (this.isFocusInModal(evt)) return;

		// While hint mode is active, every key drives hint selection
		if (this.active) {
			this.handleHintKey(evt);
			return;
		}

		// While a link is focused, Enter activates it and Escape clears it.
		// Other keys fall through so j/k scrolling keeps working.
		if (this.focusedLink) {
			if (evt.key === 'Enter') {
				evt.preventDefault();
				evt.stopImmediatePropagation();
				const link = this.focusedLink;
				this.clearFocus();
				this.activateLink(link);
				return;
			}
			if (evt.key === 'Escape') {
				evt.preventDefault();
				this.clearFocus();
				return;
			}
		}

		const view = this.getActivePreviewView();
		if (!view) return;
		if (!this.isVimModeEnabled()) return;

		const { key, ctrlKey, metaKey, altKey } = evt;
		if (ctrlKey || metaKey || altKey) return;

		if (key === 'f') {
			evt.preventDefault();
			evt.stopImmediatePropagation();
			this.enterHintMode(view);
		}
	}

	private enterHintMode(view: MarkdownView): void {
		this.clearFocus();
		this.exitHintMode();

		const scrollEl = this.getScrollElement(view);
		if (!scrollEl) return;

		const links = this.getVisibleLinks(scrollEl);
		if (links.length === 0) return;

		const labels = this.generateLabels(links.length);
		this.active = true;
		this.typed = '';

		links.forEach((link, i) => {
			const label = labels[i];
			if (!label) return;
			const el = this.createHintEl(label, link);
			this.hints.push({ label, link, el });
		});
	}

	private handleHintKey(evt: KeyboardEvent): void {
		evt.preventDefault();
		evt.stopImmediatePropagation();

		const key = evt.key;
		if (key === 'Escape') {
			this.exitHintMode();
			return;
		}
		if (key === 'Backspace') {
			this.typed = this.typed.slice(0, -1);
			this.updateHintDisplay();
			return;
		}
		if (key.length !== 1 || !HINT_CHARS.includes(key.toLowerCase())) {
			return;
		}

		this.typed += key.toLowerCase();
		const matches = this.hints.filter((h) => h.label.startsWith(this.typed));

		if (matches.length === 0) {
			this.exitHintMode();
			return;
		}

		const exact = matches.find((h) => h.label === this.typed);
		if (exact && matches.length === 1) {
			const link = exact.link;
			this.exitHintMode();
			this.focusLink(link);
			return;
		}

		this.updateHintDisplay();
	}

	private updateHintDisplay(): void {
		this.hints.forEach((h) => {
			h.el.toggleClass('vim-scroll-hint-inactive', !h.label.startsWith(this.typed));
		});
	}

	private exitHintMode(): void {
		this.hints.forEach((h) => h.el.remove());
		this.hints = [];
		this.typed = '';
		this.active = false;
	}

	private focusLink(link: HTMLAnchorElement): void {
		this.focusedLink = link;
		link.addClass('vim-scroll-link-focused');
		// behavior: 'auto' defeats any inherited smooth-scroll so the jump stays
		// instant, matching the scroll handler's direct scrollTop assignments.
		link.scrollIntoView({ block: 'center', behavior: 'auto' });
		if (link.classList.contains('internal-link')) {
			this.showHoverPreview(link);
		}
	}

	private clearFocus(): void {
		if (this.focusedLink) {
			this.focusedLink.removeClass('vim-scroll-link-focused');
			this.focusedLink = null;
		}
	}

	private showHoverPreview(link: HTMLAnchorElement): void {
		const linktext = link.getAttribute('data-href') ?? link.getAttribute('href');
		if (!linktext) return;

		const rect = link.getBoundingClientRect();
		const event = new MouseEvent('mouseover', {
			clientX: rect.left,
			clientY: rect.bottom,
		});

		this.plugin.app.workspace.trigger('hover-link', {
			event,
			source: HOVER_LINK_SOURCE,
			hoverParent: this.hoverParent,
			targetEl: link,
			linktext,
			sourcePath: this.getSourcePath(),
		});
	}

	private activateLink(link: HTMLAnchorElement): void {
		if (link.classList.contains('internal-link')) {
			const linktext = link.getAttribute('data-href') ?? link.getAttribute('href');
			if (!linktext) return;
			void this.plugin.app.workspace.openLinkText(linktext, this.getSourcePath(), false);
			return;
		}

		const href = link.getAttribute('href');
		if (href) activeWindow.open(href, '_blank');
	}

	private getSourcePath(): string {
		return this.plugin.app.workspace.getActiveFile()?.path ?? '';
	}

	private getVisibleLinks(scrollEl: HTMLElement): HTMLAnchorElement[] {
		const all = Array.from(
			scrollEl.querySelectorAll<HTMLAnchorElement>(
				'a.internal-link, a.external-link, a[href^="http"]'
			)
		);
		const containerRect = scrollEl.getBoundingClientRect();
		return all.filter((a) => {
			const r = a.getBoundingClientRect();
			return (
				r.width > 0 &&
				r.height > 0 &&
				r.bottom > containerRect.top &&
				r.top < containerRect.bottom
			);
		});
	}

	private createHintEl(label: string, link: HTMLAnchorElement): HTMLElement {
		const rect = link.getBoundingClientRect();
		const el = activeDocument.body.createDiv({
			cls: 'vim-scroll-hint',
			text: label.toUpperCase(),
		});
		el.style.left = `${rect.left}px`;
		el.style.top = `${rect.top + rect.height / 2}px`;
		return el;
	}

	private generateLabels(count: number): string[] {
		const chars = HINT_CHARS.split('');
		const labels: string[] = [];

		if (count <= chars.length) {
			for (let i = 0; i < count; i++) {
				const c = chars[i];
				if (c) labels.push(c);
			}
			return labels;
		}

		for (const a of chars) {
			for (const b of chars) {
				labels.push(a + b);
				if (labels.length >= count) return labels;
			}
		}
		return labels;
	}

	private getActivePreviewView(): MarkdownView | null {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== 'preview') return null;
		return view;
	}

	private getScrollElement(view: MarkdownView): HTMLElement | null {
		return view.containerEl.querySelector<HTMLElement>('.markdown-preview-view');
	}

	private isVimModeEnabled(): boolean {
		return (this.plugin.app.vault as VaultWithConfig).getConfig('vimMode') === true;
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
}
