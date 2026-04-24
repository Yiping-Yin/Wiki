import Foundation

/// Subprocess-based AI runtime. Generic wrapper for shell-spawned CLIs
/// (`claude`, `codex`, or any future OpenAI-compatible shell tool).
///
/// **Sandbox caveat**: `Process.launch()` under `com.apple.security.app-sandbox`
/// can only spawn executables inside the `.app` bundle. Users running an
/// App Store build will see a clean error when they try this path; the
/// Settings UI surfaces that the provider is Developer-ID-only. Dev
/// builds + Developer-ID-signed builds work normally.
enum CLIRuntimeClient {
    struct Options {
        /// Well-known CLI flavor. Drives argument formatting.
        var flavor: Flavor = .claude
        /// Absolute path to the binary. Caller usually fills this from
        /// DevServerPreflight's PATH search.
        var binaryPath: String = ""
        /// Extra argv prepended to the flavor-specific args.
        var extraArgs: [String] = []
        /// Environment overrides layered on top of the parent process env.
        var environment: [String: String] = [:]
        var timeout: TimeInterval = 120
        var onChunk: ((String) -> Void)? = nil

        init() {}
    }

    enum Flavor {
        case claude
        case codex
    }

    enum Failure: Error, LocalizedError, Equatable {
        case missingBinary(String)
        case spawnFailed(String)
        case nonZeroExit(code: Int32, stderr: String)
        case sandboxDenied
        case timedOut(TimeInterval)
        case cancelled

        var errorDescription: String? {
            switch self {
            case .missingBinary(let path):
                return "CLI binary not found at \(path). Install `claude` / `codex`, or switch to an HTTPS provider in Settings."
            case .spawnFailed(let message):
                return "CLI spawn failed: \(message)"
            case .nonZeroExit(let code, let stderr):
                return "CLI exited with code \(code): \(stderr.prefix(400))"
            case .sandboxDenied:
                return "Loom's sandbox blocked the CLI launch. This provider only works in Developer-ID builds (not App Store)."
            case .timedOut(let seconds):
                return "CLI timed out after \(Int(seconds))s."
            case .cancelled:
                return "CLI request cancelled."
            }
        }

        var recoverable: Bool {
            switch self {
            case .timedOut, .cancelled: return true
            default: return false
            }
        }
    }

    static func send(
        prompt: String,
        options: Options = Options()
    ) async throws -> String {
        let binary = options.binaryPath.isEmpty
            ? try resolveDefaultBinary(for: options.flavor)
            : options.binaryPath

        guard FileManager.default.isExecutableFile(atPath: binary) else {
            throw Failure.missingBinary(binary)
        }

        let args = buildArgs(flavor: options.flavor, extra: options.extraArgs)

        let task = Process()
        task.executableURL = URL(fileURLWithPath: binary)
        task.arguments = args

        var env = ProcessInfo.processInfo.environment
        env["NO_COLOR"] = "1"
        env.merge(options.environment) { _, new in new }
        task.environment = env

        let stdinPipe = Pipe()
        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        task.standardInput = stdinPipe
        task.standardOutput = stdoutPipe
        task.standardError = stderrPipe

        do {
            try task.run()
        } catch CocoaError.fileWriteNoPermission,
                CocoaError.fileReadNoPermission {
            throw Failure.sandboxDenied
        } catch {
            let desc = error.localizedDescription
            if desc.lowercased().contains("sandbox") {
                throw Failure.sandboxDenied
            }
            throw Failure.spawnFailed(desc)
        }

        // Write prompt to stdin and close — the claude/codex flavors both
        // accept the prompt either via argv (with a flag) or via stdin;
        // stdin is safer for long prompts.
        stdinPipe.fileHandleForWriting.write(Data(prompt.utf8))
        try? stdinPipe.fileHandleForWriting.close()

        let onChunk = options.onChunk
        let streamBuffer = StreamBuffer()
        if onChunk != nil {
            stdoutPipe.fileHandleForReading.readabilityHandler = { handle in
                let data = handle.availableData
                guard !data.isEmpty,
                      let text = String(data: data, encoding: .utf8) else { return }
                streamBuffer.append(text)
                onChunk?(text)
            }
        }

        let deadline = Date().addingTimeInterval(options.timeout)
        while task.isRunning {
            if Date() >= deadline {
                task.terminate()
                throw Failure.timedOut(options.timeout)
            }
            try await Task.sleep(nanoseconds: 50_000_000) // 50ms
            if Task.isCancelled {
                task.terminate()
                throw Failure.cancelled
            }
        }

        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
        let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
        let stdout = String(data: stdoutData, encoding: .utf8) ?? ""
        let stderr = String(data: stderrData, encoding: .utf8) ?? ""

        if task.terminationStatus != 0 {
            throw Failure.nonZeroExit(code: task.terminationStatus, stderr: stderr)
        }

        // If we streamed, the buffered stream text is what we want;
        // otherwise the remaining stdout is the full reply.
        if options.onChunk != nil {
            return streamBuffer.snapshot() + stdout
        }
        return stdout.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: argument shaping

    static func buildArgs(flavor: Flavor, extra: [String]) -> [String] {
        switch flavor {
        case .claude:
            // `claude -p <prompt-from-stdin> --output-format text`
            return ["-p", "--output-format", "text"] + extra
        case .codex:
            // `codex exec --skip-git-repo-check --ephemeral --color never`
            return ["exec", "--skip-git-repo-check", "--ephemeral", "--color", "never"] + extra
        }
    }

    // MARK: binary resolution (default hints)

    static func resolveDefaultBinary(for flavor: Flavor) throws -> String {
        let candidates: [String]
        switch flavor {
        case .claude:
            candidates = [
                NSHomeDirectory() + "/.local/bin/claude",
                "/opt/homebrew/bin/claude",
                "/usr/local/bin/claude",
            ]
        case .codex:
            candidates = [
                "/opt/homebrew/bin/codex",
                "/usr/local/bin/codex",
                NSHomeDirectory() + "/.local/bin/codex",
            ]
        }
        for path in candidates {
            if FileManager.default.isExecutableFile(atPath: path) {
                return path
            }
        }
        throw Failure.missingBinary(candidates.first ?? "(no default path)")
    }
}

/// Concurrent-safe buffer for captured stdout. Streaming handler pushes
/// chunks from the reader's queue; `snapshot()` is called on the main
/// task once the process finishes.
private final class StreamBuffer {
    private let lock = NSLock()
    private var buffer: String = ""

    func append(_ chunk: String) {
        lock.lock()
        buffer += chunk
        lock.unlock()
    }

    func snapshot() -> String {
        lock.lock()
        defer { lock.unlock() }
        return buffer
    }
}
