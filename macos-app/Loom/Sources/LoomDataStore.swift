import Foundation
import SwiftData

/// Thin wrapper around `ModelContainer` that owns the app-wide Loom data
/// store. Call `LoomDataStore.shared` anywhere you need to read or write
/// — it lazily creates the container at first use.
///
/// Phase 2 of architecture inversion — this replaces IndexedDB as the
/// source of truth for traces, panels, weaves. Until migration is complete
/// the web layer still reads IndexedDB; Swift and web sync via
/// message handlers added in Phase 3.
final class LoomDataStore {
    static let shared = LoomDataStore()

    let container: ModelContainer

    /// Designated initializer for tests and explicit factories. Pass an
    /// in-memory configuration to avoid writing to the default store URL.
    init(configurations: ModelConfiguration...) {
        do {
            if configurations.isEmpty {
                let defaultConfig = ModelConfiguration(
                    "LoomDefaultStore",
                    schema: Schema(LoomDataSchema.models),
                    isStoredInMemoryOnly: false
                )
                self.container = try ModelContainer(
                    for: Schema(LoomDataSchema.models),
                    configurations: defaultConfig
                )
            } else {
                self.container = try ModelContainer(
                    for: Schema(LoomDataSchema.models),
                    configurations: configurations
                )
            }
        } catch {
            fatalError("LoomDataStore: failed to open ModelContainer: \(error)")
        }
    }

    /// Main-actor context for UI reads.
    @MainActor
    var mainContext: ModelContext {
        container.mainContext
    }

    /// Convenience for constructing a fresh in-memory store in tests. Each
    /// call returns an independent store.
    static func inMemory() -> LoomDataStore {
        let config = ModelConfiguration(
            "LoomInMemoryStore-\(UUID().uuidString)",
            schema: Schema(LoomDataSchema.models),
            isStoredInMemoryOnly: true
        )
        return LoomDataStore(configurations: config)
    }
}
