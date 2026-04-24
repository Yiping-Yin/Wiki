import SwiftUI
import SwiftData

/// Native port of `components/RecursingOverlay.tsx` → Phase 4 overlay #1
/// (simplest of the four: no AI, read-only).
///
/// Shows past reconstructions — Notes the user wrote from memory during a
/// Rehearsal session. Each appears in the event log as a `thought-anchor`
/// event with `blockId == "loom-rehearsal-root"`, parsed out of each
/// trace's `eventsJSON`.
///
/// Three regions:
///   1. Left list — titles sorted by most recent.
///   2. Right preview — full content of the selected reconstruction.
///   3. Toolbar row — "→ Use as new source" button posts a notification
///      a future Rehearsal anchor can pick up to promote the note to a
///      docId-like target.
///
/// Subscribes to `.loomTraceChanged` so a live rehearsal completion
/// surfaces here without requiring a reopen.
struct ReconstructionsView: View {
    @State private var reconstructions: [Reconstruction] = []
    @State private var selectedID: String?

    struct Reconstruction: Identifiable, Hashable {
        let id: String        // event-level id (or composed from traceId + index)
        let traceId: String
        let docId: String?
        let docTitle: String?
        let body: String
        let at: Double
        var title: String {
            // First line of the body is the natural title if present.
            body.split(separator: "\n", maxSplits: 1).first.map(String.init) ?? "(untitled)"
        }
    }

    private var selected: Reconstruction? {
        guard let id = selectedID else { return reconstructions.first }
        return reconstructions.first { $0.id == id } ?? reconstructions.first
    }

    var body: some View {
        NavigationSplitView {
            listColumn
                .navigationSplitViewColumnWidth(min: 200, ideal: 260, max: 360)
        } detail: {
            previewColumn
        }
        .frame(minWidth: 640, idealWidth: 800, minHeight: 480)
        .task { await reload() }
        .onReceive(NotificationCenter.default.publisher(for: .loomTraceChanged)) { _ in
            Task { await reload() }
        }
    }

    @ViewBuilder
    private var listColumn: some View {
        if reconstructions.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(LoomTokens.muted)
                Text("No reconstructions yet")
                    .font(LoomTokens.display(size: 18, italic: true))
                    .foregroundStyle(LoomTokens.ink)
                Text("Complete a rehearsal to write from memory, and the reconstruction lands here.")
                    .font(LoomTokens.serif(size: 12, italic: true))
                    .foregroundStyle(LoomTokens.ink3)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(LoomTokens.paper)
        } else {
            List(selection: Binding(get: { selectedID }, set: { selectedID = $0 })) {
                ForEach(reconstructions) { recon in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(recon.title)
                            .font(LoomTokens.serif(size: 13, weight: .medium))
                            .foregroundStyle(LoomTokens.ink)
                            .lineLimit(1)
                        if let title = recon.docTitle {
                            Text(title)
                                .font(LoomTokens.sans(size: 10))
                                .foregroundStyle(LoomTokens.muted)
                                .lineLimit(1)
                        }
                    }
                    .tag(Optional(recon.id))
                }
            }
            .listStyle(.sidebar)
            .scrollContentBackground(.hidden)
            .background(LoomTokens.paper)
        }
    }

    @ViewBuilder
    private var previewColumn: some View {
        if let sel = selected {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text")
                        .foregroundStyle(LoomTokens.thread)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(sel.title)
                            .font(LoomTokens.display(size: 22, italic: true, weight: .semibold))
                            .foregroundStyle(LoomTokens.ink)
                        if let docTitle = sel.docTitle {
                            Text("From: \(docTitle)")
                                .font(LoomTokens.serif(size: 12, italic: true))
                                .foregroundStyle(LoomTokens.ink3)
                        }
                    }
                    Spacer()
                    Button {
                        promote(sel)
                    } label: {
                        Label("Use as new source", systemImage: "arrow.up.forward")
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(LoomTokens.thread)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .overlay(alignment: .bottom) { LoomTokens.hair.frame(height: 0.5) }

                ScrollView {
                    Text(sel.body)
                        .font(LoomTokens.serif(size: 14))
                        .foregroundStyle(LoomTokens.ink)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                }
                .scrollContentBackground(.hidden)
                .background(LoomTokens.paper)
            }
            .background(LoomTokens.paper)
        } else {
            Text("Select a reconstruction from the list.")
                .font(LoomTokens.serif(size: 13, italic: true))
                .foregroundStyle(LoomTokens.muted)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(LoomTokens.paper)
        }
    }

    private func promote(_ recon: Reconstruction) {
        // Fractal recursion write: mint a new "source" trace anchored to
        // the reconstruction's synthetic id. Future captures targeting
        // `note:<reconstructionId>` will thread through this trace. Also
        // open Rehearsal seeded so the learner can immediately recurse
        // on their own prior thinking.
        let syntheticDocId = "note:\(recon.id)"
        let syntheticTitle = recon.title
        _ = try? LoomTraceWriter.createTrace(
            kind: "source",
            sourceDocId: syntheticDocId,
            sourceTitle: syntheticTitle,
            sourceHref: nil,
            initialEvents: [[
                "kind": "promote",
                "blockId": "loom-recursing-promote",
                "fromReconstructionId": recon.id,
                "fromTraceId": recon.traceId,
                "body": recon.body,
                "at": Date().timeIntervalSince1970 * 1000,
            ]]
        )
        // Seed Rehearsal with the promoted title so the recursive round
        // starts instantly. The prior `.loomPromoteReconstruction` post
        // is gone — the createTrace call above is the real persistence,
        // and .loomTraceChanged (posted by LoomTraceWriter) is what
        // refreshes interested views. No external observer existed.
        RehearsalContext.shared.pendingTopic = syntheticTitle
        NSLog("[Loom] Promoted reconstruction \(recon.id) → source trace (docId=\(syntheticDocId))")
    }

    @MainActor
    private func reload() async {
        do {
            let traces = try LoomTraceWriter.allTraces()
            var out: [Reconstruction] = []
            for trace in traces {
                let events = deserialize(trace.eventsJSON)
                for (idx, event) in events.enumerated() {
                    guard
                        let kind = event["kind"] as? String, kind == "thought-anchor",
                        let blockId = event["blockId"] as? String, blockId == "loom-rehearsal-root",
                        let body = (event["text"] as? String) ?? (event["content"] as? String),
                        !body.isEmpty
                    else { continue }
                    let at = (event["at"] as? Double) ?? trace.updatedAt
                    let eventID = (event["id"] as? String) ?? "\(trace.id)#\(idx)"
                    out.append(Reconstruction(
                        id: eventID,
                        traceId: trace.id,
                        docId: trace.sourceDocId,
                        docTitle: trace.sourceTitle,
                        body: body,
                        at: at
                    ))
                }
            }
            out.sort { $0.at > $1.at }
            reconstructions = out
        } catch {
            reconstructions = []
        }
    }

    private func deserialize(_ json: String) -> [[String: Any]] {
        guard let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        return arr
    }
}

enum ReconstructionsWindow {
    static let id = "com.loom.window.reconstructions"
}

