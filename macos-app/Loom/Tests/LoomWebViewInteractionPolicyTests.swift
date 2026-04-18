import XCTest
import WebKit
@testable import Loom

final class LoomWebViewInteractionPolicyTests: XCTestCase {
    @MainActor
    func testApplyDisablesWebViewMagnificationAndResetsZoom() {
        let webView = WKWebView(frame: .zero)
        webView.allowsMagnification = true
        webView.magnification = 1.35

        LoomWebViewInteractionPolicy.apply(to: webView)

        XCTAssertFalse(webView.allowsMagnification)
        XCTAssertEqual(webView.magnification, 1.0, accuracy: 0.0001)
    }
}
