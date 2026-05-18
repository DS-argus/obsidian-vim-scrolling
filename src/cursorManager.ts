import { MarkdownView, Plugin } from 'obsidian';
import { CMEditorView, EditorWithCM } from './types';

export class CursorManager {
	private plugin: Plugin;
	private previousMode: string | null = null;

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

	private adjustCursorAfterModeSwitch(view: MarkdownView): void {
		// Defer so the editor has time to fully initialize and render
		activeWindow.setTimeout(() => {
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
