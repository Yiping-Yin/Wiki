import SwiftUI

// MARK: - MarkdownNotesSchemaView
//
// Phase 4 — renderer for MarkdownNotesSchema. Deterministic (no AI),
// no FieldResult wrapping, no source-quote chips. Per the Phase 4
// brief: "visual weight should be LOWER than AI-extracted schemas —
// let the user's own markdown show through. No AI badges."
//
// Layout:
//   1. Title (from first H1 or filename fallback done by extractor)
//   2. Outline from headings (indented by level, optional tap → scroll)
//   3. Metadata chips: hasCode · hasMath · wordCount
//   4. Preview (first 200 chars, muted)
//
// Note: because this schema carries `charOffset` on headings (not a
// full SourceSpan) we construct a synthetic SourceSpan when the
// caller's `onQuoteTap` fires so Phase 5's scroll coordinator sees
// a uniform shape. The span is marked `verified: true` because the
// offset comes directly from the deterministic scanner — no AI in
// the loop to suspect.

struct MarkdownNotesSchemaView: View {
    let schema: MarkdownNotesSchema
    /// Optional tap hook — Phase 5 may wire this up to scroll the source
    /// pane to a heading's offset. Defaults to a no-op so the view can be
    /// used standalone in previews and static summaries.
    var onHeadingTap: ((HeadingEntry) -> Void)? = nil

    init(
        schema: MarkdownNotesSchema,
        onHeadingTap: ((HeadingEntry) -> Void)? = nil
    ) {
        self.schema = schema
        self.onHeadingTap = onHeadingTap
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            titleBlock
            if !schema.headings.isEmpty {
                IngestHairline()
                outlineBlock
            }
            IngestHairline()
            metadataBlock
            if !schema.preview.isEmpty {
                IngestHairline()
                previewBlock
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Sections

    @ViewBuilder
    private var titleBlock: some View {
        if let title = schema.title, !title.isEmpty {
            VStack(alignment: .leading, spacing: 6) {
                Text("Note")
                    .font(.system(size: 10, design: .serif).smallCaps())
                    .fontWeight(.medium)
                    .tracking(0.5)
                    .foregroundStyle(LoomTokens.ink3)
                Text(title)
                    // Display italic title per Vellum rules (feedback_vellum_polish_rules).
                    .font(LoomTokens.display(size: 22, italic: true, weight: .regular))
                    .foregroundStyle(LoomTokens.ink)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
        } else {
            Text("Untitled note")
                .font(LoomTokens.display(size: 22, italic: true, weight: .regular))
                .foregroundStyle(LoomTokens.muted)
        }
    }

    private var outlineBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            IngestSectionHeader(title: "Outline")
            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(schema.headings.enumerated()), id: \.offset) { _, heading in
                    headingRow(heading)
                }
            }
        }
    }

    private func headingRow(_ heading: HeadingEntry) -> some View {
        // Indent by heading level. H1 flush-left; deeper levels step in.
        let indent = CGFloat(max(0, heading.level - 1)) * 14
        return Button {
            onHeadingTap?(heading)
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(levelGlyph(heading.level))
                    .font(.system(size: 10, design: .serif))
                    .foregroundStyle(LoomTokens.muted)
                Text(heading.text)
                    .font(LoomTokens.serif(size: 13, weight: heading.level == 1 ? .medium : .regular))
                    .foregroundStyle(LoomTokens.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.leading, indent)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func levelGlyph(_ level: Int) -> String {
        switch level {
        case 1: return "#"
        case 2: return "##"
        case 3: return "###"
        case 4: return "####"
        case 5: return "#####"
        default: return "######"
        }
    }

    private var metadataBlock: some View {
        HStack(spacing: 8) {
            metaChip(
                icon: "textformat.abc",
                label: "\(schema.wordCount) words"
            )
            if schema.hasCode {
                metaChip(icon: "chevron.left.forwardslash.chevron.right", label: "code")
            }
            if schema.hasMath {
                metaChip(icon: "function", label: "math")
            }
        }
    }

    private func metaChip(icon: String, label: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 9, weight: .regular))
            Text(label)
                .font(LoomTokens.sans(size: 10))
        }
        .foregroundStyle(LoomTokens.ink3)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(
            Capsule(style: .continuous)
                .fill(LoomTokens.hairFaint)
        )
        .overlay(
            Capsule(style: .continuous)
                .strokeBorder(LoomTokens.hair, lineWidth: 0.5)
        )
    }

    private var previewBlock: some View {
        VStack(alignment: .leading, spacing: 6) {
            IngestSectionHeader(title: "Preview")
            Text(schema.preview)
                .font(LoomTokens.serif(size: 12, italic: true))
                .foregroundStyle(LoomTokens.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
    }
}

// MARK: - Previews

#Preview("MarkdownNotesSchemaView") {
    let schema = MarkdownNotesSchema(
        title: "Options Pricing Notes",
        headings: [
            HeadingEntry(level: 1, text: "Options Pricing Notes", charOffset: 0),
            HeadingEntry(level: 2, text: "Payoff diagrams", charOffset: 120),
            HeadingEntry(level: 3, text: "European call", charOffset: 340),
            HeadingEntry(level: 3, text: "European put", charOffset: 520),
            HeadingEntry(level: 2, text: "Put-call parity", charOffset: 780)
        ],
        wordCount: 842,
        hasCode: true,
        hasMath: true,
        preview: "Starting from risk-neutral valuation we derive the payoff functions for European options and sketch the conditions under which put-call parity holds."
    )
    return ScrollView {
        MarkdownNotesSchemaView(schema: schema)
            .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 500)
}
