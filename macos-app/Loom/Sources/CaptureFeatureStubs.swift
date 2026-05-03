import Foundation
import SwiftUI
import WebKit
import AppKit

// =============================================================================
// Capture feature — captures index + sidebar list view.
//
// Restored 2026-05-02 after the audit commit (718b1e3) replaced the prior
// implementation with empty stubs to unblock the build. The minimal-mode
// rewrite (commit 7351784) wired call sites for `CapturesView`,
// `WebCaptureSetupView`, and `CapturesIndex` (entry/root/kind types) but
// the implementations only existed in an uncommitted working tree. Once the
// committed branch was rebuilt fresh, the captures index showed empty and
// the sidebar route rendered "Capture feature is in progress."
//
// This restoration provides:
//   - `CapturesIndex.loadAll()` walks `LoomFileStore.rootURL`, parses every
//     `Loom.md` for `### Title` entries with their `*eyebrow*` line,
//     timestamp, snippet, and source domain.
//   - `CapturesIndex.rootsForCaptureScan()` enumerates known content roots.
//   - `CapturesIndex.isCaptureHeadingLine(_:at:)` recognises level-3
//     headings used as capture entry markers.
//   - `CapturesView` renders the entries grouped by recency with a
//     domain badge + snippet preview. Tapping a row navigates to the
//     capture renderer via the same `loom://bundle/loom-render/capture/`
//     URL the LoomURLSchemeHandler already resolves.
// =============================================================================

struct CaptureKind: RawRepresentable, Equatable {
    let rawValue: String
    init(rawValue: String) { self.rawValue = rawValue }
    static let web = CaptureKind(rawValue: "web")
    static let inbox = CaptureKind(rawValue: "inbox")
    static let page = CaptureKind(rawValue: "page")
}

struct CaptureEntry: Identifiable {
    let id: UUID
    let rootID: UUID
    let rootLabel: String
    let kind: CaptureKind
    let subPath: String
    let domain: String
    let title: String
    let eyebrow: String
    let snippet: String
    let timestamp: Date?
    let fileURL: URL
}

struct CaptureRoot {
    let id: UUID
}

enum CapturesIndex {
    /// Returns true when `lines[index]` is a level-3 heading used as a
    /// capture entry marker (`### Some Title`).
    ///
    /// A capture entry heading is distinguished from a regular h3
    /// sub-section inside body content by the presence of an
    /// `*eyebrow*` line within the next few lines. Body sub-headings
    /// like `### Panels` or `### Cabling` don't carry an eyebrow, so
    /// they get filtered out and stay part of their parent capture.
    static func isCaptureHeadingLine(_ lines: [String], at index: Int) -> Bool {
        guard index >= 0 && index < lines.count else { return false }
        let raw = lines[index]
        guard raw.hasPrefix("### ") else { return false }
        let title = raw.dropFirst(4).trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return false }
        let lookahead = min(index + 6, lines.count)
        for j in (index + 1)..<lookahead {
            let trimmed = lines[j].trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }
            // First non-blank line wins. If it is an `*…*` eyebrow this
            // is a capture entry; otherwise it's a body sub-heading.
            return trimmed.hasPrefix("*") && trimmed.hasSuffix("*") && trimmed.count > 2
        }
        return false
    }

    /// Enumerates the `<rootID>` directories under `LoomFileStore.rootURL`.
    static func rootsForCaptureScan() -> [CaptureRoot] {
        let fm = FileManager.default
        let root = LoomFileStore.rootURL
        guard let entries = try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) else {
            return []
        }
        var out: [CaptureRoot] = []
        for url in entries {
            let isDir = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
            guard isDir else { continue }
            if let id = UUID(uuidString: url.lastPathComponent) {
                out.append(CaptureRoot(id: id))
            }
        }
        return out
    }

    /// Walks every `Loom.md` under each capture root and parses
    /// `### Title` entries into `CaptureEntry` rows. Newest first.
    static func loadAll() -> [CaptureEntry] {
        let fm = FileManager.default
        let storeRoot = LoomFileStore.rootURL
        var out: [CaptureEntry] = []
        for root in rootsForCaptureScan() {
            let rootDir = storeRoot.appendingPathComponent(root.id.uuidString.lowercased(), isDirectory: true)
            let rootLabel = rootDisplayLabel(in: rootDir)
            guard let enumerator = fm.enumerator(at: rootDir, includingPropertiesForKeys: [.isRegularFileKey], options: [.skipsHiddenFiles]) else {
                continue
            }
            for case let url as URL in enumerator {
                guard url.lastPathComponent == "Loom.md" else { continue }
                let entries = parseEntries(at: url, rootID: root.id, rootLabel: rootLabel)
                out.append(contentsOf: entries)
            }
        }
        return out.sorted { (a, b) in
            switch (a.timestamp, b.timestamp) {
            case let (lhs?, rhs?): return lhs > rhs
            case (.some, .none): return true
            case (.none, .some): return false
            case (.none, .none): return a.title < b.title
            }
        }
    }

    private static func rootDisplayLabel(in rootDir: URL) -> String {
        let topMD = rootDir.appendingPathComponent("Loom.md")
        if let text = try? String(contentsOf: topMD, encoding: .utf8) {
            for line in text.components(separatedBy: "\n") {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("# ") {
                    return String(trimmed.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                }
            }
        }
        return rootDir.lastPathComponent
    }

    private static func parseEntries(at fileURL: URL, rootID: UUID, rootLabel: String) -> [CaptureEntry] {
        guard let text = try? String(contentsOf: fileURL, encoding: .utf8) else { return [] }
        let lines = text.components(separatedBy: "\n")

        // Derive the sub-path under <rootID>/sub/... so the renderer
        // can re-fetch the entry via capture-content.json.
        let subPath = derivedSubPath(fileURL: fileURL, rootID: rootID)
        let domain = derivedDomain(fromSubPath: subPath, fallbackHost: "")

        var entries: [CaptureEntry] = []
        var i = 0
        while i < lines.count {
            guard isCaptureHeadingLine(lines, at: i) else { i += 1; continue }
            let title = String(lines[i].dropFirst(4)).trimmingCharacters(in: .whitespaces)

            var eyebrow = ""
            var timestamp: Date? = nil
            var bodyStart = i + 1
            // Eyebrow is the first non-empty line within the next ~5
            // lines, wrapped in `*…*`.
            let lookahead = min(i + 6, lines.count)
            for j in (i + 1)..<lookahead {
                let trimmed = lines[j].trimmingCharacters(in: .whitespaces)
                if trimmed.isEmpty { continue }
                if trimmed.hasPrefix("*") && trimmed.hasSuffix("*") && trimmed.count > 2 {
                    eyebrow = String(trimmed.dropFirst().dropLast())
                    timestamp = parseTimestamp(fromEyebrow: eyebrow)
                    bodyStart = j + 1
                }
                break
            }

            // Snippet — first ~200 chars of body after blank lines and
            // the optional `From [..](..)` line.
            var bodyEnd = lines.count
            for k in bodyStart..<lines.count {
                if isCaptureHeadingLine(lines, at: k) { bodyEnd = k; break }
            }
            let bodyChunk = bodyLines(Array(lines[bodyStart..<bodyEnd]))
            let snippet = bodySnippet(bodyChunk, max: 200)

            let kind: CaptureKind = subPath.hasPrefix("Web/") ? .web : (subPath == "Inbox" ? .inbox : .page)
            let entry = CaptureEntry(
                id: UUID(),
                rootID: rootID,
                rootLabel: rootLabel,
                kind: kind,
                subPath: subPath,
                domain: domain.isEmpty ? rootLabel : domain,
                title: title,
                eyebrow: eyebrow,
                snippet: snippet,
                timestamp: timestamp ?? fileModificationDate(fileURL),
                fileURL: fileURL
            )
            entries.append(entry)
            i = bodyEnd
        }
        return entries
    }

    private static func derivedSubPath(fileURL: URL, rootID: UUID) -> String {
        // <store>/<rootID>/sub/<subPath...>/Loom.md
        // <store>/<rootID>/Loom.md → ""
        let parent = fileURL.deletingLastPathComponent().path
        let rootPrefix = LoomFileStore.rootURL.appendingPathComponent(rootID.uuidString.lowercased()).path
        guard parent.hasPrefix(rootPrefix) else { return "" }
        var rel = String(parent.dropFirst(rootPrefix.count))
        rel = rel.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if rel.hasPrefix("sub/") { rel = String(rel.dropFirst(4)) }
        else if rel == "sub" { rel = "" }
        return rel
    }

    private static func derivedDomain(fromSubPath subPath: String, fallbackHost: String) -> String {
        let parts = subPath.split(separator: "/").map(String.init)
        if parts.count >= 2 && parts[0] == "Web" { return parts[1] }
        return fallbackHost
    }

    private static func parseTimestamp(fromEyebrow eyebrow: String) -> Date? {
        // Eyebrow shape: "clipboard · 2026-05-02 22:55 · [↗](https://…)"
        let pattern = #"(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let ns = eyebrow as NSString
        guard let match = regex.firstMatch(in: eyebrow, range: NSRange(location: 0, length: ns.length)) else { return nil }
        var components = DateComponents()
        components.year = Int(ns.substring(with: match.range(at: 1)))
        components.month = Int(ns.substring(with: match.range(at: 2)))
        components.day = Int(ns.substring(with: match.range(at: 3)))
        components.hour = Int(ns.substring(with: match.range(at: 4)))
        components.minute = Int(ns.substring(with: match.range(at: 5)))
        return Calendar.current.date(from: components)
    }

    private static func fileModificationDate(_ url: URL) -> Date? {
        let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
        return attrs?[.modificationDate] as? Date
    }

    private static func bodyLines(_ raw: [String]) -> [String] {
        var lines = raw
        while let first = lines.first {
            let trimmed = first.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("*") || trimmed.range(of: #"^From \[[^\]]+\]\([^)]+\)\s*$"#, options: .regularExpression) != nil {
                lines.removeFirst()
            } else {
                break
            }
        }
        return lines
    }

    private static func bodySnippet(_ lines: [String], max: Int) -> String {
        let joined = lines.joined(separator: " ")
            // Strip Loom capture metadata comments and any other HTML
            // comments so the snippet shows readable prose, not the
            // `<!-- loom-capture-diagnostics: {...} -->` payload that
            // sits on top of every freshly captured entry.
            .replacingOccurrences(of: "<!--[\\s\\S]*?-->", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        guard joined.count > max else { return joined }
        let cutoff = joined.index(joined.startIndex, offsetBy: max)
        return String(joined[..<cutoff]) + "…"
    }
}

private struct CapturesViewState {
    var entries: [CaptureEntry] = []
    var loaded = false
    var openEntry: CaptureEntry? = nil
}

struct CapturesView: View {
    let refreshToken: Int
    let themeMode: String

    @State private var state = CapturesViewState()

    var body: some View {
        Group {
            if let entry = state.openEntry {
                CaptureRenderPane(entry: entry, onClose: { state.openEntry = nil })
            } else if !state.loaded {
                ProgressView("Loading captures…")
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if state.entries.isEmpty {
                VStack(spacing: 8) {
                    Text("No captures yet")
                        .font(.title3)
                    Text("Use the Loom browser extension or paste content from the clipboard to capture a page.")
                        .font(.callout)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 360)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                CapturesListBody(entries: state.entries) { entry in
                    state.openEntry = entry
                }
            }
        }
        .onAppear { reload() }
        .onChange(of: refreshToken) { _ in reload() }
    }

    private func reload() {
        state.entries = CapturesIndex.loadAll()
        state.loaded = true
    }
}

private struct CapturesListBody: View {
    let entries: [CaptureEntry]
    let onOpen: (CaptureEntry) -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Captures")
                    .font(.system(size: 28, weight: .regular, design: .serif))
                    .padding(.horizontal, 24)
                    .padding(.top, 28)
                    .padding(.bottom, 4)
                Text("\(entries.count) total")
                    .font(.system(size: 12, design: .serif))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 24)
                    .padding(.bottom, 16)
                ForEach(entries) { entry in
                    CapturesRow(entry: entry, onOpen: onOpen)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 4)
                }
                Spacer(minLength: 24)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct CapturesRow: View {
    let entry: CaptureEntry
    let onOpen: (CaptureEntry) -> Void

    var body: some View {
        Button(action: { onOpen(entry) }) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(entry.domain.uppercased())
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .foregroundColor(.secondary)
                        .tracking(0.5)
                    Text(entry.title)
                        .font(.system(size: 15, weight: .regular, design: .serif))
                        .foregroundColor(.primary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if !entry.snippet.isEmpty {
                        Text(entry.snippet)
                            .font(.system(size: 12, design: .serif))
                            .foregroundColor(.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }
                Spacer(minLength: 8)
                if let ts = entry.timestamp {
                    Text(relativeAgo(ts))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.secondary)
                        .fixedSize()
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func relativeAgo(_ date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86_400 { return "\(Int(interval / 3600))h ago" }
        let days = Int(interval / 86_400)
        if days < 30 { return "\(days)d ago" }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

// MARK: - Capture render pane (in-app WKWebView)
//
// `NSWorkspace.shared.open` on a `loom://` URL fails because the OS
// has no app registered for that scheme — the scheme handler only lives
// inside WKWebViews configured with `setURLSchemeHandler`. This view
// hosts a dedicated WKWebView with `LoomURLSchemeHandler` attached and
// loads the per-entry capture URL there, keeping rendering in-app.

private struct CaptureRenderPane: View {
    let entry: CaptureEntry
    let onClose: () -> Void

    var body: some View {
        // Fill the whole pane with the WKWebView so its internal
        // NSScrollView gets a proper layout context (this was the cause
        // of the scroll-stuck regression — wrapping the web view in a
        // VStack stacked layout with `.frame(maxHeight: .infinity)`
        // didn't give the underlying NSView a bounded height to scroll
        // within). The back-link sits as a floating overlay top-left
        // and a domain badge top-right so they don't reduce the web
        // view's available space.
        CaptureRenderWebView(url: captureURL(for: entry))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(alignment: .topLeading) {
                Button(action: onClose) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("Captures")
                    }
                    .font(.system(size: 12, design: .serif))
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                }
                .buttonStyle(.plain)
                .padding(12)
            }
            .overlay(alignment: .topTrailing) {
                Text(entry.domain.uppercased())
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.secondary)
                    .tracking(0.5)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.ultraThinMaterial, in: Capsule())
                    .padding(12)
            }
    }

    private func captureURL(for entry: CaptureEntry) -> URL {
        var components = URLComponents()
        components.scheme = "loom"
        components.host = "bundle"
        components.path = "/loom-render/capture/"
        components.queryItems = [
            URLQueryItem(name: "root", value: entry.rootID.uuidString.lowercased()),
            URLQueryItem(name: "sub", value: entry.subPath),
            URLQueryItem(name: "title", value: entry.title),
            URLQueryItem(name: "eyebrow", value: entry.eyebrow),
        ]
        return components.url ?? URL(string: "loom://bundle/loom-render/capture/")!
    }
}

private struct CaptureRenderWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        #if DEBUG
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        #endif
        config.applicationNameForUserAgent = "LoomAppShell"

        var hostRoots: [String: URL] = [:]
        let contentRoots = ContentRootStore.allActiveURLs
        if let firstRootURL = contentRoots.values.first {
            hostRoots["content"] = firstRootURL
        } else if let contentRootPath = LoomRuntimePaths.resolveContentRoot() {
            hostRoots["content"] = URL(fileURLWithPath: contentRootPath)
        }
        if let override = ProcessInfo.processInfo.environment["LOOM_STATIC_EXPORT"],
           FileManager.default.fileExists(atPath: override) {
            hostRoots["bundle"] = URL(fileURLWithPath: override)
        } else if let projectRoot = ProcessInfo.processInfo.environment["LOOM_PROJECT_ROOT"] {
            let exportPath = projectRoot + "/.next-export"
            if FileManager.default.fileExists(atPath: exportPath) {
                hostRoots["bundle"] = URL(fileURLWithPath: exportPath)
            }
        }
        if hostRoots["bundle"] == nil, let bundleResources = Bundle.main.resourceURL {
            let staged = bundleResources.appendingPathComponent("web")
            hostRoots["bundle"] = FileManager.default.fileExists(atPath: staged.path)
                ? staged
                : bundleResources
        }
        hostRoots["derived"] = URL(fileURLWithPath: LoomRuntimePaths.derivedDataRoot())
        hostRoots["user-data"] = URL(fileURLWithPath: LoomRuntimePaths.userDataRoot())

        let handler = LoomURLSchemeHandler(hostRoots: hostRoots, contentRoots: contentRoots)
        config.setURLSchemeHandler(handler, forURLScheme: LoomURLSchemeHandler.scheme)
        context.coordinator.handler = handler

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: url))
        context.coordinator.lastURL = url
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        if context.coordinator.lastURL?.absoluteString != url.absoluteString {
            context.coordinator.lastURL = url
            webView.load(URLRequest(url: url))
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var handler: LoomURLSchemeHandler?
        var lastURL: URL?
    }
}

struct WebCaptureSetupView: View {
    var body: some View {
        VStack(spacing: 12) {
            Text("Web Capture Setup")
                .font(.title3)
            Text("Setup flow is in progress.")
                .foregroundColor(.secondary)
                .font(.callout)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
