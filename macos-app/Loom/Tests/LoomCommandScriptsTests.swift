import XCTest
@testable import Loom

final class LoomCommandScriptsTests: XCTestCase {
    func testLearnSelectionScriptOpensPassageChatForSelections() {
        let script = LoomCommandScripts.learnSelectionScript()

        XCTAssertTrue(script.contains("loom:chat:focus"))
        XCTAssertFalse(script.contains("loom:capture-prompt"))
        XCTAssertTrue(script.contains("detail: { text }"))
    }

    func testLearnSelectionScriptStillFallsBackToRehearsalOverlayWithoutSelection() {
        let script = LoomCommandScripts.learnSelectionScript()

        XCTAssertTrue(script.contains("loom:overlay:open"))
        XCTAssertTrue(script.contains("id: 'rehearsal'"))
        XCTAssertTrue(script.contains("loom:overlay:toggle"))
    }
}
