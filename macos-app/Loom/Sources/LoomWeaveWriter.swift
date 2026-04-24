import Foundation
import SwiftData

/// Swift-side writer for `LoomWeave`. Pattern mirrors `LoomPursuitWriter`
/// / `LoomSoanWriter` exactly — static methods on an enum under
/// `@MainActor`, every mutation saves the shared `LoomDataStore` context
/// and posts `.loomWeaveChanged` so the ContentView mirror coordinator
/// (and any in-process SwiftUI view) can react without polling.
///
/// A weave is an explicit, directed relation between two panels — the
/// learner says "this panel supports that one," or "contradicts," or
/// "elaborates," or "echoes." It's minted via the Edit-menu "Weave Two
/// Panels…" item (⌘⇧W) or the Shuttle palette. The web surfaces
/// (`WeavesClient` today, future panel-detail views) read the native
/// projection; `ContentView.mirrorWeavesToWebview` only broadcasts
/// invalidation.
///
/// The `store` parameter default is a `LoomDataStore` (not a raw
/// `ModelContext`) because `mainContext` is `@MainActor`-isolated and a
/// default-parameter expression is evaluated at the call site, which
/// isn't always MainActor-isolated. Passing the store and dereferencing
/// `.mainContext` inside the body keeps the isolation promise clean.
@MainActor
enum LoomWeaveWriter {
    /// Mint a new weave between two panels. `rationale` is a short
    /// freeform justification the learner can leave empty if the
    /// relation speaks for itself. No validation that the endpoint
    /// panels exist — the web mirror filters dangling weaves at
    /// projection time, and the dialog only offers ids it just read
    /// from the trace store.
    @discardableResult
    static func createWeave(
        fromPanelId: String,
        toPanelId: String,
        kind: String,
        rationale: String = "",
        store: LoomDataStore = .shared
    ) throws -> LoomWeave {
        let ctx = store.mainContext
        let now = Date().timeIntervalSince1970 * 1000
        let weave = LoomWeave(
            id: UUID().uuidString,
            fromPanelId: fromPanelId,
            toPanelId: toPanelId,
            kind: kind,
            rationale: rationale,
            createdAt: now,
            updatedAt: now
        )
        ctx.insert(weave)
        do {
            try ctx.save()
        } catch {
            NSLog("[Loom] LoomWeaveWriter.createWeave save failed: \(error)")
            throw error
        }
        postChangeNotification(weaveId: weave.id, op: "create")
        return weave
    }

    /// Fetch every weave, most-recently-updated first. Small data
    /// volume, so callers filter in-memory rather than adding predicate
    /// variants.
    static func allWeaves(store: LoomDataStore = .shared) throws -> [LoomWeave] {
        var descriptor = FetchDescriptor<LoomWeave>()
        descriptor.sortBy = [SortDescriptor(\.updatedAt, order: .reverse)]
        return try store.mainContext.fetch(descriptor)
    }

    /// Look up one weave by id. Returns nil when no match exists.
    static func find(
        id: String,
        store: LoomDataStore = .shared
    ) throws -> LoomWeave? {
        let descriptor = FetchDescriptor<LoomWeave>(
            predicate: #Predicate { $0.id == id }
        )
        return try store.mainContext.fetch(descriptor).first
    }

    /// Replace the weave's rationale. `kind` and endpoints stay put —
    /// callers that need to retype a supports→contradicts flip should
    /// delete and re-create so the timestamp reflects the new stance.
    static func updateRationale(
        id: String,
        rationale: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let weave = try find(id: id, store: store) else { return }
        weave.rationale = rationale
        weave.updatedAt = Date().timeIntervalSince1970 * 1000
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomWeaveWriter.updateRationale save failed: \(error)") }
        postChangeNotification(weaveId: id, op: "updateRationale")
    }

    /// Remove a weave. No soft-delete — callers just re-create.
    static func delete(
        id: String,
        store: LoomDataStore = .shared
    ) throws {
        guard let weave = try find(id: id, store: store) else { return }
        store.mainContext.delete(weave)
        do { try store.mainContext.save() }
        catch { NSLog("[Loom] LoomWeaveWriter.delete save failed: \(error)") }
        postChangeNotification(weaveId: id, op: "delete")
    }

    // MARK: - Change notification

    private static func postChangeNotification(weaveId: String, op: String) {
        // Already @MainActor — post synchronously. Mirrors
        // LoomPursuitWriter / LoomSoanWriter.
        NotificationCenter.default.post(
            name: .loomWeaveChanged,
            object: nil,
            userInfo: ["weaveId": weaveId, "op": op]
        )
    }
}

extension Notification.Name {
    /// Broadcast after every successful weave mutation. ContentView
    /// subscribes via `addObserver` and dispatches the web-side
    /// `loom-weaves-updated` DOM event; SwiftUI views can subscribe via
    /// `.onReceive` and refetch.
    static let loomWeaveChanged = Notification.Name("loomWeaveChanged")
}
