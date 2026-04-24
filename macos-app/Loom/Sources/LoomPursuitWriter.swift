import Foundation
import SwiftData

/// Swift-side writer for `LoomPursuit`. Pattern mirrors `LoomTraceWriter`
/// exactly — static methods on an enum under `@MainActor`, all mutations
/// post `.loomPursuitChanged` so SwiftUI views and the webview can react
/// without polling.
///
/// Pursuits are top-level "questions the mind is holding"; they're minted
/// via the Edit-menu "Hold a Question…" item (⌘⇧P) or the Shuttle palette.
/// The web surfaces (`PursuitsClient`, `PursuitDetailClient`) read native
/// projections; `ContentView.mirrorPursuitsToWebview` only broadcasts
/// invalidation.
///
/// API matches the task spec: store parameter is a `LoomDataStore` (not a
/// raw `ModelContext`) because `mainContext` is `@MainActor`-isolated and
/// a default-parameter expression is evaluated at the call site, which
/// isn't always MainActor-isolated. Passing the store and dereferencing
/// `.mainContext` inside the body keeps the isolation promise clean.
@MainActor
enum LoomPursuitWriter {
    /// Mint a new pursuit. `weight` defaults to "secondary" (middle
    /// distance) — the honest default when a question is first held but
    /// hasn't yet proven itself the primary concern.
    @discardableResult
    static func createPursuit(
        question: String,
        weight: String = "secondary",
        store: LoomDataStore = .shared
    ) throws -> LoomPursuit {
        let ctx = store.mainContext
        let now = Date().timeIntervalSince1970 * 1000
        let pursuit = LoomPursuit(
            id: UUID().uuidString,
            question: question,
            weight: weight,
            season: "active",
            sourceDocIdsJSON: "[]",
            panelIdsJSON: "[]",
            createdAt: now,
            updatedAt: now,
            settledAt: nil
        )
        ctx.insert(pursuit)
        do {
            try ctx.save()
        } catch {
            NSLog("[Loom] LoomPursuitWriter.createPursuit save failed: \(error)")
            throw error
        }
        postChangeNotification(pursuitId: pursuit.id, op: "create")
        return pursuit
    }

    /// Fetch every pursuit, most-recently-updated first. Small data
    /// volume, so callers that want filtered subsets (by weight / season)
    /// should narrow in-memory rather than writing predicates.
    static func allPursuits(store: LoomDataStore = .shared) throws -> [LoomPursuit] {
        var descriptor = FetchDescriptor<LoomPursuit>()
        descriptor.sortBy = [SortDescriptor(\.updatedAt, order: .reverse)]
        return try store.mainContext.fetch(descriptor)
    }

    /// Look up one pursuit by id. Returns nil when no match exists.
    static func find(
        id: String,
        store: LoomDataStore = .shared
    ) throws -> LoomPursuit? {
        let descriptor = FetchDescriptor<LoomPursuit>(
            predicate: #Predicate { $0.id == id }
        )
        return try store.mainContext.fetch(descriptor).first
    }

    /// Move the pursuit to a new season. Writes `settledAt` when the new
    /// season is "held" or "retired" so the UI can show how long it's
    /// been at rest; clears it otherwise.
    static func updateSeason(
        id: String,
        season: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let pursuit = try find(id: id, store: store) else { return }
        pursuit.season = season
        let now = Date().timeIntervalSince1970 * 1000
        pursuit.updatedAt = now
        if season == "held" || season == "retired" {
            if pursuit.settledAt == nil {
                pursuit.settledAt = now
            }
        } else {
            pursuit.settledAt = nil
        }
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomPursuitWriter.updateSeason save failed: \(error)") }
        postChangeNotification(pursuitId: id, op: "season")
    }

    /// Swap the pursuit's attentional weight. Does not touch season —
    /// a held question can still be primary while it's at rest.
    static func updateWeight(
        id: String,
        weight: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let pursuit = try find(id: id, store: store) else { return }
        pursuit.weight = weight
        pursuit.updatedAt = Date().timeIntervalSince1970 * 1000
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomPursuitWriter.updateWeight save failed: \(error)") }
        postChangeNotification(pursuitId: id, op: "weight")
    }

    /// Append a source doc id to the pursuit's attachment list. No-op
    /// when the id is already attached; keeps the JSON de-duplicated so
    /// the web-side "N sources" count never double-counts.
    static func attachSource(
        pursuitId: String,
        sourceDocId: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let pursuit = try find(id: pursuitId, store: store) else { return }
        var ids = pursuit.decodedSourceDocIds
        guard !ids.contains(sourceDocId) else { return }
        ids.append(sourceDocId)
        pursuit.sourceDocIdsJSON = LoomPursuit.encodeStringArray(ids)
        pursuit.updatedAt = Date().timeIntervalSince1970 * 1000
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomPursuitWriter.attachSource save failed: \(error)") }
        postChangeNotification(pursuitId: pursuitId, op: "attachSource")
    }

    /// Append a panel id to the pursuit's crystallized list. Same
    /// de-dup discipline as `attachSource`.
    static func attachPanel(
        pursuitId: String,
        panelId: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let pursuit = try find(id: pursuitId, store: store) else { return }
        var ids = pursuit.decodedPanelIds
        guard !ids.contains(panelId) else { return }
        ids.append(panelId)
        pursuit.panelIdsJSON = LoomPursuit.encodeStringArray(ids)
        pursuit.updatedAt = Date().timeIntervalSince1970 * 1000
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomPursuitWriter.attachPanel save failed: \(error)") }
        postChangeNotification(pursuitId: pursuitId, op: "attachPanel")
    }

    /// Remove a pursuit entirely. User-visible "delete" is rare —
    /// preferred path is moving to 'retired' — but having an explicit
    /// remove is useful for test harnesses and future UI (e.g. an
    /// accidental-mint undo).
    static func delete(
        id: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let pursuit = try find(id: id, store: store) else { return }
        store.mainContext.delete(pursuit)
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomPursuitWriter.delete save failed: \(error)") }
        postChangeNotification(pursuitId: id, op: "delete")
    }

    // MARK: - Change notification

    private static func postChangeNotification(pursuitId: String, op: String) {
        // We're already @MainActor — post synchronously. Mirrors
        // LoomTraceWriter.postChangeNotification which also posts from
        // its MainActor-isolated context.
        NotificationCenter.default.post(
            name: .loomPursuitChanged,
            object: nil,
            userInfo: ["pursuitId": pursuitId, "op": op]
        )
    }
}

extension Notification.Name {
    /// Broadcast after every successful pursuit mutation. SwiftUI views
    /// and the ContentView webview-mirror coordinator subscribe via
    /// `.onReceive` / `addObserver` and refetch. Mirrors the web-side
    /// `loom-pursuits-updated` DOM event the coordinator dispatches
    /// after the localStorage write.
    static let loomPursuitChanged = Notification.Name("loomPursuitChanged")
}
