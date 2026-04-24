import SwiftUI

// MARK: - TextbookSchemaView
//
// Phase 4 — renderer for TextbookSchema. Layout per the Phase 4 brief:
//
//   1. Chapter title + number
//   2. Learning objectives
//   3. Key terms (chip list)
//   4. Section headings (outline style)
//   5. Summary (long prose + source quote beneath)
//
// Summary is the longest field and renders as a prose paragraph so the
// reader can scan it like text, not like a struct. The extracted quote
// chip sits beneath, tappable per the click-back-to-source contract.

struct TextbookSchemaView: View {
    let schema: TextbookSchema
    let sourceText: String
    let onQuoteTap: (SourceSpan) -> Void

    init(
        schema: TextbookSchema,
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
            if !schema.learningObjectives.isEmpty, hasAnyFound(schema.learningObjectives) {
                IngestHairline()
                objectivesBlock
            }
            if !schema.keyTerms.isEmpty, hasAnyFound(schema.keyTerms) {
                IngestHairline()
                keyTermsBlock
            }
            if !schema.sectionHeadings.isEmpty, hasAnyFound(schema.sectionHeadings) {
                IngestHairline()
                sectionHeadingsBlock
            }
            if isAnyFound(schema.summary) {
                IngestHairline()
                summaryBlock
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Sections

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Chapter")
            FieldResultRow<String>(
                label: "Title",
                result: schema.chapterTitle,
                onQuoteTap: onQuoteTap
            )
            FieldResultRow<String>(
                label: "Number",
                result: schema.chapterNumber,
                onQuoteTap: onQuoteTap
            )
        }
    }

    private var objectivesBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Learning Objectives")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(schema.learningObjectives.enumerated()), id: \.offset) { idx, obj in
                    HStack(alignment: .top, spacing: 6) {
                        Text("\(idx + 1).")
                            .font(LoomTokens.serif(size: 12))
                            .foregroundStyle(LoomTokens.muted)
                            .frame(width: 18, alignment: .trailing)
                        FieldResultRow<String>(
                            label: "Objective",
                            result: obj,
                            onQuoteTap: onQuoteTap
                        )
                    }
                }
            }
        }
    }

    private var keyTermsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Key Terms")
            IngestFlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(Array(schema.keyTerms.enumerated()), id: \.offset) { _, term in
                    termChip(term)
                }
            }
        }
    }

    @ViewBuilder
    private func termChip(_ result: FieldResult<String>) -> some View {
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
            // Silent skip — chip row should only show present terms.
            EmptyView()
        }
    }

    private var sectionHeadingsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Sections")
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(schema.sectionHeadings.enumerated()), id: \.offset) { idx, heading in
                    HStack(alignment: .top, spacing: 6) {
                        Text("\(idx + 1).")
                            .font(LoomTokens.serif(size: 12))
                            .foregroundStyle(LoomTokens.muted)
                            .frame(width: 18, alignment: .trailing)
                        FieldResultRow<String>(
                            label: "Heading",
                            result: heading,
                            onQuoteTap: onQuoteTap
                        )
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var summaryBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            IngestSectionHeader(title: "Summary")
            if case .found(let value, let confidence, let spans) = schema.summary {
                let anyUnverified = spans.contains { !$0.verified }
                Text(value)
                    .font(LoomTokens.serif(size: 14))
                    .foregroundStyle(LoomTokens.ink)
                    .opacity(confidence < 0.5 ? 0.7 : 1.0)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                if anyUnverified {
                    HStack(spacing: 4) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .font(.system(size: 9))
                        Text("unverified · summary quote not in source")
                            .font(LoomTokens.sans(size: 10))
                    }
                    .foregroundStyle(LoomTokens.rose)
                }
                // Source quote row underneath — the "extracted from here"
                // anchor so the reader can verify the summary's basis.
                FieldResultRow<String>(
                    label: "Source quote",
                    result: .found(value: spans.first?.quote ?? "", confidence: confidence, sourceSpans: spans),
                    onQuoteTap: onQuoteTap
                )
            }
        }
    }

    // MARK: - Helpers

    private func isAnyFound<T>(_ r: FieldResult<T>) -> Bool {
        if case .found = r { return true }
        return false
    }

    private func hasAnyFound(_ list: [FieldResult<String>]) -> Bool {
        list.contains { isAnyFound($0) }
    }
}

// MARK: - Previews

#Preview("TextbookSchemaView") {
    let span = SourceSpan(
        docId: "preview",
        pageNum: 12,
        charStart: 0,
        charEnd: 40,
        quote: "Options are derivative instruments whose value…",
        verified: true,
        verifyReason: nil
    )
    let schema = TextbookSchema(
        chapterTitle: .found(value: "Options Pricing", confidence: 0.95, sourceSpans: [span]),
        chapterNumber: .found(value: "Chapter 12", confidence: 0.95, sourceSpans: [span]),
        learningObjectives: [
            .found(value: "Derive Black-Scholes under risk-neutral measure", confidence: 0.9, sourceSpans: [span]),
            .notFound(tried: ["opening paragraph of chapter"])
        ],
        keyTerms: [
            .found(value: "Call option", confidence: 0.9, sourceSpans: [span]),
            .found(value: "Put-call parity", confidence: 0.85, sourceSpans: [span]),
            .found(value: "Delta hedging", confidence: 0.9, sourceSpans: [span])
        ],
        sectionHeadings: [
            .found(value: "12.1 Payoff diagrams", confidence: 0.95, sourceSpans: [span]),
            .found(value: "12.2 Put-call parity", confidence: 0.95, sourceSpans: [span])
        ],
        summary: .found(
            value: "This chapter introduces option contracts, payoff structures, and the no-arbitrage bound that gives rise to put-call parity. The closing sections derive the Black-Scholes PDE under risk-neutral valuation.",
            confidence: 0.85,
            sourceSpans: [span]
        )
    )
    return ScrollView {
        TextbookSchemaView(
            schema: schema,
            sourceText: "…",
            onQuoteTap: { _ in }
        )
        .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 600)
}
