import XCTest
import SwiftData
@testable import Loom

@MainActor
final class LoomTraceWriterTests: XCTestCase {
    func testCreateTraceInsertsAndReturnsIt() throws {
        let store = LoomDataStore.inMemory()
        let trace = try LoomTraceWriter.createTrace(
            kind: "reading",
            sourceDocId: "doc-1",
            sourceTitle: "Test Doc",
            store: store
        )
        XCTAssertEqual(trace.kind, "reading")
        XCTAssertEqual(trace.sourceDocId, "doc-1")
        XCTAssertEqual(trace.sourceTitle, "Test Doc")
        XCTAssertEqual(trace.eventsJSON, "[]")
        let all = try LoomTraceWriter.allTraces(store: store)
        XCTAssertEqual(all.count, 1)
    }

    func testAppendEventRewritesEventsJSON() throws {
        let store = LoomDataStore.inMemory()
        let trace = try LoomTraceWriter.createTrace(kind: "reading", store: store)
        _ = try LoomTraceWriter.appendEvent(
            traceId: trace.id,
            event: ["kind": "thought-anchor", "text": "Hello"],
            store: store
        )
        _ = try LoomTraceWriter.appendEvent(
            traceId: trace.id,
            event: ["kind": "highlight", "quote": "World"],
            store: store
        )
        let reloaded = try LoomTraceWriter.traces(ofKind: "reading", store: store).first
        XCTAssertNotNil(reloaded)
        let json = reloaded!.eventsJSON
        XCTAssertTrue(json.contains("thought-anchor"))
        XCTAssertTrue(json.contains("highlight"))
        XCTAssertTrue(json.contains("World"))
    }

    func testAppendEventReturnsNilForUnknownTrace() throws {
        let store = LoomDataStore.inMemory()
        let result = try LoomTraceWriter.appendEvent(
            traceId: "nonexistent",
            event: ["kind": "x"],
            store: store
        )
        XCTAssertNil(result)
    }

    func testQueryByKindFiltersCorrectly() throws {
        let store = LoomDataStore.inMemory()
        _ = try LoomTraceWriter.createTrace(kind: "reading", store: store)
        _ = try LoomTraceWriter.createTrace(kind: "concept", store: store)
        _ = try LoomTraceWriter.createTrace(kind: "reading", store: store)
        let reading = try LoomTraceWriter.traces(ofKind: "reading", store: store)
        let concept = try LoomTraceWriter.traces(ofKind: "concept", store: store)
        XCTAssertEqual(reading.count, 2)
        XCTAssertEqual(concept.count, 1)
    }

    func testQueryByDocIdFiltersCorrectly() throws {
        let store = LoomDataStore.inMemory()
        _ = try LoomTraceWriter.createTrace(kind: "reading", sourceDocId: "doc-1", store: store)
        _ = try LoomTraceWriter.createTrace(kind: "reading", sourceDocId: "doc-2", store: store)
        _ = try LoomTraceWriter.createTrace(kind: "reading", sourceDocId: "doc-1", store: store)
        let docOne = try LoomTraceWriter.traces(forDocId: "doc-1", store: store)
        let docTwo = try LoomTraceWriter.traces(forDocId: "doc-2", store: store)
        XCTAssertEqual(docOne.count, 2)
        XCTAssertEqual(docTwo.count, 1)
    }

    func testUpdateSummaryPersistsAndRefreshesTimestamp() throws {
        let store = LoomDataStore.inMemory()
        let trace = try LoomTraceWriter.createTrace(kind: "reading", store: store)
        let oldUpdatedAt = trace.updatedAt
        // Spin briefly so updatedAt is strictly greater on the second
        // write (millisecond precision).
        Thread.sleep(forTimeInterval: 0.003)
        _ = try LoomTraceWriter.updateSummary(
            traceId: trace.id,
            summary: "Key insight: foo is bar.",
            store: store
        )
        let reloaded = try LoomTraceWriter.allTraces(store: store).first
        XCTAssertEqual(reloaded?.currentSummary, "Key insight: foo is bar.")
        XCTAssertGreaterThan(reloaded?.updatedAt ?? 0, oldUpdatedAt)
    }

    func testChangeNotificationPostedOnCreate() throws {
        let store = LoomDataStore.inMemory()
        let expectation = XCTestExpectation(description: "loomTraceChanged fires")
        let observer = NotificationCenter.default.addObserver(
            forName: .loomTraceChanged, object: nil, queue: .main
        ) { note in
            if (note.userInfo?["op"] as? String) == "create" {
                expectation.fulfill()
            }
        }
        _ = try LoomTraceWriter.createTrace(kind: "reading", store: store)
        wait(for: [expectation], timeout: 1.0)
        NotificationCenter.default.removeObserver(observer)
    }
}
