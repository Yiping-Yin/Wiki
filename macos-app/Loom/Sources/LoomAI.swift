import Foundation

/// Native Swift-side entry point for AI calls. Mirrors the routing logic
/// in `AIBridgeHandler` (which serves the JS bridge) so any Swift surface
/// — the AI bar, future overlays, future ambient agents — can talk to
/// the user's selected provider through one stable function.
///
/// Provider selection comes from `AIProviderKind.current` (Settings →
/// AI Provider). When `.disabled`, calls throw a clear error so the UI
/// can surface "AI is off" without callers reimplementing the check.
enum LoomAI {
    enum Failure: LocalizedError {
        case disabled
        case providerError(String)

        var errorDescription: String? {
            switch self {
            case .disabled: return "AI is disabled in Settings."
            case .providerError(let msg): return msg
            }
        }
    }

    /// Send a prompt to the user's active AI provider and await the full
    /// response text. `systemPrompt`, when non-empty, is prepended in the
    /// provider-appropriate way (system/instruction message). For non-
    /// streaming use cases — long generations should call `sendStream`
    /// once that's wired (Phase B+).
    /// Streaming variant of `send`. Calls `onChunk` (on a background
    /// thread — caller must hop to MainActor for UI updates) as
    /// tokens arrive, and returns the full response when complete.
    /// Falls back to non-streaming for providers that don't support
    /// it (CLI runtimes, Ollama in some configurations) — the full
    /// response is delivered as a single chunk in that case.
    static func sendStream(
        prompt: String,
        systemPrompt: String? = nil,
        onChunk: @escaping (String) -> Void
    ) async throws -> String {
        let provider = AIProviderKind.current
        let combined: String = {
            guard let systemPrompt, !systemPrompt.isEmpty else { return prompt }
            return systemPrompt + "\n\n---\n\n" + prompt
        }()

        switch provider {
        case .appleFoundation:
            var opts = AppleFoundationClient.Options()
            opts.onChunk = onChunk
            do {
                return try await AppleFoundationClient.send(prompt: combined, options: opts)
            } catch let err as AppleFoundationClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        case .openai:
            var opts = OpenAIClient.Options()
            opts.onChunk = onChunk
            do {
                return try await OpenAIClient.send(prompt: combined, options: opts)
            } catch let err as OpenAIClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        case .disabled:
            throw Failure.disabled
        case .customEndpoint, .ollama, .codexCli:
            // No streaming wired for these — fall back to one-shot.
            let full = try await send(prompt: prompt, systemPrompt: systemPrompt)
            onChunk(full)
            return full
        default:
            var opts = AnthropicClient.Options()
            opts.onChunk = onChunk
            do {
                return try await AnthropicClient.send(prompt: combined, options: opts)
            } catch let err as AnthropicClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        }
    }

    static func send(prompt: String, systemPrompt: String? = nil) async throws -> String {
        let provider = AIProviderKind.current
        let combined: String = {
            guard let systemPrompt, !systemPrompt.isEmpty else { return prompt }
            return systemPrompt + "\n\n---\n\n" + prompt
        }()

        switch provider {
        case .appleFoundation:
            do {
                return try await AppleFoundationClient.send(prompt: combined)
            } catch let err as AppleFoundationClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        case .openai:
            do {
                return try await OpenAIClient.send(prompt: combined, options: OpenAIClient.Options())
            } catch let err as OpenAIClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        case .customEndpoint:
            do {
                return try await CustomEndpointClient.send(prompt: combined, options: CustomEndpointClient.Options())
            } catch let err as CustomEndpointClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        case .ollama:
            do {
                return try await OllamaClient.send(prompt: combined, options: OllamaClient.Options())
            } catch let err as OllamaClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        case .codexCli:
            var cliOpts = CLIRuntimeClient.Options()
            cliOpts.flavor = .codex
            do {
                return try await CLIRuntimeClient.send(prompt: combined, options: cliOpts)
            } catch let err as CLIRuntimeClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        case .disabled:
            throw Failure.disabled
        default:
            do {
                return try await AnthropicClient.send(prompt: combined, options: AnthropicClient.Options())
            } catch let err as AnthropicClient.Failure {
                throw Failure.providerError(err.errorDescription ?? "\(err)")
            }
        }
    }
}
