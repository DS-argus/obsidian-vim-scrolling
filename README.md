# Obsidian Vim Scrolling

An Obsidian plugin that adds vim-style scrolling in **reading mode** when Obsidian's vim key bindings are enabled.

## Design Idea

Obsidian's built-in vim key bindings (powered by CodeMirror's vim mode) are active in source and live preview modes — but **reading mode** renders static HTML with no editor, so vim navigation keys (`j`, `k`, `Ctrl+D`, `Ctrl+U`, `gg`, `G`) do nothing there.

This plugin fills that gap: it intercepts those keystrokes in reading mode and scrolls the viewport directly, giving you consistent vim muscle memory regardless of which mode you are in.

It also handles a common friction point: after scrolling in reading mode, switching back to source mode may leave the cursor far from the visible content. The plugin corrects the cursor position so it matches what you were reading.

## Key Mappings

| Key | Action |
|-----|--------|
| `j` | Scroll down one line |
| `k` | Scroll up one line |
| `Ctrl+D` | Scroll down half a page |
| `Ctrl+U` | Scroll up half a page |
| `gg` | Scroll to the top of the document |
| `G` | Scroll to the bottom of the document |
| `f` | Enter link hint mode — label every visible link |

In link hint mode, type a hint label to **focus** that link (internal links also show Obsidian's hover preview). With a link focused, press `Enter` to follow it — internal links open the note, external links open the URL. Press `Esc` to cancel.

Keys are only active when:
1. The current view is in **reading mode** (preview)
2. Obsidian's **vim mode** is enabled (Settings → Editor → Vim key bindings)

## Design Details

### No Animation

Scrolling is instant — `scrollTop` is set directly with no CSS smooth-scroll or animation. This is intentional:
- Key-repeat events (holding `j` or `k`) scroll continuously without animation queuing lag.
- The behaviour matches source mode vim motions, which are also instantaneous.

### Repeated Key Strokes

Holding a key (e.g., `j`) produces repeated `keydown` events. Each event is handled independently — no debouncing or rate-limiting is applied — so the viewport scrolls smoothly as long as the key is held.

### Link Hint Mode

Pressing `f` enumerates every link currently visible in the viewport and overlays a short hint label on each (Vimium-style). Typing a label focuses the link rather than opening it immediately:

- **Internal links** → the link is highlighted, scrolled into view, and Obsidian's page preview popover is shown (requires the **Page Preview** core plugin).
- **External links** → the link is highlighted and scrolled into view.

With a link focused, `Enter` activates it — internal links navigate via `openLinkText`, external links open in a new window. `Esc` clears the focus. Hints are dismissed automatically if you scroll, resize, switch panes, or toggle out of reading mode.

### `gg` Detection

The `gg` command is triggered by pressing `g` twice within **500 ms**. After the first `g`, the timer starts. If a second `g` arrives within the window, the view scrolls to the top.

### Cursor Adjustment (Reading → Source Mode)

When you switch from reading mode to source mode, the CodeMirror editor restores the cursor to its last known position, which may no longer be visible (because you scrolled in reading mode). The plugin corrects this after the editor initialises:

- **Cursor is outside the visible viewport** (above or below) → cursor is moved to the **first editable line** of the current viewport.
- **Cursor is within the viewport** → cursor is left **unchanged**.

This ensures the editor opens with the cursor near the content you were reading.

## Usage

1. Enable **vim key bindings** in Obsidian: **Settings → Editor → Vim key bindings**
2. Install and enable this plugin.
3. Open any note and switch to **Reading mode** (the book icon in the top-right, or via the command palette).
4. Use `j`/`k`, `Ctrl+D`/`Ctrl+U`, `gg`, and `G` to navigate.

## Installation

### Manual

1. Download `main.js` and `manifest.json` from the [latest release](../../releases/latest).
2. Copy them to `<Vault>/.obsidian/plugins/vim-scrolling/`.
3. Reload Obsidian and enable the plugin under **Settings → Community plugins**.

### Development

```bash
git clone https://github.com/xlongfeng/obsidian-vim-scrolling vim-scrolling
cd vim-scrolling
npm install
npm run dev   # watch mode — compiles src/main.ts → main.js
```

