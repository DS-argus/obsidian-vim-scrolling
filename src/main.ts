import { Plugin } from 'obsidian';
import { ReadingModeScrollHandler } from './scrollHandler';
import { CursorManager } from './cursorManager';
import { LinkHintHandler } from './linkHintHandler';

export default class VimReadingNavPlugin extends Plugin {
	private linkHints: LinkHintHandler | null = null;
	private scrollHandler: ReadingModeScrollHandler | null = null;

	onload() {
		this.linkHints = new LinkHintHandler(this);
		this.linkHints.register();
		this.scrollHandler = new ReadingModeScrollHandler(this);
		new CursorManager(this).register();

		// Attach DOM listeners to the main window, every pop-out window that
		// is already open (plugin enabled mid-session), and every pop-out
		// opened later.
		const docs = new Set<Document>([document]);
		this.app.workspace.iterateAllLeaves((leaf) => {
			docs.add(leaf.view.containerEl.ownerDocument);
		});
		docs.forEach((doc) => this.registerForDocument(doc));

		this.registerEvent(
			this.app.workspace.on('window-open', (win) => this.registerForDocument(win.doc))
		);
	}

	onunload() {
		// registerDomEvent removes listeners automatically, but hint overlays
		// live on a document body and must be torn down explicitly.
		this.linkHints?.cleanup();
	}

	private registerForDocument(doc: Document): void {
		// Register the link hint handler first so its keydown listener runs
		// before the scroll handler and can stop propagation while hint mode
		// is active (otherwise hint chars like 'j'/'k' would also scroll).
		this.linkHints?.registerTo(doc);
		this.scrollHandler?.registerTo(doc);
	}
}
