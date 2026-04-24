import Foundation

// MARK: - CleanText
//
// Phase 2 of the ingest-extractor-refactor plan
// (`plans/ingest-extractor-refactor.md` §4 Phase 2). Pure-Swift port of
// `scripts/ingest-knowledge.ts::cleanText()` lines 255–347.
//
// The Node pipeline has been the canonical text-cleaner for the
// folder-scan ingest path. The Swift PDF drop path was skipping it
// entirely (raw `PDFDocument(url:).page(at:).string`), which meant the
// SAME PDF ingested through Node vs Swift produced different cleaned
// plaintext — asymmetry that breaks golden-file tests, provider parity
// and downstream SourceSpan alignment.
//
// This port preserves every transform, in order, with the same regex
// semantics and the same sentinel characters (U+0001 / U+0002) as the
// TypeScript original. The Node version stays canonical — any future
// change is landed there first, then mirrored here.
//
// ### Offset semantics
//
// Consumers of the cleaned text downstream (`locate()` in
// `IngestExtractor.swift`, the web layer's charStart/charEnd, the
// Python verifier at `/tmp/mvp-verify-spans.py`) all use **UTF-16**
// char offsets — that matches JavaScript's native `String.length` /
// `indexOf`. `CleanText.apply()` does not itself emit offsets, but
// the output is UTF-16-safe: no transform splits a surrogate pair,
// and all replaceable characters (whitespace / ASCII punctuation /
// the two sentinels) are BMP scalars with `utf16.count == 1`.
//
// ### Regex parity (NSRegularExpression vs V8)
//
// Verified empirically on 2026-04-24 that `.replacingOccurrences(of:
// pattern, with: template, options: .regularExpression)` in Swift
// matches JavaScript's `.replace(/pattern/g, template)` byte-for-byte
// on every pattern used below — including the tricky reflow
// `([^\n])\n([^\n])` which both engines apply left-to-right with
// strict non-overlapping match advance. Triple-line inputs like
// "A\nB\nC" become "A B\nC" under BOTH engines (the middle `\n` is
// consumed by the first match, leaving the second without a non-`\n`
// left-neighbor). Quadruple-line "A\nB\nC\nD" becomes "A B\nC D".
//
// ### Parity verification
//
// `Tests/CleanTextParityTests.swift` pins the edge cases that previously
// diverged between Swift and the Node cleaner. If Node changes, update
// those fixtures in the same change.

/// Pure-function port of Node's `cleanText()`. Deterministic, no AI,
/// no side effects. Given the same input, returns the same output
/// byte-for-byte as the Node version for the shared fixture corpus.
///
/// `maxChars` is applied AFTER the full cleaning pipeline to mirror
/// the slice-after-clean used at every current Node call-site (e.g.
/// `scripts/ingest-knowledge.ts:355` does
/// `cleanText(raw.slice(0,80000)).slice(0,50000)` — the inner slice
/// is a raw-input guard the caller applies, the outer slice caps the
/// cleaned output; `maxChars` here is the outer slice).
public enum CleanText {
    public static func apply(_ input: String, maxChars: Int = 6000) -> String {
        let cleaned = applyFull(input)
        guard maxChars > 0, cleaned.count > maxChars else { return cleaned }
        return String(cleaned.prefix(maxChars))
    }

    /// Run every transform in order; no length cap. Exposed separately
    /// so parity tests can compare un-clipped output against the Node
    /// reference when the fixture is smaller than the default cap.
    static func applyFull(_ raw: String) -> String {
        if raw.isEmpty { return raw }

        // 1. Normalize line endings + strip invisible characters.
        //    Node: .replace(/\r\n?/g,'\n').replace(/ /g,' ').replace(/​/g,'')
        var s = raw
        s = s.replacingOccurrences(of: #"\r\n?"#, with: "\n", options: .regularExpression)
        s = s.replacingOccurrences(of: "\u{00A0}", with: " ")
        s = s.replacingOccurrences(of: "\u{200B}", with: "")

        // 2. Kill TOC dot-leaders / middot / underscore runs.
        s = s.replacingOccurrences(
            of: #"(?:\s?\.){4,}\s?"#,
            with: " ",
            options: .regularExpression
        )
        s = s.replacingOccurrences(
            of: #"(?:\s?·){4,}\s?"#,
            with: " ",
            options: .regularExpression
        )
        s = s.replacingOccurrences(
            of: #"(?:\s?_){4,}\s?"#,
            with: " ",
            options: .regularExpression
        )

        // 3. Detect repeated header/footer lines — short lines that
        //    appear ≥4 times after trimming.
        var lineCounts: [String: Int] = [:]
        for ln in s.split(separator: "\n", omittingEmptySubsequences: false) {
            let t = String(ln).trimmingCharacters(in: .whitespaces)
            // Count is by UTF-16 length to match JavaScript's
            // `String.length` — the Node source uses `t.length` which
            // is UTF-16. The window 3<len<80 is ASCII-only in practice
            // (headers / footers), so Unicode.Scalar vs UTF-16 only
            // matters defensively.
            let len = t.utf16.count
            if len > 3 && len < 80 {
                lineCounts[t, default: 0] += 1
            }
        }
        let repeated: Set<String> = Set(
            lineCounts.compactMap { key, count in count >= 4 ? key : nil }
        )

        // 5. Filter lines: drop standalone page numbers + "Page N of M"
        //    markers + repeated headers/footers + lines >50% punctuation.
        //    (Step 4 in the TS source is commentary only — no code.)
        let pageNumRx = try! NSRegularExpression(pattern: #"^\d{1,4}$"#)
        let pageOfRx = try! NSRegularExpression(pattern: #"^Page \d+( of \d+)?$"#, options: [.caseInsensitive])
        let punctRx = try! NSRegularExpression(pattern: #"[\.\,\-\_·…]"#)

        let kept: [String] = s
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { ln in
                let t = ln.trimmingCharacters(in: .whitespaces)
                if t.isEmpty { return true }
                if matchesEntire(pageNumRx, string: t) { return false }
                if matchesEntire(pageOfRx, string: t) { return false }
                if repeated.contains(t) { return false }
                // >50% punctuation heuristic — reject.
                let punct = countMatches(punctRx, in: t)
                let tLen = t.utf16.count
                if punct > 0, tLen > 0, Double(punct) / Double(tLen) > 0.5 {
                    return false
                }
                return true
            }

        // 6. Fix hyphenated word breaks at line ends.
        //    Node: s = lines.join('\n').replace(/(\w)-\n\s*(\w)/g, '$1$2');
        s = kept.joined(separator: "\n")
        s = s.replacingOccurrences(
            of: #"(\w)-\n\s*(\w)"#,
            with: "$1$2",
            options: .regularExpression
        )

        // 6a. Preserve multi-column layouts with sentinel markers.
        //     Lines containing ≥2 runs of 4+ inner spaces get split
        //     at those gaps, cells rejoined with " · ", wrapped in
        //     U+0001 / U+0002. Those sentinels survive through steps
        //     7–8 (which explicitly skip them) and are removed in 8.
        let colOpen = "\u{0001}"
        let colClose = "\u{0002}"
        let gapRx = try! NSRegularExpression(pattern: #" {4,}"#)
        s = s
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .map { ln -> String in
                let trimmed = ln.trimmingCharacters(in: .whitespaces)
                if trimmed.isEmpty { return ln }
                let gapCount = countMatches(gapRx, in: trimmed)
                if gapCount >= 2 {
                    // Split on runs of 4+ spaces, trim each cell,
                    // drop empties, then rejoin with " · ". Only
                    // engage the sentinel wrap when ≥3 cells survive
                    // (matches the TS guard).
                    let cells = splitByRegex(gapRx, string: trimmed)
                        .map { $0.trimmingCharacters(in: .whitespaces) }
                        .filter { !$0.isEmpty }
                    if cells.count >= 3 {
                        return colOpen + cells.joined(separator: " · ") + colClose
                    }
                }
                return ln
            }
            .joined(separator: "\n")

        // 7. Reflow: single newline → space, except across sentinel
        //    markers (columnar rows stay one per line). Swift
        //    NSRegularExpression matches V8 here (see header comment).
        s = s.replacingOccurrences(
            of: "([^\n\u{0001}\u{0002}])\n([^\n\u{0001}\u{0002}])",
            with: "$1 $2",
            options: .regularExpression
        )

        // 8. Collapse blank lines + per-line whitespace (skipping
        //    sentinel-wrapped columnar rows).
        s = s.replacingOccurrences(
            of: #"\n{3,}"#,
            with: "\n\n",
            options: .regularExpression
        )
        s = s
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .map { ln -> String in
                if ln.hasPrefix(colOpen) {
                    // Strip sentinels but preserve inner spacing.
                    var stripped = ln
                    stripped = stripped.replacingOccurrences(of: colOpen, with: "")
                    stripped = stripped.replacingOccurrences(of: colClose, with: "")
                    return stripped
                }
                let collapsed = ln.replacingOccurrences(
                    of: #"[ \t]{2,}"#,
                    with: " ",
                    options: .regularExpression
                )
                return collapsed.trimmingCharacters(in: .whitespaces)
            }
            .joined(separator: "\n")

        // 9. Final cleanup: stray leader dots, residual double spaces.
        s = s.replacingOccurrences(of: " . . .", with: "")
        s = s.replacingOccurrences(
            of: #" {2,}"#,
            with: " ",
            options: .regularExpression
        )

        return s.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Helpers (file-private)

/// Whether `regex` matches the entire string (anchored both ends).
/// Used for `^...$` checks where we don't want partial-line matches.
private func matchesEntire(_ regex: NSRegularExpression, string: String) -> Bool {
    let range = NSRange(string.startIndex..<string.endIndex, in: string)
    guard let match = regex.firstMatch(in: string, options: [], range: range) else {
        return false
    }
    return match.range == range
}

/// Count non-overlapping matches of `regex` in `string`.
private func countMatches(_ regex: NSRegularExpression, in string: String) -> Int {
    let range = NSRange(string.startIndex..<string.endIndex, in: string)
    return regex.numberOfMatches(in: string, options: [], range: range)
}

/// Split `string` on every match of `regex`. Mirrors JavaScript's
/// `String.split(regex)` for the (non-capturing, non-zero-width)
/// patterns we use: empty leading / trailing fragments are preserved;
/// callers filter empties explicitly.
private func splitByRegex(_ regex: NSRegularExpression, string: String) -> [String] {
    let nsString = string as NSString
    let full = NSRange(location: 0, length: nsString.length)
    let matches = regex.matches(in: string, options: [], range: full)
    if matches.isEmpty { return [string] }
    var parts: [String] = []
    var cursor = 0
    for m in matches {
        let before = NSRange(location: cursor, length: m.range.location - cursor)
        parts.append(nsString.substring(with: before))
        cursor = m.range.location + m.range.length
    }
    parts.append(nsString.substring(with: NSRange(location: cursor, length: full.length - cursor)))
    return parts
}
