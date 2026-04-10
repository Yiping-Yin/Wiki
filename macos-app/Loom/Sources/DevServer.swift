import Foundation

/// Manages the Next.js dev server lifecycle.
/// Starts `npx next dev` as a child process, monitors readiness,
/// and terminates it when the app quits.
class DevServer: ObservableObject {
    enum Status: Equatable {
        case idle
        case starting
        case ready
        case failed(String)
    }

    @Published var status: Status = .idle
    @Published private(set) var currentPort: Int = 3001

    private var process: Process?
    private var healthTimer: Timer?
    private var healthCheckAttempts = 0
    private var retryAttempt = 0
    private var pendingRetry: DispatchWorkItem?
    private var ignoredTerminationPID: pid_t?
    private var startGeneration = 0
    private var attemptedPorts: Set<Int> = []
    private var recentLogs: [String] = []
    private let logQueue = DispatchQueue(label: "DevServer.logQueue")
    private let maxLogLines = 30
    private let preferredPort = 3001
    private let fallbackPorts = [3002, 3003, 3004, 3005]
    private let maxHealthCheckAttempts = 45
    private let maxAutoRetryAttempts = 3
    private let projectPath: String?
    private lazy var healthSession: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 1.5
        config.timeoutIntervalForResource = 2.0
        return URLSession(configuration: config)
    }()

    var serverURL: URL {
        URL(string: "http://localhost:\(currentPort)")!
    }

    init() {
        // The Wiki project lives next to the macos-app directory
        let appDir = Bundle.main.bundlePath
        // In dev: project is at ~/Desktop/Wiki
        // Fallback: check common locations
        let candidates = [
            ProcessInfo.processInfo.environment["LOOM_PROJECT_ROOT"],
            NSHomeDirectory() + "/Desktop/Wiki",
            NSHomeDirectory() + "/Desktop/wiki",
            (appDir as NSString).deletingLastPathComponent + "/../../..",
        ].compactMap { $0 }
        projectPath = candidates.first { FileManager.default.fileExists(atPath: $0 + "/package.json") }
    }

    func start(resetRetry: Bool = true) {
        pendingRetry?.cancel()
        pendingRetry = nil

        if let p = process, p.isRunning {
            stop()
        }

        startGeneration += 1
        let generation = startGeneration

        healthTimer?.invalidate()
        healthTimer = nil
        healthCheckAttempts = 0
        ignoredTerminationPID = nil

        if resetRetry {
            retryAttempt = 0
            currentPort = preferredPort
            attemptedPorts = [preferredPort]
            logQueue.sync { recentLogs = [] }
        }

        // Check if server is already running on this port
        checkHealth { [weak self] alive in
            guard let self, self.startGeneration == generation else { return }
            if alive {
                self.retryAttempt = 0
                DispatchQueue.main.async { self.status = .ready }
                return
            }
            self.launchProcess(generation: generation)
        }
    }

    func stop(invalidateGeneration: Bool = true) {
        if invalidateGeneration {
            startGeneration += 1
        }
        pendingRetry?.cancel()
        pendingRetry = nil
        healthTimer?.invalidate()
        healthTimer = nil
        if let pipe = process?.standardError as? Pipe {
            pipe.fileHandleForReading.readabilityHandler = nil
        }
        if let p = process, p.isRunning {
            ignoredTerminationPID = p.processIdentifier
            p.terminate()
            let pid = p.processIdentifier
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 2) { [weak p] in
                guard let p, p.isRunning else { return }
                kill(pid, SIGKILL)
            }
        }
        process = nil
    }

    private func launchProcess(generation: Int) {
        guard startGeneration == generation else { return }

        guard let projectPath else {
            DispatchQueue.main.async {
                self.status = .failed("Could not find project root with package.json. Set LOOM_PROJECT_ROOT or place Wiki at ~/Desktop/Wiki.")
            }
            return
        }

        // Keep logs scoped to the current launch attempt so failure heuristics
        // (like EADDRINUSE detection) don't read stale history.
        logQueue.sync { recentLogs = [] }
        DispatchQueue.main.async { self.status = .starting }

        let p = Process()
        p.currentDirectoryURL = URL(fileURLWithPath: projectPath)

        // Use the user's shell to get PATH (includes nvm/homebrew node)
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        p.executableURL = URL(fileURLWithPath: shell)
        p.arguments = ["-lc", "exec npx next dev -p \(currentPort) -H 0.0.0.0"]

        // High priority so local dev server can become responsive quickly
        p.qualityOfService = .userInitiated

        let logPipe = Pipe()
        p.standardOutput = logPipe
        p.standardError = logPipe
        logPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard let self, !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            self.appendLogs(text)
        }

        do {
            try p.run()
            process = p

            p.terminationHandler = { [weak self] terminatedProcess in
                DispatchQueue.main.async {
                    guard let self else { return }
                    if let pipe = terminatedProcess.standardError as? Pipe {
                        pipe.fileHandleForReading.readabilityHandler = nil
                    }
                    if self.process === terminatedProcess {
                        self.process = nil
                    }
                    guard self.startGeneration == generation else { return }
                    if self.ignoredTerminationPID == terminatedProcess.processIdentifier {
                        self.ignoredTerminationPID = nil
                        return
                    }
                    self.handleFailure(
                        "Dev server exited unexpectedly (\(terminatedProcess.terminationStatus)).",
                        retryable: true,
                        generation: generation
                    )
                }
            }

            startHealthPolling(generation: generation)
        } catch {
            handleFailure("Could not start server: \(error.localizedDescription)", retryable: true, generation: generation)
        }
    }

    private func startHealthPolling(generation: Int) {
        healthTimer?.invalidate()
        healthCheckAttempts = 0

        healthTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            guard self.startGeneration == generation else {
                timer.invalidate()
                return
            }

            self.checkHealth { alive in
                guard self.startGeneration == generation else { return }
                if alive {
                    timer.invalidate()
                    self.retryAttempt = 0
                    DispatchQueue.main.async { self.status = .ready }
                    return
                }

                self.healthCheckAttempts += 1
                if self.process?.isRunning == false {
                    timer.invalidate()
                    self.handleFailure("Dev server process exited before becoming healthy.", retryable: true, generation: generation)
                    return
                }

                if self.healthCheckAttempts >= self.maxHealthCheckAttempts {
                    timer.invalidate()
                    self.stop(invalidateGeneration: false)
                    self.handleFailure("Timed out waiting for http://localhost:\(self.currentPort)", retryable: true, generation: generation)
                }
            }
        }
    }

    private func handleFailure(_ base: String, retryable: Bool, generation: Int) {
        if !Thread.isMainThread {
            DispatchQueue.main.async {
                self.handleFailure(base, retryable: retryable, generation: generation)
            }
            return
        }
        guard startGeneration == generation else { return }

        pendingRetry?.cancel()
        pendingRetry = nil

        let recentLogText = recentLogSnapshot()
        let addrInUse = base.localizedCaseInsensitiveContains("EADDRINUSE")
            || recentLogText.localizedCaseInsensitiveContains("EADDRINUSE")
            || recentLogText.localizedCaseInsensitiveContains("address already in use")

        if retryable, addrInUse, let nextPort = nextFallbackPort() {
            currentPort = nextPort
            attemptedPorts.insert(nextPort)
            let message = composeFailureMessage(
                base: "\(base)\nPort in use, switching to \(nextPort)..."
            )
            DispatchQueue.main.async { self.status = .failed(message) }

            let work = DispatchWorkItem { [weak self] in
                self?.start(resetRetry: false)
            }
            pendingRetry = work
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(500), execute: work)
            return
        }

        if retryable, retryAttempt < maxAutoRetryAttempts {
            retryAttempt += 1
            let delaySeconds = Int(pow(2.0, Double(retryAttempt - 1)))
            let message = composeFailureMessage(
                base: "\(base)\nAuto-retrying in \(delaySeconds)s (\(retryAttempt)/\(maxAutoRetryAttempts))..."
            )
            DispatchQueue.main.async { self.status = .failed(message) }

            let work = DispatchWorkItem { [weak self] in
                self?.start(resetRetry: false)
            }
            pendingRetry = work
            DispatchQueue.main.asyncAfter(deadline: .now() + .seconds(delaySeconds), execute: work)
            return
        }

        DispatchQueue.main.async {
            self.status = .failed(self.composeFailureMessage(base: base))
        }
    }

    private func appendLogs(_ text: String) {
        let lines = text
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return }
        logQueue.sync {
            recentLogs.append(contentsOf: lines)
            if recentLogs.count > maxLogLines {
                recentLogs.removeFirst(recentLogs.count - maxLogLines)
            }
        }
    }

    private func composeFailureMessage(base: String) -> String {
        let snapshot = recentLogSnapshot()
        guard !snapshot.isEmpty else { return base }
        return base + "\n\nRecent logs:\n" + snapshot
    }

    private func recentLogSnapshot() -> String {
        let snapshot = logQueue.sync { recentLogs }
        return snapshot.joined(separator: "\n")
    }

    private func nextFallbackPort() -> Int? {
        let candidates = [preferredPort] + fallbackPorts
        return candidates.first { !attemptedPorts.contains($0) }
    }

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "http://localhost:\(currentPort)/") else {
            completion(false)
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5
        let task = healthSession.dataTask(with: request) { data, response, _ in
            guard let http = response as? HTTPURLResponse else {
                DispatchQueue.main.async { completion(false) }
                return
            }

            let statusOK = (200..<500).contains(http.statusCode)
            let poweredBy = (http.value(forHTTPHeaderField: "x-powered-by") ?? "").lowercased()
            let looksLikeNextHeader = poweredBy.contains("next")
            let bodyText = data.flatMap { String(data: $0, encoding: .utf8) }?.lowercased() ?? ""
            let looksLikeNextBody = bodyText.contains("__next")
            let ok = statusOK && (looksLikeNextHeader || looksLikeNextBody)
            DispatchQueue.main.async {
                completion(ok)
            }
        }
        task.resume()
    }
}
