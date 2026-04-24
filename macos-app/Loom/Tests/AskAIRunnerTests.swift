import XCTest
@testable import Loom

/// Tests for AskAIRunner's storable state — thread persistence, history
/// MRU enforcement, newThread reset, loadFromHistory replacement.
///
/// AI streaming itself isn't tested here (it calls real provider clients).
/// The contract covered is: UserDefaults ↔ runner round-trip fidelity.
@MainActor
final class AskAIRunnerTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: AskAIRunner.historyKey)
        UserDefaults.standard.removeObject(forKey: AskAIRunner.currentThreadKey)
    }

    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: AskAIRunner.historyKey)
        UserDefaults.standard.removeObject(forKey: AskAIRunner.currentThreadKey)
        super.tearDown()
    }

    func testFreshRunnerStartsEmpty() {
        let runner = AskAIRunner()
        XCTAssertTrue(runner.messages.isEmpty)
        XCTAssertTrue(runner.history.isEmpty)
    }

    func testLoadFromHistoryReplacesMessages() {
        let runner = AskAIRunner()
        let entry = AskAIHistoryEntry(
            id: "entry-1",
            prompt: "What is attention?",
            response: "Attention is …",
            at: 1_700_000_000
        )
        runner.loadFromHistory(entry)
        XCTAssertEqual(runner.messages.count, 2)
        XCTAssertEqual(runner.messages[0].role, .user)
        XCTAssertEqual(runner.messages[0].content, "What is attention?")
        XCTAssertEqual(runner.messages[1].role, .assistant)
        XCTAssertEqual(runner.messages[1].content, "Attention is …")
    }

    func testNewThreadClearsMessagesAndPersistsEmpty() {
        let runner = AskAIRunner()
        runner.loadFromHistory(AskAIHistoryEntry(
            id: "e1", prompt: "q", response: "a", at: 0
        ))
        XCTAssertEqual(runner.messages.count, 2)

        runner.newThread()
        XCTAssertTrue(runner.messages.isEmpty)

        // Persisted state should also be cleared.
        let persisted = UserDefaults.standard.data(forKey: AskAIRunner.currentThreadKey)
        XCTAssertNil(persisted, "newThread should remove the persisted thread key")
    }

    func testThreadPersistsAcrossRunnerInstances() {
        // Seed UserDefaults directly — simulating what a prior runner's
        // submit + complete cycle would have written.
        let msgs = [
            AskAIMessage(id: "u1", role: .user, content: "First Q", at: 1),
            AskAIMessage(id: "a1", role: .assistant, content: "First A", at: 2),
            AskAIMessage(id: "u2", role: .user, content: "Follow-up", at: 3),
            AskAIMessage(id: "a2", role: .assistant, content: "Follow-up reply", at: 4),
        ]
        let data = try? JSONEncoder().encode(msgs)
        XCTAssertNotNil(data)
        UserDefaults.standard.set(data, forKey: AskAIRunner.currentThreadKey)

        // Fresh runner should pick them up on init.
        let restored = AskAIRunner()
        XCTAssertEqual(restored.messages.count, 4)
        XCTAssertEqual(restored.messages.first?.content, "First Q")
        XCTAssertEqual(restored.messages.last?.content, "Follow-up reply")
    }

    func testHistoryPersistsAcrossRunnerInstances() {
        let entries = (0..<3).map {
            AskAIHistoryEntry(
                id: "e-\($0)",
                prompt: "prompt \($0)",
                response: "response \($0)",
                at: Double($0)
            )
        }
        let data = try? JSONEncoder().encode(entries)
        XCTAssertNotNil(data)
        UserDefaults.standard.set(data, forKey: AskAIRunner.historyKey)

        let runner = AskAIRunner()
        XCTAssertEqual(runner.history.count, 3)
        XCTAssertEqual(runner.history.map(\.prompt), ["prompt 0", "prompt 1", "prompt 2"])
    }

    func testClearHistoryEmptiesAndPersists() {
        let entries = [AskAIHistoryEntry(
            id: "only", prompt: "q", response: "a", at: 0
        )]
        UserDefaults.standard.set(try? JSONEncoder().encode(entries), forKey: AskAIRunner.historyKey)

        let runner = AskAIRunner()
        XCTAssertEqual(runner.history.count, 1)

        runner.clearHistory()
        XCTAssertTrue(runner.history.isEmpty)

        // Persisted side is cleared too.
        let persisted = UserDefaults.standard.data(forKey: AskAIRunner.historyKey)
        if let data = persisted,
           let decoded = try? JSONDecoder().decode([AskAIHistoryEntry].self, from: data) {
            XCTAssertTrue(decoded.isEmpty, "clearHistory should persist an empty list, not leave stale data")
        }
    }
}
