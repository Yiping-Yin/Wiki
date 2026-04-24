import XCTest
@testable import Loom

/// Confirms the event-schema contract between the 4 Phase 4 overlays
/// holds end-to-end at the data layer. If any overlay's read / write
/// shape drifts, this test catches the break before users see "my
/// rehearsal disappeared" bugs.
@MainActor
final class OverlayDataFlowTests: XCTestCase {
    /// Rehearsal saves a `thought-anchor` with `blockId = "loom-rehearsal-root"`.
    /// Recursing reads those exact events back as reconstructions. If the
    /// two disagree on event shape the loop breaks silently.
    func testRehearsalWriteIsReadableAsReconstruction() throws {
        let store = LoomDataStore.inMemory()
        // Mirror what RehearsalView.save() writes today.
        _ = try LoomTraceWriter.createTrace(
            kind: "rehearsal",
            sourceDocId: "topic:transformer-attention",
            sourceTitle: "transformer attention",
            initialEvents: [[
                "kind": "thought-anchor",
                "blockId": "loom-rehearsal-root",
                "text": "Attention weights come from softmax over Q·K^T / √d_k.",
                "at": 1_700_000_000_000.0,
            ]],
            store: store
        )

        let traces = try LoomTraceWriter.allTraces(store: store)
        XCTAssertEqual(traces.count, 1)

        // Mirror ReconstructionsView.reload() extraction logic.
        var reconstructions: [(traceId: String, body: String)] = []
        for trace in traces {
            guard let data = trace.eventsJSON.data(using: .utf8),
                  let events = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                continue
            }
            for event in events {
                guard
                    let kind = event["kind"] as? String, kind == "thought-anchor",
                    let blockId = event["blockId"] as? String, blockId == "loom-rehearsal-root",
                    let body = (event["text"] as? String) ?? (event["content"] as? String),
                    !body.isEmpty
                else { continue }
                reconstructions.append((trace.id, body))
            }
        }

        XCTAssertEqual(reconstructions.count, 1)
        XCTAssertTrue(reconstructions.first?.body.contains("softmax over Q·K^T") ?? false)
    }

    /// Ingestion saves a trace of kind "ingestion"; the Ingestion panel
    /// queries by that exact kind. Contract check.
    func testIngestionKindIsQueryable() throws {
        let store = LoomDataStore.inMemory()
        _ = try LoomTraceWriter.createTrace(
            kind: "ingestion",
            sourceDocId: "ingested:test.md",
            sourceTitle: "test.md",
            initialEvents: [[
                "kind": "thought-anchor",
                "blockId": "loom-ingestion-root",
                "content": "# Test content",
                "summary": "A test document.",
                "at": 1_700_000_000_000.0,
            ]],
            store: store
        )

        let ingestionTraces = try LoomTraceWriter.traces(ofKind: "ingestion", store: store)
        XCTAssertEqual(ingestionTraces.count, 1)
        XCTAssertEqual(ingestionTraces.first?.sourceTitle, "test.md")

        // Also confirm filtering by kind excludes other traces.
        _ = try LoomTraceWriter.createTrace(kind: "rehearsal", store: store)
        let stillOneIngestion = try LoomTraceWriter.traces(ofKind: "ingestion", store: store)
        XCTAssertEqual(stillOneIngestion.count, 1)
    }

    /// Only events with the rehearsal blockId surface as reconstructions;
    /// ingestion events with a different blockId shouldn't leak into the
    /// Recursing view.
    func testIngestionEventsDontLeakIntoReconstructions() throws {
        let store = LoomDataStore.inMemory()
        _ = try LoomTraceWriter.createTrace(
            kind: "ingestion",
            initialEvents: [[
                "kind": "thought-anchor",
                "blockId": "loom-ingestion-root", // NOT loom-rehearsal-root
                "content": "some ingested text",
            ]],
            store: store
        )
        _ = try LoomTraceWriter.createTrace(
            kind: "rehearsal",
            initialEvents: [[
                "kind": "thought-anchor",
                "blockId": "loom-rehearsal-root",
                "text": "actual reconstruction",
            ]],
            store: store
        )

        let traces = try LoomTraceWriter.allTraces(store: store)
        var reconstructionBodies: [String] = []
        for trace in traces {
            guard let data = trace.eventsJSON.data(using: .utf8),
                  let events = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                continue
            }
            for event in events {
                guard
                    let kind = event["kind"] as? String, kind == "thought-anchor",
                    let blockId = event["blockId"] as? String, blockId == "loom-rehearsal-root",
                    let body = (event["text"] as? String) ?? (event["content"] as? String)
                else { continue }
                reconstructionBodies.append(body)
            }
        }
        XCTAssertEqual(reconstructionBodies, ["actual reconstruction"])
    }
}
