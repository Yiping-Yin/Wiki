import SwiftUI
import AppKit

/// Evening ritual — the literary session-close surface.
///
/// Opened from App menu "Set Down the Shuttle…" (see `EveningMenuItem`
/// in LoomApp.swift). Dark-mode forced, serif typography, candle
/// palette — a deliberate tonal break from the daily working surfaces.
///
/// The copy is narrated prose (no numbers in boxes, no charts, no
/// "stats"). Users should read it like the end of a chapter rather
/// than a dashboard. Two soft CTAs at the bottom: "Set down the
/// shuttle" (pause) and "Close the book" (end session) — both
/// dismiss the window for now. Deferred-save wiring comes later
/// (see TODO).
///
/// TODO(2026-04-22): wire dynamic text fields to `LoomTraceWriter` —
/// today's elapsed session time, most-visited doc title, visit ordinal,
/// last-viewed section, and the "warm thread" summary paragraph all
/// live as trace queries. Placeholder copy below is the canonical
/// example the narrator should match in rhythm.
struct EveningView: View {
    // Dismiss the Evening window by scene id rather than whichever window
    // happens to be key. `dismissWindow(id:)` is macOS 14+ — which matches
    // our deployment target — so the AppKit fallback below only runs if
    // SwiftUI refuses the close for any reason.
    @Environment(\.dismissWindow) private var dismissWindow

    // MARK: - Palette (Vellum "Evening" mode)
    //
    // These mirror the CSS token values the web surface would use if we
    // rendered Evening there; kept in Swift because this surface is
    // entirely native. Keep in sync with any future LoomTokens "night"
    // section.
    private let night   = Color(.sRGB, red: 0x13/255.0, green: 0x11/255.0, blue: 0x0D/255.0, opacity: 1.0)
    private let candle  = Color(.sRGB, red: 0xEC/255.0, green: 0xE2/255.0, blue: 0xC9/255.0, opacity: 1.0)
    private let candle2 = Color(.sRGB, red: 0xB9/255.0, green: 0xAE/255.0, blue: 0x93/255.0, opacity: 1.0)
    private let threadHi = Color(.sRGB, red: 0xC4/255.0, green: 0xA4/255.0, blue: 0x68/255.0, opacity: 1.0)

    // MARK: - Placeholder session narration (see TODO above)
    /// Weekday pulled from the live `Date()` so the Evening eyebrow
    /// isn't a hardcoded lie on every other day of the week. The
    /// "day closing" suffix is the literary constant — matches the
    /// "Thursday · the day closing" rhythm described in M4 spec.
    private var eyebrowLabel: String {
        let fmt = DateFormatter()
        fmt.dateFormat = "EEEE"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        let weekday = fmt.string(from: Date()).lowercased()
        return "\(weekday) · the day closing"
    }
    @State private var liveSessionTime: String?
    @State private var liveDocTitle: String?

    /// Session-time phrase — real minutes when today's LoomTrace rows
    /// exist, fallback to the evocative placeholder when none do so
    /// first-run users still see the ritual surface's intent.
    private var sessionTimePhrase: String {
        liveSessionTime ?? "two hours and eleven minutes"
    }
    /// Doc title — most-recently-touched trace's `sourceTitle`, else
    /// the demo fallback.
    private var docTitle: String {
        liveDocTitle ?? "Attention Is All You Need"
    }
    private let ordinal = "third"
    private let sectionLabel = "3.2"
    private let settledPhrase = "left the multi-head tangle half-undone"
    private let warmThread = """
    You kept returning to the softmax of scaled dot-products —
    three times across the afternoon, each time slower than the last.
    The thread is warm; pick it up tomorrow before it cools.
    """

    var body: some View {
        ZStack {
            night.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 28) {
                eyebrow
                displayLine
                paragraph(openingParagraph)
                paragraph(warmThread)
                ruleLine
                actionRow
            }
            .padding(.horizontal, 56)
            .padding(.vertical, 56)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .environment(\.colorScheme, .dark)
        .frame(minWidth: 480, idealWidth: 640, minHeight: 400, idealHeight: 540)
        .onAppear(perform: loadSession)
        .onKeyPress(.escape) {
            dismissEveningWindow()
            return .handled
        }
    }

    /// Pulls today's LoomTrace rows (any trace whose `updatedAt`
    /// falls after midnight local) and derives two narration pieces:
    ///   - elapsed session time (earliest-createdAt → latest-updatedAt)
    ///   - the `sourceTitle` of the most-recently-touched trace
    ///
    /// Silent on failure — the hardcoded fallback copy is still
    /// literally honest (this is placeholder prose, not a lie about
    /// the user's session) so the ritual surface stays working.
    private func loadSession() {
        let startOfDay = Calendar.current.startOfDay(for: Date()).timeIntervalSince1970 * 1000
        guard let traces = try? LoomTraceWriter.allTraces() else { return }
        let today = traces.filter { $0.updatedAt >= startOfDay }
        guard let first = today.min(by: { $0.createdAt < $1.createdAt }),
              let last = today.max(by: { $0.updatedAt < $1.updatedAt }) else { return }
        let elapsedMs = max(0, last.updatedAt - first.createdAt)
        let minutes = Int((elapsedMs / 1000 / 60).rounded())
        if minutes >= 1 {
            liveSessionTime = phraseForMinutes(minutes)
        }
        if let title = last.sourceTitle?.trimmingCharacters(in: .whitespacesAndNewlines),
           !title.isEmpty {
            liveDocTitle = title
        }
    }

    /// `174` → `"two hours and fifty-four minutes"`. Evening's
    /// ambient prose style requires English word numerals, not
    /// `2h 54m` — that would pull the surface toward dashboard.
    /// Cap at "many hours" past 9h so we don't run into brittle
    /// large-number spellings.
    private func phraseForMinutes(_ m: Int) -> String {
        let hours = m / 60
        let mins = m % 60
        if hours == 0 {
            return "\(wordsForMinutes(mins)) minute\(mins == 1 ? "" : "s")"
        }
        if hours >= 10 {
            return "many hours"
        }
        let hoursPhrase = "\(wordsForHours(hours)) hour\(hours == 1 ? "" : "s")"
        if mins == 0 { return hoursPhrase }
        return "\(hoursPhrase) and \(wordsForMinutes(mins)) minute\(mins == 1 ? "" : "s")"
    }

    private func wordsForHours(_ n: Int) -> String {
        ["zero", "one", "two", "three", "four", "five",
         "six", "seven", "eight", "nine"][min(max(n, 0), 9)]
    }

    private func wordsForMinutes(_ n: Int) -> String {
        // Minutes get the full "twenty-seven" form when needed; hours
        // stay in the single-digit table since nobody's Evening window
        // opens past 10h of reading.
        if n < 20 {
            let small = [
                "zero", "one", "two", "three", "four", "five",
                "six", "seven", "eight", "nine", "ten", "eleven",
                "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
                "seventeen", "eighteen", "nineteen",
            ]
            return small[n]
        }
        let tensWord = ["", "", "twenty", "thirty", "forty", "fifty"][n / 10]
        let ones = n % 10
        if ones == 0 { return tensWord }
        let small = ["zero", "one", "two", "three", "four", "five",
                     "six", "seven", "eight", "nine"]
        return "\(tensWord)-\(small[ones])"
    }

    // MARK: - Composed text

    /// Main opening paragraph, with the ordinal / section / settled
    /// phrase interpolated. Written as a single sentence so the serif
    /// italic wraps naturally across 2-3 lines at the default width.
    private var openingParagraph: String {
        "You opened \(docTitle) for the \(ordinal) time, "
        + "stayed in §\(sectionLabel), and \(settledPhrase)."
    }

    // MARK: - Pieces

    private var eyebrow: some View {
        // Vellum eyebrow: italic serif small-caps at 11pt with 0.08em
        // tracking. Replaces the prior sans-monospaced uppercase+3.2pt
        // treatment, which read as newspaper masthead — inconsistent
        // with the rest of Loom's chrome after the eyebrow sweep. The
        // small-caps `EEEE` keeps Thursday/Friday intelligible without
        // the jarring all-caps shout.
        Text(eyebrowLabel)
            .font(.custom("EB Garamond", size: 11).italic())
            .tracking(0.5)
            .foregroundStyle(candle2)
            .textCase(.lowercase)
    }

    private var displayLine: some View {
        // Display serif italic — the surface's emotional anchor. The
        // "candle" color (warm cream) reads as soft light against the
        // near-black background; at 28pt it's the hero text.
        Text("You spent \(sessionTimePhrase) on the loom today.")
            .font(.custom("Cormorant Garamond", size: 28).italic())
            .foregroundStyle(candle)
            .fixedSize(horizontal: false, vertical: true)
            .lineSpacing(4)
    }

    private func paragraph(_ text: String) -> some View {
        Text(text)
            .font(.custom("EB Garamond", size: 15))
            .foregroundStyle(candle2)
            .lineSpacing(15 * 0.6) // target line-height ~1.6
            .fixedSize(horizontal: false, vertical: true)
    }

    private var ruleLine: some View {
        // Short typographic rule (em-dash stand-in). Using a Rectangle
        // rather than literal "─── " characters so the color/opacity
        // match the rest of the muted palette precisely.
        Rectangle()
            .fill(candle2.opacity(0.35))
            .frame(width: 44, height: 0.5)
            .padding(.vertical, 4)
    }

    private var actionRow: some View {
        HStack(spacing: 18) {
            EveningButton(
                title: "Set down the shuttle",
                candle: candle,
                candle2: candle2,
                accent: threadHi,
                action: handleSetDownShuttle
            )
            EveningButton(
                title: "Close the book",
                candle: candle,
                candle2: candle2,
                accent: threadHi,
                action: handleCloseBook
            )
        }
        .padding(.top, 6)
    }

    // MARK: - Button actions

    /// TODO: wire deferred-save pipeline. For now both buttons just
    /// dismiss the window — the ritual matters more than the plumbing
    /// on the first cut.
    private func handleSetDownShuttle() {
        dismissEveningWindow()
    }

    private func handleCloseBook() {
        dismissEveningWindow()
    }

    /// Close the Evening window by its scene id so we never accidentally
    /// close the main webview window just because it happened to be key.
    /// The AppKit fallback matches by `identifier` in case `dismissWindow`
    /// refuses (e.g. the scene hasn't been registered as expected).
    private func dismissEveningWindow() {
        dismissWindow(id: EveningWindow.id)
        if let window = NSApp.windows.first(where: { $0.identifier?.rawValue == EveningWindow.id }),
           window.isVisible {
            window.close()
        }
    }
}

/// Plain-text ritual button. No system button chrome — just serif
/// italic text that picks up a 0.5pt candle-colored border on hover
/// (the Mac-native "reveal on intent" pattern). Padding 10×22 matches
/// the spec.
private struct EveningButton: View {
    let title: String
    let candle: Color
    let candle2: Color
    let accent: Color
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.custom("EB Garamond", size: 14).italic())
                .foregroundStyle(hovering ? accent : candle)
                .padding(.vertical, 10)
                .padding(.horizontal, 22)
                .overlay(
                    RoundedRectangle(cornerRadius: 1.5, style: .continuous)
                        .stroke(candle2.opacity(hovering ? 0.9 : 0.0), lineWidth: 0.5)
                )
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}
