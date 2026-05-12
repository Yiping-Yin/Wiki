import SwiftUI

/// Settings pane for capture infrastructure: browser extension setup,
/// bookmarklet fallback, storage location, and embedding-pipeline
/// status. Replaces the dismantled WebCaptureSetupView surface per
/// docs/loom.md §VII.bis.
///
/// Sections filled task-by-task per plans/plate-vii-bis-migration.md:
///   - Browser Extension (Task 2)
///   - Bookmarklet (Task 3)
///   - Storage (Task 4)
///   - Pipeline (Task 5)
struct CaptureSettingsView: View {
    @State private var extensionPathCopied: Bool = false

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

    var body: some View {
        Form {
            Section("Browser Extension") {
                LabeledContent("Resources path") {
                    Text(extensionResourcesPath)
                        .font(.system(size: 11, design: .monospaced))
                        .textSelection(.enabled)
                        .lineLimit(2)
                        .truncationMode(.middle)
                }
                HStack {
                    Button(extensionPathCopied ? "Copied!" : "Copy extension path") {
                        NSPasteboard.general.clearContents()
                        NSPasteboard.general.setString(extensionResourcesPath, forType: .string)
                        extensionPathCopied = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                            extensionPathCopied = false
                        }
                    }
                    Spacer()
                }
                Text("Atlas / Chrome: open the extensions page, turn on Developer mode, choose Load unpacked, then select the path above. It is the folder that contains manifest.json. If the L button is missing on a page, the extension is not injected there — reload the extension, refresh the source page, then click L again. Do not choose the parent LoomWebExtension folder; that folder has no manifest.json.")
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Section("Bookmarklet (fallback)") {
                Text("TODO: bookmarklet drag-link — filled in Task 3")
                    .foregroundStyle(.secondary)
            }
            Section("Storage") {
                Text("TODO: path + Reveal + Move to — filled in Task 4")
                    .foregroundStyle(.secondary)
            }
            Section("Pipeline") {
                Text("TODO: model status + indexed counts + Refresh — filled in Task 5")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 480, minHeight: 440)
    }
}

#Preview {
    CaptureSettingsView()
}
