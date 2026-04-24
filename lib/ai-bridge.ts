/**
 * Swift-bridge-only AI client. Phase 3 / 5 of architecture inversion:
 * the Mac app's Swift layer owns all Anthropic calls. The HTTP fallback
 * was deleted along with `app/api/chat` / `app/api/complete` /
 * `app/api/selection-edit/*` — if you're running the webview outside the
 * Loom shell, AI features are unavailable.
 */

type LoomAIBridge = {
  postMessage: (payload: unknown) => Promise<string>;
};

type AIWindow = Window & {
  webkit?: {
    messageHandlers?: {
      loomAI?: LoomAIBridge;
    };
  };
};

function getSwiftBridge(): LoomAIBridge | null {
  if (typeof window === 'undefined') return null;
  const w = window as AIWindow;
  return w.webkit?.messageHandlers?.loomAI ?? null;
}

export function isSwiftBridgeAvailable(): boolean {
  return Boolean(getSwiftBridge());
}

export type AskAIOptions = {
  model?: string;
  maxTokens?: number;
};

/**
 * Send a prompt, await the full response. Requires the Swift bridge
 * (i.e. running inside the Loom Mac app). Throws if the bridge is
 * missing.
 */
export async function askAI(prompt: string, options: AskAIOptions = {}): Promise<string> {
  const bridge = getSwiftBridge();
  if (!bridge) {
    throw new Error('AI bridge unavailable — open this in the Loom Mac app.');
  }
  return await bridge.postMessage({
    prompt,
    model: options.model,
    maxTokens: options.maxTokens,
  });
}
