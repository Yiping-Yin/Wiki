import SwiftUI

/// Right-edge AI strip + slide-out panel.
///
/// **Closed state**: a thin bronze (`LoomTokens.thread`) vertical bar
/// sitting at the right edge of the detail column. ~6pt wide, vertically
/// centered, ~120pt tall. Hover lights up the tint a notch. Click to
/// open.
///
/// **Open state**: a 380pt panel slides in from the right. Inside:
///   1. Top context strip — breadcrumb of current location (root /
///      sub-folder / doc), click-able to jump back
///   2. Chat history — scrollable column of user/AI messages
///   3. Input — multiline TextEditor at the bottom + send button
///
/// Per the design discussion: the bar is the *only* AI invocation point
/// for heavy tasks. Inline lookups still go through ⌘E Interlace; the
/// manual `+ Add note` path stays out of AI. This view is the heavy-AI
/// surface only.
struct LoomAIBar: View {
    @Binding var isOpen: Bool
    /// Current location context resolved from the detail column. Used
    /// to populate the breadcrumb and (Phase B4) the AI system prompt.
    let context: LoomAIContext
    /// Conversation history persisted across opens within a session.
    @Binding var messages: [LoomAIMessage]
    /// Pending user input.
    @Binding var draft: String
    /// True while a request is in flight.
    @Binding var isThinking: Bool
    /// Called when user presses send. Caller dispatches the AI request
    /// (so the view stays storage/transport-agnostic).
    var onSend: () -> Void
    /// Save an AI message as a note appended to the current folder's
    /// Loom.md `## Notes` section. Caller resolves the right file from
    /// `context` and writes.
    var onSaveAsNote: (LoomAIMessage) -> Void
    /// Save an AI message as the description (replaces the part before
    /// `## Notes` in Loom.md). Caller resolves the right file from
    /// `context` and writes.
    var onSaveAsDescription: (LoomAIMessage) -> Void

    var body: some View {
        ZStack(alignment: .trailing) {
            if isOpen {
                panel
                    .frame(width: 380)
                    .transition(.move(edge: .trailing).combined(with: .opacity))
            }
            handle
                .padding(.trailing, isOpen ? 380 : 0)
        }
        .animation(.easeOut(duration: 0.32), value: isOpen)
    }

    // MARK: - Handle (closed-state bar)

    @ViewBuilder
    private var handle: some View {
        Button(action: { isOpen.toggle() }) {
            Capsule()
                .fill(LoomTokens.thread.opacity(isOpen ? 0.7 : 0.35))
                .frame(width: 6, height: 120)
                .padding(.trailing, 4)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(isOpen ? "Close AI" : "Ask AI")
    }

    // MARK: - Panel

    @ViewBuilder
    private var panel: some View {
        VStack(spacing: 0) {
            contextStrip
            Divider()
            chatHistory
            Divider()
            inputArea
        }
        .background(.regularMaterial)
        .overlay(alignment: .topLeading) {
            Rectangle()
                .fill(LoomTokens.hair)
                .frame(width: 1)
        }
    }

    @ViewBuilder
    private var contextStrip: some View {
        HStack(spacing: 6) {
            Text(context.breadcrumb)
                .font(.system(size: 11, design: .serif))
                .italic()
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Button(action: { isOpen = false }) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .medium))
            }
            .buttonStyle(.plain)
            .help("Close")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    @ViewBuilder
    private var chatHistory: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    if messages.isEmpty {
                        Text("Paste raw material, ask a question, or describe a task. The bar talks to your active AI provider.")
                            .font(.system(size: 11))
                            .foregroundStyle(.secondary)
                            .padding(.top, 6)
                    }
                    ForEach(messages) { msg in
                        messageRow(msg)
                            .id(msg.id)
                    }
                    if isThinking {
                        HStack(spacing: 6) {
                            ProgressView()
                                .controlSize(.small)
                            Text("Thinking…")
                                .font(.system(size: 11))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .onChange(of: messages.count) { _, _ in
                if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
            }
        }
    }

    @ViewBuilder
    private func messageRow(_ msg: LoomAIMessage) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(msg.role == .user ? "You" : "AI")
                .font(.system(size: 9, weight: .semibold))
                .textCase(.uppercase)
                .kerning(1.0)
                .foregroundStyle(.secondary)
            Text(msg.content)
                .font(.system(size: 13))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
            if msg.role == .ai && context.contentURL != nil && !msg.content.hasPrefix("[error]") {
                HStack(spacing: 6) {
                    Button("Save as note") { onSaveAsNote(msg) }
                        .controlSize(.small)
                    Button("Save as description") { onSaveAsDescription(msg) }
                        .controlSize(.small)
                }
                .padding(.top, 4)
            }
        }
        .padding(8)
        .background(msg.role == .user ? Color.secondary.opacity(0.06) : Color.clear)
        .cornerRadius(6)
    }

    @ViewBuilder
    private var inputArea: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextEditor(text: $draft)
                .font(.system(size: 13))
                .frame(minHeight: 60, maxHeight: 140)
            HStack(spacing: 8) {
                Spacer()
                Button(action: onSend) {
                    Text("Send")
                        .font(.system(size: 11, weight: .medium))
                }
                .keyboardShortcut(.return, modifiers: .command)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isThinking)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
    }
}

// MARK: - Models

struct LoomAIMessage: Identifiable, Hashable {
    enum Role { case user, ai }
    let id: UUID
    let role: Role
    let content: String
    let createdAt: Date

    init(role: Role, content: String) {
        self.id = UUID()
        self.role = role
        self.content = content
        self.createdAt = Date()
    }
}

/// Snapshot of where the user is when the bar is invoked. Used for the
/// context breadcrumb display and (Phase B4) for ancestor-Loom.md
/// system-prompt injection.
struct LoomAIContext: Hashable {
    /// Human-readable breadcrumb ("FINS3646 › Week 1 › Async 1.1.pdf").
    let breadcrumb: String
    /// loom://content/<root-id>/<path> URL for the current location.
    /// Nil when the user is on a non-content surface (Home, Settings).
    let contentURL: URL?
    /// Resolved file URL for the current location, when it maps to disk.
    let resolvedFileURL: URL?

    static let empty = LoomAIContext(breadcrumb: "Loom", contentURL: nil, resolvedFileURL: nil)
}
