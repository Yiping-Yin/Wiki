import XCTest
import SwiftData
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
            updatedAt: 456,
            matchSource: "token"
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
        XCTAssertEqual(json["matchSource"] as? String, "token")
    }

    func testSchemaCorrectionSlugificationKeepsPathSafeCourseIdentity() {
        XCTAssertEqual(
            SchemaCorrectionsStore.slugified("ingested:Course Overview_FINS3640.pdf"),
            "ingested_Course_Overview_FINS3640_pdf"
        )
    }

    // MARK: - Phase 7.3

    func testFileSlugParsingExtractsTrailingFileSegment() {
        XCTAssertEqual(
            SchemaResolver.fileSlug(fromReadingDocId: "know/unsw-fins-3640__week-3-lecture"),
            "week-3-lecture"
        )
        XCTAssertEqual(
            SchemaResolver.fileSlug(fromReadingDocId: "know/cat__file__with__doublescores"),
            "file__with__doublescores"
        )
        XCTAssertNil(SchemaResolver.fileSlug(fromReadingDocId: "wiki/transformer"))
        XCTAssertNil(SchemaResolver.fileSlug(fromReadingDocId: "know/no-double-score"))
    }

    func testFilenameSlugMatchesIngestKnowledgeRule() {
        // Mirrors `scripts/ingest-knowledge.ts:slugify` — the title is
        // first stripped of a recognised extension, then lowercased,
        // then non-alphanumerics collapse to `-`.
        XCTAssertEqual(
            SchemaResolver.filenameSlug(from: "Week 3 Lecture.vtt"),
            "week-3-lecture"
        )
        XCTAssertEqual(
            SchemaResolver.filenameSlug(from: "Chapter 2_The Bond Market.pdf"),
            "chapter-2-the-bond-market"
        )
        // Unknown extension: do not strip — the slug includes it.
        XCTAssertEqual(
            SchemaResolver.filenameSlug(from: "v0.5 notes.unknownext"),
            "v0-5-notes-unknownext"
        )
        // Leading / trailing dashes are trimmed; internal whitespace
        // collapses to a single dash.
        XCTAssertEqual(
            SchemaResolver.filenameSlug(from: "  Hello  World  "),
            "hello-world"
        )
    }

    func testExtractorAnchorPayloadCarriesProvisionalAttribution() {
        let payload = ExtractorAnchorPayload(
            id: "t_1::keyQuotes[0]",
            docId: "know/unsw-fins-3640__week-3-lecture",
            traceId: "t_1",
            extractorId: "transcript",
            sourceDocId: "ingested:Week 3 Lecture.vtt",
            fieldPath: "keyQuotes[0]",
            text: "Bond replication requires matching cash flows.",
            pageNum: 12,
            fingerprint: "t_1::keyQuotes[0]",
            sourceSpans: [["quote": "Bond replication requires matching cash flows.", "verified": true]]
        )
        let dict = payload.jsonDictionary()
        XCTAssertEqual(dict["attribution"] as? String, "extractor")
        XCTAssertEqual(dict["status"] as? String, "provisional")
        XCTAssertEqual(dict["fingerprint"] as? String, "t_1::keyQuotes[0]")
        XCTAssertEqual(dict["pageNum"] as? Int, 12)
        let spans = dict["sourceSpans"] as? [[String: Any]]
        XCTAssertEqual(spans?.first?["verified"] as? Bool, true)
    }

    func testExtractorAnchorsDismissedStoreSlugMatchesSchemaRule() {
        // Both stores use the same slugify rule — co-locating the
        // assertion here flags any drift early.
        XCTAssertEqual(
            ExtractorAnchorsDismissedStore.slugified("know/unsw-fins-3640__week-3-lecture"),
            "know_unsw-fins-3640__week-3-lecture"
        )
    }

    // MARK: - Phase 7.1 robustness · folder-fallback resolver

    func testParentFolderSlugMatchesIngestKnowledgeRule() {
        // Folders without a course code in the name still need to map
        // to the same slug `ingest-knowledge.ts:slugify` produces.
        XCTAssertEqual(
            SchemaResolver.parentFolderSlug(
                fromTraceHref: "file:///Users/u/Library/Investments/Course%20Overview.pdf"
            ),
            "investments"
        )
        XCTAssertEqual(
            SchemaResolver.parentFolderSlug(
                fromTraceHref: "file:///Users/u/Library/Quant%20Stuff/Syllabus.pdf"
            ),
            "quant-stuff"
        )
        // Non-file URLs fall back to nil — folder semantics don't apply.
        XCTAssertNil(
            SchemaResolver.parentFolderSlug(
                fromTraceHref: "https://example.org/Investments/Course%20Overview.pdf"
            )
        )
        // Missing href → nil, never crash.
        XCTAssertNil(SchemaResolver.parentFolderSlug(fromTraceHref: nil))
        XCTAssertNil(SchemaResolver.parentFolderSlug(fromTraceHref: ""))
    }

    /// Helper · build a syllabus-pdf ingestion trace in the in-memory
    /// store with the given filename + folder. Mirrors the real shape
    /// `IngestionView` writes (kind = `ingestion-syllabus-pdf`, one
    /// `thought-anchor` event whose `schemaJSON` carries the
    /// `courseCode` field result).
    private func makeSyllabusTrace(
        store: LoomDataStore,
        filename: String,
        folderName: String,
        courseCode: String?,
        updatedAt: Double = Date().timeIntervalSince1970 * 1000
    ) throws -> LoomTrace {
        let id = "trace-\(UUID().uuidString)"
        let courseCodeJSON: String
        if let courseCode {
            courseCodeJSON = #"{"courseCode":{"status":"found","value":"\#(courseCode)","confidence":0.9,"sourceSpans":[]}}"#
        } else {
            courseCodeJSON = #"{"courseCode":{"status":"not_found","tried":[]}}"#
        }
        // Escape filename / folder for percent-encoding in the href so
        // `URL(string:)` accepts spaces.
        let escapedFolder = folderName.addingPercentEncoding(
            withAllowedCharacters: .urlPathAllowed
        ) ?? folderName
        let escapedFilename = filename.addingPercentEncoding(
            withAllowedCharacters: .urlPathAllowed
        ) ?? filename
        let href = "file:///tmp/library/\(escapedFolder)/\(escapedFilename)"
        let event: [String: Any] = [
            "kind": "thought-anchor",
            "extractorId": SyllabusPDFExtractor.extractorId,
            "schemaJSON": courseCodeJSON,
        ]
        let eventsData = try JSONSerialization.data(withJSONObject: [event], options: [])
        let eventsJSON = String(data: eventsData, encoding: .utf8) ?? "[]"
        let trace = LoomTrace(
            id: id,
            kind: "ingestion-\(SyllabusPDFExtractor.extractorId)",
            sourceDocId: "ingested:\(filename)",
            sourceTitle: filename,
            sourceHref: href,
            createdAt: updatedAt,
            updatedAt: updatedAt,
            eventsJSON: eventsJSON
        )
        store.mainContext.insert(trace)
        try store.mainContext.save()
        return trace
    }

    func testSingleSiblingFallback() throws {
        let store = LoomDataStore.inMemory()
        // Folder is named "Investments" — slugifies to `investments`,
        // which carries no UPPER+digit token. Token-match returns nil;
        // the fallback should fire and pick the only syllabus sibling.
        let trace = try makeSyllabusTrace(
            store: store,
            filename: "Course Overview.pdf",
            folderName: "Investments",
            courseCode: nil
        )
        let payload = SchemaResolver.resolveSyllabus(
            forReadingDocId: "know/investments__week-3-lecture",
            store: store
        )
        XCTAssertNotNil(payload)
        XCTAssertEqual(payload?.traceId, trace.id)
        XCTAssertEqual(payload?.matchSource, "folder-fallback")
    }

    func testMultipleSiblingsRefusesFallback() throws {
        let store = LoomDataStore.inMemory()
        // Two syllabi in the same folder, neither carries a token in
        // the filename — the fallback MUST refuse (forced-pick is
        // worse than nothing).
        _ = try makeSyllabusTrace(
            store: store,
            filename: "Syllabus A.pdf",
            folderName: "Investments",
            courseCode: nil
        )
        _ = try makeSyllabusTrace(
            store: store,
            filename: "Syllabus B.pdf",
            folderName: "Investments",
            courseCode: nil
        )
        let payload = SchemaResolver.resolveSyllabus(
            forReadingDocId: "know/investments__lecture-1",
            store: store
        )
        XCTAssertNil(payload)
    }

    func testTokenMatchPrefersOverFallback() throws {
        let store = LoomDataStore.inMemory()
        // One trace whose filename carries the token (FINS3640) —
        // and one trace whose parent folder slug also matches but
        // lives elsewhere by name. The token match should win and
        // matchSource should be "token", NOT "folder-fallback".
        let tokenWinner = try makeSyllabusTrace(
            store: store,
            filename: "Course Overview FINS3640.pdf",
            folderName: "UNSW FINS 3640",
            courseCode: "FINS3640",
            updatedAt: 1_000
        )
        // Add a confounder in a folder whose slug matches the
        // category — should NOT be picked because token match wins.
        _ = try makeSyllabusTrace(
            store: store,
            filename: "Other.pdf",
            folderName: "unsw-fins-3640",
            courseCode: nil,
            updatedAt: 2_000
        )
        let payload = SchemaResolver.resolveSyllabus(
            forReadingDocId: "know/unsw-fins-3640__week-3-lecture",
            store: store
        )
        XCTAssertNotNil(payload)
        XCTAssertEqual(payload?.traceId, tokenWinner.id)
        XCTAssertEqual(payload?.matchSource, "token")
    }

    func testFolderFallbackEmitsCorrectMatchSourceInJsonPayload() throws {
        let store = LoomDataStore.inMemory()
        _ = try makeSyllabusTrace(
            store: store,
            filename: "Syllabus.pdf",
            folderName: "Quant Stuff",
            courseCode: nil
        )
        let payload = SchemaResolver.resolveSyllabus(
            forReadingDocId: "know/quant-stuff__problem-set-2",
            store: store
        )
        XCTAssertNotNil(payload)
        let dict = payload!.jsonDictionary()
        XCTAssertEqual(dict["matchSource"] as? String, "folder-fallback")
    }
}
