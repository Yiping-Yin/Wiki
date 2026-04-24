import XCTest

@testable import Loom

final class OllamaClientTests: XCTestCase {
    // MARK: extractDeltaText — NDJSON shape

    func testExtractDeltaTextReturnsContentFromMessage() {
        let line = #"{"message":{"role":"assistant","content":"hi"},"done":false}"#
        XCTAssertEqual(OllamaClient.extractDeltaText(fromLine: line), "hi")
    }

    func testExtractDeltaTextReturnsNilForEmptyContent() {
        let line = #"{"message":{"role":"assistant","content":""},"done":true}"#
        XCTAssertNil(OllamaClient.extractDeltaText(fromLine: line))
    }

    func testExtractDeltaTextReturnsNilForMalformedJson() {
        XCTAssertNil(OllamaClient.extractDeltaText(fromLine: "not-json"))
    }

    func testExtractDeltaTextReturnsNilForMissingMessage() {
        let line = #"{"done":true}"#
        XCTAssertNil(OllamaClient.extractDeltaText(fromLine: line))
    }

    // MARK: host / model resolution

    func testResolveHostFallsBackToDefault() {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        suite.removeObject(forKey: OllamaClient.hostDefaultsKey)
        XCTAssertEqual(OllamaClient.resolveHost(defaults: suite), OllamaClient.defaultHost)
    }

    func testResolveHostPrefersStoredValue() {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        suite.set("http://ollama.local:11434", forKey: OllamaClient.hostDefaultsKey)
        XCTAssertEqual(OllamaClient.resolveHost(defaults: suite), "http://ollama.local:11434")
    }

    func testResolveModelReturnsEmptyWhenUnset() {
        let suite = UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
        XCTAssertEqual(OllamaClient.resolveModel(defaults: suite), "")
    }

    // MARK: Failure semantics

    func testMissingModelFailureIsNonRecoverable() {
        XCTAssertFalse(OllamaClient.Failure.missingModel.recoverable)
    }

    func testNetworkFailureIsRecoverable() {
        XCTAssertTrue(OllamaClient.Failure.network("conn refused").recoverable)
    }
}
