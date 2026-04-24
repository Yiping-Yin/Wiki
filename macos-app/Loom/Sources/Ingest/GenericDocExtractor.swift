import Foundation

// MARK: - GenericDocExtractor
//
// Fallback extractor used when no typed extractor (syllabus, textbook
// chapter, slide deck, …) wants to claim a file. Wraps the prior
// `IngestionView.summarise` prompt and provider dispatch byte-for-byte,
// while preserving the raw provider response for Phase 0's "zero
// behavior change" gate (plan §4 Phase 0).
//
// Phase 0 deliberately does NOT emit `FieldResult<T>` here. The generic
// extractor keeps returning a plain `GenericSchema` so existing
// ingestion flows behave identically. `FieldResult` is reserved for
// Phase 1+ typed extractors where honest `.notFound` reporting is the
// load-bearing UX win.

/// Free-form summary schema. `rawOutput` is the exact provider response
/// and is what Phase 0 returns to the existing ingestion flow for
/// behavior compatibility. `summary` / `keyPoints` are parsed views for
/// later extractor phases and diagnostics.
struct GenericSchema: Codable {
    let rawOutput: String
    let summary: String
    let keyPoints: [String]
}

/// Fallback extractor. `match` returns a low constant so any typed
/// extractor that claims a file wins, but every file can still be
/// handled end-to-end.
struct GenericDocExtractor: IngestExtractor {
    typealias Schema = GenericSchema

    static let extractorId = "generic-doc"

    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        // Baseline score — any typed extractor that returns > 0.1 wins,
        // but we still handle arbitrary files.
        return 0.1
    }

    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> GenericSchema {
        // Prompt copied verbatim from the pre-refactor
        // `IngestionView.summarise` (lines 550–581 of IngestionView.swift
        // as of 2026-04-24). Do not edit in Phase 0 — any change here
        // breaks the byte-for-byte-identical-output gate.
        let prompt = """
        Summarise the following document (\(filename)) in 2-3 sentences, then list 3-5 key points.

        ---
        \(text)
        ---

        Respond with the summary first, then a blank line, then a bulleted list of key points.
        """

        let rawOutput = try await sendToCurrentProvider(prompt: prompt)
        return Self.parse(rawOutput: rawOutput)
    }

    /// Dispatch to the user's configured AI provider. Order and option
    /// shapes match the pre-refactor switch in `IngestionView.summarise`
    /// exactly — keep them in sync if either side changes.
    private func sendToCurrentProvider(prompt: String) async throws -> String {
        let provider = AIProviderKind.current
        switch provider {
        case .openai:
            return try await OpenAIClient.send(prompt: prompt, options: OpenAIClient.Options())
        case .customEndpoint:
            return try await CustomEndpointClient.send(prompt: prompt, options: CustomEndpointClient.Options())
        case .ollama:
            return try await OllamaClient.send(prompt: prompt, options: OllamaClient.Options())
        case .claudeCli:
            var opts = CLIRuntimeClient.Options()
            opts.flavor = .claude
            return try await CLIRuntimeClient.send(prompt: prompt, options: opts)
        case .codexCli:
            var opts = CLIRuntimeClient.Options()
            opts.flavor = .codex
            return try await CLIRuntimeClient.send(prompt: prompt, options: opts)
        case .disabled:
            throw IngestError.aiDisabled
        default:
            return try await AnthropicClient.send(prompt: prompt, options: AnthropicClient.Options())
        }
    }

    /// Split free-form AI output into `(summary, keyPoints)`. Expects
    /// the shape the prompt asks for: prose paragraphs first, then a
    /// blank line, then `-` / `•` / `*` bullet lines.
    ///
    /// Kept lenient so we don't regress on today's output:
    ///   • Summary = everything up to the first bullet line
    ///   • Key points = every bullet line after that (regex
    ///     `^[-•*]\s+(.+)$`, multiline)
    static func parse(rawOutput: String) -> GenericSchema {
        // Normalize line endings so splitting behaves uniformly.
        let normalized = rawOutput.replacingOccurrences(of: "\r\n", with: "\n")
        let lines = normalized.components(separatedBy: "\n")

        var summaryLines: [String] = []
        var bulletLines: [String] = []
        var sawBullet = false

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if let bullet = extractBulletBody(from: trimmed) {
                sawBullet = true
                bulletLines.append(bullet)
            } else if !sawBullet {
                summaryLines.append(line)
            }
            // Lines after a bullet that aren't themselves bullets are
            // ignored in the parsed view only. `rawOutput` below still
            // preserves the provider response byte-for-byte for the
            // existing ingestion summary.
        }

        let summary = summaryLines
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return GenericSchema(rawOutput: rawOutput, summary: summary, keyPoints: bulletLines)
    }

    /// If `line` begins with a bullet marker (`-`, `•`, `*`) followed
    /// by whitespace, return the body with the marker stripped.
    /// Otherwise return nil.
    private static func extractBulletBody(from line: String) -> String? {
        guard let first = line.first else { return nil }
        guard first == "-" || first == "•" || first == "*" else { return nil }
        let afterMarker = line.dropFirst()
        guard let firstBodyChar = afterMarker.first, firstBodyChar.isWhitespace else {
            return nil
        }
        let body = afterMarker.drop(while: { $0.isWhitespace })
        let trimmed = String(body).trimmingCharacters(in: .whitespaces)
        return trimmed.isEmpty ? nil : trimmed
    }
}
