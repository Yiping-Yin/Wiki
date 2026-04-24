import SwiftUI

// MARK: - FieldResultRow
//
// Phase 4 of the ingest-extractor-refactor plan (plan §4 Phase 4 + §7).
// Reusable renderer for a single `FieldResult<T>` cell. Every typed-schema
// view in this folder composes rows of this primitive so the four render
// states — `.found` verified, `.found` unverified, `.found` low-confidence,
// `.notFound` — stay visually consistent across surfaces.
//
// Scope constraints (from the Phase 4 agent brief):
//   - WRITE NEW FILES ONLY. No edits to IngestionView.swift. Phase 5 owns
//     the integration end.
//   - Pure SwiftUI, no SPM deps.
//   - LoomTokens for every color / font. No hardcoded hex.
//   - `onQuoteTap` is a callback — this view never scrolls anything
//     itself. Phase 5 provides the scroll-to-span coordinator.
//
// Render rules (verbatim from plan §4 Phase 4 + the brief's §A):
//   .found:
//     • eyebrow label (serif small-caps)
//     • primary value (serif, oldstyle/proportional numerals via
//       `.monospacedDigit()`-off + serif cascade)
//     • first sourceSpan as a tappable chip; if >1, "see N more" disclosure
//     • if ANY span has `verified: false` → warning badge with reason
//     • if `confidence < 0.5` → demote value with `.opacity(0.7)`
//   .notFound:
//     • label in muted tone
//     • "not found" italic muted
//     • chevron disclosure revealing "tried: …" bullet list

/// Renderer for a single `FieldResult<T>` where `T` is primitively
/// stringifiable (String, Double, Int, …). Complex nested values should
/// be flattened by the caller before reaching this view.
struct FieldResultRow<T: CustomStringConvertible & Codable>: View {
    let label: String
    let result: FieldResult<T>
    let onQuoteTap: (SourceSpan) -> Void

    @State private var showAllQuotes: Bool = false
    @State private var showTried: Bool = false

    init(
        label: String,
        result: FieldResult<T>,
        onQuoteTap: @escaping (SourceSpan) -> Void
    ) {
        self.label = label
        self.result = result
        self.onQuoteTap = onQuoteTap
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            eyebrow
            switch result {
            case .found(let value, let confidence, let spans):
                foundBody(value: value, confidence: confidence, spans: spans)
            case .notFound(let tried):
                notFoundBody(tried: tried)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Subviews

    /// Vellum eyebrow: serif small-caps, medium weight, light tracking,
    /// muted in `.notFound` state to reinforce absence.
    private var eyebrow: some View {
        let isMissing: Bool
        switch result {
        case .found: isMissing = false
        case .notFound: isMissing = true
        }
        return Text(label)
            .font(.system(size: 10, design: .serif).smallCaps())
            .fontWeight(.medium)
            .tracking(0.5)
            .foregroundStyle(isMissing ? LoomTokens.muted : LoomTokens.ink3)
    }

    @ViewBuilder
    private func foundBody(value: T, confidence: Double, spans: [SourceSpan]) -> some View {
        let anyUnverified = spans.contains { !$0.verified }
        let lowConfidence = confidence < 0.5

        // Primary value — serif body with oldstyle numerals via
        // font-feature-settings (matches the web `onum` rule in globals.css).
        Text(value.description)
            .font(LoomTokens.serif(size: 14))
            .foregroundStyle(LoomTokens.ink)
            .opacity(lowConfidence ? 0.7 : 1.0)
            .textSelection(.enabled)

        if anyUnverified {
            unverifiedBadge(spans: spans)
        }

        if !spans.isEmpty {
            quoteChipsStrip(spans: spans)
        }
    }

    @ViewBuilder
    private func notFoundBody(tried: [String]) -> some View {
        HStack(spacing: 6) {
            Text("not found")
                .font(LoomTokens.serif(size: 13, italic: true))
                .foregroundStyle(LoomTokens.muted)

            if !tried.isEmpty {
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        showTried.toggle()
                    }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: showTried ? "chevron.down" : "chevron.right")
                            .font(.system(size: 9, weight: .regular))
                        Text("tried \(tried.count)")
                            .font(LoomTokens.sans(size: 10))
                    }
                    .foregroundStyle(LoomTokens.muted)
                }
                .buttonStyle(.plain)
            }
        }

        if showTried, !tried.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(Array(tried.enumerated()), id: \.offset) { _, item in
                    HStack(alignment: .top, spacing: 4) {
                        Text("·")
                            .font(LoomTokens.serif(size: 11))
                            .foregroundStyle(LoomTokens.muted)
                        Text(item)
                            .font(LoomTokens.serif(size: 11, italic: true))
                            .foregroundStyle(LoomTokens.ink3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            .padding(.leading, 10)
            .padding(.top, 2)
        }
    }

    // MARK: - Quote chips

    @ViewBuilder
    private func quoteChipsStrip(spans: [SourceSpan]) -> some View {
        // Single span → inline chip. Multiple → show first + disclosure.
        if spans.count == 1 {
            quoteChip(spans[0])
        } else {
            VStack(alignment: .leading, spacing: 3) {
                // Always visible: first chip.
                quoteChip(spans[0])

                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        showAllQuotes.toggle()
                    }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: showAllQuotes ? "chevron.down" : "chevron.right")
                            .font(.system(size: 9, weight: .regular))
                        Text(showAllQuotes
                             ? "hide quotes"
                             : "see \(spans.count - 1) more")
                            .font(LoomTokens.sans(size: 10))
                    }
                    .foregroundStyle(LoomTokens.muted)
                }
                .buttonStyle(.plain)

                if showAllQuotes {
                    ForEach(Array(spans.dropFirst().enumerated()), id: \.offset) { _, span in
                        quoteChip(span)
                    }
                }
            }
        }
    }

    /// Small tappable chip: quote text in muted serif inside a hair-
    /// bordered capsule. Tap → Phase 5 scrolls source pane to span.
    /// `p. N` page badge renders right next to the opening-quote glyph
    /// when the span carries a derived pageNum (PDF sources only;
    /// 2026-04-24 multi-page gap-fill).
    private func quoteChip(_ span: SourceSpan) -> some View {
        Button {
            onQuoteTap(span)
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "quote.opening")
                    .font(.system(size: 8, weight: .regular))
                    .foregroundStyle(span.verified ? LoomTokens.thread : LoomTokens.rose)
                if let page = span.pageNum {
                    Text("p. \(page)")
                        .font(LoomTokens.mono(size: 9))
                        .foregroundStyle(LoomTokens.muted)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .background(
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(LoomTokens.hair.opacity(0.4))
                        )
                }
                Text(truncate(span.quote, to: 80))
                    .font(LoomTokens.serif(size: 11, italic: true))
                    .foregroundStyle(LoomTokens.ink2)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
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
        .buttonStyle(.plain)
        .help(span.pageNum.map { "p. \($0) · \(span.quote)" } ?? span.quote)
    }

    // MARK: - Unverified badge

    @ViewBuilder
    private func unverifiedBadge(spans: [SourceSpan]) -> some View {
        let reason = spans.compactMap { $0.verified ? nil : $0.verifyReason }.first
            ?? "quote_not_substring_of_source"
        HStack(spacing: 4) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 9, weight: .regular))
            Text("unverified · \(prettyReason(reason))")
                .font(LoomTokens.sans(size: 10))
        }
        .foregroundStyle(LoomTokens.rose)
        .padding(.horizontal, 6)
        .padding(.vertical, 2)
        .background(
            Capsule(style: .continuous)
                .fill(LoomTokens.rose.opacity(0.08))
        )
    }

    // MARK: - Helpers

    private func truncate(_ s: String, to n: Int) -> String {
        guard s.count > n else { return s }
        return s.prefix(n) + "…"
    }

    /// Convert machine-readable verifyReason into human-readable copy.
    /// Strings stay short so they fit inline next to the value.
    private func prettyReason(_ reason: String) -> String {
        switch reason {
        case "quote_not_substring_of_source": return "quote not in source"
        case "quote_appears_non_contiguous":  return "quote stitched from fragments"
        case "quote_matches_filename_stem":   return "quote matches filename"
        default:
            // Generic fallback: turn snake_case into sentence words.
            return reason.replacingOccurrences(of: "_", with: " ")
        }
    }
}

// MARK: - Previews

#Preview("FieldResultRow · found verified") {
    let span = SourceSpan(
        docId: "preview-doc",
        pageNum: 1,
        charStart: 0,
        charEnd: 42,
        quote: "FINS 3640 · Investment Banking, Term 3 2025",
        verified: true,
        verifyReason: nil
    )
    return FieldResultRow<String>(
        label: "Course Code",
        result: .found(value: "FINS 3640", confidence: 0.95, sourceSpans: [span]),
        onQuoteTap: { _ in }
    )
    .padding()
    .background(LoomTokens.paper)
}

#Preview("FieldResultRow · found unverified") {
    let span = SourceSpan(
        docId: "preview-doc",
        pageNum: nil,
        charStart: 0,
        charEnd: 0,
        quote: "Course Overview_FINS3640.pdf",
        verified: false,
        verifyReason: "quote_matches_filename_stem"
    )
    return FieldResultRow<String>(
        label: "Course Name",
        result: .found(value: "Investment Banking", confidence: 0.4, sourceSpans: [span]),
        onQuoteTap: { _ in }
    )
    .padding()
    .background(LoomTokens.paper)
}

#Preview("FieldResultRow · not found") {
    FieldResultRow<String>(
        label: "Term",
        result: .notFound(tried: [
            "first 500 chars",
            "'About the course' section",
            "assessment due dates"
        ]),
        onQuoteTap: { _ in }
    )
    .padding()
    .background(LoomTokens.paper)
}
