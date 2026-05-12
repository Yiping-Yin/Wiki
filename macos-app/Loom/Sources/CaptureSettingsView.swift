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
    var body: some View {
        Form {
            Section("Browser Extension") {
                Text("TODO: extension path + Copy button — filled in Task 2")
                    .foregroundStyle(.secondary)
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
