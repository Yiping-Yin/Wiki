import SwiftUI

/// macOS-native Settings pane for AI provider choice + credentials.
///
/// Every provider — Anthropic HTTPS, OpenAI HTTPS, local Claude/Codex CLI,
/// Ollama, custom OpenAI-compatible endpoint — is wired end-to-end. The
/// picker exposes the full menu; the conditional sections below swap to
/// the credentials/endpoint/model fields each provider needs.
struct AIProviderSettingsView: View {
    @AppStorage("loom.ai.provider") private var providerRaw: String = AIProviderKind.anthropic.rawValue
    @AppStorage(CustomEndpointClient.baseURLDefaultsKey) private var customURL: String = ""
    @AppStorage(CustomEndpointClient.modelDefaultsKey) private var customModel: String = ""
    @AppStorage(OllamaClient.hostDefaultsKey) private var ollamaHost: String = OllamaClient.defaultHost
    @AppStorage(OllamaClient.modelDefaultsKey) private var ollamaModel: String = ""
    @State private var anthropicKey: String = ""
    @State private var savedAnthropicKey: String = ""
    @State private var openAIKey: String = ""
    @State private var savedOpenAIKey: String = ""
    @State private var customKey: String = ""
    @State private var savedCustomKey: String = ""
    @State private var status: Status = .initial
    @EnvironmentObject private var server: DevServer

    private enum Status: Equatable {
        case initial
        case saved
        case cleared
        case failed(String)
    }

    private var provider: AIProviderKind {
        AIProviderKind(rawValue: providerRaw) ?? .anthropic
    }

    var body: some View {
        Form {
            Section {
                Picker("Provider", selection: $providerRaw) {
                    ForEach(AIProviderKind.allCases) { kind in
                        Label(kind.label, systemImage: kind.systemImage)
                            .tag(kind.rawValue)
                    }
                }
                .pickerStyle(.menu)
            } header: {
                Text("Which AI should Loom talk to?")
            } footer: {
                Text(provider.footerBlurb)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if provider == .anthropic {
                Section {
                    SecureField("sk-ant-...", text: $anthropicKey)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Button("Save") { saveAnthropic() }
                            .keyboardShortcut(.defaultAction)
                            .disabled(anthropicKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        if !savedAnthropicKey.isEmpty {
                            Button("Remove", role: .destructive) { clearAnthropic() }
                        }
                        Spacer()
                        statusLabel
                    }
                } header: {
                    Text("Anthropic API key")
                } footer: {
                    Text("Stored in macOS Keychain. Only Loom reads it; it's never sent anywhere except Anthropic's Messages API during AI requests.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if provider == .openai {
                Section {
                    SecureField("sk-...", text: $openAIKey)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Button("Save") { saveOpenAI() }
                            .keyboardShortcut(.defaultAction)
                            .disabled(openAIKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        if !savedOpenAIKey.isEmpty {
                            Button("Remove", role: .destructive) { clearOpenAI() }
                        }
                        Spacer()
                        statusLabel
                    }
                } header: {
                    Text("OpenAI API key")
                } footer: {
                    Text("Stored in macOS Keychain. Used for OpenAI chat completions (gpt-5 default). Only Loom reads it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if provider == .customEndpoint {
                Section {
                    TextField("https://api.groq.com/openai/v1/chat/completions", text: $customURL)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                } header: {
                    Text("Endpoint URL")
                } footer: {
                    Text("OpenAI-compatible chat completions URL. Works with LM Studio, Groq, Together, OpenRouter, vLLM, etc.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section {
                    TextField("llama-3.3-70b-versatile", text: $customModel)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                } header: {
                    Text("Model name")
                }
                Section {
                    SecureField("API key (optional)", text: $customKey)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Button("Save key") { saveCustom() }
                            .keyboardShortcut(.defaultAction)
                            .disabled(customKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        if !savedCustomKey.isEmpty {
                            Button("Remove key", role: .destructive) { clearCustom() }
                        }
                        Spacer()
                        statusLabel
                    }
                } header: {
                    Text("API key (optional)")
                } footer: {
                    Text("Sent as Bearer token. Some local endpoints (LM Studio, local vLLM) don't require this — leave blank.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if provider == .ollama {
                Section {
                    TextField(OllamaClient.defaultHost, text: $ollamaHost)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                } header: {
                    Text("Ollama host")
                } footer: {
                    Text("Default is \(OllamaClient.defaultHost). Change if Ollama runs on a different port or machine.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section {
                    TextField("llama3.1:8b-instruct-q4_K_M", text: $ollamaModel)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                } header: {
                    Text("Model")
                } footer: {
                    Text("Whatever you've pulled with `ollama pull …`. Pick a model, not a size alone.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else if provider == .claudeCli || provider == .codexCli {
                Section {
                    let flavor: CLIRuntimeClient.Flavor = (provider == .claudeCli) ? .claude : .codex
                    let resolved = (try? CLIRuntimeClient.resolveDefaultBinary(for: flavor)) ?? "(not found)"
                    HStack {
                        Text("Binary")
                        Spacer()
                        Text(resolved)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                    if DevServer.isSandboxed {
                        Label(
                            "This build runs under the Mac App Store sandbox, which blocks spawning local binaries. Pick an HTTPS provider, or install the Developer-ID build for CLI support.",
                            systemImage: "lock.shield"
                        )
                        .foregroundStyle(.orange)
                        .font(.callout)
                    }
                } header: {
                    Text(provider == .claudeCli ? "Claude CLI" : "Codex CLI")
                } footer: {
                    Text("Loom shells out to the CLI you've already logged in — no API key needed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .padding()
        .frame(minWidth: 520, idealWidth: 560, minHeight: 360)
        .scrollContentBackground(.hidden)
        .background(LoomTokens.paper)
        .tint(LoomTokens.thread)
        .onAppear(perform: loadExisting)
    }

    @ViewBuilder
    private var statusLabel: some View {
        switch status {
        case .initial:
            EmptyView()
        case .saved:
            Label("Saved", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
                .labelStyle(.titleAndIcon)
                .font(.caption)
        case .cleared:
            Label("Removed", systemImage: "circle.slash")
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
                .font(.caption)
        case .failed(let message):
            Label(message, systemImage: "exclamationmark.triangle.fill")
                .foregroundStyle(.red)
                .labelStyle(.titleAndIcon)
                .font(.caption)
        }
    }

    private func loadExisting() {
        let anthropic = KeychainStore.readString(account: KeychainAccount.anthropicAPIKey) ?? ""
        savedAnthropicKey = anthropic
        anthropicKey = anthropic.isEmpty ? "" : maskedPreview(anthropic)
        let openai = KeychainStore.readString(account: KeychainAccount.openAIAPIKey) ?? ""
        savedOpenAIKey = openai
        openAIKey = openai.isEmpty ? "" : maskedPreview(openai)
        let custom = KeychainStore.readString(account: KeychainAccount.customEndpointAPIKey) ?? ""
        savedCustomKey = custom
        customKey = custom.isEmpty ? "" : maskedPreview(custom)
    }

    private func saveCustom() {
        let trimmed = customKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if trimmed == maskedPreview(savedCustomKey) { return }
        do {
            try KeychainStore.writeString(trimmed, account: KeychainAccount.customEndpointAPIKey)
            savedCustomKey = trimmed
            customKey = maskedPreview(trimmed)
            status = .saved
            server.reloadFromKeychain()
        } catch {
            status = .failed("Save failed: \(error)")
        }
    }

    private func clearCustom() {
        do {
            try KeychainStore.delete(account: KeychainAccount.customEndpointAPIKey)
            savedCustomKey = ""
            customKey = ""
            status = .cleared
            server.reloadFromKeychain()
        } catch {
            status = .failed("Remove failed: \(error)")
        }
    }

    private func saveAnthropic() {
        let trimmed = anthropicKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if trimmed == maskedPreview(savedAnthropicKey) { return }
        do {
            try KeychainStore.writeString(trimmed, account: KeychainAccount.anthropicAPIKey)
            savedAnthropicKey = trimmed
            anthropicKey = maskedPreview(trimmed)
            status = .saved
            server.reloadFromKeychain()
        } catch {
            status = .failed("Save failed: \(error)")
        }
    }

    private func clearAnthropic() {
        do {
            try KeychainStore.delete(account: KeychainAccount.anthropicAPIKey)
            savedAnthropicKey = ""
            anthropicKey = ""
            status = .cleared
            server.reloadFromKeychain()
        } catch {
            status = .failed("Remove failed: \(error)")
        }
    }

    private func saveOpenAI() {
        let trimmed = openAIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if trimmed == maskedPreview(savedOpenAIKey) { return }
        do {
            try KeychainStore.writeString(trimmed, account: KeychainAccount.openAIAPIKey)
            savedOpenAIKey = trimmed
            openAIKey = maskedPreview(trimmed)
            status = .saved
            server.reloadFromKeychain()
        } catch {
            status = .failed("Save failed: \(error)")
        }
    }

    private func clearOpenAI() {
        do {
            try KeychainStore.delete(account: KeychainAccount.openAIAPIKey)
            savedOpenAIKey = ""
            openAIKey = ""
            status = .cleared
            server.reloadFromKeychain()
        } catch {
            status = .failed("Remove failed: \(error)")
        }
    }

    private func maskedPreview(_ key: String) -> String {
        guard key.count > 8 else { return String(repeating: "•", count: max(key.count, 8)) }
        let prefix = key.prefix(7)
        let suffix = key.suffix(4)
        return "\(prefix)••••\(suffix)"
    }
}

/// All AI providers Loom supports. Every case is backed by a concrete
/// client (AnthropicClient, OpenAIClient, CLIRuntimeClient, OllamaClient,
/// CustomEndpointClient) and routed through AIBridgeHandler /
/// AIStreamBridgeHandler based on the current selection.
enum AIProviderKind: String, CaseIterable, Identifiable {
    case anthropic
    case openai
    case claudeCli
    case codexCli
    case ollama
    case customEndpoint
    case disabled

    var id: String { rawValue }

    var label: String {
        switch self {
        case .anthropic: return "Anthropic (HTTPS)"
        case .openai: return "OpenAI (HTTPS)"
        case .claudeCli: return "Local Claude CLI"
        case .codexCli: return "Local Codex CLI"
        case .ollama: return "Local Ollama"
        case .customEndpoint: return "Custom endpoint"
        case .disabled: return "Disabled (no AI)"
        }
    }

    var systemImage: String {
        switch self {
        case .anthropic: return "sparkles"
        case .openai: return "sparkles.rectangle.stack"
        case .claudeCli, .codexCli: return "terminal"
        case .ollama: return "cube"
        case .customEndpoint: return "network"
        case .disabled: return "nosign"
        }
    }

    /// Retained for future-use: if we introduce a case for a provider whose
    /// client isn't wired yet, flip this to false to filter it out of the
    /// first-run wizard. Today every case is wired.
    var isReady: Bool { true }

    /// Current user selection from UserDefaults. Centralized so bridges
    /// and dispatchers agree on the active provider.
    static var current: AIProviderKind {
        let raw = UserDefaults.standard.string(forKey: "loom.ai.provider") ?? anthropic.rawValue
        return AIProviderKind(rawValue: raw) ?? .anthropic
    }

    var footerBlurb: String {
        switch self {
        case .anthropic:
            return "Loom calls Anthropic's Messages API directly with the key you provide. Keys stay in Keychain; no server sees them."
        case .openai:
            return "OpenAI support is queued next. Bring your own OpenAI API key; Loom will call chat completions directly."
        case .claudeCli:
            return "Shell out to the `claude` CLI you already have logged in. No API key required. (Not available under Mac App Store sandbox.)"
        case .codexCli:
            return "Shell out to the `codex` CLI you already have logged in. No API key required. (Not available under Mac App Store sandbox.)"
        case .ollama:
            return "Talk to a local Ollama instance at 127.0.0.1:11434. Pick a model you've pulled locally. Free, offline, private."
        case .customEndpoint:
            return "Point Loom at any OpenAI-compatible HTTPS endpoint (e.g. self-hosted, proxied). Provide URL + optional key + model name."
        case .disabled:
            return "Turn AI features off entirely. Reading, anchoring, highlighting, and note-taking all still work."
        }
    }
}
