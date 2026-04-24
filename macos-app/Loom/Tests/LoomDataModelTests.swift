import XCTest
import SwiftData

@testable import Loom

final class LoomDataModelTests: XCTestCase {
    @MainActor
    func testStoreInitializesAndAcceptsInserts() throws {
        let store = LoomDataStore.inMemory()
        let now = Date().timeIntervalSince1970 * 1000

        let trace = LoomTrace(
            id: "t1",
            kind: "reading",
            sourceDocId: "know/sample",
            sourceTitle: "Sample",
            createdAt: now,
            updatedAt: now
        )
        store.mainContext.insert(trace)
        try store.mainContext.save()

        let fetched = try store.mainContext.fetch(FetchDescriptor<LoomTrace>())
        XCTAssertEqual(fetched.count, 1)
        XCTAssertEqual(fetched.first?.id, "t1")
    }

    @MainActor
    func testUniqueIdPreventsDuplicateInserts() throws {
        let store = LoomDataStore.inMemory()
        let now = Date().timeIntervalSince1970 * 1000
        store.mainContext.insert(LoomTrace(id: "dup", kind: "reading", createdAt: now, updatedAt: now))
        store.mainContext.insert(LoomTrace(id: "dup", kind: "reading", createdAt: now, updatedAt: now))
        try store.mainContext.save()
        let fetched = try store.mainContext.fetch(FetchDescriptor<LoomTrace>())
        XCTAssertEqual(fetched.count, 1, "@Attribute(.unique) should dedupe on save")
    }

    @MainActor
    func testTracePanelWeaveCoexistInSingleStore() throws {
        let store = LoomDataStore.inMemory()
        let now = Date().timeIntervalSince1970 * 1000
        store.mainContext.insert(LoomTrace(id: "t", kind: "reading", createdAt: now, updatedAt: now))
        store.mainContext.insert(LoomPanel(id: "p", status: "draft", title: "A", createdAt: now, updatedAt: now))
        store.mainContext.insert(LoomWeave(
            id: "w",
            fromPanelId: "p",
            toPanelId: "p",
            kind: "supports",
            createdAt: now,
            updatedAt: now
        ))
        try store.mainContext.save()
        XCTAssertEqual(try store.mainContext.fetch(FetchDescriptor<LoomTrace>()).count, 1)
        XCTAssertEqual(try store.mainContext.fetch(FetchDescriptor<LoomPanel>()).count, 1)
        XCTAssertEqual(try store.mainContext.fetch(FetchDescriptor<LoomWeave>()).count, 1)
    }

    @MainActor
    func testFetchPredicateFiltersByKind() throws {
        let store = LoomDataStore.inMemory()
        let now = Date().timeIntervalSince1970 * 1000
        store.mainContext.insert(LoomTrace(id: "a", kind: "reading", createdAt: now, updatedAt: now))
        store.mainContext.insert(LoomTrace(id: "b", kind: "problem", createdAt: now, updatedAt: now))
        store.mainContext.insert(LoomTrace(id: "c", kind: "reading", createdAt: now, updatedAt: now))
        try store.mainContext.save()

        let descriptor = FetchDescriptor<LoomTrace>(
            predicate: #Predicate { $0.kind == "reading" }
        )
        let reading = try store.mainContext.fetch(descriptor)
        XCTAssertEqual(reading.count, 2)
        XCTAssertEqual(Set(reading.map(\.id)), ["a", "c"])
    }

    @MainActor
    func testInMemoryStoresAreIsolated() throws {
        let a = LoomDataStore.inMemory()
        let b = LoomDataStore.inMemory()
        let now = Date().timeIntervalSince1970 * 1000
        a.mainContext.insert(LoomTrace(id: "only-in-a", kind: "reading", createdAt: now, updatedAt: now))
        try a.mainContext.save()
        let fromB = try b.mainContext.fetch(FetchDescriptor<LoomTrace>())
        XCTAssertTrue(fromB.isEmpty, "in-memory stores must not share state")
    }
}
