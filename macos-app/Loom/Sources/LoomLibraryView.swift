import SwiftUI

/// Library / overview surface. Shown when the user clicks the
/// sidebar's `Sources` row — a list of every page they've created
/// (every `ContentRoot`), each clickable to enter its folder home.
///
/// This is Loom's "all your pages" view, equivalent to Notion's
/// workspace overview. Replaces the legacy webview `/sources` page
/// which was manifest-driven and empty for disk-only roots.
///
/// User can also create a new Page or Folder from here as a
/// secondary entry point (sidebar + buttons remain primary).
struct LoomLibraryView: View {
    @State private var roots: [ContentRoot] = []
    @State private var loadGeneration: Int = 0

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                if roots.isEmpty {
                    emptyState
                } else {
                    rootGrid
                }
            }
            .padding(.top, 56)
            .padding(.bottom, 48)
            .padding(.horizontal, 40)
            .frame(maxWidth: 760, alignment: .leading)
            .frame(maxWidth: .infinity, alignment: .center)
        }
        .background(Color(NSColor.windowBackgroundColor))
        .onAppear { reload() }
        .onReceive(NotificationCenter.default.publisher(for: .loomContentRootsChanged)) { _ in
            reload()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Your pages")
                .font(.system(size: 26, weight: .medium, design: .serif))
                .italic()
            Text("\(roots.count) page\(roots.count == 1 ? "" : "s")")
                .font(.system(size: 11))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("No pages yet.")
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Text("Use the sidebar's + Page or + Folder to start.")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 32)
    }

    @ViewBuilder
    private var rootGrid: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(roots, id: \.id) { root in
                rootCard(root)
            }
        }
    }

    @ViewBuilder
    private func rootCard(_ root: ContentRoot) -> some View {
        Button {
            open(root)
        } label: {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Image(systemName: "doc.text")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    Text(root.displayName)
                        .font(.system(size: 14, weight: .medium))
                }
                if let url = ContentRootStore.activeURL(for: root.id) {
                    Text(url.path)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                if !root.description.isEmpty {
                    Text(root.description)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color.secondary.opacity(0.06))
            .cornerRadius(6)
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

    private func reload() {
        loadGeneration += 1
        roots = ContentRootStore.loadAll()
    }
}

extension Notification.Name {
    /// Posted by sidebar's "Sources" / library-entry click so
    /// ContentView shows `LoomLibraryView` in the main pane.
    static let loomShowLibrary = Notification.Name("loomShowLibrary")
}
