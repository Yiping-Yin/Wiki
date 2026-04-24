import Foundation
import WebKit
import UniformTypeIdentifiers

/// `WKURLSchemeHandler` for `loom://` requests. Phase 1 of the architecture
/// inversion (see `project_loom_architecture_inversion.md`) —
/// replaces `http://localhost:3001` as the webview's content channel so
/// there's no long-running Next.js server to spawn, bundle, sandbox, or
/// package.
///
/// URL shape (v1):
///   `loom://<host>/<relative/path>` → resolves to `<root-for-host>/<path>`.
///
/// Hosts are registered at construction time. Current mapping:
///   - `content` → user's onboarded knowledge folder (docs, PDFs, slides)
///   - `bundle`  → the app bundle's `Resources/` (pre-rendered MDX pages)
///
/// Future phases can add more hosts (e.g. `asset` for Next.js chunks) without
/// changing the resolver shape.
///
/// Path traversal attempts (`..` segments escaping the root) are rejected
/// before any disk read. Unknown hosts return 404. Missing files return 404.
/// Content types are inferred from a hardcoded map for text-ish extensions,
/// falling back to UTType for binary assets.
final class LoomURLSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "loom"

    private let hostRoots: [String: URL]
    private let fileManager: FileManager
    private var activeTasks: [ObjectIdentifier: Bool] = [:]
    private let activeTasksLock = NSLock()

    init(hostRoots: [String: URL], fileManager: FileManager = .default) {
        var normalized: [String: URL] = [:]
        for (host, root) in hostRoots {
            normalized[host] = root.standardizedFileURL
        }
        self.hostRoots = normalized
        self.fileManager = fileManager
    }

    /// Convenience initializer for the most common case: one content root.
    convenience init(contentRoot: URL, fileManager: FileManager = .default) {
        self.init(hostRoots: ["content": contentRoot], fileManager: fileManager)
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        markActive(urlSchemeTask, active: true)

        guard let requestURL = urlSchemeTask.request.url else {
            respondNotFound(urlSchemeTask, message: "missing url")
            return
        }

        if requestURL.host == "native" {
            respondNativeJSON(urlSchemeTask, requestURL: requestURL)
            return
        }

        guard let resolved = Self.resolve(requestURL, hostRoots: hostRoots) else {
            respondNotFound(urlSchemeTask, message: "rejected path: \(requestURL.absoluteString)")
            return
        }

        // Extensionless path? Next.js static export writes `/patterns` as
        // `/patterns.html`. Any in-webview link that goes to `/foo` (e.g.
        // `<Link href="/patterns">`) resolves via this scheme handler, so
        // try `<resolved>.html` + `<resolved>/index.html` + `<resolved>` in
        // that order — matches the browser's typical static-host behavior.
        var effective = resolved
        if resolved.pathExtension.isEmpty {
            let html = resolved.appendingPathExtension("html")
            if fileManager.fileExists(atPath: html.path) {
                effective = html
            } else {
                let indexHtml = resolved.appendingPathComponent("index.html")
                if fileManager.fileExists(atPath: indexHtml.path) {
                    effective = indexHtml
                }
            }
        }

        guard fileManager.fileExists(atPath: effective.path),
              let data = try? Data(contentsOf: effective) else {
            respondNotFound(urlSchemeTask, message: "no file at \(effective.path)")
            return
        }
        guard isActive(urlSchemeTask) else { return }

        let mime = Self.mimeType(for: effective)
        let response = HTTPURLResponse(
            url: requestURL,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mime,
                "Content-Length": String(data.count),
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
            ]
        )!
        urlSchemeTask.didReceive(response)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
        markActive(urlSchemeTask, active: false)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        markActive(urlSchemeTask, active: false)
    }

    // MARK: Pure resolution logic (testable)

    /// Map a `loom://<host>/<path>` URL to a concrete file URL under the
    /// root registered for `host`. Rejects any path that attempts to escape
    /// via `..`. Returns nil for unknown hosts, malformed URLs, or empty paths.
    static func resolve(_ url: URL, hostRoots: [String: URL]) -> URL? {
        guard url.scheme == scheme else { return nil }
        guard let host = url.host, let root = hostRoots[host] else { return nil }

        let relative = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !relative.isEmpty else { return nil }

        for segment in relative.split(separator: "/") {
            if segment == ".." { return nil }
        }

        let candidate = root
            .appendingPathComponent(relative)
            .standardizedFileURL

        let rootPath = root.standardizedFileURL.path
        let candidatePath = candidate.path
        guard candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/") else {
            return nil
        }

        return candidate
    }

    /// Single-root convenience wrapper preserved for the common case.
    static func resolve(_ url: URL, under contentRoot: URL) -> URL? {
        resolve(url, hostRoots: ["content": contentRoot])
    }

    static func mimeType(for url: URL) -> String {
        let ext = url.pathExtension.lowercased()
        // Known text-ish extensions get a charset tacked on; WKWebView
        // decoding is unreliable otherwise. The hardcoded map takes
        // precedence over UTType so these stay deterministic across OS
        // versions that change UTType's preferred MIME.
        switch ext {
        case "mjs", "js":    return "application/javascript; charset=utf-8"
        case "css":          return "text/css; charset=utf-8"
        case "html", "htm":  return "text/html; charset=utf-8"
        case "json", "map":  return "application/json; charset=utf-8"
        case "svg":          return "image/svg+xml"
        case "woff2":        return "font/woff2"
        case "woff":         return "font/woff"
        default: break
        }
        if let utType = UTType(filenameExtension: ext),
           let mime = utType.preferredMIMEType {
            return mime
        }
        return "application/octet-stream"
    }

    // MARK: Task lifecycle

    private func markActive(_ task: WKURLSchemeTask, active: Bool) {
        let id = ObjectIdentifier(task)
        activeTasksLock.lock()
        if active { activeTasks[id] = true } else { activeTasks.removeValue(forKey: id) }
        activeTasksLock.unlock()
    }

    private func isActive(_ task: WKURLSchemeTask) -> Bool {
        let id = ObjectIdentifier(task)
        activeTasksLock.lock()
        defer { activeTasksLock.unlock() }
        return activeTasks[id] ?? false
    }

    private func respondNativeJSON(_ task: WKURLSchemeTask, requestURL: URL) {
        guard let target = Self.nativeTarget(from: requestURL) else {
            respondNotFound(task, message: "unknown native endpoint: \(requestURL.absoluteString)")
            return
        }

        Task { @MainActor in
            let payload: Any?
            switch target.kind {
            case .panel:
                payload = LoomWebView.Coordinator.buildPanelPayload(id: target.id)
            case .pursuit:
                payload = LoomWebView.Coordinator.buildPursuitPayload(id: target.id)
            case .panels:
                payload = LoomWebView.Coordinator.buildPanelsPayload()
            case .pursuits:
                payload = LoomWebView.Coordinator.buildPursuitsPayload()
            case .soan:
                payload = LoomWebView.Coordinator.buildSoanPayload()
            case .weaves:
                payload = LoomWebView.Coordinator.buildWeavesPayload()
            case .recents:
                payload = LoomWebView.Coordinator.buildRecentRecordsPayload()
            }

            guard let payload else {
                respondNotFound(task, message: "missing native object: \(target.kind.rawValue)/\(target.id)")
                return
            }

            guard JSONSerialization.isValidJSONObject(payload),
                  let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
                  isActive(task) else {
                respondNotFound(task, message: "invalid native payload: \(target.kind.rawValue)/\(target.id)")
                return
            }

            let response = HTTPURLResponse(
                url: requestURL,
                statusCode: 200,
                httpVersion: "HTTP/1.1",
                headerFields: [
                    "Content-Type": "application/json; charset=utf-8",
                    "Content-Length": String(data.count),
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                    "Cross-Origin-Resource-Policy": "cross-origin",
                ]
            )!
            task.didReceive(response)
            task.didReceive(data)
            task.didFinish()
            markActive(task, active: false)
        }
    }

    private enum NativeTargetKind: String {
        case panel
        case pursuit
        case panels
        case pursuits
        case soan
        case weaves
        case recents
    }

    private struct NativeTarget {
        let kind: NativeTargetKind
        let id: String
    }

    private static func nativeTarget(from url: URL) -> NativeTarget? {
        guard url.scheme == scheme, url.host == "native" else { return nil }
        let parts = url.path.split(separator: "/").map(String.init)
        if parts.count == 1 {
            switch parts[0] {
            case "panels.json":
                return NativeTarget(kind: .panels, id: "")
            case "pursuits.json":
                return NativeTarget(kind: .pursuits, id: "")
            case "soan.json":
                return NativeTarget(kind: .soan, id: "")
            case "weaves.json":
                return NativeTarget(kind: .weaves, id: "")
            case "recents.json":
                return NativeTarget(kind: .recents, id: "")
            default:
                return nil
            }
        }
        guard parts.count == 2 else { return nil }
        guard let kind = NativeTargetKind(rawValue: parts[0]) else { return nil }
        guard parts[1].hasSuffix(".json") else { return nil }
        let rawId = String(parts[1].dropLast(5))
        let id = rawId.removingPercentEncoding ?? rawId
        guard !id.isEmpty else { return nil }
        return NativeTarget(kind: kind, id: id)
    }

    private func respondNotFound(_ task: WKURLSchemeTask, message: String) {
        guard isActive(task) else { return }
        let response = HTTPURLResponse(
            url: task.request.url ?? URL(string: "loom://content/unknown")!,
            statusCode: 404,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": "text/plain; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
            ]
        )!
        task.didReceive(response)
        task.didReceive(Data(message.utf8))
        task.didFinish()
        markActive(task, active: false)
    }
}
