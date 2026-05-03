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
    /// Per-content-root URL map. Indexed by `ContentRoot.id` so URLs of
    /// the form `loom://content/<root-uuid>/<path>` resolve under the
    /// matching root. When this map is non-empty, multi-root resolution
    /// runs first; falls back to `hostRoots["content"]` (the legacy
    /// single-root mode) only when the first path segment is not a UUID
    /// or doesn't match a known root.
    private let contentRoots: [UUID: URL]
    private let fileManager: FileManager
    private var activeTasks: [ObjectIdentifier: Bool] = [:]
    private let activeTasksLock = NSLock()

    init(
        hostRoots: [String: URL],
        contentRoots: [UUID: URL] = [:],
        fileManager: FileManager = .default
    ) {
        var normalized: [String: URL] = [:]
        for (host, root) in hostRoots {
            normalized[host] = root.standardizedFileURL
        }
        var normalizedContent: [UUID: URL] = [:]
        for (id, root) in contentRoots {
            normalizedContent[id] = root.standardizedFileURL
        }
        self.hostRoots = normalized
        self.contentRoots = normalizedContent
        self.fileManager = fileManager
    }

    /// Convenience initializer for the most common case: one content root.
    convenience init(contentRoot: URL, fileManager: FileManager = .default) {
        self.init(hostRoots: ["content": contentRoot], contentRoots: [:], fileManager: fileManager)
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

        guard let resolved = Self.resolve(
            requestURL,
            hostRoots: hostRoots,
            contentRoots: contentRoots,
            fileManager: fileManager
        ) else {
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
        // No-cache for HTML so route changes during dev iteration
        // appear immediately. JS / CSS chunks are content-hashed by
        // Next.js so they're safe to cache long-term.
        let cacheControl: String = {
            if mime.hasPrefix("text/html") {
                return "no-cache, no-store, must-revalidate"
            }
            // Hashed chunks (e.g. page-abc123.js) — immutable.
            if effective.path.contains("/_next/static/") {
                return "public, max-age=31536000, immutable"
            }
            return "no-cache"
        }()
        var headers: [String: String] = [
            "Content-Type": mime,
            "Content-Length": String(data.count),
            "Cache-Control": cacheControl,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Accept-Ranges": "bytes",
        ]
        // Permissive CSP for HTML — Loom pages embed user-captured
        // content that may include data: image URLs (canvas
        // screenshots), https iframes (YouTube/Vimeo embeds), and
        // inline SVG. Default WKWebView CSP for custom-scheme origins
        // blocks all of these. This is single-user trusted-content
        // territory; sanitization happens at extract time.
        if mime.hasPrefix("text/html") {
            headers["Content-Security-Policy"] = [
                "default-src 'self' loom: data: blob: https:",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval' loom: blob:",
                "style-src 'self' 'unsafe-inline' loom: data:",
                "img-src 'self' data: blob: https: http: loom:",
                "media-src 'self' data: blob: https: http: loom:",
                "frame-src 'self' https: http: loom:",
                "font-src 'self' data: loom: https:",
                "connect-src 'self' loom: data: https: http: ws: wss:",
            ].joined(separator: "; ")
        }
        switch Self.byteRange(from: urlSchemeTask.request.value(forHTTPHeaderField: "Range"), contentLength: data.count) {
        case .unsatisfiable:
            headers["Content-Length"] = "0"
            headers["Content-Range"] = "bytes */\(data.count)"
            let response = HTTPURLResponse(
                url: requestURL,
                statusCode: 416,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didFinish()
            markActive(urlSchemeTask, active: false)
            return

        case .partial(let range):
            let responseData = data.subdata(in: range.start..<(range.end + 1))
            headers["Content-Length"] = String(responseData.count)
            headers["Content-Range"] = "bytes \(range.start)-\(range.end)/\(data.count)"
            let response = HTTPURLResponse(
                url: requestURL,
                statusCode: 206,
                httpVersion: "HTTP/1.1",
                headerFields: headers
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(responseData)
            urlSchemeTask.didFinish()
            markActive(urlSchemeTask, active: false)
            return

        case .full:
            break
        }
        let response = HTTPURLResponse(
            url: requestURL,
            statusCode: 200,
            httpVersion: "HTTP/1.1",
            headerFields: headers
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
    ///
    /// Multi-root mode: if `host == "content"` and the first path segment
    /// parses as a UUID matching a key in `contentRoots`, the URL is
    /// resolved under that specific root. The remaining path segments
    /// become the file path within that root. Falls back to `hostRoots`
    /// lookup (legacy single-root behaviour) when the UUID doesn't match.
    static func resolve(
        _ url: URL,
        hostRoots: [String: URL],
        contentRoots: [UUID: URL] = [:],
        fileManager: FileManager = .default
    ) -> URL? {
        guard url.scheme == scheme else { return nil }
        guard let host = url.host else { return nil }

        let relative = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        // Multi-root path-prefix resolution: loom://content/<uuid>/<path>
        if host == "content", !relative.isEmpty {
            let segments = relative.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: true).map(String.init)
            if let firstSeg = segments.first, let rootID = UUID(uuidString: firstSeg) {
                let rest = segments.count > 1 ? segments[1] : ""

                // Loom-managed notes, web captures, and media sidecars live in
                // LoomFileStore, not in the user's external source folder. This
                // keeps source folders authoritative and also lets capture media
                // such as `sub/Web/<domain>/Loom-media-*.webp` resolve next to
                // their saved Loom.md file.
                if let managed = resolveManagedContent(rootID: rootID, rest: rest, fileManager: fileManager) {
                    return managed
                }

                if let rootURL = contentRoots[rootID] {
                    return resolveRelative(rest, under: rootURL)
                }
            }
            // First segment isn't a UUID we know — fall through to legacy
            // single-root resolution below using hostRoots["content"].
        }

        guard let root = hostRoots[host] else { return nil }
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

    private static func resolveRelative(_ rest: String, under rootURL: URL) -> URL? {
        if rest.split(separator: "/").contains("..") { return nil }
        let root = rootURL.standardizedFileURL
        let candidate = rest.isEmpty
            ? root
            : root.appendingPathComponent(rest).standardizedFileURL
        let rootPath = root.path
        let candidatePath = candidate.standardizedFileURL.path
        guard candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/") else {
            return nil
        }
        return candidate.standardizedFileURL
    }

    private static func resolveManagedContent(
        rootID: UUID,
        rest: String,
        fileManager: FileManager
    ) -> URL? {
        guard isManagedContentPath(rest) else { return nil }
        guard !rest.split(separator: "/").contains("..") else { return nil }

        let storeRoot = LoomFileStore.rootURL
            .appendingPathComponent(rootID.uuidString.lowercased(), isDirectory: true)
            .standardizedFileURL
        let candidate = rest.isEmpty
            ? storeRoot.appendingPathComponent("Loom.md")
            : storeRoot.appendingPathComponent(rest).standardizedFileURL

        let rootPath = storeRoot.path
        let candidatePath = candidate.standardizedFileURL.path
        guard candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/") else {
            return nil
        }
        guard fileManager.fileExists(atPath: candidatePath) else { return nil }
        return candidate.standardizedFileURL
    }

    private static func isManagedContentPath(_ rest: String) -> Bool {
        let trimmed = rest.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return trimmed == "Loom.md" ||
            trimmed.hasPrefix("sub/") ||
            trimmed.hasPrefix("Loom-media-")
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
        case "gif":          return "image/gif"
        case "webp":         return "image/webp"
        case "png":          return "image/png"
        case "jpg", "jpeg":  return "image/jpeg"
        case "webm":         return "video/webm"
        case "mp4", "m4v":   return "video/mp4"
        case "mov":          return "video/quicktime"
        case "bin":
            if let sniffed = sniffedMimeType(for: url) { return sniffed }
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

    private struct ByteRange {
        let start: Int
        let end: Int
    }

    private enum ByteRangeResolution {
        case full
        case partial(ByteRange)
        case unsatisfiable
    }

    private static func byteRange(from header: String?, contentLength: Int) -> ByteRangeResolution {
        guard let header = header?.trimmingCharacters(in: .whitespacesAndNewlines),
              !header.isEmpty else {
            return .full
        }
        guard contentLength > 0 else { return .unsatisfiable }
        guard header.lowercased().hasPrefix("bytes=") else { return .full }

        let spec = String(header.dropFirst("bytes=".count)).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !spec.contains(",") else { return .unsatisfiable }
        let parts = spec.split(separator: "-", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2 else { return .unsatisfiable }

        let first = String(parts[0]).trimmingCharacters(in: .whitespaces)
        let last = String(parts[1]).trimmingCharacters(in: .whitespaces)

        if first.isEmpty {
            guard let suffixLength = Int(last), suffixLength > 0 else { return .unsatisfiable }
            let start = max(0, contentLength - suffixLength)
            return .partial(ByteRange(start: start, end: contentLength - 1))
        }

        guard let start = Int(first), start >= 0, start < contentLength else {
            return .unsatisfiable
        }
        let end: Int
        if last.isEmpty {
            end = contentLength - 1
        } else {
            guard let requestedEnd = Int(last), requestedEnd >= start else {
                return .unsatisfiable
            }
            end = min(requestedEnd, contentLength - 1)
        }
        return .partial(ByteRange(start: start, end: end))
    }

    private static func sniffedMimeType(for url: URL) -> String? {
        guard let handle = try? FileHandle(forReadingFrom: url) else { return nil }
        let data = handle.readData(ofLength: 64)
        try? handle.close()
        let bytes = [UInt8](data)
        if bytes.starts(with: [0x1A, 0x45, 0xDF, 0xA3]),
           let ascii = String(data: data, encoding: .ascii),
           ascii.lowercased().contains("webm") {
            return "video/webm"
        }
        if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "image/png" }
        if bytes.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
        if bytes.count >= 4,
           String(bytes: bytes.prefix(4), encoding: .ascii)?.hasPrefix("GIF8") == true {
            return "image/gif"
        }
        if bytes.count >= 12,
           String(bytes: Array(bytes[0..<4]), encoding: .ascii) == "RIFF",
           String(bytes: Array(bytes[8..<12]), encoding: .ascii) == "WEBP" {
            return "image/webp"
        }
        if bytes.count >= 12,
           String(bytes: Array(bytes[4..<8]), encoding: .ascii) == "ftyp" {
            return "video/mp4"
        }
        return nil
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

        // Distill is the one native target that has to await an AI
        // provider call before it can respond. We hand it off to a
        // separate async path so the rest of the switch (all sync-
        // payload-builders) stays simple.
        if target.kind == .distill {
            respondDistillJSON(task, requestURL: requestURL)
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
            case .sourceLibraryGroups:
                payload = try? SourceLibraryNativeStore.metadataPayload()
            case .schema:
                payload = LoomSchemaBridge.buildPayload(traceId: target.id)
            case .schemaForDoc:
                payload = LoomSchemaBridge.buildPayload(forReadingDocId: target.id)
            case .extractorAnchorsForDoc:
                payload = LoomExtractorAnchorsBridge.buildPayload(forReadingDocId: target.id)
            case .captureContent:
                payload = Self.buildCaptureContentPayload(query: requestURL.query ?? "")
            case .capturesList:
                payload = Self.buildCapturesListPayload()
            case .captureSnapshot:
                payload = Self.buildCaptureSnapshotPayload(query: requestURL.query ?? "")
            case .captureMetadata:
                payload = Self.handleCaptureMetadataRequest(query: requestURL.query ?? "")
            case .captureMetadataAll:
                payload = Self.buildCaptureMetadataAllPayload()
            case .distill:
                // Handled above via early-return; the case is here only
                // so the compiler verifies exhaustiveness.
                payload = nil
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

    /// Handler for `loom://native/distill.json`. Extracts the entry
    /// body via the existing `buildCaptureContentPayload` slicer, then
    /// hands the body off to the user-selected AI provider with a
    /// distill-specific prompt. Returns:
    ///   - on success: `{ summary: "<markdown>", success: true }`
    ///   - on failure: `{ error: "<message>", success: false }`
    ///
    /// The provider dispatch mirrors `AIBridgeHandler` so all 6 wired
    /// clients (Anthropic, OpenAI, Apple Foundation Models, Custom
    /// HTTPS, Ollama, Codex CLI) work without further wiring.
    /// Disabled provider returns a `success: false` JSON so the calling
    /// page can render a sensible fallback ("AI is off in Settings.").
    private func respondDistillJSON(_ task: WKURLSchemeTask, requestURL: URL) {
        let query = requestURL.query ?? ""
        let params = Self.parseQuery(query)
        let title = params["title"] ?? ""
        let eyebrow = params["eyebrow"] ?? ""

        // Reuse the same slicer as capture-content.json so distill sees
        // exactly the body the magazine page renders.
        guard let captureContent = Self.buildCaptureContentPayload(query: query) else {
            respondJSON(task, requestURL: requestURL, payload: [
                "success": false,
                "error": "missing capture content for the requested entry",
            ])
            return
        }
        if let err = captureContent["error"] as? String {
            respondJSON(task, requestURL: requestURL, payload: [
                "success": false,
                "error": err,
            ])
            return
        }
        let body = (captureContent["body"] as? String) ?? ""
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            respondJSON(task, requestURL: requestURL, payload: [
                "success": false,
                "error": "entry body is empty",
            ])
            return
        }

        let prompt = Self.buildDistillPrompt(title: title, eyebrow: eyebrow, body: trimmed)
        let provider = AIProviderKind.current

        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            do {
                let summary = try await Self.invokeAIProvider(prompt: prompt, provider: provider)
                self.respondJSON(task, requestURL: requestURL, payload: [
                    "success": true,
                    "summary": summary,
                    "provider": provider.rawValue,
                ])
            } catch {
                self.respondJSON(task, requestURL: requestURL, payload: [
                    "success": false,
                    "error": error.localizedDescription,
                    "provider": provider.rawValue,
                ])
            }
        }
    }

    /// Compose the distill prompt. Kept as a single static helper so
    /// the prompt body sits next to the schema it produces — easier to
    /// tweak without hunting through call sites.
    private static func buildDistillPrompt(title: String, eyebrow: String, body: String) -> String {
        var preamble = "Summarize the captured webpage below into 3-5 bullet points and extract the most important quotes. Format the response as markdown with two sections: ## Summary (bullet list) and ## Quotes (each quote on its own blockquote line). Keep the language faithful to the source — do not invent new claims."
        if !title.isEmpty {
            preamble += "\n\nTitle: \(title)"
        }
        if !eyebrow.isEmpty {
            preamble += "\nEyebrow: \(eyebrow)"
        }
        return "\(preamble)\n\n---\n\n\(body)"
    }

    /// Provider dispatch mirroring `AIBridgeHandler` so distill works
    /// with whichever client the user picked. `disabled` throws so the
    /// caller can surface "AI is off in Settings." rather than silently
    /// returning empty text.
    private static func invokeAIProvider(prompt: String, provider: AIProviderKind) async throws -> String {
        switch provider {
        case .anthropic:
            return try await AnthropicClient.send(prompt: prompt, options: AnthropicClient.Options())
        case .openai:
            return try await OpenAIClient.send(prompt: prompt, options: OpenAIClient.Options())
        case .appleFoundation:
            return try await AppleFoundationClient.send(prompt: prompt)
        case .customEndpoint:
            return try await CustomEndpointClient.send(prompt: prompt, options: CustomEndpointClient.Options())
        case .ollama:
            return try await OllamaClient.send(prompt: prompt, options: OllamaClient.Options())
        case .codexCli:
            var opts = CLIRuntimeClient.Options()
            opts.flavor = .codex
            return try await CLIRuntimeClient.send(prompt: prompt, options: opts)
        case .disabled:
            throw NSError(
                domain: "LoomDistill", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "AI is disabled in Settings — turn a provider on to use Distill."]
            )
        }
    }

    /// Shared "respond with arbitrary JSON object" helper. Mirrors the
    /// successful-response branch of `respondNativeJSON` but takes the
    /// payload as a parameter so the async distill path can call it
    /// from anywhere.
    private func respondJSON(_ task: WKURLSchemeTask, requestURL: URL, payload: [String: Any]) {
        guard isActive(task) else { return }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload, options: []) else {
            respondNotFound(task, message: "invalid distill payload")
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
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Cross-Origin-Resource-Policy": "cross-origin",
            ]
        )!
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
        markActive(task, active: false)
    }

    private enum NativeTargetKind: String {
        case panel
        case pursuit
        case panels
        case pursuits
        case soan
        case weaves
        case recents
        case sourceLibraryGroups
        case schema
        case schemaForDoc = "schema-for-doc"
        case extractorAnchorsForDoc = "extractor-anchors-for-doc"
        // Phase C M1 / Path B — capture content for in-Loom render.
        // Reads a Loom.md, slices the requested entry, returns the
        // raw markdown body + parsed list items if shape detection
        // matches. The Next.js side at /loom-render/capture renders
        // it with full Vellum chrome (PageFrame / WorkSurface / KaTeX).
        case captureContent = "capture-content"
        // Phase C M2 — index of all captures across roots, used by
        // the magazine landing at /loom-render/captures. Returns
        // metadata only (title / eyebrow / sub / domain / kind /
        // root / timestamp), no body — keeps payload small for
        // 100+ capture inventories.
        case capturesList = "captures-list"
        // Phase D — fetches the raw HTML body of a saved snapshot so
        // the /loom-render/snapshot route can `srcdoc=` it into an
        // iframe. Args: root, sub, filename. Returns
        // `{ html, found: true }` on hit, `{ found: false, error }`
        // on miss. Alternative path is loading the file directly via
        // `loom://content/<root>/sub/Web/<domain>/Loom-snapshot-*.html`,
        // which the existing scheme handler already serves; this
        // JSON layer exists for parity with capture-content.json so
        // both pages share the same fetch shape.
        case captureSnapshot = "capture-snapshot"
        // Phase C — AI distill bridge. Reads the entry body via the
        // same args as `capture-content.json`, then routes the body
        // through the active AI provider with a distill-specific
        // prompt. Returns `{ summary, success: true }` on hit,
        // `{ error, success: false }` on miss.
        case distill = "distill"
        // Phase metadata-bridge — per-capture state (starred / tags /
        // readProgress / lastVisited) persisted to a real sidecar file
        // in the sandbox. Replaces localStorage-only persistence on
        // the captures landing so the state survives webview-data
        // wipes and can be read by SwiftUI surfaces.
        //
        // Read shape  (no `op`):
        //   loom://native/capture-metadata.json?root=<uuid>&sub=<path>
        //                                       &title=<...>&eyebrow=<...>
        //   → { starred, tags[], readProgress, lastVisited, found: bool }
        //
        // Write shape (`op=set`):
        //   loom://native/capture-metadata.json?root=...&sub=...
        //                                       &title=...&eyebrow=...
        //                                       &op=set&starred=1
        //                                       &tags=t1,t2&readProgress=75
        //                                       &lastVisited=1734000000000
        //   → { ok: true } | { ok: false, error }
        //
        // Sidecar lives at `<store>/<rootID>/sub/<sub>/Loom-metadata.json`
        // alongside Loom.md. One file per Loom.md; entries keyed by
        // `<title>:<eyebrow>` so all captures inside the same file share
        // a single sidecar.
        case captureMetadata = "capture-metadata"
        // Phase metadata-bridge — bulk read of every entry's metadata
        // across every active root. Returns
        // `{ entries: { <stableKey>: { starred, tags[], readProgress,
        //   lastVisited } } }` where `stableKey` is the same
        // `${rootID}:${title}:${eyebrow}` shape the captures landing
        // builds via `stableKeyOf`.
        case captureMetadataAll = "capture-metadata-all"
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
            case "source-library-groups.json":
                return NativeTarget(kind: .sourceLibraryGroups, id: "")
            case "capture-content.json":
                // Args come via query string; id stays empty.
                return NativeTarget(kind: .captureContent, id: "")
            case "captures-list.json":
                return NativeTarget(kind: .capturesList, id: "")
            case "capture-snapshot.json":
                // Args come via query string; id stays empty.
                return NativeTarget(kind: .captureSnapshot, id: "")
            case "distill.json":
                // Args (root, sub, title, eyebrow) come via query
                // string; id stays empty.
                return NativeTarget(kind: .distill, id: "")
            case "capture-metadata.json":
                // Args (root, sub, title, eyebrow, [op=set, …]) come
                // via query string; id stays empty.
                return NativeTarget(kind: .captureMetadata, id: "")
            case "capture-metadata-all.json":
                return NativeTarget(kind: .captureMetadataAll, id: "")
            default:
                return nil
            }
        }
        guard parts.count >= 2 else { return nil }
        guard let kind = NativeTargetKind(rawValue: parts[0]) else { return nil }
        // Phase 7.1 · `schema-for-doc/<readingDocId>.json` can carry
        // a docId that contains `/` once URL-decoded (e.g.
        // `know/unsw-fins-3640__lecture-notes-w3`). URL.path decodes
        // percent-encoding so we have to reconstruct the id from the
        // tail of `parts` rather than assuming exactly two segments.
        let tail = parts.dropFirst()
        guard let lastComponent = tail.last, lastComponent.hasSuffix(".json") else {
            return nil
        }
        let idParts = Array(tail.dropLast()) + [String(lastComponent.dropLast(5))]
        let rawId = idParts.joined(separator: "/")
        let id = rawId.removingPercentEncoding ?? rawId
        guard !id.isEmpty else { return nil }
        return NativeTarget(kind: kind, id: id)
    }

    /// Builds the JSON payload for `loom://native/capture-content.json`.
    /// Query args:
    ///   - root    : root UUID (lower- or upper-case)
    ///   - sub     : sub-path within the root (URL-encoded), e.g.
    ///               "Web/news.ycombinator.com" or "" for root-level
    ///   - title   : entry heading (URL-encoded), matched after `### `
    ///   - eyebrow : eyebrow line content (URL-encoded), matched after
    ///               `*…*` for disambiguation when multiple captures
    ///               share a heading title
    ///
    /// Returns the entry slice (without redundant heading / eyebrow /
    /// "From [..](..)" prefix lines), plus shape detection done here
    /// so the renderer can pick the right component without re-parsing.
    static func buildCaptureContentPayload(query: String) -> [String: Any]? {
        let params = parseQuery(query)
        guard let rootStr = params["root"], let rootID = UUID(uuidString: rootStr) else {
            return ["error": "missing or malformed root"]
        }
        let sub = params["sub"] ?? ""
        let title = params["title"] ?? ""
        let eyebrow = params["eyebrow"] ?? ""

        let fileURL = LoomFileStore.loomMDURL(for: rootID, subPath: sub)
        guard FileManager.default.fileExists(atPath: fileURL.path),
              let source = try? String(contentsOf: fileURL, encoding: .utf8) else {
            return ["error": "no Loom.md at \(fileURL.path)"]
        }

        guard let body = sliceEntry(in: source, heading: title, eyebrow: eyebrow) else {
            return ["error": "capture entry not found"]
        }
        let captureASTFilename = extractCaptureASTFilename(from: body)
        let readerBody = stripCaptureMetadataComments(from: body)

        // Shape detection: lightweight regex on body. Matches the
        // SwiftUI side of CaptureShapeDetector — keep both in sync.
        let listItems = parseListItemsForJSON(from: readerBody)
        let shape: String = isPrimarilyListCapture(readerBody, parsedItemCount: listItems.count) ? "list" : "article"

        var out: [String: Any] = [
            "title": title,
            "eyebrow": eyebrow,
            "body": readerBody,
            "shape": shape,
            "fileURL": fileURL.path,
        ]
        if let snap = newestSnapshotFilename(in: fileURL.deletingLastPathComponent()) {
            out["snapshotFilename"] = snap
        }
        if let filename = captureASTFilename,
           let captureAst = readCaptureASTSidecar(filename: filename, in: fileURL.deletingLastPathComponent()) {
            out["captureAst"] = captureAst
        }
        if shape == "list" {
            out["items"] = listItems
        }
        return out
    }

    private static func extractCaptureASTFilename(from body: String) -> String? {
        let pattern = #"<!--\s*loom-capture-ast:\s*([^<>\s]+)\s*-->"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let ns = body as NSString
        let range = NSRange(location: 0, length: ns.length)
        guard let match = regex.firstMatch(in: body, range: range),
              match.numberOfRanges >= 2 else {
            return nil
        }
        let filename = ns.substring(with: match.range(at: 1))
        guard filename.hasPrefix("Loom-capture-ast-"),
              filename.hasSuffix(".json"),
              !filename.contains("/") else {
            return nil
        }
        return filename
    }

    private static func stripCaptureMetadataComments(from body: String) -> String {
        let pattern = #"(?m)^<!--\s*loom-capture-(?:diagnostics|ast):.*?-->\s*\n?"#
        return body.replacingOccurrences(
            of: pattern,
            with: "",
            options: [.regularExpression]
        )
        .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func readCaptureASTSidecar(filename: String, in dir: URL) -> Any? {
        guard filename.hasPrefix("Loom-capture-ast-"),
              filename.hasSuffix(".json"),
              !filename.contains("/") else {
            return nil
        }
        let url = dir.appendingPathComponent(filename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data, options: [])
    }

    private static func parseQuery(_ raw: String) -> [String: String] {
        var out: [String: String] = [:]
        for pair in raw.split(separator: "&") {
            let bits = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
            guard bits.count == 2 else { continue }
            // Form-encoding uses `+` for space; `removingPercentEncoding`
            // only handles `%XX`, so do the `+` step first.
            let kRaw = bits[0].replacingOccurrences(of: "+", with: " ")
            let vRaw = bits[1].replacingOccurrences(of: "+", with: " ")
            let k = kRaw.removingPercentEncoding ?? kRaw
            let v = vRaw.removingPercentEncoding ?? vRaw
            out[k] = v
        }
        return out
    }

    /// Mirror of CaptureReaderView.entrySlice — extract the
    /// `### heading` block from full Loom.md, strip redundant header
    /// lines (heading itself, eyebrow, `From [..](..)`).
    private static func sliceEntry(in full: String, heading: String, eyebrow: String) -> String? {
        let lines = full.components(separatedBy: "\n")
        let headingNeedle = "### " + heading
        let eyebrowNeedle = eyebrow.isEmpty ? nil : "*\(eyebrow)*"

        var startIdx: Int? = nil
        var i = 0
        while i < lines.count {
            if lines[i] == headingNeedle {
                if let needle = eyebrowNeedle {
                    var matched = false
                    let lookahead = min(i + 6, lines.count)
                    for j in (i + 1)..<lookahead {
                        if lines[j].trimmingCharacters(in: .whitespaces) == needle {
                            matched = true; break
                        }
                    }
                    if !matched { i += 1; continue }
                }
                startIdx = i
                break
            }
            i += 1
        }
        guard let start = startIdx else { return nil }
          var end = lines.count
          for k in (start + 1)..<lines.count {
              if CapturesIndex.isCaptureHeadingLine(lines, at: k) { end = k; break }
          }
        var bodyLines = Array(lines[start..<end])
        if let first = bodyLines.first, first == headingNeedle {
            bodyLines.removeFirst()
        }
        while let line = bodyLines.first {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                bodyLines.removeFirst(); continue
            }
            if let needle = eyebrowNeedle, trimmed == needle {
                bodyLines.removeFirst(); continue
            }
            if trimmed.range(of: #"^From \[[^\]]+\]\([^)]+\)\s*$"#, options: .regularExpression) != nil {
                bodyLines.removeFirst(); continue
            }
            break
        }
        return bodyLines.joined(separator: "\n")
    }

    /// Builds the JSON payload for `loom://native/captures-list.json`.
    /// Returns an array of capture entry metadata across every active
    /// root, used by the magazine landing at /loom-render/captures.
    /// Body content is omitted — landing only needs scannable
    /// metadata + snippet.
    ///
    /// Phase D — also attaches `snapshotFilename` per entry when a
    /// `Loom-snapshot-*.html` file exists in the entry's directory. The
    /// landing renders a Snapshot affordance next to the trash icon
    /// when this field is present. Pick the newest snapshot if multiple
    /// exist (re-captures of the same domain accumulate).
    @MainActor
    static func buildCapturesListPayload() -> [String: Any] {
        let entries = CapturesIndex.loadAll()
        let isoFormatter = ISO8601DateFormatter()
        // Per-directory cache so we hit the disk once per domain
        // folder even when there are dozens of entries inside.
        var snapshotCache: [String: String?] = [:]
        let items: [[String: Any]] = entries.map { e in
            var item: [String: Any] = [
                "id": e.id.uuidString,
                "rootID": e.rootID.uuidString.lowercased(),
                "rootLabel": e.rootLabel,
                "kind": e.kind.rawValue,
                "subPath": e.subPath,
                "domain": e.domain,
                "title": e.title,
                "eyebrow": e.eyebrow,
                "snippet": e.snippet,
            ]
            if let ts = e.timestamp {
                item["timestamp"] = isoFormatter.string(from: ts)
                item["timestampEpoch"] = Int(ts.timeIntervalSince1970)
            }
            let dir = e.fileURL.deletingLastPathComponent()
            let dirKey = dir.path
            let resolved: String?
            if let cached = snapshotCache[dirKey] {
                resolved = cached
            } else {
                resolved = newestSnapshotFilename(in: dir)
                snapshotCache[dirKey] = resolved
            }
            if let snap = resolved {
                item["snapshotFilename"] = snap
            }
            return item
        }
        return ["entries": items, "count": entries.count]
    }

    /// Newest `Loom-snapshot-*.html` filename in a directory, or nil.
    /// Sort by filename works because the filenames embed a sortable
    /// `yyyyMMdd-HHmmss` timestamp.
    private static func newestSnapshotFilename(in dir: URL) -> String? {
        let fm = FileManager.default
        guard let contents = try? fm.contentsOfDirectory(atPath: dir.path) else {
            return nil
        }
        let snaps = contents
            .filter { $0.hasPrefix("Loom-snapshot-") && $0.hasSuffix(".html") }
            .sorted()
        return snaps.last
    }

    /// Builds the JSON payload for `loom://native/capture-snapshot.json`.
    /// Query args:
    ///   - root     : root UUID (lower- or upper-case)
    ///   - sub      : sub-path within the root (URL-encoded), typically
    ///                "Web/<domain>" — the directory containing the html
    ///   - filename : html basename, e.g. "Loom-snapshot-20260427-235901-a1b2.html"
    static func buildCaptureSnapshotPayload(query: String) -> [String: Any] {
        let params = parseQuery(query)
        guard let rootStr = params["root"], let rootID = UUID(uuidString: rootStr) else {
            return ["found": false, "error": "missing or malformed root"]
        }
        let sub = params["sub"] ?? ""
        guard let filename = params["filename"], !filename.isEmpty else {
            return ["found": false, "error": "missing filename"]
        }
        // Sanity: only allow `Loom-snapshot-*.html` filenames so the
        // bridge can't be coerced into reading arbitrary files in the
        // sandbox. Path traversal segments are also rejected.
        guard filename.hasPrefix("Loom-snapshot-"),
              filename.hasSuffix(".html"),
              !filename.contains("/"),
              !filename.contains("..") else {
            return ["found": false, "error": "rejected filename"]
        }
        // Re-use the same dir resolution as the per-domain Loom.md so
        // the writer + reader agree on the location.
        let mdURL = LoomFileStore.loomMDURL(for: rootID, subPath: sub)
        let htmlURL = mdURL.deletingLastPathComponent().appendingPathComponent(filename)
        guard FileManager.default.fileExists(atPath: htmlURL.path),
              let html = try? String(contentsOf: htmlURL, encoding: .utf8) else {
            return ["found": false, "error": "no snapshot at \(htmlURL.path)"]
        }
        return [
            "found": true,
            "html": html,
            "filename": filename,
            "fileURL": htmlURL.path,
            "byteLen": html.utf8.count,
        ]
    }

    // MARK: - Capture metadata sidecar
    //
    // Per-capture state (starred / tags / readProgress / lastVisited)
    // is persisted as a JSON sidecar next to each `Loom.md`:
    //
    //   <store>/<rootID>/Loom-metadata.json
    //   <store>/<rootID>/sub/<...>/Loom-metadata.json
    //
    // Schema (file-level):
    //   {
    //     "version": 1,
    //     "entries": {
    //       "<title>:<eyebrow>": {
    //         "starred": Bool,
    //         "tags": [String],
    //         "readProgress": Number,    // 0…100
    //         "lastVisited": Number      // ms since epoch
    //       }
    //     }
    //   }
    //
    // The sidecar groups every entry inside its parent Loom.md so the
    // page directory stays tidy (one `Loom.md` ↔ one
    // `Loom-metadata.json`). The bulk-read endpoint then re-keys each
    // entry under `<rootID>:<title>:<eyebrow>` so the magazine landing
    // can hydrate by stableKey directly.
    //
    // Writes go through atomic `Data.write(to:options:.atomic)` so a
    // crash mid-write can never leave a half-truncated file. Reads
    // handle missing / unparseable / wrong-shape files gracefully —
    // any of those return an empty entry map.

    /// Sidecar JSON file for a given Loom.md location. The sidecar
    /// lives in the same directory as `Loom.md` and shares its
    /// directory-creation guarantees (LoomFileStore creates parents
    /// on demand).
    private static func metadataSidecarURL(for rootID: UUID, subPath: String) -> URL {
        let mdURL = LoomFileStore.loomMDURL(for: rootID, subPath: subPath)
        return mdURL.deletingLastPathComponent()
            .appendingPathComponent("Loom-metadata.json")
    }

    /// Decodes a sidecar at the given URL. Missing / corrupted files
    /// return an empty (`version: 1`, no entries) document so callers
    /// can treat absence and emptiness uniformly.
    private static func readMetadataSidecar(at url: URL) -> [String: Any] {
        let fm = FileManager.default
        guard fm.fileExists(atPath: url.path),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let dict = obj as? [String: Any] else {
            return ["version": 1, "entries": [String: Any]()]
        }
        // Defensive: ensure `entries` is always a dict the caller can
        // mutate. Drops malformed shapes silently rather than blowing
        // up the read on a one-line corruption.
        var out = dict
        if !(out["entries"] is [String: Any]) {
            out["entries"] = [String: Any]()
        }
        out["version"] = 1
        return out
    }

    /// Atomically writes the sidecar. Uses `.atomic` so partial
    /// writes can't leave the file in a corrupt state.
    private static func writeMetadataSidecar(_ doc: [String: Any], to url: URL) throws {
        let data = try JSONSerialization.data(
            withJSONObject: doc,
            options: [.prettyPrinted, .sortedKeys]
        )
        try data.write(to: url, options: [.atomic])
    }

    /// Builds a single `MetadataValue` dict from the persisted entry
    /// shape. Always returns the four fields with sensible defaults
    /// so the JS side never has to handle missing keys.
    private static func metadataValuePayload(from raw: Any?) -> [String: Any] {
        let entry = raw as? [String: Any] ?? [:]
        let starred = entry["starred"] as? Bool ?? false
        let tags = (entry["tags"] as? [String]) ?? []
        let readProgress: Double = {
            if let n = entry["readProgress"] as? Double { return n }
            if let n = entry["readProgress"] as? Int { return Double(n) }
            return 0
        }()
        let lastVisited: Double = {
            if let n = entry["lastVisited"] as? Double { return n }
            if let n = entry["lastVisited"] as? Int { return Double(n) }
            return 0
        }()
        return [
            "starred": starred,
            "tags": tags,
            "readProgress": readProgress,
            "lastVisited": lastVisited,
        ]
    }

    /// Single-entry read OR write. The query carries `op=set` for
    /// writes and any of the four updatable fields (`starred`,
    /// `tags`, `readProgress`, `lastVisited`); only fields present
    /// in the query are mutated, so the caller can patch one field
    /// without echoing the rest.
    static func handleCaptureMetadataRequest(query: String) -> [String: Any] {
        let params = parseQuery(query)
        guard let rootStr = params["root"], let rootID = UUID(uuidString: rootStr) else {
            return ["ok": false, "error": "missing or malformed root"]
        }
        let sub = params["sub"] ?? ""
        let title = params["title"] ?? ""
        let eyebrow = params["eyebrow"] ?? ""
        let key = "\(title):\(eyebrow)"
        let sidecarURL = metadataSidecarURL(for: rootID, subPath: sub)
        let isWrite = (params["op"] ?? "") == "set"

        var doc = readMetadataSidecar(at: sidecarURL)
        var entries = (doc["entries"] as? [String: Any]) ?? [:]

        if isWrite {
            var current = (entries[key] as? [String: Any]) ?? [:]
            if let s = params["starred"] {
                current["starred"] = (s == "1" || s.lowercased() == "true")
            }
            if let raw = params["tags"] {
                if raw.isEmpty {
                    current["tags"] = [String]()
                } else {
                    let arr = raw
                        .split(separator: ",", omittingEmptySubsequences: true)
                        .map { String($0).trimmingCharacters(in: .whitespaces) }
                        .filter { !$0.isEmpty }
                    current["tags"] = arr
                }
            }
            if let rp = params["readProgress"], let n = Double(rp) {
                current["readProgress"] = max(0, min(100, n))
            }
            if let lv = params["lastVisited"], let n = Double(lv) {
                current["lastVisited"] = max(0, n)
            }

            // Strip if nothing left worth persisting (all defaults).
            // Keeps the sidecar from accumulating phantom keys after
            // the user un-stars + clears tags.
            let starred = current["starred"] as? Bool ?? false
            let tags = (current["tags"] as? [String]) ?? []
            let rp = (current["readProgress"] as? Double) ?? 0
            let lv = (current["lastVisited"] as? Double) ?? 0
            if !starred && tags.isEmpty && rp == 0 && lv == 0 {
                entries.removeValue(forKey: key)
            } else {
                entries[key] = current
            }
            doc["entries"] = entries

            do {
                try writeMetadataSidecar(doc, to: sidecarURL)
                return ["ok": true]
            } catch {
                return ["ok": false, "error": "write failed: \(error.localizedDescription)"]
            }
        }

        // Read path
        var payload = metadataValuePayload(from: entries[key])
        payload["found"] = entries[key] != nil
        payload["ok"] = true
        return payload
    }

    /// Bulk read across every active root. Walks each root's page
    /// directory recursively for `Loom-metadata.json` sidecars, then
    /// re-keys each entry under the JS `stableKeyOf` shape:
    ///   `${rootID}:${title}:${eyebrow}`
    /// so the captures landing can hydrate via a single fetch.
    static func buildCaptureMetadataAllPayload() -> [String: Any] {
        let roots = CapturesIndex.rootsForCaptureScan()
        var entries: [String: Any] = [:]
        let fm = FileManager.default
        for root in roots {
            let rootIDLower = root.id.uuidString.lowercased()
            let pageDir = LoomFileStore.pageDirectoryURL(for: root.id)
            guard let walker = fm.enumerator(
                at: pageDir,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles]
            ) else { continue }
            for case let url as URL in walker {
                guard url.lastPathComponent == "Loom-metadata.json" else { continue }
                let doc = readMetadataSidecar(at: url)
                guard let fileEntries = doc["entries"] as? [String: Any] else { continue }
                for (innerKey, raw) in fileEntries {
                    // innerKey is `<title>:<eyebrow>`. The bulk-read
                    // shape is `<rootID>:<title>:<eyebrow>` so we just
                    // prefix with the root id.
                    let stableKey = "\(rootIDLower):\(innerKey)"
                    entries[stableKey] = metadataValuePayload(from: raw)
                }
            }
        }
        return ["version": 1, "entries": entries]
    }

    /// JSON-shaped mirror of CaptureShapeDetector.parseListItems —
    /// returns `[String: Any]` arrays the Next.js side can consume
    /// directly without re-parsing markdown.
    private static func parseListItemsForJSON(from markdown: String) -> [[String: Any]] {
        let titlePattern = #"^(\d+)\.\s+\[(.+?)\]\((.+?)\)(?:\s+_\((.+?)\)_)?\s*$"#
        let mdLinkPattern = #"\[(.+?)\]\((.+?)\)"#
        guard let titleRegex = try? NSRegularExpression(pattern: titlePattern),
              let linkRegex = try? NSRegularExpression(pattern: mdLinkPattern) else {
            return []
        }
        let lines = markdown.components(separatedBy: "\n")
        var out: [[String: Any]] = []
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let ns = line as NSString
            if let m = titleRegex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)),
               m.numberOfRanges >= 4 {
                let rank = Int(ns.substring(with: m.range(at: 1))) ?? 0
                let title = ns.substring(with: m.range(at: 2))
                let url = ns.substring(with: m.range(at: 3))
                var domain: String? = nil
                let dr = m.range(at: 4)
                if dr.location != NSNotFound {
                    domain = ns.substring(with: dr)
                }

                var metaPlain: [String] = []
                var metaTailLabel: String? = nil
                var metaTailURL: String? = nil
                if i + 1 < lines.count {
                    let metaLine = lines[i + 1].trimmingCharacters(in: .whitespaces)
                    if !metaLine.isEmpty && !metaLine.hasPrefix("#") {
                        let metaNS = metaLine as NSString
                        let matches = linkRegex.matches(in: metaLine, range: NSRange(location: 0, length: metaNS.length))
                        if let lm = matches.last {
                            metaTailLabel = metaNS.substring(with: lm.range(at: 1))
                            metaTailURL = metaNS.substring(with: lm.range(at: 2))
                        }
                        let stripped = linkRegex.stringByReplacingMatches(
                            in: metaLine,
                            range: NSRange(location: 0, length: metaNS.length),
                            withTemplate: ""
                        )
                        metaPlain = stripped
                            .components(separatedBy: " · ")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .filter { !$0.isEmpty }
                        i += 1
                    }
                }
                var item: [String: Any] = [
                    "rank": rank,
                    "title": title,
                    "url": url,
                    "metaPlain": metaPlain,
                ]
                if let d = domain { item["domain"] = d }
                if let tl = metaTailLabel { item["metaTailLabel"] = tl }
                if let tu = metaTailURL { item["metaTailURL"] = tu }
                out.append(item)
            }
            i += 1
        }
        return out
    }

    /// Keep the list renderer for pure link-digest captures only. Mixed
    /// articles can legitimately contain three numbered links, code blocks,
    /// images, or provider video markers; those must still flow through the
    /// article/media renderer instead of being swallowed by the magazine list.
    private static func isPrimarilyListCapture(_ markdown: String, parsedItemCount: Int) -> Bool {
        guard parsedItemCount >= 3 else { return false }
        let titlePattern = #"^(\d+)\.\s+\[(.+?)\]\((.+?)\)(?:\s+_\((.+?)\)_)?\s*$"#
        let linkPattern = #"\[[^\]]+\]\([^)]+\)"#
        guard let titleRegex = try? NSRegularExpression(pattern: titlePattern),
              let linkRegex = try? NSRegularExpression(pattern: linkPattern) else {
            return false
        }
        let lines = markdown.components(separatedBy: "\n")
        var i = 0
        var recognizedItems = 0

        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty {
                i += 1
                continue
            }

            let ns = line as NSString
            if titleRegex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) != nil {
                recognizedItems += 1
                i += 1
                if i < lines.count {
                    let meta = lines[i].trimmingCharacters(in: .whitespacesAndNewlines)
                    let metaNS = meta as NSString
                    let hasLinks = linkRegex.firstMatch(in: meta, range: NSRange(location: 0, length: metaNS.length)) != nil
                    let looksLikeMeta = !meta.isEmpty
                        && !meta.hasPrefix("#")
                        && titleRegex.firstMatch(in: meta, range: NSRange(location: 0, length: metaNS.length)) == nil
                        && (hasLinks || meta.contains(" · ") || meta.count <= 180)
                    if looksLikeMeta {
                        i += 1
                    }
                }
                continue
            }

            // Any semantic article/media/code structure means this is not a
            // pure digest list, even if it also contains several numbered links.
            if trimmed.hasPrefix("#")
                || trimmed.hasPrefix("```")
                || trimmed.hasPrefix("~~~")
                || trimmed.hasPrefix("<!-- loom-embed")
                || trimmed.localizedCaseInsensitiveContains("<img")
                || trimmed.localizedCaseInsensitiveContains("<video")
                || trimmed.localizedCaseInsensitiveContains("<iframe") {
                return false
            }

            return false
        }

        return recognizedItems >= 3
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
