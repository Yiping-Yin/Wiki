import XCTest
@testable import Loom

/// Covers the PASS/RETRY extraction that runs on every graded answer.
/// AI responses vary wildly in format, so the parser must tolerate:
///   - Verdict on its own line vs inline in prose
///   - Bold / markdown wrappers
///   - Lowercase variants
///   - Partial-word matches ("BYPASS" must not count as PASS)
@MainActor
final class ExaminerVerdictParserTests: XCTestCase {
    func testVerdictOnFirstLineAlone() {
        let (pass, feedback) = ExaminerRunner.parseVerdict("""
        PASS
        Your explanation of attention is thorough and correct.
        """)
        XCTAssertTrue(pass)
        XCTAssertEqual(feedback, "Your explanation of attention is thorough and correct.")
    }

    func testVerdictInlineInProse() {
        let (pass, feedback) = ExaminerRunner.parseVerdict("""
        That's a solid answer. PASS. You correctly identified softmax as the normalizer.
        """)
        XCTAssertTrue(pass)
        XCTAssertTrue(feedback.contains("solid answer"))
    }

    func testRetryLowercase() {
        let (pass, _) = ExaminerRunner.parseVerdict("retry — this is incomplete")
        XCTAssertFalse(pass)
    }

    func testBypassDoesNotMatchPass() {
        let (pass, _) = ExaminerRunner.parseVerdict("The learner tried to bypass the question.")
        XCTAssertFalse(pass, "BYPASS must not match PASS via word-boundary check")
    }

    func testNoVerdictDefaultsToRetry() {
        let (pass, feedback) = ExaminerRunner.parseVerdict("Interesting thoughts on the topic.")
        XCTAssertFalse(pass, "Default to RETRY so learners aren't falsely credited")
        XCTAssertEqual(feedback, "Interesting thoughts on the topic.")
    }

    func testVerdictBuriedAfterFeedback() {
        let (pass, _) = ExaminerRunner.parseVerdict("""
        Your answer mentions keys and values but misses queries. RETRY.
        """)
        XCTAssertFalse(pass)
    }

    func testEmptyInputDefaultsToRetry() {
        let (pass, feedback) = ExaminerRunner.parseVerdict("")
        XCTAssertFalse(pass)
        XCTAssertEqual(feedback, "")
    }
}
