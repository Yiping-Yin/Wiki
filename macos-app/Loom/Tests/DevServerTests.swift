import XCTest

@testable import Loom

final class DevServerTests: XCTestCase {
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
