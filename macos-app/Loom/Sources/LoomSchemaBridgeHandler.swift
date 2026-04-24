import Foundation
import WebKit

/// Phase 7.1 · Write bridge for schema corrections.
///
/// The shipped Loom app has no Next.js API server, so the sidecar
/// write path (`POST /api/schema-corrections`) has no listener in
/// native mode. This bridge accepts the same payload shape the web
/// API route accepts and writes it directly to disk via
/// `SchemaCorrectionsStore.append`. In dev / browser mode the web
/// API route is used directly and this bridge is never invoked
/// (`isNativeMode()` gates the client choice).
///
/// JS:
///   `window.webkit.messageHandlers.loomSchemaCorrections.postMessage({
///      action: "append",
///      extractorId: "syllabus-pdf",
///      sourceDocId: "ingested:Course Overview_FINS3640.pdf",
///      fieldPath: "courseCode",
///      original: "FINS3640",
///      corrected: "FINS 3640"
///    })`
///     -> `{ corrections: [{ fieldPath, original, corrected, at }, ...] }`
@MainActor
final class LoomSchemaCorrectionsBridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "loomSchemaCorrections"

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else {
            replyHandler(nil, "missing action")
            return
        }

        do {
            switch action {
            case "append":
                guard let extractorId = payload["extractorId"] as? String,
                      !extractorId.isEmpty else {
                    throw LoomSchemaBridge.invalid("extractorId required")
                }
                guard let sourceDocId = payload["sourceDocId"] as? String,
                      !sourceDocId.isEmpty else {
                    throw LoomSchemaBridge.invalid("sourceDocId required")
                }
                guard let fieldPath = payload["fieldPath"] as? String,
                      !fieldPath.isEmpty else {
                    throw LoomSchemaBridge.invalid("fieldPath required")
                }
                let corrected = payload["corrected"] as? String ?? payload["newValue"] as? String ?? ""
                let original = payload["original"] as? String
                    ?? payload["originalValue"] as? String
                    ?? ""
                if corrected == original {
                    throw LoomSchemaBridge.invalid("no change")
                }
                let next = try SchemaCorrectionsStore.append(
                    extractorId: extractorId,
                    sourceDocId: sourceDocId,
                    fieldPath: fieldPath,
                    original: original,
                    corrected: corrected
                )
                let rows: [[String: Any]] = next.map { c in
                    [
                        "fieldPath": c.fieldPath,
                        "original": c.original,
                        "corrected": c.corrected,
                        "at": c.at,
                    ] as [String: Any]
                }
                replyHandler(["corrections": rows], nil)

            case "read":
                guard let extractorId = payload["extractorId"] as? String,
                      !extractorId.isEmpty else {
                    throw LoomSchemaBridge.invalid("extractorId required")
                }
                guard let sourceDocId = payload["sourceDocId"] as? String,
                      !sourceDocId.isEmpty else {
                    throw LoomSchemaBridge.invalid("sourceDocId required")
                }
                let corrections = SchemaCorrectionsStore.read(
                    extractorId: extractorId,
                    sourceDocId: sourceDocId
                )
                let rows: [[String: Any]] = corrections.map { c in
                    [
                        "fieldPath": c.fieldPath,
                        "original": c.original,
                        "corrected": c.corrected,
                        "at": c.at,
                    ] as [String: Any]
                }
                replyHandler(["corrections": rows], nil)

            default:
                throw LoomSchemaBridge.invalid("unknown action: \(action)")
            }
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }
}

/// Phase 7.1 · Schema read bridge for reading pages.
///
/// Exposes two native-JSON endpoints:
///
///   GET  loom://native/schema/<traceId>.json
///        Direct lookup of an ingestion trace's schema + corrections.
///        Used rarely today; reserved for Phase 7.2 detail surfaces.
///
///   GET  loom://native/schema-for-doc/<readingDocId>.json
///        Resolver entry point used by `components/CourseContextStrip.tsx`
///        — given a `know/<cat>__<file>` docId, walks persisted
///        syllabus traces and returns the best-matching schema
///        payload. Returns 404 when no sibling syllabus exists so
///        the strip hides itself (plan §5.1).
///
/// The URL-scheme handler (`LoomURLSchemeHandler`) does the routing
/// and response shaping; this file defines the payload builders and
/// native-endpoint enum cases. Split from the scheme handler so the
/// resolver logic stays adjacent to the other Ingest bridge code
/// under `Sources/Ingest/Bridge/`.
///
/// Q1 of plan §8 is locked: the folder → doc resolver lives Swift-side.
/// See `SchemaResolver.swift` for the matching heuristic.
enum LoomSchemaBridge {

    /// Build the JSON payload for `loom://native/schema/<traceId>.json`.
    /// Matches the shape of `buildPanelPayload` / `buildPursuitPayload`
    /// so the scheme handler can treat schemas the same way as other
    /// native record types.
    @MainActor
    static func buildPayload(traceId: String) -> [String: Any]? {
        SchemaResolver.resolveByTraceId(traceId)?.jsonDictionary()
    }

    /// Build the payload for
    /// `loom://native/schema-for-doc/<readingDocId>.json`. This is the
    /// primary entry point for the reading-page strip. Returns `nil`
    /// when the reading page has no matching sibling syllabus; the
    /// URL scheme handler turns that into a 404 and the strip
    /// renders nothing.
    @MainActor
    static func buildPayload(forReadingDocId readingDocId: String) -> [String: Any]? {
        SchemaResolver.resolveSyllabus(forReadingDocId: readingDocId)?.jsonDictionary()
    }

    static func invalid(_ message: String) -> NSError {
        NSError(
            domain: "LoomSchemaCorrections",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}
