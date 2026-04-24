'use client';

import type { AiAvailability, CliHealth } from './ai-provider-health';
import type { AiCliKind } from './ai-cli';

/**
 * Legacy CLI-health probe, retired 2026-04-21 alongside the Phase 5
 * cutover to Swift-bridge AI. Pre-flight health checks against `claude` /
 * `codex` CLIs are meaningless now that every AI call routes through the
 * Swift bridge + user's chosen provider.
 *
 * Runtime errors still surface at call-time via the `aiError` state each
 * consumer already tracks (ChatFocus / FreeInput / EmptyDocCaptureSurface).
 * The `AnthropicClient.Failure.missingKey` style errors carry enough
 * context to show "Add your API key in Settings" without a separate
 * pre-flight round-trip.
 *
 * The hook still returns the same shape so existing consumers compile
 * without rewriting — it just always reports ready/null-notice. When the
 * remaining `lib/ai-provider-health.ts` helpers (formatAiRuntimeErrorMessage,
 * resolveAiNotice) are retired in a follow-up, this file goes too.
 */
export function useAiHealth(_enabled: boolean = true) {
  void _enabled;
  return {
    preferredCli: 'anthropic' as AiCliKind,
    providers: null as CliHealth[] | null,
    availability: {
      selected: null,
      alternate: null,
      effectiveCli: 'anthropic' as AiCliKind,
      canSend: true,
      notice: null,
      tone: null,
    } satisfies AiAvailability,
    loading: false,
  };
}
