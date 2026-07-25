import { MarkdownView, Plugin } from 'obsidian';
import { CMEditorView, EditorWithCM } from './types';

export class CursorManager {
	private plugin: Plugin;
	private previousMode: string | null = null;
	private pendingWin: Window | null = null;
	private pendingTimeout: number | null = null;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
	}

	register(): void {
		this.plugin.registerEvent(
			this.plugin.app.workspace.on('active-leaf-change', () => {
				// Reset mode tracking when the user switches panes/files
				const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
				this.previousMode = view ? view.getMode() : null;
			})
		);

		this.plugin.registerEvent(
			this.plugin.app.workspace.on('layout-change', () => {
				this.onLayoutChange();
			})
		);

		// Cancel any in-flight cursor adjustment when the plugin unloads.
		this.plugin.register(() => this.cancelPending());
	}

	private onLayoutChange(): void {
		const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view) {
			this.previousMode = null;
			return;
		}

		const currentMode = view.getMode();

		if (this.previousMode === 'preview' && currentMode === 'source') {
			this.adjustCursorAfterModeSwitch(view);
		}

		this.previousMode = currentMode;
	}

	private cancelPending(): void {
		if (this.pendingTimeout !== null && this.pendingWin) {
			this.pendingWin.clearTimeout(this.pendingTimeout);
		}
		this.pendingTimeout = null;
		this.pendingWin = null;
	}

	private adjustCursorAfterModeSwitch(view: MarkdownView): void {
		// Use the window the view actually lives in (main or pop-out).
		const win = view.containerEl.ownerDocument.defaultView ?? window;

		// Defer so the editor has time to fully initialize and render
		this.cancelPending();
		this.pendingWin = win;
		this.pendingTimeout = win.setTimeout(() => {
			this.pendingTimeout = null;
			this.pendingWin = null;

			const editor = view.editor as EditorWithCM;
			if (!editor?.cm) return;

			const cm: CMEditorView = editor.cm;
			const cursor = editor.getCursor();
			const cursorOffset = editor.posToOffset(cursor);

			// coordsAtPos returns screen (viewport-relative) coordinates
			const cursorCoords = cm.coordsAtPos(cursorOffset, 1);
			if (!cursorCoords) return;

			const scrollEl = cm.scrollDOM;
			const scrollRect = scrollEl.getBoundingClientRect();

			const isAbove = cursorCoords.top < scrollRect.top;
			const isBelow = cursorCoords.bottom > scrollRect.bottom;

			if (isAbove || isBelow) {
				// Cursor is outside the visible viewport → move to first visible line
				const pos = cm.posAtCoords(
					{ x: scrollRect.left + 1, y: scrollRect.top + 1 },
					false
				);
				editor.setCursor(editor.offsetToPos(pos));
			}
			// Cursor is within viewport → leave unchanged
		}, 50);
	}
}
