# Loom Local CLI AI Runtime · Product Design

Status: approved current product model  
Updated: 2026-04-16

## 1. Decision

Loom will use the user's **local machine AI CLIs** as its AI runtime for the current product phase.

The shipped contract is:

- **Local CLI runtime**
- **Supported providers:** `Codex CLI`, `Claude CLI`
- **Default priority:** `codex`
- **Automatic fallback:** `claude` when `codex` is unavailable
- **User can manually choose a preferred runtime in Settings**
- **No provider OAuth**
- **No API key entry**
- **No Loom-hosted AI account in this phase**
- **Default inference policy is fixed**
  - highest thinking level
  - maximum context

This is a local-runtime product model, not a cloud-account model.

## 2. Product Goal

Loom should feel like it has **one coherent AI runtime layer**, even though execution is delegated to local CLIs on the user's machine.

The user experience should be:

1. User invokes an AI action.
2. Loom uses the preferred runtime if available.
3. If the preferred runtime is unavailable, Loom falls back automatically to the other allowed runtime.
4. If neither runtime is usable, Loom presents a calm, actionable status.

The user should not need to understand:

- transport-level errors
- CLI launch details
- session file permission failures
- provider-specific failure grammars at random points of the product

They may still understand that Loom uses `Codex CLI` or `Claude CLI`, but Loom should mediate those states as a product-owned runtime layer.

## 3. Why This Model

This model matches the current product and deployment reality:

- the user already has local AI tooling on their machine
- Loom does not need to provide AI service itself right now
- the user does not want a separate API-key-based provider setup flow
- the user does not want a fake OAuth design that cannot actually back first-party API usage

So the correct shape is:

- make local CLI runtime first-class
- stabilize it
- reduce user-facing friction
- avoid pretending the app owns a cloud AI account that does not exist yet

## 4. Chosen Product Shape

### 4.1 Runtime Identity

Loom presents one concept:

- `AI Runtime`

Internally this resolves to:

- `codex`
- `claude`

But the product should make those feel like runtime choices inside Loom, not like raw infrastructure leakage.

### 4.2 Default Behavior

The runtime policy is fixed:

- first try `codex`
- if `codex` is unavailable, automatically try `claude`
- if both are unavailable, surface one calm failure state

This is the default even if the user has never opened Settings.

### 4.3 User Preference

Settings may expose a minimal user preference:

- `Preferred AI runtime`
  - `Codex CLI`
  - `Claude CLI`

This does **not** disable fallback.

The user's chosen runtime becomes the first-choice runtime, but Loom still automatically falls back to the other runtime when needed.

## 5. Settings Model

Settings contains one minimal AI section:

- preferred runtime
- current provider availability
- fixed policy label

The fixed policy label is informational only:

- `Highest reasoning`
- `Maximum context`

Do not expose:

- model tuning knobs
- context sliders
- per-surface runtime selection
- advanced provider transport settings

## 6. Runtime Behavior

All AI surfaces should resolve through one shared runtime broker.

That means:

- `ChatFocus`
- `FreeInput`
- note completion
- examiner
- summarization
- ask / recommend / structure routes

should all behave as one runtime system, not as isolated provider integrations.

The common flow becomes:

1. Determine preferred runtime.
2. Check runtime availability.
3. Execute with preferred runtime.
4. If recoverable failure occurs, automatically retry with fallback runtime.
5. Return the result or a single calm failure message.

## 7. Health Model

The runtime layer should present a shared health model across the app.

Conceptually each runtime may be:

- `available`
- `unavailable`
- `unknown`

Unavailability may come from:

- authentication failure
- session permission failure
- CLI spawn failure
- timeout
- transport/backend failure

But product surfaces should not dump raw implementation details by default.

Instead, they should express:

- the preferred runtime is unavailable
- Loom is using the fallback runtime
- neither runtime is currently usable

Detailed causes may still appear in Settings or a developer-facing path.

## 8. Error Grammar

Preferred product grammar:

- `Codex CLI unavailable. Loom will use Claude CLI for now.`
- `AI unavailable — Codex and Claude are not authenticated. Open Settings, sign in to one provider, then retry.`
- `AI unavailable — Codex CLI cannot access ~/.codex session files. Fix permissions or switch runtime in Settings.`

Avoid low-level surface wording like:

- websocket failed
- missing bearer token
- authrequired
- reading additional input from stdin

These should be translated into runtime-level product language.

## 9. Inference Policy

The default policy is fixed:

- highest thinking level
- maximum context

This policy applies across all AI surfaces in this phase.

It is not user-configurable.

This means Loom should not expose:

- "fast vs deep" toggles
- context budget controls
- per-tool inference tuning

in the current version.

## 10. Information Architecture

There are only two user-visible runtime surfaces in this phase:

1. `Settings > Preferred AI runtime`
2. quiet inline notices at AI entry points when the runtime state matters

No separate account page is needed.
No first-use OAuth gate is needed.
No provider setup wizard is needed.

The runtime should be discoverable through use and maintainable through Settings.

## 11. Non-Goals

This version does **not** include:

- OpenAI or Anthropic OAuth login inside Loom
- API key entry
- Loom-hosted AI service
- multi-device runtime sync
- per-surface provider switching
- per-surface model selection
- user-facing reasoning/context controls
- token usage accounting
- cloud account identity

## 12. Migration from Current State

The current system already has:

- provider preference in localStorage
- basic health checks
- local CLI wrappers
- fallback behavior in some code paths
- scattered error copy

The next stabilization pass should formalize that into one product layer.

### Phase 1 · Runtime broker consolidation

- formalize the shared local runtime contract
- centralize fallback semantics
- centralize health classification
- centralize user-facing error grammar

### Phase 2 · UI stabilization

- expose preferred runtime in Settings as the only normal control
- keep fixed inference policy visible but read-only
- show runtime status earlier in AI entry surfaces

### Phase 3 · Route consolidation

- bring all AI routes under the same broker behavior
- remove route-by-route drift in fallback/error semantics
- keep CLI-specific details behind stable product-level wording

## 13. UX Rules

- AI should feel singular even though it uses local CLIs underneath.
- The preferred runtime should be understandable and reversible.
- Fallback should be automatic when safe.
- Failures should be calm, actionable, and early.
- Runtime configuration should stay minimal.
- The system should reduce provider friction rather than amplify it.

## 14. Testing Requirements

### Runtime tests

- preferred runtime resolves correctly
- `codex` is the default first-choice runtime
- if preferred runtime fails with a recoverable issue, fallback runtime is attempted
- if both runtimes fail, the broker returns one stable user-facing failure state

### Settings tests

- user can set `Codex CLI` or `Claude CLI` as preferred runtime
- legacy preferences migrate cleanly to `codex` default where required
- runtime status appears in Settings

### Surface tests

- `ChatFocus` reflects fallback behavior correctly
- `FreeInput` reflects fallback behavior correctly
- AI entry surfaces show inline notices before the user collides with a hard failure

### Regression tests

- local CLI runtime still works across `/api/chat` and sibling AI routes
- runtime failures no longer show inconsistent wording across surfaces

## 15. Open Implementation Questions

These are implementation questions, not product-shape questions:

- whether all AI routes should reuse exactly one broker helper
- whether local CLI health should be cached per runtime and for how long
- whether some failure classes should skip fallback entirely
- how much detail to surface in Settings vs only in logs
- how desktop shell integration should expose runtime state, if at all

These should be resolved in the implementation plan, without changing the product contract above.

## 16. Recommendation

Proceed with:

- local CLI runtime as the current product model
- one shared Loom AI runtime broker
- default-first `codex`
- automatic fallback to `claude`
- manual preferred-runtime switch in Settings
- fixed highest-reasoning / maximum-context policy

This is the smallest design that matches the current product reality while still making Loom feel deliberate and stable.
