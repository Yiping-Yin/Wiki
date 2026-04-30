import SwiftUI

/// Native folder-home renderer for any picked-root or sub-folder. Two
/// stacked sections in one scroll view:
///
///   1. **Description** — renders `<folder>/Loom.md` as markdown when it
///      exists; otherwise a quiet empty state inviting the user to add
///      a description (clicking summons an inline textarea, A4 wires
///      that up).
///   2. **Files** — Finder-mirror listing of the folder's immediate
///      contents (sub-folders first, then files), each row clickable.
///
/// Pure read-only in this slice. A4 adds inline editing on top.
struct LoomFolderHomeView: View {
    /// Stable id of the page (root). All Loom-managed data for this
    /// page lives under `LoomFileStore.pageDirectoryURL(for: rootID)`.
    /// `Loom.md` is `LoomFileStore.loomMDURL(for: rootID)`.
    let rootID: UUID?
    /// External user-picked folder this page references (optional —
    /// nil for pure `+ Page` roots). Used READ-ONLY to scan files for
    /// the Files / Uncurated listing. Loom NEVER writes here.
    let externalFolderURL: URL?
    /// Display label shown in the page header.
    let displayName: String?

    /// Where on disk Loom.md lives — always in the file store, never
    /// inside `externalFolderURL`. nil when no rootID provided
    /// (legacy fallback only).
    private var loomMDURL: URL? {
        guard let rootID = rootID else { return nil }
        return LoomFileStore.loomMDURL(for: rootID)
    }

    /// Folder for the page's tree-style URL navigation. Falls back to
    /// the external folder's path when present (so file/sub-folder
    /// clicks resolve under the user's authoritative source).
    private var folderURL: URL {
        externalFolderURL ?? (rootID.map { LoomFileStore.pageDirectoryURL(for: $0) } ?? URL(fileURLWithPath: "/"))
    }

    @State private var loomMD: String? = nil
    @State private var entries: [FolderEntry] = []
    @State private var loadGeneration: Int = 0
    /// Phase B follow-up — cross-root similarity matches surfaced
    /// while browsing this folder home. Populated async on view
    /// appear + when the page description changes (re-query). Empty
    /// = render nothing (don't pollute UI when there's no signal).
    @State private var relatedHits: [LoomEmbeddingStore.SimilarHit] = []
    /// Latest displayName for this root, refreshed from
    /// `ContentRootStore` on every `.loomContentRootsChanged`. Acts as
    /// the source of truth for the page header so a sidebar rename
    /// updates the title (and vice versa) without waiting for the
    /// parent to re-resolve.
    @State private var liveRootName: String? = nil
    /// Whole-file markdown editing toggle. When true, the description
    /// section swaps to a TextEditor showing the raw Loom.md source.
    /// Phase A: whole-file edit (simple, fast). Phase A4-full: per-
    /// paragraph click-to-edit.
    @State private var isEditingMD: Bool = false
    @State private var editingDraft: String = ""
    /// Quick note capture: when true, an inline textarea appears in
    /// place of the "+ Add note" affordance. Ctrl+Enter saves and
    /// appends as a timestamped entry under ## Notes in Loom.md.
    /// Per-note edit sheet state. Captures the anchor + the original
    /// slice (so we can replace it on save) + the parsed body text
    /// (which is what the user actually edits).
    @State private var editingEntry: EditingEntry? = nil
    @State private var editingEntryDraft: String = ""

    struct EditingEntry: Identifiable {
        let id = UUID()
        let anchor: String
        let originalSlice: String
        let eyebrow: String        // e.g. "*p.3 · 2026-04-26 11:12*"
        let quote: String          // multi-line `> …`
        let jumpLink: String       // "[📍 Jump to passage](loom://anchor?...)"
    }
    /// Inline page-title rename. Click the title to swap in a TextField;
    /// Enter (or blur) commits via ContentRootStore.update; Esc cancels.
    @State private var isEditingTitle: Bool = false
    @State private var titleDraft: String = ""
    @FocusState private var titleFieldFocused: Bool

    struct FolderEntry: Identifiable, Hashable {
        let id: String   // absolute path, stable across re-loads
        let url: URL
        let name: String
        let isDirectory: Bool
        let modifiedAt: Date?
    }

    /// View-only sort preference for the Resources list. Persisted
    /// across sessions but never written back to disk — Source Fidelity
    /// (Finder tree is canonical) means we layer ordering on top of
    /// the folder, never mutate it.
    enum EntrySortOrder: String, CaseIterable, Identifiable {
        case nameAscending      // folders-first, A→Z (matches Finder default)
        case recentFirst        // most recently modified at top
        case oldestFirst        // least recently modified at top
        var id: String { rawValue }
        var label: String {
            switch self {
            case .nameAscending: return "Name"
            case .recentFirst:   return "Recent first"
            case .oldestFirst:   return "Oldest first"
            }
        }
        var systemImage: String {
            switch self {
            case .nameAscending: return "textformat.abc"
            case .recentFirst:   return "clock.arrow.circlepath"
            case .oldestFirst:   return "clock"
            }
        }
    }
    @AppStorage("loom.folder.sortOrder") private var sortOrderRaw: String = EntrySortOrder.nameAscending.rawValue
    private var sortOrder: EntrySortOrder {
        EntrySortOrder(rawValue: sortOrderRaw) ?? .nameAscending
    }
    /// `entries` after applying `sortOrder`. `nameAscending` preserves
    /// the scan order (folders-first, then alphabetical within group).
    /// Date sorts mix folders and files together; nil dates land at the
    /// bottom of either direction.
    private var sortedEntries: [FolderEntry] {
        switch sortOrder {
        case .nameAscending:
            return entries
        case .recentFirst:
            return entries.sorted { lhs, rhs in
                switch (lhs.modifiedAt, rhs.modifiedAt) {
                case let (l?, r?): return l > r
                case (_?, nil):    return true
                case (nil, _?):    return false
                case (nil, nil):   return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
                }
            }
        case .oldestFirst:
            return entries.sorted { lhs, rhs in
                switch (lhs.modifiedAt, rhs.modifiedAt) {
                case let (l?, r?): return l < r
                case (_?, nil):    return true
                case (nil, _?):    return false
                case (nil, nil):   return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
                }
            }
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: DSSpace.md.value) {
                pageTitle
                // Resources is a derived view, rendered live from the
                // folder scan — NOT stored in Loom.md. Keeps the
                // human-edit textarea free of `[Name/](Name%20/)`
                // boilerplate that's only useful for AI.
                if !entries.isEmpty {
                    resourcesSection
                } else if externalFolderURL != nil {
                    emptyExternalFolderHint
                }
                if !relatedHits.isEmpty {
                    relatedCapturesSection
                }
                if isAtRoot {
                    pageBody
                }
            }
            // Top padding clears the translucent NSWindow titlebar /
            // toolbar (~52pt total on macOS). Without this the page
            // top gets cropped until the user scrolls down.
            .padding(.top, 56)
            .padding(.bottom, DSSpace.xl.value + 8)
            .padding(.horizontal, DSSpace.xl.value)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(LoomTokens.dsPaperDeep)
        .sheet(item: $editingEntry) { entry in
            editEntrySheet(entry)
        }
        .task(id: folderURL) {
            await reload()
            await runRelatedQuery()
        }
        .onAppear { refreshLiveRootName() }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootsChanged)) { _ in
            refreshLiveRootName()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomRefreshActivePage)) { _ in
            refreshLiveRootName()
            Task { await reload() }
        }
    }

    /// True when the page is showing the root itself (not a subfolder
    /// inside it). Title rename is only allowed at the root since it
    /// edits the ContentRoot record; subfolder renames would need to
    /// touch the user's external file system, which Loom doesn't do.
    private var isAtRoot: Bool {
        guard let rootID = rootID else { return false }
        if let external = externalFolderURL {
            // Compare resolved file paths instead of URL equality — on
            // macOS the same folder can be reached via /private/var/...
            // and /var/... (symlink). URL.standardizedFileURL doesn't
            // always normalize this, so paths can mismatch and isAtRoot
            // falsely returns false, hiding pageBody (and the entire
            // page renders as empty).
            guard let active = ContentRootStore.activeURL(for: rootID) else { return false }
            return external.resolvingSymlinksInPath().path == active.resolvingSymlinksInPath().path
        }
        return true
    }

    /// Live page label: prefer the store-resolved name when at root so
    /// any rename (sidebar OR title) shows immediately.
    private var effectiveDisplayName: String? {
        if isAtRoot { return liveRootName ?? displayName }
        return displayName
    }

    /// Reverse-engineer the loom:// URL for the current folder so links
    /// inside the rendered markdown (which are written as relative paths)
    /// can be resolved into absolute loom:// URLs at click time.
    private var currentLoomURL: URL? {
        guard let rootID = rootID else { return nil }
        let prefix = "loom://content/\(rootID.uuidString.lowercased())/"
        guard let external = externalFolderURL,
              let rootURL = ContentRootStore.activeURL(for: rootID),
              external.standardizedFileURL != rootURL.standardizedFileURL else {
            return URL(string: prefix)
        }
        let rootPath = rootURL.standardizedFileURL.path
        let curPath = external.standardizedFileURL.path
        guard curPath.hasPrefix(rootPath + "/") else { return URL(string: prefix) }
        let rel = String(curPath.dropFirst(rootPath.count + 1))
        let encoded = rel
            .split(separator: "/")
            .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        return URL(string: prefix + encoded + "/")
    }

    /// Render-time view of `loomMD` with a leading `# <title>` line
    /// stripped when it duplicates the page header shown above. Keeps
    /// older Loom.md files (which contain the h1) tidy without
    /// rewriting them on disk.
    private var renderableMD: String? {
        guard let md = loomMD else { return nil }
        let stripped = Self.stripChrome(from: md, pageName: effectiveDisplayName)
        return stripped
    }

    /// Extract just the user's free-form prose from a Loom.md — the
    /// portion above any `## ` section. Title h1 is stripped (shown
    /// separately as page header). Auto-managed sections (Resources,
    /// per-book sections containing notes/threads/pursuits) are
    /// excluded so the edit textarea is a clean writing surface.
    private static func extractProse(from md: String, pageName: String?) -> String {
        let stripped = stripChrome(from: md, pageName: pageName)
        var lines = stripped.components(separatedBy: "\n")
        var prose: [String] = []
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                break
            }
            prose.append(line)
        }
        while let last = prose.last, last.trimmingCharacters(in: .whitespaces).isEmpty {
            prose.removeLast()
        }
        _ = lines
        return prose.joined(separator: "\n")
    }

    /// Merge user-edited prose back into the file, preserving the
    /// auto-managed sections that follow. Title is left out of the
    /// file (it's stored separately in `ContentRoot.displayName`).
    private static func mergeProse(_ prose: String, into md: String, pageName: String?) -> String {
        var lines = md.components(separatedBy: "\n")

        // Skip leading title h1 (we don't write it back).
        var prefixEnd = 0
        while prefixEnd < lines.count
            && lines[prefixEnd].trimmingCharacters(in: .whitespaces).isEmpty {
            prefixEnd += 1
        }
        if prefixEnd < lines.count {
            let trimmed = lines[prefixEnd].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("# "), !trimmed.hasPrefix("## ") {
                let h1Text = trimmed.dropFirst(2).trimmingCharacters(in: .whitespaces)
                if pageName == nil || h1Text == pageName {
                    prefixEnd += 1
                    while prefixEnd < lines.count
                        && lines[prefixEnd].trimmingCharacters(in: .whitespaces).isEmpty {
                        prefixEnd += 1
                    }
                }
            }
        }

        // Find the first `## ` boundary — everything from there on is
        // auto-managed and gets preserved verbatim.
        var firstSectionIdx = lines.count
        for i in prefixEnd..<lines.count {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                firstSectionIdx = i
                break
            }
        }

        // Replace [prefixEnd, firstSectionIdx) — the old prose region —
        // with the new prose text. Drop any leftover Resources block
        // (legacy files may have one before the first per-book section).
        let trimmedProse = prose.trimmingCharacters(in: .whitespacesAndNewlines)
        var rebuilt: [String] = []
        if !trimmedProse.isEmpty {
            rebuilt.append(contentsOf: trimmedProse.components(separatedBy: "\n"))
            rebuilt.append("")
        }
        var tail = Array(lines.suffix(from: firstSectionIdx))
        // Drop a `## Resources` block if it's the first thing in the
        // tail — it's no longer persisted, only synthesized.
        if let first = tail.first?.trimmingCharacters(in: .whitespaces),
           first == "## Resources" {
            var endIdx = tail.count
            for i in 1..<tail.count {
                let trimmed = tail[i].trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                    endIdx = i; break
                }
            }
            tail.removeSubrange(0..<endIdx)
            while let first = tail.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
                tail.removeFirst()
            }
        }
        rebuilt.append(contentsOf: tail)
        return rebuilt.joined(separator: "\n")
    }

    /// Strip auto-generated chrome from a Loom.md before showing it
    /// to the user — both for read-rendering and for the edit
    /// textarea. Removes:
    ///   1. A leading `# <pageName>` h1 that just duplicates the page
    ///      title shown above the body.
    ///   2. Any `## Resources` block. Resources is now a synthesized
    ///      view rendered live from disk; storing it in Loom.md was
    ///      polluting the human-edit surface with `[Name/](Name%20/)`
    ///      boilerplate.
    private static func stripChrome(from md: String, pageName: String?) -> String {
        var lines = md.components(separatedBy: "\n")

        // 1. Drop leading blank lines + leading `# <pageName>`.
        while let first = lines.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
            lines.removeFirst()
        }
        if let first = lines.first {
            let trimmed = first.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("# "), !trimmed.hasPrefix("## ") {
                let h1Text = trimmed.dropFirst(2).trimmingCharacters(in: .whitespaces)
                if pageName == nil || h1Text == pageName {
                    lines.removeFirst()
                    while let next = lines.first, next.trimmingCharacters(in: .whitespaces).isEmpty {
                        lines.removeFirst()
                    }
                }
            }
        }

        // 2. Drop the `## Resources` block — find it, remove from its
        // line through (but not including) the next `## ` heading.
        var startIdx = -1
        for (i, line) in lines.enumerated() {
            if line.trimmingCharacters(in: .whitespaces) == "## Resources" {
                startIdx = i; break
            }
        }
        if startIdx >= 0 {
            var endIdx = lines.count
            for i in (startIdx + 1)..<lines.count {
                let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                    endIdx = i; break
                }
            }
            // Eat the trailing blanks of the Resources block too.
            while endIdx > startIdx + 1
                && lines[endIdx - 1].trimmingCharacters(in: .whitespaces).isEmpty {
                endIdx -= 1
            }
            lines.removeSubrange(startIdx..<endIdx)
            // Collapse double-blank gap left behind.
            while startIdx < lines.count
                && lines[startIdx].trimmingCharacters(in: .whitespaces).isEmpty {
                lines.remove(at: startIdx)
            }
        }

        return lines.joined(separator: "\n")
    }

    /// Anchor-driven entry actions. The renderer passes the anchor URL
    /// of the right-clicked passage; we resolve it to the surrounding
    /// markdown slice (eyebrow + quote + body + jump-link) by walking
    /// the source. Reuses the existing slice-based handlers so promote
    /// + delete behave identically whether triggered by the renderer
    /// or future callers.
    private func promoteByAnchor(_ anchor: String) {
        guard let md = loomMD,
              let slice = Self.entrySlice(containing: anchor, in: md) else { return }
        promoteNote(slice: slice)
    }

    private func deleteByAnchor(_ anchor: String) {
        guard let md = loomMD,
              let slice = Self.entrySlice(containing: anchor, in: md) else { return }
        deleteNote(slice: slice)
    }

    /// Open the per-note edit sheet pre-filled with the existing
    /// body. Save replaces the slice in the file with a new entry
    /// that keeps the original eyebrow + quote + jump-link, swapping
    /// only the user's body.
    private func startEditEntry(_ anchor: String) {
        guard let md = loomMD,
              let slice = Self.entrySlice(containing: anchor, in: md),
              let parsed = Self.parseEntry(slice: slice, anchor: anchor) else { return }
        editingEntryDraft = parsed.bodyText
        editingEntry = EditingEntry(
            anchor: anchor,
            originalSlice: slice,
            eyebrow: parsed.eyebrow,
            quote: parsed.quote,
            jumpLink: parsed.jumpLink
        )
    }

    private func commitEditEntry(_ entry: EditingEntry) {
        guard let target = loomMDURL,
              let md = loomMD else {
            editingEntry = nil
            editingEntryDraft = ""
            return
        }
        let trimmedBody = editingEntryDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let rebuilt: String = {
            var s = entry.eyebrow + "\n" + entry.quote
            if !trimmedBody.isEmpty {
                s += "\n\n" + trimmedBody
            }
            if !entry.jumpLink.isEmpty {
                s += "\n\n" + entry.jumpLink
            }
            return s
        }()
        if let updated = Self.replaceSliceInSource(
            slice: entry.originalSlice,
            with: rebuilt,
            in: md
        ) {
            try? updated.write(to: target, atomically: true, encoding: .utf8)
            loomMD = updated
        }
        editingEntry = nil
        editingEntryDraft = ""
    }

    /// Parse an entry slice into its components for editing. Returns
    /// nil when the slice doesn't have the expected shape.
    private static func parseEntry(slice: String, anchor: String)
        -> (eyebrow: String, quote: String, bodyText: String, jumpLink: String)?
    {
        let lines = slice.components(separatedBy: "\n")
        var eyebrow = ""
        var quoteLines: [String] = []
        var jumpLink = ""
        var bodyLines: [String] = []

        var i = 0
        // Eyebrow (first non-blank if it's `*…*`)
        while i < lines.count
            && lines[i].trimmingCharacters(in: .whitespaces).isEmpty {
            i += 1
        }
        if i < lines.count {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if trimmed.count > 2,
               trimmed.hasPrefix("*"), trimmed.hasSuffix("*"),
               !trimmed.hasPrefix("**") {
                eyebrow = trimmed
                i += 1
            }
        }
        // Quote lines (consecutive `> …`)
        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix(">") {
                quoteLines.append(line)
                i += 1
            } else {
                break
            }
        }
        // Body + jump-link (everything else, with the jump-link line
        // pulled out separately so it's preserved verbatim on save).
        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.contains(anchor) || trimmed.contains("loom://anchor") {
                jumpLink = trimmed
            } else {
                bodyLines.append(line)
            }
            i += 1
        }
        // Trim leading/trailing blanks from body
        while let first = bodyLines.first,
              first.trimmingCharacters(in: .whitespaces).isEmpty {
            bodyLines.removeFirst()
        }
        while let last = bodyLines.last,
              last.trimmingCharacters(in: .whitespaces).isEmpty {
            bodyLines.removeLast()
        }
        let quote = quoteLines.joined(separator: "\n")
        let bodyText = bodyLines.joined(separator: "\n")
        return (eyebrow, quote, bodyText, jumpLink)
    }

    /// Replace `slice` in `source` with `replacement`. Same matching
    /// logic as the promote-helper (trimmed-line equality).
    private static func replaceSliceInSource(slice: String, with replacement: String, in source: String) -> String? {
        let sourceLines = source.components(separatedBy: "\n")
        let sliceLines = slice
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !sliceLines.isEmpty else { return nil }
        let sourceTrimmed = sourceLines.map { $0.trimmingCharacters(in: .whitespaces) }
        var i = 0
        while i < sourceTrimmed.count {
            if sourceTrimmed[i] == sliceLines[0] {
                var j = 0
                var k = i
                var matched = true
                while j < sliceLines.count, k < sourceTrimmed.count {
                    if sourceTrimmed[k].isEmpty { k += 1; continue }
                    if sourceTrimmed[k] != sliceLines[j] { matched = false; break }
                    j += 1; k += 1
                }
                if matched && j == sliceLines.count {
                    var rebuilt = Array(sourceLines.prefix(i))
                    rebuilt.append(contentsOf: replacement.components(separatedBy: "\n"))
                    rebuilt.append(contentsOf: sourceLines.suffix(from: k))
                    return rebuilt.joined(separator: "\n")
                }
            }
            i += 1
        }
        return nil
    }

    @ViewBuilder
    private func editEntrySheet(_ entry: EditingEntry) -> some View {
        VStack(alignment: .leading, spacing: DSSpace.sm.value + 4) {
            Text("Edit note")
                .font(DSType.caption.font)
                .fontWeight(.semibold)
                .foregroundStyle(LoomTokens.dsInk1)
            Text(entry.quote.replacingOccurrences(of: "> ", with: ""))
                .font(DSType.caption.font)
                .italic()
                .foregroundStyle(LoomTokens.dsInk1.opacity(0.85))
                .lineLimit(4)
                .padding(.leading, DSSpace.sm.value + 2)
                .padding(.vertical, 2)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(LoomTokens.dsThread.opacity(0.5))
                        .frame(width: 2)
                }
            // Same opaque ZStack pattern as the Note popover —
            // keeps the textarea readable in dark mode (otherwise
            // SwiftUI's TextEditor renders as a black void over
            // translucent containers).
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: DSRadius.md.value)
                    .fill(LoomTokens.dsPaperCard)
                RoundedRectangle(cornerRadius: DSRadius.md.value)
                    .stroke(LoomTokens.dsHair, lineWidth: 1)
                TextEditor(text: $editingEntryDraft)
                    .font(DSType.caption.font)
                    .foregroundStyle(LoomTokens.dsInk1)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, DSSpace.sm.value - 2)
                    .padding(.vertical, DSSpace.xs.value)
            }
            .frame(minHeight: 180)
            HStack(spacing: DSSpace.sm.value + 2) {
                Spacer()
                Button("Cancel") {
                    editingEntry = nil
                    editingEntryDraft = ""
                }
                .keyboardShortcut(.cancelAction)
                Button("Save") { commitEditEntry(entry) }
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(DSSpace.md.value + 4)
        .frame(width: 480)
    }

    /// Find the entry block containing the given anchor URL: walk
    /// backwards from the anchor line to the previous eyebrow or `##`
    /// boundary; walk forwards to the next eyebrow or `##` boundary.
    /// Returns the slice as a single string (trimmed).
    private static func entrySlice(containing anchor: String, in source: String) -> String? {
        let lines = source.components(separatedBy: "\n")
        var anchorIdx = -1
        for (i, line) in lines.enumerated() {
            if line.contains(anchor) {
                anchorIdx = i; break
            }
        }
        guard anchorIdx >= 0 else { return nil }

        var startIdx = anchorIdx
        while startIdx > 0 {
            let curr = lines[startIdx].trimmingCharacters(in: .whitespaces)
            if isEntryEyebrow(curr) { break }
            let prev = lines[startIdx - 1].trimmingCharacters(in: .whitespaces)
            if prev.hasPrefix("## ") { break }
            startIdx -= 1
        }
        // If startIdx didn't land on an eyebrow, scan back one more
        // step in case the eyebrow is exactly on startIdx-1.
        if startIdx > 0
            && !isEntryEyebrow(lines[startIdx].trimmingCharacters(in: .whitespaces))
            && isEntryEyebrow(lines[startIdx - 1].trimmingCharacters(in: .whitespaces)) {
            startIdx -= 1
        }

        var endIdx = anchorIdx + 1
        while endIdx < lines.count {
            let line = lines[endIdx].trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("## ") && !line.hasPrefix("### ") { break }
            if isEntryEyebrow(line) { break }
            endIdx += 1
        }

        let slice = lines[startIdx..<endIdx]
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return slice.isEmpty ? nil : slice
    }

    private static func isEntryEyebrow(_ trimmed: String) -> Bool {
        guard trimmed.count > 2,
              trimmed.hasPrefix("*"), trimmed.hasSuffix("*"),
              !trimmed.hasPrefix("**") else { return false }
        return !trimmed.dropFirst().dropLast().contains("*")
    }

    /// Promote an inline note slice into a brand-new top-level page.
    /// Prompts for a title (defaults to the first non-blank line of
    /// the slice, lightly cleaned). Then calls into the static helper
    /// that creates the page, seeds it, rewrites the parent file, and
    /// returns the new page URL. On success we navigate to the new
    /// page so the user lands in their new writing surface.
    private func promoteNote(slice: String) {
        guard let rootID = rootID else { return }
        let target = LoomFileStore.loomMDURL(for: rootID)
        let existing = (try? String(contentsOf: target, encoding: .utf8)) ?? ""
        let suggested = Self.suggestTitle(fromSlice: slice)
        let alert = NSAlert()
        alert.messageText = "Promote note to page"
        alert.informativeText = "Move this note out of the parent page into a standalone page. The parent will keep a one-line link to it."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Promote")
        alert.addButton(withTitle: "Cancel")
        let field = NSTextField(string: suggested)
        field.frame = NSRect(x: 0, y: 0, width: 300, height: 22)
        alert.accessoryView = field
        let response = alert.runModal()
        guard response == .alertFirstButtonReturn else { return }
        let title = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        let newURL = SourceFileView.promoteInlineNote(
            sliceText: slice,
            title: title,
            parentMDURL: target,
            parentMDSource: existing,
            parentName: effectiveDisplayName
        )
        if let newURL = newURL {
            NotificationCenter.default.post(
                name: .loomShowFolderHome,
                object: nil,
                userInfo: ["url": newURL]
            )
        }
    }

    /// Remove an inline note slice from the parent's Loom.md. Confirms
    /// destructive action via NSAlert; quietly leaves the file alone
    /// if the slice can't be located (defensive — rare but possible
    /// when render structure drifts from raw markdown). Reload picks
    /// up the change automatically.
    private func deleteNote(slice: String) {
        guard let target = loomMDURL else { return }
        let alert = NSAlert()
        alert.messageText = "Delete this note?"
        alert.informativeText = "The quote, your thought, and the jump-back link will be removed from this page. This can't be undone."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Delete")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let existing = (try? String(contentsOf: target, encoding: .utf8)) ?? ""
        guard let updated = Self.removeSlice(slice: slice, from: existing) else {
            return
        }
        do {
            try updated.write(to: target, atomically: true, encoding: .utf8)
            Task { await reload() }
        } catch {
            // Silent — if write fails the file is unchanged
        }
    }

    /// Find `slice` in `source` (matching by trimmed line equality so
    /// minor whitespace drift doesn't defeat the match) and remove
    /// those lines, plus any immediately-adjacent blank lines so we
    /// don't leave a hole.
    private static func removeSlice(slice: String, from source: String) -> String? {
        let sourceLines = source.components(separatedBy: "\n")
        let sliceLines = slice
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !sliceLines.isEmpty else { return nil }
        let sourceTrimmed = sourceLines.map { $0.trimmingCharacters(in: .whitespaces) }
        var i = 0
        while i < sourceTrimmed.count {
            if sourceTrimmed[i] == sliceLines[0] {
                var j = 0
                var k = i
                while j < sliceLines.count, k < sourceTrimmed.count {
                    if sourceTrimmed[k].isEmpty { k += 1; continue }
                    if sourceTrimmed[k] != sliceLines[j] { break }
                    j += 1; k += 1
                }
                if j == sliceLines.count {
                    var rebuilt = Array(sourceLines.prefix(i))
                    var tail = Array(sourceLines.suffix(from: k))
                    // Eat one trailing blank to avoid double-gap
                    while let first = tail.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
                        tail.removeFirst()
                    }
                    // Eat one leading blank too if it's now adjacent to another blank
                    while rebuilt.count >= 2,
                          let last = rebuilt.last, last.trimmingCharacters(in: .whitespaces).isEmpty,
                          let second = rebuilt.dropLast().last, second.trimmingCharacters(in: .whitespaces).isEmpty {
                        rebuilt.removeLast()
                    }
                    return (rebuilt + tail).joined(separator: "\n")
                }
            }
            i += 1
        }
        return nil
    }

    /// Heuristic: first non-eyebrow line of the slice, capped at 60
    /// chars at a word boundary. Falls back to "New page".
    private static func suggestTitle(fromSlice slice: String) -> String {
        for raw in slice.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            // Skip eyebrows like `*p.3 · ts*`.
            if line.hasPrefix("*") && line.hasSuffix("*") && !line.hasPrefix("**") { continue }
            // Strip leading `> ` / `- ` / `### ` markers for a clean title.
            var clean = line
            for prefix in ["> ", "- ", "### ", "## ", "# "] {
                if clean.hasPrefix(prefix) { clean = String(clean.dropFirst(prefix.count)); break }
            }
            // If the line is a markdown link `[text](url)`, take the text.
            if clean.hasPrefix("["), let close = clean.range(of: "](") {
                clean = String(clean[clean.index(after: clean.startIndex)..<close.lowerBound])
            }
            let trimmed = clean.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty { continue }
            if trimmed.count <= 60 { return trimmed }
            let cut = trimmed.prefix(60)
            if let lastSpace = cut.lastIndex(of: " ") {
                return String(cut[..<lastSpace]) + "…"
            }
            return String(cut) + "…"
        }
        return "New page"
    }

    private func refreshLiveRootName() {
        guard let rootID = rootID else { return }
        liveRootName = ContentRootStore.loadAll().first(where: { $0.id == rootID })?.displayName
    }

    /// Description portion of Loom.md (everything before `## Resources`
    /// or `## Notes`, whichever comes first).
    private var descriptionPart: String {
        guard let md = loomMD else { return "" }
        return Self.splitSections(md).description
    }

    /// Resources portion of Loom.md (between `## Resources` and `## Notes`,
    /// or to end if Notes absent). Raw markdown — rendered via
    /// `LoomMarkdownView` so links route through our scheme.
    private var resourcesPart: String {
        guard let md = loomMD else { return "" }
        return Self.splitSections(md).resources
    }

    /// Parsed individual notes from the Notes section.
    private var parsedNotes: [Note] {
        guard let md = loomMD else { return [] }
        return Self.splitSections(md).notes
    }

    // MARK: - Sections

    /// Editable page title. Click to rename; Enter commits, Esc cancels.
    /// Writes through `ContentRootStore.update`; sidebar refreshes via
    /// `.loomContentRootsChanged`.
    @ViewBuilder
    private var pageTitle: some View {
        if let name = effectiveDisplayName, !name.isEmpty {
            if isEditingTitle && isAtRoot {
                TextField("Title", text: $titleDraft)
                    .textFieldStyle(.plain)
                    .font(DSType.display1.font)
                    .focused($titleFieldFocused)
                    .onSubmit { commitTitleEdit() }
                    .onExitCommand { cancelTitleEdit() }
            } else {
                Text(name)
                    .font(DSType.display1.font)
                    .foregroundStyle(LoomTokens.dsInk1)
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if isAtRoot { startTitleEdit() }
                    }
            }
        }
    }

    /// The page itself — one free-flow markdown document. Click the
    /// rendered area to switch the WHOLE document into a TextEditor;
    /// blur to save and re-render. Borderless, full-width: feels like
    /// writing on a page, not into a form field.
    @ViewBuilder
    private var pageBody: some View {
        if isEditingMD {
            VStack(alignment: .leading, spacing: DSSpace.sm.value + 4) {
                TextEditor(text: $editingDraft)
                    .font(DSType.body.font)
                    .lineSpacing(4)
                    .scrollContentBackground(.hidden)
                    .background(Color.clear)
                    .frame(minHeight: 600)
                HStack(spacing: DSSpace.sm.value) {
                    Spacer()
                    Button("Cancel") { cancelEdit() }
                        .buttonStyle(.plain)
                        .font(DSType.eyebrow.font)
                        .foregroundStyle(LoomTokens.dsInk2)
                    Button("Done") { commitEdit() }
                        .buttonStyle(.plain)
                        .font(DSType.eyebrow.font)
                        .foregroundStyle(LoomTokens.dsInk1)
                        .keyboardShortcut(.return, modifiers: .command)
                }
                .padding(.top, DSSpace.xs.value)
            }
        } else {
            Group {
                if let md = renderableMD, !md.isEmpty {
                    LoomMarkdownView(
                        source: md,
                        baseLoomURL: currentLoomURL,
                        onPromoteAnchor: { anchor in promoteByAnchor(anchor) },
                        onDeleteAnchor: { anchor in deleteByAnchor(anchor) },
                        onEditAnchor: { anchor in startEditEntry(anchor) }
                    )
                } else {
                    Text("Empty page. Click here to start typing.")
                        .font(DSType.body.font)
                        .italic()
                        .foregroundStyle(LoomTokens.dsInk2)
                        .padding(.vertical, DSSpace.lg.value)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 600, alignment: .topLeading)
            .contentShape(Rectangle())
            .onTapGesture { startEdit() }
        }
    }

    // `noteCaptureRow` (the bottom-of-page "+ Add note" button) was
    // removed — it created a third creation path that wrote to a
    // legacy `## Notes` section, conflicting with the prose-vs-
    // anchored model. Free-form prose now goes through edit mode
    // (click the page body); anchored notes come from the PDF
    // right-click → Note popover.

    /// A single parsed note kept for backward compat with note-delete
    /// rebuild path. The page no longer renders notes as cards — they
    /// flow inline in the markdown — but `splitSections` still parses
    /// them so legacy delete / append operations work.
    struct Note: Identifiable, Hashable {
        let id: Int
        let header: String
        let body: String
    }

    /// Files on disk that aren't referenced anywhere in the Loom.md
    /// markdown. Shown as a quiet "Uncurated" footer so the user can
    /// still discover newly-added files without losing them.
    private var uncuratedEntries: [FolderEntry] {
        let referenced = curatedNames
        return entries.filter { !referenced.contains($0.name) }
    }

    /// Shown when this page is backed by an external folder and that
    /// folder is currently empty (no scannable contents). Distinguishes
    /// "real folder, just empty right now" from "pure page (no folder
    /// behind it)" — the latter shows the markdown empty state instead.
    @ViewBuilder
    private var emptyExternalFolderHint: some View {
        VStack(alignment: .leading, spacing: DSSpace.sm.value - 2) {
            Text("This folder is empty.")
                .font(DSType.caption.font)
                .foregroundStyle(LoomTokens.dsInk2)
            Text("Add files to it in Finder, then click ↻ in the toolbar (or just switch back to Loom — it auto-refreshes).")
                .font(DSType.eyebrow.font)
                .foregroundStyle(LoomTokens.dsInk3)
                .fixedSize(horizontal: false, vertical: true)
            if let external = externalFolderURL {
                Button {
                    NSWorkspace.shared.open(external)
                } label: {
                    HStack(spacing: DSSpace.xs.value) {
                        Image(systemName: "folder")
                            .font(DSType.eyebrow.font)
                        Text("Open folder in Finder")
                            .font(DSType.eyebrow.font)
                    }
                    .foregroundStyle(LoomTokens.dsInk2)
                    .padding(.top, DSSpace.xs.value)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.vertical, DSSpace.md.value)
    }

    /// Live mirror of the source folder rendered as native rows
    /// (clickable, sorted, folder-icons). Always derived from `entries`,
    /// never persisted to Loom.md — that way the human-edit textarea
    /// shows only the user's own content, not the auto-generated
    /// `[Name/](Name%20/)` boilerplate that adds cognitive burden.
    /// Phase B "second brain" surface: cross-root captures embedded
    /// similarity-close to this folder's topic. Renders only when
    /// matches exist (≥ 0.70 cosine). Each row click opens the
    /// captured Loom.md externally — Loom-internal markdown rendering
    /// is Phase C territory, intentionally deferred.
    @ViewBuilder
    private var relatedCapturesSection: some View {
        VStack(alignment: .leading, spacing: DSSpace.sm.value - 2) {
            HStack(alignment: .firstTextBaseline, spacing: DSSpace.sm.value - 2) {
                Text("Related captures")
                    .font(DSType.display3.font)
                    .fontWeight(.semibold)
                Text("\(relatedHits.count)")
                    .font(DSType.mono.font)
                    .foregroundStyle(LoomTokens.dsInk2)
                Spacer(minLength: 0)
                Text("from across all your workspaces")
                    .font(DSType.eyebrow.font)
                    .foregroundStyle(LoomTokens.dsInk3)
            }
            .padding(.top, DSSpace.sm.value + 4)
            .padding(.bottom, DSSpace.xs.value)
            ForEach(relatedHits) { hit in
                Button {
                    NSWorkspace.shared.open(URL(fileURLWithPath: hit.record.targetPath))
                } label: {
                    HStack(alignment: .top, spacing: DSSpace.sm.value + 2) {
                        Text("\(Int(hit.similarity * 100))%")
                            .font(DSType.mono.font)
                            .foregroundStyle(LoomTokens.dsThread)
                            .frame(width: 36, alignment: .leading)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(hit.record.anchorLabel)
                                .font(DSType.caption.font)
                                .fontWeight(.medium)
                                .foregroundStyle(LoomTokens.dsInk1)
                            Text(hit.record.snippet)
                                .font(DSType.eyebrow.font)
                                .italic()
                                .foregroundStyle(LoomTokens.dsInk2)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(DSSpace.sm.value)
                    .contentShape(Rectangle())
                    .background(
                        RoundedRectangle(cornerRadius: DSRadius.sm.value)
                            .fill(LoomTokens.dsHairFaint)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: DSRadius.sm.value)
                            .stroke(LoomTokens.dsHair, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// Compose a query string from the page's title + description and
    /// run cross-root similarity. Async because we don't want a 50ms
    /// embedding compute on the view-render hot path.
    private func runRelatedQuery() async {
        let title = effectiveDisplayName ?? ""
        let description = LoomFolderHomeView.splitSections(loomMD ?? "").description
        let query = "\(title)\n\n\(description)".trimmingCharacters(in: .whitespacesAndNewlines)
        guard query.count >= 12 else {
            await MainActor.run { relatedHits = [] }
            return
        }
        let hits = LoomEmbeddingStore.similarAcrossAllRoots(to: query, limit: 5)
        await MainActor.run { relatedHits = hits }
    }

    @ViewBuilder
    private var resourcesSection: some View {
        VStack(alignment: .leading, spacing: DSSpace.sm.value - 2) {
            HStack(alignment: .firstTextBaseline, spacing: DSSpace.sm.value) {
                Text("Resources")
                    .font(DSType.display3.font)
                    .fontWeight(.semibold)
                Spacer(minLength: 0)
                Menu {
                    ForEach(EntrySortOrder.allCases) { order in
                        Button {
                            sortOrderRaw = order.rawValue
                        } label: {
                            Label(order.label, systemImage: order.systemImage)
                            if sortOrder == order {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                } label: {
                    HStack(spacing: DSSpace.xs.value) {
                        Image(systemName: sortOrder.systemImage)
                            .font(DSType.eyebrow.font)
                        Text(sortOrder.label)
                            .font(DSType.eyebrow.font)
                    }
                    .foregroundStyle(LoomTokens.dsInk2)
                    .padding(.vertical, 2)
                    .padding(.horizontal, DSSpace.sm.value - 2)
                    .contentShape(Rectangle())
                }
                .menuStyle(.borderlessButton)
                .menuIndicator(.hidden)
                .fixedSize()
                .help("Sort order for Resources (view only — doesn't change the folder)")
            }
            .padding(.top, DSSpace.sm.value + 4)
            .padding(.bottom, DSSpace.xs.value)
            ForEach(sortedEntries) { entry in
                fileRow(entry)
            }
        }
    }

    private func deleteNote(_ note: Note) {
        guard let md = loomMD else { return }
        let split = Self.splitSections(md)
        var remaining = split.notes
        remaining.removeAll { $0.id == note.id }
        let rebuilt = Self.rebuildMarkdown(
            description: split.description,
            resources: split.resources,
            notes: remaining
        )
        guard let target = loomMDURL else { return }
        do {
            if rebuilt.isEmpty {
                try? FileManager.default.removeItem(at: target)
                loomMD = nil
            } else {
                try rebuilt.write(to: target, atomically: true, encoding: .utf8)
                loomMD = rebuilt
            }
        } catch {
            return
        }
    }

    /// Split a Loom.md source into three sections:
    ///   - `description`: prose before `## Resources` or `## Notes` (whichever
    ///     comes first)
    ///   - `resources`: raw markdown between `## Resources` and `## Notes`
    ///     (or to end if Notes absent). Empty when no `## Resources` heading.
    ///   - `notes`: parsed individual notes after `## Notes`.
    /// Convention assumes Resources comes before Notes. Out-of-order files
    /// degrade gracefully (Resources block is whatever's between the
    /// markers; the parser just respects file order).
    static func splitSections(_ source: String) -> (description: String, resources: String, notes: [Note]) {
        let resourcesMarker = findSectionMarker(in: source, heading: "## Resources")
        let notesMarker = findSectionMarker(in: source, heading: "## Notes")

        // Resolve description end = earliest of the two markers (or end of file)
        let descriptionEnd: String.Index = {
            switch (resourcesMarker, notesMarker) {
            case (nil, nil): return source.endIndex
            case (let r?, nil): return r.headingStart
            case (nil, let n?): return n.headingStart
            case (let r?, let n?): return min(r.headingStart, n.headingStart)
            }
        }()

        let description = String(source[..<descriptionEnd])
            .trimmingCharacters(in: .whitespacesAndNewlines)

        // Resolve resources block: from after-resources-heading to notes-heading or end
        var resourcesRaw = ""
        if let r = resourcesMarker {
            let bodyStart = r.bodyStart
            let bodyEnd = notesMarker.map { $0.headingStart } ?? source.endIndex
            if bodyStart <= bodyEnd {
                resourcesRaw = String(source[bodyStart..<bodyEnd])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }

        // Resolve notes block + parse individual notes
        var notes: [Note] = []
        if let n = notesMarker {
            let bodyStart = n.bodyStart
            let after = source[bodyStart..<source.endIndex]
            var currentHeader: String? = nil
            var currentBody: [String] = []
            var nextID = 0
            func flush() {
                guard let header = currentHeader else { return }
                let body = currentBody.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
                notes.append(Note(id: nextID, header: header, body: body))
                nextID += 1
                currentHeader = nil
                currentBody.removeAll()
            }
            for rawLine in after.split(separator: "\n", omittingEmptySubsequences: false) {
                let line = String(rawLine)
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("### ") {
                    flush()
                    currentHeader = String(trimmed.dropFirst(4))
                } else if currentHeader != nil {
                    currentBody.append(line)
                }
            }
            flush()
        }

        return (description, resourcesRaw, notes)
    }

    /// Locate a `## Heading` line in the source. Returns the index range
    /// pieces a caller needs: `headingStart` (where the line starts —
    /// useful for slicing the description) and `bodyStart` (right after
    /// the heading line, where the section's content begins).
    private struct SectionMarker {
        let headingStart: String.Index
        let bodyStart: String.Index
    }
    private static func findSectionMarker(in source: String, heading: String) -> SectionMarker? {
        // Prefer "\n<heading>" so we don't false-match a substring; fall back
        // to anchored match for files that begin with the heading.
        let needleNL = "\n" + heading
        if let range = source.range(of: needleNL) {
            let headingStart = source.index(after: range.lowerBound)  // skip the leading \n
            // bodyStart = end-of-heading-line
            let endOfLine = source[range.upperBound...].firstIndex(of: "\n") ?? source.endIndex
            let bodyStart = endOfLine == source.endIndex ? source.endIndex : source.index(after: endOfLine)
            return SectionMarker(headingStart: headingStart, bodyStart: bodyStart)
        }
        if source.hasPrefix(heading) {
            let headingStart = source.startIndex
            let endOfLine = source.firstIndex(of: "\n") ?? source.endIndex
            let bodyStart = endOfLine == source.endIndex ? source.endIndex : source.index(after: endOfLine)
            return SectionMarker(headingStart: headingStart, bodyStart: bodyStart)
        }
        return nil
    }

    /// Backward-compat shim: callers that haven't migrated to splitSections
    /// can still get description + notes via this older signature. Drop
    /// later when all sites use splitSections.
    static func splitDescriptionAndNotes(_ source: String) -> (description: String, notes: [Note]) {
        let s = splitSections(source)
        return (s.description, s.notes)
    }

    /// Reconstruct Loom.md from description + (optional) resources +
    /// notes list. Preserves heading ordering and empty-section omission.
    static func rebuildMarkdown(description: String, resources: String = "", notes: [Note]) -> String {
        let descTrimmed = description.trimmingCharacters(in: .whitespacesAndNewlines)
        let resTrimmed = resources.trimmingCharacters(in: .whitespacesAndNewlines)
        var out = descTrimmed
        if !resTrimmed.isEmpty {
            if !out.isEmpty { out += "\n\n" }
            out += "## Resources\n\n\(resTrimmed)"
        }
        if !notes.isEmpty {
            if !out.isEmpty { out += "\n\n" }
            out += "## Notes\n\n"
            for note in notes {
                out += "### \(note.header)\n"
                if !note.body.isEmpty { out += "\(note.body)\n" }
                out += "\n"
            }
        }
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Names of files/sub-folders referenced anywhere in the rendered
    /// Loom.md. Used by the Uncurated footer to subtract files the
    /// user has already curated into the page (so they don't appear
    /// twice). Matches by last path component, decoded.
    private var curatedNames: Set<String> {
        guard let md = loomMD, !md.isEmpty else { return [] }
        var names: Set<String> = []
        let pattern = #"\[[^\]]+\]\(([^)]+)\)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let nsRange = NSRange(md.startIndex..<md.endIndex, in: md)
        regex.enumerateMatches(in: md, options: [], range: nsRange) { match, _, _ in
            guard let match = match, match.numberOfRanges > 1,
                  let r = Range(match.range(at: 1), in: md) else { return }
            var path = String(md[r])
            if path.hasPrefix("http://") || path.hasPrefix("https://") { return }
            if path.hasPrefix("./") { path = String(path.dropFirst(2)) }
            if path.hasSuffix("/") { path = String(path.dropLast()) }
            let last = path.split(separator: "/").last.map(String.init) ?? path
            let decoded = last.removingPercentEncoding ?? last
            if !decoded.isEmpty { names.insert(decoded) }
        }
        return names
    }

    @ViewBuilder
    private func fileRow(_ entry: FolderEntry) -> some View {
        Button {
            navigate(to: entry)
        } label: {
            HStack(spacing: DSSpace.sm.value + 2) {
                Image(systemName: entry.isDirectory ? "folder" : iconForExtension(entry.url.pathExtension))
                    .font(DSType.caption.font)
                    .foregroundStyle(LoomTokens.dsInk2)
                    .frame(width: 18, alignment: .center)
                Text(entry.name)
                    .font(DSType.caption.font)
                    .foregroundStyle(LoomTokens.dsInk1)
                Spacer(minLength: 0)
                if let modifiedAt = entry.modifiedAt {
                    Text(relativeDate(modifiedAt))
                        .font(DSType.mono.font)
                        .foregroundStyle(LoomTokens.dsInk2)
                }
            }
            .padding(.vertical, DSSpace.xs.value)
            .padding(.horizontal, DSSpace.sm.value - 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.sm.value).fill(Color.clear)
        )
    }

    // MARK: - Behaviour

    private func iconForExtension(_ ext: String) -> String {
        switch ext.lowercased() {
        case "pdf": return "doc.richtext"
        case "md", "mdx": return "doc.text"
        case "png", "jpg", "jpeg", "gif", "heic": return "photo"
        case "mp4", "mov", "avi": return "video"
        case "zip", "tar", "gz": return "archivebox"
        case "key", "pages", "numbers": return "doc"
        default: return "doc"
        }
    }

    private func relativeDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func navigate(to entry: FolderEntry) {
        // Build the loom:// URL for this child entry. Folders → folder
        // home (recursive). Files → SourceFileView (PDFKit / QuickLook).
        guard let rootURL = resolveRootURL(),
              let relative = relativePath(of: entry.url, under: rootURL) else { return }
        let encoded = relative
            .split(separator: "/")
            .map { $0.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? String($0) }
            .joined(separator: "/")
        let prefix: String = {
            if let rootID { return "loom://content/\(rootID.uuidString.lowercased())/" }
            return "loom://content/"
        }()
        let urlString = prefix + encoded
        guard let target = URL(string: urlString) else { return }
        if entry.isDirectory {
            NotificationCenter.default.post(
                name: .loomShowFolderHome,
                object: nil,
                userInfo: ["url": target]
            )
        } else {
            NotificationCenter.default.post(
                name: .loomOpenSourceFile,
                object: nil,
                userInfo: ["url": target]
            )
        }
    }

    private func resolveRootURL() -> URL? {
        if let rootID, let url = ContentRootStore.activeURL(for: rootID) {
            return url
        }
        return folderURL  // standalone folder (no multi-root state)
    }

    private func relativePath(of fileURL: URL, under root: URL) -> String? {
        let rootPath = root.standardizedFileURL.path
        let filePath = fileURL.standardizedFileURL.path
        if filePath == rootPath { return "" }
        guard filePath.hasPrefix(rootPath + "/") else { return nil }
        return String(filePath.dropFirst(rootPath.count + 1))
    }

    // MARK: - Loading

    // MARK: - Edit flow

    private func startEdit() {
        // The textarea shows ONLY the user's own free-form prose.
        // Everything Loom manages (the title, Resources mirror, the
        // per-book sections that hold notes/threads/pursuits) is
        // hidden from the edit surface so the user isn't confronted
        // with raw `[name](url)` boilerplate or auto-grouped entry
        // formatting they didn't write.
        editingDraft = Self.extractProse(from: loomMD ?? "", pageName: effectiveDisplayName)
        isEditingMD = true
    }

    private func cancelEdit() {
        isEditingMD = false
        editingDraft = ""
    }

    private func commitEdit() {
        guard let target = loomMDURL else { return }
        // Merge the user's prose back into the file: prose lives in
        // the prelude (above the first `## ` section), Loom-managed
        // sections (per-book / Notes / Threads / etc.) are preserved
        // verbatim. This way editing prose doesn't risk wiping notes.
        let merged = Self.mergeProse(
            editingDraft,
            into: loomMD ?? "",
            pageName: effectiveDisplayName
        )
        let trimmedMerged = merged.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedMerged.isEmpty {
            try? FileManager.default.removeItem(at: target)
            loomMD = nil
        } else {
            do {
                try merged.write(to: target, atomically: true, encoding: .utf8)
                loomMD = merged
            } catch {
                return
            }
        }
        isEditingMD = false
        editingDraft = ""
    }

    private func startTitleEdit() {
        titleDraft = effectiveDisplayName ?? ""
        isEditingTitle = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            titleFieldFocused = true
        }
    }

    private func cancelTitleEdit() {
        isEditingTitle = false
        titleDraft = ""
    }

    private func commitTitleEdit() {
        defer { isEditingTitle = false; titleDraft = "" }
        guard let rootID = rootID else { return }
        let trimmed = titleDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard var current = ContentRootStore.loadAll().first(where: { $0.id == rootID }) else { return }
        guard trimmed != current.displayName else { return }
        current.displayName = trimmed
        ContentRootStore.update(current)
    }

    // The legacy `startNoteCapture` / `cancelNoteCapture` /
    // `commitNoteCapture` / `appendNote` triplet was removed along
    // with the "+ Add note" button — they wrote `### timestamp`
    // entries to a `## Notes` section that the new restructure pass
    // would then reroute. Free-form prose now flows through the
    // page-body edit mode instead.

    private func reload() async {
        loadGeneration += 1
        let gen = loadGeneration
        let externalFolder = externalFolderURL
        let label = displayName ?? folderURL.lastPathComponent
        let mdURL = loomMDURL
        let result = await Task.detached(priority: .utility) {
            // Files come from the external folder (read-only). Pure
            // `+ Page` roots have no external folder → empty entries.
            let entries: [FolderEntry] = externalFolder.map { Self.scanFolder($0) } ?? []
            // Loom.md lives in the file store, NEVER in the external
            // folder. Auto-scaffold on first visit: write an empty
            // file (the page title is rendered separately above; the
            // Resources list is a synthesized view from the disk
            // scan, never persisted to the file).
            if let mdURL = mdURL {
                if Self.readFile(mdURL) == nil {
                    _ = label // unused now; kept for future scaffold needs
                    try? "".write(to: mdURL, atomically: true, encoding: .utf8)
                }
                // Self-heal on read: run the same restructure pass the
                // save path uses. Rescues orphan entries, groups
                // multiple notes for the same file under one heading.
                // Only writes when the result actually differs so we
                // don't churn unmodified files.
                // Heal-on-load: re-enabled now that the regression's
                // root cause (isAtRoot symlink mismatch) is fixed.
                // Reorganizes legacy structure (orphan entries, old
                // per-section grouping) into the current per-book
                // shape on every page open. Only writes when the
                // healed result actually differs from disk so we
                // don't churn unmodified files. No more
                // refreshResources call — Resources is now a live
                // synthesized view, not persisted.
                var contents = Self.readFile(mdURL)
                if let raw = contents {
                    let healed = SourceFileView.healLoomMD(raw)
                    if healed != raw {
                        try? healed.write(to: mdURL, atomically: true, encoding: .utf8)
                        contents = healed
                    }
                }
                return (LoomMD: contents, entries: entries)
            }
            return (LoomMD: nil as String?, entries: entries)
        }.value
        await MainActor.run {
            guard gen == loadGeneration else { return }
            loomMD = result.LoomMD
            entries = result.entries
            // Step 4 — auto-enter edit mode on first visit when the
            // page has only a bare title (typical of `+ Page` creation
            // or a never-edited folder). Lets the user start typing
            // immediately. Pages with real content stay in render mode
            // so the user sees their formatted page.
            if shouldDefaultToEdit, !isEditingMD {
                startEdit()
            }
        }
    }

    /// Decide whether to auto-enter edit mode on folder load. True when
    /// Loom.md is empty / nil OR contains only a `# Title` line.
    /// Auto-scaffolded pages (with Resources list) count as non-empty,
    /// so + Folder gives render mode, + Page gives edit mode.
    private var shouldDefaultToEdit: Bool {
        guard let md = loomMD else { return true }
        let trimmed = md.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        let lines = trimmed
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if lines.count == 1, lines[0].trimmingCharacters(in: .whitespaces).hasPrefix("# ") {
            return true
        }
        return false
    }

    /// Auto-scaffold Loom.md text from a title + disk entries. Output:
    ///
    ///     ## Resources
    ///     - [Folder/](Folder/)
    ///     - [file.pdf](file.pdf)
    ///     ...
    ///
    /// The page title is rendered separately above the body, so we no
    /// longer emit a `# <title>` h1 here (it would just duplicate).
    /// `title` is kept as a parameter for callers but unused in v2.
    /// No description, no notes — those are user content. Folders sort
    /// before files; both natural-sorted within. Empty folders return
    /// an empty string so we don't write a useless file.
    /// Replace the `## Resources` section in `source` with a freshly-
    /// generated list of `entries` from disk. Creates the section at
    /// the top (after any prelude) when missing. Returns the source
    /// unchanged when there are no external entries — pure pages
    /// shouldn't carry an empty Resources block.
    ///
    /// This is what makes the Loom page mirror the user's folder live:
    /// every reload (including ⌘R / app-becomes-active) re-scans the
    /// source folder and updates the Resources block in Loom.md so
    /// new files / new subfolders show up without a restart.
    nonisolated private static func refreshResources(in source: String, entries: [FolderEntry]) -> String {
        guard !entries.isEmpty else { return source }
        let live = scaffoldMarkdown(title: "", entries: entries)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !live.isEmpty else { return source }

        var lines = source.components(separatedBy: "\n")
        // Locate `## Resources` and the next `## ` (or EOF).
        var startIdx = -1
        for (i, line) in lines.enumerated() {
            if line.trimmingCharacters(in: .whitespaces) == "## Resources" {
                startIdx = i; break
            }
        }
        if startIdx < 0 {
            // No Resources section — insert at top, after any prelude
            // (everything before the first `## ` heading).
            var insertAt = 0
            for (i, line) in lines.enumerated() {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                    insertAt = i; break
                }
                insertAt = i + 1
            }
            // Ensure a blank line above
            if insertAt > 0, lines[insertAt - 1].trimmingCharacters(in: .whitespaces).isEmpty == false {
                lines.insert("", at: insertAt); insertAt += 1
            }
            let liveLines = live.components(separatedBy: "\n") + [""]
            lines.insert(contentsOf: liveLines, at: insertAt)
            return lines.joined(separator: "\n")
        }
        var endIdx = lines.count
        for i in (startIdx + 1)..<lines.count {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                endIdx = i; break
            }
        }
        // Trim trailing blanks inside the existing block (we'll add
        // exactly one separator below).
        while endIdx > startIdx + 1
            && lines[endIdx - 1].trimmingCharacters(in: .whitespaces).isEmpty {
            endIdx -= 1
        }
        let liveLines = live.components(separatedBy: "\n") + [""]
        var rebuilt = Array(lines.prefix(startIdx))
        rebuilt.append(contentsOf: liveLines)
        rebuilt.append(contentsOf: lines.suffix(from: endIdx))
        return rebuilt.joined(separator: "\n")
    }

    nonisolated private static func scaffoldMarkdown(title: String, entries: [FolderEntry]) -> String {
        _ = title
        guard !entries.isEmpty else { return "" }
        let dirs = entries.filter { $0.isDirectory }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        let files = entries.filter { !$0.isDirectory }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        var out = "## Resources\n\n"
        for dir in dirs {
            let encoded = encodePathSegment(dir.name)
            out += "- [\(dir.name)/](\(encoded)/)\n"
        }
        for file in files {
            let encoded = encodePathSegment(file.name)
            out += "- [\(file.name)](\(encoded))\n"
        }
        return out
    }

    nonisolated private static func encodePathSegment(_ name: String) -> String {
        name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
    }

    nonisolated private static func readFile(_ url: URL) -> String? {
        try? String(contentsOf: url, encoding: .utf8)
    }

    nonisolated private static func scanFolder(_ folder: URL) -> [FolderEntry] {
        // Rely on the launch-time `startAccessingSecurityScopedResource`
        // call in `ContentRootStore.activateAtLaunch` for access. Adding
        // a per-call start+defer-stop here regressed reads across all
        // folder roots — likely a balance-counter interaction. Don't
        // re-introduce without testing across all roots.
        let fm = FileManager.default
        guard let urls = try? fm.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: [.isDirectoryKey, .contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }
        var dirs: [FolderEntry] = []
        var files: [FolderEntry] = []
        for url in urls {
            // Skip the orientation file itself — it's already rendered up top.
            if url.lastPathComponent == "Loom.md" { continue }
            // Skip Loom-generated AI artifacts (Loom.studyguide.md, etc.)
            if url.lastPathComponent.hasPrefix("Loom.") && url.pathExtension.lowercased() == "md" { continue }
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey])
            let isDir = values?.isDirectory ?? false
            let entry = FolderEntry(
                id: url.standardizedFileURL.path,
                url: url,
                name: url.lastPathComponent,
                isDirectory: isDir,
                modifiedAt: values?.contentModificationDate
            )
            if isDir { dirs.append(entry) } else { files.append(entry) }
        }
        let sortedDirs = dirs.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        let sortedFiles = files.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
        return sortedDirs + sortedFiles
    }

}

/// Minimal markdown renderer using SwiftUI's built-in AttributedString
/// markdown support. Each top-level block (heading / paragraph / list)
/// is rendered as its own SwiftUI view so block-level styling (heading
/// sizes, list indentation) reads correctly.
///
/// This is the Phase-A renderer — deliberately small. Vellum's richer
/// typography (drop caps, ProvHi overlays) lives in the webview-based
/// /wiki pipeline; we'll revisit upgrading this to that if needed.
struct LoomMarkdownView: View {
    let source: String
    /// Base `loom://content/<root-id>/[<sub-path>/]` URL used to
    /// resolve relative links (e.g. `[Folder/](Folder/)`) found in the
    /// rendered markdown. nil disables relative-link resolution.
    var baseLoomURL: URL? = nil
    /// Invoked from a quote's right-click context menu. The renderer
    /// passes the anchor URL of the clicked passage; the caller
    /// resolves it to a markdown slice and acts on it. Per-note
    /// actions are anchor-driven so the renderer doesn't need to
    /// pre-group blocks (which regressed before).
    var onPromoteAnchor: ((_ anchorURL: String) -> Void)? = nil
    var onDeleteAnchor: ((_ anchorURL: String) -> Void)? = nil
    var onEditAnchor: ((_ anchorURL: String) -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: DSSpace.sm.value - 2) {
            ForEach(blocks.indices, id: \.self) { idx in
                blockView(blocks[idx])
            }
        }
        // Intercept clicks on links inside rendered markdown.
        //   - loom://anchor?...                           → jump back to PDF passage
        //   - loom://content/<root-id>/<path>             → open file / sub-folder
        //   - relative path (e.g. `Guide/`, `file.pdf`)   → resolve against baseLoomURL
        // Anything else (http, mailto) gets the system default.
        .environment(\.openURL, OpenURLAction { url in
            if url.scheme == "loom" {
                return handleLoomURL(url)
            }
            // Relative links from auto-scaffolded Resources lists arrive
            // with no scheme (or as file:// resolved against nothing).
            // Re-anchor them under the current page's loom:// base.
            if (url.scheme == nil || url.scheme == "file"),
               let base = baseLoomURL {
                let rel = url.scheme == "file" ? url.lastPathComponent : url.absoluteString
                if let resolved = resolveRelative(rel, against: base) {
                    return handleLoomURL(resolved)
                }
            }
            return .systemAction
        })
    }

    private func handleLoomURL(_ url: URL) -> OpenURLAction.Result {
        if url.host == "anchor" {
            NotificationCenter.default.post(
                name: .loomJumpToPDFAnchor,
                object: nil,
                userInfo: ["url": url]
            )
            return .handled
        }
        if url.host == "content" {
            // Three shapes:
            //   loom://content/<uuid>           → page home (a root or sub-page)
            //   loom://content/<uuid>/<sub>/    → folder home (trailing slash)
            //   loom://content/<uuid>/<file>    → source file
            // Sub-page links carry no path beyond the UUID; route them
            // to folder home so the page actually opens.
            let trimmedPath = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let segs = trimmedPath.split(separator: "/")
            let isPageOrFolder = segs.count <= 1 || url.absoluteString.hasSuffix("/")
            let name: Notification.Name = isPageOrFolder ? .loomShowFolderHome : .loomOpenSourceFile
            NotificationCenter.default.post(name: name, object: nil, userInfo: ["url": url])
            return .handled
        }
        return .systemAction
    }

    private func resolveRelative(_ rel: String, against base: URL) -> URL? {
        // Trim leading slashes; markdown URLs shouldn't be absolute paths.
        let trimmed = rel.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty else { return base }
        let baseStr = base.absoluteString.hasSuffix("/") ? base.absoluteString : base.absoluteString + "/"
        let trailingSlash = rel.hasSuffix("/") ? "/" : ""
        return URL(string: baseStr + trimmed + trailingSlash)
    }

    private var blocks: [Block] { Self.normalize(Self.parseBlocks(source)) }

    /// Group consecutive blocks into entry-units for context-menu
    /// purposes. An entry starts with an italic eyebrow paragraph
    /// (`*p.N · ts*` or `*ts*`) and runs until the next eyebrow, the
    /// next heading, or end-of-document. Non-entry blocks (headings,
    /// resource lists, raw paragraphs) become singleton groups.
    private var entryGroups: [EntryGroup] {
        let bs = blocks
        var groups: [EntryGroup] = []
        let raw = source.components(separatedBy: "\n")
        // Find eyebrow paragraphs in `raw` to know where each entry's
        // text starts in the original markdown.
        var rawCursor = 0

        func consumeRaw(forBlocks indices: [Int], stopAtEyebrow: Bool) -> String {
            // Pull lines from rawCursor until we've seen the textual
            // markers for these blocks (eyebrow text or text excerpt).
            // Keep it simple: take lines until next eyebrow / heading.
            var collected: [String] = []
            while rawCursor < raw.count {
                let line = raw[rawCursor]
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                if !collected.isEmpty {
                    if Self.isEyebrowLine(trimmed) && stopAtEyebrow { break }
                    if trimmed.hasPrefix("##") { break }
                }
                collected.append(line)
                rawCursor += 1
                if !stopAtEyebrow { break }
            }
            // Trim trailing blanks
            while let last = collected.last, last.trimmingCharacters(in: .whitespaces).isEmpty {
                collected.removeLast()
            }
            return collected.joined(separator: "\n")
        }

        var i = 0
        while i < bs.count {
            if Self.isEntryStart(bs[i]) {
                var j = i + 1
                while j < bs.count, !Self.isEntryStart(bs[j]), !Self.isHeading(bs[j]) {
                    j += 1
                }
                let indices = Array(i..<j)
                let slice = consumeRaw(forBlocks: indices, stopAtEyebrow: true)
                groups.append(EntryGroup(blockIndices: indices, entrySlice: slice))
                i = j
            } else {
                _ = consumeRaw(forBlocks: [i], stopAtEyebrow: false)
                groups.append(EntryGroup(blockIndices: [i], entrySlice: nil))
                i += 1
            }
        }
        return groups
    }

    private struct EntryGroup {
        let blockIndices: [Int]
        /// nil for non-entry groups (headings, resource lists, etc.).
        /// Non-nil for note entries — the raw markdown slice that
        /// would need to be removed from the parent on promotion.
        let entrySlice: String?
    }

    private static func isEntryStart(_ block: Block) -> Bool {
        if case .paragraph(let text) = block {
            return isEyebrowLine(text.trimmingCharacters(in: .whitespaces))
        }
        return false
    }

    private static func isHeading(_ block: Block) -> Bool {
        if case .heading = block { return true }
        return false
    }

    private static func isEyebrowLine(_ trimmed: String) -> Bool {
        guard trimmed.count > 2,
              trimmed.hasPrefix("*"),
              trimmed.hasSuffix("*"),
              !trimmed.hasPrefix("**") else { return false }
        return true
    }

    /// Render-time normalizer for legacy entries. Notes saved before
    /// the per-file grouping shipped use `### <file>, page N — <ts>` as
    /// a heading per entry. Convert those into the new shape on the
    /// fly: emit `### <file>` only when the file changes (so multiple
    /// entries from the same PDF cluster), then a `*p.N · ts*` italic
    /// eyebrow paragraph. Also strips the verbose metadata tail from
    /// legacy Pursuits list items. The file on disk is left alone —
    /// this is purely a rendering layer so older notes look like new
    /// ones without a destructive rewrite.
    private static func normalize(_ raw: [Block]) -> [Block] {
        var out: [Block] = []
        var lastFile: String? = nil
        for block in raw {
            switch block {
            case .heading(let level, let text):
                if level == 2 { lastFile = nil }
                if level == 3, let parsed = parseLegacyEntryHeading(text) {
                    if parsed.file != lastFile {
                        out.append(.heading(level: 3, text: parsed.file))
                        lastFile = parsed.file
                    }
                    out.append(.paragraph("*p.\(parsed.page) · \(parsed.timestamp)*"))
                    continue
                }
                if level == 3 {
                    lastFile = extractedFileNameInHeading(text)
                }
                out.append(block)
            case .listItem(let text):
                out.append(.listItem(stripLegacyPursuitTail(text)))
            default:
                out.append(block)
            }
        }
        return foldQuoteJumpPairs(out)
    }

    /// Walk the block stream and replace any `quote → blank* → jump-link
    /// paragraph` sequence with a single `quoteWithAnchor` block. The
    /// quote becomes its own click target, the standalone "Jump to
    /// passage" link disappears — same destination, no duplicated
    /// affordance per entry.
    private static func foldQuoteJumpPairs(_ blocks: [Block]) -> [Block] {
        var out: [Block] = []
        var i = 0
        while i < blocks.count {
            if case .quote(let qText) = blocks[i] {
                var j = i + 1
                while j < blocks.count, case .blank = blocks[j] { j += 1 }
                if j < blocks.count, case .paragraph(let pText) = blocks[j],
                   let url = extractAnchorURL(in: pText) {
                    out.append(.quoteWithAnchor(text: qText, anchorURL: url))
                    i = j + 1
                    continue
                }
            }
            out.append(blocks[i])
            i += 1
        }
        return out
    }

    /// Pull the loom://anchor URL out of a `[📍 ...](loom://anchor?...)`
    /// markdown paragraph, if present.
    private static func extractAnchorURL(in text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains("loom://anchor") else { return nil }
        guard let openParen = trimmed.range(of: "](") else { return nil }
        guard let closeParen = trimmed.range(of: ")", range: openParen.upperBound..<trimmed.endIndex) else { return nil }
        return String(trimmed[openParen.upperBound..<closeParen.lowerBound])
    }

    /// `<file>, page <N> — <timestamp>` → split components, else nil.
    private static func parseLegacyEntryHeading(_ text: String) -> (file: String, page: Int, timestamp: String)? {
        guard let pageMarker = text.range(of: ", page ") else { return nil }
        let file = String(text[..<pageMarker.lowerBound])
        let rest = text[pageMarker.upperBound...]
        guard let dash = rest.range(of: " — ") else { return nil }
        let pageStr = String(rest[..<dash.lowerBound])
        guard let page = Int(pageStr) else { return nil }
        let timestamp = String(rest[dash.upperBound...])
        return (file, page, timestamp)
    }

    /// Visible filename inside an h3 heading. Handles both
    /// `### name` and `### [name](url)` shapes.
    private static func extractedFileNameInHeading(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("["), let close = trimmed.range(of: "](") {
            return String(trimmed[trimmed.index(after: trimmed.startIndex)..<close.lowerBound])
        }
        return trimmed
    }

    /// Legacy Pursuits items had a busy tail:
    /// `[→ title](url) — re: "excerpt" · file pN · timestamp`.
    /// Drop everything from ` — ` onward so the list item just shows
    /// the link to the sub-page.
    private static func stripLegacyPursuitTail(_ text: String) -> String {
        guard text.hasPrefix("[→") else { return text }
        if let dash = text.range(of: " — ") {
            return String(text[..<dash.lowerBound])
        }
        return text
    }

    @ViewBuilder
    private func blockView(_ block: Block) -> some View {
        switch block {
        case .heading(let level, let text):
            // Hide the legacy `## Source` / `## Thoughts` scaffolding
            // headings on sub-pages — they're chrome left over from
            // an older seed format. Newer sub-pages don't write them
            // at all; this just normalizes existing files visually.
            let trimmed = text.trimmingCharacters(in: .whitespaces)
            if level == 2 && (trimmed == "Source" || trimmed == "Thoughts") {
                EmptyView()
            } else {
                Text(headingAttributed(text))
                    .font(headingFont(level: level))
                    .foregroundStyle(level >= 3 ? LoomTokens.dsInk2 : LoomTokens.dsInk1)
                    .padding(.top, headingTopPadding(level: level))
            }
        case .paragraph(let text):
            paragraphView(text)
        case .listItem(let text):
            HStack(alignment: .firstTextBaseline, spacing: DSSpace.sm.value) {
                Text("•").foregroundStyle(LoomTokens.dsInk2)
                Text(inlineAttributed(text))
                    .font(DSType.caption.font)
            }
        case .quote(let text):
            // Old PDF-quote notes saved several trailing `> ` blank
            // lines (PDF selections often end with whitespace). Each
            // became its own empty quote block here. Skip the empties
            // so historical entries render cleanly.
            if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                EmptyView()
            } else {
                quoteRow(text: text, anchor: nil)
            }
        case .quoteWithAnchor(let text, let anchor):
            quoteRow(text: text, anchor: anchor)
        case .code(let text):
            Text(text)
                .font(DSType.mono.font)
                .padding(DSSpace.sm.value)
                .background(LoomTokens.dsHair)
                .cornerRadius(DSRadius.sm.value)
        case .blank:
            Spacer().frame(height: 2)
        }
    }

    private func headingFont(level: Int) -> Font {
        switch level {
        case 1: return DSType.display2.font
        case 2: return DSType.display3.font
        case 3: return DSType.caption.font
        default: return DSType.eyebrow.font
        }
    }

    private func headingTopPadding(level: Int) -> CGFloat {
        switch level {
        case 1: return 4
        case 2: return 22       // section dividers (Notes / Pursuits / Threads)
        case 3: return 14       // per-file subsection
        default: return 8
        }
    }

    /// Render a blockquote. When `anchor` is non-nil, the whole quote
    /// becomes the click target — the standalone "Jump to passage"
    /// affordance is gone, the quote IS the affordance. A small ↗ glyph
    /// on the right hints at the action without shouting.
    @ViewBuilder
    private func quoteRow(text: String, anchor: String?) -> some View {
        let body = HStack(alignment: .top, spacing: 0) {
            Rectangle()
                .fill(anchor == nil ? LoomTokens.dsInk3 : LoomTokens.dsThread.opacity(0.5))
                .frame(width: 2)
            Text(inlineAttributed(text))
                .font(DSType.caption.font)
                .italic()
                .padding(.leading, DSSpace.sm.value + 2)
                .padding(.trailing, anchor == nil ? 0 : DSSpace.lg.value)
                .foregroundStyle(LoomTokens.dsInk1.opacity(0.75))
                .frame(maxWidth: .infinity, alignment: .leading)
            if anchor != nil {
                Image(systemName: "arrow.up.right.square")
                    .font(DSType.eyebrow.font)
                    .foregroundStyle(LoomTokens.dsInk3)
                    .padding(.trailing, 2)
                    .padding(.top, 2)
            }
        }
        if let anchor = anchor, let url = URL(string: anchor) {
            Button {
                NotificationCenter.default.post(
                    name: .loomJumpToPDFAnchor,
                    object: nil,
                    userInfo: ["url": url]
                )
            } label: {
                body.contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Jump to source passage")
            .contextMenu {
                if let onEdit = onEditAnchor {
                    Button {
                        onEdit(anchor)
                    } label: {
                        Label("Edit note…", systemImage: "pencil")
                    }
                }
                if let onPromote = onPromoteAnchor {
                    Button {
                        onPromote(anchor)
                    } label: {
                        Label("Promote to new page…", systemImage: "arrow.up.right.square")
                    }
                }
                if let onDelete = onDeleteAnchor {
                    Button(role: .destructive) {
                        onDelete(anchor)
                    } label: {
                        Label("Delete note", systemImage: "trash")
                    }
                }
            }
        } else {
            body
        }
    }

    /// Detect special-purpose paragraphs (entry metadata, jump-back
    /// links) and render them quieter than ordinary body prose so each
    /// note entry reads as: heading (loud) → meta (whisper) → quote
    /// (medium) → jump link (whisper). Keeps the page calm even with
    /// many entries stacked.
    @ViewBuilder
    private func paragraphView(_ text: String) -> some View {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if Self.isEntirelyEmphasis(trimmed) {
            // `*p.3 · 2026-04-26 11:12*` → render the inner text as a
            // small italic eyebrow.
            let inner = String(trimmed.dropFirst().dropLast())
            Text(inner)
                .font(DSType.eyebrow.font)
                .italic()
                .foregroundStyle(LoomTokens.dsInk3)
        } else if Self.isJumpLink(trimmed) {
            Text(inlineAttributed(text))
                .font(DSType.eyebrow.font)
                .foregroundStyle(LoomTokens.dsInk2)
        } else {
            Text(inlineAttributed(text))
                .font(DSType.body.font)
                .lineSpacing(2)
        }
    }

    private static func isEntirelyEmphasis(_ text: String) -> Bool {
        guard text.count > 2,
              text.hasPrefix("*"), text.hasSuffix("*"),
              !text.hasPrefix("**") else { return false }
        let inner = text.dropFirst().dropLast()
        // No nested `*` so AttributedString won't double-interpret.
        return !inner.contains("*")
    }

    private static func isJumpLink(_ text: String) -> Bool {
        text.hasPrefix("[📍") || text.contains("](loom://anchor")
    }

    private func headingAttributed(_ text: String) -> AttributedString {
        inlineAttributed(text)
    }

    private func inlineAttributed(_ text: String) -> AttributedString {
        if let attr = try? AttributedString(markdown: text) {
            return attr
        }
        return AttributedString(text)
    }

    private enum Block: Hashable {
        case heading(level: Int, text: String)
        case paragraph(String)
        case listItem(String)
        case quote(String)
        /// Quote whose entire body is the jump-back action. Emitted by
        /// the normalizer when a `> quote` is followed by a
        /// `[📍 Jump to passage](loom://anchor?...)` paragraph — fold
        /// the two together so the quote itself becomes the link
        /// instead of repeating "Jump to passage" on every entry.
        case quoteWithAnchor(text: String, anchorURL: String)
        case code(String)
        case blank
    }

    private static func parseBlocks(_ source: String) -> [Block] {
        var blocks: [Block] = []
        var paragraphLines: [String] = []
        var inCode = false
        var codeLines: [String] = []

        func flushParagraph() {
            guard !paragraphLines.isEmpty else { return }
            let combined = paragraphLines.joined(separator: " ")
            blocks.append(.paragraph(combined))
            paragraphLines.removeAll()
        }

        for rawLine in source.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(rawLine)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if inCode {
                if trimmed.hasPrefix("```") {
                    blocks.append(.code(codeLines.joined(separator: "\n")))
                    codeLines.removeAll()
                    inCode = false
                } else {
                    codeLines.append(line)
                }
                continue
            }
            if trimmed.hasPrefix("```") { inCode = true; continue }
            if trimmed.isEmpty { flushParagraph(); blocks.append(.blank); continue }
            if let heading = parseHeading(trimmed) {
                flushParagraph()
                blocks.append(heading)
                continue
            }
            if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") || trimmed.hasPrefix("+ ") {
                flushParagraph()
                let body = String(trimmed.dropFirst(2))
                blocks.append(.listItem(body))
                continue
            }
            if trimmed.hasPrefix("> ") {
                flushParagraph()
                blocks.append(.quote(String(trimmed.dropFirst(2))))
                continue
            }
            paragraphLines.append(trimmed)
        }
        flushParagraph()
        if inCode, !codeLines.isEmpty {
            blocks.append(.code(codeLines.joined(separator: "\n")))
        }
        return blocks
    }

    private static func parseHeading(_ trimmed: String) -> Block? {
        var level = 0
        for ch in trimmed {
            if ch == "#" { level += 1 } else { break }
        }
        guard level >= 1, level <= 6 else { return nil }
        let rest = trimmed.dropFirst(level).trimmingCharacters(in: .whitespaces)
        return .heading(level: level, text: rest)
    }
}

extension Notification.Name {
    /// Posted by sidebar (clicking a folder name) or LoomFolderHomeView
    /// (clicking a sub-folder in the Files listing). Carries `userInfo`
    /// `["url": loom://content/<root-id>/<sub-path>]`. ContentView
    /// listens and swaps the main pane to `LoomFolderHomeView` for that
    /// folder.
    static let loomShowFolderHome = Notification.Name("loomShowFolderHome")
    /// Posted by the toolbar refresh button / ⌘R / app-became-active.
    /// LoomFolderHomeView listens to re-scan its source folder so
    /// changes the user made in Finder appear without restarting.
    static let loomRefreshActivePage = Notification.Name("loomRefreshActivePage")
}
