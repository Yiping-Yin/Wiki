import SwiftUI

// MARK: - IngestExtractorResultView
//
// Phase 4 — root dispatcher. Phase 5 imports this one view and passes
// whichever schema its extractor produced; we dispatch to the matching
// typed renderer internally. Keeping the case enum here (rather than
// on the extractor protocol) keeps the schema types free of any UI
// dependency.
//
// Phase 4 note (2026-04-24): replaces the minimal stub the Phase 5
// agent seeded so its IngestionView changes could compile in parallel.
// Public API (`schema:` / `sourceText:` / `onQuoteTap:`) preserved
// byte-for-byte; per-case dispatch now routes to the typed views
// (SyllabusSchemaView, TranscriptSchemaView, …) in this folder.

struct IngestExtractorResultView: View {
    enum Schema {
        case syllabus(SyllabusSchema)
        case transcript(TranscriptSchema)
        case textbook(TextbookSchema)
        case slideDeck(SlideDeckSchema)
        case markdownNotes(MarkdownNotesSchema)
        case spreadsheet(SpreadsheetSchema)
        case generic(GenericSchema)
    }

    let schema: Schema
    let sourceText: String
    let onQuoteTap: (SourceSpan) -> Void

    init(
        schema: Schema,
        sourceText: String,
        onQuoteTap: @escaping (SourceSpan) -> Void
    ) {
        self.schema = schema
        self.sourceText = sourceText
        self.onQuoteTap = onQuoteTap
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            kindHeader
            IngestHairline()
            content
        }
    }

    // MARK: - Header

    /// Badge + schema kind. Serif small-caps tracks the Vellum chrome
    /// elsewhere (feedback_vellum_polish_rules.md — eyebrows are serif
    /// small-caps, NEVER sans uppercase).
    @ViewBuilder
    private var kindHeader: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.seal")
                .foregroundStyle(LoomTokens.thread)
                .font(.system(size: 11))
            Text(schemaKindLabel)
                .font(.system(size: 11, design: .serif).smallCaps())
                .fontWeight(.medium)
                .tracking(0.8)
                .foregroundStyle(LoomTokens.thread)
            Spacer(minLength: 0)
            // "Verified" ribbon when this schema is typed + has at least
            // one verified source span — the honest positive signal.
            if hasAnyVerifiedSpan {
                HStack(spacing: 3) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 9))
                    Text("verified")
                        .font(LoomTokens.sans(size: 10))
                }
                .foregroundStyle(LoomTokens.sage)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(Capsule(style: .continuous).fill(LoomTokens.sage.opacity(0.08)))
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch schema {
        case .syllabus(let s):
            SyllabusSchemaView(schema: s, sourceText: sourceText, onQuoteTap: onQuoteTap)
        case .transcript(let s):
            TranscriptSchemaView(schema: s, sourceText: sourceText, onQuoteTap: onQuoteTap)
        case .textbook(let s):
            TextbookSchemaView(schema: s, sourceText: sourceText, onQuoteTap: onQuoteTap)
        case .slideDeck(let s):
            SlideDeckSchemaView(schema: s, sourceText: sourceText, onQuoteTap: onQuoteTap)
        case .markdownNotes(let s):
            MarkdownNotesSchemaView(schema: s)
        case .spreadsheet(let s):
            SpreadsheetSchemaView(schema: s)
        case .generic(let s):
            GenericSchemaFallbackView(schema: s)
        }
    }

    private var schemaKindLabel: String {
        switch schema {
        case .syllabus: return "Syllabus"
        case .transcript: return "Transcript"
        case .textbook: return "Textbook chapter"
        case .slideDeck: return "Slide deck"
        case .markdownNotes: return "Markdown notes"
        case .spreadsheet: return "Spreadsheet"
        case .generic: return "Document"
        }
    }

    // MARK: - Verified-ribbon predicate

    /// True iff the schema has at least one `.found` field with a
    /// verified source span. Absence of verified spans silently hides
    /// the ribbon — an unverified schema shouldn't ever feel "endorsed".
    private var hasAnyVerifiedSpan: Bool {
        switch schema {
        case .syllabus(let s):
            return anyVerified(s.courseCode)
                || anyVerified(s.courseName)
                || anyVerified(s.term)
                || anyVerified(s.institution)
                || anyVerified(s.officeHours)
                || anyVerified(s.textbook)
                || s.teachers.contains { anyVerified($0.role) || anyVerified($0.name) || anyVerified($0.email) }
                || s.assessmentItems.contains {
                    anyVerified($0.name) || anyVerified($0.weightPercent)
                        || anyVerified($0.dueDate) || anyVerified($0.format)
                }
                || s.learningObjectives.contains { anyVerified($0) }
                || s.weekTopics.contains { anyVerified($0.weekRange) || anyVerified($0.topic) }
        case .transcript(let s):
            return anyVerified(s.title)
                || s.speakers.contains { anyVerified($0) }
                || s.keyQuotes.contains { anyVerified($0) }
                || s.segments.contains { anyVerified($0.topic) || anyVerified($0.sourceQuote) }
        case .textbook(let s):
            return anyVerified(s.chapterTitle)
                || anyVerified(s.chapterNumber)
                || anyVerified(s.summary)
                || s.learningObjectives.contains { anyVerified($0) }
                || s.keyTerms.contains { anyVerified($0) }
                || s.sectionHeadings.contains { anyVerified($0) }
        case .slideDeck(let s):
            return anyVerified(s.deckTitle)
                || anyVerified(s.author)
                || s.sections.contains { anyVerified($0.title) || anyVerified($0.slideRange) }
                || s.topics.contains { anyVerified($0) }
        case .markdownNotes, .spreadsheet, .generic:
            // Deterministic / freeform schemas don't carry SourceSpans —
            // the "verified" vocabulary doesn't apply. Suppress ribbon.
            return false
        }
    }

    private func anyVerified<T>(_ result: FieldResult<T>) -> Bool {
        if case .found(_, _, let spans) = result {
            return spans.contains { $0.verified }
        }
        return false
    }
}

// MARK: - Generic fallback renderer
//
// GenericSchema is the free-form prose summary produced by
// `GenericDocExtractor`. Phase 0 preserves the shape byte-for-byte,
// so the renderer here is deliberately narrow: the summary paragraph,
// a bulleted key-points list, and an optional raw-output disclosure
// for debugging. No click-to-quote — GenericSchema carries no spans.

struct GenericSchemaFallbackView: View {
    let schema: GenericSchema
    @State private var showRaw: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            IngestSectionHeader(title: "Summary")
            if !schema.summary.isEmpty {
                Text(schema.summary)
                    .font(LoomTokens.serif(size: 14))
                    .foregroundStyle(LoomTokens.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            } else {
                Text("No summary.")
                    .font(LoomTokens.serif(size: 12, italic: true))
                    .foregroundStyle(LoomTokens.muted)
            }

            if !schema.keyPoints.isEmpty {
                IngestHairline()
                IngestSectionHeader(title: "Key Points")
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(schema.keyPoints.enumerated()), id: \.offset) { idx, point in
                        HStack(alignment: .top, spacing: 6) {
                            Text("\(idx + 1).")
                                .font(LoomTokens.serif(size: 12))
                                .foregroundStyle(LoomTokens.muted)
                                .frame(width: 18, alignment: .trailing)
                            Text(point)
                                .font(LoomTokens.serif(size: 13))
                                .foregroundStyle(LoomTokens.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }

            Button {
                withAnimation(.easeInOut(duration: 0.15)) { showRaw.toggle() }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: showRaw ? "chevron.down" : "chevron.right")
                        .font(.system(size: 9))
                    Text(showRaw ? "hide raw output" : "show raw output")
                        .font(LoomTokens.sans(size: 10))
                }
                .foregroundStyle(LoomTokens.muted)
            }
            .buttonStyle(.plain)

            if showRaw {
                Text(schema.rawOutput)
                    .font(LoomTokens.mono(size: 11))
                    .foregroundStyle(LoomTokens.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(8)
                    .background(
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(LoomTokens.hairFaint)
                    )
                    .textSelection(.enabled)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Previews

#Preview("IngestExtractorResultView · generic") {
    let schema = GenericSchema(
        rawOutput: "This is a summary of a document.\n\n- Point one\n- Point two\n- Point three",
        summary: "This is a summary of a document.",
        keyPoints: ["Point one", "Point two", "Point three"]
    )
    return ScrollView {
        IngestExtractorResultView(
            schema: .generic(schema),
            sourceText: "raw source",
            onQuoteTap: { _ in }
        )
        .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 500)
}

#Preview("IngestExtractorResultView · syllabus") {
    let span = SourceSpan(
        docId: "preview",
        pageNum: 1,
        charStart: 0,
        charEnd: 20,
        quote: "FINS 3640",
        verified: true,
        verifyReason: nil
    )
    let schema = SyllabusSchema(
        courseCode: .found(value: "FINS 3640", confidence: 0.95, sourceSpans: [span]),
        courseName: .notFound(tried: ["title", "first 500 chars"]),
        term: .notFound(tried: ["assessment due dates"]),
        institution: .found(value: "UNSW", confidence: 0.9, sourceSpans: [span]),
        teachers: [],
        officeHours: .notFound(tried: []),
        textbook: .notFound(tried: []),
        assessmentItems: [],
        learningObjectives: [],
        weekTopics: []
    )
    return ScrollView {
        IngestExtractorResultView(
            schema: .syllabus(schema),
            sourceText: "FINS 3640 course materials …",
            onQuoteTap: { _ in }
        )
        .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 500)
}
