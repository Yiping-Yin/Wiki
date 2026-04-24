import SwiftUI

// MARK: - TranscriptSchemaView
//
// Phase 4 — renderer for TranscriptSchema. Layout per the Phase 4 brief:
//
//   1. Title + speakers chip row
//   2. Timecoded segments (timecode prefix · topic label · original quote)
//   3. Key quotes section
//
// Timecodes are deterministic (extractor derives from `.vtt`/`.srt`/
// timestamp patterns); topic and sourceQuote are AI-derived and flow
// through FieldResultRow so honest `.notFound` surfaces naturally.

struct TranscriptSchemaView: View {
    let schema: TranscriptSchema
    let sourceText: String
    let onQuoteTap: (SourceSpan) -> Void

    init(
        schema: TranscriptSchema,
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
            if hasAnyFound(schema.speakers) {
                sectionDivider
                speakersBlock
            }
            if !schema.segments.isEmpty, hasAnySegment(schema.segments) {
                sectionDivider
                segmentsBlock
            }
            if !schema.keyQuotes.isEmpty, hasAnyFound(schema.keyQuotes) {
                sectionDivider
                keyQuotesBlock
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Sections

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Transcript")
            FieldResultRow<String>(
                label: "Title",
                result: schema.title,
                onQuoteTap: onQuoteTap
            )
        }
    }

    private var speakersBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Speakers")
            IngestFlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(Array(schema.speakers.enumerated()), id: \.offset) { _, sp in
                    speakerChip(sp)
                }
            }
        }
    }

    @ViewBuilder
    private func speakerChip(_ result: FieldResult<String>) -> some View {
        switch result {
        case .found(let value, _, let spans):
            Button {
                if let first = spans.first { onQuoteTap(first) }
            } label: {
                Text(value)
                    .font(LoomTokens.serif(size: 12))
                    .foregroundStyle(LoomTokens.ink)
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
        case .notFound:
            // Silent skip — a missing speaker slot is noise in a chip row.
            EmptyView()
        }
    }

    private var segmentsBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            sectionHeader("Segments")
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(schema.segments.enumerated()), id: \.offset) { _, seg in
                    segmentRow(seg)
                }
            }
        }
    }

    private func segmentRow(_ segment: SegmentEntry) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text(segment.timecode)
                .font(LoomTokens.mono(size: 11))
                .foregroundStyle(LoomTokens.thread)
                .frame(width: 72, alignment: .leading)
                .padding(.top, 2)
            VStack(alignment: .leading, spacing: 4) {
                FieldResultRow<String>(
                    label: "Topic",
                    result: segment.topic,
                    onQuoteTap: onQuoteTap
                )
                FieldResultRow<String>(
                    label: "Quote",
                    result: segment.sourceQuote,
                    onQuoteTap: onQuoteTap
                )
            }
        }
        .padding(8)
        .background(
            RoundedRectangle(cornerRadius: 6, style: .continuous)
                .fill(LoomTokens.hairFaint.opacity(0.6))
        )
    }

    private var keyQuotesBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader("Key Quotes")
            VStack(alignment: .leading, spacing: 6) {
                ForEach(Array(schema.keyQuotes.enumerated()), id: \.offset) { idx, q in
                    HStack(alignment: .top, spacing: 6) {
                        Text("\(idx + 1).")
                            .font(LoomTokens.serif(size: 12))
                            .foregroundStyle(LoomTokens.muted)
                            .frame(width: 18, alignment: .trailing)
                        FieldResultRow<String>(
                            label: "Quote",
                            result: q,
                            onQuoteTap: onQuoteTap
                        )
                    }
                }
            }
        }
    }

    // MARK: - Chrome

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 11, design: .serif).smallCaps())
            .fontWeight(.medium)
            .tracking(0.8)
            .foregroundStyle(LoomTokens.thread)
    }

    private var sectionDivider: some View {
        LoomTokens.hair.frame(height: 0.5)
    }

    // MARK: - Empty checks

    private func isAnyFound<T>(_ r: FieldResult<T>) -> Bool {
        if case .found = r { return true }
        return false
    }

    private func hasAnyFound(_ list: [FieldResult<String>]) -> Bool {
        list.contains { isAnyFound($0) }
    }

    private func hasAnySegment(_ segments: [SegmentEntry]) -> Bool {
        segments.contains { seg in
            isAnyFound(seg.topic) || isAnyFound(seg.sourceQuote)
        }
    }
}
// MARK: - Previews

#Preview("TranscriptSchemaView") {
    let span = SourceSpan(
        docId: "preview",
        pageNum: nil,
        charStart: 0,
        charEnd: 30,
        quote: "Welcome to today's session on monetary policy.",
        verified: true,
        verifyReason: nil
    )
    let schema = TranscriptSchema(
        title: .found(value: "RBA Monetary Policy Briefing", confidence: 0.95, sourceSpans: [span]),
        speakers: [
            .found(value: "Michele Bullock", confidence: 0.9, sourceSpans: [span]),
            .found(value: "Andrew Hauser", confidence: 0.85, sourceSpans: [span])
        ],
        segments: [
            SegmentEntry(
                timecode: "00:00",
                topic: .found(value: "Opening remarks", confidence: 0.9, sourceSpans: [span]),
                sourceQuote: .found(value: "Welcome to today's session…", confidence: 0.9, sourceSpans: [span])
            ),
            SegmentEntry(
                timecode: "03:15",
                topic: .notFound(tried: ["first sentence of segment"]),
                sourceQuote: .found(value: "The cash rate will remain at 4.35%…", confidence: 0.8, sourceSpans: [span])
            )
        ],
        keyQuotes: [
            .found(value: "Inflation remains above target.", confidence: 0.9, sourceSpans: [span])
        ]
    )
    return ScrollView {
        TranscriptSchemaView(
            schema: schema,
            sourceText: "…",
            onQuoteTap: { _ in }
        )
        .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 600)
}
