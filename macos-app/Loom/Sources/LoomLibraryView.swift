import SwiftUI

/// Source Index / Archive Work Surface. Shown when the user opens the
/// Sources entry in the minimal shell. This surface is a scan-first
/// work table over ContentRoot records: source groups, recent reading,
/// loose material, extraction state, and a quiet route back into writing.
struct LoomLibraryView: View {
    @State private var summaries: [SourceRootSummary] = []
    @State private var recentRecords: [RecentDocRecord] = []
    @State private var loadGeneration: Int = 0

    private var totalResources: Int {
        summaries.reduce(0) { $0 + $1.resourceCount }
    }

    private var unorganized: [SourceRootSummary] {
        summaries.filter(\.needsOrganization)
    }

    private var writingEntries: [SourceRootSummary] {
        summaries
            .filter(\.hasWritingSurface)
            .sorted { $0.updatedAt > $1.updatedAt }
    }

    private var extractedCount: Int {
        summaries.filter { $0.extractionState == .extracted }.count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
                statusStrip
                workSurface
                sourceList
            }
            .padding(.top, 56)
            .padding(.bottom, 48)
            .padding(.horizontal, 40)
            .frame(maxWidth: 960, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(LoomTokens.dsPaperDeep)
        .onAppear { reload() }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootsChanged)) { _ in
            reload()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomRecentsChanged)) { _ in
            recentRecords = Self.loadRecentRecords()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Archive Work Surface")
                .font(.system(size: 11, weight: .medium, design: .monospaced))
                .textCase(.uppercase)
                .foregroundStyle(LoomTokens.dsThread)
            Text("Source Index")
                .font(.system(size: 30, weight: .medium, design: .serif))
                .italic()
                .foregroundStyle(LoomTokens.dsInk1)
            Text("\(summaries.count) source group\(summaries.count == 1 ? "" : "s") · \(totalResources) indexed resource\(totalResources == 1 ? "" : "s")")
                .font(.system(size: 13, design: .serif))
                .foregroundStyle(LoomTokens.dsInk2)
            Text("Read source folders, organize loose material, and return to writing. Loom indexes around your files; original files stay untouched.")
                .font(.system(size: 14, design: .serif))
                .foregroundStyle(LoomTokens.dsInk2)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: 680, alignment: .leading)
        }
    }

    private var statusStrip: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 4), spacing: 10) {
            SourceMetric(title: "Sources", value: "\(summaries.count)")
            SourceMetric(title: "Recent reading", value: "\(recentRecords.count)")
            SourceMetric(title: "Unorganized", value: "\(unorganized.count)")
            SourceMetric(title: "Extracted", value: "\(extractedCount)")
        }
    }

    private var workSurface: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 3), spacing: 12) {
            WorkColumn(title: "Recent reading", empty: "No recent source opened yet.", isEmpty: recentRecords.isEmpty) {
                ForEach(recentRecords.prefix(5)) { record in
                    WorkRow(
                        title: record.title?.isEmpty == false ? record.title! : titleFromHref(record.href),
                        detail: relativeTime(record.at),
                        action: { openRecent(record) }
                    )
                }
            }

            WorkColumn(title: "Unorganized", empty: "No loose source group needs attention.", isEmpty: unorganized.isEmpty) {
                ForEach(unorganized.prefix(5), id: \.id) { item in
                    WorkRow(
                        title: item.title,
                        detail: item.organizationReason,
                        action: { open(item.root) }
                    )
                }
            }

            WorkColumn(title: "Continue writing", empty: "No writing surface is waiting.", isEmpty: writingEntries.isEmpty) {
                ForEach(writingEntries.prefix(5), id: \.id) { item in
                    WorkRow(
                        title: item.title,
                        detail: item.writingDetail,
                        action: { open(item.root) }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var sourceList: some View {
        if summaries.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("No sources connected.")
                    .font(.system(size: 14, design: .serif))
                    .foregroundStyle(LoomTokens.dsInk2)
                Text("Use + Page for writing or + Folder for read-only source material.")
                    .font(.system(size: 12, design: .serif))
                    .foregroundStyle(LoomTokens.dsInk3)
            }
            .padding(.vertical, 28)
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text("All sources")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .textCase(.uppercase)
                    .foregroundStyle(LoomTokens.dsInk3)
                ForEach(summaries, id: \.id) { summary in
                    sourceRow(summary)
                }
            }
        }
    }

    private func sourceRow(_ summary: SourceRootSummary) -> some View {
        Button {
            open(summary.root)
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Image(systemName: summary.isExternal ? "folder" : "doc.text")
                        .font(.system(size: 12))
                        .foregroundStyle(LoomTokens.dsInk2)
                        .frame(width: 18, alignment: .center)
                    Text(summary.title)
                        .font(.system(size: 15, weight: .medium, design: .serif))
                        .foregroundStyle(LoomTokens.dsInk1)
                    Spacer(minLength: 0)
                    Text(summary.extractionState.label)
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .textCase(.uppercase)
                        .foregroundStyle(summary.extractionState.tint)
                }

                HStack(spacing: 12) {
                    Text("\(summary.resourceCount) resource\(summary.resourceCount == 1 ? "" : "s")")
                    Text(summary.hasWritingSurface ? "writing ready" : "writing empty")
                    Text(relativeTime(summary.updatedAt.timeIntervalSince1970 * 1000))
                    if let path = summary.path {
                        Text(path)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
                .font(.system(size: 11, design: .serif))
                .foregroundStyle(LoomTokens.dsInk3)

                if !summary.description.isEmpty {
                    Text(summary.description)
                        .font(.system(size: 12, design: .serif))
                        .foregroundStyle(LoomTokens.dsInk2)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 7)
                    .fill(LoomTokens.dsPaper.opacity(0.72))
                    .overlay(
                        RoundedRectangle(cornerRadius: 7)
                            .stroke(LoomTokens.dsInk3.opacity(0.16), lineWidth: 0.5)
                    )
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func open(_ root: ContentRoot) {
        guard let target = URL(string: "loom://content/\(root.id.uuidString.lowercased())") else { return }
        NotificationCenter.default.post(
            name: .loomShowFolderHome,
            object: nil,
            userInfo: ["url": target]
        )
    }

    private func openRecent(_ record: RecentDocRecord) {
        guard let target = URL(string: record.href), target.scheme == "loom" else { return }
        if target.pathExtension.isEmpty {
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

    private func reload() {
        loadGeneration += 1
        let roots = ContentRootStore.loadAll()
        summaries = roots
            .filter { $0.parentID == nil }
            .map(SourceRootSummary.make)
            .sorted { $0.updatedAt > $1.updatedAt }
        recentRecords = Self.loadRecentRecords()
    }

    private static func loadRecentRecords() -> [RecentDocRecord] {
        if let data = UserDefaults.standard.data(forKey: "loom.sidebar.recentRecords.v2"),
           let decoded = try? JSONDecoder().decode([RecentDocRecord].self, from: data) {
            return decoded
        }
        if let legacy = UserDefaults.standard.stringArray(forKey: "loom.sidebar.recentHrefs") {
            return legacy.map { RecentDocRecord(href: $0, title: nil, at: 0) }
        }
        return []
    }
}

private struct SourceMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .textCase(.uppercase)
                .foregroundStyle(LoomTokens.dsInk3)
            Text(value)
                .font(.system(size: 18, weight: .medium, design: .serif))
                .italic()
                .foregroundStyle(LoomTokens.dsInk1)
        }
        .frame(maxWidth: .infinity, minHeight: 74, alignment: .leading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 7)
                .fill(LoomTokens.dsPaper.opacity(0.62))
                .overlay(
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(LoomTokens.dsInk3.opacity(0.14), lineWidth: 0.5)
                )
        )
    }
}

private struct WorkColumn<Content: View>: View {
    let title: String
    let empty: String
    let isEmpty: Bool
    let content: Content

    init(
        title: String,
        empty: String,
        isEmpty: Bool,
        @ViewBuilder content: () -> Content
    ) {
        self.title = title
        self.empty = empty
        self.isEmpty = isEmpty
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .textCase(.uppercase)
                .foregroundStyle(LoomTokens.dsInk3)
            VStack(alignment: .leading, spacing: 6) {
                if isEmpty {
                    Text(empty)
                        .font(.system(size: 12, design: .serif))
                        .foregroundStyle(LoomTokens.dsInk3)
                } else {
                    content
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 178, alignment: .topLeading)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 7)
                .fill(LoomTokens.dsPaper.opacity(0.58))
                .overlay(
                    RoundedRectangle(cornerRadius: 7)
                        .stroke(LoomTokens.dsInk3.opacity(0.14), lineWidth: 0.5)
                )
        )
    }
}

private struct WorkRow: View {
    let title: String
    let detail: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(title)
                    .font(.system(size: 13, weight: .medium, design: .serif))
                    .foregroundStyle(LoomTokens.dsInk1)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Text(detail)
                    .font(.system(size: 10, design: .serif))
                    .foregroundStyle(LoomTokens.dsInk3)
                    .lineLimit(1)
            }
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct SourceRootSummary: Identifiable {
    let id: UUID
    let root: ContentRoot
    let title: String
    let description: String
    let path: String?
    let resourceCount: Int
    let hasWritingSurface: Bool
    let noteCount: Int
    let isExternal: Bool
    let updatedAt: Date
    let extractionState: SourceExtractionState

    var needsOrganization: Bool {
        if resourceCount == 0 { return false }
        return description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !hasWritingSurface
    }

    var organizationReason: String {
        if resourceCount == 0 { return "empty" }
        if !hasWritingSurface { return "\(resourceCount) resources need notes" }
        return "ready"
    }

    var writingDetail: String {
        if noteCount > 0 { return "\(noteCount) note\(noteCount == 1 ? "" : "s")" }
        return hasWritingSurface ? "draft surface" : "blank"
    }

    static func make(root: ContentRoot) -> SourceRootSummary {
        let activeURL = ContentRootStore.activeURL(for: root.id)
        let storeURL = LoomFileStore.pageDirectoryURL(for: root.id)
        let scanURL = activeURL ?? storeURL
        let resourceCount = scanResourceCount(at: scanURL)
        let mdURL = LoomFileStore.loomMDURL(for: root.id)
        let md = (try? String(contentsOf: mdURL, encoding: .utf8)) ?? ""
        let hasWriting = markdownHasUserText(md, pageName: root.displayName)
        let notes = noteCount(in: md)
        let state: SourceExtractionState = {
            if root.externalFolderBookmark != nil && activeURL == nil { return .needsAccess }
            if resourceCount == 0 && !hasWriting { return .empty }
            if hasWriting || notes > 0 { return .extracted }
            return .indexed
        }()

        return SourceRootSummary(
            id: root.id,
            root: root,
            title: root.displayName,
            description: root.description,
            path: activeURL?.path,
            resourceCount: resourceCount,
            hasWritingSurface: hasWriting,
            noteCount: notes,
            isExternal: root.externalFolderBookmark != nil,
            updatedAt: root.updatedAt,
            extractionState: state
        )
    }

    private static func scanResourceCount(at folder: URL) -> Int {
        let fm = FileManager.default
        guard let urls = try? fm.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return 0 }
        return urls.filter { url in
            if url.lastPathComponent == "Loom.md" { return false }
            if url.lastPathComponent.hasPrefix("Loom.") && url.pathExtension.lowercased() == "md" {
                return false
            }
            return true
        }.count
    }

    private static func markdownHasUserText(_ md: String, pageName: String) -> Bool {
        for raw in md.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { continue }
            if line == "# \(pageName)" { continue }
            if line == "## Resources" { continue }
            if line.hasPrefix("- [") { continue }
            return true
        }
        return false
    }

    private static func noteCount(in md: String) -> Int {
        md.components(separatedBy: "\n").filter { raw in
            let line = raw.trimmingCharacters(in: .whitespaces)
            return line.hasPrefix("### ") || line.contains("loom://anchor?")
        }.count
    }
}

private enum SourceExtractionState: Equatable {
    case extracted
    case indexed
    case needsAccess
    case empty

    var label: String {
        switch self {
        case .extracted: return "Extracted"
        case .indexed: return "Indexed"
        case .needsAccess: return "Needs access"
        case .empty: return "Empty"
        }
    }

    var tint: Color {
        switch self {
        case .extracted: return LoomTokens.dsThread
        case .indexed: return LoomTokens.dsInk2
        case .needsAccess: return LoomTokens.dsInk2
        case .empty: return LoomTokens.dsInk3
        }
    }
}

private func titleFromHref(_ href: String) -> String {
    guard let url = URL(string: href) else { return href }
    let last = url.lastPathComponent.removingPercentEncoding ?? url.lastPathComponent
    return last.isEmpty ? href : last
}

private func relativeTime(_ at: Double) -> String {
    if at <= 0 { return "recent" }
    let seconds = max(0, Date().timeIntervalSince1970 - (at / 1000))
    if seconds < 60 { return "now" }
    let minutes = Int(seconds / 60)
    if minutes < 60 { return "\(minutes)m" }
    let hours = Int(Double(minutes) / 60)
    if hours < 24 { return "\(hours)h" }
    let days = Int(Double(hours) / 24)
    return "\(days)d"
}

extension Notification.Name {
    /// Posted by the Sources entry so the minimal shell shows
    /// `LoomLibraryView` in the main pane.
    static let loomShowLibrary = Notification.Name("loomShowLibrary")
}
