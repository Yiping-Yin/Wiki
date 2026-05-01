import SwiftUI
import PDFKit
import QuickLookUI

/// Native viewer for a source file from the user's content root.
/// Bypasses the webview entirely so PDFs (and other formats QuickLook
/// supports) render under the existing NavigationSplitView chrome —
/// sidebar stays, no Next.js routing involved.
///
/// `loomURL` is a `loom://content/<encoded path>` URL coming out of the
/// sidebar's disk-scan fallback. We resolve it to a filesystem path via
/// `LoomURLSchemeHandler.resolve`, then hand the file to PDFKit (for
/// `.pdf`) or QuickLook's `QLPreviewView` (everything else).
///
/// Onbackpress / close, the parent ContentView clears its
/// `activeSourceFileURL` state so the webview is shown again.
struct SourceFileView: View {
    let loomURL: URL
    let onClose: () -> Void

    @State private var resolvedURL: URL?
    @State private var resolveError: String?
    @StateObject private var pdfHolder = PDFViewHolder()
    @State private var toast: String? = nil
    @State private var toastTask: Task<Void, Never>? = nil
    /// ⌘E note popover state.
    @State private var noteQuote: String = ""
    @State private var noteSelection: (pageIndex: Int, rect: CGRect, text: String)? = nil
    @State private var noteDraft: String = ""
    @State private var showNoteEditor: Bool = false
    @FocusState private var noteFieldFocused: Bool
    /// ⌘K ask-AI side panel state.
    @State private var askQuote: String = ""
    @State private var askSelection: (pageIndex: Int, rect: CGRect, text: String)? = nil
    @State private var askMessages: [AskMessage] = []
    @State private var askDraft: String = ""
    @State private var showAskPanel: Bool = false
    @State private var askIsThinking: Bool = false
    @State private var askError: String? = nil
    @FocusState private var askFieldFocused: Bool
    @Environment(\.openSettings) private var openSettingsEnv

    /// Phase A2 — AI-paste capture state. ⌘⇧V parses the clipboard
    /// into turns (or freeform fallback), resolves the anchor from
    /// the current PDF selection, and opens the CaptureSheet.
    @State private var capturePayload: CapturePayload? = nil
    /// Most recently saved capture URL — surfaces a small "Captured ·
    /// Reveal · Open" capsule above the regular toast so the user can
    /// verify what landed where without leaving the PDF surface.
    @State private var lastCaptureURL: URL? = nil
    @State private var captureBannerTask: Task<Void, Never>? = nil

    struct AskMessage: Identifiable, Equatable {
        let id: UUID
        let role: Role
        let text: String
        enum Role { case user, ai }

        init(id: UUID = UUID(), role: Role, text: String) {
            self.id = id
            self.role = role
            self.text = text
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            VStack(spacing: 0) {
                Group {
                    if let resolved = resolvedURL {
                        if resolved.pathExtension.lowercased() == "pdf" {
                            LoomPDFView(
                                fileURL: resolved,
                                holder: pdfHolder,
                                onNote: startNote
                            )
                        } else {
                            LoomQuickLookView(fileURL: resolved)
                        }
                    } else if let resolveError {
                        VStack(spacing: 6) {
                            Text("Couldn't open this file")
                                .font(.system(size: 13))
                            Text(resolveError)
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else {
                        ProgressView()
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                }
            }
            .background(Color(NSColor.windowBackgroundColor))
            .overlay(alignment: .bottom) {
                if let toast = toast {
                    Text(toast)
                        .font(.system(size: 12))
                        .foregroundStyle(.primary)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(.regularMaterial, in: Capsule())
                        .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 2)
                        .padding(.bottom, 32)
                        .transition(.opacity)
                }
            }
            .overlay(alignment: .bottom) {
                if let url = lastCaptureURL {
                    HStack(spacing: 10) {
                        Text("Captured · \(url.deletingLastPathComponent().lastPathComponent)")
                            .font(.system(size: 11, design: .serif))
                        Button {
                            NSWorkspace.shared.activateFileViewerSelecting([url])
                        } label: {
                            Label("Reveal", systemImage: "magnifyingglass")
                                .font(.system(size: 11, design: .serif))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.accentColor)
                        Button {
                            NSWorkspace.shared.open(url)
                        } label: {
                            Label("Open", systemImage: "doc.text")
                                .font(.system(size: 11, design: .serif))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.accentColor)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 7)
                    .background(.regularMaterial, in: Capsule())
                    .shadow(color: .black.opacity(0.18), radius: 8, x: 0, y: 2)
                    .padding(.bottom, 80)
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if showNoteEditor {
                    noteEditorPanel
                        .padding(20)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }

            if showAskPanel {
                Divider()
                askAIPanel
                    .frame(width: 360)
                    .background(Color(NSColor.windowBackgroundColor))
                    .transition(.move(edge: .trailing))
            }
        }
        .sheet(isPresented: Binding<Bool>(
            get: { capturePayload != nil },
            set: { if !$0 { capturePayload = nil } }
        )) {
            CaptureSheet(payload: $capturePayload, onSaved: handleCaptureSaved)
        }
        .task(id: loomURL) {
            await resolve()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomApplyPDFAnchor)) { note in
            guard let page = note.userInfo?["page"] as? Int,
                  let rectVal = note.userInfo?["rect"] as? NSValue else { return }
            let rect = rectVal.rectValue
            pdfHolder.go(toPage: page, rect: rect)
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomTriggerNote)) { _ in
            startNote()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomTriggerCaptureFromClipboard)) { _ in
            startCaptureFromClipboard()
        }
        // Filename rides up to the actual NSWindow titlebar via the
        // navigation title — replaces the old local header bar so we
        // don't double up vertical chrome (toolbar + header).
        .navigationTitle(displayName)
        .navigationSubtitle("")
    }

    // The local `header` view (filename row + divider) was removed —
    // the filename rides up to the NSWindow titlebar via
    // `.navigationTitle(displayName)`, eliminating the doubled-up
    // chrome the user flagged.

    private var displayName: String {
        let path = loomURL.path
        guard let last = path.split(separator: "/").last else { return loomURL.absoluteString }
        return last.removingPercentEncoding ?? String(last)
    }

    // MARK: - Note panel (⌘E)

    @ViewBuilder
    private var noteEditorPanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text("Note on \(displayName)")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 8)
                if noteSelection != nil {
                    Button {
                        switchToAskAI()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "sparkle")
                                .font(.system(size: 11))
                            Text("Ask AI")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundStyle(.primary.opacity(0.8))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(
                            Capsule().fill(Color.accentColor.opacity(0.15))
                        )
                    }
                    .buttonStyle(.plain)
                    .help("Switch to AI conversation about this passage")
                }
                Button(action: cancelNote) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.tertiary)
                        .symbolRenderingMode(.hierarchical)
                }
                .buttonStyle(.plain)
            }
            if !noteQuote.isEmpty {
                Text(noteQuote)
                    .font(.system(size: 12, design: .serif))
                    .italic()
                    .foregroundStyle(.primary.opacity(0.85))
                    .lineLimit(3)
                    .padding(.leading, 10)
                    .padding(.vertical, 2)
                    .overlay(alignment: .leading) {
                        Rectangle()
                            .fill(Color.accentColor.opacity(0.5))
                            .frame(width: 2)
                    }
            }
            // TextEditor with explicit foreground + opaque text-area
            // background. `regularMaterial` outer + transparent
            // TextEditor background made the textarea render as a
            // black void in dark mode — fixed by giving the editor
            // its own opaque surface.
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(NSColor.textBackgroundColor))
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.secondary.opacity(0.25), lineWidth: 1)
                TextEditor(text: $noteDraft)
                    .font(.system(size: 13))
                    .foregroundStyle(.primary)
                    .focused($noteFieldFocused)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 4)
                if noteDraft.isEmpty {
                    Text("Type your thought, or press Save to keep just the quote…")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 12)
                        .allowsHitTesting(false)
                }
            }
            .frame(height: 110)
            HStack(spacing: 10) {
                Spacer()
                Button("Cancel") { cancelNote() }
                    .keyboardShortcut(.cancelAction)
                Button("Save") { commitNote() }
                    .keyboardShortcut(.return, modifiers: .command)
                    .buttonStyle(.borderedProminent)
                    .disabled(noteSelection == nil
                              && noteDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .frame(width: 380)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(NSColor.windowBackgroundColor))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.25), radius: 16, x: 0, y: 6)
    }

    private func startNote() {
        guard let info = pdfHolder.currentSelectionInfo(), !info.text.isEmpty else {
            // Allow free-form notes when nothing is selected.
            noteSelection = nil
            noteQuote = ""
            noteDraft = ""
            showNoteEditor = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                noteFieldFocused = true
            }
            return
        }
        noteSelection = info
        noteQuote = info.text
        noteDraft = ""
        showNoteEditor = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            noteFieldFocused = true
        }
    }

    private func cancelNote() {
        showNoteEditor = false
        noteDraft = ""
        noteQuote = ""
        noteSelection = nil
    }

    private func commitNote() {
        let trimmed = noteDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        // Free-form notes (no selection) require a body. Anchored
        // notes accept an empty body — that means "just save the
        // quote", same outcome as the old Quote menu item.
        if noteSelection == nil && trimmed.isEmpty { return }
        guard let rootID = parentRootID else {
            showToast("Couldn't find this file's page.")
            return
        }
        let target = LoomFileStore.loomMDURL(for: rootID)
        let entry: String
        if let info = noteSelection, trimmed.isEmpty {
            entry = buildQuoteEntry(info: info)
        } else {
            entry = buildNoteEntry(thought: trimmed, info: noteSelection)
        }
        do {
            try FileManager.default.createDirectory(
                at: target.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let existing = (try? String(contentsOf: target, encoding: .utf8)) ?? ""
            let updated = appendUnderNotes(entry: entry, file: displayName, to: existing)
            try updated.write(to: target, atomically: true, encoding: .utf8)
            cancelNote()
            let kind = trimmed.isEmpty ? "Quote" : "Note"
            showToast("\(kind) saved to \(parentRootName ?? "page").")
        } catch {
            showToast("Couldn't save: \(error.localizedDescription)")
        }
    }

    /// Switch from the Note popover to the existing Ask-AI side panel
    /// using the same selection. The popover dismisses without
    /// saving so we don't leave a stub note alongside the
    /// conversation.
    private func switchToAskAI() {
        // Capture the selection before we tear down the note state.
        let info = noteSelection
        cancelNote()
        guard let info = info else { return }
        askSelection = info
        askQuote = info.text
        askMessages = []
        askDraft = ""
        showAskPanel = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            askFieldFocused = true
        }
    }

    private func buildNoteEntry(thought: String, info: (pageIndex: Int, rect: CGRect, text: String)?) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        let timestamp = formatter.string(from: Date())
        if let info = info {
            let pageDisplay = info.pageIndex + 1
            let quoted = Self.quoteLines(info.text)
            let anchor = anchorURL(for: info)
            return """
            *p.\(pageDisplay) · \(timestamp)*
            \(quoted)

            \(thought)

            [📍 Jump to passage](\(anchor))
            """
        } else {
            return """
            *\(timestamp)*
            \(thought)
            """
        }
    }

    // MARK: - Ask AI panel (⌘K)

    @ViewBuilder
    private var askAIPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: "sparkle")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.accentColor)
                Text("Ask about passage")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.primary)
                Spacer(minLength: 0)
                Button(action: archiveAndCloseAsk) {
                    Image(systemName: "tray.and.arrow.down")
                        .font(.system(size: 12))
                        .foregroundStyle(askMessages.isEmpty ? Color.secondary.opacity(0.4) : Color.primary.opacity(0.7))
                }
                .buttonStyle(.plain)
                .help("Save thread to page and close")
                .disabled(askMessages.isEmpty)
                Button(action: closeAsk) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(.tertiary)
                        .symbolRenderingMode(.hierarchical)
                }
                .buttonStyle(.plain)
                .help("Close (discard if not saved)")
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
            .padding(.bottom, 10)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !askQuote.isEmpty {
                        Text(askQuote)
                            .font(.system(size: 12, design: .serif))
                            .italic()
                            .foregroundStyle(.primary.opacity(0.85))
                            .padding(.leading, 10)
                            .padding(.vertical, 2)
                            .overlay(alignment: .leading) {
                                Rectangle()
                                    .fill(Color.accentColor.opacity(0.5))
                                    .frame(width: 2)
                            }
                    }
                    ForEach(askMessages) { msg in
                        askMessageRow(msg)
                    }
                    if askIsThinking {
                        HStack(spacing: 6) {
                            ProgressView().controlSize(.small)
                            Text("thinking…")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            Divider()
            VStack(alignment: .leading, spacing: 8) {
                if let askError = askError {
                    askErrorBanner(askError)
                }
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(Color(NSColor.textBackgroundColor))
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.secondary.opacity(0.25), lineWidth: 1)
                    ChatTextEditor(text: $askDraft, focused: $askFieldFocused) {
                        sendAsk()
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 4)
                    if askDraft.isEmpty {
                        Text("Ask anything about the passage… ⏎ to send, ⇧⏎ for new line")
                            .font(.system(size: 12))
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 12)
                            .allowsHitTesting(false)
                    }
                }
                .frame(height: 70)
                HStack {
                    Spacer()
                    Button("Send") { sendAsk() }
                        .buttonStyle(.borderedProminent)
                        .disabled(askDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || askIsThinking)
                }
            }
            .padding(14)
        }
    }

    @ViewBuilder
    private func askErrorBanner(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 12))
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 4) {
                Text(message)
                    .font(.system(size: 11))
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if message.contains("CLI binary") || message.contains("disabled") || message.contains("provider") || message.contains("Apple Intelligence") {
                    Button {
                        openSettingsEnv()
                    } label: {
                        Text("Open Settings")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color.accentColor)
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
            Button {
                askError = nil
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
            }
            .buttonStyle(.plain)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(LoomTokens.dsWarning.opacity(0.10))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .stroke(LoomTokens.dsWarning.opacity(0.3), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func askMessageRow(_ msg: AskMessage) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(msg.role == .user ? "You" : "AI")
                    .font(.system(size: 10, weight: .semibold))
                    .textCase(.uppercase)
                    .kerning(0.8)
                    .foregroundStyle(.tertiary)
                Spacer(minLength: 0)
                // Per-message "Save as note" — only on AI replies that
                // have actual content. The bridge from AI dialogue to a
                // durable, editable, anchored note. User reviews / edits
                // before commit so the saved note is theirs, not a raw
                // AI dump.
                if msg.role == .ai && !msg.text.isEmpty {
                    Button {
                        saveAIMessageAsNote(msg)
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.down.doc")
                                .font(.system(size: 10))
                            Text("Save as note")
                                .font(.system(size: 10, weight: .medium))
                        }
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(
                            Capsule().fill(Color.secondary.opacity(0.10))
                        )
                    }
                    .buttonStyle(.plain)
                    .help("Pre-fill the Note popover with this AI reply + the original passage")
                }
            }
            Text(msg.text)
                .font(.system(size: 12))
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Bridge from AI dialogue to a durable note. Closes the Ask
    /// panel and opens the Note popover pre-filled with the AI's
    /// reply as the body and the original passage as the quote.
    /// The user gets a chance to edit/refine before saving — keeps
    /// authorship in the user's hands (curiosity-led: AI helps draft,
    /// user owns the takeaway).
    private func saveAIMessageAsNote(_ msg: AskMessage) {
        let info = askSelection
        let quote = askQuote
        let draft = msg.text
        // Tear down the Ask panel state without writing anything.
        showAskPanel = false
        askSelection = nil
        askQuote = ""
        askMessages = []
        askDraft = ""
        askError = nil
        // Open the Note popover with the AI text as the editable body.
        noteSelection = info
        noteQuote = quote
        noteDraft = draft
        showNoteEditor = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            noteFieldFocused = true
        }
    }

    // MARK: - Capture from clipboard (Phase A2)

    /// ⌘⇧V handler. Reads clipboard, runs the AI-conversation parser,
    /// resolves the anchor (current PDF selection > containing folder
    /// > Inbox), opens the CaptureSheet pre-filled. The user reviews
    /// turns, edits, picks anchor, saves — all writes flow through
    /// `LoomFileStore`, never the source folder.
    private func startCaptureFromClipboard() {
        let selection = pdfHolder.currentSelectionInfo()
        let anchors = CaptureAnchorResolver.resolveForSourceFile(
            loomURL: loomURL,
            selection: selection
        )
        guard let primary = anchors.first else {
            showToast("Couldn't resolve an anchor for this capture.")
            return
        }
        capturePayload = CapturePayload.makeFromClipboard(anchor: primary, available: anchors)
    }

    private func handleCaptureSaved(_ url: URL) {
        captureBannerTask?.cancel()
        withAnimation(.easeOut(duration: 0.18)) {
            lastCaptureURL = url
        }
        captureBannerTask = Task {
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            await MainActor.run {
                withAnimation(.easeIn(duration: 0.25)) {
                    lastCaptureURL = nil
                }
            }
        }
    }

    private func startAsk() {
        guard let info = pdfHolder.currentSelectionInfo(), !info.text.isEmpty else {
            showToast("Select text first to ask about it.")
            return
        }
        askSelection = info
        askQuote = info.text
        askMessages = []
        askDraft = ""
        showAskPanel = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            askFieldFocused = true
        }
    }

    private func sendAsk() {
        let userText = askDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userText.isEmpty else { return }
        let userMsg = AskMessage(role: .user, text: userText)
        askMessages.append(userMsg)
        askDraft = ""
        askIsThinking = true
        askError = nil
        let quote = askQuote
        let history = askMessages
        let priorNotes = gatherPriorNotesFromPage()

        // Append an empty AI placeholder that we'll mutate as tokens
        // arrive. Streaming writes feel snappier than the old wait-
        // for-everything-then-paste behavior, especially with prior
        // notes context (which can lengthen response time).
        let placeholder = AskMessage(role: .ai, text: "")
        askMessages.append(placeholder)
        let placeholderID = placeholder.id

        Task {
            do {
                let prompt = Self.buildAskPrompt(
                    quote: quote,
                    history: history,
                    priorNotes: priorNotes
                )
                let firstResponse = try await LoomAI.sendStream(
                    prompt: prompt,
                    systemPrompt: Self.askSystemPrompt
                ) { chunk in
                    Task { @MainActor in
                        if let idx = askMessages.firstIndex(where: { $0.id == placeholderID }) {
                            askMessages[idx] = AskMessage(
                                id: placeholderID,
                                role: .ai,
                                text: askMessages[idx].text + chunk
                            )
                        }
                    }
                }
                // Output validation: small models (incl. Apple
                // Foundation) drift back to filler/restatement
                // patterns the few-shot prompt forbids. Catch it
                // and silently retry once with a reinforced prompt.
                let violations = Self.validateResponse(firstResponse, userQuestion: userText)
                if !violations.isEmpty {
                    let userLang = Self.detectAskLanguage(userText)
                    let wantsDepth = Self.detectDepthRequest(userText)
                    let langDirective: String = {
                        switch userLang {
                        case .cjk:    return "用中文回复，整段都用中文，不要英文。"
                        case .latin:  return "Reply in English."
                        case .unknown: return "Reply in the SAME language as the user's question."
                        }
                    }()
                    let depthDirective = wantsDepth
                        ? (userLang == .cjk
                            ? "用户要求拆细讲解，→ 行后必须有 4–6 句具体展开（逐符号解释、最小例子、隐含假设），不许只写一句。"
                            : "User asked for a detailed breakdown — give 4–6 sentences after the → line (define each symbol, minimal example, hidden assumption). Do NOT stop after one sentence.")
                        : "3–6 sentences total."
                    let reinforcement = """
                    Your previous reply broke these rules: \(violations.joined(separator: "; ")). \
                    Rewrite it. Start with → on the first line. The lines AFTER → must add NEW \
                    information (mechanism, concrete example, counterexample, hidden assumption, \
                    connection) — NEVER a paraphrase of the → line in different words. Cut filler. \
                    No restatement of the passage. \(langDirective) \(depthDirective)
                    """
                    let retryPrompt = prompt + "\n\nPREVIOUS ATTEMPT (bad):\n\(firstResponse)\n\n\(reinforcement)"
                    // Reset the placeholder text and stream the retry
                    // in over the bad reply.
                    await MainActor.run {
                        if let idx = askMessages.firstIndex(where: { $0.id == placeholderID }) {
                            askMessages[idx] = AskMessage(id: placeholderID, role: .ai, text: "")
                        }
                    }
                    _ = try await LoomAI.sendStream(
                        prompt: retryPrompt,
                        systemPrompt: Self.askSystemPrompt
                    ) { chunk in
                        Task { @MainActor in
                            if let idx = askMessages.firstIndex(where: { $0.id == placeholderID }) {
                                askMessages[idx] = AskMessage(
                                    id: placeholderID,
                                    role: .ai,
                                    text: askMessages[idx].text + chunk
                                )
                            }
                        }
                    }
                }
                await MainActor.run { askIsThinking = false }
            } catch {
                await MainActor.run {
                    askMessages.removeAll { $0.id == placeholderID }
                    askError = error.localizedDescription
                    askIsThinking = false
                    askDraft = userText
                }
            }
        }
    }

    /// Programmatic quality gate — checks an AI response for known
    /// filler patterns, missing template marker, restatement of the
    /// passage, and excessive length. Returns the list of violations
    /// (empty = passed). Used by `sendAsk` to auto-retry once with a
    /// reinforced prompt before showing the user — small models
    /// (Apple Foundation, light cloud models) regularly need this.
    static func validateResponse(_ response: String, userQuestion: String = "") -> [String] {
        var violations: [String] = []
        let trimmed = response.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = trimmed.lowercased()

        // 1. Template marker — every real response should start with →
        // unless it's the explicit "too brief" stop response.
        let isTooBriefResponse = lower.contains("too brief to unpack alone")
        if !trimmed.hasPrefix("→") && !isTooBriefResponse {
            violations.append("missing → template marker")
        }

        // 2. Forbidden filler phrases — explicit blocklist.
        let forbidden: [String] = [
            "this passage is about",
            "the passage suggests",
            "in this passage",
            "this passage",
            "fundamental concept",
            "comprehensive framework",
            "structured approach",
            "it is important to understand",
            "it is essential to",
            "in summary",
            "in conclusion",
            "overall,",
        ]
        let hits = forbidden.filter { lower.contains($0) }
        if !hits.isEmpty {
            violations.append("used filler phrase(s): \(hits.joined(separator: ", "))")
        }

        // 3. Length cap — over 8 sentences for a study-companion
        // reply almost certainly means padding.
        let sentenceCount = trimmed.components(separatedBy: CharacterSet(charactersIn: ".!?"))
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .count
        if sentenceCount > 8 {
            violations.append("too long (\(sentenceCount) sentences, cap is 6–8)")
        }

        // 4. Near-duplicate paragraphs — small models often paraphrase
        // the → answer line as a "second paragraph" instead of adding
        // new information (mechanism / example / counterexample). When
        // ≥70% of normalized tokens overlap, treat the second
        // paragraph as a restatement.
        let paragraphs = trimmed
            .components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        if paragraphs.count >= 2 {
            let first = Self.normalizedTokens(paragraphs[0])
            let second = Self.normalizedTokens(paragraphs[1])
            if !first.isEmpty && !second.isEmpty {
                let shared = first.intersection(second).count
                let smaller = min(first.count, second.count)
                let overlap = Double(shared) / Double(smaller)
                if overlap >= 0.7 {
                    violations.append("second paragraph restates the → line (token overlap \(Int(overlap * 100))%)")
                }
            }
        }

        // 5. Language mismatch — when the user's question is clearly
        // CJK (or clearly Latin) and the reply is the opposite script,
        // the language-mirror rule was ignored. Most common failure on
        // small models / Apple Foundation.
        if !userQuestion.isEmpty && !isTooBriefResponse {
            let userLang = Self.detectAskLanguage(userQuestion)
            let replyLang = Self.detectAskLanguage(trimmed)
            if userLang != .unknown && replyLang != .unknown && userLang != replyLang {
                violations.append("language mismatch (user wrote \(userLang.rawValue), reply is \(replyLang.rawValue))")
            }
        }

        // 6. Insufficient unpacking — when the user explicitly asked
        // for a breakdown ("拆", "详细", "unpack", "explain", etc.)
        // but the reply is just the → line plus little to nothing,
        // the model refused the depth request. Floor: 3 sentences
        // total when depth was requested.
        if !userQuestion.isEmpty &&
           Self.detectDepthRequest(userQuestion) &&
           !isTooBriefResponse &&
           sentenceCount < 3 {
            violations.append("user asked for a breakdown but reply has only \(sentenceCount) sentence(s) — needs ≥3")
        }
        return violations
    }

    /// Lowercased, punctuation-stripped, arrow-stripped token set used
    /// by the duplicate-paragraph check. Treats CJK characters as
    /// individual tokens so the check works for Chinese replies too.
    static func normalizedTokens(_ text: String) -> Set<String> {
        let stripped = text
            .replacingOccurrences(of: "→", with: " ")
            .lowercased()
        let scalars = stripped.unicodeScalars.map { scalar -> Character in
            if CharacterSet.alphanumerics.contains(scalar) { return Character(scalar) }
            // Keep CJK ideographs as-is; collapse everything else to space.
            if (0x4E00...0x9FFF).contains(scalar.value) ||
               (0x3400...0x4DBF).contains(scalar.value) ||
               (0x3040...0x30FF).contains(scalar.value) {
                return Character(scalar)
            }
            return " "
        }
        let cleaned = String(scalars)
        var tokens = Set<String>()
        for word in cleaned.split(separator: " ") {
            let w = String(word)
            if w.count <= 1 && w.allSatisfy({ $0.isASCII }) { continue }
            tokens.insert(w)
        }
        // Add per-character CJK tokens so 中文 paragraphs compare meaningfully.
        for ch in cleaned where ch.unicodeScalars.first.map({
            (0x4E00...0x9FFF).contains($0.value) ||
            (0x3400...0x4DBF).contains($0.value) ||
            (0x3040...0x30FF).contains($0.value)
        }) ?? false {
            tokens.insert(String(ch))
        }
        return tokens
    }

    private func closeAsk() {
        showAskPanel = false
        askSelection = nil
        askQuote = ""
        askMessages = []
        askDraft = ""
    }

    private func archiveAndCloseAsk() {
        guard !askMessages.isEmpty else { closeAsk(); return }
        guard let rootID = parentRootID else {
            showToast("Couldn't find this file's page.")
            return
        }
        let target = LoomFileStore.loomMDURL(for: rootID)
        let entry = buildThreadEntry(quote: askQuote, info: askSelection, messages: askMessages)
        do {
            try FileManager.default.createDirectory(
                at: target.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let existing = (try? String(contentsOf: target, encoding: .utf8)) ?? ""
            let updated = appendUnderThreads(entry: entry, file: displayName, to: existing)
            try updated.write(to: target, atomically: true, encoding: .utf8)
            showToast("Thread saved to \(parentRootName ?? "page").")
            closeAsk()
        } catch {
            showToast("Couldn't save: \(error.localizedDescription)")
        }
    }

    private func buildThreadEntry(quote: String, info: (pageIndex: Int, rect: CGRect, text: String)?, messages: [AskMessage]) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        let timestamp = formatter.string(from: Date())
        let pagePart: String = {
            guard let info = info else { return "" }
            return "p.\(info.pageIndex + 1) · "
        }()
        let quoted = Self.quoteLines(quote)
        var body = """
        *\(pagePart)\(timestamp)*
        \(quoted)

        """
        if let info = info {
            body += "[📍 Jump to passage](\(anchorURL(for: info)))\n\n"
        }
        for msg in messages {
            let speaker = msg.role == .user ? "**You:**" : "**AI:**"
            body += "\(speaker) \(msg.text)\n\n"
        }
        return body.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Heuristic: classify a passage as definition / claim / equation /
    /// general, then propose a first-message prompt the user can either
    /// send as-is or rewrite. Removes cold-start friction.
    static func suggestedAskPrompt(for passage: String) -> String {
        let trimmed = passage.trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = trimmed.lowercased()
        // Equation-ish: has =, lots of digits/symbols, short
        let symbolCount = trimmed.filter { "=+-*/^∑∫≤≥≈".contains($0) }.count
        if symbolCount >= 2 || (trimmed.contains("=") && trimmed.count < 120) {
            return "What does this equation say, and when would I use it?"
        }
        // Definition-ish: starts with "X is", "X means", "X refers to"
        let defPatterns = [" is ", " means ", " refers to ", " is defined as "]
        if defPatterns.contains(where: { lower.contains($0) }) && trimmed.count < 240 {
            return "Can you unpack this definition with a simple example?"
        }
        // Claim-ish: contains argumentative words
        let claimWords = ["because", "therefore", "thus", "however", "implies", "suggests", "argues", "must", "should"]
        if claimWords.contains(where: { lower.contains($0) }) {
            return "Why does the author make this claim? What's the reasoning?"
        }
        return "What's the key idea here, in plain language?"
    }

    static let askSystemPrompt = """
    You are a terse study companion. When the user shares a passage and a question, give them what they CAN'T see by re-reading the passage. The user is literate; do not summarize what they just read.

    LANGUAGE: Reply in the SAME language as the user's latest question. If they write in Chinese, reply in Chinese; if English, reply in English. Keep technical notation in its original form (e.g. 集合 X, 选择规则 c: 𝒜 → 2^X). Mirror tone, not just script. Never switch languages mid-reply.

    OUTPUT TEMPLATE (use this exact two-line shape unless the user explicitly asks for more):
    → [direct answer in ONE sentence — the actual takeaway, not framing]
    [1–3 sentences that add NEW information — mechanism, concrete example, counterexample, unstated assumption, or connection. NEVER a paraphrase of the → line. If you can only paraphrase, you have nothing to add — stop after the → line.]

    NEVER write any of these — they signal you have nothing real to say:
    - "This passage is about…" / "The passage suggests…" / "In this passage…"
    - "fundamental concept" / "comprehensive framework" / "structured approach"
    - "It is important to understand…" / "It is essential to…"
    - "In summary" / "In conclusion" / "Overall"
    - Multi-paragraph essays unless explicitly requested
    - A second paragraph that just rewords the → line in different syntax

    If the passage is too thin to add real value, reply EXACTLY (in the user's language):
    → Too brief to unpack alone. What angle do you want — definition, mechanism, example, or connection to something else?

    When PRIOR NOTES are present and actually relevant, reference them by page ("extends your note on p.3…"). Never force it.

    ──────────── EXAMPLES ────────────

    PASSAGE: "Choice involves selecting from a set of alternatives X."
    QUESTION: "What does this mean in plain language?"
    BAD: "Choice is a fundamental concept in decision-making theory. The passage suggests there is a structured way to analyze choices…"
    GOOD:
    → X is just the menu of options you have — like {coffee, tea} when ordering.
    The passage starts here because every later step (preference, utility, ranking) needs a set to act on. X is the noun the whole model is built around.

    PASSAGE: "The model assumes decision-makers are rational."
    QUESTION: "Why this assumption?"
    BAD: "Rationality is a fundamental assumption in economic theory. It is essential to understand…"
    GOOD:
    → To make the math tractable, not because it's true.
    If you allow A>B, B>C, AND C>A at once, you can't fit a utility function. "Rational" really means "consistent enough to assign each option a single number". Real humans violate this routinely — see Allais paradox, framing effects.

    PASSAGE: "The integral of f(x) from a to b equals F(b) − F(a)."
    QUESTION: "Why does this work?"
    BAD: "The fundamental theorem of calculus is a comprehensive framework that…"
    GOOD:
    → Because adding up tiny rates of change recovers the total change.
    F is the antiderivative — the function whose slope is f. Summing f's contributions from a to b is the same as asking how much F grew, which is just F(b) − F(a). The integral doesn't care about the path; only the endpoints of F matter.

    PASSAGE: "A basic model of choice considers a set of alternatives X, a collection of nonempty subsets 𝒜 of X, and a choice rule c: 𝒜 → 2^X such that c(A) ⊆ A for all A ∈ 𝒜."
    QUESTION: "解释"
    BAD: "→ A basic model of choice involves a set of alternatives X, a collection of nonempty subsets A of X, and a choice rule c. A basic model of choice involves a set of alternatives X, a collection of nonempty subsets A of X, and a choice rule c."
    GOOD:
    → 选出来的东西必须本来就在菜单上 —— c(A) ⊆ A 是把抽象函数 c 钉死在现实约束上的那条线。
    X 是所有备选项的全集；𝒜 是"会出现的菜单组合"（不是 X 的全部子集，因为有的组合在现实里不会发生）；c 给每个菜单选出一个非空子集，⊆ 保证不会凭空选出菜单外的东西。后面所有理性公理（WARP、传递性等）都建立在这个最低限度的"封闭性"之上。

    ──────────────────────────────

    Now respond to the user's question, following the template exactly. Never invent facts beyond the passage or the prior notes.
    """

    /// Coarse script-family detector for the language-mirror rule.
    /// `.cjk` covers Chinese/Japanese/Korean Han/Kana glyphs; `.latin`
    /// covers ASCII-script European languages. We don't try to
    /// distinguish Simplified vs Traditional vs Japanese — the model
    /// handles that from the actual characters in the user's question.
    enum AskLanguage: String {
        case cjk
        case latin
        case unknown
    }
    static func detectAskLanguage(_ text: String) -> AskLanguage {
        var cjk = 0, latin = 0
        for scalar in text.unicodeScalars {
            let v = scalar.value
            if (0x4E00...0x9FFF).contains(v) ||      // CJK Unified
               (0x3400...0x4DBF).contains(v) ||      // CJK Ext A
               (0x3040...0x30FF).contains(v) ||      // Hiragana + Katakana
               (0xAC00...0xD7AF).contains(v) {       // Hangul
                cjk += 1
            } else if (UInt32(0x41)...UInt32(0x5A)).contains(v) ||
                      (UInt32(0x61)...UInt32(0x7A)).contains(v) {
                latin += 1
            }
        }
        if cjk == 0 && latin == 0 { return .unknown }
        if cjk >= max(2, latin / 2) { return .cjk }
        if latin > cjk { return .latin }
        return .unknown
    }
    /// Returns true when the user explicitly asks for a breakdown /
    /// detailed unpacking. Triggers a depth-floor in both the prompt
    /// and validator so the model can't get away with a one-liner.
    static func detectDepthRequest(_ text: String) -> Bool {
        let lower = text.lowercased()
        let cues = [
            "拆", "详细", "详解", "解释", "讲解", "讲讲", "细讲", "细说", "展开", "举例", "再具体",
            "unpack", "break down", "break it down", "in detail", "step by step", "elaborate", "walk me through", "explain in",
        ]
        return cues.contains(where: { lower.contains($0) })
    }

    static func buildAskPrompt(quote: String, history: [AskMessage], priorNotes: String? = nil) -> String {
        var s = ""
        if let priorNotes = priorNotes, !priorNotes.isEmpty {
            s += "PRIOR NOTES YOU'VE TAKEN ON THIS DOCUMENT (chronological):\n"
            s += priorNotes
            s += "\n\n---\n\n"
        }
        s += "CURRENT PASSAGE:\n\"\"\"\n\(quote)\n\"\"\"\n\n"
        s += "CONVERSATION SO FAR:\n"
        for msg in history {
            let role = msg.role == .user ? "User" : "Assistant"
            s += "\(role): \(msg.text)\n\n"
        }

        // Find the user's latest message and bake hard end-position
        // directives off it. Small models reliably ignore rules buried
        // in a long system prompt but follow the LAST instruction in
        // the user-side prompt — so language and depth go HERE, not
        // (only) in the system prompt.
        let lastUserText = history.reversed().first(where: { $0.role == .user })?.text ?? ""
        let lang = detectAskLanguage(lastUserText)
        let wantsDepth = detectDepthRequest(lastUserText)

        s += "Respond as Assistant to the latest User message.\n"
        switch lang {
        case .cjk:
            s += "\nCRITICAL: 用中文回复。整个回复必须是中文。技术符号（如 X、c(A)、𝒜、⊆）保持原样。不要用英文写句子。\n"
        case .latin:
            s += "\nCRITICAL: Reply in English. The entire reply must be in English.\n"
        case .unknown:
            break
        }
        if wantsDepth {
            switch lang {
            case .cjk:
                s += "\n用户明确要求拆细/详细讲解。→ 行后面必须给出 4–6 句具体展开：逐个解释符号的含义、给出最小例子、指出隐含假设。不要只写一句话就停。\n"
            default:
                s += "\nThe user explicitly asked for a detailed breakdown. After the → line, give 4–6 sentences: define each symbol, give a minimal concrete example, name the hidden assumption. Do NOT stop after one sentence.\n"
            }
        }
        return s
    }

    /// Read the parent root's Loom.md and extract the per-book
    /// section that holds notes for THIS PDF (matched by displayName).
    /// Returns the section's body trimmed for AI consumption — strips
    /// jump-link lines (irrelevant to LLM) and caps to the most
    /// recent N entries to stay within reasonable context budgets.
    /// Returns nil when no parent file exists or no per-book section
    /// found.
    private func gatherPriorNotesFromPage() -> String? {
        guard let parentID = parentRootID else { return nil }
        let parentMD = LoomFileStore.loomMDURL(for: parentID)
        guard let source = try? String(contentsOf: parentMD, encoding: .utf8) else { return nil }
        let lines = source.components(separatedBy: "\n")

        // Find the per-book section. Heading is `## <displayName>` or
        // `## [<displayName>](<url>)`. Match by extracted name.
        var sectionStart = -1
        for (i, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("## "), !trimmed.hasPrefix("### ") else { continue }
            let head = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            let extracted: String = {
                if head.hasPrefix("["), let close = head.range(of: "](") {
                    return String(head[head.index(after: head.startIndex)..<close.lowerBound])
                }
                return head
            }()
            if extracted == displayName {
                sectionStart = i; break
            }
        }
        guard sectionStart >= 0 else { return nil }

        // Find section end (next `## ` or EOF).
        var sectionEnd = lines.count
        for i in (sectionStart + 1)..<lines.count {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                sectionEnd = i; break
            }
        }

        // Strip jump-link lines (no value to AI), keep eyebrow + quote
        // + body. Trim leading/trailing blanks.
        let raw = Array(lines[(sectionStart + 1)..<sectionEnd])
        let cleaned = raw.filter { line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            return !trimmed.contains("loom://anchor") && !trimmed.hasPrefix("[📍")
        }
        var body = cleaned.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if body.isEmpty { return nil }

        // Cap context size — a busy page can blow the model's window.
        // 8000 chars ≈ ~2000 tokens, leaves room for passage + chat.
        let cap = 8000
        if body.count > cap {
            // Keep the tail (most recent entries are most relevant).
            let startIdx = body.index(body.endIndex, offsetBy: -cap)
            body = "[…earlier notes truncated…]\n" + String(body[startIdx...])
        }
        return body
    }

    private func anchorURL(for info: (pageIndex: Int, rect: CGRect, text: String)) -> String {
        // `src` carries the full source loom:// URL so the parent can
        // navigate directly back to this PDF without name-based search.
        let srcComponent = loomURL.absoluteString
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? loomURL.absoluteString
        let rectStr = String(
            format: "%.1f,%.1f,%.1f,%.1f",
            info.rect.minX, info.rect.minY, info.rect.width, info.rect.height
        )
        let excerpt = String(info.text.prefix(80))
        let textComponent = excerpt
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? excerpt
        return "loom://anchor?src=\(srcComponent)&page=\(info.pageIndex)&rect=\(rectStr)&text=\(textComponent)"
    }

    private func appendUnderThreads(entry: String, file: String, to source: String) -> String {
        Self.addEntryToBook(body: entry, file: file, sourceURL: loomURL, in: source)
    }

    /// Insert `body` at the end of the `## <file>` section, healing
    /// the file structure on the way in (folds legacy `## Notes` /
    /// `## Threads` / `## Pursuits` content into per-book sections).
    /// Creates the section when missing. Notes, threads, and pursuit
    /// back-links all share this single insertion path.
    private static func addEntryToBook(
        body: String,
        file: String,
        sourceURL: URL?,
        in source: String
    ) -> String {
        let healed = restructure(source: source, sourceURL: sourceURL)
        var lines = healed.components(separatedBy: "\n")

        // Find `## <file>` (with or without an embedded link).
        var sectionStart = -1
        for (i, line) in lines.enumerated() {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("## "), !trimmed.hasPrefix("### ") else { continue }
            let head = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            let extracted: String = {
                if head.hasPrefix("["), let close = head.range(of: "](") {
                    return String(head[head.index(after: head.startIndex)..<close.lowerBound])
                }
                return head
            }()
            if extracted == file {
                sectionStart = i
                break
            }
        }

        if sectionStart < 0 {
            // Create the per-file section at the end.
            if !lines.isEmpty && lines.last?.isEmpty == false { lines.append("") }
            lines.append("")
            let heading: String = {
                if let sourceURL = sourceURL {
                    return "## [\(file)](\(sourceURL.absoluteString))"
                }
                return "## \(file)"
            }()
            lines.append(heading)
            lines.append("")
            lines.append(contentsOf: body.components(separatedBy: "\n"))
            lines.append("")
            return lines.joined(separator: "\n")
        }

        // Locate end of the section (next `## ` or EOF).
        var sectionEnd = lines.count
        for i in (sectionStart + 1)..<lines.count {
            let trimmed = lines[i].trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                sectionEnd = i
                break
            }
        }
        var insertAt = sectionEnd
        while insertAt > sectionStart + 1
            && lines[insertAt - 1].trimmingCharacters(in: .whitespaces).isEmpty {
            insertAt -= 1
        }
        let entryLines = body.components(separatedBy: "\n")
        lines.insert(contentsOf: [""] + entryLines + [""], at: insertAt)
        return lines.joined(separator: "\n")
    }

    /// Extract the visible filename from a `### name` or
    /// `### [name](url)` heading line. Returns nil for non-h3 lines.
    private static func extractedFileName(from line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("### ") else { return nil }
        let body = String(trimmed.dropFirst(4)).trimmingCharacters(in: .whitespaces)
        if body.hasPrefix("["), let close = body.range(of: "](") {
            let name = body[body.index(after: body.startIndex)..<close.lowerBound]
            return String(name)
        }
        return body
    }

    /// Public entry point so other surfaces (LoomFolderHomeView's
    /// reload path, future maintenance tools) can run the same heal
    /// pass on a Loom.md without going through a save.
    static func healLoomMD(_ source: String) -> String {
        restructure(source: source, sourceURL: nil)
    }

    // MARK: - Promote inline note → standalone page

    /// Promote an inline note (a slice of markdown from the parent
    /// page) into a brand new top-level page. The new page is seeded
    /// with the note's content; the inline slice in the parent is
    /// replaced with a single-line `→ <Title>` link to the new page.
    ///
    /// Returns the new page's `loom://content/<uuid>` URL on success,
    /// or nil on failure. The parent's Loom.md is rewritten on disk.
    static func promoteInlineNote(
        sliceText: String,
        title: String,
        parentMDURL: URL,
        parentMDSource: String,
        parentName: String?
    ) -> URL? {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanTitle.isEmpty else { return nil }
        guard let newPage = ContentRootStore.addPage(displayName: cleanTitle) else { return nil }

        // Seed the new page with the note's content + a back-link to
        // the parent at top so the user knows where this thought
        // came from.
        let newPageMD = LoomFileStore.loomMDURL(for: newPage.id)
        let parentURL = "loom://content/\(parentMDURL.deletingLastPathComponent().lastPathComponent)"
        let backLink: String
        if let parentName = parentName {
            backLink = "*from [\(parentName)](\(parentURL))*"
        } else {
            backLink = "*from [parent page](\(parentURL))*"
        }
        let seed = "\(backLink)\n\n\(sliceText.trimmingCharacters(in: .whitespacesAndNewlines))\n"
        do {
            try FileManager.default.createDirectory(
                at: newPageMD.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try seed.write(to: newPageMD, atomically: true, encoding: .utf8)
        } catch {
            ContentRootStore.remove(id: newPage.id)
            return nil
        }

        // Replace the inline slice in the parent's Loom.md with a
        // one-line link.
        let subURL = "loom://content/\(newPage.id.uuidString.lowercased())"
        let replacement = "→ [\(cleanTitle)](\(subURL))"
        guard let updated = replaceSlice(
            slice: sliceText,
            with: replacement,
            in: parentMDSource
        ) else {
            // If we can't find the slice, leave the parent unchanged
            // — the new page exists either way and the user can still
            // navigate to it.
            return URL(string: subURL)
        }
        try? updated.write(to: parentMDURL, atomically: true, encoding: .utf8)
        return URL(string: subURL)
    }

    /// Find `slice` in `source` (matching by trimmed line equality so
    /// minor whitespace drift doesn't defeat the match) and replace
    /// it with `replacement`. Returns the new source on success.
    private static func replaceSlice(slice: String, with replacement: String, in source: String) -> String? {
        let sourceLines = source.components(separatedBy: "\n")
        let sliceLines = slice
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !sliceLines.isEmpty else { return nil }
        let sourceTrimmed = sourceLines.map { $0.trimmingCharacters(in: .whitespaces) }
        // Find the first line of the slice; check the rest in order.
        var i = 0
        while i < sourceTrimmed.count {
            if sourceTrimmed[i] == sliceLines[0] {
                var j = 0
                var k = i
                var matched = true
                while j < sliceLines.count, k < sourceTrimmed.count {
                    if sourceTrimmed[k].isEmpty { k += 1; continue }
                    if sourceTrimmed[k] != sliceLines[j] { matched = false; break }
                    j += 1; k += 1
                }
                if matched && j == sliceLines.count {
                    var rebuilt = Array(sourceLines.prefix(i))
                    rebuilt.append(replacement)
                    rebuilt.append(contentsOf: sourceLines.suffix(from: k))
                    return rebuilt.joined(separator: "\n")
                }
            }
            i += 1
        }
        return nil
    }

    struct ParsedEntry {
        var file: String
        /// Body lines below the h3, including any pre-existing meta
        /// line (like the legacy heading split into `*p.N · ts*`).
        var body: [String]
    }

    struct ParsedSection {
        var title: String?  // nil = pre-section prelude
        var preamble: [String] = []  // non-h3 content (e.g. Pursuits list items)
        var entries: [ParsedEntry] = []
    }

    /// Read the markdown into a structured form, then re-emit it with
    /// **everything related to a single source clustered under one
    /// `## <filename>` section** — notes, AI threads, and pursuit
    /// back-links all live together. The user's mental model is
    /// "what have I done with this book?", not "what are all my notes
    /// across all books?".
    ///
    /// The Resources section (auto-folder listing) is preserved up
    /// top. Free-form notes with no source still land in a `## Notes`
    /// section.
    private static func restructure(source: String, sourceURL: URL?) -> String {
        let lines = source.components(separatedBy: "\n")
        var sections: [ParsedSection] = [ParsedSection(title: nil)]
        var currentEntry: ParsedEntry? = nil

        func flushEntry() {
            guard let e = currentEntry else { return }
            sections[sections.count - 1].entries.append(e)
            currentEntry = nil
        }

        for raw in lines {
            let trimmed = raw.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("## ") && !trimmed.hasPrefix("### ") {
                flushEntry()
                sections.append(ParsedSection(title: trimmed))
                continue
            }
            if trimmed.hasPrefix("### ") {
                flushEntry()
                let body = String(trimmed.dropFirst(4)).trimmingCharacters(in: .whitespaces)
                let file: String
                var initialBody: [String] = []
                if let parsed = parseLegacyEntryHeadingShared(body) {
                    file = parsed.file
                    initialBody.append("*p.\(parsed.page) · \(parsed.timestamp)*")
                } else if body.hasPrefix("["), let close = body.range(of: "](") {
                    file = String(body[body.index(after: body.startIndex)..<close.lowerBound])
                } else {
                    file = body
                }
                currentEntry = ParsedEntry(file: file, body: initialBody)
                continue
            }
            if currentEntry != nil {
                currentEntry!.body.append(raw)
            } else {
                sections[sections.count - 1].preamble.append(raw)
            }
        }
        flushEntry()

        // ── Categorize content ──────────────────────────────────────
        // Per-file "books": filename → ordered body lines
        var bookOrder: [String] = []
        var books: [String: [String]] = [:]

        // Auxiliary buckets
        var resourcesPreamble: [String] = []
        var freeFormNotes: [String] = []
        var prelude: [String] = []
        var unknownSections: [ParsedSection] = []

        func append(toFile file: String, lines: [String]) {
            let trimmed = trimmedTrailing(lines)
            guard !trimmed.isEmpty else { return }
            if books[file] == nil {
                books[file] = []
                bookOrder.append(file)
            }
            if !books[file]!.isEmpty { books[file]!.append("") }
            books[file]!.append(contentsOf: trimmed)
        }

        for sec in sections {
            switch sec.title {
            case nil:
                // Pre-section content. Entries here are orphans → route
                // to their book; any non-entry preamble stays as page
                // prelude.
                prelude.append(contentsOf: sec.preamble)
                for entry in sec.entries {
                    append(toFile: entry.file, lines: entry.body)
                }
            case "## Resources":
                // Folder listing. Preserved as-is at top of page.
                resourcesPreamble = sec.preamble
                for entry in sec.entries {
                    append(toFile: entry.file, lines: entry.body)
                }
            case "## Notes":
                for entry in sec.entries {
                    append(toFile: entry.file, lines: entry.body)
                }
                // Pursuit list items can end up here when a previous
                // heal mistakenly routed them to free-form. Catch them
                // and re-route to their per-book section.
                for line in sec.preamble {
                    let trimmedLine = line.trimmingCharacters(in: .whitespaces)
                    if let (file, normalized) = parsePursuitLine(trimmedLine) {
                        append(toFile: file, lines: [normalized])
                    } else {
                        freeFormNotes.append(line)
                    }
                }
            case "## Threads":
                for entry in sec.entries {
                    append(toFile: entry.file, lines: entry.body)
                }
                freeFormNotes.append(contentsOf: sec.preamble)
            case "## Pursuits":
                // Pursuits are list lines like
                //   `- [→ title](sub-url)  ·  filename.pdf p3`
                // Route each to the book named in the metadata tail.
                for line in sec.preamble {
                    let trimmedLine = line.trimmingCharacters(in: .whitespaces)
                    if let (file, normalized) = parsePursuitLine(trimmedLine) {
                        append(toFile: file, lines: [normalized])
                    } else if !trimmedLine.isEmpty {
                        // Preserve unrecognized lines as free-form
                        freeFormNotes.append(line)
                    }
                }
                for entry in sec.entries {
                    append(toFile: entry.file, lines: entry.body)
                }
            default:
                // Unknown user-authored section — preserve verbatim.
                unknownSections.append(sec)
            }
        }

        // Single-book pages: there's no ambiguity, so fold any
        // free-form Notes content into that book's section. The
        // user's mental model on a one-book page is "everything I've
        // done with this thing", not "this thing + a separate Notes
        // bucket".
        if bookOrder.count == 1 {
            let onlyBook = bookOrder[0]
            let trimmedFreeForm = trimmedTrailing(freeFormNotes)
            if !trimmedFreeForm.isEmpty, var bookBody = books[onlyBook] {
                if !bookBody.isEmpty { bookBody.append("") }
                bookBody.append(contentsOf: trimmedFreeForm)
                books[onlyBook] = bookBody
                freeFormNotes = []
            }
        }

        // ── Re-emit ────────────────────────────────────────────────
        var out: [String] = []
        for line in trimmedTrailing(prelude) { out.append(line) }

        if !resourcesPreamble.isEmpty {
            if !out.isEmpty && out.last?.isEmpty == false { out.append("") }
            out.append("## Resources")
            out.append("")
            for line in trimmedTrailing(resourcesPreamble) { out.append(line) }
        }

        for file in bookOrder {
            guard let body = books[file], !body.isEmpty else { continue }
            if !out.isEmpty && out.last?.isEmpty == false { out.append("") }
            out.append("")
            // Heading is a clickable link when this is the file the
            // user is currently saving from (we know its source URL).
            let heading: String = {
                if let sourceURL = sourceURL,
                   matchesFile(sourceURL: sourceURL, file: file) {
                    return "## [\(file)](\(sourceURL.absoluteString))"
                }
                return "## \(file)"
            }()
            out.append(heading)
            out.append("")
            for line in trimmedTrailing(body) { out.append(line) }
        }

        let trimmedFreeForm = trimmedTrailing(freeFormNotes)
        if !trimmedFreeForm.isEmpty {
            if !out.isEmpty && out.last?.isEmpty == false { out.append("") }
            out.append("")
            out.append("## Notes")
            out.append("")
            for line in trimmedFreeForm { out.append(line) }
        }

        for sec in unknownSections {
            if !out.isEmpty && out.last?.isEmpty == false { out.append("") }
            out.append("")
            if let title = sec.title { out.append(title); out.append("") }
            for line in trimmedTrailing(sec.preamble) { out.append(line) }
            for entry in sec.entries {
                out.append("### \(entry.file)")
                out.append("")
                for line in trimmedTrailing(entry.body) { out.append(line) }
                out.append("")
            }
        }
        return out.joined(separator: "\n")
    }

    /// Parse a Pursuits list item into (file, normalized line).
    /// Accepts the new format `- [→ title](url)  ·  filename.pdf p3`
    /// and the legacy long-tail format
    /// `- [→ title](url) — re: "..." · filename.pdf p3 · timestamp`.
    /// Returns nil if no filename can be extracted.
    private static func parsePursuitLine(_ line: String) -> (file: String, normalized: String)? {
        guard line.hasPrefix("- [→") || line.hasPrefix("- [\u{2192}") else { return nil }
        // Drop the long tail after ` — `, if any (legacy format).
        var head = line
        if let dash = head.range(of: " — ") {
            head = String(head[..<dash.lowerBound])
        }
        // Body after the link. Look for the metadata `· filename · ...`.
        // Find the substring "  ·  " or "·" to extract metadata.
        let separator = "  ·  "
        var fileName: String? = nil
        if let sep = line.range(of: separator) {
            // Tail like "Applied... p3" — split on " p" to drop page
            let tail = String(line[sep.upperBound...])
            if let pageMarker = tail.range(of: " p", options: .backwards) {
                fileName = String(tail[..<pageMarker.lowerBound]).trimmingCharacters(in: .whitespaces)
            } else {
                fileName = tail.trimmingCharacters(in: .whitespaces)
            }
        }
        guard let file = fileName, !file.isEmpty else { return nil }
        // Render as `→ [title](url)` only — file is implicit because
        // we're inside the per-file section.
        let normalizedHead: String = {
            // head currently `- [→ title](url)`. Drop leading `- ` to
            // make it a plain paragraph inside the book section.
            let dropped = head.hasPrefix("- ") ? String(head.dropFirst(2)) : head
            return dropped
        }()
        return (file, normalizedHead)
    }

    private static func matchesFile(sourceURL: URL, file: String) -> Bool {
        let last = sourceURL.lastPathComponent
        if last == file { return true }
        if let decoded = last.removingPercentEncoding, decoded == file { return true }
        return false
    }

    private static func trimmedTrailing(_ lines: [String]) -> [String] {
        var l = lines
        while let last = l.last, last.trimmingCharacters(in: .whitespaces).isEmpty {
            l.removeLast()
        }
        // Also trim leading blanks for cleanliness
        while let first = l.first, first.trimmingCharacters(in: .whitespaces).isEmpty {
            l.removeFirst()
        }
        return l
    }

    /// Shared with the renderer; same logic as `parseLegacyEntryHeading`
    /// in `LoomMarkdownView`. Kept private here for the save path.
    private static func parseLegacyEntryHeadingShared(_ text: String) -> (file: String, page: Int, timestamp: String)? {
        guard let pageMarker = text.range(of: ", page ") else { return nil }
        let file = String(text[..<pageMarker.lowerBound])
        let rest = text[pageMarker.upperBound...]
        guard let dash = rest.range(of: " — ") else { return nil }
        let pageStr = String(rest[..<dash.lowerBound])
        guard let page = Int(pageStr) else { return nil }
        let timestamp = String(rest[dash.upperBound...])
        return (file, page, timestamp)
    }

    // MARK: - Selection actions (right-click menu)

    /// Translation deliberately omitted: macOS already provides a
    /// "Translate…" item in the system right-click menu on any
    /// selected text via Services. Building our own would just
    /// duplicate it.

    /// UUID of the ContentRoot the current PDF lives under, derived
    /// from the `loom://content/<uuid>/...` URL.
    private var parentRootID: UUID? {
        guard loomURL.scheme == "loom", loomURL.host == "content" else { return nil }
        let segs = loomURL.path
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .split(separator: "/")
        guard let first = segs.first else { return nil }
        return UUID(uuidString: String(first))
    }

    private var parentRootName: String? {
        guard let id = parentRootID else { return nil }
        return ContentRootStore.loadAll().first(where: { $0.id == id })?.displayName
    }

    /// Build a markdown note entry for the captured PDF selection. The
    /// embedded `loom://anchor?...` URL carries page index, rect, and
    /// a text excerpt so the click-back can fall back to text search if
    /// the rect ever drifts (e.g. after the PDF is replaced).
    private func buildQuoteEntry(info: (pageIndex: Int, rect: CGRect, text: String)) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        let timestamp = formatter.string(from: Date())
        let pageDisplay = info.pageIndex + 1
        let quoted = Self.quoteLines(info.text)
        // No per-entry h3 anymore — the per-file h3 wrapping section
        // (added by `appendUnderNotes`) does that grouping. Each entry
        // is just an italic meta line + quote + jump link, so multiple
        // notes from the same PDF cluster cleanly under one heading.
        return """
        *p.\(pageDisplay) · \(timestamp)*
        \(quoted)

        [📍 Jump to passage](\(anchorURL(for: info)))
        """
    }

    /// Convert PDF selection text into clean blockquote markdown:
    /// trim trailing whitespace, drop trailing blank lines (PDFs often
    /// add several), and prefix each line with `> `.
    private static func quoteLines(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { "> \($0)" }
            .joined(separator: "\n")
    }

    /// Append a note entry directly into the per-book `## <file>`
    /// section. Notes, AI threads, and pursuit back-links all share
    /// one section per book — the whole "what I've done with this
    /// PDF" lives in one place, matching the user's mental model.
    private func appendUnderNotes(entry: String, file: String, to source: String) -> String {
        Self.addEntryToBook(body: entry, file: file, sourceURL: loomURL, in: source)
    }

    private func showToast(_ message: String) {
        toastTask?.cancel()
        withAnimation(.easeOut(duration: 0.15)) {
            toast = message
        }
        toastTask = Task {
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            await MainActor.run {
                withAnimation(.easeIn(duration: 0.25)) {
                    toast = nil
                }
            }
        }
    }

    private func resolve() async {
        let hostRoots = LoomRuntimePaths.resolveHostRoots()
        let contentRoots = ContentRootStore.allActiveURLs
        guard let resolved = LoomURLSchemeHandler.resolve(loomURL, hostRoots: hostRoots, contentRoots: contentRoots) else {
            await MainActor.run {
                resolvedURL = nil
                resolveError = "File not under the active content root."
            }
            return
        }
        guard FileManager.default.fileExists(atPath: resolved.path) else {
            await MainActor.run {
                resolvedURL = nil
                resolveError = "Missing on disk: \(resolved.path)"
            }
            return
        }
        await MainActor.run {
            resolvedURL = resolved
            resolveError = nil
        }
    }
}

/// Reference container for a `PDFView` so SwiftUI parent code can query
/// the live PDFKit instance (current selection, jump-to-page) without
/// relying on private NSViewRepresentable internals.
@MainActor
final class PDFViewHolder: ObservableObject {
    weak var pdfView: PDFView?

    /// Snapshot the current selection — page index (0-based), bounds in
    /// page coordinates, and the selected text — when the user has
    /// highlighted something in the PDF. Returns nil when no selection.
    func currentSelectionInfo() -> (pageIndex: Int, rect: CGRect, text: String)? {
        guard let view = pdfView, let selection = view.currentSelection,
              let page = selection.pages.first,
              let document = view.document else { return nil }
        let bounds = selection.bounds(for: page)
        guard !bounds.isEmpty else { return nil }
        let index = document.index(for: page)
        let text = selection.string ?? ""
        return (index, bounds, text)
    }

    /// Jump to a specific page + rect in the open PDF, used by the
    /// anchor links inside Loom.md note rendering.
    func go(toPage pageIndex: Int, rect: CGRect) {
        guard let view = pdfView, let document = view.document else { return }
        guard pageIndex >= 0, pageIndex < document.pageCount else { return }
        guard let page = document.page(at: pageIndex) else { return }
        // Center the rect in the visible viewport
        let dest = PDFDestination(page: page, at: NSPoint(x: rect.minX, y: rect.maxY))
        view.go(to: dest)
        // Re-create selection for visual highlight
        let selection = page.selection(for: rect)
        view.setCurrentSelection(selection, animate: true)
    }
}

private struct LoomPDFView: NSViewRepresentable {
    let fileURL: URL
    let holder: PDFViewHolder
    let onNote: () -> Void

    func makeNSView(context: Context) -> LoomPDFKitView {
        let view = LoomPDFKitView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        view.displayDirection = .vertical
        view.backgroundColor = NSColor.windowBackgroundColor
        view.onNote = onNote
        loadDocument(into: view, from: fileURL)
        DispatchQueue.main.async {
            holder.pdfView = view
        }
        return view
    }

    func updateNSView(_ nsView: LoomPDFKitView, context: Context) {
        nsView.onNote = onNote
        if nsView.document?.documentURL != fileURL {
            loadDocument(into: nsView, from: fileURL)
        }
        if holder.pdfView !== nsView {
            DispatchQueue.main.async {
                holder.pdfView = nsView
            }
        }
    }

    /// Load PDFDocument off the main thread. `PDFDocument(url:)` for a
    /// 30MB lecture PDF synchronously freezes the UI for several
    /// hundred ms, during which clicks register but produce no visible
    /// effect. Detached + main-thread hand-back keeps the rest of the
    /// app responsive while the document is still parsing.
    ///
    /// Critically: do NOT clear `view.document` before loading the
    /// new one. Clearing causes a visible blank flash for the few
    /// hundred ms the new doc takes to parse. Letting the old doc
    /// stay visible until the new one is ready makes file→file
    /// switches (and initial open transitions) smooth.
    private func loadDocument(into view: PDFView, from url: URL) {
        Task.detached(priority: .userInitiated) {
            let doc = PDFDocument(url: url)
            await MainActor.run {
                // The view may already be assigned a different fileURL
                // by the time this completes (rapid switches). Bail
                // quietly when the document we loaded is no longer the
                // one the view wants.
                guard view.window != nil || view.superview != nil else { return }
                view.document = doc
            }
        }
    }
}

/// PDFView subclass that injects Loom's reading actions into the
/// system right-click menu when the user has selected text. The
/// existing system items (Look Up, Translate, Search With…, Copy,
/// Share, Speech) remain untouched — Loom items are prepended so
/// everything lives in one stacked menu instead of scattered
/// shortcuts.
final class LoomPDFKitView: PDFView {
    var onNote: (() -> Void)?

    override func menu(for event: NSEvent) -> NSMenu? {
        let menu = super.menu(for: event) ?? NSMenu()
        guard currentSelection != nil else { return menu }
        if !menu.items.isEmpty {
            menu.insertItem(NSMenuItem.separator(), at: 0)
        }
        let item = NSMenuItem(
            title: "Note this passage…",
            action: #selector(loomNoteAction),
            keyEquivalent: ""
        )
        item.target = self
        menu.insertItem(item, at: 0)
        return menu
    }

    @objc private func loomNoteAction() { onNote?() }
}

private struct LoomQuickLookView: NSViewRepresentable {
    let fileURL: URL

    func makeNSView(context: Context) -> QLPreviewView {
        let view = QLPreviewView(frame: .zero, style: .normal) ?? QLPreviewView()
        view.previewItem = fileURL as QLPreviewItem
        view.autostarts = true
        return view
    }

    func updateNSView(_ nsView: QLPreviewView, context: Context) {
        nsView.previewItem = fileURL as QLPreviewItem
    }
}

extension Notification.Name {
    /// Posted by the parent toolbar's Note button. The active
    /// SourceFileView listens and triggers its existing startNote
    /// handler — Ask AI is reached from INSIDE the Note popover
    /// via the escape hatch (single primitive at the toolbar level).
    static let loomTriggerNote = Notification.Name("loomTriggerNote")
    /// Posted by `handleShuttleNavigate` when the sidebar emits a
    /// `loom://content/...` href for a source file. ContentView listens
    /// and swaps its main content area to `SourceFileView`.
    static let loomOpenSourceFile = Notification.Name("loomOpenSourceFile")
    /// Posted by `LoomMarkdownView` when the user clicks a
    /// `loom://anchor?doc=...&page=N&rect=x,y,w,h` link inside a note.
    /// ContentView resolves the doc within the current root, swaps to
    /// the source file viewer, and asks PDFViewHolder to scroll to
    /// the saved page+rect.
    static let loomJumpToPDFAnchor = Notification.Name("loomJumpToPDFAnchor")
    /// Posted by ContentView after a brief delay (so the new PDFView
    /// has time to mount + load) carrying the page index + rect to
    /// scroll to. SourceFileView listens and routes via PDFViewHolder.
    static let loomApplyPDFAnchor = Notification.Name("loomApplyPDFAnchor")
}

/// SwiftUI wrapper around NSTextView that maps plain Return → submit
/// (chat-app pattern). Shift+Return / Option+Return inserts a real
/// newline. Used by the Ask AI input where ⌘↩ alone wasn't intuitive
/// enough — the user expected Enter to send.
struct ChatTextEditor: NSViewRepresentable {
    @Binding var text: String
    var focused: FocusState<Bool>.Binding
    let onSubmit: () -> Void

    func makeNSView(context: Context) -> NSScrollView {
        let textView = SubmitOnReturnTextView()
        textView.delegate = context.coordinator
        textView.onSubmit = onSubmit
        textView.font = .systemFont(ofSize: 13)
        textView.textColor = NSColor.labelColor
        textView.isRichText = false
        textView.allowsUndo = true
        textView.drawsBackground = false
        textView.isAutomaticQuoteSubstitutionEnabled = false
        textView.isAutomaticDashSubstitutionEnabled = false
        textView.isAutomaticTextReplacementEnabled = false
        textView.string = text

        let scroll = NSScrollView()
        scroll.documentView = textView
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.borderType = .noBorder
        scroll.autohidesScrollers = true
        return scroll
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {
        guard let textView = nsView.documentView as? SubmitOnReturnTextView else { return }
        if textView.string != text {
            textView.string = text
        }
        textView.onSubmit = onSubmit
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: ChatTextEditor
        init(_ parent: ChatTextEditor) {
            self.parent = parent
        }
        func textDidChange(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }
            parent.text = textView.string
        }
    }
}

final class SubmitOnReturnTextView: NSTextView {
    var onSubmit: (() -> Void)?

    override func keyDown(with event: NSEvent) {
        // keyCode 36 = Return. Plain Return → submit. Shift / Option /
        // Control / Command modifiers → fall through to default
        // (insert newline, etc.).
        if event.keyCode == 36 {
            let mods = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            if mods.isEmpty {
                onSubmit?()
                return
            }
            // Shift+Return inserts a literal newline, matching chat
            // app convention.
            if mods == .shift {
                insertNewline(self)
                return
            }
        }
        super.keyDown(with: event)
    }
}
