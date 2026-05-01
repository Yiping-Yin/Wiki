import Foundation
import SwiftUI

// =============================================================================
// Capture-feature stubs — added 2026-05-02 to unblock the production build.
//
// LoomMinimalRootView.swift and LoomURLSchemeHandler.swift reference
// `CapturesView`, `WebCaptureSetupView`, and `CapturesIndex` (with
// associated entry/root/kind types). The minimal-mode rewrite (commit
// 7351784) and Web Capture work-in-progress wired the call sites in
// without ever landing the implementations, and the branch never ran
// CI, so this stayed hidden.
//
// These stubs are deliberately empty:
//   - `CapturesView` / `WebCaptureSetupView` render an "in progress"
//     placeholder so navigation routes don't crash.
//   - `CapturesIndex.loadAll()` / `rootsForCaptureScan()` return [] so
//     payload builders produce empty lists rather than failing.
//   - `CapturesIndex.isCaptureHeadingLine(_:at:)` returns false so
//     scanning falls through to the existing fallback.
//
// TODO(loom-camp-c): replace with real implementations when the capture
// feature ships. See plans/loom-camp-c-editable-render.md and recent
// `feat(capture)` / `fix(capture)` commits for the in-flight design.
// =============================================================================

struct CaptureKind: RawRepresentable, Equatable {
    let rawValue: String
    init(rawValue: String) { self.rawValue = rawValue }
}

struct CaptureEntry {
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
    static func loadAll() -> [CaptureEntry] { [] }
    static func rootsForCaptureScan() -> [CaptureRoot] { [] }
    static func isCaptureHeadingLine(_ lines: [String], at index: Int) -> Bool { false }
}

struct CapturesView: View {
    let refreshToken: Int
    let themeMode: String

    var body: some View {
        VStack(spacing: 12) {
            Text("Captures")
                .font(.title3)
            Text("Capture feature is in progress.")
                .foregroundColor(.secondary)
                .font(.callout)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
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
