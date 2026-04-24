import SwiftUI

/// Standalone native "Ask AI" window — Phase 4 first slice of the
/// ChatFocus port. Opens on ⌘⇧E (and later, selection-triggered).
///
/// Intentionally small: one question in, one streaming answer back. Streams
/// directly through the Swift AI clients (same dispatch switch as
/// `AIStreamBridgeHandler`) — no webview, no bridge hop.
///
/// Keeps the web-side `ChatFocus.tsx` in place for threaded / historical
/// conversations for now; this window is the "quick ask" surface.
/// Shared context for passing a pending prompt + source-passage metadata
/// into the window at open time. `AskAIView` reads it in `onAppear` and
/// clears it so the next open starts clean.
@MainActor
final class AskAIContext: ObservableObject {
    static let shared = AskAIContext()
    /// Raw text the user had selected when invoking ⌘⇧E.
    @Published var pendingSelection: String?
    /// Doc title the selection came from (so the UI can show "from: X").
    @Published var pendingSourceTitle: String?
    /// Doc URL the selection came from (for the AI prompt grounding).
    @Published var pendingSourceURL: String?

    func consume() -> (selection: String, title: String?, url: String?)? {
        guard let sel = pendingSelection, !sel.isEmpty else {
            pendingSelection = nil
            pendingSourceTitle = nil
            pendingSourceURL = nil
            return nil
        }
        let result = (sel, pendingSourceTitle, pendingSourceURL)
        pendingSelection = nil
        pendingSourceTitle = nil
        pendingSourceURL = nil
        return result
    }
}

struct AskAIView: View {
    @Environment(\.dismissWindow) private var dismissWindow
    @StateObject private var runner = AskAIRunner()
    @ObservedObject private var context = AskAIContext.shared
    @State private var prompt: String = ""
    @State private var passage: String?
    @State private var passageTitle: String?
    @State private var references: [AskAIDocRef] = []
    @State private var showReferencePicker: Bool = false
    @FocusState private var fieldFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .foregroundStyle(LoomTokens.thread)
                    .font(.system(size: 14))
                Text("Ask AI")
                    .font(LoomTokens.display(size: 18, italic: true))
                    .foregroundStyle(LoomTokens.ink)
                Spacer()
                Button {
                    showReferencePicker = true
                } label: {
                    Label("Reference a doc", systemImage: "at")
                        .font(LoomTokens.sans(size: 11))
                }
                .buttonStyle(.plain)
                .foregroundStyle(LoomTokens.ink3)
                .help("Reference a doc — its content is added as context")
                providerLabel
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .overlay(alignment: .bottom) { vellumHairline }

            if !references.isEmpty {
                referenceChips
            }

            if let passage {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "text.quote")
                            .font(.system(size: 10))
                            .foregroundStyle(LoomTokens.thread)
                        if let passageTitle {
                            Text("From: \(passageTitle)")
                                .font(LoomTokens.sans(size: 10))
                                .foregroundStyle(LoomTokens.muted)
                                .lineLimit(1)
                        }
                        Spacer()
                        Button {
                            self.passage = nil
                            self.passageTitle = nil
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 9))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(LoomTokens.muted)
                        .help("Remove passage context")
                    }
                    Text(passage)
                        .font(LoomTokens.serif(size: 12, italic: true))
                        .foregroundStyle(LoomTokens.ink2)
                        .lineLimit(3)
                        .truncationMode(.tail)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(LoomTokens.thread.opacity(0.06))
                .overlay(alignment: .bottom) { vellumHairline }
            }

            TextEditor(text: $prompt)
                .font(LoomTokens.serif(size: 14))
                .scrollContentBackground(.hidden)
                .background(LoomTokens.paper)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxHeight: 100)
                .focused($fieldFocused)
                .overlay(alignment: .bottom) { vellumHairline }
                .disabled(runner.state == .streaming)

            HStack {
                Text("⏎ Submit · ⇧⏎ newline · Esc close")
                    .font(LoomTokens.mono(size: 10))
                    .foregroundStyle(LoomTokens.muted)
                Spacer()
                if runner.state == .streaming {
                    Button("Stop") { runner.cancel() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .tint(LoomTokens.thread)
                } else {
                    Button("Ask") { submit() }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .tint(LoomTokens.thread)
                        .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)

            vellumHairline

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                    if runner.messages.isEmpty && runner.errorMessage == nil {
                        Text(placeholderText)
                            .font(LoomTokens.serif(size: 13, italic: true))
                            .foregroundStyle(LoomTokens.muted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    ForEach(runner.messages) { msg in
                        transcriptBubble(msg)
                    }

                    if let err = runner.errorMessage {
                        Label(err, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(LoomTokens.rose)
                            .font(LoomTokens.sans(size: 12))
                    }

                    if !runner.messages.isEmpty && runner.state != .streaming {
                        Button("New thread") { runner.newThread() }
                            .buttonStyle(.plain)
                            .font(LoomTokens.sans(size: 10))
                            .foregroundStyle(LoomTokens.muted)
                            .padding(.top, 4)
                    }

                    // Bottom anchor for auto-scroll.
                    Color.clear.frame(height: 1).id("askAI.bottom")

                    if !runner.history.isEmpty {
                        vellumHairline.padding(.vertical, 8)
                        HStack {
                            Text("HISTORY")
                                .font(.system(size: 10, weight: .medium))
                                .kerning(1.8)
                                .foregroundStyle(LoomTokens.muted)
                            Spacer()
                            Button("Clear") { runner.clearHistory() }
                                .buttonStyle(.plain)
                                .font(LoomTokens.sans(size: 10))
                                .foregroundStyle(LoomTokens.muted)
                        }
                        ForEach(runner.history) { entry in
                            Button {
                                runner.loadFromHistory(entry)
                                prompt = entry.prompt
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(entry.prompt)
                                        .font(LoomTokens.serif(size: 12, weight: .medium))
                                        .foregroundStyle(LoomTokens.ink)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    Text(entry.response)
                                        .font(LoomTokens.serif(size: 11))
                                        .foregroundStyle(LoomTokens.ink3)
                                        .lineLimit(2)
                                        .truncationMode(.tail)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .padding(.vertical, 6)
                                .padding(.horizontal, 8)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .background(
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(LoomTokens.hairFaint)
                            )
                        }
                    }
                    }
                    .padding(16)
                }
                .scrollContentBackground(.hidden)
                .background(LoomTokens.paper)
                .onChange(of: runner.messages.last?.content) { _, _ in
                    withAnimation(.easeOut(duration: 0.15)) {
                        proxy.scrollTo("askAI.bottom", anchor: .bottom)
                    }
                }
            }
            .frame(maxHeight: .infinity)
        }
        .background(LoomTokens.paper)
        // Bronze tint cascades into the prompt TextEditor + reference
        // picker search field — otherwise system blue leaks in and
        // reads as neon on the vellum surface.
        .tint(LoomTokens.thread)
        .frame(minWidth: 480, idealWidth: 560, minHeight: 420, idealHeight: 520)
        .onAppear {
            fieldFocused = true
            // Selection from ⌘⇧E invoke — Coordinator stashed the quoted
            // passage + source title in AskAIContext. Show it as a
            // context card above the prompt field; the runner will grade
            // the prompt with the passage when submitting.
            if let captured = context.consume() {
                passage = captured.selection
                passageTitle = captured.title
            }
        }
        .onKeyPress(.escape) {
            if runner.state == .streaming {
                runner.cancel()
                return .handled
            }
            dismissWindow(id: AskAIWindow.id)
            return .handled
        }
        .sheet(isPresented: $showReferencePicker) {
            DocReferencePicker(
                alreadyReferenced: Set(references.map(\.href)),
                onPick: { ref in
                    if !references.contains(where: { $0.href == ref.href }) {
                        references.append(ref)
                    }
                    showReferencePicker = false
                },
                onCancel: { showReferencePicker = false }
            )
        }
        .onKeyPress(KeyEquivalent("n"), phases: .down) { keyPress in
            // ⌘N (or ⌘T depending on convention) starts a new thread.
            // Mac users expect ⌘N for "new <doc>"; this maps naturally.
            if keyPress.modifiers.contains(.command) {
                runner.newThread()
                prompt = ""
                passage = nil
                passageTitle = nil
                return .handled
            }
            return .ignored
        }
        .onSubmit(submit)
    }

    /// Role-bordered transcript row — Euphony-style. A 3pt left strip
    /// carries the role color; a faint tint background keeps the bubble
    /// readable without heavy fills on long formulas or code.
    @ViewBuilder
    private func transcriptBubble(_ msg: AskAIMessage) -> some View {
        // User turns are signed in ink; assistant turns in bronze thread.
        let roleColor: Color = msg.role == .user ? LoomTokens.ink3 : LoomTokens.thread
        let isStreamingAssistant = msg.role == .assistant && msg.content.isEmpty

        HStack(alignment: .top, spacing: 0) {
            // Left role strip.
            RoundedRectangle(cornerRadius: 2)
                .fill(roleColor.opacity(0.75))
                .frame(width: 3)
                .padding(.vertical, 4)

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Image(systemName: msg.role == .user ? "person.circle" : "sparkles")
                        .font(.system(size: 10))
                        .foregroundStyle(roleColor.opacity(0.9))
                    Text(msg.role == .user ? "You" : "Assistant")
                        .font(.system(size: 10, weight: .medium))
                        .kerning(1.8)
                        .foregroundStyle(LoomTokens.muted)
                    // Timing + provider badge for assistant turns — Euphony
                    // pattern. Builds trust and helps debug slow provider.
                    if msg.role == .assistant, let elapsed = msg.elapsedLabel {
                        Text("·")
                            .font(.system(size: 9))
                            .foregroundStyle(LoomTokens.muted)
                        Text(elapsed)
                            .font(LoomTokens.mono(size: 9))
                            .foregroundStyle(LoomTokens.muted)
                    }
                    Spacer(minLength: 0)
                    // Per-turn mini-toolbar for assistant replies —
                    // Copy / Regenerate / Cite. User turns don't need it.
                    if msg.role == .assistant, !isStreamingAssistant {
                        messageToolbar(for: msg)
                    }
                }

                if isStreamingAssistant {
                    Text("…")
                        .font(LoomTokens.serif(size: 14))
                        .foregroundStyle(LoomTokens.muted)
                } else if msg.role == .assistant {
                    renderMarkdown(msg.content)
                        .font(LoomTokens.serif(size: 14))
                        .foregroundStyle(LoomTokens.ink)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    // User turns rendered plain — their input was typed,
                    // not AI-authored; no reason to interpret it as
                    // markdown (and risk mis-rendering literal `**`).
                    Text(msg.content)
                        .font(LoomTokens.serif(size: 14))
                        .foregroundStyle(LoomTokens.ink)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.vertical, 8)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                roleColor.opacity(0.05)
            )
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    @ViewBuilder
    private func messageToolbar(for msg: AskAIMessage) -> some View {
        HStack(spacing: 8) {
            Button {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(msg.content, forType: .string)
            } label: {
                Image(systemName: "doc.on.doc")
            }
            .buttonStyle(.plain)
            .foregroundStyle(LoomTokens.muted)
            .help("Copy message")

            Button {
                regenerate(from: msg)
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.plain)
            .foregroundStyle(LoomTokens.muted)
            .help("Regenerate this answer")

            Button {
                citeIntoRehearsal(msg)
            } label: {
                Image(systemName: "text.quote")
            }
            .buttonStyle(.plain)
            .foregroundStyle(LoomTokens.muted)
            .help("Send to Rehearsal as a passage")
        }
        .font(.system(size: 10))
    }

    /// Find the user prompt that produced this assistant turn, drop both
    /// turns from the transcript, and re-stream. Lets the learner get a
    /// different angle without retyping.
    private func regenerate(from assistantMsg: AskAIMessage) {
        guard let idx = runner.messages.firstIndex(where: { $0.id == assistantMsg.id }),
              idx >= 1 else { return }
        let userMsg = runner.messages[idx - 1]
        guard userMsg.role == .user else { return }
        runner.messages.removeSubrange((idx - 1)...idx)
        runner.stream(prompt: userMsg.content)
    }

    /// Push the assistant message as a passage into Rehearsal. Matches
    /// the existing ⌘⇧E selection flow but comes from AI output — turns
    /// a good answer into study material for the next round.
    private func citeIntoRehearsal(_ msg: AskAIMessage) {
        RehearsalContext.shared.pendingTopic = msg.content
        NotificationCenter.default.post(name: .loomOpenRehearsalWindow, object: nil)
    }

    /// Foundation's `AttributedString(markdown:)` handles inline + block
    /// markdown (bold/italic/code/lists/headers/links) natively on macOS
    /// 14+. KaTeX rendering is a future upgrade — for now TeX lives in
    /// the response as literal `$…$` runs, which are at least legible.
    private func renderMarkdown(_ content: String) -> Text {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .full
        )
        if let attributed = try? AttributedString(markdown: content, options: options) {
            return Text(attributed)
        }
        return Text(content)
    }

    private var placeholderText: String {
        "Type a question and hit ⏎ to ask. Streams from your configured provider: "
            + AIProviderKind.current.label
            + "."
    }

    @ViewBuilder
    private var providerLabel: some View {
        HStack(spacing: 4) {
            Image(systemName: AIProviderKind.current.systemImage)
                .font(.system(size: 10))
            Text(AIProviderKind.current.label)
                .font(LoomTokens.sans(size: 10))
        }
        .foregroundStyle(LoomTokens.muted)
    }

    /// Hairline divider in Vellum border tone — used in place of the
    /// default system `Divider()` to avoid neon-blue trim under dark mode
    /// and the chalk-white of the system divider.
    @ViewBuilder
    private var vellumHairline: some View {
        LoomTokens.hair
            .frame(height: 0.5)
    }

    @ViewBuilder
    private var referenceChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(references) { ref in
                    HStack(spacing: 4) {
                        Image(systemName: "at")
                            .font(.system(size: 9))
                            .foregroundStyle(LoomTokens.thread)
                        Text(ref.title)
                            .font(LoomTokens.serif(size: 12))
                            .foregroundStyle(LoomTokens.ink2)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        Button {
                            references.removeAll { $0.id == ref.id }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 8))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(LoomTokens.muted)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(LoomTokens.thread.opacity(0.1))
                    )
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .overlay(alignment: .bottom) { vellumHairline }
    }

    private func submit() {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, runner.state != .streaming else { return }
        Task { @MainActor in
            // Referenced docs are fetched at submit time (not at pick
            // time) so the content stays fresh across long sessions.
            var refBlocks: [String] = []
            for ref in references {
                if let body = await ref.resolveBody() {
                    let clipped = body.count > 4_000 ? String(body.prefix(4_000)) + "…" : body
                    refBlocks.append("From \(ref.title):\n\(clipped)")
                }
            }

            var sections: [String] = []
            if !refBlocks.isEmpty {
                sections.append(refBlocks.joined(separator: "\n\n---\n\n"))
            }
            if let passage, !passage.isEmpty {
                let sourceLine = passageTitle.map { "from \($0):\n" } ?? ""
                sections.append("\(sourceLine)> \(passage)")
            }
            sections.append(text)
            runner.stream(prompt: sections.joined(separator: "\n\n"))
        }
    }
}

struct AskAIMessage: Identifiable, Codable, Equatable {
    enum Role: String, Codable { case user, assistant }
    let id: String
    let role: Role
    var content: String
    let at: Double
    /// Wall-clock seconds the assistant took to produce this message.
    /// `nil` for user turns and for in-flight assistant streams.
    var elapsedSeconds: Double?

    var elapsedLabel: String? {
        guard let s = elapsedSeconds, s > 0 else { return nil }
        if s < 1.0 {
            return "\(Int((s * 1000).rounded()))ms"
        }
        if s < 60 {
            return String(format: "%.1fs", s)
        }
        let m = Int(s) / 60
        let r = Int(s) % 60
        return "\(m)m \(r)s"
    }
}

struct AskAIHistoryEntry: Identifiable, Codable, Equatable {
    let id: String
    let prompt: String
    let response: String
    let at: Double
}

@MainActor
final class AskAIRunner: ObservableObject {
    enum RunState { case idle, streaming, done, failed }

    /// Current conversation turns (user asks + assistant replies).
    @Published var messages: [AskAIMessage] = []
    @Published private(set) var state: RunState = .idle
    @Published private(set) var errorMessage: String?
    @Published private(set) var history: [AskAIHistoryEntry] = []

    private var task: Task<Void, Never>?
    private var activePrompt: String = ""

    /// Convenience alias for the last assistant message content (for
    /// history persistence + single-shot display). Empty when no turn yet.
    var lastAssistant: String {
        messages.last(where: { $0.role == .assistant })?.content ?? ""
    }

    static let historyKey = "loom.askAI.history.v1"
    static let historyMax = 20
    static let currentThreadKey = "loom.askAI.currentThread.v1"

    init() {
        loadHistory()
        loadCurrentThread()
    }

    private func loadCurrentThread() {
        guard let data = UserDefaults.standard.data(forKey: Self.currentThreadKey),
              let decoded = try? JSONDecoder().decode([AskAIMessage].self, from: data),
              !decoded.isEmpty
        else { return }
        messages = decoded
        state = .done
    }

    private func persistCurrentThread() {
        if messages.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.currentThreadKey)
            return
        }
        guard let data = try? JSONEncoder().encode(messages) else { return }
        UserDefaults.standard.set(data, forKey: Self.currentThreadKey)
    }

    private func loadHistory() {
        guard let data = UserDefaults.standard.data(forKey: Self.historyKey),
              let decoded = try? JSONDecoder().decode([AskAIHistoryEntry].self, from: data)
        else { return }
        history = decoded
    }

    private func persistHistory() {
        guard let data = try? JSONEncoder().encode(history) else { return }
        UserDefaults.standard.set(data, forKey: Self.historyKey)
    }

    func loadFromHistory(_ entry: AskAIHistoryEntry) {
        cancel()
        let now = Date().timeIntervalSince1970
        messages = [
            AskAIMessage(id: UUID().uuidString, role: .user, content: entry.prompt, at: now),
            AskAIMessage(id: UUID().uuidString, role: .assistant, content: entry.response, at: now),
        ]
        errorMessage = nil
        state = .done
        persistCurrentThread()
    }

    func clearHistory() {
        history = []
        persistHistory()
    }

    func newThread() {
        cancel()
        messages = []
        errorMessage = nil
        state = .idle
        persistCurrentThread()
    }

    /// Build a single-string transcript that includes prior turns so the
    /// upstream model has conversation context without relying on each
    /// provider's structured-messages API.
    private func composeUpstream(prompt: String) -> String {
        // On first turn `messages` only contains the just-appended user
        // turn + the empty assistant target — so there's no real history
        // to include. Return the prompt as-is.
        let priorMessages = messages.dropLast(2) // strip just-added turn
        guard !priorMessages.isEmpty else { return prompt }
        var lines: [String] = []
        for msg in priorMessages {
            let label = msg.role == .user ? "User" : "Assistant"
            lines.append("\(label): \(msg.content)")
        }
        lines.append("User: \(prompt)")
        lines.append("Assistant:")
        return lines.joined(separator: "\n\n")
    }

    func stream(prompt: String) {
        cancel()
        activePrompt = prompt
        errorMessage = nil
        state = .streaming
        let provider = AIProviderKind.current
        let now = Date().timeIntervalSince1970
        let startedAt = Date()
        // Append user turn + empty assistant turn (streaming target).
        messages.append(AskAIMessage(id: UUID().uuidString, role: .user, content: prompt, at: now))
        let assistantID = UUID().uuidString
        messages.append(AskAIMessage(id: assistantID, role: .assistant, content: "", at: now))

        // The full prompt sent upstream includes prior turns when this
        // isn't the first message — simple role-tagged transcript, which
        // every chat-tuned model understands without Anthropic's
        // structured messages API.
        let upstreamPrompt = composeUpstream(prompt: prompt)

        let onChunk: (String) -> Void = { [weak self] chunk in
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let idx = self.messages.firstIndex(where: { $0.id == assistantID }) {
                    self.messages[idx].content += chunk
                }
            }
        }

        task = Task.detached(priority: .userInitiated) { [weak self] in
            do {
                switch provider {
                case .openai:
                    var opts = OpenAIClient.Options()
                    opts.onChunk = onChunk
                    _ = try await OpenAIClient.send(prompt: upstreamPrompt, options: opts)
                case .customEndpoint:
                    var opts = CustomEndpointClient.Options()
                    opts.onChunk = onChunk
                    _ = try await CustomEndpointClient.send(prompt: upstreamPrompt, options: opts)
                case .ollama:
                    var opts = OllamaClient.Options()
                    opts.onChunk = onChunk
                    _ = try await OllamaClient.send(prompt: upstreamPrompt, options: opts)
                case .claudeCli:
                    var opts = CLIRuntimeClient.Options()
                    opts.flavor = .claude
                    opts.onChunk = onChunk
                    _ = try await CLIRuntimeClient.send(prompt: upstreamPrompt, options: opts)
                case .codexCli:
                    var opts = CLIRuntimeClient.Options()
                    opts.flavor = .codex
                    opts.onChunk = onChunk
                    _ = try await CLIRuntimeClient.send(prompt: upstreamPrompt, options: opts)
                case .disabled:
                    throw NSError(
                        domain: "LoomAI", code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "AI is disabled in Settings."]
                    )
                default:
                    var opts = AnthropicClient.Options()
                    opts.onChunk = onChunk
                    _ = try await AnthropicClient.send(prompt: upstreamPrompt, options: opts)
                }
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    self.state = .done
                    let elapsed = Date().timeIntervalSince(startedAt)
                    if let idx = self.messages.firstIndex(where: { $0.id == assistantID }) {
                        self.messages[idx].elapsedSeconds = elapsed
                    }
                    let entry = AskAIHistoryEntry(
                        id: UUID().uuidString,
                        prompt: self.activePrompt,
                        response: self.lastAssistant,
                        at: Date().timeIntervalSince1970
                    )
                    self.history.insert(entry, at: 0)
                    if self.history.count > Self.historyMax {
                        self.history = Array(self.history.prefix(Self.historyMax))
                    }
                    self.persistHistory()
                    self.persistCurrentThread()
                }
            } catch is CancellationError {
                await MainActor.run { [weak self] in
                    self?.state = .idle
                }
            } catch {
                let msg = (error as? AnthropicClient.Failure)?.errorDescription
                    ?? (error as? OpenAIClient.Failure)?.errorDescription
                    ?? (error as? CustomEndpointClient.Failure)?.errorDescription
                    ?? (error as? OllamaClient.Failure)?.errorDescription
                    ?? (error as? CLIRuntimeClient.Failure)?.errorDescription
                    ?? error.localizedDescription
                await MainActor.run { [weak self] in
                    self?.errorMessage = msg
                    self?.state = .failed
                }
            }
        }
    }

    func cancel() {
        task?.cancel()
        task = nil
    }
}

enum AskAIWindow {
    static let id = "com.loom.window.ask-ai"
}

/// One doc the user has referenced via the "@ Doc" picker. `resolveBody()`
/// lazily fetches the doc's body at submit time from the same cache path
/// `LinkPreview` uses under native mode — stays fresh even if the user
/// re-ingests content between picking and asking.
struct AskAIDocRef: Identifiable, Hashable {
    let id: String  // href — unique
    let title: String
    let href: String
    let category: String

    func resolveBody() async -> String? {
        // Only knowledge docs have a cache file — wiki references resolve
        // to title-only context (same asymmetry as LinkPreview).
        guard href.hasPrefix("/knowledge/") else { return nil }
        let parts = href.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        guard parts.count >= 3 else { return nil }
        let cat = parts[1].replacingOccurrences(of: "[^a-zA-Z0-9_\\-]", with: "", options: .regularExpression)
        let slug = parts[2].replacingOccurrences(of: "[^a-zA-Z0-9_\\-]", with: "", options: .regularExpression)
        guard let url = URL(string: "loom://content/knowledge/.cache/docs/\(cat)__\(slug).json") else {
            return nil
        }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            return json?["body"] as? String
        } catch {
            return nil
        }
    }
}

/// Sheet for searching + picking a doc to reference. Reuses the same
/// `loom://bundle/search-index.json` that ShuttleView + KnowledgeSidebar
/// load — small duplication, but the component is self-contained.
struct DocReferencePicker: View {
    let alreadyReferenced: Set<String>
    var onPick: (AskAIDocRef) -> Void
    var onCancel: () -> Void

    @State private var query: String = ""
    @State private var docs: [AskAIDocRef] = []
    @FocusState private var focused: Bool

    private var filtered: [AskAIDocRef] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return Array(docs.prefix(50)) }
        return docs.filter {
            $0.title.lowercased().contains(q) || $0.category.lowercased().contains(q)
        }.prefix(50).map { $0 }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(LoomTokens.muted)
                TextField("Search docs to reference…", text: $query)
                    .textFieldStyle(.plain)
                    .font(LoomTokens.serif(size: 13))
                    .foregroundStyle(LoomTokens.ink)
                    .focused($focused)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .overlay(alignment: .bottom) { LoomTokens.hair.frame(height: 0.5) }

            List(filtered) { doc in
                Button {
                    onPick(doc)
                } label: {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(doc.title)
                                .font(LoomTokens.serif(size: 13, weight: .medium))
                                .foregroundStyle(LoomTokens.ink)
                                .lineLimit(1)
                            if !doc.category.isEmpty {
                                Text(doc.category)
                                    .font(LoomTokens.sans(size: 10))
                                    .foregroundStyle(LoomTokens.muted)
                                    .lineLimit(1)
                            }
                        }
                        Spacer()
                        if alreadyReferenced.contains(doc.href) {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(LoomTokens.thread)
                                .font(.system(size: 11))
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(alreadyReferenced.contains(doc.href))
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(LoomTokens.paper)

            HStack {
                Spacer()
                Button("Cancel") { onCancel() }
                    .keyboardShortcut(.escape, modifiers: [])
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .overlay(alignment: .top) { LoomTokens.hair.frame(height: 0.5) }
        }
        .background(LoomTokens.paper)
        .frame(width: 480, height: 420)
        .onAppear {
            focused = true
            Task { await loadIndex() }
        }
    }

    private func loadIndex() async {
        guard docs.isEmpty,
              let url = URL(string: "loom://bundle/search-index.json") else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let index = root["index"] as? [String: Any],
                  let stored = index["storedFields"] as? [String: Any] else { return }
            var out: [AskAIDocRef] = []
            for (_, value) in stored {
                guard let fields = value as? [String: Any],
                      let title = fields["title"] as? String,
                      let href = fields["href"] as? String,
                      !title.isEmpty, !href.isEmpty else { continue }
                let category = (fields["category"] as? String) ?? ""
                out.append(AskAIDocRef(id: href, title: title, href: href, category: category))
            }
            out.sort { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
            await MainActor.run { self.docs = out }
        } catch {
            // Silent — empty list is the honest fallback.
        }
    }
}
