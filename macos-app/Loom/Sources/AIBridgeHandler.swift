import Foundation
import WebKit

/// WKScriptMessageHandlerWithReply that exposes `AnthropicClient.send` to
/// the webview. JS invokes:
///   `window.webkit.messageHandlers.loomAI.postMessage({ prompt, model?, maxTokens? })`
/// and awaits the promise. Phase 3 of the architecture inversion —
/// eventually replaces every `fetch('/api/chat')` call with this bridge,
/// after which `app/api/chat/route.ts` can be deleted.
///
/// Streaming isn't wired through this handler yet (WKScriptMessageHandler
/// can't push incremental messages back). For streaming, a subsequent
/// Phase 3 step will expose a `startAIStream(...)` call that returns a
/// handle, plus a JS callback that Swift drives via
/// `webView.evaluateJavaScript("window.__loomAIChunk(...)")`.
@MainActor
final class AIBridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "loomAI"

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let payload = message.body as? [String: Any],
              let prompt = payload["prompt"] as? String else {
            replyHandler(nil, "missing prompt")
            return
        }

        var options = AnthropicClient.Options()
        if let model = payload["model"] as? String, !model.isEmpty {
            options.model = model
        }
        if let maxTokens = payload["maxTokens"] as? Int, maxTokens > 0 {
            options.maxTokens = maxTokens
        }

        let provider = AIProviderKind.current
        Task.detached(priority: .userInitiated) {
            do {
                let text: String
                switch provider {
                case .openai:
                    var openaiOpts = OpenAIClient.Options()
                    openaiOpts.model = options.model == AnthropicClient.Options().model ? OpenAIClient.Options().model : options.model
                    openaiOpts.maxTokens = options.maxTokens
                    text = try await OpenAIClient.send(prompt: prompt, options: openaiOpts)
                case .customEndpoint:
                    var customOpts = CustomEndpointClient.Options()
                    customOpts.maxTokens = options.maxTokens
                    text = try await CustomEndpointClient.send(prompt: prompt, options: customOpts)
                case .ollama:
                    let ollamaOpts = OllamaClient.Options()
                    text = try await OllamaClient.send(prompt: prompt, options: ollamaOpts)
                case .claudeCli:
                    var cliOpts = CLIRuntimeClient.Options()
                    cliOpts.flavor = .claude
                    text = try await CLIRuntimeClient.send(prompt: prompt, options: cliOpts)
                case .codexCli:
                    var cliOpts = CLIRuntimeClient.Options()
                    cliOpts.flavor = .codex
                    text = try await CLIRuntimeClient.send(prompt: prompt, options: cliOpts)
                case .disabled:
                    throw NSError(
                        domain: "LoomAI", code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "AI is disabled in Settings."]
                    )
                default:
                    text = try await AnthropicClient.send(prompt: prompt, options: options)
                }
                await MainActor.run { replyHandler(text, nil) }
            } catch let failure as AnthropicClient.Failure {
                await MainActor.run { replyHandler(nil, failure.errorDescription ?? "\(failure)") }
            } catch let failure as OpenAIClient.Failure {
                await MainActor.run { replyHandler(nil, failure.errorDescription ?? "\(failure)") }
            } catch let failure as CustomEndpointClient.Failure {
                await MainActor.run { replyHandler(nil, failure.errorDescription ?? "\(failure)") }
            } catch let failure as OllamaClient.Failure {
                await MainActor.run { replyHandler(nil, failure.errorDescription ?? "\(failure)") }
            } catch let failure as CLIRuntimeClient.Failure {
                await MainActor.run { replyHandler(nil, failure.errorDescription ?? "\(failure)") }
            } catch {
                await MainActor.run { replyHandler(nil, error.localizedDescription) }
            }
        }
    }
}
