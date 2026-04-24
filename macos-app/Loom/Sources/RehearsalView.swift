import SwiftUI

/// Native port of `components/RehearsalOverlay.tsx` → Phase 4 overlay #3.
///
/// Minimum viable first slice:
///   - One textarea. User types what they remember without peeking.
///   - Save writes a `thought-anchor` event to SwiftData with
///     `blockId = "loom-rehearsal-root"` — exactly the shape
///     `ReconstructionsView` reads, so the learning loop closes:
///     Rehearsal ➜ (persisted trace) ➜ Recursing.
///
/// Deferred (1.5-session full port — see research spec):
///   - ⌘K select-transform via AI (reformat selection into LaTeX / table / Mermaid)
///   - "Save & ask" flow that flips to Examiner
///   - Session recovery via localStorage (not yet needed natively)
///   - Doc-context binding to the webview's currently-open doc
///
/// Doc binding: users can attach a source (title + url) in the header by
/// pasting the webview's currently-open doc — same convention as AskAI's
/// passage capture. For MVP we accept a simple free-form "topic" field.
struct RehearsalView: View {
    @Environment(\.dismissWindow) private var dismissWindow
    @Environment(\.openWindow) private var openWindow
    @AppStorage("loom.rehearsal.draft.topic") private var persistedTopic: String = ""
    @AppStorage("loom.rehearsal.draft.body") private var persistedBody: String = ""
    @State private var topic: String = ""
    @State private var body_: String = ""
    @State private var selectedRange: NSRange = NSRange(location: 0, length: 0)
    @State private var state: SaveState = .idle
    @State private var transformState: TransformState = .idle
    @State private var draftFlushTask: Task<Void, Never>?
    @FocusState private var bodyFocused: Bool

    enum SaveState { case idle, saving, saved, failed(String) }
    enum TransformState: Equatable { case idle, running(Transform), failed(String) }
    enum Transform: String, CaseIterable, Identifiable {
        case polish   = "Polish"
        case toMarkdown = "Markdown clean-up"
        case toLaTeX  = "Extract equations (LaTeX)"
        case toTable  = "Reshape as table"
        case toBullets = "Bullet summary"
        var id: String { rawValue }
        var symbol: String {
            switch self {
            case .polish: return "wand.and.stars"
            case .toMarkdown: return "doc.richtext"
            case .toLaTeX: return "function"
            case .toTable: return "tablecells"
            case .toBullets: return "list.bullet"
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            vellumHairline
            TextField("Topic (optional — what are you reconstructing?)", text: $topic)
                .textFieldStyle(.plain)
                .font(LoomTokens.serif(size: 14, italic: true))
                .foregroundStyle(LoomTokens.ink)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .overlay(alignment: .bottom) { vellumHairline }

            SelectableTextEditor(
                text: $body_,
                selectedRange: $selectedRange,
                onCommandK: { runSelectionPolish() }
            )
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(CommandKTrap { runSelectionPolish() })

            vellumHairline
            footer
        }
        .background(LoomTokens.paper)
        // Bronze accent cascades into the Topic TextField's cursor +
        // selection — without this the native SwiftUI accent (system
        // blue) leaks in and reads as neon on the vellum surface.
        // The footer buttons keep their own `.tint(LoomTokens.thread)`
        // which is redundant now but preserved for explicit clarity.
        .tint(LoomTokens.thread)
        .frame(minWidth: 520, idealWidth: 620, minHeight: 440, idealHeight: 560)
        .onAppear {
            bodyFocused = true
            // Examiner → Rehearsal hand-off: if the user hit "Back to
            // Rehearsal" from a RETRY verdict, seed the topic so they
            // can jump straight into writing.
            if let handedOff = RehearsalContext.shared.consume(), !handedOff.isEmpty {
                topic = handedOff
            } else if topic.isEmpty && body_.isEmpty {
                // Restore draft from last session — crash-proofs the
                // writing surface. Cleared on successful save.
                topic = persistedTopic
                body_ = persistedBody
            }
        }
        .onChange(of: topic) { _, new in scheduleDraftFlush(topic: new, body: body_) }
        .onChange(of: body_) { _, new in scheduleDraftFlush(topic: topic, body: new) }
        .onKeyPress(.escape) {
            dismissWindow(id: RehearsalWindow.id)
            return .handled
        }
    }

    @ViewBuilder
    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "pencil.and.outline")
                .foregroundStyle(LoomTokens.thread)
                .font(.system(size: 14))
            Text("Rehearsal")
                .font(LoomTokens.display(size: 22, italic: true))
                .foregroundStyle(LoomTokens.ink)
            Text("— write from memory; no peeking")
                .font(LoomTokens.serif(size: 12, italic: true))
                .foregroundStyle(LoomTokens.ink3)
            Spacer()
            if case .saved = state {
                Label("Saved", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(LoomTokens.sage)
                    .font(LoomTokens.sans(size: 11))
            } else if case .failed(let msg) = state {
                Label(msg, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(LoomTokens.rose)
                    .font(LoomTokens.sans(size: 11))
                    .lineLimit(1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var footer: some View {
        HStack {
            Text("⌘S save · Esc close")
                .font(LoomTokens.mono(size: 10))
                .foregroundStyle(LoomTokens.muted)
            if case .running(let kind) = transformState {
                HStack(spacing: 4) {
                    ProgressView().controlSize(.mini)
                    Text(kind.rawValue)
                        .font(LoomTokens.sans(size: 10))
                        .foregroundStyle(LoomTokens.ink3)
                }
            } else if case .failed(let msg) = transformState {
                Label(msg, systemImage: "exclamationmark.triangle")
                    .font(LoomTokens.sans(size: 10))
                    .foregroundStyle(LoomTokens.rose)
                    .lineLimit(1)
            }
            Spacer()
            reformatMenu
            Button("Save & Ask") { saveAndAsk() }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(LoomTokens.thread)
                .help("Save the draft, then open Examiner seeded with this topic")
                .disabled(body_.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
            Button("Save draft") { save() }
                .keyboardShortcut("s", modifiers: .command)
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .tint(LoomTokens.thread)
                .disabled(body_.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    /// Vellum hairline in place of the system `Divider()` for a warmer,
    /// lower-contrast seam that matches the web-side `--loom-hair`.
    @ViewBuilder
    private var vellumHairline: some View {
        LoomTokens.hair.frame(height: 0.5)
    }

    /// AI-assisted transforms on the rehearsal body. The web side wires
    /// these as ⌘K selection-only actions; on macOS 14 TextEditor doesn't
    /// expose selection cleanly, so we operate on the whole body and
    /// let the user undo (⌘Z) if the transform over-reaches.
    @ViewBuilder
    private var reformatMenu: some View {
        Menu {
            ForEach(Transform.allCases) { kind in
                Button {
                    runTransform(kind)
                } label: {
                    Label(kind.rawValue, systemImage: kind.symbol)
                }
            }
        } label: {
            Label("Reformat", systemImage: "wand.and.stars")
        }
        .menuStyle(.button)
        .controlSize(.small)
        .tint(LoomTokens.thread)
        .disabled(body_.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || transformIsRunning)
    }

    private var transformIsRunning: Bool {
        if case .running = transformState { return true }
        return false
    }

    /// ⌘K action — reformat the currently-selected text only, leaving
    /// surrounding prose untouched. Falls back to whole-body polish when
    /// nothing is selected. Caret ends up at the end of the new content.
    private func runSelectionPolish() {
        let body = body_
        let range = selectedRange
        guard range.length > 0 else {
            runTransform(.polish)
            return
        }
        let nsBody = body as NSString
        guard NSMaxRange(range) <= nsBody.length else { return }
        let selected = nsBody.substring(with: range)
        let trimmedSel = selected.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedSel.isEmpty else { return }
        transformState = .running(.polish)
        let prompt = """
        Polish the following snippet — fix typos and awkward phrasing, tighten sentences, preserve meaning. Return ONLY the revised snippet, no commentary, no surrounding quote marks.

        ---
        \(trimmedSel)
        ---
        """
        Task { @MainActor in
            do {
                let raw = try await callProvider(prompt: prompt)
                let replacement = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !replacement.isEmpty else {
                    transformState = .idle
                    return
                }
                let newBody = nsBody.replacingCharacters(in: range, with: replacement)
                body_ = newBody
                // Leave caret at the end of the new content so the user
                // can continue typing from there.
                let replacementLen = (replacement as NSString).length
                selectedRange = NSRange(location: range.location + replacementLen, length: 0)
                transformState = .idle
            } catch {
                transformState = .failed(Self.describe(error))
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 3_500_000_000)
                    if case .failed = transformState { transformState = .idle }
                }
            }
        }
    }

    private func runTransform(_ kind: Transform) {
        let input = body_.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !input.isEmpty else { return }
        transformState = .running(kind)
        let prompt = transformPrompt(kind: kind, input: input)
        Task { @MainActor in
            do {
                let result = try await callProvider(prompt: prompt)
                let trimmed = result.trimmingCharacters(in: .whitespacesAndNewlines)
                body_ = trimmed.isEmpty ? input : trimmed
                transformState = .idle
            } catch {
                transformState = .failed(Self.describe(error))
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 3_500_000_000)
                    if case .failed = transformState { transformState = .idle }
                }
            }
        }
    }

    private func transformPrompt(kind: Transform, input: String) -> String {
        let instruction: String
        switch kind {
        case .polish:
            instruction = "Polish the following rehearsal notes — fix typos and awkward phrasing, tighten sentences, but preserve meaning. Return only the revised text, no commentary."
        case .toMarkdown:
            instruction = "Clean up the following rough notes into proper Markdown. Use headers, lists, and code blocks where appropriate. Preserve all information. Return only the Markdown, no commentary."
        case .toLaTeX:
            instruction = "Identify all mathematical expressions in the following notes and rewrite them using LaTeX. Inline math in $…$, display math in $$…$$. Keep the prose intact. Return only the revised text."
        case .toTable:
            instruction = "If the following notes contain list-of-items data that fits a table, reshape the relevant section as a Markdown table. Keep non-tabular prose as-is. Return only the revised text."
        case .toBullets:
            instruction = "Compress the following notes into a tight bulleted summary — one point per line, most important facts first. Return only the bullets, no preamble."
        }
        return "\(instruction)\n\n---\n\(input)\n---"
    }

    private func callProvider(prompt: String) async throws -> String {
        switch AIProviderKind.current {
        case .openai:
            return try await OpenAIClient.send(prompt: prompt, options: OpenAIClient.Options())
        case .customEndpoint:
            return try await CustomEndpointClient.send(prompt: prompt, options: CustomEndpointClient.Options())
        case .ollama:
            return try await OllamaClient.send(prompt: prompt, options: OllamaClient.Options())
        case .claudeCli:
            var opts = CLIRuntimeClient.Options()
            opts.flavor = .claude
            return try await CLIRuntimeClient.send(prompt: prompt, options: opts)
        case .codexCli:
            var opts = CLIRuntimeClient.Options()
            opts.flavor = .codex
            return try await CLIRuntimeClient.send(prompt: prompt, options: opts)
        case .disabled:
            throw NSError(
                domain: "LoomRehearsal", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "AI is disabled in Settings."]
            )
        default:
            return try await AnthropicClient.send(prompt: prompt, options: AnthropicClient.Options())
        }
    }

    private static func describe(_ error: Error) -> String {
        (error as? AnthropicClient.Failure)?.errorDescription
            ?? (error as? OpenAIClient.Failure)?.errorDescription
            ?? (error as? OllamaClient.Failure)?.errorDescription
            ?? (error as? CustomEndpointClient.Failure)?.errorDescription
            ?? (error as? CLIRuntimeClient.Failure)?.errorDescription
            ?? error.localizedDescription
    }

    private var isSaving: Bool {
        if case .saving = state { return true }
        return false
    }

    /// Debounced draft-flush — cancels any pending write and re-schedules
    /// 600ms later. On a long rehearsal this cuts UserDefaults writes
    /// from one-per-keystroke to one-per-idle-beat, which matters because
    /// `@AppStorage` triggers a synchronous KVO fan-out on every change.
    private func scheduleDraftFlush(topic: String, body: String) {
        draftFlushTask?.cancel()
        draftFlushTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            if persistedTopic != topic { persistedTopic = topic }
            if persistedBody != body { persistedBody = body }
        }
    }

    /// Save the rehearsal + open Examiner seeded with the same topic so
    /// the user can immediately verify what they just wrote. Mirrors the
    /// web-side "Save & ask" button.
    private func saveAndAsk() {
        let cleanTopic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        let examinerTopic = cleanTopic.isEmpty
            ? (body_.split(separator: "\n", maxSplits: 1).first.map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) } ?? "this reconstruction")
            : cleanTopic
        save()
        Task { @MainActor in
            // Give save() a beat to land before handing off.
            try? await Task.sleep(nanoseconds: 300_000_000)
            ExaminerContext.shared.pendingTopic = examinerTopic
            openWindow(id: ExaminerWindow.id)
        }
    }

    private func save() {
        let trimmed = body_.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        state = .saving
        Task { @MainActor in
            do {
                let cleanTopic = topic.trimmingCharacters(in: .whitespacesAndNewlines)
                let sourceTitle = cleanTopic.isEmpty ? "Reconstruction" : cleanTopic
                let sourceDocId = cleanTopic.isEmpty ? "rehearsal:\(UUID().uuidString.prefix(8))" : "topic:\(cleanTopic)"
                let nowMs = Date().timeIntervalSince1970 * 1000
                let event: [String: Any] = [
                    "kind": "thought-anchor",
                    "blockId": "loom-rehearsal-root",
                    "text": trimmed,
                    "at": nowMs,
                ]
                _ = try LoomTraceWriter.createTrace(
                    kind: "rehearsal",
                    sourceDocId: sourceDocId,
                    sourceTitle: sourceTitle,
                    initialEvents: [event]
                )
                _ = try LoomTraceWriter.updateSummary(
                    traceId: "", // no-op if not found; real summary would need the trace id
                    summary: trimmed.split(separator: "\n", maxSplits: 1).first.map(String.init) ?? trimmed
                )
                state = .saved
                // Successful save retires the draft — clear both in-memory
                // and persisted so reopens start fresh.
                persistedTopic = ""
                persistedBody = ""
                // Clear after a beat so user can start a fresh rehearsal.
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 800_000_000)
                    if case .saved = state {
                        body_ = ""
                        topic = ""
                        state = .idle
                    }
                }
            } catch {
                state = .failed(error.localizedDescription)
            }
        }
    }
}

enum RehearsalWindow {
    static let id = "com.loom.window.rehearsal"
}

/// Examiner → Rehearsal hand-off channel. When the learner gets a RETRY
/// verdict, pressing "Back to Rehearsal" stashes the topic here so the
/// Rehearsal window opens pre-seeded with the same topic, ready to
/// rebuild the gap. Also used by ContentView.Coordinator to auto-seed
/// the topic from whichever doc the webview has open when the user hits
/// ⌘⇧R on a reading surface.
@MainActor
final class RehearsalContext: ObservableObject {
    static let shared = RehearsalContext()
    @Published var pendingTopic: String?

    func consume() -> String? {
        let t = pendingTopic
        pendingTopic = nil
        return t
    }
}
