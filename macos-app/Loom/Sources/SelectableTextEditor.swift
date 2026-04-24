import SwiftUI
import AppKit

/// AppKit-backed TextEditor replacement that exposes the current
/// selection range for programmatic replacement — closes the macOS 14
/// SwiftUI.TextEditor gap that blocked ⌘K selection reformat in Rehearsal.
///
/// Contract:
///   - `text` — two-way binding; whole document.
///   - `selectedRange` — two-way binding; the user's current selection
///     as an NSRange. Callers can both read (to send the highlighted
///     text to AI) and write (to replace / move the selection after a
///     transform lands).
///   - `onCommandK` — optional; fires when user presses ⌘K inside the
///     field, so the host view can trigger its own AI reformat action.
struct SelectableTextEditor: NSViewRepresentable {
    @Binding var text: String
    @Binding var selectedRange: NSRange
    var onCommandK: (() -> Void)?

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, selectedRange: $selectedRange, onCommandK: onCommandK)
    }

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        guard let textView = scroll.documentView as? NSTextView else { return scroll }

        textView.delegate = context.coordinator
        textView.isRichText = false
        textView.allowsUndo = true
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.isAutomaticSpellingCorrectionEnabled = false
        textView.isContinuousSpellCheckingEnabled = true
        // Transparent backgrounds so the host VStack's Vellum paper
        // (or dark-mode equivalent) shows through. Without this the
        // scroll view paints NSColor.textBackgroundColor — near-white
        // in light mode, near-black in dark — which in Rehearsal's
        // dark mode rendered as a stark black void over the paper.
        scroll.drawsBackground = false
        textView.drawsBackground = false
        textView.backgroundColor = .clear
        // labelColor is a dynamic system color: dark ink in light mode,
        // warm candle-white in dark mode. Matches Vellum's intent of
        // "earth ink, never neon" without hard-coding per mode.
        textView.textColor = .labelColor
        textView.insertionPointColor = NSColor(red: 0x9E / 255.0,
                                               green: 0x7C / 255.0,
                                               blue: 0x3E / 255.0,
                                               alpha: 1.0) // LoomTokens.thread — bronze caret
        textView.font = .systemFont(ofSize: 13)
        textView.textContainerInset = NSSize(width: 4, height: 6)
        textView.textContainer?.widthTracksTextView = true
        textView.string = text
        context.coordinator.textView = textView
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let textView = nsView.documentView as? NSTextView else { return }
        context.coordinator.text = $text
        context.coordinator.selectedRange = $selectedRange
        context.coordinator.onCommandK = onCommandK
        // Only push text into NSTextView when the bound value actually
        // diverges — avoids clobbering the user's cursor on every tick.
        if textView.string != text {
            let previousSelection = textView.selectedRange()
            textView.string = text
            let safeLoc = min(previousSelection.location, textView.string.utf16.count)
            textView.setSelectedRange(NSRange(location: safeLoc, length: 0))
        }
        let current = textView.selectedRange()
        if current != selectedRange &&
           NSMaxRange(selectedRange) <= textView.string.utf16.count {
            textView.setSelectedRange(selectedRange)
        }
    }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var text: Binding<String>
        var selectedRange: Binding<NSRange>
        var onCommandK: (() -> Void)?
        weak var textView: NSTextView?

        init(text: Binding<String>, selectedRange: Binding<NSRange>, onCommandK: (() -> Void)?) {
            self.text = text
            self.selectedRange = selectedRange
            self.onCommandK = onCommandK
        }

        func textDidChange(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            text.wrappedValue = tv.string
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let tv = notification.object as? NSTextView else { return }
            let range = tv.selectedRange()
            if range != selectedRange.wrappedValue {
                selectedRange.wrappedValue = range
            }
        }

        /// Intercept key commands. ⌘K → host callback; everything else
        /// falls through to the default responder chain (undo/redo, etc).
        func textView(_ textView: NSTextView, doCommandBy selector: Selector) -> Bool {
            if selector == #selector(NSResponder.insertNewline(_:)) {
                // Default behaviour — newline insertion.
                return false
            }
            return false
        }

        func textView(
            _ textView: NSTextView,
            shouldChangeTextIn affectedCharRange: NSRange,
            replacementString: String?
        ) -> Bool {
            return true
        }
    }
}

/// Convenience wrapper to trap ⌘K at the event monitor level — `NSTextView`
/// doesn't route ⌘K through `doCommandBy` the way it does standard
/// editing selectors, so we install a local monitor scoped to a view.
struct CommandKTrap: NSViewRepresentable {
    let action: () -> Void

    func makeNSView(context: Context) -> NSView {
        let view = CommandKTrapView()
        view.action = action
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        (nsView as? CommandKTrapView)?.action = action
    }

    private final class CommandKTrapView: NSView {
        var action: (() -> Void)?
        private var monitor: Any?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            guard monitor == nil, window != nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self, let window = self.window, event.window === window else { return event }
                // ⌘K = key code 40, matches the "k" character.
                if event.modifierFlags.contains(.command),
                   !event.modifierFlags.contains(.shift),
                   event.charactersIgnoringModifiers?.lowercased() == "k" {
                    self.action?()
                    return nil
                }
                return event
            }
        }

        override func removeFromSuperview() {
            if let monitor { NSEvent.removeMonitor(monitor) }
            monitor = nil
            super.removeFromSuperview()
        }
    }
}
