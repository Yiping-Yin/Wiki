import Foundation

enum LoomCommandScripts {
    /// ⌘E · Engage. Behavior:
    ///   1. On a `/wiki/*` or `/knowledge/*` page WITH a text selection, try
    ///      `window.__loomInterlace.open({...})` — the margin-note summoning
    ///      ritual (M2 · Interlace).
    ///   2. If Interlace isn't mounted, or we're not on a doc page, fall back
    ///      to the passage-chat path (`loom:chat:focus`) which ChatFocus owns.
    ///   3. If no selection exists at all, open the Rehearsal overlay —
    ///      "no text in hand, so rehearse what you already know."
    ///
    /// The native `AskAIWindow` that listens on ⌘⇧A stays untouched — that's
    /// for global prompts without any page context.
    static func learnSelectionScript() -> String {
        """
        (() => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            if (text.length > 1) {
                const path = (location.pathname || '');
                const isDoc = /^\\/(?:wiki|knowledge)(?:\\/|$)/.test(path);
                // Try the Interlace margin overlay first on doc pages.
                if (isDoc && window.__loomInterlace && typeof window.__loomInterlace.open === 'function') {
                    let rect = null;
                    try {
                        if (sel && sel.rangeCount > 0) {
                            const rects = sel.getRangeAt(0).getClientRects();
                            if (rects && rects.length > 0) {
                                const last = rects[rects.length - 1];
                                rect = { top: last.top, left: last.left, right: last.right, bottom: last.bottom };
                            }
                        }
                    } catch (e) {}
                    try {
                        const opened = window.__loomInterlace.open({ selection: text, rect: rect });
                        if (opened) return;
                    } catch (e) {}
                }
                // Fallback: passage chat / AskAIWindow path.
                window.dispatchEvent(new CustomEvent('loom:chat:focus', {
                    detail: { text }
                }));
            } else {
                window.dispatchEvent(new CustomEvent('loom:overlay:open', {
                    detail: { id: 'rehearsal' }
                }));
                window.dispatchEvent(new CustomEvent('loom:overlay:toggle', {
                    detail: { id: 'rehearsal' }
                }));
            }
        })();
        """
    }
}
