import Foundation
import Darwin

/// Manages the local Next.js server lifecycle for the macOS shell app.
/// In Xcode Debug builds, prefer a hot-reloading dev server.
/// In Release builds, prefer a stable production server (`next start`) when a build exists.
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
    private var healthTask: URLSessionDataTask?
    private var healthCheckAttempts = 0
    private var retryAttempt = 0
    private var pendingRetry: DispatchWorkItem?
    private var ignoredTerminationPID: pid_t?
    private var startGeneration = 0
    private var attemptedPorts: Set<Int> = []
    private var recentLogs: [String] = []
    private var readyMonitorTimer: Timer?
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

    deinit {
        stop()
        healthSession.invalidateAndCancel()
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
        healthTask?.cancel()
        healthTask = nil
        healthCheckAttempts = 0
        ignoredTerminationPID = nil

        if resetRetry {
            retryAttempt = 0
            currentPort = preferredPort
            attemptedPorts = [preferredPort]
            logQueue.sync { recentLogs = [] }
        }
        probePortAndLaunch(generation: generation)
    }

    func stop(invalidateGeneration: Bool = true) {
        if invalidateGeneration {
            startGeneration += 1
        }
        pendingRetry?.cancel()
        pendingRetry = nil
        readyMonitorTimer?.invalidate()
        readyMonitorTimer = nil
        healthTimer?.invalidate()
        healthTimer = nil
        healthTask?.cancel()
        healthTask = nil
        if let pipe = process?.standardOutput as? Pipe {
            pipe.fileHandleForReading.readabilityHandler = nil
        }
        if let pipe = process?.standardError as? Pipe {
            pipe.fileHandleForReading.readabilityHandler = nil
        }
        if let p = process, p.isRunning {
            ignoredTerminationPID = p.processIdentifier
            let pid = p.processIdentifier
            // Try process-group termination first (if child created its own group),
            // then fall back to terminating the tracked process.
            let pgid = getpgid(pid)
            if pgid == pid {
                _ = kill(-pid, SIGTERM)
            }
            p.terminate()
            DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 2) { [p] in
                guard p.isRunning else { return }
                if getpgid(pid) == pid {
                    _ = kill(-pid, SIGKILL)
                }
                _ = kill(pid, SIGKILL)
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

        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        p.executableURL = URL(fileURLWithPath: shell)
        p.arguments = ["-lc", launchCommand(projectPath: projectPath, port: currentPort)]

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
                    if let pipe = terminatedProcess.standardOutput as? Pipe {
                        pipe.fileHandleForReading.readabilityHandler = nil
                    }
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

    private func probePortAndLaunch(generation: Int) {
        guard startGeneration == generation else { return }

        checkHealth { [weak self] alive in
            guard let self, self.startGeneration == generation else { return }

            if alive {
                if let nextPort = self.nextFallbackPort() {
                    self.currentPort = nextPort
                    self.attemptedPorts.insert(nextPort)
                    self.probePortAndLaunch(generation: generation)
                    return
                }

                DispatchQueue.main.async {
                    self.status = .failed(
                        self.composeFailureMessage(
                            base: "All candidate localhost ports are already occupied by other servers."
                        )
                    )
                }
                return
            }

            self.launchProcess(generation: generation)
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
                    self.startReadyMonitoring(generation: generation)
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

    private func startReadyMonitoring(generation: Int) {
        readyMonitorTimer?.invalidate()
        readyMonitorTimer = Timer.scheduledTimer(withTimeInterval: 2.5, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }
            guard self.startGeneration == generation else {
                timer.invalidate()
                return
            }
            guard self.status == .ready else { return }
            self.checkHealth { alive in
                guard self.startGeneration == generation else { return }
                if alive { return }
                timer.invalidate()
                self.readyMonitorTimer = nil
                self.stop(invalidateGeneration: false)
                self.handleFailure(
                    "Local web server became unhealthy after startup.",
                    retryable: true,
                    generation: generation
                )
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

    private func launchCommand(projectPath: String, port: Int) -> String {
        let buildIdPath = "\(projectPath)/.next/BUILD_ID"
        let devScriptPath = "\(projectPath)/scripts/dev.mjs"
        let env = ProcessInfo.processInfo.environment
        let explicitMode = env["LOOM_APP_SERVER_MODE"]?.lowercased()
        let runtimeCommand: String

        if explicitMode == "prod" || explicitMode == "production" {
            if FileManager.default.fileExists(atPath: buildIdPath) {
                runtimeCommand = "npx next start -p \(port) -H 0.0.0.0"
            } else if FileManager.default.fileExists(atPath: devScriptPath) {
                runtimeCommand = "node scripts/dev.mjs -p \(port) -H 0.0.0.0"
            } else {
                runtimeCommand = "npx next dev -p \(port) -H 0.0.0.0"
            }
        } else if explicitMode == "dev" || explicitMode == "development" {
            if FileManager.default.fileExists(atPath: devScriptPath) {
                runtimeCommand = "node scripts/dev.mjs -p \(port) -H 0.0.0.0"
            } else {
                runtimeCommand = "npx next dev -p \(port) -H 0.0.0.0"
            }
        } else {
            #if DEBUG
            if FileManager.default.fileExists(atPath: devScriptPath) {
                runtimeCommand = "node scripts/dev.mjs -p \(port) -H 0.0.0.0"
            } else {
                runtimeCommand = "npx next dev -p \(port) -H 0.0.0.0"
            }
            #else
            if FileManager.default.fileExists(atPath: buildIdPath) {
                runtimeCommand = "npx next start -p \(port) -H 0.0.0.0"
            } else if FileManager.default.fileExists(atPath: devScriptPath) {
                runtimeCommand = "node scripts/dev.mjs -p \(port) -H 0.0.0.0"
            } else {
                runtimeCommand = "npx next dev -p \(port) -H 0.0.0.0"
            }
            #endif
        }
        // Create an isolated process group when available so stop() can kill
        // the entire server tree reliably using negative PIDs.
        return "if command -v setsid >/dev/null 2>&1; then exec setsid \(runtimeCommand); else exec \(runtimeCommand); fi"
    }

    private func nextFallbackPort() -> Int? {
        let candidates = [preferredPort] + fallbackPorts
        return candidates.first { !attemptedPorts.contains($0) }
    }

    private func isLikelyNextServer(response: HTTPURLResponse, data: Data?) -> Bool {
        if (300...399).contains(response.statusCode),
           response.value(forHTTPHeaderField: "Location") != nil {
            return true
        }
        if let poweredBy = response.value(forHTTPHeaderField: "x-powered-by"),
           poweredBy.localizedCaseInsensitiveContains("next") {
            return true
        }
        let bodyText = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
        return bodyText.contains("__NEXT_DATA__")
            || bodyText.contains("/_next/")
            || bodyText.localizedCaseInsensitiveContains("next.js")
    }

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        // Avoid overlapping probes: if one is already in-flight, wait for it.
        if healthTask != nil { return }

        guard let url = URL(string: "http://localhost:\(currentPort)/api/health") else {
            completion(false)
            return
        }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1.5

        var apiTask: URLSessionDataTask?
        apiTask = healthSession.dataTask(with: request) { [weak self] data, response, _ in
            DispatchQueue.main.async {
                guard let self else { return }
                guard self.healthTask === apiTask else { return }

                let finish: (Bool) -> Void = { ok in
                    self.healthTask = nil
                    completion(ok)
                }

                guard let http = response as? HTTPURLResponse else {
                    finish(false)
                    return
                }

                let bodyText = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                if http.statusCode == 200 && bodyText.contains("\"ok\":true") {
                    finish(true)
                    return
                }
                if self.isLikelyNextServer(response: http, data: data) {
                    finish(true)
                    return
                }

                guard let rootURL = URL(string: "http://localhost:\(self.currentPort)/") else {
                    finish(false)
                    return
                }
                var rootRequest = URLRequest(url: rootURL)
                rootRequest.timeoutInterval = 1.5

                var rootTask: URLSessionDataTask?
                rootTask = self.healthSession.dataTask(with: rootRequest) { rootData, rootResponse, _ in
                    DispatchQueue.main.async {
                        guard self.healthTask === rootTask else { return }
                        guard let rootHTTP = rootResponse as? HTTPURLResponse else {
                            finish(false)
                            return
                        }
                        finish(self.isLikelyNextServer(response: rootHTTP, data: rootData))
                    }
                }
                self.healthTask = rootTask
                rootTask?.resume()
            }
        }
        healthTask = apiTask
        apiTask?.resume()
    }
}
