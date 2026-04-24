import XCTest

@testable import Loom

final class OpenAIClientTests: XCTestCase {
    // MARK: extractDeltaText — Chat completions streaming shape

    func testExtractDeltaTextReturnsContentFromChoicesDelta() {
        let json = #"{"choices":[{"delta":{"content":"hi"}}]}"#
        XCTAssertEqual(OpenAIClient.extractDeltaText(fromDataLine: json), "hi")
    }

    func testExtractDeltaTextReturnsNilForEmptyOrDone() {
        XCTAssertNil(OpenAIClient.extractDeltaText(fromDataLine: ""))
        XCTAssertNil(OpenAIClient.extractDeltaText(fromDataLine: "[DONE]"))
    }

    func testExtractDeltaTextReturnsNilForMalformedJson() {
        XCTAssertNil(OpenAIClient.extractDeltaText(fromDataLine: "not-json"))
    }

    func testExtractDeltaTextIgnoresDeltasWithoutContent() {
        let json = #"{"choices":[{"delta":{"role":"assistant"}}]}"#
        XCTAssertNil(OpenAIClient.extractDeltaText(fromDataLine: json))
    }

    // MARK: Failure semantics

    func testMissingKeyFailureIsNonRecoverable() {
        XCTAssertFalse(OpenAIClient.Failure.missingKey.recoverable)
    }

    func testHttpFailureRecoverabilityReflectsStatus() {
        XCTAssertTrue(OpenAIClient.Failure.http(status: 429, body: "", recoverable: true).recoverable)
        XCTAssertFalse(OpenAIClient.Failure.http(status: 400, body: "", recoverable: false).recoverable)
        XCTAssertTrue(OpenAIClient.Failure.http(status: 503, body: "", recoverable: true).recoverable)
    }

    // MARK: send — missing key path

    func testSendThrowsMissingKeyWhenNoSourcesProvide() async {
        let previousKey = ProcessInfo.processInfo.environment["OPENAI_API_KEY"]
        unsetenv("OPENAI_API_KEY")
        defer {
            if let previousKey { setenv("OPENAI_API_KEY", previousKey, 1) }
        }

        class EmptyKeychain: KeychainBackend {
            func copyMatching(_ query: [String: Any]) -> (OSStatus, CFTypeRef?) { (errSecItemNotFound, nil) }
            func add(_ attributes: [String: Any]) -> OSStatus { errSecSuccess }
            func update(query: [String: Any], attributes: [String: Any]) -> OSStatus { errSecSuccess }
            func delete(_ query: [String: Any]) -> OSStatus { errSecSuccess }
        }

        do {
            _ = try await OpenAIClient.send(prompt: "hi", keychain: EmptyKeychain())
            XCTFail("expected missingKey failure")
        } catch let failure as OpenAIClient.Failure {
            XCTAssertEqual(failure, .missingKey)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }

    // MARK: send — non-streaming success via fake URLSession

    func testSendReturnsJoinedTextForSuccessfulNonStreamingResponse() async throws {
        let body = """
        {"choices":[{"message":{"role":"assistant","content":"one two"}}]}
        """.data(using: .utf8)!
        let session = fakeSession(returning: body, status: 200)

        var opts = OpenAIClient.Options()
        opts.apiKey = "sk-test"
        let text = try await OpenAIClient.send(prompt: "hi", options: opts, session: session)
        XCTAssertEqual(text, "one two")
    }

    // MARK: helpers

    private func fakeSession(returning body: Data, status: Int) -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [OpenAIStubProtocol.self]
        OpenAIStubProtocol.stub = (status: status, body: body)
        return URLSession(configuration: config)
    }
}

private final class OpenAIStubProtocol: URLProtocol {
    static var stub: (status: Int, body: Data)?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let stub = OpenAIStubProtocol.stub,
              let url = request.url else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: "OpenAIStub", code: 0))
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
