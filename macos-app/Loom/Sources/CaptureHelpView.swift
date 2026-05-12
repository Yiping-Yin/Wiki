import SwiftUI

/// Help window content for setting up Loom Web Capture. Read-only
/// narrative — capture flow + tips. Opened via menu bar
/// Help > Set up captures… (⌘?).
///
/// Replaces the instructional half of the dismantled WebCaptureSetupView
/// surface per docs/loom.md §VII.bis. Interactive setup (extension
/// path, bookmarklet, storage, pipeline status) lives in Settings >
/// Capture; this window is read-only narrative.
///
/// Sections filled task-by-task per plans/plate-vii-bis-migration.md:
///   - Capture flow (Task 8)
///   - Tips (Task 9)
struct CaptureHelpView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                captureFlowSection
                tipsSection
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 28)
            .frame(maxWidth: 560, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Set up captures")
                .font(.custom("Cormorant Garamond", size: 28).weight(.medium))
            Text("How to wire Loom Web Capture and what each capture path does. For interactive setup (extension path, bookmarklet, storage, pipeline status) open Settings > Capture.")
                .font(.system(size: 13, design: .serif))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var captureFlowSection: some View {
        Text("TODO: 4-step flow — filled in Task 8")
            .foregroundStyle(.secondary)
    }

    private var tipsSection: some View {
        Text("TODO: tips — filled in Task 9")
            .foregroundStyle(.secondary)
    }
}

enum CaptureHelpWindow {
    static let id = "com.loom.window.capture-help"
}

#Preview {
    CaptureHelpView()
}
