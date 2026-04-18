import Foundation

enum LoomCommandScripts {
    static func learnSelectionScript() -> String {
        """
        (() => {
            const sel = window.getSelection();
            const text = sel ? sel.toString().trim() : '';
            if (text.length > 1) {
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
