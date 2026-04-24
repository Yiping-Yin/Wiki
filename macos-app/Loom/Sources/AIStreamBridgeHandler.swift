import Foundation
import WebKit

/// Streaming companion to `AIBridgeHandler`. The non-streaming handler is
/// reply-based (`WKScriptMessageHandlerWithReply`), which can't push
/// incremental deltas. This handler uses the push model:
///
///   JS: `window.webkit.messageHandlers.loomAIStream.postMessage({ streamId, prompt, model?, maxTokens? })`
///   Swift: for each SSE text delta, call `webView.evaluateJavaScript("window.__loomAI.onChunk('<id>', '<text>')")`
///   Swift: on completion, call `window.__loomAI.onDone('<id>')`
///   Swift: on error, call `window.__loomAI.onError('<id>', '<message>')`
///
/// The JS side (lib/ai-stream-bridge.ts) maintains a Map of pending streams
/// keyed by streamId, and translates the callbacks into an AsyncIterable.
///
/// Cancellation: JS can cancel by posting `{ streamId, cancel: true }`.
/// Swift then cancels the in-flight URLSession.bytes task for that stream.
@MainActor
final class AIStreamBridgeHandler: NSObject, WKScriptMessageHandler {
    static let name = "loomAIStream"

    private var tasks: [String: Task<Void, Never>] = [:]

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let payload = message.body as? [String: Any],
              let streamId = payload["streamId"] as? String else {
            return
        }

        if let cancel = payload["cancel"] as? Bool, cancel {
            tasks[streamId]?.cancel()
            tasks.removeValue(forKey: streamId)
            return
        }

        guard let prompt = payload["prompt"] as? String,
              let webView = message.webView else { return }

        let modelOverride = payload["model"] as? String
        let maxTokensOverride = payload["maxTokens"] as? Int
        let provider = AIProviderKind.current

        let onChunkClosure: (String) -> Void = { [weak webView] chunk in
            Task { @MainActor [weak webView] in
                guard let webView else { return }
                let escaped = escapeForJS(chunk)
                let escapedId = escapeForJS(streamId)
                await Self.evaluateJavaScript(
                    "window.__loomAI && window.__loomAI.onChunk('\(escapedId)', '\(escaped)')",
                    in: webView
                )
            }
        }

        let task = Task.detached(priority: .userInitiated) { [weak self, weak webView] in
            do {
                switch provider {
                case .openai:
                    var opts = OpenAIClient.Options()
                    if let m = modelOverride, !m.isEmpty { opts.model = m }
                    if let t = maxTokensOverride, t > 0 { opts.maxTokens = t }
                    opts.onChunk = onChunkClosure
                    _ = try await OpenAIClient.send(prompt: prompt, options: opts)
                case .customEndpoint:
                    var opts = CustomEndpointClient.Options()
                    if let t = maxTokensOverride, t > 0 { opts.maxTokens = t }
                    opts.onChunk = onChunkClosure
                    _ = try await CustomEndpointClient.send(prompt: prompt, options: opts)
                case .ollama:
                    var opts = OllamaClient.Options()
                    opts.onChunk = onChunkClosure
                    _ = try await OllamaClient.send(prompt: prompt, options: opts)
                case .claudeCli:
                    var opts = CLIRuntimeClient.Options()
                    opts.flavor = .claude
                    opts.onChunk = onChunkClosure
                    _ = try await CLIRuntimeClient.send(prompt: prompt, options: opts)
                case .codexCli:
                    var opts = CLIRuntimeClient.Options()
                    opts.flavor = .codex
                    opts.onChunk = onChunkClosure
                    _ = try await CLIRuntimeClient.send(prompt: prompt, options: opts)
                case .disabled:
                    throw NSError(
                        domain: "LoomAI", code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "AI is disabled in Settings."]
                    )
                default:
                    var opts = AnthropicClient.Options()
                    if let m = modelOverride, !m.isEmpty { opts.model = m }
                    if let t = maxTokensOverride, t > 0 { opts.maxTokens = t }
                    opts.onChunk = onChunkClosure
                    _ = try await AnthropicClient.send(prompt: prompt, options: opts)
                }
                let escapedId = escapeForJS(streamId)
                await Self.evaluateJavaScript(
                    "window.__loomAI && window.__loomAI.onDone('\(escapedId)')",
                    in: webView
                )
            } catch is CancellationError {
                let escapedId = escapeForJS(streamId)
                await Self.evaluateJavaScript(
                    "window.__loomAI && window.__loomAI.onError('\(escapedId)', 'cancelled')",
                    in: webView
                )
            } catch {
                let message = (error as? AnthropicClient.Failure)?.errorDescription
                    ?? (error as? OpenAIClient.Failure)?.errorDescription
                    ?? (error as? CustomEndpointClient.Failure)?.errorDescription
                    ?? (error as? OllamaClient.Failure)?.errorDescription
                    ?? (error as? CLIRuntimeClient.Failure)?.errorDescription
                    ?? error.localizedDescription
                let escapedId = escapeForJS(streamId)
                let escapedMsg = escapeForJS(message)
                await Self.evaluateJavaScript(
                    "window.__loomAI && window.__loomAI.onError('\(escapedId)', '\(escapedMsg)')",
                    in: webView
                )
            }
            await MainActor.run { [weak self] in
                _ = self?.tasks.removeValue(forKey: streamId)
            }
        }
        tasks[streamId] = task
    }

    private static func evaluateJavaScript(_ script: String, in webView: WKWebView?) async {
        guard let webView else { return }
        _ = try? await webView.evaluateJavaScript(script)
    }
}

/// Escape a string for embedding inside single-quoted JS. Order matters:
/// backslashes first, then quotes, then line breaks.
private func escapeForJS(_ s: String) -> String {
    s.replacingOccurrences(of: "\\", with: "\\\\")
     .replacingOccurrences(of: "'", with: "\\'")
     .replacingOccurrences(of: "\n", with: "\\n")
     .replacingOccurrences(of: "\r", with: "\\r")
     .replacingOccurrences(of: "\u{2028}", with: "\\u2028")
     .replacingOccurrences(of: "\u{2029}", with: "\\u2029")
}
