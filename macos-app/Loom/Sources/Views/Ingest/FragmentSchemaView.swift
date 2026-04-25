import SwiftUI

// MARK: - FragmentSchemaView
//
// Phase 7.4 — `.extracted` state renderer for paste fragments.
//
// Layout, top-to-bottom:
//   1. Eyebrow `PASTED FRAGMENT` (serif small-caps, thread tint).
//   2. The verbatim quoted text in serif italic, lightly muted to
//      signal "this is someone else's voice".
//   3. Source line — hostname of `sourceURL` + bundle name of
//      `sourceApp` ("substack.com · Safari" or "Notes.app").
//   4. Destination chip — "→ attached to Pursuit: 'Group Assignment 1'".
//      Tapping the chip posts a navigation notification so the parent
//      surface (IngestionView's host) can route to that Pursuit / Panel.
//
// Discipline:
//   - The text renders verbatim. No paraphrasing, no AI rewording.
//     `feedback_extract_not_author`.
//   - No author attribution to Loom. The fragment is by definition
//     someone else's words; the chrome reflects that.

struct FragmentSchemaView: View {
    let schema: FragmentSchema
    let destination: FragmentDestination

    /// Capture-time word/char count read straight off the schema.
    /// FragmentExtractor pre-computed both at build time so we
    /// don't recount here.
    private var meta: String {
        let words = "\(schema.wordCount) word\(schema.wordCount == 1 ? "" : "s")"
        let chars = "\(schema.charCount) char\(schema.charCount == 1 ? "" : "s")"
        return "\(words) · \(chars)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            IngestSectionHeader(title: "Pasted fragment")

            // Verbatim quote. Italic serif communicates "quoted from
            // elsewhere" the same way a blockquote does on the web.
            // Lightly muted (`ink2`) so it reads as someone else's voice
            // rather than as the user's own thought.
            Text(schema.text)
                .font(LoomTokens.serif(size: 14, italic: true))
                .foregroundStyle(LoomTokens.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(LoomTokens.hairFaint)
                )
                // Subtle quoted-in-margin rule on the leading edge —
                // the typographic convention for blockquotes.
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(LoomTokens.hair, lineWidth: 0.5)
                )
                .overlay(alignment: .leading) {
                    LoomTokens.thread.opacity(0.35)
                        .frame(width: 2)
                        .padding(.vertical, 2)
                }

            sourceLine
            destinationChip
            metaLine
        }
    }

    // MARK: - Source line

    @ViewBuilder
    private var sourceLine: some View {
        HStack(spacing: 6) {
            Image(systemName: "scissors")
                .foregroundStyle(LoomTokens.muted)
                .font(.system(size: 10))
            ForEach(Array(sourceParts.enumerated()), id: \.offset) { idx, part in
                if idx > 0 {
                    Text("·")
                        .foregroundStyle(LoomTokens.muted)
                        .font(LoomTokens.sans(size: 11))
                }
                Text(part)
                    .font(LoomTokens.sans(size: 11))
                    .foregroundStyle(LoomTokens.ink3)
            }
            Spacer()
        }
    }

    /// Compose the "where it came from" parts. Hostname first when we
    /// have a URL, app name second (deduped against hostname so we
    /// don't print "substack.com · Safari · Safari").
    private var sourceParts: [String] {
        var parts: [String] = []
        if let urlString = schema.sourceURL,
           let url = URL(string: urlString),
           let host = url.host,
           !host.isEmpty {
            parts.append(host)
        }
        if let bundleId = schema.sourceApp,
           let appName = appNameForBundleId(bundleId),
           !parts.contains(appName) {
            parts.append(appName)
        }
        if let title = schema.sourceTitle, !title.isEmpty,
           !parts.contains(title) {
            parts.append(title)
        }
        if parts.isEmpty {
            parts.append("Clipboard")
        }
        return parts
    }

    // MARK: - Destination chip

    @ViewBuilder
    private var destinationChip: some View {
        Button {
            // Post a navigation hint. The parent (IngestionView host)
            // can listen for this and route to the destination via
            // whichever surface is appropriate. We don't directly
            // route here because the schema view shouldn't carry
            // routing knowledge.
            NotificationCenter.default.post(
                name: .loomFragmentNavigateRequested,
                object: nil,
                userInfo: notificationUserInfo
            )
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.right.circle")
                    .foregroundStyle(LoomTokens.thread)
                    .font(.system(size: 11))
                Text(destinationLabel)
                    .font(LoomTokens.serif(size: 12, italic: true))
                    .foregroundStyle(LoomTokens.ink2)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(
                Capsule(style: .continuous)
                    .fill(LoomTokens.thread.opacity(0.08))
            )
            .overlay(
                Capsule(style: .continuous)
                    .stroke(LoomTokens.thread.opacity(0.25), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
        .help("Open the destination this fragment was attached to.")
    }

    private var destinationLabel: String {
        switch destination {
        case .pursuit(let id):
            return "Attached to Pursuit · \(id.prefix(8))"
        case .panel(let id):
            return "Attached to Panel · \(id.prefix(8))"
        case .newQuestion(let text):
            return "New Pursuit: \(text)"
        }
    }

    private var notificationUserInfo: [String: String] {
        switch destination {
        case .pursuit(let id):    return ["kind": "pursuit", "id": id]
        case .panel(let id):      return ["kind": "panel", "id": id]
        case .newQuestion(let t): return ["kind": "newQuestion", "text": t]
        }
    }

    // MARK: - Meta line

    @ViewBuilder
    private var metaLine: some View {
        Text(meta)
            .font(LoomTokens.mono(size: 10))
            .foregroundStyle(LoomTokens.muted)
    }

    // MARK: - Helpers

    /// Same `bundle.id → display name` resolver as the picker's. Kept
    /// inline rather than factored into a shared helper since both
    /// callers fall back to the trailing dot-component on lookup
    /// failure — a minor duplication that buys local readability.
    private func appNameForBundleId(_ bundleId: String) -> String? {
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId),
           let bundle = Bundle(url: url),
           let name = (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
                    ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String) {
            return name
        }
        let parts = bundleId.split(separator: ".")
        if let last = parts.last, !last.isEmpty {
            return String(last)
        }
        return nil
    }
}

// MARK: - Navigation notification

extension Notification.Name {
    /// Posted when the user taps the destination chip on a rendered
    /// fragment card. Listeners (typically the host window or
    /// `ContentView`) read `userInfo["kind"]` to route to the right
    /// surface — `pursuit` / `panel` / `newQuestion` — and
    /// `userInfo["id"]` (or `"text"`) for the target.
    static let loomFragmentNavigateRequested = Notification.Name(
        "loomFragmentNavigateRequested"
    )
}

// MARK: - Preview

#Preview("FragmentSchemaView · Substack to Pursuit") {
    let schema = FragmentSchema(
        text: """
        The most successful technologies are the ones that disappear. \
        They weave themselves into the fabric of everyday life until they \
        are indistinguishable from it.
        """,
        sourceURL: "https://stratechery.com/2026/disappearing-machine/",
        sourceApp: "com.apple.Safari",
        sourceTitle: nil,
        capturedAt: 1714000000000,
        charCount: 178,
        wordCount: 28
    )
    return ScrollView {
        FragmentSchemaView(schema: schema, destination: .pursuit(id: "uuid-1234-5678"))
            .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 360)
}

#Preview("FragmentSchemaView · Notes app to new question") {
    let schema = FragmentSchema(
        text: "A short note from somewhere I want to think about later.",
        sourceURL: nil,
        sourceApp: "com.apple.Notes",
        sourceTitle: "Reading list",
        capturedAt: 1714000000000,
        charCount: 56,
        wordCount: 11
    )
    return ScrollView {
        FragmentSchemaView(
            schema: schema,
            destination: .newQuestion(text: "Why does disappearance feel like mastery?")
        )
        .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 520, height: 360)
}
