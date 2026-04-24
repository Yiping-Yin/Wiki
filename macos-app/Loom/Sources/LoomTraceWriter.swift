import Foundation
import SwiftData

/// Phase 4 enabler — unblocks the 4 overlay ports (Rehearsal, Examiner,
/// Ingestion, Recursing) by giving Swift a native trace CREATE / APPEND
/// path. Until this landed, SwiftData was import-only (migrated from IDB)
/// and new traces could only be minted by the web side.
///
/// Reads + writes go through the same `LoomDataStore.shared.mainContext`.
/// Change notifications are broadcast via NotificationCenter so SwiftUI
/// views can `.onReceive` them; this mirrors the web's
/// `window.dispatchEvent(new Event('loom:trace:changed'))` convention.
///
/// `appendEvent` rewrites the serialized `eventsJSON` payload in-place
/// rather than normalizing events into their own rows. Intentional: keeps
/// the storage shape stable while the web-side event schema is still the
/// source of truth, and avoids a large migration when / if we ever
/// promote events to first-class rows.
@MainActor
enum LoomTraceWriter {
    /// Create a new root trace. Returns the persisted `LoomTrace` on
    /// success. Throws on SwiftData save errors so callers can surface a
    /// user-visible error.
    @discardableResult
    static func createTrace(
        kind: String,
        parentId: String? = nil,
        sourceDocId: String? = nil,
        sourceTitle: String? = nil,
        sourceHref: String? = nil,
        initialEvents: [[String: Any]] = [],
        store: LoomDataStore = .shared
    ) throws -> LoomTrace {
        let now = Date().timeIntervalSince1970 * 1000
        let trace = LoomTrace(
            id: UUID().uuidString,
            kind: kind,
            parentId: parentId,
            sourceDocId: sourceDocId,
            sourceTitle: sourceTitle,
            sourceHref: sourceHref,
            createdAt: now,
            updatedAt: now,
            eventsJSON: serialize(events: initialEvents) ?? "[]",
            currentSummary: ""
        )
        store.mainContext.insert(trace)
        try store.mainContext.save()
        postChangeNotification(traceId: trace.id, kind: "create")
        return trace
    }

    /// Append one event dictionary to an existing trace's `eventsJSON`.
    /// Refreshes `updatedAt`. Returns the updated trace.
    @discardableResult
    static func appendEvent(
        traceId: String,
        event: [String: Any],
        store: LoomDataStore = .shared
    ) throws -> LoomTrace? {
        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.id == traceId }
        )
        guard let trace = try store.mainContext.fetch(descriptor).first else {
            return nil
        }
        var events = deserialize(eventsJSON: trace.eventsJSON)
        events.append(event)
        trace.eventsJSON = serialize(events: events) ?? trace.eventsJSON
        trace.updatedAt = Date().timeIntervalSince1970 * 1000
        try store.mainContext.save()
        postChangeNotification(traceId: traceId, kind: "append")
        return trace
    }

    /// Record a revision of a thought. Appends a `revision` event to the
    /// trace's eventsJSON, preserving the PRIOR text so Palimpsest can show
    /// historical layers — each `priorText` is a draft beneath the current
    /// `currentSummary`, with a walkable timeline of when the thought
    /// actually changed (not when distinct thoughts were first captured).
    ///
    /// The caller is trusted to pass the correct `priorText`; use
    /// `reviseSummary` below for the common case where prior == the trace's
    /// current summary.
    @discardableResult
    static func appendRevision(
        traceId: String,
        priorText: String,
        newText: String,
        at: Double = Date().timeIntervalSince1970 * 1000,
        store: LoomDataStore = .shared
    ) throws -> LoomTrace {
        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.id == traceId }
        )
        guard let trace = try store.mainContext.fetch(descriptor).first else {
            throw NSError(
                domain: "LoomTraceWriter",
                code: 404,
                userInfo: [NSLocalizedDescriptionKey: "trace not found: \(traceId)"]
            )
        }
        var events = deserialize(eventsJSON: trace.eventsJSON)
        events.append([
            "kind": "revision",
            "priorText": priorText,
            "newText": newText,
            "at": at,
        ])
        trace.eventsJSON = serialize(events: events) ?? trace.eventsJSON
        trace.currentSummary = newText
        trace.updatedAt = at
        try store.mainContext.save()
        postChangeNotification(traceId: traceId, kind: "revision")
        return trace
    }

    /// Convenience: revise a trace's summary while preserving history. Reads
    /// the existing `currentSummary` as `priorText` and delegates to
    /// `appendRevision`. The dominant Palimpsest write path.
    @discardableResult
    static func reviseSummary(
        traceId: String,
        newText: String,
        store: LoomDataStore = .shared
    ) throws -> LoomTrace {
        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.id == traceId }
        )
        guard let trace = try store.mainContext.fetch(descriptor).first else {
            throw NSError(
                domain: "LoomTraceWriter",
                code: 404,
                userInfo: [NSLocalizedDescriptionKey: "trace not found: \(traceId)"]
            )
        }
        let priorText = trace.currentSummary
        return try appendRevision(
            traceId: traceId,
            priorText: priorText,
            newText: newText,
            store: store
        )
    }

    /// Update a trace's summary (materialised from folding the event log).
    /// Callers typically compute this immediately after `appendEvent`.
    @discardableResult
    static func updateSummary(
        traceId: String,
        summary: String,
        store: LoomDataStore = .shared
    ) throws -> LoomTrace? {
        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.id == traceId }
        )
        guard let trace = try store.mainContext.fetch(descriptor).first else {
            return nil
        }
        trace.currentSummary = summary
        trace.updatedAt = Date().timeIntervalSince1970 * 1000
        try store.mainContext.save()
        postChangeNotification(traceId: traceId, kind: "summary")
        return trace
    }

    /// Fetch every trace, most-recently-updated first. Callers that want
    /// filtered subsets (by kind / doc / anchor) should narrow in-memory
    /// from the result — the current volume is small enough that a single
    /// read is cheaper than a predicate fetch.
    static func allTraces(store: LoomDataStore = .shared) throws -> [LoomTrace] {
        var descriptor = FetchDescriptor<LoomTrace>()
        descriptor.sortBy = [SortDescriptor(\.updatedAt, order: .reverse)]
        return try store.mainContext.fetch(descriptor)
    }

    /// Traces of a specific kind ("reading", "concept", …). Thin wrapper
    /// over `allTraces` so views can subscribe without writing predicates.
    static func traces(ofKind kind: String, store: LoomDataStore = .shared) throws -> [LoomTrace] {
        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.kind == kind },
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        return try store.mainContext.fetch(descriptor)
    }

    /// Traces anchored to a particular doc (by `sourceDocId`). Main caller
    /// is Examiner — it walks traces-for-doc, extracts notes, builds its
    /// question set.
    static func traces(forDocId docId: String, store: LoomDataStore = .shared) throws -> [LoomTrace] {
        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.sourceDocId == docId },
            sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
        )
        return try store.mainContext.fetch(descriptor)
    }

    /// Remove a trace entirely. Primary caller is the Settings > Data
    /// "Your Loom" management pane, where the user can prune individual
    /// reading panels. Event payloads go with the row — no cascade since
    /// events live inline in `eventsJSON`.
    static func delete(
        id: String,
        store: LoomDataStore = .shared
    ) throws {
        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.id == id }
        )
        guard let trace = try store.mainContext.fetch(descriptor).first else { return }
        store.mainContext.delete(trace)
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomTraceWriter.delete save failed: \(error)") }
        postChangeNotification(traceId: id, kind: "delete")
    }

    // MARK: - JSON helpers

    private static func serialize(events: [[String: Any]]) -> String? {
        guard let data = try? JSONSerialization.data(withJSONObject: events, options: []),
              let text = String(data: data, encoding: .utf8) else { return nil }
        return text
    }

    private static func deserialize(eventsJSON: String) -> [[String: Any]] {
        guard let data = eventsJSON.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        return arr
    }

    // MARK: - Change notification

    private static func postChangeNotification(traceId: String, kind: String) {
        NotificationCenter.default.post(
            name: .loomTraceChanged,
            object: nil,
            userInfo: ["traceId": traceId, "op": kind]
        )
    }
}

extension Notification.Name {
    /// Broadcast after every successful trace mutation. SwiftUI views
    /// that render trace-derived state subscribe via `.onReceive` and
    /// refetch. Mirrors the web-side `loom:trace:changed` event.
    static let loomTraceChanged = Notification.Name("loomTraceChanged")
}
