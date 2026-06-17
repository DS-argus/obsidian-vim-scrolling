import { Plugin } from 'obsidian';
import { ReadingModeScrollHandler } from './scrollHandler';
import { CursorManager } from './cursorManager';
import { LinkHintHandler } from './linkHintHandler';

export default class VimScrollingPlugin extends Plugin {
	private linkHints: LinkHintHandler | null = null;

	onload() {
		// Register the link hint handler first so its keydown listener runs
		// before the scroll handler and can stop propagation while hint mode
		// is active (otherwise hint chars like 'j'/'k' would also scroll).
		this.linkHints = new LinkHintHandler(this);
		this.linkHints.register();
		new ReadingModeScrollHandler(this).register();
		new CursorManager(this).register();
	}

	onunload() {
		// registerDomEvent removes listeners automatically, but hint overlays
		// live on document.body and must be torn down explicitly.
		this.linkHints?.cleanup();
	}
}
