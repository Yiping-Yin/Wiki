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
        VStack(alignment: .leading, spacing: 12) {
            Text("Use it")
                .font(.custom("EB Garamond", size: 11).weight(.medium).smallCaps())
                .tracking(11 * 0.16)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 8) {
                Label("Open any web page and confirm the L capture button is visible.", systemImage: "1.circle")
                Label("Click L for full capture; Shift+L for reader-only; Cmd+L for script-preserved snapshot.", systemImage: "2.circle")
                Label("Loom comes to the foreground; the capture sheet pre-fills with title, URL, and content.", systemImage: "3.circle")
                Label("Pick anchor (Web · domain, or Inbox), edit if needed, Save.", systemImage: "4.circle")
            }
            .font(.system(size: 13, design: .serif))
            .labelStyle(.titleAndIcon)
        }
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
