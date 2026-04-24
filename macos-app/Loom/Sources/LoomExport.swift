import Foundation
import AppKit
import SwiftData

/// JSON bundle export + import for the whole Loom store (pursuits,
/// traces/panels, Sōan cards + edges, weaves). Backup-and-transfer path —
/// the user can round-trip their Loom between installs or keep a flat-file
/// archive that survives SwiftData schema upgrades.
///
/// Shape lives in `ExportBundle` below; every mutable attribute on every
/// `@Model` class is round-tripped. Wire version lives in `meta.version`
/// — bump whenever a field is added so downstream importers can branch.
///
/// Import is upsert-by-id: existing rows with the same `id` are deleted
/// and rewritten so timestamps and relations stay coherent. We insert
/// directly into the SwiftData context (not via writer helpers) because
/// the helpers mint fresh UUIDs and lose the original id; preserving ids
/// is what makes the import truly restorative (weaves still point at the
/// right panels, Sōan edges still connect the right cards).
@MainActor
enum LoomExport {
    /// Stable on-disk shape. Version string lives in `meta`; bump alongside
    /// any field addition. Don't rename `ExportBundle` — Foundation already
    /// exports a `Bundle` class and the collision would be a footgun.
    struct ExportBundle: Codable {
        var meta: Meta
        var pursuits: [PursuitDTO]
        var traces: [TraceDTO]
        var soanCards: [SoanCardDTO]
        var soanEdges: [SoanEdgeDTO]
        var weaves: [WeaveDTO]
    }

    struct Meta: Codable {
        var version: String
        var exportedAt: Double
        var appVersion: String?

        init(version: String = "1", exportedAt: Double, appVersion: String?) {
            self.version = version
            self.exportedAt = exportedAt
            self.appVersion = appVersion
        }
    }

    struct PursuitDTO: Codable {
        let id: String
        let question: String
        let weight: String
        let season: String
        let sourceDocIdsJSON: String
        let panelIdsJSON: String
        let createdAt: Double
        let updatedAt: Double
        let settledAt: Double?
    }

    struct TraceDTO: Codable {
        let id: String
        let kind: String
        let parentId: String?
        let sourceDocId: String?
        let sourceTitle: String?
        let sourceHref: String?
        let createdAt: Double
        let updatedAt: Double
        let eventsJSON: String
        let currentSummary: String
    }

    struct SoanCardDTO: Codable {
        let id: String
        let kind: String
        let title: String
        let body: String
        let source: String
        let x: Double
        let y: Double
        let width: Double
        let height: Double
        let createdAt: Double
        let updatedAt: Double
    }

    struct SoanEdgeDTO: Codable {
        let id: String
        let fromCardId: String
        let toCardId: String
        let kind: String
        let createdAt: Double
    }

    struct WeaveDTO: Codable {
        let id: String
        let fromPanelId: String
        let toPanelId: String
        let kind: String
        let rationale: String
        let createdAt: Double
        let updatedAt: Double
    }

    // MARK: - Build

    /// Snapshot the current SwiftData store into an `ExportBundle`. Each
    /// writer's `allXxx()` is `try?`-guarded so a single failing fetch
    /// doesn't poison the whole export — the user still gets everything
    /// else, and the failure path prints a log.
    static func buildBundle() throws -> ExportBundle {
        let pursuits = (try? LoomPursuitWriter.allPursuits()) ?? []
        let traces = (try? LoomTraceWriter.allTraces()) ?? []
        let soanCards = (try? LoomSoanWriter.allCards()) ?? []
        let soanEdges = (try? LoomSoanWriter.allEdges()) ?? []
        let weaves = (try? LoomWeaveWriter.allWeaves()) ?? []

        // Fully-qualified so the nested `ExportBundle` type doesn't
        // shadow Foundation's `Bundle` at this call site.
        let appVersion = Foundation.Bundle.main
            .infoDictionary?["CFBundleShortVersionString"] as? String

        let meta = Meta(
            exportedAt: Date().timeIntervalSince1970 * 1000,
            appVersion: appVersion
        )

        return ExportBundle(
            meta: meta,
            pursuits: pursuits.map {
                PursuitDTO(
                    id: $0.id,
                    question: $0.question,
                    weight: $0.weight,
                    season: $0.season,
                    sourceDocIdsJSON: $0.sourceDocIdsJSON,
                    panelIdsJSON: $0.panelIdsJSON,
                    createdAt: $0.createdAt,
                    updatedAt: $0.updatedAt,
                    settledAt: $0.settledAt
                )
            },
            traces: traces.map {
                TraceDTO(
                    id: $0.id,
                    kind: $0.kind,
                    parentId: $0.parentId,
                    sourceDocId: $0.sourceDocId,
                    sourceTitle: $0.sourceTitle,
                    sourceHref: $0.sourceHref,
                    createdAt: $0.createdAt,
                    updatedAt: $0.updatedAt,
                    eventsJSON: $0.eventsJSON,
                    currentSummary: $0.currentSummary
                )
            },
            soanCards: soanCards.map {
                SoanCardDTO(
                    id: $0.id,
                    kind: $0.kind,
                    title: $0.title,
                    body: $0.body,
                    source: $0.source,
                    x: $0.x,
                    y: $0.y,
                    width: $0.width,
                    height: $0.height,
                    createdAt: $0.createdAt,
                    updatedAt: $0.updatedAt
                )
            },
            soanEdges: soanEdges.map {
                SoanEdgeDTO(
                    id: $0.id,
                    fromCardId: $0.fromCardId,
                    toCardId: $0.toCardId,
                    kind: $0.kind,
                    createdAt: $0.createdAt
                )
            },
            weaves: weaves.map {
                WeaveDTO(
                    id: $0.id,
                    fromPanelId: $0.fromPanelId,
                    toPanelId: $0.toPanelId,
                    kind: $0.kind,
                    rationale: $0.rationale,
                    createdAt: $0.createdAt,
                    updatedAt: $0.updatedAt
                )
            }
        )
    }

    // MARK: - Export

    /// Present a save panel + write the serialized bundle. Pretty-printed
    /// with sorted keys so the resulting file is diff-friendly across
    /// exports (useful when the user keeps a Git-tracked backup).
    static func exportToFile() {
        let bundleToSave: ExportBundle
        let data: Data
        do {
            bundleToSave = try buildBundle()
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            data = try encoder.encode(bundleToSave)
        } catch {
            NSLog("[Loom] Export build/encode failed: \(error)")
            return
        }

        let panel = NSSavePanel()
        panel.title = "Export Loom"
        // ISO-8601 date prefix (yyyy-MM-dd) so recent backups sort
        // naturally in Finder.
        let datePrefix = ISO8601DateFormatter().string(from: Date()).prefix(10)
        panel.nameFieldStringValue = "loom-export-\(datePrefix).json"
        panel.allowedContentTypes = [.json]
        panel.canCreateDirectories = true

        let completion: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK, let url = panel.url else { return }
            do {
                try data.write(to: url, options: [.atomic])
                NSLog("[Loom] Exported bundle to \(url.path) · \(bundleToSave.pursuits.count) pursuits · \(bundleToSave.traces.count) traces · \(bundleToSave.soanCards.count) cards · \(bundleToSave.soanEdges.count) edges · \(bundleToSave.weaves.count) weaves")
            } catch {
                NSLog("[Loom] Export write failed: \(error)")
            }
        }

        if let window = NSApp.keyWindow {
            panel.beginSheetModal(for: window, completionHandler: completion)
        } else {
            completion(panel.runModal())
        }
    }

    // MARK: - Import

    /// Present an open panel + upsert the bundle into SwiftData. Rows with
    /// the same `id` as an incoming row are deleted first, then re-inserted
    /// — this both preserves ids for cross-row references (edges, weaves)
    /// and lets the user re-import a newer export over an older one without
    /// de-duplication.
    static func importFromFile() {
        let panel = NSOpenPanel()
        panel.title = "Import Loom"
        panel.allowedContentTypes = [.json]
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false

        let completion: (NSApplication.ModalResponse) -> Void = { response in
            guard response == .OK, let url = panel.url else { return }
            Task { @MainActor in
                do {
                    let data = try Data(contentsOf: url)
                    let decoded = try JSONDecoder().decode(
                        ExportBundle.self, from: data
                    )
                    try applyImport(decoded)
                    NSLog("[Loom] Imported bundle · \(decoded.pursuits.count) pursuits · \(decoded.traces.count) traces · \(decoded.soanCards.count) cards · \(decoded.soanEdges.count) edges · \(decoded.weaves.count) weaves")
                } catch {
                    NSLog("[Loom] Import failed: \(error)")
                }
            }
        }

        if let window = NSApp.keyWindow {
            panel.beginSheetModal(for: window, completionHandler: completion)
        } else {
            completion(panel.runModal())
        }
    }

    /// Core of the import: for each DTO, delete the matching row (if any)
    /// then insert a fresh model with the DTO's id + fields. Saves once
    /// at the end so a half-applied bundle can't leave inconsistent state.
    /// Posts a change notification per kind so the mirror coordinator and
    /// any open SwiftUI view refreshes.
    private static func applyImport(
        _ bundle: ExportBundle,
        store: LoomDataStore = .shared
    ) throws {
        let ctx = store.mainContext

        // --- Pursuits ------------------------------------------------
        for p in bundle.pursuits {
            if let existing = try? LoomPursuitWriter.find(id: p.id, store: store) {
                ctx.delete(existing)
            }
            let model = LoomPursuit(
                id: p.id,
                question: p.question,
                weight: p.weight,
                season: p.season,
                sourceDocIdsJSON: p.sourceDocIdsJSON,
                panelIdsJSON: p.panelIdsJSON,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
                settledAt: p.settledAt
            )
            ctx.insert(model)
        }

        // --- Traces --------------------------------------------------
        for t in bundle.traces {
            let descriptor = FetchDescriptor<LoomTrace>(
                predicate: #Predicate { $0.id == t.id }
            )
            if let existing = try? ctx.fetch(descriptor).first {
                ctx.delete(existing)
            }
            let model = LoomTrace(
                id: t.id,
                kind: t.kind,
                parentId: t.parentId,
                sourceDocId: t.sourceDocId,
                sourceTitle: t.sourceTitle,
                sourceHref: t.sourceHref,
                createdAt: t.createdAt,
                updatedAt: t.updatedAt,
                eventsJSON: t.eventsJSON,
                currentSummary: t.currentSummary
            )
            ctx.insert(model)
        }

        // --- Sōan cards ---------------------------------------------
        for c in bundle.soanCards {
            if let existing = try? LoomSoanWriter.findCard(id: c.id, store: store) {
                ctx.delete(existing)
            }
            let model = LoomSoanCard(
                id: c.id,
                kind: c.kind,
                title: c.title,
                body: c.body,
                source: c.source,
                x: c.x,
                y: c.y,
                width: c.width,
                height: c.height,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt
            )
            ctx.insert(model)
        }

        // --- Sōan edges ---------------------------------------------
        for e in bundle.soanEdges {
            if let existing = try? LoomSoanWriter.findEdge(id: e.id, store: store) {
                ctx.delete(existing)
            }
            let model = LoomSoanEdge(
                id: e.id,
                fromCardId: e.fromCardId,
                toCardId: e.toCardId,
                kind: e.kind,
                createdAt: e.createdAt
            )
            ctx.insert(model)
        }

        // --- Weaves --------------------------------------------------
        for w in bundle.weaves {
            if let existing = try? LoomWeaveWriter.find(id: w.id, store: store) {
                ctx.delete(existing)
            }
            let model = LoomWeave(
                id: w.id,
                fromPanelId: w.fromPanelId,
                toPanelId: w.toPanelId,
                kind: w.kind,
                rationale: w.rationale,
                createdAt: w.createdAt,
                updatedAt: w.updatedAt
            )
            ctx.insert(model)
        }

        try ctx.save()

        // Broadcast once per kind so subscribers re-fetch. Webview
        // mirror coordinator + SwiftUI views watching any of these will
        // refresh immediately.
        NotificationCenter.default.post(name: .loomPursuitChanged, object: nil, userInfo: ["op": "import"])
        NotificationCenter.default.post(name: .loomTraceChanged, object: nil, userInfo: ["op": "import"])
        NotificationCenter.default.post(name: .loomSoanChanged, object: nil, userInfo: ["op": "import"])
        NotificationCenter.default.post(name: .loomWeaveChanged, object: nil, userInfo: ["op": "import"])
    }
}
