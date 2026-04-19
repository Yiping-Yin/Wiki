import XCTest

@testable import Loom

final class LoomRuntimePathsTests: XCTestCase {
    func testResolveInstalledRuntimeRootPrefersActivationRecord() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let runtimeDir = root.appendingPathComponent("Library/Application Support/Loom/runtime", isDirectory: true)
        try fm.createDirectory(at: runtimeDir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let activeRoot = runtimeDir.appendingPathComponent("build-123", isDirectory: true)
        try fm.createDirectory(at: activeRoot, withIntermediateDirectories: true)
        try Data(#"{"buildId":"build-123","runtimeRoot":"\#(activeRoot.path)"}"#.utf8)
            .write(to: runtimeDir.appendingPathComponent("current.json"))

        XCTAssertEqual(
            LoomRuntimePaths.resolveInstalledRuntimeRoot(homeDirectory: root.path),
            activeRoot.path
        )
    }

    func testResolveContentRootPrefersEnvOverrideThenPersistedConfig() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let appSupport = root.appendingPathComponent("Library/Application Support/Loom", isDirectory: true)
        try fm.createDirectory(at: appSupport, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        try Data(#"{"contentRoot":"/persisted/wiki"}"#.utf8)
            .write(to: appSupport.appendingPathComponent("content-root.json"))

        XCTAssertEqual(
            LoomRuntimePaths.resolveContentRoot(
                env: ["LOOM_CONTENT_ROOT": "/env/wiki"],
                homeDirectory: root.path
            ),
            "/env/wiki"
        )

        XCTAssertEqual(
            LoomRuntimePaths.resolveContentRoot(
                env: [:],
                homeDirectory: root.path
            ),
            "/persisted/wiki"
        )
    }
}
