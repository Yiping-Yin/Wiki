# Local CLI AI Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Loom's current ad hoc local-CLI AI path into one stable runtime broker with `codex` as the default, automatic fallback to `claude`, one minimal Settings control, and consistent user-facing runtime behavior across AI surfaces and API routes.

**Architecture:** Keep local CLIs as the only runtime in this phase, but formalize them behind a shared broker contract. Centralize runtime choice, health classification, fallback policy, and user-facing grammar in `lib/ai-runtime/*`, then make routes and surfaces consume that broker instead of each reinterpreting raw CLI failures. Preserve the current product constraint that inference policy is fixed: highest reasoning and maximum context.

**Tech Stack:** Next.js App Router, React 18, TypeScript, local `codex` / `claude` CLIs, Node route handlers, `tsx` node tests.

---

## File Map

- `lib/ai-runtime/types.ts`
  Shared runtime types: preferred runtime, recoverable failure classes, route invocation result, health snapshots.
- `lib/ai-runtime/broker.ts`
  Single place that resolves preferred runtime, executes the first choice, decides whether fallback is allowed, and returns one stable result object.
- `lib/ai-runtime/health.ts`
  Runtime probes and caching for `codex` / `claude`, built on top of the broker primitives.
- `lib/ai-runtime/messages.ts`
  Shared product grammar for runtime notices and failures so routes and UI stop inventing slightly different copies.
- `lib/claude-cli.ts`
  Keep as the low-level spawn wrapper only. Remove broker-like decision logic from here.
- `lib/ai-provider-health.ts`
  Either slim this down into parser helpers used by the new runtime layer, or merge it into `lib/ai-runtime/messages.ts` if duplication remains.
- `lib/ai-cli.ts`
  Retain the user preference storage and migration to `codex` default.
- `lib/use-ai-health.ts`
  Client hook that reads runtime health and derives effective runtime + notices from one place.
- `app/api/chat/route.ts`
  First route to consume the new broker for streamed chat behavior.
- `app/api/ask/route.ts`
- `app/api/complete/route.ts`
- `app/api/decompose/route.ts`
- `app/api/quiz/route.ts`
- `app/api/recommend/route.ts`
- `app/api/structure/route.ts`
- `app/api/summarize/route.ts`
  Remaining AI routes that should stop calling `runCli()` directly and instead call the broker/helper.
- `app/api/ai-health/route.ts`
  Continue to expose runtime health, but source it from the shared health module instead of re-implementing route-local probes.
- `components/SettingsPanel.tsx`
  Single normal-user runtime control: preferred runtime, availability, fixed policy label.
- `components/ChatFocus.tsx`
  Preflight notice + runtime-aware send behavior for passage chat.
- `components/FreeInput.tsx`
  Preflight notice + runtime-aware send behavior for the free `/today` input.
- `components/unified/AiStagePrimitives.tsx`
  Optional shared inline notice styling if current hint components need a runtime-specific variant.
- `app/help/page.tsx`
  Update user-facing help copy so it teaches "local AI runtime with Codex default and Claude fallback" rather than stale or contradictory wording.
- `tests/ai-runtime-broker.test.ts`
  New focused broker tests.
- `tests/ai-provider-health.test.ts`
- `tests/ai-cli.test.ts`
  Extend existing tests to reflect final behavior.

## Task 1: Extract a Shared AI Runtime Broker

**Files:**
- Create: `lib/ai-runtime/types.ts`
- Create: `lib/ai-runtime/broker.ts`
- Create: `tests/ai-runtime-broker.test.ts`
- Modify: `lib/claude-cli.ts`
- Modify: `lib/ai-provider-health.ts`
- Test: `tests/ai-runtime-broker.test.ts`

- [ ] **Step 1: Write the failing broker tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pickExecutionPlan,
  resolveBrokerResult,
  type RuntimeFailure,
} from '../lib/ai-runtime/broker';

test('codex is the default first runtime', () => {
  const plan = pickExecutionPlan({ preferred: null });
  assert.deepEqual(plan.order, ['codex', 'claude']);
});

test('preferred claude becomes the first runtime', () => {
  const plan = pickExecutionPlan({ preferred: 'claude' });
  assert.deepEqual(plan.order, ['claude', 'codex']);
});

test('recoverable codex failure falls back to claude', () => {
  const result = resolveBrokerResult({
    preferred: 'codex',
    firstFailure: { runtime: 'codex', code: 'session-permission', detail: 'permission denied' } satisfies RuntimeFailure,
    fallbackSuccess: 'ok from claude',
  });
  assert.equal(result.runtime, 'claude');
  assert.equal(result.fellBack, true);
  assert.equal(result.text, 'ok from claude');
});

test('non-recoverable failure does not fall back', () => {
  const result = resolveBrokerResult({
    preferred: 'claude',
    firstFailure: { runtime: 'claude', code: 'spawn', detail: 'ENOENT' } satisfies RuntimeFailure,
  });
  assert.equal(result.runtime, null);
  assert.equal(result.fellBack, false);
  assert.match(result.userMessage, /not available|settings/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test tests/ai-runtime-broker.test.ts`  
Expected: FAIL with `Cannot find module '../lib/ai-runtime/broker'`

- [ ] **Step 3: Create broker types**

```ts
// lib/ai-runtime/types.ts
import type { AiCliKind } from '../ai-cli';

export type RuntimeCode =
  | 'auth'
  | 'session-permission'
  | 'timeout'
  | 'spawn'
  | 'transport'
  | 'unknown';

export type RuntimeFailure = {
  runtime: AiCliKind;
  code: RuntimeCode;
  detail: string;
};

export type RuntimePlan = {
  preferred: AiCliKind;
  order: [AiCliKind, AiCliKind];
};

export type RuntimeSuccess = {
  runtime: AiCliKind;
  text: string;
  fellBack: boolean;
  notice: string | null;
};

export type RuntimeFailureResult = {
  runtime: null;
  fellBack: boolean;
  userMessage: string;
};
```

- [ ] **Step 4: Implement minimal broker logic**

```ts
// lib/ai-runtime/broker.ts
import type { AiCliKind } from '../ai-cli';
import { describeCliIssue } from '../ai-provider-health';
import type { RuntimeFailure, RuntimeFailureResult, RuntimePlan, RuntimeSuccess } from './types';

const RECOVERABLE = new Set(['auth', 'session-permission', 'timeout', 'transport']);

export function pickExecutionPlan({ preferred }: { preferred: AiCliKind | null }): RuntimePlan {
  const first: AiCliKind = preferred === 'claude' ? 'claude' : 'codex';
  return { preferred: first, order: first === 'claude' ? ['claude', 'codex'] : ['codex', 'claude'] };
}

export function isRecoverableFailure(failure: RuntimeFailure) {
  return RECOVERABLE.has(failure.code);
}

export function resolveBrokerResult(args: {
  preferred: AiCliKind | null;
  firstFailure?: RuntimeFailure;
  fallbackSuccess?: string;
}): RuntimeSuccess | RuntimeFailureResult {
  const plan = pickExecutionPlan({ preferred: args.preferred });
  if (args.firstFailure && args.fallbackSuccess && isRecoverableFailure(args.firstFailure)) {
    return {
      runtime: plan.order[1],
      text: args.fallbackSuccess,
      fellBack: true,
      notice: `${plan.order[0] === 'codex' ? 'Codex CLI' : 'Claude CLI'} unavailable. Loom used ${plan.order[1] === 'codex' ? 'Codex CLI' : 'Claude CLI'} for this request.`,
    };
  }
  if (args.firstFailure) {
    const issue = describeCliIssue(args.firstFailure.runtime, args.firstFailure.detail);
    return { runtime: null, fellBack: false, userMessage: `${issue.summary} ${issue.action}` };
  }
  throw new Error('resolveBrokerResult requires a failure to resolve');
}
```

- [ ] **Step 5: Slim `lib/claude-cli.ts` down to a spawn wrapper**

```ts
// keep
export async function runCli(prompt: string, opts?: { cli?: CliKind; timeoutMs?: number; model?: string; onChunk?: (chunk: string) => void }): Promise<string>

// remove from this file
// - cross-runtime fallback orchestration
// - user-facing message assembly

// keep helper output narrow
export function buildCliEnv(baseEnv: Record<string, string | undefined> = process.env) {
  return { ...baseEnv, NO_COLOR: '1' };
}
```

- [ ] **Step 6: Run broker tests to verify they pass**

Run: `npx tsx --test tests/ai-runtime-broker.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/ai-runtime lib/claude-cli.ts lib/ai-provider-health.ts tests/ai-runtime-broker.test.ts
git commit -m "refactor: add shared local ai runtime broker"
```

## Task 2: Route All AI Endpoints Through the Broker

**Files:**
- Create: `lib/ai-runtime/invoke.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/ask/route.ts`
- Modify: `app/api/complete/route.ts`
- Modify: `app/api/decompose/route.ts`
- Modify: `app/api/quiz/route.ts`
- Modify: `app/api/recommend/route.ts`
- Modify: `app/api/structure/route.ts`
- Modify: `app/api/summarize/route.ts`
- Modify: `app/api/ai-health/route.ts`
- Test: `tests/ai-provider-health.test.ts`

- [ ] **Step 1: Extend the failing tests to cover route-facing broker results**

```ts
test('route-facing formatter preserves auth guidance', () => {
  const message = formatAiRuntimeErrorMessage(
    'Claude CLI is not authenticated. Open Settings and sign in to Claude CLI, or switch to the other provider.',
  );
  assert.match(message, /not authenticated/i);
  assert.match(message, /settings/i);
});
```

- [ ] **Step 2: Run test to verify the new expectation fails if route formatting regresses**

Run: `npx tsx --test tests/ai-provider-health.test.ts`  
Expected: PASS now; this acts as regression protection before route refactor.

- [ ] **Step 3: Create one shared invoke helper**

```ts
// lib/ai-runtime/invoke.ts
import type { AiCliKind } from '../ai-cli';
import { detectCliIssueCode } from '../ai-provider-health';
import { runCli } from '../claude-cli';
import type { RuntimeFailure, RuntimeSuccess } from './types';
import { isRecoverableFailure, pickExecutionPlan } from './broker';

export async function invokeLocalRuntime(args: {
  preferred: AiCliKind | null;
  prompt: string;
  timeoutMs: number;
  model?: string;
  onChunk?: (chunk: string) => void;
}): Promise<
  | (RuntimeSuccess & { text: string })
  | { runtime: null; fellBack: false; userMessage: string }
> {
  const plan = pickExecutionPlan({ preferred: args.preferred });

  try {
    const text = await runCli(args.prompt, {
      cli: plan.order[0],
      timeoutMs: args.timeoutMs,
      model: args.model,
      onChunk: args.onChunk,
    });
    return { runtime: plan.order[0], text, fellBack: false, notice: null };
  } catch (error: any) {
    const firstFailure: RuntimeFailure = {
      runtime: plan.order[0],
      code: detectCliIssueCode(plan.order[0], error?.message ?? String(error)),
      detail: error?.message ?? String(error),
    };
    if (!isRecoverableFailure(firstFailure)) {
      return { runtime: null, fellBack: false, userMessage: `${firstFailure.runtime} failed` };
    }
    try {
      const text = await runCli(args.prompt, {
        cli: plan.order[1],
        timeoutMs: args.timeoutMs,
        model: args.model,
        onChunk: args.onChunk,
      });
      return {
        runtime: plan.order[1],
        text,
        fellBack: true,
        notice: `${plan.order[0] === 'codex' ? 'Codex CLI' : 'Claude CLI'} unavailable. Loom used ${plan.order[1] === 'codex' ? 'Codex CLI' : 'Claude CLI'} for this request.`,
      };
    } catch (fallbackError: any) {
      return {
        runtime: null,
        fellBack: false,
        userMessage: `${error?.message ?? String(error)} ${fallbackError?.message ?? String(fallbackError)}`,
      };
    }
  }
}
```

- [ ] **Step 4: Update `app/api/chat/route.ts` to use the shared invoke helper**

```ts
const result = await invokeLocalRuntime({
  preferred: cli,
  prompt,
  timeoutMs: 180000,
  onChunk: (chunk) => {
    streamed = true;
    safeEnqueue(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
  },
});

if (result.runtime === null) {
  safeEnqueue(`data: ${JSON.stringify({ error: result.userMessage })}\n\n`);
} else {
  if (result.notice) safeEnqueue(`data: ${JSON.stringify({ notice: result.notice })}\n\n`);
  if (result.text && !streamed) safeEnqueue(`data: ${JSON.stringify({ delta: result.text })}\n\n`);
}
```

- [ ] **Step 5: Update the non-streaming AI routes to use the same helper**

```ts
const result = await invokeLocalRuntime({
  preferred: cli,
  prompt,
  timeoutMs: 120000,
});

if (result.runtime === null) {
  return Response.json({ error: result.userMessage }, { status: 500 });
}

return Response.json({
  answer: result.text,
  runtime: result.runtime,
  fellBack: result.fellBack,
  notice: result.notice,
});
```

- [ ] **Step 6: Make `/api/ai-health` read from the shared runtime-health module**

```ts
// route should become a thin wrapper
import { probeAllLocalRuntimes } from '../../../lib/ai-runtime/health';

export async function GET() {
  const providers = await probeAllLocalRuntimes();
  return Response.json({ providers });
}
```

- [ ] **Step 7: Run route and health regression tests**

Run: `npx tsx --test tests/ai-provider-health.test.ts tests/ai-runtime-broker.test.ts`  
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add lib/ai-runtime app/api/chat/route.ts app/api/ask/route.ts app/api/complete/route.ts app/api/decompose/route.ts app/api/quiz/route.ts app/api/recommend/route.ts app/api/structure/route.ts app/api/summarize/route.ts app/api/ai-health/route.ts tests/ai-provider-health.test.ts
git commit -m "refactor: route ai endpoints through local runtime broker"
```

## Task 3: Finalize Runtime Preference and Settings UX

**Files:**
- Modify: `lib/ai-cli.ts`
- Modify: `components/SettingsPanel.tsx`
- Test: `tests/ai-cli.test.ts`
- Test: `tests/ai-provider-health.test.ts`

- [ ] **Step 1: Write the failing preference tests**

```ts
test('readAiCliPreference migrates legacy claude selection to codex once', () => {
  fakeWindow.localStorage.setItem(AI_CLI_STORAGE_KEY, 'claude');
  assert.equal(readAiCliPreference(), 'codex');
});

test('writeAiCliPreference still allows switching back to claude after migration', () => {
  readAiCliPreference();
  writeAiCliPreference('claude');
  assert.equal(readAiCliPreference(), 'claude');
});
```

- [ ] **Step 2: Run the preference tests to verify they fail if migration regresses**

Run: `npx tsx --test tests/ai-cli.test.ts`  
Expected: PASS once current migration behavior is preserved.

- [ ] **Step 3: Keep `lib/ai-cli.ts` as the single preference source**

```ts
export const AI_CLI_STORAGE_KEY = 'loom:ai-cli';
export const AI_CLI_CHANGE_EVENT = 'loom:ai-cli-change';
export const AI_CLI_MIGRATION_KEY = 'loom:ai-cli:migrated-to-codex-v1';

export function readAiCliPreference(): AiCliKind {
  const migrated = localStorage.getItem(AI_CLI_MIGRATION_KEY) === '1';
  const current = localStorage.getItem(AI_CLI_STORAGE_KEY);
  if (!migrated && current === 'claude') {
    localStorage.setItem(AI_CLI_STORAGE_KEY, 'codex');
    localStorage.setItem(AI_CLI_MIGRATION_KEY, '1');
    return 'codex';
  }
  if (!migrated) localStorage.setItem(AI_CLI_MIGRATION_KEY, '1');
  return normalizeAiCli(localStorage.getItem(AI_CLI_STORAGE_KEY));
}
```

- [ ] **Step 4: Simplify `SettingsPanel` to show one minimal runtime control**

```tsx
<Section label="AI">
  <Row label="Preferred runtime">
    <Segmented<AiCliKind>
      value={aiCli}
      options={[
        { value: 'codex', label: 'Codex CLI' },
        { value: 'claude', label: 'Claude CLI' },
      ]}
      onChange={onAiCli}
    />
  </Row>
  <p className="t-caption">
    Loom tries your preferred runtime first, then falls back automatically when the failure is recoverable.
  </p>
  <p className="t-caption">
    Policy: Highest reasoning · Maximum context
  </p>
</Section>
```

- [ ] **Step 5: Keep availability visible but quiet**

```tsx
{providers.map((provider) => (
  <p key={provider.cli} className="t-caption">
    {provider.cli === 'codex' ? 'Codex CLI' : 'Claude CLI'} · {provider.ok ? 'Available' : provider.summary}
  </p>
))}
```

- [ ] **Step 6: Run Settings-related tests**

Run: `npx tsx --test tests/ai-cli.test.ts tests/ai-provider-health.test.ts`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/ai-cli.ts components/SettingsPanel.tsx tests/ai-cli.test.ts tests/ai-provider-health.test.ts
git commit -m "feat: add preferred local ai runtime setting"
```

## Task 4: Preflight Runtime Notices in AI Surfaces

**Files:**
- Modify: `lib/use-ai-health.ts`
- Modify: `components/ChatFocus.tsx`
- Modify: `components/FreeInput.tsx`
- Modify: `components/unified/AiStagePrimitives.tsx`
- Test: `tests/ai-provider-health.test.ts`

- [ ] **Step 1: Write the failing availability-derivation tests**

```ts
test('deriveAiAvailability switches to alternate runtime when preferred runtime is unavailable', () => {
  const providers = [
    { cli: 'codex', ok: false, code: 'session-permission', summary: 'Codex CLI cannot access ~/.codex session files.', action: 'Fix ~/.codex permissions or switch to Claude in Settings.', checkedAt: Date.now() },
    { cli: 'claude', ok: true, code: 'ok', summary: 'Claude CLI is available.', action: '', checkedAt: Date.now() },
  ] as const;

  const availability = deriveAiAvailability('codex', providers as any);

  assert.equal(availability.canSend, true);
  assert.equal(availability.effectiveCli, 'claude');
});
```

- [ ] **Step 2: Run the tests to verify runtime notice behavior**

Run: `npx tsx --test tests/ai-provider-health.test.ts`  
Expected: PASS when `deriveAiAvailability()` returns stable notice behavior.

- [ ] **Step 3: Make `useAiHealth()` the only client-side availability hook**

```ts
export function useAiHealth(enabled = true) {
  const [preferredCli, setPreferredCli] = useState<AiCliKind>('claude');
  const [providers, setProviders] = useState<CliHealth[] | null>(null);
  const availability = deriveAiAvailability(preferredCli, providers);
  return { preferredCli, providers, availability, loading };
}
```

- [ ] **Step 4: Block send only when both runtimes are unusable**

```tsx
if (!availability.canSend) {
  setAiError(availability.notice ?? 'AI unavailable — Open Settings to check runtime status, then retry.');
  return;
}
```

- [ ] **Step 5: Execute with the effective runtime when fallback is needed**

```tsx
assistantBuf = await runAiText({
  stage: getAiStage(stage).id,
  messages,
  context,
  cli: effectiveCli ?? undefined,
  signal: ac.signal,
  onDelta,
});
```

- [ ] **Step 6: Show quiet notices before hard failure**

```tsx
{!aiError && availability.notice ? (
  <AiInlineHint tone={availability.tone ?? 'muted'}>
    {availability.notice}
  </AiInlineHint>
) : null}
```

- [ ] **Step 7: Keep inline error copy runtime-aware**

```tsx
setAiError(`${formatAiRuntimeErrorMessage(rawMsg)} Press Enter to retry.`);
```

- [ ] **Step 8: Run surface/runtime tests**

Run: `npx tsx --test tests/ai-provider-health.test.ts tests/ai-cli.test.ts`  
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/use-ai-health.ts components/ChatFocus.tsx components/FreeInput.tsx components/unified/AiStagePrimitives.tsx tests/ai-provider-health.test.ts
git commit -m "feat: show local ai runtime fallback state in ai surfaces"
```

## Task 5: Teach the Product and Remove Drift

**Files:**
- Modify: `app/help/page.tsx`
- Modify: `docs/process/SHIP_AUDIT_2026-04-15.md`
- Modify: `docs/process/STABILIZATION_FREEZE_2026-04-15.md`
- Modify: `docs/superpowers/specs/2026-04-16-local-cli-ai-runtime-design.md`

- [ ] **Step 1: Update help copy to teach the actual runtime model**

```tsx
<TroubleRow
  title="AI is unavailable"
  cause="Loom runs through local AI runtimes on this machine."
  fix="Open Settings and check Preferred AI runtime. Loom tries Codex CLI first and falls back to Claude CLI when possible."
/>
```

- [ ] **Step 2: Update process docs so they stop implying a removed notch or unstable AI path**

```md
- `Shuttle` is the fast path inside the product shell.
- `AI` currently runs through local machine runtimes with `codex` default and `claude` fallback.
```

- [ ] **Step 3: Verify docs stay aligned with the approved runtime spec**

Run: `rg -n "OAuth|API key|provider OAuth|DynamicNotch|Codex CLI|Claude CLI" docs app/help/page.tsx`  
Expected: only intentional references remain

- [ ] **Step 4: Commit**

```bash
git add app/help/page.tsx docs/process/SHIP_AUDIT_2026-04-15.md docs/process/STABILIZATION_FREEZE_2026-04-15.md docs/superpowers/specs/2026-04-16-local-cli-ai-runtime-design.md
git commit -m "docs: align product language with local ai runtime model"
```

## Task 6: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused tests**

Run: `npx tsx --test tests/ai-cli.test.ts tests/ai-provider-health.test.ts tests/ai-runtime-broker.test.ts tests/work-session.test.ts tests/shared-store-sync.test.ts`  
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`  
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`  
Expected: PASS

- [ ] **Step 4: Run smoke**

Run: `npm run smoke`  
Expected: `health ok`, route checks ok, `/api/chat skipped (set LOOM_SMOKE_CHAT=1 to enable)`, `smoke ok`

- [ ] **Step 5: Manual UI verification**

Check these flows:

- open Settings and confirm preferred runtime defaults to `Codex CLI`
- if `codex` is unavailable but `claude` is available, confirm `ChatFocus` and `/today` `FreeInput` show a calm fallback notice
- if both are unavailable, confirm the notice is shown before send and the copy is actionable
- confirm no surface still says only `AI returned an error`

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: stabilize loom local cli ai runtime"
```

## Self-Review

- Spec coverage: this plan covers the approved product contract: local CLI runtime, `codex` default, automatic `claude` fallback, minimal Settings control, fixed highest-reasoning / maximum-context policy, and consistent runtime grammar.
- Placeholder scan: no `TODO` / `TBD` placeholders remain in the steps.
- Type consistency: use `AiCliKind` for runtime identity, `RuntimeFailure` for recoverable failure analysis, `useAiHealth()` as the shared client hook, and `invokeLocalRuntime()` as the route-level execution helper.
