import SwiftUI

// MARK: - SlideDeckSchemaView
//
// Phase 4 — renderer for SlideDeckSchema. Layout per the Phase 4 brief:
//
//   1. Deck title + author
//   2. Sections list (title · slide range)
//   3. Topics bulleted list (flow-wrapped chips so long decks don't
//      bury the outline past the fold)
//
// Slide ranges are free-text per the schema note ("slides 5-8") — kept
// as a FieldResult<String> row rather than a specialized range widget.

struct SlideDeckSchemaView: View {
    let schema: SlideDeckSchema
    let sourceText: String
    let onQuoteTap: (SourceSpan) -> Void

    init(
        schema: SlideDeckSchema,
        sourceText: String,
        onQuoteTap: @escaping (SourceSpan) -> Void
    ) {
        self.schema = schema
        self.sourceText = sourceText
        self.onQuoteTap = onQuoteTap
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            titleBlock
            if !schema.sections.isEmpty, hasAnySection(schema.sections) {
                IngestHairline()
                sectionsBlock
            }
            if !schema.topics.isEmpty, hasAnyFound(schema.topics) {
                IngestHairline()
                topicsBlock
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Sections

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Deck")
            FieldResultRow<String>(
                label: "Title",
                result: schema.deckTitle,
                onQuoteTap: onQuoteTap
            )
            FieldResultRow<String>(
                label: "Author",
                result: schema.author,
                onQuoteTap: onQuoteTap
            )
        }
    }

    private var sectionsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Sections")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(schema.sections.enumerated()), id: \.offset) { _, section in
                    HStack(alignment: .top, spacing: 14) {
                        FieldResultRow<String>(
                            label: "Title",
                            result: section.title,
                            onQuoteTap: onQuoteTap
                        )
                        FieldResultRow<String>(
                            label: "Slides",
                            result: section.slideRange,
                            onQuoteTap: onQuoteTap
                        )
                        .frame(maxWidth: 120, alignment: .leading)
                    }
                    .padding(8)
                    .background(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .fill(LoomTokens.hairFaint)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 6, style: .continuous)
                            .strokeBorder(LoomTokens.hair, lineWidth: 0.5)
                    )
                }
            }
        }
    }

    private var topicsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Topics")
            IngestFlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(Array(schema.topics.enumerated()), id: \.offset) { _, topic in
                    topicChip(topic)
                }
            }
        }
    }

    @ViewBuilder
    private func topicChip(_ result: FieldResult<String>) -> some View {
        switch result {
        case .found(let value, let confidence, let spans):
            let unverified = spans.contains { !$0.verified }
            Button {
                if let first = spans.first { onQuoteTap(first) }
            } label: {
                HStack(spacing: 4) {
                    if unverified {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 8))
                            .foregroundStyle(LoomTokens.rose)
                    }
                    Text(value)
                        .font(LoomTokens.serif(size: 12))
                        .foregroundStyle(LoomTokens.ink)
                        .opacity(confidence < 0.5 ? 0.7 : 1.0)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    Capsule(style: .continuous).fill(LoomTokens.hairFaint)
                )
                .overlay(
                    Capsule(style: .continuous).strokeBorder(LoomTokens.hair, lineWidth: 0.5)
                )
            }
            .buttonStyle(.plain)
            .help(spans.first?.quote ?? value)
        case .notFound:
            EmptyView()
        }
    }

    // MARK: - Empty checks

    private func isAnyFound<T>(_ r: FieldResult<T>) -> Bool {
        if case .found = r { return true }
        return false
    }

    private func hasAnyFound(_ list: [FieldResult<String>]) -> Bool {
        list.contains { isAnyFound($0) }
    }

    private func hasAnySection(_ sections: [SlideSectionEntry]) -> Bool {
        sections.contains { s in
            isAnyFound(s.title) || isAnyFound(s.slideRange)
        }
    }
}

// MARK: - Previews

#Preview("SlideDeckSchemaView") {
    let span = SourceSpan(
        docId: "preview",
        pageNum: 1,
        charStart: 0,
        charEnd: 20,
        quote: "Macroprudential Policy",
        verified: true,
        verifyReason: nil
    )
    let schema = SlideDeckSchema(
        deckTitle: .found(value: "Macroprudential Policy", confidence: 0.95, sourceSpans: [span]),
        author: .notFound(tried: ["title slide", "footer"]),
        sections: [
            SlideSectionEntry(
                title: .found(value: "Overview", confidence: 0.9, sourceSpans: [span]),
                slideRange: .found(value: "slides 1-4", confidence: 0.9, sourceSpans: [span])
            ),
            SlideSectionEntry(
                title: .found(value: "Tools", confidence: 0.9, sourceSpans: [span]),
                slideRange: .found(value: "slides 5-12", confidence: 0.9, sourceSpans: [span])
            )
        ],
        topics: [
            .found(value: "Countercyclical buffer", confidence: 0.9, sourceSpans: [span]),
            .found(value: "LVR caps", confidence: 0.9, sourceSpans: [span]),
            .found(value: "Systemic risk", confidence: 0.85, sourceSpans: [span])
        ]
    )
    return ScrollView {
        SlideDeckSchemaView(
            schema: schema,
            sourceText: "…",
            onQuoteTap: { _ in }
        )
        .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 600)
}
