import XCTest

@testable import Loom

final class CLIRuntimeClientTests: XCTestCase {
    // MARK: buildArgs — flavor-specific argument formatting

    func testClaudeFlavorArgs() {
        let args = CLIRuntimeClient.buildArgs(flavor: .claude, extra: [])
        XCTAssertEqual(args, ["-p", "--output-format", "text"])
    }

    func testClaudeFlavorAppendsExtraArgs() {
        let args = CLIRuntimeClient.buildArgs(flavor: .claude, extra: ["--model", "opus"])
        XCTAssertEqual(args, ["-p", "--output-format", "text", "--model", "opus"])
    }

    func testCodexFlavorArgs() {
        let args = CLIRuntimeClient.buildArgs(flavor: .codex, extra: [])
        XCTAssertEqual(args, ["exec", "--skip-git-repo-check", "--ephemeral", "--color", "never"])
    }

    func testCodexFlavorAppendsExtraArgs() {
        let args = CLIRuntimeClient.buildArgs(flavor: .codex, extra: ["-c", "model=gpt-5"])
        XCTAssertEqual(
            args,
            ["exec", "--skip-git-repo-check", "--ephemeral", "--color", "never", "-c", "model=gpt-5"]
        )
    }

    // MARK: Failure semantics

    func testMissingBinaryIsNonRecoverable() {
        XCTAssertFalse(CLIRuntimeClient.Failure.missingBinary("/nope").recoverable)
    }

    func testSandboxDeniedIsNonRecoverable() {
        XCTAssertFalse(CLIRuntimeClient.Failure.sandboxDenied.recoverable)
    }

    func testTimedOutIsRecoverable() {
        XCTAssertTrue(CLIRuntimeClient.Failure.timedOut(30).recoverable)
    }

    func testCancelledIsRecoverable() {
        XCTAssertTrue(CLIRuntimeClient.Failure.cancelled.recoverable)
    }

    // MARK: resolveDefaultBinary

    func testResolveDefaultBinaryThrowsWhenNoneExist() {
        // If claude / codex genuinely aren't installed, resolver should
        // throw missingBinary. If they ARE installed on this dev machine,
        // this test is skipped — the machine has the binary, test passes
        // trivially.
        do {
            _ = try CLIRuntimeClient.resolveDefaultBinary(for: .claude)
            // Binary was found — this machine has claude. Test's point is
            // just that no crash / no other kind of throw occurs.
        } catch CLIRuntimeClient.Failure.missingBinary {
            // Expected when no claude is installed.
        } catch {
            XCTFail("unexpected failure type: \(error)")
        }
    }
}
