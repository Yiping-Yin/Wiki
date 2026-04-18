import XCTest
@testable import Loom

final class DevServerPreflightTests: XCTestCase {
    func testMissingDependencyMessageSuggestsNpmInstall() {
        let message = DevServerPreflight.missingDependencyMessage(
            projectPath: "/Users/test/My Wiki",
            fileExists: { path in
                path == "/Users/test/My Wiki/package.json"
            }
        )

        XCTAssertEqual(
            message,
            """
            Missing Next.js runtime dependencies.
            Run `cd "/Users/test/My Wiki" && npm install`, then reopen Loom or click Retry.
            """
        )
    }

    func testMissingDependencyMessageReturnsNilWhenNextBinaryExists() {
        let message = DevServerPreflight.missingDependencyMessage(
            projectPath: "/Users/test/My Wiki",
            fileExists: { path in
                path == "/Users/test/My Wiki/package.json"
                    || path == "/Users/test/My Wiki/node_modules/next/dist/bin/next"
            }
        )

        XCTAssertNil(message)
    }

    func testMissingDependencyMessageReturnsNilOutsideProjectRoot() {
        let message = DevServerPreflight.missingDependencyMessage(
            projectPath: "/Users/test/Nowhere",
            fileExists: { _ in false }
        )

        XCTAssertNil(message)
    }

    func testMissingExecutableMessageSuggestsInstallingNode() {
        let message = DevServerPreflight.missingExecutableMessage(
            requiredExecutables: ["node"],
            environment: ["PATH": "/opt/homebrew/bin:/usr/bin"],
            isExecutable: { _ in false }
        )

        XCTAssertEqual(
            message,
            """
            Missing required command-line tool: node.
            Install Node.js so `node` is available in Terminal, then reopen Loom or click Retry.
            """
        )
    }

    func testMissingExecutableMessageReturnsNilWhenExecutablesExist() {
        let message = DevServerPreflight.missingExecutableMessage(
            requiredExecutables: ["node", "npx"],
            environment: ["PATH": "/opt/homebrew/bin:/usr/bin"],
            isExecutable: { path in
                path == "/opt/homebrew/bin/node" || path == "/opt/homebrew/bin/npx"
            }
        )

        XCTAssertNil(message)
    }

    func testMissingExecutableMessageFindsExecutableInFallbackDirectory() {
        let message = DevServerPreflight.missingExecutableMessage(
            requiredExecutables: ["npx"],
            environment: ["PATH": "/usr/bin:/bin"],
            fallbackDirectories: ["/opt/homebrew/bin"],
            isExecutable: { path in
                path == "/opt/homebrew/bin/npx"
            }
        )

        XCTAssertNil(message)
    }

    func testEnrichedPathAppendsFallbackDirectoriesWithoutDuplicates() {
        let path = DevServerPreflight.enrichedPATH(
            environment: ["PATH": "/usr/bin:/opt/homebrew/bin:/bin"],
            fallbackDirectories: ["/opt/homebrew/bin", "/usr/local/bin"]
        )

        XCTAssertEqual(
            path,
            "/usr/bin:/opt/homebrew/bin:/bin:/usr/local/bin"
        )
    }
}
