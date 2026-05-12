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
        VStack(alignment: .leading, spacing: 12) {
            Text("Tips")
                .font(.custom("EB Garamond", size: 11).weight(.medium).smallCaps())
                .tracking(11 * 0.16)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 8) {
                tip("Missing L means the extension is not running on that tab. Reload the extension and then refresh the source page; already-open tabs do not always receive a newly loaded content script.")
                tip("Select first for the cleanest result. Selection still wins over auto-extraction when you only need a passage.")
                tip("The bookmarklet is a fallback, not the rich-media path. Use the extension for SVG, canvas, iframe, video, and image-sidecar capture.")
                tip("Web captures default to the Web/<domain>/Loom.md folder so domains pre-cluster naturally for similarity search.")
                tip("Rich extension captures are not capped to the bookmarklet's 20K-character text fallback.")
            }
        }
    }

    @ViewBuilder
    private func tip(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("·")
                .foregroundStyle(.secondary)
            Text(text)
                .font(.system(size: 12, design: .serif))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

enum CaptureHelpWindow {
    static let id = "com.loom.window.capture-help"
}

#Preview {
    CaptureHelpView()
}
