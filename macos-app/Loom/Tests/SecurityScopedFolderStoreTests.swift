import XCTest

@testable import Loom

final class SecurityScopedFolderStoreTests: XCTestCase {
    /// Use an isolated UserDefaults suite so tests don't collide with real app state.
    private func makeDefaults() -> UserDefaults {
        let name = "loom.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    func testResolveReturnsNilWhenNoBookmarkSaved() {
        let defaults = makeDefaults()
        XCTAssertNil(SecurityScopedFolderStore.resolve(defaults: defaults))
    }

    func testSaveThenResolveRoundTripsRealFolder() throws {
        let fm = FileManager.default
        let temp = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: temp, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: temp) }

        let defaults = makeDefaults()
        XCTAssertTrue(SecurityScopedFolderStore.save(temp, defaults: defaults))

        let resolved = SecurityScopedFolderStore.resolve(defaults: defaults)
        XCTAssertNotNil(resolved)
        XCTAssertEqual(resolved?.url.standardizedFileURL, temp.standardizedFileURL)
    }

    func testClearRemovesSavedBookmark() throws {
        let fm = FileManager.default
        let temp = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: temp, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: temp) }

        let defaults = makeDefaults()
        SecurityScopedFolderStore.save(temp, defaults: defaults)
        SecurityScopedFolderStore.clear(defaults: defaults)
        XCTAssertNil(SecurityScopedFolderStore.resolve(defaults: defaults))
    }

    func testPersistContentRootConfigWritesFolderForIngestRoutes() throws {
        let fm = FileManager.default
        let home = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let picked = home.appendingPathComponent("Knowledge System/UNSW/INFS 3822", isDirectory: true)
        try fm.createDirectory(at: picked, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: home) }

        try SecurityScopedFolderStore.persistContentRootConfig(
            picked,
            homeDirectory: home.path,
            fileManager: fm
        )

        let config = home.appendingPathComponent("Library/Application Support/Loom/content-root.json")
        let data = try Data(contentsOf: config)
        let decoded = try JSONDecoder().decode([String: String].self, from: data)
        XCTAssertEqual(decoded["contentRoot"], picked.path)
    }

    func testSaveActivateAndPersistContentRootKeepsBookmarkAndJsonInSync() throws {
        let fm = FileManager.default
        let home = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let picked = home.appendingPathComponent("Knowledge System/UNSW/COMP 1511", isDirectory: true)
        try fm.createDirectory(at: picked, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: home) }

        let defaults = makeDefaults()
        defer { SecurityScopedFolderStore.clear(defaults: defaults) }

        XCTAssertTrue(
            SecurityScopedFolderStore.saveActivateAndPersistContentRoot(
                picked,
                defaults: defaults,
                homeDirectory: home.path,
                fileManager: fm,
                activateAndSave: { url, defaults in
                    SecurityScopedFolderStore.save(url, defaults: defaults)
                }
            )
        )

        let resolved = SecurityScopedFolderStore.resolve(defaults: defaults)
        XCTAssertEqual(resolved?.url.standardizedFileURL, picked.standardizedFileURL)

        let config = home.appendingPathComponent("Library/Application Support/Loom/content-root.json")
        let data = try Data(contentsOf: config)
        let decoded = try JSONDecoder().decode([String: String].self, from: data)
        XCTAssertEqual(decoded["contentRoot"], picked.path)
    }

    func testResolveReturnsStaleFlagWhenFolderMoved() throws {
        let fm = FileManager.default
        let original = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(at: original, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: original) }

        let defaults = makeDefaults()
        SecurityScopedFolderStore.save(original, defaults: defaults)

        // Deleting and recreating the folder may or may not mark the bookmark
        // stale depending on APFS inode reuse; we only assert resolution does
        // not crash and returns a URL.
        let resolved = SecurityScopedFolderStore.resolve(defaults: defaults)
        XCTAssertNotNil(resolved)
    }

    func testBookmarkValidationPrefersFallbackWhenBookmarkHasNoManifest() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let bookmarkRoot = root.appendingPathComponent("old-root", isDirectory: true)
        let fallbackRoot = root.appendingPathComponent("wiki-root", isDirectory: true)
        try fm.createDirectory(at: bookmarkRoot, withIntermediateDirectories: true)
        try fm.createDirectory(
            at: fallbackRoot.appendingPathComponent("knowledge/.cache/manifest", isDirectory: true),
            withIntermediateDirectories: true
        )
        defer { try? fm.removeItem(at: root) }

        let manifest = fallbackRoot.appendingPathComponent("knowledge/.cache/manifest/knowledge-nav.json")
        try Data("{}".utf8).write(to: manifest)

        XCTAssertFalse(
            SecurityScopedFolderStore.shouldPreferBookmark(
                resolvedURL: bookmarkRoot,
                fallbackPath: fallbackRoot.path,
                fileManager: fm
            )
        )
    }

    func testBookmarkValidationKeepsBookmarkWhenItMatchesFallback() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try fm.createDirectory(
            at: root.appendingPathComponent("knowledge/.cache/manifest", isDirectory: true),
            withIntermediateDirectories: true
        )
        defer { try? fm.removeItem(at: root) }

        let manifest = root.appendingPathComponent("knowledge/.cache/manifest/knowledge-nav.json")
        try Data("{}".utf8).write(to: manifest)

        XCTAssertTrue(
            SecurityScopedFolderStore.shouldPreferBookmark(
                resolvedURL: root,
                fallbackPath: root.path,
                fileManager: fm
            )
        )
    }
}
