import XCTest
import SwiftData

@testable import Loom

final class LoomMigrationImporterTests: XCTestCase {
    @MainActor
    func testImportInsertsTracesPanelsAndWeaves() throws {
        let store = LoomDataStore.inMemory()
        let payload: [String: Any] = [
            "version": 1,
            "exportedAt": 1_700_000_000_000,
            "traces": [
                ["id": "t1", "kind": "reading", "source": ["docId": "know/x", "sourceTitle": "X"],
                 "createdAt": 100.0, "updatedAt": 200.0, "events": []],
            ],
            "panels": [
                ["id": "p1", "docId": "know/x", "status": "draft", "title": "Hello",
                 "body": ["markdown": "hi"], "createdAt": 50.0, "updatedAt": 60.0],
            ],
            "weaves": [
                ["id": "w1", "fromPanelId": "p1", "toPanelId": "p1", "kind": "supports",
                 "createdAt": 70.0, "updatedAt": 70.0],
            ],
        ]
        let stats = try LoomMigrationImporter.importInto(store, payload: payload)
        XCTAssertEqual(stats, LoomMigrationImporter.Stats(traces: 1, panels: 1, weaves: 1))

        let traces = try store.mainContext.fetch(FetchDescriptor<LoomTrace>())
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(traces.first?.sourceDocId, "know/x")

        let panels = try store.mainContext.fetch(FetchDescriptor<LoomPanel>())
        XCTAssertEqual(panels.first?.title, "Hello")

        let weaves = try store.mainContext.fetch(FetchDescriptor<LoomWeave>())
        XCTAssertEqual(weaves.first?.kind, "supports")
    }

    @MainActor
    func testReimportUpdatesExistingRowsInsteadOfDuplicating() throws {
        let store = LoomDataStore.inMemory()
        let first: [String: Any] = [
            "version": 1,
            "traces": [["id": "t", "kind": "reading", "createdAt": 1.0, "updatedAt": 1.0]],
            "panels": [], "weaves": [],
        ]
        _ = try LoomMigrationImporter.importInto(store, payload: first)

        let second: [String: Any] = [
            "version": 1,
            "traces": [["id": "t", "kind": "problem", "createdAt": 1.0, "updatedAt": 99.0]],
            "panels": [], "weaves": [],
        ]
        _ = try LoomMigrationImporter.importInto(store, payload: second)

        let traces = try store.mainContext.fetch(FetchDescriptor<LoomTrace>())
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(traces.first?.kind, "problem")
        XCTAssertEqual(traces.first?.updatedAt, 99.0)
    }

    @MainActor
    func testRefusesNewerSchemaVersion() {
        let store = LoomDataStore.inMemory()
        let payload: [String: Any] = [
            "version": 42, "traces": [], "panels": [], "weaves": [],
        ]
        XCTAssertThrowsError(
            try LoomMigrationImporter.importInto(store, payload: payload)
        ) { error in
            XCTAssertEqual(error as? LoomMigrationImporter.Failure, .unsupportedVersion(42))
        }
    }

    @MainActor
    func testSkipsRowsMissingMandatoryFields() throws {
        let store = LoomDataStore.inMemory()
        let payload: [String: Any] = [
            "version": 1,
            "traces": [
                ["id": ""],
                ["kind": "reading"],
                ["id": "good", "kind": "reading", "createdAt": 0.0, "updatedAt": 0.0],
            ],
            "panels": [],
            "weaves": [
                ["id": "w", "fromPanelId": "", "toPanelId": ""],
                ["id": "w2", "fromPanelId": "a", "toPanelId": "b"],
            ],
        ]
        let stats = try LoomMigrationImporter.importInto(store, payload: payload)
        XCTAssertEqual(stats.traces, 1)
        XCTAssertEqual(stats.weaves, 1)

        let traces = try store.mainContext.fetch(FetchDescriptor<LoomTrace>())
        XCTAssertEqual(traces.count, 1)
        XCTAssertEqual(traces.first?.id, "good")
    }

    @MainActor
    func testEmptyPayloadIsNoOp() throws {
        let store = LoomDataStore.inMemory()
        let stats = try LoomMigrationImporter.importInto(store, payload: ["version": 1])
        XCTAssertEqual(stats, LoomMigrationImporter.Stats(traces: 0, panels: 0, weaves: 0))
    }
}
