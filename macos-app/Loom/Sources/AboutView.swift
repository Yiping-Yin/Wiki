import SwiftUI

/// Native "About Loom" window, replacing the default NSApp auto-generated
/// one. Vellum-styled chrome surface: warm paper, bronze accent, ink text,
/// Cormorant Garamond for display, EB Garamond for body copy. This is a
/// chrome surface (not user content) so art fonts are allowed.
///
/// Opens via the App menu's "About Loom" item (standard macOS position).
/// The menu item is registered via `CommandGroup(replacing: .appInfo)` in
/// LoomApp; the window itself is a SwiftUI Window scene with hidden title
/// bar and a fixed 420×540 content size.
struct AboutView: View {
    @Environment(\.openWindow) private var openWindow
    // Esc closes — matches KeyboardHelpView's "Esc · Close any open
    // panel" convention (2026-04-23 audit). Previously the About
    // window could only be dismissed via the title-bar close button.
    @Environment(\.dismissWindow) private var dismissWindow

    // MARK: Vellum palette — direct sRGB values so the window reads the
    // same regardless of macOS appearance. About is identity chrome; it
    // should not flip with light/dark mode.
    private let paper       = Color(.sRGB, red: 0xF4/255.0, green: 0xF0/255.0, blue: 0xE4/255.0, opacity: 1.0)
    private let ink         = Color(.sRGB, red: 0x2A/255.0, green: 0x25/255.0, blue: 0x20/255.0, opacity: 1.0)
    private let muted       = Color(.sRGB, red: 0x8A/255.0, green: 0x83/255.0, blue: 0x73/255.0, opacity: 1.0)
    private let bronze      = Color(.sRGB, red: 0x9E/255.0, green: 0x7C/255.0, blue: 0x3E/255.0, opacity: 1.0)
    private let bronzeText  = Color(.sRGB, red: 0x7A/255.0, green: 0x5E/255.0, blue: 0x2E/255.0, opacity: 1.0)

    var body: some View {
        ZStack {
            paper.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer(minLength: 44)

                // Wordmark — single italic "L" in Cormorant, then the
                // full name below. Treated as a mark, not a title.
                Text("L")
                    .font(.custom("Cormorant Garamond", size: 64).italic().weight(.regular))
                    .foregroundStyle(ink)
                    .tracking(-1)

                Text("Loom")
                    .font(.custom("Cormorant Garamond", size: 34).italic().weight(.regular))
                    .foregroundStyle(ink)
                    .padding(.top, 2)

                // Version line — monospaced, muted.
                Text(versionString)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(muted)
                    .padding(.top, 10)

                // Tagline — Cormorant italic, slightly larger, ink.
                Text("A small room for slow reading.")
                    .font(.custom("Cormorant Garamond", size: 18).italic())
                    .foregroundStyle(ink.opacity(0.88))
                    .padding(.top, 22)

                ornament
                    .padding(.top, 18)

                hairRule
                    .padding(.top, 18)

                // "Woven by" block — small-caps eyebrow + body line.
                VStack(spacing: 6) {
                    Text("Woven by")
                        .font(.system(size: 10, weight: .medium))
                        .kerning(3.2)
                        .textCase(.uppercase)
                        .foregroundStyle(muted)

                    Text("One person, with care.")
                        .font(.custom("EB Garamond", size: 14))
                        .foregroundStyle(ink.opacity(0.82))
                }
                .padding(.top, 16)

                hairRule
                    .padding(.top, 18)

                // Text links — Privacy + Help + Colophon. Bronze, EB Garamond.
                // Colophon is the book's back matter (type, palette, hand);
                // it opens inside the main webview at /colophon so it stays
                // consistent with the other reading surfaces.
                HStack(spacing: 28) {
                    linkButton("Privacy") {
                        if let url = URL(string: "https://loom.app/privacy") {
                            NSWorkspace.shared.open(url)
                        }
                    }
                    linkButton("Help") {
                        openWindow(id: KeyboardHelpWindow.id)
                    }
                    linkButton("Colophon") {
                        NotificationCenter.default.post(
                            name: .loomShuttleNavigate,
                            object: nil,
                            userInfo: ["path": "/colophon"]
                        )
                    }
                }
                .padding(.top, 16)

                Spacer(minLength: 20)

                // Footer — italic Cormorant, muted.
                Text("© 2026 · All threads respected")
                    .font(.custom("Cormorant Garamond", size: 12).italic())
                    .foregroundStyle(muted)
                    .padding(.bottom, 26)
            }
            .frame(maxWidth: .infinity)
        }
        .frame(width: 420, height: 540)
        .onKeyPress(.escape) {
            dismissWindow(id: AboutWindow.id)
            return .handled
        }
    }

    // MARK: - Components

    /// Single centered bronze ornament — unicode four-pointed white star.
    /// Small, filigree-weight, not decorative noise. Sits between sections
    /// as a breath mark.
    private var ornament: some View {
        Text("\u{2727}") // ✧ white four-pointed star — thin at 13pt
            .font(.system(size: 13))
            .foregroundStyle(bronze)
            .accessibilityHidden(true)
    }

    /// Hair-rule divider — a 1px line, ~88pt wide, muted. Never full-width:
    /// Vellum rules breathe.
    private var hairRule: some View {
        Rectangle()
            .fill(muted.opacity(0.35))
            .frame(width: 88, height: 0.5)
            .accessibilityHidden(true)
    }

    /// Text link styled in bronze EB Garamond. Plain button so it takes
    /// the Vellum color, not the system accent.
    private func linkButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.custom("EB Garamond", size: 13))
                .foregroundStyle(bronzeText)
                .underline(false)
        }
        .buttonStyle(.plain)
        .pointerStyleLink()
    }

    // MARK: - Strings

    private var versionString: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(short) · build \(build)"
    }
}

/// Tiny cross-version helper so the link buttons show the pointing-hand
/// cursor on hover without requiring macOS 15's `.pointerStyle` API.
private extension View {
    @ViewBuilder
    func pointerStyleLink() -> some View {
        self.onHover { inside in
            if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
    }
}

enum AboutWindow {
    static let id = "com.loom.window.about"
}
