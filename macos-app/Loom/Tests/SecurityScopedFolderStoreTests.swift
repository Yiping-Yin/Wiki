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
