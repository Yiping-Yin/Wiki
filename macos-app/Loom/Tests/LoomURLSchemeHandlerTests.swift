import XCTest
import WebKit

@testable import Loom

final class LoomURLSchemeHandlerTests: XCTestCase {
    private func makeRoot() throws -> URL {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        return root.standardizedFileURL
    }

    // MARK: resolve()

    func testResolveRejectsNonLoomScheme() throws {
        let root = try makeRoot()
        let url = URL(string: "https://content/foo")!
        XCTAssertNil(LoomURLSchemeHandler.resolve(url, under: root))
    }

    func testResolveRejectsUnknownHost() throws {
        let root = try makeRoot()
        let url = URL(string: "loom://api/chat")!
        XCTAssertNil(LoomURLSchemeHandler.resolve(url, under: root))
    }

    func testResolveRejectsEmptyPath() throws {
        let root = try makeRoot()
        let url = URL(string: "loom://content/")!
        XCTAssertNil(LoomURLSchemeHandler.resolve(url, under: root))
    }

    func testResolveMapsContentPathToRoot() throws {
        let root = try makeRoot()
        let url = URL(string: "loom://content/wiki/llm101n.html")!
        let resolved = LoomURLSchemeHandler.resolve(url, under: root)
        XCTAssertEqual(
            resolved?.path,
            root.appendingPathComponent("wiki/llm101n.html").standardizedFileURL.path
        )
    }

    func testResolveRejectsParentTraversal() throws {
        let root = try makeRoot()
        let url = URL(string: "loom://content/../etc/passwd")!
        XCTAssertNil(LoomURLSchemeHandler.resolve(url, under: root))
    }

    func testResolveRejectsEscapeViaNestedDotDot() throws {
        let root = try makeRoot()
        let url = URL(string: "loom://content/wiki/../../escape")!
        XCTAssertNil(LoomURLSchemeHandler.resolve(url, under: root))
    }

    func testResolveHandlesNestedRelativePathsThatStayInsideRoot() throws {
        let root = try makeRoot()
        let url = URL(string: "loom://content/knowledge/INFS3822/Week01/slides.html")!
        let resolved = LoomURLSchemeHandler.resolve(url, under: root)
        XCTAssertNotNil(resolved)
        XCTAssertTrue(resolved!.path.hasPrefix(root.path + "/"))
    }

    func testResolveRoutesByHostWhenMultipleRootsRegistered() throws {
        let contentRoot = try makeRoot()
        let bundleRoot = try makeRoot()
        let hostRoots = ["content": contentRoot, "bundle": bundleRoot]

        let contentHit = LoomURLSchemeHandler.resolve(
            URL(string: "loom://content/a.html")!,
            hostRoots: hostRoots
        )
        XCTAssertEqual(contentHit?.path, contentRoot.appendingPathComponent("a.html").standardizedFileURL.path)

        let bundleHit = LoomURLSchemeHandler.resolve(
            URL(string: "loom://bundle/b.html")!,
            hostRoots: hostRoots
        )
        XCTAssertEqual(bundleHit?.path, bundleRoot.appendingPathComponent("b.html").standardizedFileURL.path)
    }

    func testResolveReturnsNilForHostNotInMap() throws {
        let contentRoot = try makeRoot()
        let hostRoots = ["content": contentRoot]
        XCTAssertNil(LoomURLSchemeHandler.resolve(
            URL(string: "loom://asset/chunk.js")!,
            hostRoots: hostRoots
        ))
    }

    // MARK: mimeType()

    func testMimeTypeHandlesCommonExtensions() {
        XCTAssertEqual(LoomURLSchemeHandler.mimeType(for: URL(string: "file:///foo.js")!), "application/javascript; charset=utf-8")
        XCTAssertEqual(LoomURLSchemeHandler.mimeType(for: URL(string: "file:///foo.css")!), "text/css; charset=utf-8")
        XCTAssertEqual(LoomURLSchemeHandler.mimeType(for: URL(string: "file:///foo.html")!), "text/html; charset=utf-8")
        XCTAssertEqual(LoomURLSchemeHandler.mimeType(for: URL(string: "file:///foo.json")!), "application/json; charset=utf-8")
        XCTAssertEqual(LoomURLSchemeHandler.mimeType(for: URL(string: "file:///foo.svg")!), "image/svg+xml")
        XCTAssertEqual(LoomURLSchemeHandler.mimeType(for: URL(string: "file:///foo.woff2")!), "font/woff2")
    }

    func testMimeTypeFallsBackToOctetStreamForUnknown() {
        XCTAssertEqual(
            LoomURLSchemeHandler.mimeType(for: URL(string: "file:///foo.loomsecret")!),
            "application/octet-stream"
        )
    }

    // MARK: end-to-end WKURLSchemeTask spin

    func testEndToEndServesRealFileWithCorrectMime() throws {
        let root = try makeRoot()
        let htmlURL = root.appendingPathComponent("hello.html")
        let body = "<p>hello loom</p>"
        try body.write(to: htmlURL, atomically: true, encoding: .utf8)

        let handler = LoomURLSchemeHandler(contentRoot: root)
        let task = FakeSchemeTask(requestURL: URL(string: "loom://content/hello.html")!)
        handler.webView(WKWebView(), start: task)

        XCTAssertEqual(task.receivedData, Data(body.utf8))
        XCTAssertTrue(task.finished)
        XCTAssertEqual((task.response as? HTTPURLResponse)?.statusCode, 200)
        XCTAssertEqual(
            (task.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type"),
            "text/html; charset=utf-8"
        )
    }

    func testEndToEndAddsCORSHeaderForCrossHostWebFetches() throws {
        let root = try makeRoot()
        let jsonURL = root.appendingPathComponent("knowledge/.cache/manifest/knowledge-nav.json")
        try FileManager.default.createDirectory(
            at: jsonURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try #"{"knowledgeCategories":[]}"#.write(to: jsonURL, atomically: true, encoding: .utf8)

        let handler = LoomURLSchemeHandler(contentRoot: root)
        let task = FakeSchemeTask(requestURL: URL(string: "loom://content/knowledge/.cache/manifest/knowledge-nav.json")!)
        handler.webView(WKWebView(), start: task)

        XCTAssertEqual((task.response as? HTTPURLResponse)?.statusCode, 200)
        XCTAssertEqual(
            (task.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Access-Control-Allow-Origin"),
            "*"
        )
    }

    func testEndToEndServesFromBundleHostWhenRegistered() throws {
        let contentRoot = try makeRoot()
        let bundleRoot = try makeRoot()
        let probe = "<p>bundle probe</p>"
        try probe.write(
            to: bundleRoot.appendingPathComponent("probe.html"),
            atomically: true,
            encoding: .utf8
        )

        let handler = LoomURLSchemeHandler(hostRoots: [
            "content": contentRoot,
            "bundle": bundleRoot,
        ])
        let task = FakeSchemeTask(requestURL: URL(string: "loom://bundle/probe.html")!)
        handler.webView(WKWebView(), start: task)

        XCTAssertEqual(task.receivedData, Data(probe.utf8))
        XCTAssertEqual((task.response as? HTTPURLResponse)?.statusCode, 200)
    }

    func testEndToEnd404WhenFileMissing() throws {
        let root = try makeRoot()
        let handler = LoomURLSchemeHandler(contentRoot: root)
        let task = FakeSchemeTask(requestURL: URL(string: "loom://content/missing.html")!)
        handler.webView(WKWebView(), start: task)

        XCTAssertEqual((task.response as? HTTPURLResponse)?.statusCode, 404)
        XCTAssertTrue(task.finished)
    }

    func testEndToEnd404WhenPathTraversalAttempted() throws {
        let root = try makeRoot()
        let handler = LoomURLSchemeHandler(contentRoot: root)
        let task = FakeSchemeTask(requestURL: URL(string: "loom://content/../escape")!)
        handler.webView(WKWebView(), start: task)

        XCTAssertEqual((task.response as? HTTPURLResponse)?.statusCode, 404)
    }

    // MARK: native loader

    func testNativeLoaderReadsContentHostData() throws {
        let root = try makeRoot()
        let manifestDir = root.appendingPathComponent("knowledge/.cache/manifest", isDirectory: true)
        try FileManager.default.createDirectory(at: manifestDir, withIntermediateDirectories: true)

        let payload = #"{"knowledgeCategories":[{"slug":"docs","label":"Docs","count":2}]}"#
        let manifestURL = manifestDir.appendingPathComponent("knowledge-nav.json")
        try payload.write(to: manifestURL, atomically: true, encoding: .utf8)

        let data = try LoomLocalResourceLoader.data(
            from: XCTUnwrap(URL(string: "loom://content/knowledge/.cache/manifest/knowledge-nav.json")),
            hostRoots: ["content": root]
        )

        XCTAssertEqual(String(decoding: data, as: UTF8.self), payload)
    }

    func testNativeLoaderReadsBundleHostData() throws {
        let root = try makeRoot()
        let payload = #"{"index":{"storedFields":{}}}"#
        let file = root.appendingPathComponent("search-index.json")
        try payload.write(to: file, atomically: true, encoding: .utf8)

        let data = try LoomLocalResourceLoader.data(
            from: XCTUnwrap(URL(string: "loom://bundle/search-index.json")),
            hostRoots: ["bundle": root]
        )

        XCTAssertEqual(String(decoding: data, as: UTF8.self), payload)
    }

    func testNativeLoaderThrowsMissingFileError() throws {
        let root = try makeRoot()

        XCTAssertThrowsError(
            try LoomLocalResourceLoader.data(
                from: XCTUnwrap(URL(string: "loom://content/missing.json")),
                hostRoots: ["content": root]
            )
        ) { error in
            XCTAssertEqual(
                error as? LoomLocalResourceLoader.LoadError,
                .missingFile(root.appendingPathComponent("missing.json").path)
            )
        }
    }
}

private final class FakeSchemeTask: NSObject, WKURLSchemeTask {
    let request: URLRequest
    private(set) var response: URLResponse?
    private(set) var receivedData: Data = Data()
    private(set) var finished = false
    private(set) var failure: Error?

    init(requestURL: URL) {
        self.request = URLRequest(url: requestURL)
    }

    func didReceive(_ response: URLResponse) {
        self.response = response
    }

    func didReceive(_ data: Data) {
        self.receivedData.append(data)
    }

    func didFinish() {
        finished = true
    }

    func didFailWithError(_ error: Error) {
        failure = error
    }
}
