import Foundation

private struct RuntimeActivation: Decodable {
    let buildId: String?
    let runtimeRoot: String?
}

private struct ContentRootConfig: Decodable {
    let contentRoot: String?
}

enum LoomRuntimePaths {
    static func appSupportRoot(homeDirectory: String = NSHomeDirectory()) -> String {
        "\(homeDirectory)/Library/Application Support/Loom"
    }

    static func resolveInstalledRuntimeRoot(
        env: [String: String] = ProcessInfo.processInfo.environment,
        homeDirectory: String = NSHomeDirectory(),
        fileManager: FileManager = .default
    ) -> String? {
        if let override = trimmed(env["LOOM_RUNTIME_ROOT"]) {
            return override
        }

        let activationPath = appSupportRoot(homeDirectory: homeDirectory) + "/runtime/current.json"
        guard let activation = decode(RuntimeActivation.self, from: activationPath, fileManager: fileManager) else {
            return nil
        }

        if let runtimeRoot = trimmed(activation.runtimeRoot), directoryExists(runtimeRoot, fileManager: fileManager) {
            return runtimeRoot
        }

        if let buildId = trimmed(activation.buildId) {
            let derivedRoot = appSupportRoot(homeDirectory: homeDirectory) + "/runtime/" + buildId
            if directoryExists(derivedRoot, fileManager: fileManager) {
                return derivedRoot
            }
        }

        return nil
    }

    static func resolveContentRoot(
        env: [String: String] = ProcessInfo.processInfo.environment,
        homeDirectory: String = NSHomeDirectory(),
        fileManager: FileManager = .default
    ) -> String? {
        if let override = trimmed(env["LOOM_CONTENT_ROOT"]) {
            return override
        }

        let configPath = appSupportRoot(homeDirectory: homeDirectory) + "/content-root.json"
        let config = decode(ContentRootConfig.self, from: configPath, fileManager: fileManager)
        return trimmed(config?.contentRoot)
    }

    private static func trimmed(_ value: String?) -> String? {
        let trimmedValue = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedValue?.isEmpty == false ? trimmedValue : nil
    }

    private static func decode<T: Decodable>(
        _ type: T.Type,
        from path: String,
        fileManager: FileManager
    ) -> T? {
        guard let data = fileManager.contents(atPath: path) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    private static func directoryExists(_ path: String, fileManager: FileManager) -> Bool {
        var isDirectory: ObjCBool = false
        return fileManager.fileExists(atPath: path, isDirectory: &isDirectory) && isDirectory.boolValue
    }
}
