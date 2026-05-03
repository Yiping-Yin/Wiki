import SwiftUI
import AppKit
import WebKit

// MARK: Phase A3 follow-up — Captures browser + bookmarklet setup
//
// Solves the "captures go in but never come out" failure mode every
// PKM tool dies of. After Phase A1+A2+A3, the user has a stream of
// captures landing in `LoomFileStore/<rootID>/sub/{Inbox,Web/*}/`,
// but no in-app surface to browse them. CapturesView fills that gap.
//
// The view scans the file store for every `Loom.md` under any active
// root and parses the entries inside. Each entry surfaces as a row
// with its anchor type (Inbox / Web / Page / Passage), title,
// timestamp, and snippet. Rows are clickable — they reveal the
// underlying Loom.md in Finder for now (in-app rendering is Phase C).
//
// Forward-compat note: when Phase C lands (cluster surfacing + wiki
// distillation), this view's data shape feeds directly into the
// "ripening clusters" view. Don't add UI cruft that tightens to the
// flat-list shape; everything filterable should also be groupable.

// MARK: Model

/// One parsed capture entry from a per-folder Loom.md `## Notes` block.
struct CaptureEntry: Identifiable, Hashable {
    enum Kind: String, CaseIterable, Identifiable {
        case inbox, web, page, passage, other
        var id: String { rawValue }
        var label: String {
            switch self {
            case .inbox:   return "Inbox"
            case .web:     return "Web"
            case .page:    return "Page"
            case .passage: return "Passage"
            case .other:   return "Other"
            }
        }
        var icon: String {
            switch self {
            case .inbox:   return "tray"
            case .web:     return "globe"
            case .page:    return "doc.text"
            case .passage: return "quote.bubble"
            case .other:   return "doc"
            }
        }
    }
    let id: UUID
    let rootID: UUID
    let rootLabel: String
    let kind: Kind
    let subPath: String
    /// Best-effort domain extracted from a `Web/<domain>/` sub-path,
    /// or empty string for non-web captures.
    let domain: String
    let title: String
    let eyebrow: String
    let snippet: String
    let timestamp: Date?
    /// File URL of the Loom.md the entry lives in. Reveal/open uses
    /// this directly; we intentionally don't index entry-line offsets
    /// (a fragile thing to maintain across edits).
    let fileURL: URL
    /// Phase D — newest `Loom-snapshot-*.html` filename in the same
    /// directory as `fileURL`, if any. nil when the directory has no
    /// snapshot. Surfaces as a "Snapshot" affordance in the captures
    /// landing alongside the Reader link.
    var snapshotFilename: String? = nil
}

/// Reads every `Loom.md` under every active root and produces a
/// flat list of `CaptureEntry`. Synchronous — file counts are small
/// (one Loom.md per anchor folder), and the view triggers reload on
/// demand rather than on every render.
enum CapturesIndex {
    static func loadAll() -> [CaptureEntry] {
        let roots = rootsForCaptureScan()
        var entries: [CaptureEntry] = []
        for root in roots {
            entries.append(contentsOf: scanRoot(root))
        }
        // Newest first. Entries with no parsable timestamp sink to
        // the bottom — better than scrambling the top with unknowns.
        entries.sort { lhs, rhs in
            switch (lhs.timestamp, rhs.timestamp) {
            case let (l?, r?): return l > r
            case (_?, nil):    return true
            case (nil, _?):    return false
            case (nil, nil):   return false
            }
        }
        return entries
    }

    /// Prefer registered roots, but never let the captures surface go
    /// blank just because the native shell temporarily cannot read the
    /// root registry. The fallback scans only Loom's managed file store,
    /// never the user's authoritative source folders.
    static func rootsForCaptureScan(fileManager: FileManager = .default) -> [ContentRoot] {
        let stored = ContentRootStore.loadAll()
        if !stored.isEmpty { return stored }
        return storeOnlyFallbackRoots(fileManager: fileManager)
    }

    private static func storeOnlyFallbackRoots(fileManager: FileManager) -> [ContentRoot] {
        let storeRoot = LoomFileStore.rootURL
        guard let contents = try? fileManager.contentsOfDirectory(
            at: storeRoot,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }

        return contents.compactMap { dir -> ContentRoot? in
            guard (try? dir.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) == true,
                  let id = UUID(uuidString: dir.lastPathComponent),
                  containsLoomMarkdown(in: dir, fileManager: fileManager)
            else { return nil }
            let now = Date()
            return ContentRoot(
                id: id,
                displayName: fallbackRootDisplayName(for: dir, id: id),
                description: "",
                externalFolderBookmark: nil,
                addedAt: now,
                updatedAt: now
            )
        }
    }

    private static func containsLoomMarkdown(in dir: URL, fileManager: FileManager) -> Bool {
        if fileManager.fileExists(atPath: dir.appendingPathComponent("Loom.md").path) {
            return true
        }
        guard let walker = fileManager.enumerator(
            at: dir,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return false }
        for case let url as URL in walker where url.lastPathComponent == "Loom.md" {
            return true
        }
        return false
    }

    private static func fallbackRootDisplayName(for dir: URL, id: UUID) -> String {
        let loomMD = dir.appendingPathComponent("Loom.md")
        if let raw = try? String(contentsOf: loomMD, encoding: .utf8),
           let title = raw
            .components(separatedBy: "\n")
            .first(where: { $0.hasPrefix("# ") })?
            .dropFirst(2)
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !title.isEmpty {
            return title
        }
        return "Loom Data \(id.uuidString.prefix(8))"
    }

    private static func scanRoot(_ root: ContentRoot) -> [CaptureEntry] {
        let pageDir = LoomFileStore.pageDirectoryURL(for: root.id)
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(
            at: pageDir,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }

        var out: [CaptureEntry] = []
        for case let url as URL in enumerator {
            guard url.lastPathComponent == "Loom.md" else { continue }
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { continue }
            let subPath = relativeSubPath(of: url, under: pageDir)
            let kind = inferKind(subPath: subPath)
            let domain = inferDomain(subPath: subPath, kind: kind)
            let snapshotFilename = newestSnapshotFilename(in: url.deletingLastPathComponent())
            var parsed = parseEntries(
                from: raw,
                rootID: root.id,
                rootLabel: root.displayName,
                kind: kind,
                subPath: subPath,
                domain: domain,
                fileURL: url
            )
            if let snap = snapshotFilename {
                for i in parsed.indices {
                    parsed[i].snapshotFilename = snap
                }
            }
            out.append(contentsOf: parsed)
        }
        return out
    }

    /// Newest `Loom-snapshot-*.html` filename in a directory, or nil.
    /// Matches `LoomURLSchemeHandler.newestSnapshotFilename` — keeping
    /// both copies parallel for now to avoid introducing a cross-file
    /// dependency just for this helper.
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

    private static func relativeSubPath(of file: URL, under base: URL) -> String {
        let filePath = file.standardizedFileURL.path
        let basePath = base.standardizedFileURL.path
        guard filePath.hasPrefix(basePath) else { return "" }
        let stripped = String(filePath.dropFirst(basePath.count))
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        // Drop trailing "/Loom.md".
        if stripped.hasSuffix("/Loom.md") {
            return String(stripped.dropLast("/Loom.md".count))
        }
        if stripped == "Loom.md" { return "" }
        return stripped
    }

    /// Sub-path layout (set by `LoomFileStore` + `CaptureWriter`):
    ///   - `""`               → root page Loom.md
    ///   - `"sub/Inbox"`      → quick-capture inbox
    ///   - `"sub/Web/<host>"` → web bookmarklet capture
    ///   - `"sub/<other>"`    → folder page (typically a folder home Loom.md)
    private static func inferKind(subPath: String) -> CaptureEntry.Kind {
        if subPath == "sub/Inbox" || subPath == "Inbox" { return .inbox }
        if subPath.hasPrefix("sub/Web/") { return .web }
        if subPath.hasPrefix("sub/") { return .page }
        if subPath.isEmpty { return .page }
        return .other
    }

    private static func inferDomain(subPath: String, kind: CaptureEntry.Kind) -> String {
        guard kind == .web else { return "" }
        // `sub/Web/<host>` → `<host>`
        let parts = subPath.split(separator: "/").map(String.init)
        return parts.count >= 3 ? parts[2] : ""
    }

    /// Parse the `## Notes` block of a Loom.md into individual entries.
    /// Each entry begins with `### <heading>` and runs until the next
    /// `### ` or end of section. We extract heading, eyebrow line (the
    /// `*…*` italic line right after), and a snippet of body.
    private static func parseEntries(
        from source: String,
        rootID: UUID,
        rootLabel: String,
        kind: CaptureEntry.Kind,
        subPath: String,
        domain: String,
        fileURL: URL
    ) -> [CaptureEntry] {
        // Locate `## Notes` body span.
        guard let notesRange = source.range(of: "\n## Notes")
            ?? (source.hasPrefix("## Notes") ? source.range(of: "## Notes") : nil)
        else { return [] }
        let body = source[notesRange.upperBound...]

        // Split on `### ` headings.
        let lines = body.components(separatedBy: "\n")
        var entries: [CaptureEntry] = []
        var currentHeading: String? = nil
        var currentBody: [String] = []
        let tsRegex = try? NSRegularExpression(pattern: #"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}"#)
        let formatter: DateFormatter = {
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd HH:mm"; return f
        }()

        func flush() {
            guard let heading = currentHeading else {
                currentBody.removeAll()
                return
            }
            let blob = currentBody.joined(separator: "\n")
              let trimmed = blob.trimmingCharacters(in: .whitespacesAndNewlines)
              guard !trimmed.isEmpty else {
                  currentBody.removeAll()
                  return
              }
            // Extract eyebrow (first `*…*` line).
            var eyebrow = ""
            for line in trimmed.split(separator: "\n", maxSplits: 4, omittingEmptySubsequences: true) {
                let l = String(line).trimmingCharacters(in: .whitespaces)
                if l.hasPrefix("*") && l.hasSuffix("*") {
                    eyebrow = String(l.dropFirst().dropLast())
                    break
                }
            }
            // Snippet: strip eyebrow + leading blank lines, take ~200 chars.
            var snippetSrc = trimmed
            if !eyebrow.isEmpty {
                let eyebrowLine = "*\(eyebrow)*"
                if let r = snippetSrc.range(of: eyebrowLine) {
                    snippetSrc = String(snippetSrc[r.upperBound...])
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                }
            }
            let snippet: String = {
                // Strip markdown syntax for the row preview — the list
                // is a glance surface, not a code view. Render-fidelity
                // is what the in-Loom reader sheet (Phase C M1) is for.
                let plain = stripMarkdownChrome(snippetSrc)
                let collapsed = plain
                    .replacingOccurrences(of: "\n", with: " ")
                    .replacingOccurrences(of: "  ", with: " ")
                    .trimmingCharacters(in: .whitespaces)
                if collapsed.count <= 220 { return collapsed }
                let cut = collapsed.index(collapsed.startIndex, offsetBy: 220)
                return String(collapsed[..<cut]) + "…"
            }()
            // Pull a timestamp out of eyebrow if present.
            var ts: Date? = nil
            if let regex = tsRegex {
                let ns = eyebrow as NSString
                if let m = regex.firstMatch(in: eyebrow, range: NSRange(location: 0, length: ns.length)) {
                    ts = formatter.date(from: ns.substring(with: m.range))
                }
            }
            entries.append(CaptureEntry(
                id: UUID(),
                rootID: rootID,
                rootLabel: rootLabel,
                kind: kind,
                subPath: subPath,
                domain: domain,
                title: heading,
                eyebrow: eyebrow,
                snippet: snippet,
                timestamp: ts,
                fileURL: fileURL
            ))
            currentBody.removeAll()
        }

        for (idx, line) in lines.enumerated() {
            if isCaptureHeadingLine(lines, at: idx) {
                flush()
                currentHeading = String(line.dropFirst(4)).trimmingCharacters(in: .whitespaces)
            } else if currentHeading != nil {
                currentBody.append(line)
            }
        }
        flush()
        return entries
    }

    static func isCaptureHeadingLine(_ lines: [String], at index: Int) -> Bool {
        guard index >= 0, index < lines.count, lines[index].hasPrefix("### ") else {
            return false
        }
        let lookahead = min(index + 6, lines.count)
        guard index + 1 < lookahead else { return false }
        for j in (index + 1)..<lookahead {
            let trimmed = lines[j].trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }
            return looksLikeCaptureEyebrow(trimmed)
        }
        return false
    }

    static func looksLikeCaptureEyebrow(_ line: String) -> Bool {
        guard line.hasPrefix("*"), line.hasSuffix("*") else { return false }
        let inner = String(line.dropFirst().dropLast())
        return inner.range(
            of: #"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}"#,
            options: .regularExpression
        ) != nil
    }

    /// Convert markdown source to plain-text for the captures list
    /// snippet. Drops link/emphasis/code syntax but preserves the
    /// readable words. Conservative — only strips what we know.
    static func stripMarkdownChrome(_ s: String) -> String {
        var t = s
        // Hidden Loom-owned metadata belongs to the capture file, never to
        // the glance preview. This catches diagnostics, CaptureAST sidecar
        // pointers, and provider markers before markdown flattening.
        t = t.replacingOccurrences(
            of: #"(?s)<!--.*?-->"#,
            with: "",
            options: .regularExpression
        )
        // Drop the writer-injected "From [title](url)" prefix that
        // every web capture starts with. The title is already the
        // row heading; repeating it as a sentence is just chrome.
        if let m = t.range(of: #"^From \[[^\]]+\]\([^)]+\)\s*"#, options: [.regularExpression, .anchored]) {
            t.removeSubrange(m)
        }
        // `[text](url)` → `text`
        t = t.replacingOccurrences(
            of: #"\[([^\]]+)\]\(([^)]+)\)"#,
            with: "$1",
            options: .regularExpression
        )
        // `_text_` (italic / domain wrap) → `text`. Avoid touching `__bold__`
        // by requiring single underscore + non-space neighbors.
        t = t.replacingOccurrences(
            of: #"(?<!\w)_([^_\n]+?)_(?!\w)"#,
            with: "$1",
            options: .regularExpression
        )
        // `**bold**` / `*italic*` → strip wrappers
        t = t.replacingOccurrences(
            of: #"\*\*([^*\n]+?)\*\*"#,
            with: "$1",
            options: .regularExpression
        )
        t = t.replacingOccurrences(
            of: #"(?<!\*)\*([^*\n]+?)\*(?!\*)"#,
            with: "$1",
            options: .regularExpression
        )
        // Inline code: `code` → code
        t = t.replacingOccurrences(
            of: #"`([^`\n]+?)`"#,
            with: "$1",
            options: .regularExpression
        )
        // Heading prefixes at line start.
        t = t.replacingOccurrences(
            of: #"^#+\s+"#,
            with: "",
            options: [.regularExpression, .anchored]
        )
        return t
    }

    /// Removes a `### heading` block (heading + body until next `### `
    /// or EOF) from the entry's Loom.md. Match key is heading title +
    /// nearby eyebrow line — heading alone may collide if the same
    /// page was captured twice; the eyebrow's clipboard timestamp
    /// dedupes. Returns true iff the file was modified.
    @discardableResult
    static func delete(_ entry: CaptureEntry) throws -> Bool {
        let url = entry.fileURL
        let source = try String(contentsOf: url, encoding: .utf8)
        var lines = source.components(separatedBy: "\n")
        let headingNeedle = "### " + entry.title
        let eyebrowNeedle = entry.eyebrow.isEmpty ? nil : "*\(entry.eyebrow)*"

        var startIdx: Int? = nil
        var i = 0
        while i < lines.count {
            if lines[i] == headingNeedle, Self.isCaptureHeadingLine(lines, at: i) {
                if let needle = eyebrowNeedle {
                    var matched = false
                    let lookahead = min(i + 6, lines.count)
                    for j in (i + 1)..<lookahead {
                        if lines[j].trimmingCharacters(in: .whitespaces) == needle {
                            matched = true
                            break
                        }
                    }
                    if !matched { i += 1; continue }
                }
                startIdx = i
                break
            }
            i += 1
        }
        guard let start = startIdx else { return false }

        var end = lines.count
        for k in (start + 1)..<lines.count {
            if Self.isCaptureHeadingLine(lines, at: k) { end = k; break }
        }
        // Trim trailing blank lines so we don't leave a widening gap
        // each time a delete happens.
        while end > start + 1 && lines[end - 1].isEmpty { end -= 1 }

        lines.removeSubrange(start..<end)
        let rewritten = lines.joined(separator: "\n")
        try rewritten.write(to: url, atomically: true, encoding: .utf8)
        return true
    }
}

// MARK: CapturesView

struct CapturesView: View {
    let refreshToken: Int
    private let themeMode: String

    init(refreshToken: Int = 0, themeMode: String = "light") {
        self.refreshToken = refreshToken
        self.themeMode = themeMode
    }

    @State private var entries: [CaptureEntry] = []
    @State private var query: String = ""
    @State private var kindFilter: CaptureEntry.Kind? = nil
    @State private var refreshTick: Int = 0
    @State private var pendingDelete: CaptureEntry? = nil
    @State private var deleteError: String? = nil
    @State private var presentingCapture: CaptureEntry? = nil

    /// Phase C M2 toggle. When false, CapturesView hosts the Next.js
    /// magazine landing in a webview. When true, falls back to the
    /// native SwiftUI flat list (kept until delete + reveal parity
    /// is wired back through a webview message bridge).
    private let useNativeList: Bool = false

    private var capturesLandingURL: URL? {
        URL(string: "loom://bundle/loom-render/captures/?refresh=\(refreshToken)")
    }

    var body: some View {
        // Phase C M2 magazine landing — render the captures index
        // through Next.js at /loom-render/captures (PageFrame +
        // pivot bar + CollapseSection per-time-bucket). Row clicks
        // navigate within the same webview to /loom-render/capture/
        // for detail. Browser-style back returns to the magazine.
        //
        // The native SwiftUI list path (header + filters + delete +
        // reveal-in-Finder) is preserved as a fallback hidden behind
        // a `useNativeList` toggle below — keep its codepath alive
        // until the magazine view gets parity for delete / reveal.
        Group {
            if useNativeList, let entry = presentingCapture {
                CaptureReaderView(entry: entry, themeMode: themeMode) {
                    presentingCapture = nil
                }
            } else if useNativeList {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    Divider()
                    if entries.isEmpty {
                        emptyState
                    } else {
                        content
                    }
                }
            } else if let url = capturesLandingURL {
                CaptureWebView(url: url, themeMode: themeMode)
            } else {
                Text("Couldn't construct captures URL")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .padding(24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(NSColor.windowBackgroundColor))
        .onAppear { reload() }
        // Removed onReceive of .loomRefreshActivePage — when in webview
        // mode this triggers `reload()` which mutates @State `entries`,
        // causing SwiftUI to re-evaluate body + re-diff CaptureWebView,
        // which in turn can interrupt the webview's running scroll /
        // hydration. The webview fetches its own data via
        // `loom://native/captures-list.json` on mount, so refreshing
        // SwiftUI-side entries is redundant + harmful here.
        .alert(
            "Delete this capture?",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }
            ),
            presenting: pendingDelete
        ) { e in
            Button("Delete", role: .destructive) {
                do {
                    try CapturesIndex.delete(e)
                    reload()
                } catch {
                    deleteError = error.localizedDescription
                }
                pendingDelete = nil
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: { e in
            Text("\(e.title.isEmpty ? "(untitled)" : e.title) — rewrites \(e.fileURL.lastPathComponent) to remove this entry. The Loom.md keeps everything else.")
        }
        .alert(
            "Couldn't delete capture",
            isPresented: Binding(
                get: { deleteError != nil },
                set: { if !$0 { deleteError = nil } }
            ),
            presenting: deleteError
        ) { _ in
            Button("OK", role: .cancel) { deleteError = nil }
        } message: { msg in
            Text(msg)
        }
    }

    private func reload() {
        entries = CapturesIndex.loadAll()
        refreshTick &+= 1
    }

    @ViewBuilder
    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text("Captures")
                    .font(.system(size: 24, weight: .semibold, design: .serif))
                Text("\(filtered.count)")
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(.secondary)
                Spacer()
                Button {
                    reload()
                } label: {
                    Label("Reload", systemImage: "arrow.clockwise")
                        .font(.system(size: 11, design: .serif))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.tertiary)
                    .font(.system(size: 11))
                TextField("Filter by title or snippet…", text: $query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12, design: .serif))
                if !query.isEmpty {
                    Button { query = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.secondary.opacity(0.08))
            )
            HStack(spacing: 4) {
                kindChip(label: "All", isSelected: kindFilter == nil) { kindFilter = nil }
                ForEach(CaptureEntry.Kind.allCases) { k in
                    let count = entries.filter { $0.kind == k }.count
                    if count > 0 {
                        kindChip(
                            label: "\(k.label) · \(count)",
                            isSelected: kindFilter == k
                        ) {
                            kindFilter = (kindFilter == k) ? nil : k
                        }
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 24)
        .padding(.top, 24)
        .padding(.bottom, 12)
    }

    @ViewBuilder
    private func kindChip(label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 10, design: .serif).smallCaps())
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(
                    Capsule().fill(
                        isSelected ? Color.accentColor.opacity(0.18) : Color.secondary.opacity(0.08)
                    )
                )
                .overlay(
                    Capsule().stroke(
                        isSelected ? Color.accentColor.opacity(0.45) : Color.secondary.opacity(0.2),
                        lineWidth: 1
                    )
                )
        }
        .buttonStyle(.plain)
    }

    private var filtered: [CaptureEntry] {
        let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        return entries.filter { e in
            if let k = kindFilter, e.kind != k { return false }
            if q.isEmpty { return true }
            return e.title.lowercased().contains(q)
                || e.snippet.lowercased().contains(q)
                || e.domain.lowercased().contains(q)
                || e.rootLabel.lowercased().contains(q)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "tray")
                .font(.system(size: 32))
                .foregroundStyle(.tertiary)
            Text("No captures yet.")
                .font(.system(size: 14, design: .serif))
                .foregroundStyle(.secondary)
            Text("⌘⇧L for a quick note · ⌘⇧V on a PDF selection · install the Web Capture bookmarklet to clip from any browser.")
                .font(.system(size: 11, design: .serif))
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 60)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private var content: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                ForEach(filtered) { e in
                    captureRow(e)
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 16)
        }
    }

    @ViewBuilder
    private func captureRow(_ e: CaptureEntry) -> some View {
        // Don't use a Button as the outer container: nested Buttons on
        // macOS forward the click to the outermost Button, so the trash
        // / reveal icons fire row-open instead. Use a tappable shape.
        return HStack(alignment: .top, spacing: 10) {
                Image(systemName: e.kind.icon)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .frame(width: 18, alignment: .center)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(e.title.isEmpty ? "(untitled)" : e.title)
                            .font(.system(size: 13, weight: .semibold, design: .serif))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        Text(secondaryLabel(e))
                            .font(.system(size: 9, design: .serif).smallCaps())
                            .foregroundStyle(.tertiary)
                        Spacer(minLength: 0)
                    }
                    if !e.snippet.isEmpty {
                        Text(e.snippet)
                            .font(.system(size: 11, design: .serif))
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                    if !e.eyebrow.isEmpty {
                        Text(e.eyebrow)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 0)
                HStack(spacing: 4) {
                    Button {
                        NSWorkspace.shared.activateFileViewerSelecting([e.fileURL])
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                            .padding(4)
                    }
                    .buttonStyle(.plain)
                    .help("Reveal in Finder")
                    Button {
                        pendingDelete = e
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                            .padding(4)
                    }
                    .buttonStyle(.plain)
                    .help("Delete this capture from Loom.md")
                }
        }
        .padding(10)
        .contentShape(Rectangle())
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.secondary.opacity(0.05))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(Color.secondary.opacity(0.12), lineWidth: 1)
        )
        .onTapGesture {
            // Open inside Loom using the existing markdown renderer
            // that other notes use (LoomMarkdownView). Same in-app
            // viewing experience as a Page — no system default app
            // routing, no Xcode / iA Writer source view. Phase C will
            // upgrade this to shape-aware rendering (list grid /
            // article / passage / etc.). For now: vellum-styled
            // markdown via the existing renderer.
            presentingCapture = e
        }
    }

    private func secondaryLabel(_ e: CaptureEntry) -> String {
        switch e.kind {
        case .web:     return e.domain.isEmpty ? "Web" : "Web · \(e.domain)"
        case .inbox:   return "Inbox · \(e.rootLabel)"
        case .page:    return "Page · \(e.rootLabel)"
        case .passage: return "Passage · \(e.rootLabel)"
        case .other:   return e.rootLabel
        }
    }
}

// MARK: In-Loom capture reader (inline navigation)

/// Opens a Loom.md inside the main Loom window — same renderer
/// (LoomMarkdownView / ListGridView) that every other note uses.
/// Solves both "opens in Xcode / iA Writer" AND "sheet too small,
/// not draggable" — the reader inherits the parent Loom window so
/// it's full-size and behaves like every other route.
///
/// Phase C M1: dispatches by detected shape (list / article).
/// Future M2-M3 add passage / conversation / syllabus shapes.
struct CaptureReaderView: View {
    let entry: CaptureEntry
    var themeMode: String = "light"
    var onBack: () -> Void

    @State private var source: String = ""
    @State private var loadError: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Minimal SwiftUI chrome — title / eyebrow / source URL all
            // live inside the webview's PageFrame now. Native bar
            // carries only the back button + reveal-in-Finder so the
            // visual hierarchy isn't doubled.
            HStack(spacing: 10) {
                Button {
                    onBack()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 11, weight: .medium))
                        Text("Captures")
                            .font(.system(size: 12, design: .serif))
                    }
                    .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
                .help("Back to captures list (Esc)")
                Spacer()
                Button {
                    NSWorkspace.shared.activateFileViewerSelecting([entry.fileURL])
                } label: {
                    Image(systemName: "folder")
                        .font(.system(size: 12))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .help("Reveal Loom.md in Finder")
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 10)
            Divider()
            // Phase C M1 / Path B: render through the Next.js
            // /loom-render/capture route (PageFrame + WorkSurface +
            // NoteRenderer with KaTeX/marked) instead of native
            // SwiftUI markdown. WKWebView resolves loom://bundle/
            // (static export) and loom://native/capture-content.json
            // (entry data) via the same scheme handler the main app
            // uses. Visual parity with /llm-wiki etc., gained for
            // free; one source of truth for Vellum styling.
            if let captureURL = renderURL {
                CaptureWebView(url: captureURL, themeMode: themeMode)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                Text("Couldn't construct capture URL")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .padding(24)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(NSColor.windowBackgroundColor))
    }

    /// Builds the `loom://bundle/loom-render/capture/?root=…&sub=…&title=…&eyebrow=…`
    /// URL the WKWebView loads. The Next.js page reads these query
    /// params and fetches the entry payload from
    /// `loom://native/capture-content.json?` — same params, native
    /// JSON bridge slices the Loom.md and returns the body.
    private var renderURL: URL? {
        // entry.subPath stores the raw relative path under the root —
        // includes the leading `sub/` segment because the file store
        // physically nests pages under `<rootID>/sub/<…>/Loom.md`.
        // LoomFileStore.loomMDURL(for:subPath:) adds the `sub/` segment
        // itself, so the value passed to the native bridge must NOT
        // include it (otherwise the bridge tries `sub/sub/…/Loom.md`).
        let raw = entry.subPath
        let cleanSub: String
        if raw.hasPrefix("sub/") {
            cleanSub = String(raw.dropFirst(4))
        } else if raw == "sub" {
            cleanSub = ""
        } else {
            cleanSub = raw
        }

        var components = URLComponents()
        components.scheme = "loom"
        components.host = "bundle"
        components.path = "/loom-render/capture/"
        components.queryItems = [
            URLQueryItem(name: "root", value: entry.rootID.uuidString.lowercased()),
            URLQueryItem(name: "sub", value: cleanSub),
            URLQueryItem(name: "title", value: entry.title),
            URLQueryItem(name: "eyebrow", value: entry.eyebrow),
        ]
        return components.url
    }

    private var secondaryLabel: String {
        switch entry.kind {
        case .web:     return entry.domain.isEmpty ? "Web" : "Web · \(entry.domain)"
        case .inbox:   return "Inbox · \(entry.rootLabel)"
        case .page:    return "Page · \(entry.rootLabel)"
        case .passage: return "Passage · \(entry.rootLabel)"
        case .other:   return entry.rootLabel
        }
    }

    /// Extract just this entry's `### heading` block from the file.
    /// Captures live as siblings inside one Loom.md; rendering the
    /// whole file would dump every entry on top of each other. Match
    /// by heading title + nearby eyebrow line, same logic as delete.
    ///
    /// Also strips the redundant header lines (title heading, eyebrow,
    /// `From [title](url)` source line) since the reader's chrome
    /// header already shows those — leaving them in the body produced
    /// "title shown 3 times" stacked at the top of every capture.
    private func entrySlice(in full: String) -> String {
        let lines = full.components(separatedBy: "\n")
        let headingNeedle = "### " + entry.title
        let eyebrowNeedle = entry.eyebrow.isEmpty ? nil : "*\(entry.eyebrow)*"

        var startIdx: Int? = nil
        var i = 0
        while i < lines.count {
            if lines[i] == headingNeedle {
                if let needle = eyebrowNeedle {
                    var matched = false
                    let lookahead = min(i + 6, lines.count)
                    for j in (i + 1)..<lookahead {
                        if lines[j].trimmingCharacters(in: .whitespaces) == needle {
                            matched = true
                            break
                        }
                    }
                    if !matched { i += 1; continue }
                }
                startIdx = i
                break
            }
            i += 1
        }
        guard let start = startIdx else {
            return ""
        }
        var end = lines.count
        for k in (start + 1)..<lines.count {
            if CapturesIndex.isCaptureHeadingLine(lines, at: k) { end = k; break }
        }

        // Trim redundant header chrome from the body. The reader view's
        // own header already shows title + eyebrow + source URL.
        var bodyLines = Array(lines[start..<end])
        // Drop the heading line itself.
        if let first = bodyLines.first, first == headingNeedle {
            bodyLines.removeFirst()
        }
        // Drop the eyebrow line + any blank lines around it.
        while let line = bodyLines.first {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty {
                bodyLines.removeFirst()
                continue
            }
            if let needle = eyebrowNeedle, trimmed == needle {
                bodyLines.removeFirst()
                continue
            }
            // Drop the writer-emitted "From [title](url)" source line.
            if trimmed.range(of: #"^From \[[^\]]+\]\([^)]+\)\s*$"#, options: .regularExpression) != nil {
                bodyLines.removeFirst()
                continue
            }
            break
        }
        return bodyLines.joined(separator: "\n")
    }
}

// MARK: Drag-to-install pill

/// WKWebView wrapper that renders a single styled `<a draggable="true">`
/// with the bookmarklet's `javascript:` URL as href. Cross-app drag
/// from a WKWebView anchor IS interpreted by browsers as a bookmark
/// drop — this is the same mechanism Pocket / Instapaper / Pinboard
/// use to ship "drag this to your bookmarks bar" install affordances.
///
/// Rationale (2026-04-27): manual copy-paste install is ≥4 steps and
/// felt 1990s. True 1-click install is browser-architecturally
/// impossible (browsers don't let arbitrary apps write their bookmark
/// stores), so the universal "no extension" path is drag-to-bookmarks.
/// 1 gesture, all browsers with a visible bookmarks bar.
struct BookmarkletDragPill: NSViewRepresentable {
    let bookmarkletJS: String

    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView(frame: .zero)
        webView.setValue(false, forKey: "drawsBackground")
        webView.navigationDelegate = context.coordinator
        let escaped = bookmarkletJS
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let html = """
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><style>
          html, body {
            margin: 0; padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: transparent;
          }
          body {
            display: flex; align-items: center; justify-content: center;
            height: 100vh;
            padding: 8px;
            box-sizing: border-box;
          }
          a.pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 22px;
            background: linear-gradient(180deg, #4a7eff 0%, #335eea 100%);
            color: white;
            text-decoration: none;
            border-radius: 9px;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.2px;
            box-shadow: 0 1px 4px rgba(60, 100, 220, 0.35), 0 0 0 1px rgba(255,255,255,0.08) inset;
            cursor: grab;
            user-select: none;
            -webkit-user-drag: element;
          }
          a.pill:active { cursor: grabbing; transform: scale(0.98); }
          a.pill::before {
            content: "🔗";
            font-size: 14px;
            filter: grayscale(100%) brightness(2.5);
          }
        </style></head>
        <body>
          <a href="\(escaped)" class="pill" draggable="true">Capture to Loom — drag me to your bookmarks bar</a>
        </body>
        </html>
        """
        webView.loadHTMLString(html, baseURL: nil)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// Cancel any navigation request — clicking the pill (vs dragging
    /// it) shouldn't navigate the WKWebView to `javascript:`. Drag is
    /// the only allowed gesture; clicks are no-ops.
    final class Coordinator: NSObject, WKNavigationDelegate {
        private var initialLoadDone = false
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            if !initialLoadDone {
                initialLoadDone = true
                decisionHandler(.allow)
                return
            }
            // Block clicks on the bookmarklet link from navigating
            // the WKWebView itself. Drag-out is handled by AppKit
            // independent of navigation policy.
            decisionHandler(.cancel)
        }
    }
}

// MARK: WebCaptureSetupView

/// Static view that displays the Loom Web Capture extension path and
/// bookmarklet fallback so the user can install capture without leaving
/// the app. The JavaScript text remains the single source of truth for
/// the fallback bookmarklet.
struct WebCaptureSetupView: View {
    /// Bookmarklet v2 (2026-04-27). Single source of truth.
    ///
    /// Extraction strategy, in order:
    ///   1. User selection wins — if there's a highlight, it's
    ///      authoritative.
    ///   2. Semantic tags — `article` / `main` / `[role="main"]` if
    ///      they have substantial text (>500 chars).
    ///   3. Cloned-body chrome scrubber — removes nav / header /
    ///      footer / aside / iframe / script / style, plus elements
    ///      whose id or class match common chrome word boundaries
    ///      (nav, menu, sidebar, breadcrumb, toolbar, cookie, consent,
    ///      banner, advert, popup, modal, comments, share, social,
    ///      widget, related, recommended). What survives is body text.
    ///
    /// Limits: not a substitute for Defuddle's 26 site-specific
    /// extractors; SPA / paywall / heavy-JS pages may still leak
    /// chrome. Selection-first remains the cleanest path for known
    /// pages. Body capped at 20K chars.
    static let bookmarkletJS: String = """
    javascript:(function(){function g(n){return document.querySelector('meta[name="'+n+'"], meta[property="'+n+'"]')?.content||'';}function ex(){var s=window.getSelection().toString();if(s)return s;var sem=document.querySelector('article, main, [role="main"]');if(sem&&sem.innerText&&sem.innerText.length>500)return sem.innerText;var c=document.body.cloneNode(true);c.querySelectorAll('nav, header, footer, aside, script, style, noscript, iframe, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]').forEach(function(e){e.remove();});var sk=/(^|[\\s_-])(nav|menu|sidebar|breadcrumb|toolbar|cookie|consent|banner|advert|ads?|popup|modal|comments?|share|social|footer|header|widget|related|recommended|teaching[-_\\s]?contact)([\\s_-]|$)/i;c.querySelectorAll('[id],[class]').forEach(function(el){var id=(el.id||'').toLowerCase();var cls=(typeof el.className==='string'?el.className:'').toLowerCase();if(sk.test(id)||sk.test(cls))el.remove();});return c.innerText;}var p={url:location.href,title:document.title,selection:window.getSelection().toString(),description:g('og:description')||g('description'),siteName:g('og:site_name'),body:ex().slice(0,20000)};var u='loom://capture?payload='+encodeURIComponent(JSON.stringify(p));var a=document.createElement('a');a.href=u;document.body.appendChild(a);a.click();a.remove();})();
    """

    @State private var copied: Bool = false
    @State private var extensionPathCopied: Bool = false
    @State private var stats: [LoomEmbeddingStore.RootStats] = []
    @State private var enModelOK: Bool = false
    @State private var zhModelOK: Bool = false
    @State private var jaModelOK: Bool = false

    // P0 Storage sovereignty — surface the file-store path so the user
    // sees where their notes actually live, and offer "Move to…" to
    // get out of the sandbox container into a Finder-visible /
    // iCloud-syncable / Time-Machine-backed location.
    @State private var storeLocation: String = ""
    @State private var storeIsCustom: Bool = false
    @State private var migrationStatus: String? = nil

    private func refreshDiagnostics() {
        stats = LoomEmbeddingStore.diagnosticStats()
        enModelOK = LoomEmbeddingStore.modelAvailable(for: .english)
        zhModelOK = LoomEmbeddingStore.modelAvailable(for: .simplifiedChinese)
        jaModelOK = LoomEmbeddingStore.modelAvailable(for: .japanese)
        refreshStoreLocation()
    }

    private func refreshStoreLocation() {
        let url = LoomFileStore.rootURL
        storeLocation = url.path(percentEncoded: false)
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        let defaultPath = docs?.appendingPathComponent("Loom Data").path
        storeIsCustom = (defaultPath != url.path)
    }

    private var extensionResourcesPath: String {
        let fm = FileManager.default
        if let pluginURL = Bundle.main.builtInPlugInsURL?
            .appendingPathComponent("LoomWebExtension.appex")
            .appendingPathComponent("Contents")
            .appendingPathComponent("Resources"),
           fm.fileExists(atPath: pluginURL.appendingPathComponent("manifest.json").path) {
            return pluginURL.path(percentEncoded: false)
        }

        let repoURL = fm.homeDirectoryForCurrentUser
            .appendingPathComponent("Desktop")
            .appendingPathComponent("LOOM")
            .appendingPathComponent("macos-app")
            .appendingPathComponent("Loom")
            .appendingPathComponent("LoomWebExtension")
            .appendingPathComponent("Resources")
        if fm.fileExists(atPath: repoURL.appendingPathComponent("manifest.json").path) {
            return repoURL.path(percentEncoded: false)
        }

        return "macos-app/Loom/LoomWebExtension/Resources"
    }

    private func revealStoreInFinder() {
        NSWorkspace.shared.activateFileViewerSelecting([LoomFileStore.rootURL])
    }

    private func moveStoreToUserPicked() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose location"
        panel.message = "Pick a parent folder. Loom will use / create a 'Loom Data' subfolder inside."
        guard panel.runModal() == .OK, let parent = panel.url else { return }

        let target = parent.appendingPathComponent("Loom Data", isDirectory: true)
        let current = LoomFileStore.rootURL
        let fm = FileManager.default

        do {
            try fm.createDirectory(at: target, withIntermediateDirectories: true)
            // Copy contents (not the directory itself) so an existing
            // "Loom Data" target gets merged rather than nested.
            let items = try fm.contentsOfDirectory(at: current, includingPropertiesForKeys: nil)
            for item in items {
                let dest = target.appendingPathComponent(item.lastPathComponent)
                if !fm.fileExists(atPath: dest.path) {
                    try fm.copyItem(at: item, to: dest)
                }
            }
            let ok = LoomFileStore.setCustomLocation(target)
            migrationStatus = ok
                ? "Migrated · \(target.path(percentEncoded: false))"
                : "Bookmark write failed — new path active for this session only, won't persist on relaunch"
            refreshStoreLocation()
        } catch {
            migrationStatus = "Migration failed: \(error.localizedDescription)"
        }
    }

    private var totalCaptures: Int { stats.reduce(0) { $0 + $1.recordCount } }

    @State private var tipsExpanded: Bool = false

    // MARK: - Card chrome

    /// Vellum card recipe — translucent paper inset + 0.5px hair
    /// border + 8pt corner. Each card hosts a smallcaps eyebrow, an
    /// optional display title, and arbitrary body content. Internal
    /// padding 16pt; gap between cards is owned by the parent VStack.
    @ViewBuilder
    private func card<Content: View>(
        eyebrow: String,
        title: String? = nil,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow)
                .font(.custom("EB Garamond", size: 11).weight(.medium).smallCaps())
                .tracking(1.6)
                .foregroundStyle(LoomTokens.ink3)
            if let title = title {
                Text(title)
                    .font(.custom("EB Garamond", size: 16).weight(.medium))
                    .foregroundStyle(LoomTokens.ink)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(LoomTokens.paper.opacity(0.4))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(LoomTokens.hair, lineWidth: 0.5)
        )
    }

    // MARK: - Card content

    @ViewBuilder
    private var extensionInstallCard: some View {
        card(
            eyebrow: "Recommended",
            title: "Install the browser extension for rich pages"
        ) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Atlas / Chrome: open the extensions page, turn on Developer mode, choose Load unpacked, then select the exact folder below. It is the folder that contains manifest.json.")
                    .font(.system(size: 12, design: .serif))
                    .foregroundStyle(LoomTokens.ink2)
                Text(extensionResourcesPath)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(LoomTokens.ink2)
                    .textSelection(.enabled)
                    .lineLimit(4)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 6)
                            .fill(LoomTokens.hairFaint)
                    )
                HStack(spacing: 8) {
                    Button {
                        let pb = NSPasteboard.general
                        pb.clearContents()
                        pb.setString(extensionResourcesPath, forType: .string)
                        extensionPathCopied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                            extensionPathCopied = false
                        }
                    } label: {
                        Label(extensionPathCopied ? "Copied" : "Copy extension path", systemImage: extensionPathCopied ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 11, design: .serif))
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                }
                Text("If the L button is missing on a page, the extension is not injected there. Reload the extension, refresh the original page, then click L again. Do not choose the parent LoomWebExtension folder; that folder has no manifest.json.")
                    .font(.system(size: 10, design: .serif))
                    .foregroundStyle(LoomTokens.ink3)
            }
        }
    }

    @ViewBuilder
    private var installCard: some View {
        card(
            eyebrow: "Fallback",
            title: "Bookmarklet for text-only capture"
        ) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Use this only when the extension is unavailable. It captures title, URL, selection, and main text, but not rich media, styled SVG, or canvas resources.")
                    .font(.system(size: 12, design: .serif))
                    .foregroundStyle(LoomTokens.ink2)
                BookmarkletDragPill(bookmarkletJS: Self.bookmarkletJS)
                    .frame(height: 72)
                    .frame(maxWidth: .infinity)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(LoomTokens.hairFaint)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(LoomTokens.hair, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
                    )

                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Use this if your browser refuses the drag (most won't): copy the bookmarklet JS, then in your browser right-click the bookmarks bar → Add Bookmark, paste the JS into the URL field (must keep the leading `javascript:`).")
                            .font(.system(size: 11, design: .serif))
                            .foregroundStyle(LoomTokens.ink2)
                        ScrollView {
                            Text(Self.bookmarkletJS)
                                .font(.system(size: 10, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(10)
                        }
                        .frame(maxHeight: 100)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(LoomTokens.hairFaint)
                        )
                        Button {
                            let pb = NSPasteboard.general
                            pb.clearContents()
                            pb.setString(Self.bookmarkletJS, forType: .string)
                            copied = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { copied = false }
                        } label: {
                            Label(copied ? "Copied" : "Copy bookmarklet JS", systemImage: copied ? "checkmark" : "doc.on.doc")
                                .font(.system(size: 11, design: .serif))
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding(.top, 4)
                } label: {
                    Text("Manual install (fallback) — copy / paste")
                        .font(.custom("EB Garamond", size: 11).weight(.medium).smallCaps())
                        .tracking(0.8)
                        .foregroundStyle(LoomTokens.ink3)
                }
            }
        }
    }

    @ViewBuilder
    private var captureFlowCard: some View {
        card(
            eyebrow: "Capture flow",
            title: "Use it"
        ) {
            VStack(alignment: .leading, spacing: 6) {
                Label("Open any web page and confirm the L capture button is visible", systemImage: "1.circle")
                Label("Click L for full capture; Shift+L for reader-only; Cmd+L for script-preserved snapshot", systemImage: "2.circle")
                Label("Loom comes to the foreground; the capture sheet pre-fills with title, URL, and content", systemImage: "3.circle")
                Label("Pick anchor (Web · domain, or Inbox), edit if needed, Save", systemImage: "4.circle")
            }
            .font(.system(size: 12, design: .serif))
            .foregroundStyle(LoomTokens.ink)
        }
    }

    @ViewBuilder
    private var storageCard: some View {
        card(
            eyebrow: "Storage",
            title: "Where captures live"
        ) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    if storeIsCustom {
                        Text("custom")
                            .font(.system(size: 9, design: .serif).smallCaps())
                            .foregroundStyle(LoomTokens.ink2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(LoomTokens.hair))
                    } else {
                        Text("default · sandbox container")
                            .font(.system(size: 9, design: .serif).smallCaps())
                            .foregroundStyle(LoomTokens.ink3)
                    }
                    Spacer()
                }
                Text(storeLocation.isEmpty ? "(loading…)" : storeLocation)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(LoomTokens.ink2)
                    .textSelection(.enabled)
                    .lineLimit(3)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(LoomTokens.hairFaint)
                    )
                HStack(spacing: 8) {
                    Button {
                        revealStoreInFinder()
                    } label: {
                        Label("Reveal in Finder", systemImage: "folder")
                            .font(.system(size: 11, design: .serif))
                    }
                    .buttonStyle(.bordered)
                    Button {
                        moveStoreToUserPicked()
                    } label: {
                        Label("Move to…", systemImage: "tray.and.arrow.up")
                            .font(.system(size: 11, design: .serif))
                    }
                    .buttonStyle(.bordered)
                    Spacer()
                }
                if let status = migrationStatus {
                    Text(status)
                        .font(.system(size: 10, design: .serif))
                        .foregroundStyle(LoomTokens.ink3)
                }
                Text("Default lives in your Loom sandbox container — Finder doesn't browse there by default. Move to ~/Documents/Loom Data/ (or any folder you pick) to make captures inspectable, syncable to iCloud, and backed up by Time Machine.")
                    .font(.system(size: 10, design: .serif))
                    .foregroundStyle(LoomTokens.ink3)
            }
        }
    }

    @ViewBuilder
    private var pipelineStatusCard: some View {
        card(
            eyebrow: "Pipeline status",
            title: "Capture pipeline"
        ) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Spacer()
                    Button {
                        refreshDiagnostics()
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                            .font(.system(size: 11, design: .serif))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(LoomTokens.thread)
                }
                // 2-column grid: label on the left, detail on the right.
                // Forces alignment across all rows so status reads as a
                // proper table rather than ad-hoc HStacks.
                Grid(alignment: .leadingFirstTextBaseline,
                     horizontalSpacing: 12,
                     verticalSpacing: 6) {
                    statusGridRow(
                        ok: enModelOK,
                        label: "Embedding model · English",
                        detail: enModelOK ? "loaded" : "missing — embeddings disabled for English"
                    )
                    statusGridRow(
                        ok: zhModelOK,
                        label: "Embedding model · 中文",
                        detail: zhModelOK ? "loaded" : "missing — Chinese captures fall back to English embedding"
                    )
                    statusGridRow(
                        ok: jaModelOK,
                        label: "Embedding model · 日本語",
                        detail: jaModelOK ? "loaded" : "missing — Japanese captures fall back to English embedding"
                    )
                    statusGridRow(
                        ok: !stats.isEmpty,
                        label: "Active workspaces",
                        detail: stats.isEmpty ? "none — add a folder to enable indexing" : "\(stats.count)"
                    )
                    statusGridRow(
                        ok: totalCaptures > 0,
                        label: "Captures indexed",
                        detail: totalCaptures == 0
                            ? "none yet — capture once to verify the index is writable"
                            : "\(totalCaptures) total"
                    )
                }
                if !stats.isEmpty {
                    VStack(alignment: .leading, spacing: 2) {
                        ForEach(stats) { s in
                            HStack(spacing: 6) {
                                Spacer().frame(width: 16)
                                Text("· \(s.label)")
                                    .font(.system(size: 10, design: .serif))
                                    .foregroundStyle(LoomTokens.ink2)
                                Text("\(s.recordCount)")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(LoomTokens.ink2)
                                if !s.languageBreakdown.isEmpty {
                                    let breakdown = s.languageBreakdown
                                        .sorted(by: { $0.value > $1.value })
                                        .map { "\($0.key):\($0.value)" }
                                        .joined(separator: " ")
                                    Text(breakdown)
                                        .font(.system(size: 9, design: .monospaced))
                                        .foregroundStyle(LoomTokens.ink3)
                                }
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
                Text("If a capture should have been indexed but isn't shown here, click Refresh after a few seconds (indexing is async). Embedding model gaps mean similarity matching is degraded but Loom still saves the capture.")
                    .font(.system(size: 10, design: .serif))
                    .foregroundStyle(LoomTokens.ink3)
            }
        }
    }

    @ViewBuilder
    private var tipsCard: some View {
        card(eyebrow: "Tips") {
            DisclosureGroup(isExpanded: $tipsExpanded) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("• **Missing L means the extension is not running on that tab.** Reload the extension and then refresh the source page; already-open tabs do not always receive a newly loaded content script.")
                    Text("• **Select first for the cleanest result.** Selection still wins over auto-extraction when you only need a passage.")
                    Text("• The bookmarklet is a fallback, not the rich-media path. Use the extension for SVG, canvas, iframe, video, and image-sidecar capture.")
                    Text("• Web captures default to the Web/<domain>/Loom.md folder so domains pre-cluster naturally for similarity search.")
                    Text("• Rich extension captures are not capped to the bookmarklet's 20K-character text fallback.")
                }
                .font(.system(size: 11, design: .serif))
                .foregroundStyle(LoomTokens.ink2)
                .padding(.top, 6)
            } label: {
                Text(tipsExpanded ? "Hide tips" : "Show tips")
                    .font(.custom("EB Garamond", size: 13).weight(.medium))
                    .foregroundStyle(LoomTokens.ink)
            }
        }
    }

    @ViewBuilder
    private func statusGridRow(ok: Bool, label: String, detail: String) -> some View {
        GridRow {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: ok ? "checkmark.circle.fill" : "xmark.octagon.fill")
                    .foregroundStyle(ok ? LoomTokens.sage : LoomTokens.rose)
                    .font(.system(size: 11))
                Text(label)
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(LoomTokens.ink)
            }
            Text(detail)
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(LoomTokens.ink2)
                .gridColumnAlignment(.trailing)
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Web Capture")
                        .font(.custom("Cormorant Garamond", size: 28).weight(.medium))
                        .foregroundStyle(LoomTokens.ink)
                    Text("Install the Loom browser extension for rich web captures. The bookmarklet below remains a text-only fallback for locked-down browsers.")
                        .font(.system(size: 13, design: .serif))
                        .foregroundStyle(LoomTokens.ink2)
                }
                .padding(.bottom, 4)

                extensionInstallCard
                installCard
                captureFlowCard
                storageCard
                pipelineStatusCard
                tipsCard
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 28)
            .frame(maxWidth: 720, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(LoomTokens.paper)
        .onAppear { refreshDiagnostics() }
    }
}
