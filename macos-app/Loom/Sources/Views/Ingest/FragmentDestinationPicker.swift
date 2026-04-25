import SwiftUI

// MARK: - FragmentDestinationPicker
//
// Phase 7.4 — mandatory destination picker for paste fragments.
//
// **The protective wall against "capture-now-organize-later".**
// (`feedback_loom_never_do#3`.) Every fragment must have a destination
// at capture time. If the user hits Cancel — or closes the sheet
// without picking — the fragment is DISCARDED. There is no inbox, no
// "Save for later" tab, no scratchpad. This picker exists to make
// that destination decision happen at the moment of paste.
//
// Three destination kinds:
//
//   1. **Existing Pursuit** (most common). The fragment becomes a
//      source attachment on a Pursuit the user is already holding.
//   2. **Existing Panel.** Less common but supported — see
//      `FragmentDestination.panel` notes for the attach mechanism.
//   3. **New question.** Inline text input mints a new Pursuit at
//      tertiary weight, with the typed text as the question.
//
// `Save` is disabled until exactly one of the three is selected.
// `Cancel` returns the user to the IngestionView with the in-flight
// capture released — discarded by design.

/// Where a pasted fragment should land. Set by user selection inside
/// `FragmentDestinationPicker`; consumed by
/// `IngestionRunner.ingestFragment(capture:destination:)`.
public enum FragmentDestination: Equatable {
    /// Attach to an existing Pursuit, identified by `LoomPursuit.id`.
    case pursuit(id: String)
    /// Attach to an existing Panel, identified by `LoomPanel.id`. The
    /// fragment is persisted as a `reading`-kind LoomTrace whose
    /// `sourceDocId == panel.docId`, so the existing
    /// `derivePanelFromTraces` web-side reader (Phase 7.3 pattern) picks
    /// it up as a panel-bound thought-anchor without any API change.
    case panel(id: String)
    /// Mint a new Pursuit at tertiary weight with the given question
    /// text as `LoomPursuit.question`. The new Pursuit is then attached
    /// to the fragment trace.
    case newQuestion(text: String)
}

/// Lightweight row models the picker needs without taking a hard
/// dependency on the SwiftData `@Model` types directly. We project
/// `LoomPursuit` / `LoomPanel` into these so the SwiftUI body stays
/// free of `@Environment(\.modelContext)` ceremony and the previews
/// can pass mock arrays.
struct PursuitPickerRow: Identifiable, Equatable {
    let id: String
    let question: String
    let weight: String
    let season: String
    let updatedAt: Double
}

struct PanelPickerRow: Identifiable, Equatable {
    let id: String
    let title: String
    let docId: String?
    let status: String
    let updatedAt: Double
}

// MARK: - The picker view

struct FragmentDestinationPicker: View {

    /// The capture being placed. Drives the source preview header and
    /// the text excerpt.
    let capture: ClipboardInspector.Capture
    /// Pre-fetched pursuits — most-recently-updated first. The picker
    /// does not fetch these itself so the parent (`IngestionView`) can
    /// keep the SwiftData read on the runner.
    let pursuits: [PursuitPickerRow]
    /// Pre-fetched panels — most-recently-updated first.
    let panels: [PanelPickerRow]

    /// Called when the user commits to a destination. The picker closes
    /// itself by toggling `isPresented` to `false` AFTER invoking
    /// `onSave` so the parent's `ingestFragment(...)` runs first.
    let onSave: (FragmentDestination) -> Void

    /// Called when the user cancels — Save was never tapped. The parent
    /// MUST treat this as data loss by design; do not auto-save the
    /// fragment to anywhere. (`feedback_loom_never_do#3`.)
    let onCancel: () -> Void

    /// Local selection state. Exactly one of `selectedPursuitId`,
    /// `selectedPanelId`, or non-empty `newQuestionText` should be
    /// active at any moment — picking one clears the others. Save is
    /// disabled when all three are empty.
    @State private var selectedPursuitId: String? = nil
    @State private var selectedPanelId: String? = nil
    @State private var newQuestionText: String = ""

    /// Word count derived once at body init. We don't recompute on
    /// every body invalidation — the capture is immutable for the life
    /// of this sheet.
    private var wordCount: Int {
        FragmentExtractor.countWords(in: capture.text)
    }

    /// Source preview header text — hostname of `sourceURL` if present,
    /// otherwise human-name of the bundle id, otherwise "Clipboard".
    private var sourceHeader: String {
        if let urlString = capture.sourceURL,
           let url = URL(string: urlString),
           let host = url.host,
           !host.isEmpty {
            return host
        }
        if let bundle = capture.sourceApp,
           let name = appNameForBundleId(bundle) {
            return name
        }
        return "Clipboard"
    }

    /// First N chars of the captured text, for the picker preview block.
    /// Trim runaway whitespace so the preview reads as prose.
    private var previewExcerpt: String {
        let collapsed = capture.text.collapsingWhitespace()
        if collapsed.count <= 320 { return collapsed }
        let prefix = collapsed.prefix(320)
        return String(prefix) + "…"
    }

    /// Save button is disabled until ONE destination is chosen. The
    /// `newQuestionText` path requires non-whitespace content; an empty
    /// or whitespace-only string is not a valid Pursuit question.
    private var canSave: Bool {
        if selectedPursuitId != nil { return true }
        if selectedPanelId != nil { return true }
        if !newQuestionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }
        return false
    }

    private var resolvedDestination: FragmentDestination? {
        if let id = selectedPursuitId { return .pursuit(id: id) }
        if let id = selectedPanelId { return .panel(id: id) }
        let trimmed = newQuestionText.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return .newQuestion(text: trimmed) }
        return nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            LoomTokens.hair.frame(height: 0.5)
            // Body scrolls; header + footer pinned. Bounded height so
            // the sheet doesn't grow to fill the screen on long
            // pursuit lists.
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    sourceLine
                    excerptBlock
                    LoomTokens.hair.frame(height: 0.5)
                    pursuitSection
                    panelSection
                    newQuestionSection
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
            }
            .frame(minHeight: 320, idealHeight: 420, maxHeight: 480)
            LoomTokens.hair.frame(height: 0.5)
            footer
        }
        .frame(width: 520)
        .background(LoomTokens.paper)
        // Modal-by-design: there is no swipe-down or background tap
        // dismissal because every dismissal path must be an explicit
        // user choice (Save or Cancel). The `interactiveDismissDisabled`
        // hook is iOS-only on .sheet but on macOS sheets are modal by
        // default — closing requires a button press, which routes
        // through onCancel.
    }

    // MARK: - Header

    @ViewBuilder
    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("PASTED FRAGMENT")
                .font(.system(size: 10, design: .serif).smallCaps())
                .fontWeight(.medium)
                .tracking(1.2)
                .foregroundStyle(LoomTokens.thread)
            Text("Where does this land?")
                .font(LoomTokens.serif(size: 17, italic: true, weight: .medium))
                .foregroundStyle(LoomTokens.ink)
            Text("Every fragment needs a destination at capture time. Cancel to discard.")
                .font(LoomTokens.sans(size: 11))
                .foregroundStyle(LoomTokens.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
    }

    // MARK: - Source preview

    @ViewBuilder
    private var sourceLine: some View {
        HStack(spacing: 6) {
            Image(systemName: "scissors")
                .foregroundStyle(LoomTokens.muted)
                .font(.system(size: 10))
            Text(sourceHeader)
                .font(LoomTokens.sans(size: 11, weight: .medium))
                .foregroundStyle(LoomTokens.ink2)
            if let bundle = capture.sourceApp,
               let appName = appNameForBundleId(bundle),
               sourceHeader != appName {
                Text("·")
                    .foregroundStyle(LoomTokens.muted)
                Text(appName)
                    .font(LoomTokens.sans(size: 11))
                    .foregroundStyle(LoomTokens.muted)
            }
            Spacer()
            Text("\(wordCount) word\(wordCount == 1 ? "" : "s")")
                .font(LoomTokens.mono(size: 10))
                .foregroundStyle(LoomTokens.muted)
        }
    }

    @ViewBuilder
    private var excerptBlock: some View {
        Text(previewExcerpt)
            .font(LoomTokens.serif(size: 13, italic: true))
            .foregroundStyle(LoomTokens.ink2)
            .lineLimit(8)
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(LoomTokens.hairFaint)
            )
    }

    // MARK: - Pursuits section

    @ViewBuilder
    private var pursuitSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionHeader("Pursuits", count: pursuits.count)
            if pursuits.isEmpty {
                Text("No pursuits yet. Start a new question below.")
                    .font(LoomTokens.serif(size: 12, italic: true))
                    .foregroundStyle(LoomTokens.muted)
            } else {
                VStack(spacing: 0) {
                    ForEach(pursuits) { row in
                        pursuitRowButton(row)
                        if row.id != pursuits.last?.id {
                            LoomTokens.hair.frame(height: 0.5)
                        }
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(LoomTokens.hair, lineWidth: 0.5)
                )
            }
        }
    }

    @ViewBuilder
    private func pursuitRowButton(_ row: PursuitPickerRow) -> some View {
        Button {
            // Selecting a pursuit clears the other two destinations so
            // canSave reflects exactly one choice.
            selectedPursuitId = row.id
            selectedPanelId = nil
            newQuestionText = ""
        } label: {
            HStack(spacing: 8) {
                Image(systemName: selectedPursuitId == row.id
                      ? "largecircle.fill.circle"
                      : "circle")
                    .foregroundStyle(selectedPursuitId == row.id
                                     ? LoomTokens.thread
                                     : LoomTokens.muted)
                    .font(.system(size: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.question)
                        .font(LoomTokens.serif(size: 13, weight: .medium))
                        .foregroundStyle(LoomTokens.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        Text(row.weight)
                            .font(LoomTokens.mono(size: 9))
                            .foregroundStyle(LoomTokens.muted)
                        Text("·")
                            .foregroundStyle(LoomTokens.muted)
                        Text(row.season)
                            .font(LoomTokens.mono(size: 9))
                            .foregroundStyle(LoomTokens.muted)
                    }
                }
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            selectedPursuitId == row.id
            ? LoomTokens.thread.opacity(0.06)
            : Color.clear
        )
    }

    // MARK: - Panels section

    @ViewBuilder
    private var panelSection: some View {
        if panels.isEmpty {
            // Don't render an empty panel block — keeps the picker
            // tighter for the common case where the user has no
            // crystallized panels yet.
            EmptyView()
        } else {
            VStack(alignment: .leading, spacing: 6) {
                sectionHeader("Panels", count: panels.count)
                VStack(spacing: 0) {
                    ForEach(panels) { row in
                        panelRowButton(row)
                        if row.id != panels.last?.id {
                            LoomTokens.hair.frame(height: 0.5)
                        }
                    }
                }
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(LoomTokens.hair, lineWidth: 0.5)
                )
            }
        }
    }

    @ViewBuilder
    private func panelRowButton(_ row: PanelPickerRow) -> some View {
        Button {
            selectedPanelId = row.id
            selectedPursuitId = nil
            newQuestionText = ""
        } label: {
            HStack(spacing: 8) {
                Image(systemName: selectedPanelId == row.id
                      ? "largecircle.fill.circle"
                      : "circle")
                    .foregroundStyle(selectedPanelId == row.id
                                     ? LoomTokens.thread
                                     : LoomTokens.muted)
                    .font(.system(size: 12))
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title.isEmpty ? "(untitled panel)" : row.title)
                        .font(LoomTokens.serif(size: 13, weight: .medium))
                        .foregroundStyle(LoomTokens.ink)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    HStack(spacing: 6) {
                        Text(row.status)
                            .font(LoomTokens.mono(size: 9))
                            .foregroundStyle(LoomTokens.muted)
                        if let docId = row.docId, !docId.isEmpty {
                            Text("·")
                                .foregroundStyle(LoomTokens.muted)
                            Text(docId)
                                .font(LoomTokens.mono(size: 9))
                                .foregroundStyle(LoomTokens.muted)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                }
                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(
            selectedPanelId == row.id
            ? LoomTokens.thread.opacity(0.06)
            : Color.clear
        )
    }

    // MARK: - New question

    @ViewBuilder
    private var newQuestionSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            sectionHeader("Or start a new question", count: nil)
            HStack(spacing: 6) {
                Image(systemName: "plus.circle")
                    .foregroundStyle(
                        newQuestionText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? LoomTokens.muted
                        : LoomTokens.thread
                    )
                    .font(.system(size: 12))
                TextField(
                    "What question is this fragment in service of?",
                    text: $newQuestionText
                )
                .textFieldStyle(.plain)
                .font(LoomTokens.serif(size: 13))
                .foregroundStyle(LoomTokens.ink)
                .onChange(of: newQuestionText) { _, newValue in
                    // Typing here clears the radio selections so the
                    // committed destination is unambiguous.
                    let trimmed = newValue.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !trimmed.isEmpty {
                        selectedPursuitId = nil
                        selectedPanelId = nil
                    }
                }
                .onSubmit {
                    if canSave, let dest = resolvedDestination {
                        onSave(dest)
                    }
                }
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(LoomTokens.hair, lineWidth: 0.5)
            )
        }
    }

    // MARK: - Footer

    @ViewBuilder
    private var footer: some View {
        HStack(spacing: 8) {
            Spacer()
            Button("Cancel", role: .cancel) {
                onCancel()
            }
            .buttonStyle(.bordered)
            .controlSize(.regular)
            .keyboardShortcut(.cancelAction)
            .help("Discard the fragment — no inbox, no save-for-later.")

            Button("Save") {
                guard let dest = resolvedDestination else { return }
                onSave(dest)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.regular)
            .tint(LoomTokens.thread)
            .keyboardShortcut(.defaultAction)
            .disabled(!canSave)
            .help(canSave
                  ? "Attach the fragment to the chosen destination."
                  : "Pick a Pursuit, a Panel, or start a new question.")
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 12)
    }

    // MARK: - Section header helper

    @ViewBuilder
    private func sectionHeader(_ title: String, count: Int?) -> some View {
        HStack(spacing: 4) {
            Text(title.uppercased())
                .font(.system(size: 10, design: .serif).smallCaps())
                .fontWeight(.medium)
                .tracking(1.0)
                .foregroundStyle(LoomTokens.thread)
            if let count {
                Text("· \(count)")
                    .font(LoomTokens.mono(size: 10))
                    .foregroundStyle(LoomTokens.muted)
            }
            Spacer()
        }
    }

    // MARK: - Bundle-id → human name

    /// Convert `com.apple.Safari` → `"Safari"`. Best-effort; uses
    /// `NSWorkspace.urlForApplication` to look up the binary's
    /// `CFBundleName`, falls back to the trailing dot-component when
    /// the lookup fails (sandbox can block the URL probe in some
    /// configurations).
    private func appNameForBundleId(_ bundleId: String) -> String? {
        if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: bundleId),
           let bundle = Bundle(url: url),
           let name = (bundle.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String)
                    ?? (bundle.object(forInfoDictionaryKey: "CFBundleName") as? String) {
            return name
        }
        // Fallback: the trailing component is usually the app name with
        // some casing wrong. "com.apple.Safari" → "Safari".
        let parts = bundleId.split(separator: ".")
        if let last = parts.last, !last.isEmpty {
            return String(last)
        }
        return nil
    }
}

// MARK: - SwiftUI Preview

#Preview("FragmentDestinationPicker · default") {
    FragmentDestinationPicker(
        capture: ClipboardInspector.Capture(
            text: """
            The most successful technologies are the ones that disappear. \
            They weave themselves into the fabric of everyday life until \
            they are indistinguishable from it. The personal computer is \
            still in the early stages of this disappearance — we still \
            interact with it as a separate object, not as a continuous \
            extension of our minds.
            """,
            sourceURL: "https://stratechery.com/2026/the-disappearing-machine/",
            sourceApp: "com.apple.Safari",
            sourceTitle: nil
        ),
        pursuits: [
            PursuitPickerRow(
                id: "p1",
                question: "How does Loom achieve continuous-extension feel?",
                weight: "primary",
                season: "active",
                updatedAt: 1714000000000
            ),
            PursuitPickerRow(
                id: "p2",
                question: "Group Assignment 1",
                weight: "secondary",
                season: "active",
                updatedAt: 1713900000000
            ),
            PursuitPickerRow(
                id: "p3",
                question: "When does a tool become invisible?",
                weight: "tertiary",
                season: "waiting",
                updatedAt: 1713800000000
            ),
        ],
        panels: [
            PanelPickerRow(
                id: "panel-1",
                title: "Disappearing-machine thesis",
                docId: "wiki/disappearing-machine",
                status: "provisional",
                updatedAt: 1713950000000
            ),
        ],
        onSave: { _ in },
        onCancel: { }
    )
    .padding()
    .background(LoomTokens.paper)
}

#Preview("FragmentDestinationPicker · empty pursuits") {
    FragmentDestinationPicker(
        capture: ClipboardInspector.Capture(
            text: "A short note from somewhere.",
            sourceURL: nil,
            sourceApp: "com.apple.Notes",
            sourceTitle: nil
        ),
        pursuits: [],
        panels: [],
        onSave: { _ in },
        onCancel: { }
    )
    .padding()
    .background(LoomTokens.paper)
}
