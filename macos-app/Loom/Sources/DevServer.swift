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

    private var process: Process?
    private var healthTimer: Timer?
    private var healthCheckAttempts = 0
    private let port = 3001
    private let maxHealthCheckAttempts = 45
    private let projectPath: String?

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

    func start() {
        if let p = process, p.isRunning {
            stop()
        }

        healthTimer?.invalidate()
        healthTimer = nil
        healthCheckAttempts = 0

        // Check if server is already running on this port
        checkHealth { [weak self] alive in
            if alive {
                DispatchQueue.main.async { self?.status = .ready }
                return
            }
            self?.launchProcess()
        }
    }

    func stop() {
        healthTimer?.invalidate()
        healthTimer = nil
        if let p = process, p.isRunning {
            p.terminate()

            let deadline = Date().addingTimeInterval(2)
            while p.isRunning && Date() < deadline {
                RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.05))
            }

            if p.isRunning {
                kill(p.processIdentifier, SIGKILL)
            }
        }
        process = nil
    }

    private func launchProcess() {
        guard let projectPath else {
            DispatchQueue.main.async {
                self.status = .failed("Could not find project root with package.json. Set LOOM_PROJECT_ROOT or place Wiki at ~/Desktop/Wiki.")
            }
            return
        }

        DispatchQueue.main.async { self.status = .starting }

        let p = Process()
        p.currentDirectoryURL = URL(fileURLWithPath: projectPath)

        // Use the user's shell to get PATH (includes nvm/homebrew node)
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        p.executableURL = URL(fileURLWithPath: shell)
        p.arguments = ["-lc", "exec npx next dev -p \(port) -H 0.0.0.0"]

        // High priority so local dev server can become responsive quickly
        p.qualityOfService = .userInitiated

        // Silence stdout/stderr (server logs)
        p.standardOutput = FileHandle.nullDevice
        p.standardError = FileHandle.nullDevice

        do {
            try p.run()
            process = p

            p.terminationHandler = { [weak self] terminatedProcess in
                guard let self else { return }
                if terminatedProcess.terminationStatus != 0 {
                    DispatchQueue.main.async {
                        if self.status != .ready {
                            self.status = .failed("Dev server exited unexpectedly (\(terminatedProcess.terminationStatus)).")
                        }
                    }
                }
            }

            startHealthPolling()
        } catch {
            DispatchQueue.main.async {
                self.status = .failed("Could not start server: \(error.localizedDescription)")
            }
        }
    }

    private func startHealthPolling() {
        healthTimer?.invalidate()
        healthCheckAttempts = 0

        healthTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] timer in
            guard let self else {
                timer.invalidate()
                return
            }

            self.checkHealth { alive in
                if alive {
                    timer.invalidate()
                    DispatchQueue.main.async { self.status = .ready }
                    return
                }

                self.healthCheckAttempts += 1
                if self.process?.isRunning == false {
                    timer.invalidate()
                    DispatchQueue.main.async {
                        if self.status != .ready {
                            self.status = .failed("Dev server process exited before becoming healthy.")
                        }
                    }
                    return
                }

                if self.healthCheckAttempts >= self.maxHealthCheckAttempts {
                    timer.invalidate()
                    self.stop()
                    DispatchQueue.main.async {
                        self.status = .failed("Timed out waiting for http://localhost:\(self.port)")
                    }
                }
            }
        }
    }

    private func checkHealth(completion: @escaping (Bool) -> Void) {
        guard let url = URL(string: "http://localhost:\(port)/") else {
            completion(false)
            return
        }
        let task = URLSession.shared.dataTask(with: url) { _, response, _ in
            let statusCode = (response as? HTTPURLResponse)?.statusCode
            let ok = statusCode.map { (100...599).contains($0) } ?? false
            completion(ok)
        }
        task.resume()
    }
}
