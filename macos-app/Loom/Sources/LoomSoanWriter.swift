import Foundation
import SwiftData

/// Swift-side writer for `LoomSoanCard` + `LoomSoanEdge`. Mirrors the
/// `LoomPursuitWriter` pattern exactly — static methods on an enum under
/// `@MainActor`, every mutation saves the shared `LoomDataStore` context
/// and posts `.loomSoanChanged` so the ContentView mirror coordinator
/// (and any in-process SwiftUI view) can react without polling.
///
/// Cards are the Sōan "thinking-draft" pieces — thesis, counter, etc. —
/// placed in pixel-space on a canvas. Edges connect them (`support` /
/// `echo`). Both surfaces (native + web) read the same native projection;
/// `ContentView.mirrorSoanToWebview` now only broadcasts invalidation.
///
/// The `store` parameter default is a `LoomDataStore` (not a raw
/// `ModelContext`) because `mainContext` is `@MainActor`-isolated and a
/// default-parameter expression is evaluated at the call site, which
/// isn't always MainActor-isolated. Passing the store and dereferencing
/// `.mainContext` inside the body keeps the isolation promise clean.
@MainActor
enum LoomSoanWriter {
    // MARK: - Cards

    /// Create a new Sōan card at the given canvas position. `width` /
    /// `height` fall back to the model defaults (260×120) — the sheet
    /// UI doesn't let users pick dimensions yet, and the web layout
    /// looks intentional with a uniform grid at small counts.
    @discardableResult
    static func createCard(
        kind: String,
        body: String,
        x: Double,
        y: Double,
        source: String = "",
        title: String = "",
        store: LoomDataStore = .shared
    ) throws -> LoomSoanCard {
        let ctx = store.mainContext
        let now = Date().timeIntervalSince1970 * 1000
        let card = LoomSoanCard(
            id: UUID().uuidString,
            kind: kind,
            title: title,
            body: body,
            source: source,
            x: x,
            y: y,
            createdAt: now,
            updatedAt: now
        )
        ctx.insert(card)
        do {
            try ctx.save()
        } catch {
            NSLog("[Loom] LoomSoanWriter.createCard save failed: \(error)")
            throw error
        }
        postChangeNotification(id: card.id, op: "createCard")
        return card
    }

    /// Fetch every card, most-recently-updated first. Volumes are small
    /// enough that clients can filter in-memory; no predicate variants.
    static func allCards(store: LoomDataStore = .shared) throws -> [LoomSoanCard] {
        var descriptor = FetchDescriptor<LoomSoanCard>()
        descriptor.sortBy = [SortDescriptor(\.updatedAt, order: .reverse)]
        return try store.mainContext.fetch(descriptor)
    }

    /// Look up a single card by id.
    static func findCard(
        id: String,
        store: LoomDataStore = .shared
    ) throws -> LoomSoanCard? {
        let descriptor = FetchDescriptor<LoomSoanCard>(
            predicate: #Predicate { $0.id == id }
        )
        return try store.mainContext.fetch(descriptor).first
    }

    /// Move a card. Called from drag-to-reposition interactions; the web
    /// side can write this with a throttled bridge later. For now the
    /// macOS dialog doesn't reposition after creation — this API is
    /// here so the storage shape is complete.
    static func updateCardPosition(
        id: String,
        x: Double,
        y: Double,
        store: LoomDataStore = .shared
    ) throws {
        guard let card = try findCard(id: id, store: store) else { return }
        card.x = x
        card.y = y
        card.updatedAt = Date().timeIntervalSince1970 * 1000
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomSoanWriter.updateCardPosition save failed: \(error)") }
        postChangeNotification(id: id, op: "updatePosition")
    }

    /// Replace the card's body. Title / source stay as-is; callers that
    /// need to swap those should add parallel helpers.
    static func updateCardBody(
        id: String,
        body: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let card = try findCard(id: id, store: store) else { return }
        card.body = body
        card.updatedAt = Date().timeIntervalSince1970 * 1000
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomSoanWriter.updateCardBody save failed: \(error)") }
        postChangeNotification(id: id, op: "updateBody")
    }

    /// Remove a card. Associated edges are NOT auto-deleted — the web
    /// mirror filters out edges whose endpoints no longer resolve, and
    /// SwiftData doesn't enforce referential integrity across these two
    /// models (they're intentionally loose so cards can be temporarily
    /// retired / reinstated without losing relation context). Call
    /// `deleteEdge` explicitly when the relation should also go.
    static func deleteCard(
        id: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let card = try findCard(id: id, store: store) else { return }
        store.mainContext.delete(card)
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomSoanWriter.deleteCard save failed: \(error)") }
        postChangeNotification(id: id, op: "deleteCard")
    }

    // MARK: - Edges

    /// Fetch every edge, most-recently-created first.
    static func allEdges(store: LoomDataStore = .shared) throws -> [LoomSoanEdge] {
        var descriptor = FetchDescriptor<LoomSoanEdge>()
        descriptor.sortBy = [SortDescriptor(\.createdAt, order: .reverse)]
        return try store.mainContext.fetch(descriptor)
    }

    /// Look up a single edge by id.
    static func findEdge(
        id: String,
        store: LoomDataStore = .shared
    ) throws -> LoomSoanEdge? {
        let descriptor = FetchDescriptor<LoomSoanEdge>(
            predicate: #Predicate { $0.id == id }
        )
        return try store.mainContext.fetch(descriptor).first
    }

    /// Create a support / echo relation between two cards. No validation
    /// that the endpoint cards exist — the web mirror prunes dangling
    /// edges at projection time, and the current UI only calls this
    /// with ids it just read from the store.
    @discardableResult
    static func createEdge(
        fromCardId: String,
        toCardId: String,
        kind: String,
        store: LoomDataStore = .shared
    ) throws -> LoomSoanEdge {
        let ctx = store.mainContext
        let now = Date().timeIntervalSince1970 * 1000
        let edge = LoomSoanEdge(
            id: UUID().uuidString,
            fromCardId: fromCardId,
            toCardId: toCardId,
            kind: kind,
            createdAt: now
        )
        ctx.insert(edge)
        do {
            try ctx.save()
        } catch {
            NSLog("[Loom] LoomSoanWriter.createEdge save failed: \(error)")
            throw error
        }
        postChangeNotification(id: edge.id, op: "createEdge")
        return edge
    }

    /// Remove a relation. No notion of "undo" — callers just re-create.
    static func deleteEdge(
        id: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let edge = try findEdge(id: id, store: store) else { return }
        store.mainContext.delete(edge)
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomSoanWriter.deleteEdge save failed: \(error)") }
        postChangeNotification(id: id, op: "deleteEdge")
    }

    // MARK: - Change notification

    private static func postChangeNotification(id: String, op: String) {
        // Already @MainActor — post synchronously. Mirrors
        // LoomPursuitWriter.postChangeNotification.
        NotificationCenter.default.post(
            name: .loomSoanChanged,
            object: nil,
            userInfo: ["id": id, "op": op]
        )
    }
}

extension Notification.Name {
    /// Broadcast after every successful Sōan mutation (card or edge).
    /// ContentView subscribes via `addObserver` and dispatches the
    /// web-side `loom-soan-updated` DOM event; SwiftUI views can
    /// subscribe via `.onReceive` and refetch.
    static let loomSoanChanged = Notification.Name("loomSoanChanged")
}
