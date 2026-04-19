import XCTest

@testable import Loom

final class DevServerTests: XCTestCase {
    func testInstalledRuntimeProcessIsRecognizedAsReclaimableStaleServer() {
        XCTAssertTrue(
            DevServer.isReclaimableInstalledRuntimeServer(
                command: "/opt/homebrew/bin/node /Users/test/Library/Application Support/Loom/runtime/build-123/standalone/server.js",
                runtimeBasePath: "/Users/test/Library/Application Support/Loom/runtime"
            )
        )
    }

    func testInstalledRuntimeNextServerCanBeRecognizedFromItsWorkingDirectory() {
        XCTAssertTrue(
            DevServer.isReclaimableInstalledRuntimeServer(
                command: "next-server (v15.5.15)",
                runtimeBasePath: "/Users/test/Library/Application Support/Loom/runtime",
                cwdPath: "/Users/test/Library/Application Support/Loom/runtime/build-123/standalone"
            )
        )
    }

    func testRepoOrUnrelatedServersAreNotReclaimedAsInstalledRuntimeServers() {
        XCTAssertFalse(
            DevServer.isReclaimableInstalledRuntimeServer(
                command: "/opt/homebrew/bin/node /Users/test/Desktop/Wiki/node_modules/next/dist/bin/next dev -p 3001",
                runtimeBasePath: "/Users/test/Library/Application Support/Loom/runtime"
            )
        )
        XCTAssertFalse(
            DevServer.isReclaimableInstalledRuntimeServer(
                command: "/usr/bin/python3 -m http.server 3001",
                runtimeBasePath: "/Users/test/Library/Application Support/Loom/runtime"
            )
        )
    }

    func testResolvedServerModePrefersProdWhenInstalledRuntimeExistsWithoutRepoBuild() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let runtimeBase = root.appendingPathComponent("Library/Application Support/Loom/runtime", isDirectory: true)
        let installedRuntime = runtimeBase.appendingPathComponent("build-123", isDirectory: true)
        try fm.createDirectory(at: installedRuntime, withIntermediateDirectories: true)
        try Data(#"{"buildId":"build-123","runtimeRoot":"\#(installedRuntime.path)"}"#.utf8)
            .write(to: runtimeBase.appendingPathComponent("current.json"))

        XCTAssertEqual(
            DevServer.resolvedServerMode(
                projectPath: root.path,
                environment: [:],
                homeDirectory: root.path,
                fileManager: fm
            ),
            "prod"
        )
    }

    func testResolvedServerModeDoesNotDowngradeProdWhenRepoBuildExistsButInstalledRuntimeMissing() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let buildRoot = root.appendingPathComponent(".next-build", isDirectory: true)
        try fm.createDirectory(at: buildRoot, withIntermediateDirectories: true)
        try Data().write(to: buildRoot.appendingPathComponent("BUILD_ID"))

        XCTAssertEqual(
            DevServer.resolvedServerMode(
                projectPath: root.path,
                environment: [:],
                homeDirectory: root.path,
                fileManager: fm
            ),
            "prod"
        )
    }

    func testResolvedServerModeUsesDevForExplicitRepoDevContext() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        XCTAssertEqual(
            DevServer.resolvedServerMode(
                projectPath: root.path,
                environment: ["LOOM_PROJECT_ROOT": root.path],
                homeDirectory: root.path,
                fileManager: fm,
                bundlePath: "/Users/test/Library/Developer/Xcode/DerivedData/Loom/Build/Products/Debug/Loom.app"
            ),
            "dev"
        )
    }

    func testProdRuntimeLaunchUsesInstalledRuntimeRootAndSeparateContentRoot() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let projectRoot = root.appendingPathComponent("Wiki", isDirectory: true)
        try fm.createDirectory(at: projectRoot, withIntermediateDirectories: true)
        try Data().write(to: projectRoot.appendingPathComponent("package.json"))

        let runtimeBase = root.appendingPathComponent("Library/Application Support/Loom/runtime", isDirectory: true)
        let installedRuntime = runtimeBase.appendingPathComponent("build-123", isDirectory: true)
        try fm.createDirectory(at: installedRuntime, withIntermediateDirectories: true)
        try Data(#"{"buildId":"build-123","runtimeRoot":"\#(installedRuntime.path)"}"#.utf8)
            .write(to: runtimeBase.appendingPathComponent("current.json"))

        let appSupport = root.appendingPathComponent("Library/Application Support/Loom", isDirectory: true)
        try fm.createDirectory(at: appSupport, withIntermediateDirectories: true)
        try Data(#"{"contentRoot":"\#(projectRoot.path)"}"#.utf8)
            .write(to: appSupport.appendingPathComponent("content-root.json"))

        let launch = DevServer.runtimeLaunch(
            projectPath: projectRoot.path,
            port: 3001,
            serverMode: "prod",
            environment: [:],
            homeDirectory: root.path,
            fileManager: fm
        )

        XCTAssertEqual(launch.currentDirectoryPath, installedRuntime.path)
        XCTAssertEqual(launch.requiredExecutables, ["node"])
        XCTAssertEqual(launch.environment["LOOM_CONTENT_ROOT"], projectRoot.path)
        XCTAssertNil(launch.environment["LOOM_DIST_DIR"])
        XCTAssertTrue(launch.shellCommand.contains("node standalone/server.js"))
    }

    func testProdRuntimeLaunchDoesNotRequireRepoCheckoutWhenPersistedContentRootExists() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let contentRoot = root.appendingPathComponent("WikiContent", isDirectory: true)
        try fm.createDirectory(at: contentRoot, withIntermediateDirectories: true)

        let runtimeBase = root.appendingPathComponent("Library/Application Support/Loom/runtime", isDirectory: true)
        let installedRuntime = runtimeBase.appendingPathComponent("build-123", isDirectory: true)
        try fm.createDirectory(at: installedRuntime, withIntermediateDirectories: true)
        try Data(#"{"buildId":"build-123","runtimeRoot":"\#(installedRuntime.path)"}"#.utf8)
            .write(to: runtimeBase.appendingPathComponent("current.json"))

        let appSupport = root.appendingPathComponent("Library/Application Support/Loom", isDirectory: true)
        try fm.createDirectory(at: appSupport, withIntermediateDirectories: true)
        try Data(#"{"contentRoot":"\#(contentRoot.path)"}"#.utf8)
            .write(to: appSupport.appendingPathComponent("content-root.json"))

        let launch = DevServer.runtimeLaunch(
            projectPath: nil,
            port: 3001,
            serverMode: "prod",
            environment: [:],
            homeDirectory: root.path,
            fileManager: fm
        )

        XCTAssertNil(launch.launchFailureMessage)
        XCTAssertEqual(launch.currentDirectoryPath, installedRuntime.path)
        XCTAssertEqual(launch.environment["LOOM_CONTENT_ROOT"], contentRoot.path)
        XCTAssertEqual(launch.requiredExecutables, ["node"])
    }

    func testProdRuntimeLaunchFailsWhenInstalledRuntimeMissing() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let buildRoot = root.appendingPathComponent(".next-build", isDirectory: true)
        try fm.createDirectory(at: buildRoot, withIntermediateDirectories: true)
        try Data().write(to: buildRoot.appendingPathComponent("BUILD_ID"))

        let launch = DevServer.runtimeLaunch(
            projectPath: root.path,
            port: 3001,
            serverMode: "prod",
            environment: [:],
            homeDirectory: root.path,
            fileManager: fm
        )

        XCTAssertEqual(
            launch.launchFailureMessage,
            "Installed runtime missing. Rebuild and reinstall Loom."
        )
        XCTAssertTrue(launch.requiredExecutables.isEmpty)
        XCTAssertEqual(launch.currentDirectoryPath, root.path)
        XCTAssertFalse(launch.shellCommand.contains("npx next start"))
        XCTAssertFalse(launch.shellCommand.contains("npx next dev"))
        XCTAssertFalse(launch.shellCommand.contains("node scripts/dev.mjs"))
    }

    func testProdBuildSupportsWikiPagesReturnsFalseWhenBuiltPageIsMissing() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let sourceRoute = root.appendingPathComponent("app/wiki/example", isDirectory: true)
        try fm.createDirectory(at: sourceRoute, withIntermediateDirectories: true)
        try Data().write(to: sourceRoute.appendingPathComponent("page.mdx"))

        let builtRoute = root.appendingPathComponent(".next-build/server/app/wiki/example", isDirectory: true)
        try fm.createDirectory(at: builtRoute, withIntermediateDirectories: true)
        try Data().write(to: builtRoute.appendingPathComponent("page.js.nft.json"))

        XCTAssertFalse(DevServer.prodBuildSupportsWikiPages(projectPath: root.path, fileManager: fm))
    }

    func testProdBuildSupportsWikiPagesReturnsTrueWhenBuiltPagesExist() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }

        let sourceRoute = root.appendingPathComponent("app/wiki/example", isDirectory: true)
        try fm.createDirectory(at: sourceRoute, withIntermediateDirectories: true)
        try Data().write(to: sourceRoute.appendingPathComponent("page.mdx"))

        let builtRoute = root.appendingPathComponent(".next-build/server/app/wiki/example", isDirectory: true)
        try fm.createDirectory(at: builtRoute, withIntermediateDirectories: true)
        try Data().write(to: builtRoute.appendingPathComponent("page.js"))

        XCTAssertTrue(DevServer.prodBuildSupportsWikiPages(projectPath: root.path, fileManager: fm))
    }
}
