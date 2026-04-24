import Foundation

/// Phase 7.1 · Folder → document resolver for extracted schemas.
///
/// The "namespace gap" (plan §2.5): extracted schemas live on
/// `LoomTrace.sourceDocId = "ingested:<filename>"`, while reading
/// pages live on `know/<cat>__<file>` or `wiki/<slug>`. This service
/// is the bridge — given a reading docId, it walks persisted traces,
/// finds the nearest syllabus trace that applies, decodes its schema
/// JSON, and layers any user corrections from the sidecar store.
///
/// Designed as a reusable service (not a bridge handler) because
/// Phase 7.2 (assessment → Pursuit seed) and Phase 7.3 (passive
/// AnchorDot projection) both need the same folder → doc matching
/// logic. Q1 of plan §8 (`folder → doc resolver location`) is locked
/// Swift-side here; Phase 7.2/7.3 will import `SchemaResolver`
/// directly rather than duplicate the matching heuristic.
///
/// Matching strategy (verified against the sample FINS 3640 schema
/// in `/tmp/phase6-e2e/fins-3640/loomtrace-events.json`):
///
/// 1. Normalise the reading page's category slug → `uppercaseLetters`
///    and `digitRuns` tokens (e.g. `unsw-fins-3640` → `FINS` + `3640`).
/// 2. Walk every `ingestion-syllabus-pdf` trace. For each, normalise
///    its source filename + any extracted `courseCode` field value
///    into the same token shape.
/// 3. First trace whose token set fully contains the category's
///    tokens wins. Ties break by most-recent `updatedAt` so re-drops
///    of a corrected syllabus supersede earlier versions.
///
/// Wiki pages return `nil` — there is no meaningful "course context"
/// for the generic LLM wiki; any match would be spurious.
///
/// When no syllabus trace matches, returns `nil` — the reading page
/// renders without the strip (plan §5.1 "hide entirely when schema
/// is null", restated in deliverable B).
@MainActor
enum SchemaResolver {

    /// Resolve the best-matching syllabus payload for a reading page.
    /// Returns `nil` when the reading page is not knowledge-scoped, or
    /// when no syllabus trace matches the page's category.
    static func resolveSyllabus(forReadingDocId readingDocId: String) -> SchemaPayload? {
        guard let categorySlug = categorySlug(fromReadingDocId: readingDocId) else {
            return nil
        }
        let categoryTokens = tokens(fromSlug: categorySlug)
        guard !categoryTokens.isEmpty else { return nil }

        let traces: [LoomTrace]
        do {
            traces = try LoomTraceWriter.allTraces()
        } catch {
            NSLog("[Loom] SchemaResolver.resolveSyllabus: allTraces failed: \(error)")
            return nil
        }

        var best: (trace: LoomTrace, event: [String: Any])? = nil
        for trace in traces where trace.kind == "ingestion-\(SyllabusPDFExtractor.extractorId)" {
            guard let event = firstSchemaEvent(in: trace) else { continue }
            let filename = trace.sourceTitle ?? ""
            let filenameTokens = tokens(from: filename)
            let courseCodeTokens = tokens(fromCourseCodeField: event["schemaJSON"] as? String)
            let combined = filenameTokens.union(courseCodeTokens)
            guard categoryTokens.isSubset(of: combined) else { continue }

            if let current = best {
                if trace.updatedAt > current.trace.updatedAt {
                    best = (trace, event)
                }
            } else {
                best = (trace, event)
            }
        }

        guard let winner = best else { return nil }

        let schemaJSON = (winner.event["schemaJSON"] as? String) ?? "{}"
        let sourceDocId = winner.trace.sourceDocId ?? ""
        let corrections = SchemaCorrectionsStore.read(
            extractorId: SyllabusPDFExtractor.extractorId,
            sourceDocId: sourceDocId
        )

        return SchemaPayload(
            traceId: winner.trace.id,
            extractorId: SyllabusPDFExtractor.extractorId,
            sourceDocId: sourceDocId,
            sourceTitle: winner.trace.sourceTitle ?? "",
            schemaJSON: schemaJSON,
            corrections: corrections,
            updatedAt: winner.trace.updatedAt
        )
    }

    /// Resolve by trace id (primary path for the native bridge —
    /// `loom://native/schema/<traceId>.json`). Returns `nil` when the
    /// trace does not exist or is not an ingestion trace.
    static func resolveByTraceId(_ traceId: String) -> SchemaPayload? {
        let traces: [LoomTrace]
        do {
            traces = try LoomTraceWriter.allTraces()
        } catch {
            NSLog("[Loom] SchemaResolver.resolveByTraceId: allTraces failed: \(error)")
            return nil
        }
        guard let trace = traces.first(where: { $0.id == traceId }) else { return nil }
        guard trace.kind.hasPrefix("ingestion-") else { return nil }
        guard let event = firstSchemaEvent(in: trace) else { return nil }

        let extractorId = (event["extractorId"] as? String) ?? String(trace.kind.dropFirst("ingestion-".count))
        let schemaJSON = (event["schemaJSON"] as? String) ?? "{}"
        let sourceDocId = trace.sourceDocId ?? ""
        let corrections = SchemaCorrectionsStore.read(
            extractorId: extractorId,
            sourceDocId: sourceDocId
        )

        return SchemaPayload(
            traceId: trace.id,
            extractorId: extractorId,
            sourceDocId: sourceDocId,
            sourceTitle: trace.sourceTitle ?? "",
            schemaJSON: schemaJSON,
            corrections: corrections,
            updatedAt: trace.updatedAt
        )
    }

    // MARK: - Token normalisation

    /// Pull matching tokens out of either a category slug
    /// (`unsw-fins-3640`) or a raw filename (`Course Overview_FINS3640.pdf`).
    /// Tokens are `[A-Z]+` runs (length ≥ 2) and `[0-9]+` runs — the
    /// shape that reliably identifies a university course code across
    /// both sources. Lower-case words are ignored to avoid noise from
    /// course names ("overview", "course", "investments").
    static func tokens(from value: String) -> Set<String> {
        let upper = value.uppercased()
        var result = Set<String>()
        var current = ""
        var currentKind: Character.Kind = .other
        func flush() {
            if currentKind == .letter && current.count >= 2 {
                result.insert(current)
            } else if currentKind == .digit && current.count >= 2 {
                result.insert(current)
            }
            current = ""
        }
        for ch in upper {
            let kind = ch.classify()
            if kind == currentKind && kind != .other {
                current.append(ch)
            } else {
                flush()
                currentKind = kind
                if kind != .other {
                    current.append(ch)
                }
            }
        }
        flush()
        return result
    }

    /// Same as `tokens(from:)` but tolerant of the slug-shape
    /// (`unsw-fins-3640`) — internally upper-cases then routes
    /// through the generic tokenizer. Institution prefixes are removed
    /// because extracted filenames / courseCode fields usually carry
    /// the course code (`FINS3640`) but not the source library prefix
    /// (`UNSW`). Pulled out so the caller's intent is clear at the
    /// call site.
    static func tokens(fromSlug slug: String) -> Set<String> {
        var result = tokens(from: slug)
        result.subtract(["UNSW"])
        return result
    }

    /// Pull the `courseCode` value out of a serialized `SyllabusSchema`
    /// JSON string, if present. The field is `FieldResult<String>`,
    /// which round-trips as either:
    ///   - `{"courseCode": {"status": "found", "value": "FINS3640", ...}}`
    ///   - `{"courseCode": {"status": "not_found", "tried": [...]}}`
    /// We only care about the `found` case; not-found returns empty.
    static func tokens(fromCourseCodeField schemaJSON: String?) -> Set<String> {
        guard let schemaJSON,
              let data = schemaJSON.data(using: .utf8),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let field = root["courseCode"] as? [String: Any],
              (field["status"] as? String) == "found",
              let value = field["value"] as? String else {
            return []
        }
        return tokens(from: value)
    }

    // MARK: - Helpers

    /// Extract the category slug from a reading docId. Matches the
    /// two shapes documented in `lib/doc-context.ts:24-44`:
    ///   - `know/<cat>__<file>`
    ///   - `wiki/<slug>` (returns nil — wiki has no course scope)
    static func categorySlug(fromReadingDocId docId: String) -> String? {
        if docId.hasPrefix("know/") {
            let rest = String(docId.dropFirst("know/".count))
            if let separator = rest.range(of: "__") {
                return String(rest[..<separator.lowerBound])
            }
            return rest
        }
        return nil
    }

    /// Pull the first `thought-anchor` event with a non-empty
    /// `schemaJSON` string from a trace. IngestionView persists
    /// exactly one such event per trace (`IngestionView.swift:763-784`)
    /// but we tolerate extras gracefully.
    private static func firstSchemaEvent(in trace: LoomTrace) -> [String: Any]? {
        guard let data = trace.eventsJSON.data(using: .utf8),
              let events = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return nil
        }
        return events.first { event in
            guard (event["kind"] as? String) == "thought-anchor" else { return false }
            guard let schemaJSON = event["schemaJSON"] as? String else { return false }
            return !schemaJSON.isEmpty && schemaJSON != "{}"
        }
    }
}

// MARK: - SchemaPayload

/// The serialised response for `loom://native/schema/<traceId>.json`
/// and the internal resolver output. Kept as plain values so the
/// bridge handler can JSON-serialise in one step without reaching
/// back into the schema Codable stack.
struct SchemaPayload {
    let traceId: String
    let extractorId: String
    let sourceDocId: String
    let sourceTitle: String
    /// Serialised schema (the original string pulled from the
    /// trace's `eventsJSON.schemaJSON` field — NOT re-encoded). The
    /// web side re-parses it and applies corrections at render time.
    let schemaJSON: String
    /// Corrections layered over the schema at read time. Oldest-first
    /// — later corrections win per field path.
    let corrections: [SchemaCorrectionsStore.Correction]
    let updatedAt: Double

    func jsonDictionary() -> [String: Any] {
        // Schema JSON is re-parsed into a dictionary so the web side
        // can consume `response.schema` directly without a second
        // JSON.parse. Falling back to null if the stored JSON is
        // malformed — the consumer renders nothing rather than
        // crashing.
        let schemaObject: Any
        if let data = schemaJSON.data(using: .utf8),
           let parsed = try? JSONSerialization.jsonObject(with: data) {
            schemaObject = parsed
        } else {
            schemaObject = NSNull()
        }
        return [
            "traceId": traceId,
            "extractorId": extractorId,
            "sourceDocId": sourceDocId,
            "sourceTitle": sourceTitle,
            "schema": schemaObject,
            "corrections": corrections.map { c in
                [
                    "fieldPath": c.fieldPath,
                    "original": c.original,
                    "corrected": c.corrected,
                    "at": c.at,
                ] as [String: Any]
            },
            "updatedAt": updatedAt,
        ]
    }
}

// MARK: - Character.Kind

private extension Character {
    enum Kind {
        case letter
        case digit
        case other
    }

    func classify() -> Kind {
        if isLetter { return .letter }
        if isNumber { return .digit }
        return .other
    }
}
