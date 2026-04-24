import Foundation

// MARK: - MarkdownNotesExtractor
//
// Plan §3.3 Phase 3 — user-authored markdown / plain-text notes.
//
// **Philosophy (load-bearing):** the user wrote this themselves. Do NOT
// call AI. Do NOT summarize. Do NOT infer intent. Extract structural
// anchors only — headings, word count, code/math flags, a short preview
// — and let later phases (Panel seeding, outline view) use them
// deterministically.
//
// This matches `feedback_extract_not_author` and `feedback_source_fidelity`
// in the memory: Loom does not author prose over content the user
// already authored.
//
// Match rules (plan §3.3):
//   • filename ends with `.md` / `.mdx` / `.txt`
//   • AND the body is not transcript-shaped (≥2 occurrences of `\d+:\d+`
//     timestamp pattern would hand ownership to `TranscriptExtractor`).
//   • Score 0.9 when both conditions hit.

struct MarkdownNotesExtractor: IngestExtractor {
    typealias Schema = MarkdownNotesSchema

    static let extractorId = "markdown-notes"

    /// Plain-text extensions we treat as user-authored notes. `.txt` is
    /// included but ceded to `TranscriptExtractor` when the body looks
    /// transcript-shaped.
    static let noteExtensions: Set<String> = ["md", "mdx", "txt"]

    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        let ext = (filename as NSString).pathExtension.lowercased()
        guard noteExtensions.contains(ext) else { return 0.0 }

        // Transcript sniff: if the sample has ≥2 `\d{1,2}:\d{2}` matches,
        // cede to TranscriptExtractor (which scores 0.85+ on the same
        // content).
        if countTimestampPatterns(in: sample) >= 2 {
            return 0.0
        }

        return 0.9
    }

    /// Count `\d{1,2}:\d{2}(:\d{2})?` matches — the transcript signal.
    /// Deliberately permissive (doesn't require "MM:SS" to be on its own
    /// line) because `.txt` transcripts in the wild are messy.
    static func countTimestampPatterns(in text: String) -> Int {
        guard let regex = try? NSRegularExpression(
            pattern: #"\b\d{1,2}:\d{2}(?::\d{2})?\b"#
        ) else {
            return 0
        }
        let nsText = text as NSString
        return regex.numberOfMatches(in: text, range: NSRange(location: 0, length: nsText.length))
    }

    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> MarkdownNotesSchema {
        // No AI call. All deterministic.
        let headings = Self.extractHeadings(from: text)
        let title = Self.deriveTitle(from: headings, filename: filename)
        let wordCount = Self.countWords(in: text)
        let hasCode = Self.detectCode(in: text)
        let hasMath = Self.detectMath(in: text)
        let preview = Self.buildPreview(from: text)
        return MarkdownNotesSchema(
            title: title,
            headings: headings,
            wordCount: wordCount,
            hasCode: hasCode,
            hasMath: hasMath,
            preview: preview
        )
    }

    // MARK: - Heading scan
    //
    // Line-by-line scan for ATX headings (`# ` through `###### `). We
    // skip setext-style (`===`/`---` underlines) because they're rarely
    // used in modern notes and add parsing cost. `charOffset` is the
    // UTF-16 offset where the heading line starts (before the `#`).

    static func extractHeadings(from text: String) -> [HeadingEntry] {
        var result: [HeadingEntry] = []
        var offset = 0
        var inFence = false
        let nsText = text as NSString
        text.enumerateLines { line, _ in
            let lineLen = (line as NSString).length
            defer {
                // +1 for the trailing newline removed by enumerateLines.
                // Clamp so we don't run past the source length when the
                // last line has no trailing newline.
                offset = min(offset + lineLen + 1, nsText.length)
            }

            // Track fenced code blocks so headings inside ``` aren't
            // picked up (Markdown treats them as code, not structure).
            let trimmedStart = line.drop(while: { $0 == " " })
            if trimmedStart.hasPrefix("```") || trimmedStart.hasPrefix("~~~") {
                inFence.toggle()
                return
            }
            if inFence { return }

            guard let (level, body) = parseATXHeading(line: line) else { return }
            result.append(HeadingEntry(level: level, text: body, charOffset: offset))
        }
        return result
    }

    /// Parse an ATX heading line. Returns `(level, text)` when the line
    /// starts with 1-6 `#` characters followed by whitespace + body.
    /// Trailing `#` decorations (Markdown optional closing marker) are
    /// stripped from the body.
    private static func parseATXHeading(line: String) -> (Int, String)? {
        var cursor = line.startIndex
        var level = 0
        while cursor < line.endIndex, line[cursor] == "#", level < 6 {
            level += 1
            cursor = line.index(after: cursor)
        }
        guard level > 0 else { return nil }
        // Must be followed by whitespace or end-of-line.
        guard cursor == line.endIndex || line[cursor].isWhitespace else { return nil }

        let rest = line[cursor...].drop(while: { $0.isWhitespace })
        // Strip optional trailing `#` markers only when they are a real
        // Markdown closing sequence, e.g. "Title ###". Keep meaningful
        // body text such as "C#" intact.
        var body = String(rest).trimmingCharacters(in: .whitespaces)
        if let closing = body.range(of: #"\s+#+$"#, options: .regularExpression) {
            body.removeSubrange(closing)
            body = body.trimmingCharacters(in: .whitespaces)
        }
        if body.isEmpty { return nil }
        return (level, body)
    }

    // MARK: - Title fallback

    /// Prefer the first H1; otherwise fall back to the filename stem.
    /// Returns `nil` only if both are unavailable (shouldn't happen in
    /// practice — filename always has a stem).
    static func deriveTitle(from headings: [HeadingEntry], filename: String) -> String? {
        if let h1 = headings.first(where: { $0.level == 1 }) {
            return h1.text
        }
        let stem = (filename as NSString).deletingPathExtension
        return stem.isEmpty ? nil : stem
    }

    // MARK: - Word count

    /// Whitespace-split word count. Matches Obsidian / Bear's counting
    /// convention — punctuation sticks to words; newlines split.
    static func countWords(in text: String) -> Int {
        var count = 0
        var inWord = false
        for scalar in text.unicodeScalars {
            if CharacterSet.whitespacesAndNewlines.contains(scalar) {
                inWord = false
            } else if !inWord {
                count += 1
                inWord = true
            }
        }
        return count
    }

    // MARK: - Code / math detection

    /// Detect fenced (``` / ~~~) or indented (4-space leading) code.
    /// Short-circuit on first hit — we only need a boolean.
    static func detectCode(in text: String) -> Bool {
        // Cheap fence check.
        if text.range(of: "```") != nil { return true }
        if text.range(of: "~~~") != nil { return true }
        // Indented: any line that starts with 4 spaces + a non-space.
        // Regex is faster than line iteration for large files; the NSRegexp
        // engine short-circuits on first match with `firstMatch`.
        if let regex = try? NSRegularExpression(
            pattern: #"(?m)^ {4}\S"#
        ) {
            let nsText = text as NSString
            if regex.firstMatch(
                in: text,
                range: NSRange(location: 0, length: nsText.length)
            ) != nil {
                return true
            }
        }
        return false
    }

    /// Detect LaTeX-style math: `$...$`, `$$...$$`, or `\(...\)`.
    /// Deliberately permissive — one hit anywhere is enough to flip the
    /// flag. Not a full Markdown-math parser; flag only.
    static func detectMath(in text: String) -> Bool {
        // `$$...$$` first (avoids single-$ false positives on prices).
        if let _ = text.range(of: "$$") { return true }
        if text.range(of: #"\("#) != nil, text.range(of: #"\)"#) != nil {
            return true
        }
        // Single-$ math: require `$<non-space>...<non-space>$` on a single
        // line. Cheap heuristic: regex for `\$[^$\n]+\$`.
        if let regex = try? NSRegularExpression(pattern: #"\$[^\$\n]{1,120}\$"#) {
            let nsText = text as NSString
            if regex.firstMatch(
                in: text,
                range: NSRange(location: 0, length: nsText.length)
            ) != nil {
                return true
            }
        }
        return false
    }

    // MARK: - Preview

    /// First ~200 characters of the body, skipping leading headings /
    /// front-matter. Whitespace is collapsed to a single space so the
    /// preview fits in a one-line sidebar.
    static func buildPreview(from text: String) -> String {
        // Strip YAML front matter if present (`---\n...\n---\n` at top).
        let body = stripFrontMatter(from: text)
        // Walk lines, take the first non-heading paragraph.
        var collected = ""
        var inFence = false
        body.enumerateLines { line, stop in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") || trimmed.hasPrefix("~~~") {
                inFence.toggle()
                return
            }
            if inFence { return }
            if trimmed.isEmpty { return }
            if trimmed.hasPrefix("#") { return }
            if !collected.isEmpty { collected += " " }
            collected += trimmed
            if collected.count >= 200 { stop = true }
        }
        let collapsed = collected.collapsingWhitespace()
        if collapsed.count <= 200 { return collapsed }
        // Hard cut at 200 chars, preserving whole-word boundary if cheap.
        let nsCollapsed = collapsed as NSString
        let hard = nsCollapsed.substring(to: min(200, nsCollapsed.length))
        if let lastSpace = hard.lastIndex(of: " "),
           hard.distance(from: hard.startIndex, to: lastSpace) > 150 {
            return String(hard[..<lastSpace]) + "…"
        }
        return hard + "…"
    }

    /// Strip YAML front-matter block at the top of the file, if present.
    /// Matches the convention Obsidian / Jekyll / Hugo share: `---` on
    /// its own line, YAML body, closing `---` on its own line.
    private static func stripFrontMatter(from text: String) -> String {
        guard text.hasPrefix("---") else { return text }
        let afterFirst = text.dropFirst(3)
        // Require the opening `---` to be followed by newline.
        guard afterFirst.first?.isNewline == true else { return text }
        let rest = afterFirst.drop(while: { $0.isNewline })
        if let closing = rest.range(of: "\n---") {
            // Skip past the closing `---` + its trailing newline if any.
            var end = closing.upperBound
            if end < rest.endIndex, rest[end].isNewline {
                end = rest.index(after: end)
            }
            return String(rest[end...])
        }
        return text
    }
}
