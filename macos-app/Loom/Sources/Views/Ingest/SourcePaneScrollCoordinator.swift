import SwiftUI
import AppKit

// MARK: - SourcePaneScrollCoordinator
//
// Phase 5 (plan §4 Phase 5, deliverable D): holds a pending character
// range that the source-preview pane will scroll to + highlight when
// the user clicks a quote icon in `IngestExtractorResultView`. The
// coordinator publishes a lightweight request object; the source pane
// observes it via `@ObservedObject` and reacts.
//
// Design notes:
//   - The range is in UTF-16 character offsets (matches `SourceSpan`
//     contract + `locate()` output).
//   - `request` is replaced, not appended: only the most-recent
//     click matters. Using `Published<Request?>` with a nil-reset trick
//     lets the source pane handle the same range twice in a row.
//   - The NSTextView-backed source pane is a collapsible DisclosureGroup
//     inside IngestionView; it reads the request and calls
//     `NSTextView.scrollRangeToVisible(_:)` + temporary highlight.

@MainActor
final class SourcePaneScrollCoordinator: ObservableObject {
    struct Request: Equatable {
        let charStart: Int
        let charEnd: Int
        /// Bumped per request so the source pane can distinguish two
        /// back-to-back clicks on the same span (same range, different
        /// id → re-scroll + re-flash).
        let id: UUID
    }

    @Published var request: Request?
    /// Forces the DisclosureGroup open when the user taps a quote so the
    /// scroll target becomes visible without a second click.
    @Published var expandPane: Bool = false

    func scroll(to span: SourceSpan) {
        // Ignore unverified spans with zero offsets — nothing to scroll
        // to. The view already shows a warning badge for these.
        guard span.verified, span.charStart < span.charEnd else { return }
        expandPane = true
        request = Request(charStart: span.charStart, charEnd: span.charEnd, id: UUID())
    }
}

// MARK: - SourcePreviewPane
//
// NSTextView wrapper that (a) shows the raw `sourceText` for click-back
// reference and (b) honors scroll-to-range requests from the
// coordinator. Read-only, monospace — matches the Vellum paper aesthetic
// without fighting NSTextView's default chrome.

struct SourcePreviewPane: NSViewRepresentable {
    let sourceText: String
    @ObservedObject var coordinator: SourcePaneScrollCoordinator

    func makeNSView(context: Context) -> NSScrollView {
        let scroll = NSTextView.scrollableTextView()
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.borderType = .noBorder
        scroll.drawsBackground = false  // LoomTokens.paper shows through
        if let textView = scroll.documentView as? NSTextView {
            configureTextView(textView)
            textView.string = sourceText
        }
        return scroll
    }

    func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let textView = scroll.documentView as? NSTextView else { return }
        if textView.string != sourceText {
            textView.string = sourceText
        }
        // Honor any new scroll request.
        if let req = coordinator.request,
           context.coordinator.lastHandledRequestId != req.id {
            context.coordinator.lastHandledRequestId = req.id
            let length = (textView.string as NSString).length
            let loc = min(req.charStart, length)
            let len = max(0, min(req.charEnd - req.charStart, length - loc))
            guard len > 0 else { return }
            let range = NSRange(location: loc, length: len)
            textView.scrollRangeToVisible(range)
            textView.setSelectedRange(range)
            // Flash: temporarily apply a thread-tinted background on
            // the range, then restore. Matches Vellum polish rules
            // (feedback_vellum_polish_rules — use background attribute
            // over gaudy overlays).
            flash(textView: textView, range: range)
        }
    }

    func makeCoordinator() -> TextViewCoordinator { TextViewCoordinator() }

    final class TextViewCoordinator {
        var lastHandledRequestId: UUID?
    }

    private func configureTextView(_ tv: NSTextView) {
        tv.isEditable = false
        tv.isSelectable = true
        tv.drawsBackground = false  // dark-mode token discipline
        tv.textContainerInset = NSSize(width: 12, height: 12)
        tv.font = NSFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        tv.textColor = NSColor(LoomTokens.ink2)
        tv.usesFindBar = true
        tv.isIncrementalSearchingEnabled = true
    }

    private func flash(textView: NSTextView, range: NSRange) {
        guard let storage = textView.textStorage else { return }
        let safeLength = min(range.length, storage.length - range.location)
        guard safeLength > 0, range.location >= 0,
              range.location + safeLength <= storage.length else { return }
        let safeRange = NSRange(location: range.location, length: safeLength)
        let flashColor = NSColor(LoomTokens.thread).withAlphaComponent(0.22)
        storage.addAttribute(.backgroundColor, value: flashColor, range: safeRange)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            guard textView.textStorage === storage,
                  safeRange.location + safeRange.length <= storage.length
            else { return }
            storage.removeAttribute(.backgroundColor, range: safeRange)
        }
    }
}
