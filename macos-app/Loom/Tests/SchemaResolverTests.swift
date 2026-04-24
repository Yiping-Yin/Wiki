import XCTest
@testable import Loom

@MainActor
final class SchemaResolverTests: XCTestCase {
    func testCategorySlugParsingIgnoresWikiDocs() {
        XCTAssertEqual(
            SchemaResolver.categorySlug(fromReadingDocId: "know/unsw-fins-3640__week-3-notes"),
            "unsw-fins-3640"
        )
        XCTAssertEqual(
            SchemaResolver.categorySlug(fromReadingDocId: "know/infs-3822__assessment-guide"),
            "infs-3822"
        )
        XCTAssertNil(SchemaResolver.categorySlug(fromReadingDocId: "wiki/transformer"))
    }

    func testSlugTokensDropInstitutionPrefixButKeepCourseCode() {
        XCTAssertEqual(
            SchemaResolver.tokens(fromSlug: "unsw-fins-3640"),
            Set(["FINS", "3640"])
        )
        XCTAssertEqual(
            SchemaResolver.tokens(fromSlug: "infs-3822"),
            Set(["INFS", "3822"])
        )
    }

    func testCourseCodeTokensReadFoundFieldOnly() {
        let found = #"{"courseCode":{"status":"found","value":"FINS3640","confidence":0.9,"sourceSpans":[]}}"#
        XCTAssertEqual(
            SchemaResolver.tokens(fromCourseCodeField: found),
            Set(["FINS", "3640"])
        )

        let missing = #"{"courseCode":{"status":"not_found","tried":["title page"]}}"#
        XCTAssertEqual(SchemaResolver.tokens(fromCourseCodeField: missing), [])
    }

    func testSchemaPayloadParsesSchemaAndLayersCorrections() {
        let correction = SchemaCorrectionsStore.Correction(
            fieldPath: "courseCode.value",
            original: "FINS3640",
            corrected: "FINS 3640",
            at: 123
        )
        let payload = SchemaPayload(
            traceId: "trace-1",
            extractorId: "syllabus-pdf",
            sourceDocId: "ingested:Course Overview_FINS3640.pdf",
            sourceTitle: "Course Overview",
            schemaJSON: #"{"courseCode":{"status":"found","value":"FINS3640"}}"#,
            corrections: [correction],
            updatedAt: 456
        )

        let json = payload.jsonDictionary()
        XCTAssertEqual(json["traceId"] as? String, "trace-1")
        XCTAssertEqual(json["extractorId"] as? String, "syllabus-pdf")

        let schema = json["schema"] as? [String: Any]
        let courseCode = schema?["courseCode"] as? [String: Any]
        XCTAssertEqual(courseCode?["value"] as? String, "FINS3640")

        let corrections = json["corrections"] as? [[String: Any]]
        XCTAssertEqual(corrections?.first?["fieldPath"] as? String, "courseCode.value")
        XCTAssertEqual(corrections?.first?["corrected"] as? String, "FINS 3640")
    }

    func testSchemaCorrectionSlugificationKeepsPathSafeCourseIdentity() {
        XCTAssertEqual(
            SchemaCorrectionsStore.slugified("ingested:Course Overview_FINS3640.pdf"),
            "ingested_Course_Overview_FINS3640_pdf"
        )
    }
}
