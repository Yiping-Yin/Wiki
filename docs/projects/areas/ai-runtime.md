# AI Runtime

Owns model invocation, provider policy, streaming, and AI-backed product paths.

Primary responsibilities:

- Anthropic HTTP transport
- OpenAI / Ollama / custom endpoint clients
- CLI fallback policy
- streaming bridge
- provider health
- prompt and stage model behavior
- AI-backed routes and overlays

Key folders:

- `lib/ai/`
- `lib/anthropic-http.ts`
- `lib/ai-runtime/` if added later
- `macos-app/Loom/Sources/*Client.swift`
- `macos-app/Loom/Sources/*BridgeHandler.swift`
- `tests/anthropic-http.test.ts`
- `tests/ai-runtime-transport-switch.test.ts`

Design rule:

AI should be felt through its results. It should not become persistent visible chrome.
