import XCTest

@testable import Loom

final class CustomEndpointClientTests: XCTestCase {
    // MARK: resolution helpers

    func testResolveBaseURLReturnsNilWhenUnset() {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        suite.removeObject(forKey: CustomEndpointClient.baseURLDefaultsKey)
        XCTAssertNil(CustomEndpointClient.resolveBaseURL(defaults: suite))
    }

    func testResolveBaseURLReturnsStoredURL() {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        suite.set("https://api.groq.com/openai/v1/chat/completions", forKey: CustomEndpointClient.baseURLDefaultsKey)
        XCTAssertEqual(
            CustomEndpointClient.resolveBaseURL(defaults: suite)?.absoluteString,
            "https://api.groq.com/openai/v1/chat/completions"
        )
    }

    func testResolveBaseURLRejectsMalformedString() {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        // URL(string:) accepts essentially anything but empty. Ensure empty
        // string behavior is consistent with "nil".
        suite.set("   ", forKey: CustomEndpointClient.baseURLDefaultsKey)
        XCTAssertNil(CustomEndpointClient.resolveBaseURL(defaults: suite))
    }

    func testResolveModelFallsBackToEmpty() {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        suite.removeObject(forKey: CustomEndpointClient.modelDefaultsKey)
        XCTAssertEqual(CustomEndpointClient.resolveModel(defaults: suite), "")
    }

    // MARK: Failure semantics

    func testMissingEndpointIsNonRecoverable() {
        XCTAssertFalse(CustomEndpointClient.Failure.missingEndpoint.recoverable)
    }

    func testMissingModelIsNonRecoverable() {
        XCTAssertFalse(CustomEndpointClient.Failure.missingModel.recoverable)
    }

    func testHttpRecoverabilityReflectsStatus() {
        XCTAssertTrue(CustomEndpointClient.Failure.http(status: 429, body: "", recoverable: true).recoverable)
        XCTAssertFalse(CustomEndpointClient.Failure.http(status: 400, body: "", recoverable: false).recoverable)
    }

    // MARK: send — missing endpoint path

    func testSendThrowsMissingEndpointWhenUnconfigured() async {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        suite.removeObject(forKey: CustomEndpointClient.baseURLDefaultsKey)

        do {
            _ = try await CustomEndpointClient.send(
                prompt: "hi",
                options: CustomEndpointClient.Options(),
                defaults: suite
            )
            XCTFail("expected missingEndpoint failure")
        } catch let failure as CustomEndpointClient.Failure {
            XCTAssertEqual(failure, .missingEndpoint)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }

    func testSendThrowsMissingModelWhenEndpointSetButNoModel() async {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        suite.set("https://example.com/v1/chat/completions", forKey: CustomEndpointClient.baseURLDefaultsKey)
        suite.removeObject(forKey: CustomEndpointClient.modelDefaultsKey)

        do {
            _ = try await CustomEndpointClient.send(
                prompt: "hi",
                options: CustomEndpointClient.Options(),
                defaults: suite
            )
            XCTFail("expected missingModel failure")
        } catch let failure as CustomEndpointClient.Failure {
            XCTAssertEqual(failure, .missingModel)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }
}
