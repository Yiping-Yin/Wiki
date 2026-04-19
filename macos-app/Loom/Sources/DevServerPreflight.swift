import Foundation

enum DevServerPreflight {
    static var fallbackExecutableDirectories: [String] {
        [
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/local/bin",
            "/usr/local/sbin",
            "/Library/Frameworks/Node.framework/Versions/Current/bin",
            NSHomeDirectory() + "/.local/bin",
            NSHomeDirectory() + "/bin",
        ]
    }

    static func missingExecutableMessage(
        requiredExecutables: [String],
        environment: [String: String] = ProcessInfo.processInfo.environment,
        fallbackDirectories: [String] = DevServerPreflight.fallbackExecutableDirectories,
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) -> String? {
        var missing: [String] = []

        for executable in requiredExecutables where !missing.contains(executable) {
            guard locateExecutable(
                named: executable,
                pathEnvironment: enrichedPATH(
                    environment: environment,
                    fallbackDirectories: fallbackDirectories
                ),
                isExecutable: isExecutable
            ) == nil else {
                continue
            }
            missing.append(executable)
        }

        guard !missing.isEmpty else { return nil }

        let noun = missing.count == 1 ? "tool" : "tools"
        let verb = missing.count == 1 ? "is" : "are"
        let missingList = missing.joined(separator: ", ")
        let quotedList = naturalLanguageList(missing.map { "`\($0)`" })

        return """
        Missing required command-line \(noun): \(missingList).
        Install Node.js so \(quotedList) \(verb) available in Terminal, then reopen Loom or click Retry.
        """
    }

    static func missingDependencyMessage(
        projectPath: String,
        requiresProjectDependencies: Bool = true,
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> String? {
        guard requiresProjectDependencies else { return nil }
        let packageJSONPath = "\(projectPath)/package.json"
        let nextBinaryPath = "\(projectPath)/node_modules/next/dist/bin/next"
        guard fileExists(packageJSONPath) else { return nil }
        guard !fileExists(nextBinaryPath) else { return nil }
        return """
        Missing Next.js runtime dependencies.
        Run `cd \(shellQuoted(projectPath)) && npm install`, then reopen Loom or click Retry.
        """
    }

    static func enrichedPATH(
        environment: [String: String] = ProcessInfo.processInfo.environment,
        fallbackDirectories: [String] = DevServerPreflight.fallbackExecutableDirectories
    ) -> String {
        searchDirectories(
            pathEnvironment: environment["PATH"] ?? "",
            fallbackDirectories: fallbackDirectories
        ).joined(separator: ":")
    }

    private static func shellQuoted(_ path: String) -> String {
        "\"" + path.replacingOccurrences(of: "\"", with: "\\\"") + "\""
    }

    private static func searchDirectories(
        pathEnvironment: String,
        fallbackDirectories: [String]
    ) -> [String] {
        var ordered: [String] = []
        var seen = Set<String>()

        for directory in pathEnvironment.split(separator: ":").map(String.init) where !directory.isEmpty {
            if seen.insert(directory).inserted {
                ordered.append(directory)
            }
        }

        for directory in fallbackDirectories where !directory.isEmpty {
            if seen.insert(directory).inserted {
                ordered.append(directory)
            }
        }

        return ordered
    }

    private static func locateExecutable(
        named executable: String,
        pathEnvironment: String,
        isExecutable: (String) -> Bool
    ) -> String? {
        for directory in pathEnvironment.split(separator: ":").map(String.init) where !directory.isEmpty {
            let candidate = URL(fileURLWithPath: directory).appendingPathComponent(executable).path
            if isExecutable(candidate) {
                return candidate
            }
        }
        return nil
    }

    private static func naturalLanguageList(_ items: [String]) -> String {
        switch items.count {
        case 0:
            return ""
        case 1:
            return items[0]
        case 2:
            return items[0] + " and " + items[1]
        default:
            return items.dropLast().joined(separator: ", ") + ", and " + items.last!
        }
    }
}
