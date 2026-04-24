import AppKit
import WebKit

/// Generic bridge for small native actions the webview wants to trigger.
/// Phase 4 of architecture inversion. Keeps a single handler for
/// lightweight commands rather than adding one handler per action.
///
/// Protocol: JS posts `{ action: "<name>", ...payload }`. Unknown actions
/// are logged and ignored.
///
/// Current actions:
///   - `openSettings`   → opens the native SwiftUI Settings scene
///   - `openAbout`      → opens the native About window
///   - `openKeyboardHelp` → opens the Keyboard Shortcuts window
@MainActor
final class NavigationBridgeHandler: NSObject, WKScriptMessageHandler {
    static let name = "loomNavigate"

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else {
            return
        }
        switch action {
        case "openSettings":
            openSettingsWindow()
        case "openAbout":
            NotificationCenter.default.post(name: .loomOpenAbout, object: nil)
        case "openKeyboardHelp":
            NotificationCenter.default.post(name: .loomOpenKeyboardHelp, object: nil)
        case "openShuttle":
            NotificationCenter.default.post(name: .loomOpenShuttle, object: nil)
        case "openEvening":
            NotificationCenter.default.post(name: .loomOpenEveningWindow, object: nil)
        case "crystallize":
            handleCrystallize(body: payload)
        case "anchorFromInterlace":
            handleAnchorFromInterlace(body: payload)
        case "updateSoanCardPosition":
            handleUpdateSoanCardPosition(body: payload)
        case "updateSoanCardBody":
            handleUpdateSoanCardBody(body: payload)
        case "updatePursuitSeason":
            handleUpdatePursuitSeason(body: payload)
        case "deletePursuit":
            handleDeletePursuit(body: payload)
        case "reviseTraceSummary":
            handleReviseTraceSummary(body: payload)
        default:
            NSLog("[NavigationBridgeHandler] unknown action: \(action)")
        }
    }

    /// Flip a pursuit's `season` (active / waiting / held / retired /
    /// contradicted). Called from `PursuitDetailClient`'s footer actions
    /// ("Set this question down" → held, "Contradict this" → contradicted).
    /// The writer updates `settledAt` appropriately and broadcasts
    /// `.loomPursuitChanged`, which the ContentView coordinator mirrors
    /// back to the webview — so the web side doesn't need to persist its
    /// own optimistic update; it just needs to render the new season until
    /// the mirror arrives.
    private func handleUpdatePursuitSeason(body: [String: Any]) {
        guard let payload = body["payload"] as? [String: Any],
              let id = payload["id"] as? String,
              let season = payload["season"] as? String else {
            NSLog("[Loom] updatePursuitSeason missing fields")
            return
        }
        Task { @MainActor in
            do { try LoomPursuitWriter.updateSeason(id: id, season: season) }
            catch { NSLog("[Loom] updatePursuitSeason failed: \(error)") }
        }
    }

    /// Revise a trace's `currentSummary`, preserving the prior text as a
    /// `revision` event in the log so Palimpsest can render the draft-
    /// beneath-the-draft timeline. Payload shape (from
    /// `PanelDetailClient`'s edit-summary affordance):
    ///   { id, newText }
    ///
    /// Empty `newText` is rejected so a stray blur on a never-filled
    /// textarea can't wipe an otherwise-held panel's body.
    private func handleReviseTraceSummary(body: [String: Any]) {
        guard let payload = body["payload"] as? [String: Any],
              let id = payload["id"] as? String,
              let newText = payload["newText"] as? String else {
            NSLog("[Loom] reviseTraceSummary missing fields")
            return
        }
        let trimmed = newText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            NSLog("[Loom] reviseTraceSummary rejected empty newText")
            return
        }
        Task { @MainActor in
            do { _ = try LoomTraceWriter.reviseSummary(traceId: id, newText: newText) }
            catch { NSLog("[Loom] reviseTraceSummary failed: \(error)") }
        }
    }

    /// Remove a pursuit entirely. Rare path — preferred exit is 'held' or
    /// 'retired' via `updatePursuitSeason` — but the web side offers a
    /// discreet Delete affordance for accidentally-minted pursuits.
    private func handleDeletePursuit(body: [String: Any]) {
        guard let payload = body["payload"] as? [String: Any],
              let id = payload["id"] as? String else {
            NSLog("[Loom] deletePursuit missing fields")
            return
        }
        Task { @MainActor in
            do { try LoomPursuitWriter.delete(id: id) }
            catch { NSLog("[Loom] deletePursuit failed: \(error)") }
        }
    }

    /// Persist an Interlace "Anchor this thought" click. The web side
    /// (`lib/interlace.ts` → `registerInterlaceAnchorListener`) forwards
    /// the full context: the selected passage, the source title/href it
    /// came from, the AI response that was produced, and the timestamp.
    /// We write it as a single-thought trace so it surfaces in the same
    /// Patterns / trace-derived views that Crystallize feeds.
    private func handleAnchorFromInterlace(body: [String: Any]) {
        guard let payload = body["payload"] as? [String: Any] else {
            NSLog("[Loom] anchorFromInterlace received without payload — skipping")
            return
        }
        let selection = payload["selection"] as? String ?? ""
        let response = payload["response"] as? String ?? ""
        let sourceTitle = payload["sourceTitle"] as? String ?? ""
        let sourceHref = payload["sourceHref"] as? String ?? ""
        let at = payload["at"] as? Double ?? (Date().timeIntervalSince1970 * 1000)

        guard !response.isEmpty || !selection.isEmpty else {
            NSLog("[Loom] anchorFromInterlace with no body — skipping")
            return
        }

        Task { @MainActor in
            do {
                let title = sourceTitle.isEmpty ? "Interlace anchor" : sourceTitle
                var events: [[String: Any]] = []
                if !selection.isEmpty {
                    events.append([
                        "kind": "selection",
                        "text": selection,
                        "at": at,
                    ])
                }
                if !response.isEmpty {
                    events.append([
                        "kind": "thought",
                        "text": response,
                        "at": at,
                    ])
                }
                let trace = try LoomTraceWriter.createTrace(
                    kind: "reading",
                    sourceDocId: sourceHref.isEmpty ? nil : sourceHref,
                    sourceTitle: title,
                    sourceHref: sourceHref.isEmpty ? nil : sourceHref,
                    initialEvents: events
                )
                try LoomTraceWriter.updateSummary(
                    traceId: trace.id,
                    summary: response.isEmpty ? selection : response
                )
            } catch {
                NSLog("[Loom] anchorFromInterlace persist failed: \(error)")
            }
        }
    }

    /// Persist a drag-to-reposition from the Sōan canvas. Payload shape
    /// (from `SoanClient.tsx` drag handler): `{ id, x, y }` where `x` /
    /// `y` are canvas-local pixel coordinates. `LoomSoanWriter` already
    /// exposes the mutation helper; the web side updates its local state
    /// optimistically, and the subsequent `loom-soan-updated` broadcast
    /// (after SwiftData save) arrives with matching coords, so there is
    /// no visual jump on reconcile.
    private func handleUpdateSoanCardPosition(body: [String: Any]) {
        guard let payload = body["payload"] as? [String: Any],
              let id = payload["id"] as? String,
              let x = payload["x"] as? Double,
              let y = payload["y"] as? Double else {
            NSLog("[Loom] updateSoanCardPosition missing fields")
            return
        }
        Task { @MainActor in
            do {
                try LoomSoanWriter.updateCardPosition(id: id, x: x, y: y)
            } catch {
                NSLog("[Loom] updateSoanCardPosition failed: \(error)")
            }
        }
    }

    /// Persist an inline-edit commit from the Sōan card. Payload shape
    /// (from `SoanClient.tsx` double-click → textarea blur / ⌘↵):
    /// `{ id, body }`. Empty bodies are accepted — the web surface
    /// renders a muted "(empty)" placeholder rather than rejecting.
    private func handleUpdateSoanCardBody(body: [String: Any]) {
        guard let payload = body["payload"] as? [String: Any],
              let id = payload["id"] as? String,
              let text = payload["body"] as? String else {
            NSLog("[Loom] updateSoanCardBody missing fields")
            return
        }
        Task { @MainActor in
            do {
                try LoomSoanWriter.updateCardBody(id: id, body: text)
            } catch {
                NSLog("[Loom] updateSoanCardBody failed: \(error)")
            }
        }
    }

    /// Settle the M5 Review "live note" trail into a new `LoomTrace`.
    /// Payload shape (from `lib/crystallize-listener.ts`):
    ///   { section, thoughts: [String], source, at: Double (ms) }
    ///
    /// Each thought is appended as a `thought`-kind event in the trace's
    /// `eventsJSON` — matches the rest of the web event schema that the
    /// trace folder consumes. We also set `currentSummary` to the last
    /// thought so /patterns and trace-derived views have a usable
    /// headline.
    ///
    /// Trace change is broadcast via `LoomTraceWriter` → `.loomTraceChanged`,
    /// which any interested native view (e.g. ReconstructionsView, Patterns)
    /// already subscribes to. A previous `.loomCrystallize` notification was
    /// posted here for an "optional panel-creation handler" that never
    /// materialised; removed to stop orphaning posts.
    private func handleCrystallize(body: [String: Any]) {
        guard let payload = body["payload"] as? [String: Any] else {
            NSLog("[Loom] Crystallize received without payload — skipping")
            return
        }
        let source = payload["source"] as? String ?? ""
        let section = payload["section"] as? String ?? ""
        let thoughts = payload["thoughts"] as? [String] ?? []
        let at = payload["at"] as? Double ?? (Date().timeIntervalSince1970 * 1000)

        guard !thoughts.isEmpty else {
            NSLog("[Loom] Crystallize received with empty thoughts — skipping persist")
            return
        }

        Task { @MainActor in
            do {
                let topic = section.isEmpty ? "Live note" : section
                let initialEvents: [[String: Any]] = thoughts.map { thought in
                    [
                        "kind": "thought",
                        "text": thought,
                        "at": at,
                    ]
                }
                let trace = try LoomTraceWriter.createTrace(
                    kind: "reading",
                    sourceDocId: source.isEmpty ? nil : source,
                    sourceTitle: topic,
                    sourceHref: source.isEmpty ? nil : source,
                    initialEvents: initialEvents
                )
                try LoomTraceWriter.updateSummary(
                    traceId: trace.id,
                    summary: thoughts.last ?? ""
                )
            } catch {
                NSLog("[Loom] Crystallize persist failed: \(error)")
            }
        }
    }

    /// Opens the SwiftUI `Settings` scene. On macOS 14+ the legacy
    /// `showSettingsWindow:` selector is unreliable — the only path
    /// guaranteed to work is `@Environment(\.openSettings)`, which
    /// lives in the SwiftUI view tree. Post a notification so the
    /// root ContentView can invoke it for us.
    private func openSettingsWindow() {
        NotificationCenter.default.post(name: .loomOpenSettings, object: nil)
    }
}

extension Notification.Name {
    static let loomOpenAbout = Notification.Name("loomOpenAbout")
    static let loomOpenKeyboardHelp = Notification.Name("loomOpenKeyboardHelp")
    static let loomOpenShuttle = Notification.Name("loomOpenShuttle")
    /// Posted from the web side (HomeClient "Set down the shuttle") so the
    /// WindowOpener can surface the native Evening ritual window. Mirrors
    /// the pattern used for Shuttle / About / Keyboard Help.
    static let loomOpenEveningWindow = Notification.Name("loomOpenEveningWindow")
    /// Posted whenever any surface (AppKit bridge, sidebar CTA, failed-
    /// load button) needs to open the SwiftUI Settings scene. The root
    /// ContentView listens and calls its `@Environment(\.openSettings)`
    /// action — which is the only route that works reliably across
    /// macOS 14 / 15 / 26 after Apple deprecated the old selector.
    static let loomOpenSettings = Notification.Name("loomOpenSettings")
}
