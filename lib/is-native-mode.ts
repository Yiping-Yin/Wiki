/**
 * True when the page is running inside the Loom native shell
 * (WKWebView under the macOS app) rather than a plain browser tab.
 *
 * Detection: the native shell installs one or more
 * `window.webkit.messageHandlers.<name>` bridges (loomAI, loomEmbed,
 * loomChooseFolder, etc.) at WKWebView construction. A plain browser
 * has no `window.webkit`.
 *
 * Use this to pick between static-export URLs (`loom://bundle/…` —
 * only resolvable inside the shell) and HTTP API routes (`/api/…` —
 * only available when the Next.js dev server is running).
 *
 * Companion to `lib/ai-bridge.ts:isSwiftBridgeAvailable()` and
 * `lib/embed-client.ts:isEmbedAvailable()`, which check for specific
 * bridges. This helper is generic — any handler means we're native.
 */
export function isNativeMode(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location?.protocol === 'loom:') return true;
  const handlers = (window as unknown as {
    webkit?: { messageHandlers?: Record<string, unknown> };
  }).webkit?.messageHandlers;
  if (!handlers) return false;
  return Reflect.ownKeys(handlers).length > 0;
}
