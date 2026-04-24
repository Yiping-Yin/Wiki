import XCTest

@testable import Loom

final class AnthropicClientTests: XCTestCase {
    // MARK: extractDeltaText — pure SSE parse

    func testExtractDeltaTextReturnsTextForContentBlockDelta() {
        let event = #"""
event: content_block_delta
data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}
"""#
        XCTAssertEqual(AnthropicClient.extractDeltaText(eventBuffer: event), "hi")
    }

    func testExtractDeltaTextIgnoresNonTextDeltas() {
        XCTAssertNil(AnthropicClient.extractDeltaText(eventBuffer: "event: message_start\ndata: {\"type\":\"message_start\"}"))
        XCTAssertNil(AnthropicClient.extractDeltaText(eventBuffer: "data: [DONE]"))
        XCTAssertNil(AnthropicClient.extractDeltaText(eventBuffer: "data: not-json"))
        XCTAssertNil(AnthropicClient.extractDeltaText(eventBuffer: ": comment only"))
    }

    func testExtractDeltaTextHandlesInputJsonDeltaAsNil() {
        let event = "data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\"}}"
        XCTAssertNil(AnthropicClient.extractDeltaText(eventBuffer: event))
    }

    // MARK: Failure semantics

    func testMissingKeyFailureIsNonRecoverable() {
        XCTAssertFalse(AnthropicClient.Failure.missingKey.recoverable)
    }

    func testHttpFailureRecoverabilityReflectsStatus() {
        XCTAssertTrue(AnthropicClient.Failure.http(status: 429, body: "", recoverable: true).recoverable)
        XCTAssertFalse(AnthropicClient.Failure.http(status: 400, body: "", recoverable: false).recoverable)
        XCTAssertTrue(AnthropicClient.Failure.http(status: 503, body: "", recoverable: true).recoverable)
    }

    func testDecodingFailureIsNonRecoverable() {
        XCTAssertFalse(AnthropicClient.Failure.decoding("bad").recoverable)
    }

    // MARK: send — missing key path

    func testSendThrowsMissingKeyWhenNoSourcesProvide() async {
        // Isolate from process env by unsetting for the duration of the call.
        let previousKey = ProcessInfo.processInfo.environment["ANTHROPIC_API_KEY"]
        unsetenv("ANTHROPIC_API_KEY")
        defer {
            if let previousKey { setenv("ANTHROPIC_API_KEY", previousKey, 1) }
        }

        class EmptyKeychain: KeychainBackend {
            func copyMatching(_ query: [String: Any]) -> (OSStatus, CFTypeRef?) { (errSecItemNotFound, nil) }
            func add(_ attributes: [String: Any]) -> OSStatus { errSecSuccess }
            func update(query: [String: Any], attributes: [String: Any]) -> OSStatus { errSecSuccess }
            func delete(_ query: [String: Any]) -> OSStatus { errSecSuccess }
        }

        do {
            _ = try await AnthropicClient.send(prompt: "hi", keychain: EmptyKeychain())
            XCTFail("expected missingKey failure")
        } catch let failure as AnthropicClient.Failure {
            XCTAssertEqual(failure, .missingKey)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }

    // MARK: send — non-streaming success via fake URLSession

    func testSendReturnsJoinedTextForSuccessfulNonStreamingResponse() async throws {
        let body = """
        {"content":[{"type":"text","text":"one "},{"type":"text","text":"two"}]}
        """.data(using: .utf8)!
        let session = fakeSession(returning: body, status: 200)

        var opts = AnthropicClient.Options()
        opts.apiKey = "sk-test"
        let text = try await AnthropicClient.send(prompt: "hi", options: opts, session: session)
        XCTAssertEqual(text, "one two")
    }

    // MARK: helpers

    private func fakeSession(returning body: Data, status: Int) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [StubProtocol.self]
        StubProtocol.stub = (status: status, body: body)
        return URLSession(configuration: config)
    }
}

/// URLProtocol stub so tests can drive a canned response through a real
/// `URLSession` without reaching the network.
private final class StubProtocol: URLProtocol {
    static var stub: (status: Int, body: Data)?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let stub = StubProtocol.stub,
              let url = request.url else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: "StubProtocol", code: 0))
            return
        }
        let response = HTTPURLResponse(
            url: url,
            statusCode: stub.status,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
