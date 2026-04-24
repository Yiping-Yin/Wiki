import XCTest
@testable import Loom

/// Phase 0 unit tests for `locate()` — the three-tier quote search used
/// by `verifySpans` to re-derive character offsets from an AI-returned
/// quote. Covers the three tiers the plan's reference Python exercises
/// (exact / whitespace-normalized / miss). Typed-extractor tests land
/// in later phases alongside those extractors.
final class IngestExtractorLocateTests: XCTestCase {
    func testLocateExactSubstringReturnsCorrectRange() {
        let source = "The term is Term 3 2025 and starts in October."
        let quote = "Term 3 2025"
        let range = locate(quote: quote, in: source)
        XCTAssertNotNil(range)
        XCTAssertEqual(range?.lowerBound, 12)
        XCTAssertEqual(range?.upperBound, 23)
    }

    func testLocateMatchesAcrossCollapsedWhitespace() {
        // Source has a newline + double-space between words that the
        // AI quoted on a single line with single spaces — the classic
        // PDF-line-break case.
        let source = "Learning objectives:\nUnderstand  bond\nindex replication."
        let quote = "Understand bond index replication."
        let range = locate(quote: quote, in: source)
        XCTAssertNotNil(range, "expected whitespace-normalized fallback to hit")
        if let range {
            // Range should cover "Understand" through the trailing period.
            let nsSource = source as NSString
            let slice = nsSource.substring(
                with: NSRange(location: range.lowerBound, length: range.upperBound - range.lowerBound)
            )
            XCTAssertTrue(slice.hasPrefix("Understand"))
            XCTAssertTrue(slice.hasSuffix("replication."))
        }
    }

    func testLocateReturnsNilWhenQuoteAbsent() {
        let source = "Syllabus for FINS3640 Investment Banking."
        let quote = "Monetary policy transmission channels"
        XCTAssertNil(locate(quote: quote, in: source))
    }

    func testGenericDocParsePreservesRawOutputForPhaseZeroCompatibility() {
        let raw = """
        This is the summary paragraph.

        - First point
        • Second point
        * Third point
        A trailing model note that existing callers should still receive.
        """

        let parsed = GenericDocExtractor.parse(rawOutput: raw)

        XCTAssertEqual(parsed.rawOutput, raw)
        XCTAssertEqual(parsed.summary, "This is the summary paragraph.")
        XCTAssertEqual(parsed.keyPoints, ["First point", "Second point", "Third point"])
    }

    func testVerifySpansChecksEveryQuoteAndCapsConfidenceOnAnyMiss() {
        let source = "First quote here. Second quote here."
        let result: FieldResult<String> = .found(
            value: "field",
            confidence: 0.91,
            sourceSpans: [
                SourceSpan(
                    docId: "model-doc",
                    charStart: 99,
                    charEnd: 110,
                    quote: "First quote",
                    verified: false
                ),
                SourceSpan(
                    docId: "model-doc",
                    charStart: 0,
                    charEnd: 0,
                    quote: "Invented quote",
                    verified: true
                ),
            ]
        )

        let verified = verifySpans(result, sourceText: source, docId: "doc-1")

        guard case .found(let value, let confidence, let spans) = verified else {
            XCTFail("expected found result")
            return
        }

        XCTAssertEqual(value, "field")
        XCTAssertEqual(confidence, 0.4)
        XCTAssertEqual(spans.count, 2)
        XCTAssertEqual(spans[0].docId, "doc-1")
        XCTAssertEqual(spans[0].charStart, 0)
        XCTAssertEqual(spans[0].charEnd, 11)
        XCTAssertTrue(spans[0].verified)
        XCTAssertNil(spans[0].verifyReason)
        XCTAssertFalse(spans[1].verified)
        XCTAssertEqual(spans[1].verifyReason, "quote_not_substring_of_source")
    }

    func testVerifySpansRejectsEllipsisStitchedQuoteBeforePrefixFallback() {
        let source = "Format: Python exercises due weekly. Topic: Bond index replication."
        let stitchedQuote = "Format: Python exercises due weekly ... Topic: Bond index replication."
        let result: FieldResult<String> = .found(
            value: "format",
            confidence: 0.88,
            sourceSpans: [
                SourceSpan(
                    docId: "model-doc",
                    charStart: 0,
                    charEnd: 0,
                    quote: stitchedQuote,
                    verified: true
                ),
            ]
        )

        let verified = verifySpans(result, sourceText: source, docId: "doc-ellipsis")

        guard case .found(_, let confidence, let spans) = verified else {
            XCTFail("expected found result")
            return
        }

        XCTAssertEqual(confidence, 0.4)
        XCTAssertEqual(spans.count, 1)
        XCTAssertFalse(spans[0].verified)
        XCTAssertEqual(spans[0].verifyReason, "quote_appears_non_contiguous")
    }

    func testFieldResultDecodesLegacySingletonSourceSpanAsList() throws {
        let json = """
        {
          "status": "found",
          "value": "teacher",
          "confidence": 0.8,
          "sourceSpan": {
            "docId": "doc-legacy",
            "pageNum": null,
            "charStart": 4,
            "charEnd": 11,
            "quote": "teacher",
            "verified": true,
            "verifyReason": null
          }
        }
        """.data(using: .utf8)!

        let decoded = try JSONDecoder().decode(FieldResult<String>.self, from: json)

        guard case .found(let value, let confidence, let spans) = decoded else {
            XCTFail("expected found result")
            return
        }

        XCTAssertEqual(value, "teacher")
        XCTAssertEqual(confidence, 0.8)
        XCTAssertEqual(spans.count, 1)
        XCTAssertEqual(spans[0].docId, "doc-legacy")
        XCTAssertEqual(spans[0].quote, "teacher")
    }

    func testSourceSpanDecodesAIQuoteOnlyShapeAndVerifiesOffsets() throws {
        let json = """
        {
          "status": "found",
          "value": "course",
          "confidence": 0.79,
          "sourceSpans": [
            { "quote": "INFS3822 Assessment Guide" }
          ]
        }
        """.data(using: .utf8)!

        let decoded = try JSONDecoder().decode(FieldResult<String>.self, from: json)
        let verified = verifySpans(
            decoded,
            sourceText: "Header\nINFS3822 Assessment Guide\nDetails",
            docId: "doc-ai"
        )

        guard case .found(let value, let confidence, let spans) = verified else {
            XCTFail("expected found result")
            return
        }

        XCTAssertEqual(value, "course")
        XCTAssertEqual(confidence, 0.79)
        XCTAssertEqual(spans.count, 1)
        XCTAssertEqual(spans[0].docId, "doc-ai")
        XCTAssertEqual(spans[0].charStart, 7)
        XCTAssertEqual(spans[0].charEnd, 32)
        XCTAssertTrue(spans[0].verified)
    }

    func testSyllabusSchemaRoundTripsNestedFieldResults() throws {
        let schema = SyllabusSchema(
            courseCode: .found(
                value: "INFS3822",
                confidence: 0.94,
                sourceSpans: [SourceSpan(docId: "doc-1", charStart: 0, charEnd: 8, quote: "INFS3822", verified: true)]
            ),
            courseName: .notFound(tried: ["title", "first page"]),
            term: .found(
                value: "Term 1 2026",
                confidence: 0.82,
                sourceSpans: [SourceSpan(docId: "doc-1", charStart: 10, charEnd: 21, quote: "Term 1 2026", verified: true)]
            ),
            institution: .found(
                value: "UNSW",
                confidence: 0.9,
                sourceSpans: [SourceSpan(docId: "doc-1", charStart: 23, charEnd: 27, quote: "UNSW", verified: true)]
            ),
            teachers: [
                TeacherSchema(
                    role: .found(value: "Lecturer", confidence: 0.8, sourceSpans: []),
                    name: .found(value: "Jane Example", confidence: 0.8, sourceSpans: []),
                    email: .notFound(tried: ["staff section"])
                ),
            ],
            officeHours: .notFound(tried: ["staff section"]),
            textbook: .notFound(tried: ["resources section"]),
            assessmentItems: [
                AssessmentSchema(
                    name: .found(value: "Project", confidence: 0.86, sourceSpans: []),
                    weightPercent: .found(value: 35.0, confidence: 0.86, sourceSpans: []),
                    dueDate: .notFound(tried: ["assessment table"]),
                    format: .found(value: "Group report", confidence: 0.77, sourceSpans: [])
                ),
            ],
            learningObjectives: [.found(value: "Explain systems design", confidence: 0.72, sourceSpans: [])],
            weekTopics: [
                WeekTopicSchema(
                    weekRange: .found(value: "Week 1", confidence: 0.7, sourceSpans: []),
                    topic: .found(value: "Introduction", confidence: 0.7, sourceSpans: [])
                ),
            ]
        )

        let encoded = try JSONEncoder().encode(schema)
        let decoded = try JSONDecoder().decode(SyllabusSchema.self, from: encoded)

        guard case .found(let code, _, let spans) = decoded.courseCode else {
            XCTFail("expected courseCode found")
            return
        }
        XCTAssertEqual(code, "INFS3822")
        XCTAssertEqual(spans.count, 1)
        XCTAssertEqual(spans[0].quote, "INFS3822")

        guard case .notFound(let tried) = decoded.courseName else {
            XCTFail("expected courseName not found")
            return
        }
        XCTAssertEqual(tried, ["title", "first page"])
        XCTAssertEqual(decoded.teachers.count, 1)
        XCTAssertEqual(decoded.assessmentItems.count, 1)
        XCTAssertEqual(decoded.learningObjectives.count, 1)
        XCTAssertEqual(decoded.weekTopics.count, 1)
    }

    func testSyllabusExtractorMatchesOnlySyllabusLikePDFs() {
        XCTAssertEqual(
            SyllabusPDFExtractor.match(
                filename: "INFS3822 Assessment Guide T1 2026.pdf",
                parentPath: "Guide",
                sample: ""
            ),
            0.9
        )
        XCTAssertEqual(
            SyllabusPDFExtractor.match(
                filename: "INFS3822 Assessment Guide T1 2026.pptx",
                parentPath: "Guide",
                sample: ""
            ),
            0.0
        )
        XCTAssertEqual(
            SyllabusPDFExtractor.match(
                filename: "lecture-notes-week-1.pdf",
                parentPath: "Week 1",
                sample: ""
            ),
            0.0
        )
    }

    func testExtractorRegistryPrefersSyllabusThenFallsBackToGeneric() {
        let syllabus = ExtractorRegistry.bestMatch(
            filename: "Course Overview_FINS3640.pdf",
            parentPath: "Week 0",
            sample: ""
        )
        XCTAssertEqual(syllabus.extractorId, SyllabusPDFExtractor.extractorId)

        let generic = ExtractorRegistry.bestMatch(
            filename: "personal-notes.md",
            parentPath: "Desk",
            sample: "# Notes"
        )
        XCTAssertEqual(generic.extractorId, GenericDocExtractor.extractorId)
    }

    func testSyllabusExtractorDemotesFilenameStemQuotes() {
        let stems = SyllabusPDFExtractor.filenameStems(from: "Course Overview_FINS3640.pdf")
        let result: FieldResult<String> = .found(
            value: "FINS3640",
            confidence: 0.93,
            sourceSpans: [
                SourceSpan(
                    docId: "doc-1",
                    charStart: 0,
                    charEnd: 24,
                    quote: "Course Overview_FINS3640",
                    verified: true
                ),
            ]
        )

        let hardened = SyllabusPDFExtractor.demoteIfFilenameQuote(result, filenameStems: stems)

        guard case .found(let value, let confidence, let spans) = hardened else {
            XCTFail("expected found result")
            return
        }

        XCTAssertEqual(value, "FINS3640")
        XCTAssertEqual(confidence, 0.4)
        XCTAssertEqual(spans.count, 1)
        XCTAssertFalse(spans[0].verified)
        XCTAssertEqual(spans[0].verifyReason, "quote_contains_filename_stem")
    }

    func testStructuredOutputSupportExtractsJSONFromFenceAndPreamble() throws {
        let wrapped = """
        Here is the JSON:
        ```json
        {"status":"found","value":"x","confidence":0.7,"sourceSpans":[{"quote":"x"}]}
        ```
        """

        let bytes = try XCTUnwrap(StructuredOutputSupport.extractJSONBytes(from: wrapped))
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: bytes) as? [String: Any])

        XCTAssertEqual(object["status"] as? String, "found")
        XCTAssertEqual(object["value"] as? String, "x")
    }
}
