import SwiftUI

// MARK: - Shared helpers for Ingest Phase 4 views
//
// Small cross-view utilities that each schema renderer needs but that
// aren't meaningful on their own. Kept in a single file so the
// individual schema views stay narrative.

/// Minimal wrap-at-width layout for horizontal chip rows (speakers,
/// key terms, topics). Deliberately tiny — we don't need RTL or
/// baseline alignment, just horizontal wrapping at the container's
/// proposed width.
struct IngestFlowLayout: Layout {
    var spacing: CGFloat = 6
    var lineSpacing: CGFloat = 6

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 {
                y += rowHeight + lineSpacing
                x = 0
                rowHeight = 0
            }
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
            usedWidth = max(usedWidth, x - spacing)
        }
        return CGSize(width: usedWidth, height: y + rowHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var x: CGFloat = bounds.minX
        var y: CGFloat = bounds.minY
        var rowHeight: CGFloat = 0
        for sv in subviews {
            let size = sv.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX {
                y += rowHeight + lineSpacing
                x = bounds.minX
                rowHeight = 0
            }
            sv.place(
                at: CGPoint(x: x, y: y),
                proposal: ProposedViewSize(size)
            )
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Standard Vellum section header: serif small-caps, medium weight,
/// `thread` tint so sections read as landmarks without shouting.
struct IngestSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 11, design: .serif).smallCaps())
            .fontWeight(.medium)
            .tracking(0.8)
            .foregroundStyle(LoomTokens.thread)
    }
}

/// Thin hairline divider — matches `IngestionView.vellumHairline`
/// weight so the schema pane meets the rest of the chrome cleanly.
struct IngestHairline: View {
    var body: some View {
        LoomTokens.hair.frame(height: 0.5)
    }
}
