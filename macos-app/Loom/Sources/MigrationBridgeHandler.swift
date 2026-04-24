import Foundation
import WebKit

/// Receives the IDB-export blob from the webview (produced by
/// `lib/migration-export.ts`) and pipes it into the SwiftData store via
/// `LoomMigrationImporter`. Phase 2 of architecture inversion.
///
/// Flow:
///   1. Swift persists `loom.migration.v1.status` = "pending" on first
///      launch of the inverted build.
///   2. After webview finishes loading, Swift evaluates
///      `window.__loomMigration.request()`.
///   3. The webview reads IDB and posts the JSON blob back here.
///   4. This handler imports into SwiftData, then persists the status =
///      "done" so it doesn't repeat.
///
/// No web-side writes are made. IDB stays the source of truth on the web
/// side during the transition window; SwiftData becomes authoritative once
/// Phase 4 replaces the chrome.
@MainActor
final class MigrationBridgeHandler: NSObject, WKScriptMessageHandler {
    static let name = "loomMigrationExport"
    static let statusDefaultsKey = "loom.migration.v1.status"

    enum Status: String {
        case pending
        case done
        case failed
    }

    private let store: LoomDataStore
    private let defaults: UserDefaults

    init(store: LoomDataStore = .shared, defaults: UserDefaults = .standard) {
        self.store = store
        self.defaults = defaults
        super.init()
    }

    var currentStatus: Status {
        get {
            Status(rawValue: defaults.string(forKey: Self.statusDefaultsKey) ?? "pending") ?? .pending
        }
        set {
            defaults.set(newValue.rawValue, forKey: Self.statusDefaultsKey)
        }
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let payload = message.body as? [String: Any] else {
            currentStatus = .failed
            return
        }

        if payload["empty"] as? Bool == true {
            // Nothing in IDB to import — no-op but mark done so we don't
            // spin up the migration prompt every launch.
            currentStatus = .done
            return
        }

        do {
            _ = try LoomMigrationImporter.importInto(store, payload: payload)
            currentStatus = .done
        } catch {
            currentStatus = .failed
            NSLog("[MigrationBridgeHandler] import failed: \(error)")
        }
    }
}
