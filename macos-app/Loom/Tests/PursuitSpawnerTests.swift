import XCTest
@testable import Loom

@MainActor
final class PursuitSpawnerTests: XCTestCase {

    // MARK: - composeBody

    func testComposeBodyWithAllFieldsPresent() {
        let item = AssessmentSchema(
            name: .found(value: "Group Assignment 1", confidence: 0.95, sourceSpans: []),
            weightPercent: .found(value: 20.0, confidence: 0.95, sourceSpans: []),
            dueDate: .found(value: "Friday Week 5", confidence: 0.9, sourceSpans: []),
            format: .found(value: "Group report (1500 words)", confidence: 0.85, sourceSpans: [])
        )
        XCTAssertEqual(
            PursuitSpawner.composeBody(item: item),
            "20% · due Friday Week 5\nGroup report (1500 words)"
        )
    }

    func testComposeBodyTrimsZeroFractionFromWholePercent() {
        let item = AssessmentSchema(
            name: .found(value: "Final", confidence: 1.0, sourceSpans: []),
            weightPercent: .found(value: 35.0, confidence: 1.0, sourceSpans: []),
            dueDate: .found(value: "TBD", confidence: 0.5, sourceSpans: []),
            format: .notFound(tried: ["rubric"])
        )
        // No "format" line because it's notFound — never the literal
        // "not_found" string in the body.
        XCTAssertEqual(
            PursuitSpawner.composeBody(item: item),
            "35% · due TBD"
        )
    }

    func testComposeBodyKeepsFractionalPercent() {
        let item = AssessmentSchema(
            name: .found(value: "Quiz", confidence: 1.0, sourceSpans: []),
            weightPercent: .found(value: 12.5, confidence: 1.0, sourceSpans: []),
            dueDate: .notFound(tried: []),
            format: .notFound(tried: [])
        )
        XCTAssertEqual(
            PursuitSpawner.composeBody(item: item),
            "12.5%"
        )
    }

    func testComposeBodyOmitsAllNotFoundFields() {
        let item = AssessmentSchema(
            name: .found(value: "Mystery", confidence: 1.0, sourceSpans: []),
            weightPercent: .notFound(tried: []),
            dueDate: .notFound(tried: []),
            format: .notFound(tried: [])
        )
        // Body is empty when nothing is found beyond the name. The
        // pursuit will still spawn (name is found) but body is "".
        XCTAssertEqual(PursuitSpawner.composeBody(item: item), "")
    }

    func testComposeBodyHandlesDueDateOnlyAsLeadingLine() {
        let item = AssessmentSchema(
            name: .found(value: "Reading log", confidence: 1.0, sourceSpans: []),
            weightPercent: .notFound(tried: []),
            dueDate: .found(value: "weekly", confidence: 1.0, sourceSpans: []),
            format: .found(value: "Submit on Moodle", confidence: 1.0, sourceSpans: [])
        )
        XCTAssertEqual(
            PursuitSpawner.composeBody(item: item),
            "due weekly\nSubmit on Moodle"
        )
    }

    // MARK: - PursuitHideStore round-trip

    func testHideStoreRoundTrip() throws {
        // Use a temp container so we don't pollute the real user-data
        // dir. Stub by writing/reading directly to a sample path.
        let tempDocId = "ingested:test-\(UUID().uuidString).pdf"
        defer {
            // Best-effort cleanup of the test sidecar.
            if let url = PursuitHideStore.userDataURL(sourceDocId: tempDocId) {
                try? FileManager.default.removeItem(at: url)
            }
        }

        XCTAssertEqual(PursuitHideStore.read(sourceDocId: tempDocId), [])

        try PursuitHideStore.hide(pursuitId: "uuid-1", sourceDocId: tempDocId)
        try PursuitHideStore.hide(pursuitId: "uuid-2", sourceDocId: tempDocId)
        XCTAssertEqual(
            PursuitHideStore.read(sourceDocId: tempDocId),
            ["uuid-1", "uuid-2"]
        )

        // Hiding the same id twice is a no-op (deduplication).
        try PursuitHideStore.hide(pursuitId: "uuid-1", sourceDocId: tempDocId)
        XCTAssertEqual(
            PursuitHideStore.read(sourceDocId: tempDocId),
            ["uuid-1", "uuid-2"]
        )

        // Restore removes one entry; the other persists.
        try PursuitHideStore.restore(pursuitId: "uuid-1", sourceDocId: tempDocId)
        XCTAssertEqual(
            PursuitHideStore.read(sourceDocId: tempDocId),
            ["uuid-2"]
        )

        // Restoring an absent id is a no-op.
        try PursuitHideStore.restore(pursuitId: "uuid-not-there", sourceDocId: tempDocId)
        XCTAssertEqual(
            PursuitHideStore.read(sourceDocId: tempDocId),
            ["uuid-2"]
        )
    }

    func testSlugifyMatchesSchemaCorrectionsRule() {
        // Both stores must use the same slug rule so the per-source
        // sidecars sit alongside each other consistently.
        XCTAssertEqual(
            PursuitHideStore.slugified("ingested:Course Overview_FINS3640.pdf"),
            SchemaCorrectionsStore.slugified("ingested:Course Overview_FINS3640.pdf")
        )
        XCTAssertEqual(
            PursuitHideStore.slugified("ingested:中文-test.pdf"),
            SchemaCorrectionsStore.slugified("ingested:中文-test.pdf")
        )
    }
}
