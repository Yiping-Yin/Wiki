# Design Memory Drift Audit Template

Status: active process template
Updated: 2026-04-13

Use this template for recurring `product vs memory` audits.

Recommended cadence:

- every 1-2 weeks during active design iteration
- before major UI / interaction / AI behavior releases
- after any significant owner feedback that changes product judgment

---

## Audit Metadata

- Date:
- Auditor:
- Scope:
- Branch / commit:
- Related design docs reviewed:

## 1. Mother document alignment

- Which sections of `DESIGN_MEMORY.md` were reviewed?
- Which sections of `CURRENT_DESIGN_CANON.md` were reviewed?
- Which topic specs were reviewed?
- Any contradictions found between memory, canon, spec, and implementation?

## 2. Immutable principle drift

Check whether the live product still reflects these:

- Loom is a loom
- 润物细无声
- source is sacred
- faster and cleaner than handwriting
- thought map is the pattern
- one AI, never split
- recompile, not append
- immersion outranks identity

For each drift found:

- Principle:
- Surface / file / flow:
- Severity:
- Evidence:
- Recommended correction:

## 3. Current implementation lock-in drift

Check whether the live product still matches active lock-ins:

- current interaction model
- current capture behavior
- current review behavior
- current thought-map behavior
- current AI surface behavior
- current list / visual grammar

For each drift found:

- Lock-in:
- Surface / file / flow:
- Intentional or accidental:
- Should canon/spec change instead:
- Recommended action:

## 4. Forbidden list audit

Check for any reintroduction of forbidden patterns:

- completion toasts
- spinners / shimmer / loading copy
- greeting / onboarding fluff
- visible internal scrollbars
- AI avatars / names / typing indicators
- second AI input
- dashboard / gamification elements
- in-product logo / wordmark / splash
- other forbidden items from `DESIGN_MEMORY.md`

For each violation:

- Violation:
- Location:
- Severity:
- Remove now / later:

## 5. AI behavior audit

- Does AI still feel summoned rather than present by default?
- Do responses still begin with content?
- Do responses still end without fluff?
- Has any chatbot theater re-entered?
- Has latency handling regressed into visible system performance?

Findings:

- 

## 6. Source / thought-map audit

- Is source still visually primary?
- Has any persistent inline clutter re-entered?
- Is the thought map still behaving as a core structure rather than metadata?
- Does the current review surface still support woven understanding rather
  than chat-log accumulation?

Findings:

- 

## 7. Complexity audit

Ask the seven decision-trigger questions:

1. Is this too complex?
2. Is there a more refined approach?
3. Does the product already have something that does this?
4. Does it move? Should it?
5. Would the deep reader be rewarded and the shallow reader not punished?
6. Does this duplicate the OS, browser, or existing product?
7. If removed, would anything actually be lost?

Findings:

- 

## 8. Required follow-ups

- Memory updates needed:
- Canon updates needed:
- Spec updates needed:
- Product changes needed:
- Review checklist changes needed:

## 9. Outcome

- Overall status: aligned / minor drift / significant drift
- Highest-priority correction:
- Owner review required: yes/no
