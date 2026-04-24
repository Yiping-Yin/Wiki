import SwiftUI
import AppKit

/// First-launch wizard: two-step onboarding that picks the AI provider and
/// then the content folder. Shown by `ContentView` via `.sheet(isPresented:)`
/// when `firstRunShouldPrompt` is true. Dismissing marks
/// `loom.ai.firstRunPromptSeen` in UserDefaults so it never reappears.
///
/// The content-folder step is not strictly required (users can skip and pick
/// later in Settings → Data), but surfacing it here means most new users land
/// on a populated Home on their very first session instead of an empty shell.
///
/// Vellum styled: paper background, Cormorant-italic header, hair borders,
/// thread accent for selection/focus. No system-blue leaks — every accent
/// goes through `LoomTokens.thread`.
struct FirstRunProviderSheet: View {
    @Binding var isPresented: Bool
    @AppStorage("loom.ai.provider") private var providerRaw: String = AIProviderKind.anthropic.rawValue
    @AppStorage("loom.ai.firstRunPromptSeen") private var seen: Bool = false
    @State private var step: Step
    @State private var chosenFolderPath: String?
    @State private var anthropicKey: String = ""
    @State private var openAIKey: String = ""
    @State private var keyState: KeyState = .idle

    enum KeyState: Equatable { case idle, saved, failed(String) }

    init(isPresented: Binding<Bool>) {
        self._isPresented = isPresented
        self._step = State(initialValue: Self.initialStep())
        self._chosenFolderPath = State(initialValue: SecurityScopedFolderStore.resolve()?.url.path)
    }

    enum Step { case provider, folder }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch step {
            case .provider: providerStep
            case .folder:   folderStep
            }
        }
        .padding(28)
        .frame(width: 480)
        .background(LoomTokens.paper)
        .tint(LoomTokens.thread)
    }

    private var providerStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            header(
                eyebrow: "Frontispiece · i of ii",
                title: "The second voice.",
                subtitle: "Loom works alongside you with a second weaver in the margin. Your key or CLI stays on your Mac; Loom never relays it."
            )

            VStack(alignment: .leading, spacing: 0) {
                let readyKinds = AIProviderKind.allCases.filter { $0.isReady }
                ForEach(readyKinds) { kind in
                    ProviderRow(kind: kind, isSelected: providerRaw == kind.rawValue) {
                        providerRaw = kind.rawValue
                    }
                    if kind != readyKinds.last {
                        Divider()
                            .overlay(LoomTokens.hair)
                            .padding(.leading, 32)
                    }
                }
            }
            .padding(.vertical, 4)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(LoomTokens.hair, lineWidth: 0.5)
            )

            // #22 — inline key entry so the learner doesn't have to
            // navigate to Settings to finish onboarding. Only the two
            // HTTPS providers (Anthropic / OpenAI) need a key; CLI /
            // Ollama / Custom / Disabled skip this step. Saved directly
            // to Keychain via KeychainStore on "Continue".
            if providerRaw == AIProviderKind.anthropic.rawValue {
                inlineKeyField(
                    placeholder: "sk-ant-…",
                    text: $anthropicKey,
                    footer: "Kept in the macOS Keychain. Only Loom reads it."
                )
            } else if providerRaw == AIProviderKind.openai.rawValue {
                inlineKeyField(
                    placeholder: "sk-…",
                    text: $openAIKey,
                    footer: "Kept in the macOS Keychain. Only Loom reads it."
                )
            }

            if case .failed(let msg) = keyState {
                Label(msg, systemImage: "exclamationmark.triangle")
                    .font(LoomTokens.serif(size: 11, italic: true))
                    .foregroundStyle(LoomTokens.rose)
            }

            HStack {
                stepDots(current: 0)
                Spacer()
                VellumTextButton("Skip for now") { dismissSeen() }
                    .keyboardShortcut(.escape, modifiers: [])
                VellumPrimaryButton("Continue") {
                    if commitKeyIfNeeded() {
                        step = .folder
                    }
                }
                .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 4)
        }
    }

    @ViewBuilder
    private func inlineKeyField(placeholder: String, text: Binding<String>, footer: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            SecureField(placeholder, text: text)
                .textFieldStyle(.plain)
                .font(LoomTokens.serif(size: 13))
                .foregroundStyle(LoomTokens.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(LoomTokens.paperDeep.opacity(0.45))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(LoomTokens.hair, lineWidth: 0.5)
                )
                .autocorrectionDisabled()
            Text(footer)
                .font(LoomTokens.serif(size: 11, italic: true))
                .foregroundStyle(LoomTokens.muted)
        }
    }

    /// Writes the typed key to Keychain if the current provider needs
    /// one. Returns true if the step can advance. Allows advancing with
    /// empty field (user can fill later in Settings) to stay non-blocking.
    private func commitKeyIfNeeded() -> Bool {
        func save(_ value: String, account: String) -> Bool {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return true }
            do {
                try KeychainStore.writeString(trimmed, account: account)
                keyState = .saved
                return true
            } catch {
                keyState = .failed("Couldn't save to Keychain: \(error.localizedDescription)")
                return false
            }
        }
        switch providerRaw {
        case AIProviderKind.anthropic.rawValue:
            return save(anthropicKey, account: KeychainAccount.anthropicAPIKey)
        case AIProviderKind.openai.rawValue:
            return save(openAIKey, account: KeychainAccount.openAIAPIKey)
        default:
            return true
        }
    }

    private var folderStep: some View {
        VStack(alignment: .leading, spacing: 16) {
            header(
                eyebrow: "Frontispiece · ii of ii",
                title: "A room for your books.",
                subtitle: "Loom reads the Markdown, MDX, and PDF files already in this folder. Nothing is uploaded — the path stays on your Mac."
            )

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    Image(systemName: "folder")
                        .foregroundStyle(LoomTokens.muted)
                        .frame(width: 20)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(chosenFolderPath.map { ($0 as NSString).lastPathComponent } ?? "No folder chosen yet")
                            .font(LoomTokens.display(size: 15, italic: true, weight: .regular))
                            .foregroundStyle(LoomTokens.ink)
                            .lineLimit(1)
                            .truncationMode(.middle)
                        Text(chosenFolderPath ?? "Pick one now, or set it later in Settings.")
                            .font(LoomTokens.serif(size: 11, italic: true))
                            .foregroundStyle(LoomTokens.muted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    Spacer(minLength: 0)
                    VellumTextButton(chosenFolderPath == nil ? "Choose folder…" : "Change…") {
                        pickFolder()
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(LoomTokens.hair, lineWidth: 0.5)
                )

                Text("You can change this any time in Settings → Data (⌘,).")
                    .font(LoomTokens.serif(size: 11, italic: true))
                    .foregroundStyle(LoomTokens.muted)
            }

            HStack {
                stepDots(current: 1)
                Spacer()
                VellumTextButton("Back") { step = .provider }
                VellumPrimaryButton(chosenFolderPath == nil ? "Skip for now" : "Done") { dismissSeen() }
                    .keyboardShortcut(.defaultAction)
            }
            .padding(.top, 4)
        }
    }

    private func header(eyebrow: String, title: String, subtitle: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased())
                .font(.system(size: 9.5, weight: .medium))
                .tracking(3.2)
                .foregroundStyle(LoomTokens.muted)
            Text(title)
                .font(LoomTokens.display(size: 24, italic: true, weight: .regular))
                .foregroundStyle(LoomTokens.ink)
            Text(subtitle)
                .font(LoomTokens.serif(size: 13, italic: true))
                .foregroundStyle(LoomTokens.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(2)
        }
        .padding(.bottom, 4)
    }

    private func stepDots(current: Int) -> some View {
        HStack(spacing: 6) {
            ForEach(0..<2, id: \.self) { index in
                Circle()
                    .fill(index == current ? LoomTokens.thread : LoomTokens.hair)
                    .frame(width: 6, height: 6)
            }
        }
    }

    private func pickFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose Folder"
        panel.title = "Select your study folder"
        panel.message = "Loom will read files in this folder. Nothing is uploaded."
        guard panel.runModal() == .OK, let url = panel.url else { return }
        guard SecurityScopedFolderStore.saveAndActivate(url) else { return }
        chosenFolderPath = url.path
        NotificationCenter.default.post(name: .loomContentRootChanged, object: nil)
    }

    private func dismissSeen() {
        seen = true
        isPresented = false
    }
}

private struct ProviderRow: View {
    let kind: AIProviderKind
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: kind.systemImage)
                    .foregroundStyle(isSelected ? LoomTokens.thread : LoomTokens.muted)
                    .frame(width: 20)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 3) {
                    Text(kind.label)
                        .font(LoomTokens.display(size: 14, italic: false, weight: .medium))
                        .foregroundStyle(LoomTokens.ink)
                    Text(kind.footerBlurb)
                        .font(LoomTokens.serif(size: 11, italic: true))
                        .foregroundStyle(LoomTokens.ink3)
                        .lineLimit(2)
                        .truncationMode(.tail)
                }
                Spacer(minLength: 0)
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(LoomTokens.thread)
                        .font(.system(size: 11, weight: .bold))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(isSelected ? LoomTokens.thread.opacity(0.10) : Color.clear)
    }
}

/// Cormorant-italic paper-bordered primary button, matching the mockup
/// "Open the first book →" affordance. Replaces `.borderedProminent`
/// so no iOS-blue leaks through on first launch.
private struct VellumPrimaryButton: View {
    let label: String
    let action: () -> Void

    init(_ label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    @State private var hover = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(LoomTokens.display(size: 14, italic: true, weight: .regular))
                .tracking(0.2)
                .foregroundStyle(LoomTokens.ink)
                .padding(.horizontal, 20)
                .padding(.vertical, 9)
                .background(hover ? LoomTokens.thread.opacity(0.08) : Color.clear)
                .overlay(
                    Rectangle()
                        .stroke(LoomTokens.ink, lineWidth: 0.5)
                )
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

/// Quiet italic text button for secondary / cancel actions. No border,
/// underline on hover — matches the `LiteraryAction` pattern used by
/// HomeClient on the web side.
private struct VellumTextButton: View {
    let label: String
    let action: () -> Void

    init(_ label: String, action: @escaping () -> Void) {
        self.label = label
        self.action = action
    }

    @State private var hover = false

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(LoomTokens.serif(size: 13, italic: true))
                .foregroundStyle(hover ? LoomTokens.ink : LoomTokens.ink3)
                .underline(hover, color: LoomTokens.thread)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
        }
        .buttonStyle(.plain)
        .onHover { hover = $0 }
    }
}

extension FirstRunProviderSheet {
    fileprivate static func initialStep() -> Step {
        let hasProvider = AIProviderKind.current.firstRunCredentialIsSatisfied()
        let hasFolder = SecurityScopedFolderStore.resolve() != nil
        if !hasProvider { return .provider }
        if !hasFolder { return .folder }
        return .provider
    }
}

extension AIProviderKind {
    func firstRunCredentialIsSatisfied(
        keyReader: (String) -> String? = { KeychainStore.readString(account: $0) }
    ) -> Bool {
        switch self {
        case .anthropic:
            return (keyReader(KeychainAccount.anthropicAPIKey) ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty == false
        case .openai:
            return (keyReader(KeychainAccount.openAIAPIKey) ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty == false
        case .claudeCli, .codexCli, .ollama, .customEndpoint, .disabled:
            // These providers either use local auth, local services, optional
            // endpoint configuration, or intentionally disable AI. None should
            // be blocked by a missing Anthropic key on first launch.
            return true
        }
    }

    static func shouldShowFirstRunPrompt(
        defaults: UserDefaults = .standard,
        keyReader: (String) -> String? = { KeychainStore.readString(account: $0) },
        hasFolder: Bool = SecurityScopedFolderStore.resolve() != nil
    ) -> Bool {
        if defaults.bool(forKey: "loom.ai.firstRunPromptSeen") { return false }
        let raw = defaults.string(forKey: "loom.ai.provider") ?? anthropic.rawValue
        let provider = AIProviderKind(rawValue: raw) ?? .anthropic
        if provider.firstRunCredentialIsSatisfied(keyReader: keyReader) && hasFolder { return false }
        return true
    }

    /// Whether the first-launch wizard should appear. True when the user
    /// hasn't dismissed it yet AND either AI credentials or a content-root
    /// bookmark is still missing — the sheet handles both steps.
    static var firstRunShouldPrompt: Bool {
        shouldShowFirstRunPrompt()
    }
}

extension Notification.Name {
    static let loomContentRootChanged = Notification.Name("loomContentRootChanged")
}
