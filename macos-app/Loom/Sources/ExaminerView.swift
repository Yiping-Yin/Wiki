import SwiftUI

/// Native port of `components/ExaminerOverlay.tsx` → Phase 4 overlay #4
/// (last of the set). AI asks a probing question about a user-supplied
/// topic; user answers; AI grades PASS/RETRY with feedback.
///
/// Minimum viable slice per research spec:
///   - Accept a topic from the user
///   - AI question call → show the question
///   - Answer textarea
///   - AI grading call → show verdict + feedback
///   - "Next question" and "Close" actions
///
/// Deferred to full port:
///   - Pull context from doc-specific Notes (requires Note projection)
///   - History-guided questions (passCount / retryCount state machine)
///   - Session recovery across reopen
///   - "→ Rehearsal" hand-off on retry
struct ExaminerView: View {
    @Environment(\.dismissWindow) private var dismissWindow
    @Environment(\.openWindow) private var openWindow
    // See KnowledgeSidebarView for why this replaces the old selector.
    @Environment(\.openSettings) private var openSettings
    @StateObject private var runner = ExaminerRunner()
    @ObservedObject private var context = ExaminerContext.shared
    @State private var topic: String = ""
    @State private var answer: String = ""
    @State private var missingKeyMessage: String?
    @FocusState private var focusedField: FocusField?

    enum FocusField { case topic, answer }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            vellumHairline
            switch runner.phase {
            case .idle:
                idleBody
            case .askingQuestion:
                stageBanner(label: "Generating question", systemImage: "sparkles")
            case .awaitingAnswer:
                awaitingAnswerBody
            case .grading:
                stageBanner(label: "Grading answer", systemImage: "sparkles")
            case .verdict(let v):
                verdictBody(v)
            }
            if let err = runner.errorMessage {
                vellumHairline
                Label(err, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(LoomTokens.rose)
                    .font(LoomTokens.sans(size: 11))
                    .padding(12)
            }
            if let msg = missingKeyMessage {
                vellumHairline
                HStack(spacing: 8) {
                    Image(systemName: "key.horizontal")
                        .foregroundStyle(LoomTokens.thread)
                    Text(msg)
                        .font(LoomTokens.sans(size: 11))
                        .foregroundStyle(LoomTokens.ink2)
                    Spacer(minLength: 0)
                    Button("Open Settings") {
                        openSettings()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(LoomTokens.thread)
                }
                .padding(12)
            }
        }
        .background(LoomTokens.paper)
        // Bronze tint cascades into every TextField / TextEditor cursor
        // + selection inside this view. System blue accent would leak in
        // otherwise and read as neon on the vellum paper.
        .tint(LoomTokens.thread)
        .frame(minWidth: 540, idealWidth: 620, minHeight: 480)
        .onAppear {
            if let handedOff = context.consume(), !handedOff.isEmpty {
                // Rehearsal → Examiner hand-off: auto-start the examination
                // with the topic the user just wrote about.
                topic = handedOff
                runner.askQuestion(topic: handedOff)
                focusedField = .answer
            } else if !runner.activeTopic.isEmpty {
                // Session restored from a prior close — surface the
                // active topic + question so the learner picks up where
                // they left off.
                topic = runner.activeTopic
                focusedField = runner.question?.isEmpty == false ? .answer : .topic
            } else {
                focusedField = .topic
            }
        }
        .onKeyPress(.escape) {
            dismissWindow(id: ExaminerWindow.id)
            return .handled
        }
    }

    @ViewBuilder
    private var header: some View {
        HStack(spacing: 8) {
            Image(systemName: "questionmark.bubble")
                .foregroundStyle(LoomTokens.thread)
                .font(.system(size: 14))
            Text("Examiner")
                .font(LoomTokens.display(size: 22, italic: true))
                .foregroundStyle(LoomTokens.ink)
            Text("— AI asks; you answer; AI grades")
                .font(LoomTokens.serif(size: 12, italic: true))
                .foregroundStyle(LoomTokens.ink3)
            Spacer()
            if runner.phase != .idle {
                Button("Restart") {
                    runner.reset()
                    topic = ""
                    answer = ""
                    focusedField = .topic
                }
                .buttonStyle(.plain)
                .font(LoomTokens.sans(size: 10))
                .foregroundStyle(LoomTokens.muted)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    /// Hairline in the Vellum border tone — used instead of the default
    /// system Divider throughout the Examiner chrome.
    @ViewBuilder
    private var vellumHairline: some View {
        LoomTokens.hair.frame(height: 0.5)
    }

    @ViewBuilder
    private var idleBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("What topic should I examine you on?")
                .font(LoomTokens.serif(size: 14, italic: true))
                .foregroundStyle(LoomTokens.ink2)
            TextField("e.g. transformer attention, present value, Kalman filter", text: $topic)
                .textFieldStyle(.plain)
                .font(LoomTokens.serif(size: 14))
                .foregroundStyle(LoomTokens.ink)
                .focused($focusedField, equals: .topic)
                .padding(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(LoomTokens.hair, lineWidth: 0.5)
                )
                .onSubmit { startQuestion() }
            Button("Begin") { startQuestion() }
                .buttonStyle(.borderedProminent)
                .controlSize(.regular)
                .tint(LoomTokens.thread)
                .keyboardShortcut(.defaultAction)
                .disabled(topic.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(20)
    }

    @ViewBuilder
    private var awaitingAnswerBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let question = runner.question {
                questionCard(question)
            }
            Text("Your answer")
                .font(.system(size: 10, weight: .medium))
                .kerning(1.8)
                .foregroundStyle(LoomTokens.muted)
            TextEditor(text: $answer)
                .font(LoomTokens.serif(size: 14))
                .foregroundStyle(LoomTokens.ink)
                .scrollContentBackground(.hidden)
                .background(LoomTokens.paper)
                .focused($focusedField, equals: .answer)
                .frame(minHeight: 120, maxHeight: .infinity)
                .padding(6)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(LoomTokens.hair, lineWidth: 0.5)
                )
            HStack {
                Text("⌘⏎ submit")
                    .font(LoomTokens.mono(size: 10))
                    .foregroundStyle(LoomTokens.muted)
                Spacer()
                Button("Submit") { submitAnswer() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .tint(LoomTokens.thread)
                    .keyboardShortcut(.return, modifiers: .command)
                    .disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(20)
    }

    @ViewBuilder
    private func verdictBody(_ v: ExaminerRunner.Verdict) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                Image(systemName: v.pass ? "checkmark.seal.fill" : "arrow.counterclockwise.circle")
                    .font(.system(size: 24))
                    .foregroundStyle(v.pass ? LoomTokens.sage : LoomTokens.ochre)
                Text(v.pass ? "Pass" : "Retry")
                    .font(LoomTokens.display(size: 22, italic: true, weight: .semibold))
                    .foregroundStyle(LoomTokens.ink)
                Spacer()
                if runner.turns.count > 0 {
                    Text("\(runner.passCount) pass · \(runner.retryCount) retry")
                        .font(LoomTokens.mono(size: 10))
                        .foregroundStyle(LoomTokens.muted)
                }
            }
            Text(v.feedback)
                .font(LoomTokens.serif(size: 14))
                .foregroundStyle(LoomTokens.ink)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)

            vellumHairline

            HStack(spacing: 8) {
                Button("Next question") {
                    answer = ""
                    startQuestion()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .tint(LoomTokens.thread)
                if !v.pass {
                    Button("Back to Rehearsal") {
                        RehearsalContext.shared.pendingTopic = topic
                        openWindow(id: RehearsalWindow.id)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(LoomTokens.thread)
                    .help("Rebuild the gap by writing from memory; comes back here with Save & Ask")
                }
                Button("New topic") {
                    runner.reset()
                    topic = ""
                    answer = ""
                    focusedField = .topic
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(LoomTokens.thread)
                Spacer()
                Button("Close") { dismissWindow(id: ExaminerWindow.id) }
                    .buttonStyle(.plain)
                    .foregroundStyle(LoomTokens.muted)
                    .font(LoomTokens.sans(size: 11))
            }
        }
        .padding(20)
    }

    @ViewBuilder
    private func stageBanner(label: String, systemImage: String) -> some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Label(label, systemImage: systemImage)
                .font(LoomTokens.serif(size: 13, italic: true))
                .foregroundStyle(LoomTokens.ink3)
            Spacer()
        }
        .padding(20)
    }

    @ViewBuilder
    private func questionCard(_ question: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("QUESTION")
                .font(.system(size: 10, weight: .medium))
                .kerning(1.8)
                .foregroundStyle(LoomTokens.thread)
            Text(question)
                .font(LoomTokens.serif(size: 16, weight: .medium))
                .foregroundStyle(LoomTokens.ink)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(LoomTokens.thread.opacity(0.06))
        )
    }

    private func startQuestion() {
        let t = topic.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty else { return }
        // Pre-flight: Examiner needs AI to generate questions. If no
        // Anthropic or OpenAI key is set, stop before the network call
        // and surface a pointer to Settings → AI instead of letting a
        // raw HTTP 401 bubble up with unreadable error copy.
        if !Self.hasAIKey() {
            missingKeyMessage = "Set an Anthropic (or OpenAI) key in Settings → AI (⌘,) to generate questions."
            return
        }
        missingKeyMessage = nil
        runner.askQuestion(topic: t)
        focusedField = .answer
    }

    private func submitAnswer() {
        let a = answer.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !a.isEmpty else { return }
        runner.gradeAnswer(answer: a)
    }

    /// True if the user has at least one AI provider key stored in the
    /// Keychain (Anthropic or OpenAI). Checked pre-flight so Examiner
    /// can surface a Settings → AI pointer instead of a raw HTTP 401.
    private static func hasAIKey() -> Bool {
        let anthropic = KeychainStore.readString(account: KeychainAccount.anthropicAPIKey) ?? ""
        let openai = KeychainStore.readString(account: KeychainAccount.openAIAPIKey) ?? ""
        let custom = KeychainStore.readString(account: KeychainAccount.customEndpointAPIKey) ?? ""
        return !(anthropic.isEmpty && openai.isEmpty && custom.isEmpty)
    }
}

/// Persisted snapshot of an Examiner session so reopens restore the
/// current question + turn history. Written every turn transition.
private struct ExaminerSessionState: Codable {
    var topic: String
    var question: String?
    var turns: [PersistedTurn]
    struct PersistedTurn: Codable {
        var question: String
        var answer: String
        var pass: Bool
    }
}

@MainActor
final class ExaminerRunner: ObservableObject {
    enum Phase: Equatable {
        case idle
        case askingQuestion
        case awaitingAnswer
        case grading
        case verdict(Verdict)
    }

    struct Verdict: Equatable {
        let pass: Bool
        let feedback: String
    }

    /// One completed Q&A cycle within a session. Held in-memory so the
    /// question generator sees what's already been asked and how the
    /// learner did, avoiding repetition and calibrating difficulty.
    struct Turn: Equatable {
        let question: String
        let answer: String
        let pass: Bool
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var question: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var turns: [Turn] = []
    private(set) var activeTopic: String = ""
    private var pendingAnswer: String = ""
    private var task: Task<Void, Never>?

    private static let sessionKey = "loom.examiner.session.v1"

    /// Count of prior PASS verdicts in this session.
    var passCount: Int { turns.filter(\.pass).count }
    /// Count of prior RETRY verdicts in this session.
    var retryCount: Int { turns.count - passCount }

    init() {
        restoreSession()
    }

    private func restoreSession() {
        guard let data = UserDefaults.standard.data(forKey: Self.sessionKey),
              let decoded = try? JSONDecoder().decode(ExaminerSessionState.self, from: data),
              !decoded.topic.isEmpty
        else { return }
        activeTopic = decoded.topic
        question = decoded.question
        turns = decoded.turns.map { Turn(question: $0.question, answer: $0.answer, pass: $0.pass) }
        // If a question was pending (user closed mid-answer) land them back
        // on awaitingAnswer; otherwise idle ready for a fresh question.
        phase = (question != nil && !question!.isEmpty) ? .awaitingAnswer : .idle
    }

    private func persistSession() {
        if activeTopic.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.sessionKey)
            return
        }
        let state = ExaminerSessionState(
            topic: activeTopic,
            question: question,
            turns: turns.map {
                ExaminerSessionState.PersistedTurn(question: $0.question, answer: $0.answer, pass: $0.pass)
            }
        )
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: Self.sessionKey)
        }
    }

    func reset() {
        task?.cancel()
        task = nil
        phase = .idle
        question = nil
        errorMessage = nil
        activeTopic = ""
        turns = []
        pendingAnswer = ""
        persistSession()
    }

    func askQuestion(topic: String) {
        task?.cancel()
        activeTopic = topic
        question = nil
        errorMessage = nil
        phase = .askingQuestion
        // Per-doc Notes context: pull the learner's prior Rehearsals on
        // this topic so the question is grounded in what they actually
        // wrote, not abstract textbook knowledge.
        let priorWriteups = (try? Self.fetchPriorRehearsals(for: topic)) ?? []
        let prompt = buildQuestionPrompt(topic: topic, priorTurns: turns, priorWriteups: priorWriteups)
        task = Task.detached(priority: .userInitiated) { [weak self] in
            do {
                let text = try await Self.callProvider(prompt: prompt)
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    self.question = trimmed.isEmpty ? "(no question generated)" : trimmed
                    self.phase = .awaitingAnswer
                    self.persistSession()
                }
            } catch {
                await MainActor.run { [weak self] in
                    self?.errorMessage = Self.describe(error)
                    self?.phase = .idle
                }
            }
        }
    }

    /// Pull the learner's prior Rehearsals for this topic. Matches the
    /// same `sourceDocId` shape that RehearsalView writes today:
    /// `"topic:<topic>"` when a topic is set, rehearsal-scoped
    /// synthetic id otherwise. Stays in-memory (not user-visible).
    private static func fetchPriorRehearsals(for topic: String) throws -> [String] {
        let docId = "topic:\(topic)"
        let traces = try LoomTraceWriter.traces(forDocId: docId)
        var bodies: [String] = []
        for trace in traces {
            guard let data = trace.eventsJSON.data(using: .utf8),
                  let events = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                continue
            }
            for event in events {
                guard
                    let kind = event["kind"] as? String, kind == "thought-anchor",
                    let blockId = event["blockId"] as? String, blockId == "loom-rehearsal-root",
                    let body = (event["text"] as? String) ?? (event["content"] as? String),
                    !body.isEmpty
                else { continue }
                bodies.append(body)
            }
        }
        return bodies
    }

    /// Compose a question prompt that varies difficulty + avoids
    /// repetition based on prior turns in the session, and — when the
    /// learner has already written Rehearsals on this topic — grounds
    /// questions in that source material so they're concrete, not
    /// abstract.
    private func buildQuestionPrompt(topic: String, priorTurns: [Turn], priorWriteups: [String]) -> String {
        var lines: [String] = [
            "You are examining a learner on the topic: \"\(topic)\".",
            "",
        ]
        if !priorWriteups.isEmpty {
            lines.append("The learner has previously written these reconstructions on this topic (use them to ground your question in what they actually understand — don't ask about things they haven't written about):")
            lines.append("")
            for (i, writeup) in priorWriteups.prefix(3).enumerated() {
                let clipped = writeup.count > 1200 ? String(writeup.prefix(1200)) + "…" : writeup
                lines.append("--- Reconstruction \(i + 1) ---")
                lines.append(clipped)
            }
            lines.append("")
        }
        if priorTurns.isEmpty {
            lines.append("This is the first question. Start at a moderate depth — concrete but not superficial. Answerable in 2-4 sentences.")
        } else {
            let passes = priorTurns.filter(\.pass).count
            let retries = priorTurns.count - passes
            lines.append("Session so far: \(passes) PASS · \(retries) RETRY.")
            lines.append("")
            lines.append("Questions already asked (do NOT repeat these angles):")
            for (i, turn) in priorTurns.enumerated() {
                lines.append("  \(i + 1). [\(turn.pass ? "PASS" : "RETRY")] \(turn.question)")
            }
            lines.append("")
            if retries > passes {
                lines.append("The learner is struggling — ask a concrete, smaller-scope question that probes the specific area they've been missing.")
            } else if passes >= 2 {
                lines.append("The learner is doing well — escalate difficulty. Ask a question that requires connecting multiple ideas, or applying the concept to a novel situation.")
            } else {
                lines.append("Keep depth consistent with prior questions but shift angle.")
            }
        }
        lines.append("")
        lines.append("Return only the question — no preface, no \"Question:\" prefix.")
        return lines.joined(separator: "\n")
    }

    func gradeAnswer(answer: String) {
        task?.cancel()
        phase = .grading
        errorMessage = nil
        pendingAnswer = answer
        let topic = activeTopic
        let q = question ?? "(unknown question)"
        let prompt = """
        Topic: \(topic)
        Question: \(q)
        Learner's answer: \(answer)

        Grade the answer as either PASS or RETRY.
        - PASS = the learner demonstrated genuine understanding,
          not just keywords.
        - RETRY = the answer is incomplete, superficial, or mistaken.

        Respond on two lines:
          Line 1: either `PASS` or `RETRY` (uppercase, single word).
          Line 2+: concise feedback (3-5 sentences) explaining the
          grade. If RETRY, point to the specific gap.
        """
        task = Task.detached(priority: .userInitiated) { [weak self] in
            do {
                let text = try await Self.callProvider(prompt: prompt)
                let (pass, feedback) = Self.parseVerdict(text)
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    let verdict = Verdict(pass: pass, feedback: feedback)
                    // Record the turn — the next askQuestion() reads this
                    // history to adapt difficulty + avoid repetition.
                    self.turns.append(Turn(
                        question: q,
                        answer: self.pendingAnswer,
                        pass: pass
                    ))
                    self.phase = .verdict(verdict)
                    self.persistSession()
                }
            } catch {
                await MainActor.run { [weak self] in
                    self?.errorMessage = Self.describe(error)
                    self?.phase = .awaitingAnswer
                }
            }
        }
    }

    /// Resilient PASS/RETRY extraction. Models don't always emit the
    /// verdict on line 1 — some prose it ("That's a solid answer. PASS.
    /// Your explanation of …"), some bold it, some bury it after
    /// feedback. Scan the whole response for the first standalone
    /// "PASS" or "RETRY" token; default to RETRY if neither is found so
    /// the learner is never falsely credited.
    nonisolated static func parseVerdict(_ text: String) -> (pass: Bool, feedback: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Look for the first standalone PASS/RETRY token. Boundaries
        // are non-letter characters so "BYPASS" doesn't match "PASS".
        let pattern = "(?i)\\b(PASS|RETRY)\\b"
        let pass: Bool
        if let regex = try? NSRegularExpression(pattern: pattern),
           let match = regex.firstMatch(in: clean, range: NSRange(clean.startIndex..., in: clean)),
           let range = Range(match.range, in: clean) {
            pass = clean[range].uppercased().hasPrefix("PASS")
        } else {
            pass = false
        }
        // Feedback = everything after the verdict token, if it's on
        // line 1 alone; otherwise the full response.
        let lines = clean.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
        let feedback: String
        if let first = lines.first,
           first.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "PASS"
            || first.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "RETRY" {
            feedback = lines.count > 1 ? String(lines[1]).trimmingCharacters(in: .whitespacesAndNewlines) : clean
        } else {
            feedback = clean
        }
        return (pass, feedback)
    }

    private static func callProvider(prompt: String) async throws -> String {
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
                domain: "LoomExaminer", code: 1,
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
}

enum ExaminerWindow {
    static let id = "com.loom.window.examiner"
}

/// Hand-off channel from Rehearsal's "Save & Ask" button — the topic the
/// user was reconstructing becomes the topic the Examiner quizzes on, so
/// the Rehearsal → Examiner flow requires no retyping.
@MainActor
final class ExaminerContext: ObservableObject {
    static let shared = ExaminerContext()
    @Published var pendingTopic: String?

    func consume() -> String? {
        let t = pendingTopic
        pendingTopic = nil
        return t
    }
}
