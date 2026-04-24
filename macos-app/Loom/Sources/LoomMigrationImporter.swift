import Foundation
import SwiftData

/// Imports an IDB export blob (produced by `lib/migration-export.ts`) into
/// the SwiftData store. Phase 2 of architecture inversion.
///
/// Contract:
///   - Empty traces/panels/weaves arrays are a no-op.
///   - Rows keyed by `id` are upserted: existing rows with the same id are
///     updated, new ids are inserted. Callers can replay the import safely.
///   - Unknown fields in the payload are ignored, so schema drift on the
///     web side doesn't block migration.
///   - If the schema version is higher than `MIGRATION_EXPORT_VERSION`,
///     the whole import is refused so Swift doesn't silently downgrade
///     richer data.
enum LoomMigrationImporter {
    static let supportedVersion: Int = 1

    enum Failure: Error, Equatable {
        case unsupportedVersion(Int)
        case invalidPayload(String)
    }

    struct Stats: Equatable {
        var traces: Int
        var panels: Int
        var weaves: Int
    }

    @MainActor
    @discardableResult
    static func importInto(
        _ store: LoomDataStore,
        payload: [String: Any]
    ) throws -> Stats {
        let version = (payload["version"] as? Int) ?? (payload["version"] as? NSNumber)?.intValue ?? 0
        if version > supportedVersion {
            throw Failure.unsupportedVersion(version)
        }

        let tracesArray = (payload["traces"] as? [[String: Any]]) ?? []
        let panelsArray = (payload["panels"] as? [[String: Any]]) ?? []
        let weavesArray = (payload["weaves"] as? [[String: Any]]) ?? []

        let context = store.mainContext

        let existingTraces: [String: LoomTrace] = try Dictionary(
            uniqueKeysWithValues: context.fetch(FetchDescriptor<LoomTrace>()).map { ($0.id, $0) }
        )
        let existingPanels: [String: LoomPanel] = try Dictionary(
            uniqueKeysWithValues: context.fetch(FetchDescriptor<LoomPanel>()).map { ($0.id, $0) }
        )
        let existingWeaves: [String: LoomWeave] = try Dictionary(
            uniqueKeysWithValues: context.fetch(FetchDescriptor<LoomWeave>()).map { ($0.id, $0) }
        )

        var traces = 0
        for row in tracesArray {
            guard let id = row["id"] as? String, !id.isEmpty else { continue }
            let kind = (row["kind"] as? String) ?? "reading"
            let parentId = row["parentId"] as? String
            let sourceDict = row["source"] as? [String: Any]
            let sourceDocId = sourceDict?["docId"] as? String
            let sourceTitle = sourceDict?["sourceTitle"] as? String
            let sourceHref = sourceDict?["href"] as? String
            let createdAt = doubleValue(row["createdAt"]) ?? 0
            let updatedAt = doubleValue(row["updatedAt"]) ?? createdAt
            let eventsJSON = eventsToJSON(row["events"])

            if let existing = existingTraces[id] {
                existing.kind = kind
                existing.parentId = parentId
                existing.sourceDocId = sourceDocId
                existing.sourceTitle = sourceTitle
                existing.sourceHref = sourceHref
                existing.updatedAt = max(existing.updatedAt, updatedAt)
                existing.eventsJSON = eventsJSON
            } else {
                context.insert(LoomTrace(
                    id: id,
                    kind: kind,
                    parentId: parentId,
                    sourceDocId: sourceDocId,
                    sourceTitle: sourceTitle,
                    sourceHref: sourceHref,
                    createdAt: createdAt,
                    updatedAt: updatedAt,
                    eventsJSON: eventsJSON
                ))
            }
            traces += 1
        }

        var panels = 0
        for row in panelsArray {
            guard let id = row["id"] as? String, !id.isEmpty else { continue }
            let docId = row["docId"] as? String
            let status = (row["status"] as? String) ?? "draft"
            let title = (row["title"] as? String) ?? ""
            let bodyJSON = jsonString(from: row["body"]) ?? "{}"
            let createdAt = doubleValue(row["createdAt"]) ?? 0
            let updatedAt = doubleValue(row["updatedAt"]) ?? createdAt

            if let existing = existingPanels[id] {
                existing.docId = docId
                existing.status = status
                existing.title = title
                existing.bodyJSON = bodyJSON
                existing.updatedAt = max(existing.updatedAt, updatedAt)
            } else {
                context.insert(LoomPanel(
                    id: id,
                    docId: docId,
                    status: status,
                    title: title,
                    bodyJSON: bodyJSON,
                    createdAt: createdAt,
                    updatedAt: updatedAt
                ))
            }
            panels += 1
        }

        var weaves = 0
        for row in weavesArray {
            guard let id = row["id"] as? String, !id.isEmpty,
                  let fromPanelId = row["fromPanelId"] as? String, !fromPanelId.isEmpty,
                  let toPanelId = row["toPanelId"] as? String, !toPanelId.isEmpty else { continue }
            let kind = (row["kind"] as? String) ?? "relates"
            let rationale = (row["rationale"] as? String) ?? ""
            let createdAt = doubleValue(row["createdAt"]) ?? 0
            let updatedAt = doubleValue(row["updatedAt"]) ?? createdAt

            if let existing = existingWeaves[id] {
                existing.fromPanelId = fromPanelId
                existing.toPanelId = toPanelId
                existing.kind = kind
                existing.rationale = rationale
                existing.updatedAt = max(existing.updatedAt, updatedAt)
            } else {
                context.insert(LoomWeave(
                    id: id,
                    fromPanelId: fromPanelId,
                    toPanelId: toPanelId,
                    kind: kind,
                    rationale: rationale,
                    createdAt: createdAt,
                    updatedAt: updatedAt
                ))
            }
            weaves += 1
        }

        try context.save()
        return Stats(traces: traces, panels: panels, weaves: weaves)
    }

    // MARK: helpers

    private static func doubleValue(_ raw: Any?) -> Double? {
        if let d = raw as? Double { return d }
        if let n = raw as? NSNumber { return n.doubleValue }
        if let i = raw as? Int { return Double(i) }
        if let s = raw as? String, let d = Double(s) { return d }
        return nil
    }

    private static func eventsToJSON(_ raw: Any?) -> String {
        guard let events = raw else { return "[]" }
        if let str = events as? String, !str.isEmpty { return str }
        return jsonString(from: events) ?? "[]"
    }

    private static func jsonString(from value: Any?) -> String? {
        guard let value, JSONSerialization.isValidJSONObject(value) else { return nil }
        guard let data = try? JSONSerialization.data(withJSONObject: value) else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
