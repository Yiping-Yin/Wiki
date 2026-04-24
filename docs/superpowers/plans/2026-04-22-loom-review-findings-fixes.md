# Loom Review Findings Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the most serious structural mismatches called out in review by making native-backed web data explicit, replacing placeholder-shell routing, and turning exposed mock chapter surfaces into honest or real states.

**Architecture:** Keep the native-first hybrid direction, but demote `localStorage` from authoritative store to fallback cache/transport. Introduce a shared client-side mirror reader that prefers native-injected state, switch panel/pursuit detail to canonical fixed routes with query-bound ids, and wire pursuit detail to real attached objects. Where a chapter surface is still not real, replace fake content with honest empty/gated state.

**Tech Stack:** Next.js app router, client React, node:test AST/unit tests, SwiftData-backed macOS shell bridge.

---

## File map

- Create: `lib/loom-mirror-store.ts`
- Create: `app/panel/page.tsx`
- Create: `app/pursuit/page.tsx`
- Modify: `app/PatternsClient.tsx`
- Modify: `app/PanelDetailClient.tsx`
- Modify: `app/PursuitsClient.tsx`
- Modify: `app/PursuitDetailClient.tsx`
- Modify: `app/SoanClient.tsx`
- Modify: `app/WeavesClient.tsx`
- Modify: `app/ConstellationClient.tsx`
- Modify: `app/BranchingClient.tsx`
- Modify: `app/PalimpsestClient.tsx`
- Modify: `app/HomeClient.tsx`
- Modify: `app/AtelierClient.tsx`
- Modify: `app/patterns/page.tsx`
- Modify: `app/pursuits/page.tsx`
- Modify: `macos-app/Loom/Sources/ContentView.swift`
- Modify: `macos-app/Loom/Sources/ShuttleView.swift`
- Modify: `app/pursuit-placeholders.ts`
- Test: `tests/loom-mirror-store.test.ts`
- Test: `tests/pursuit-detail-contract.test.tsx`
- Test: `tests/canonical-detail-routes.test.tsx`
- Test: `tests/shuttle-canonical-ia.test.tsx`

## Execution notes

- Fix findings in this order:
  1. authoritative mirror contract
  2. canonical detail routes
  3. pursuit detail real attachments
  4. exposed mock chapter honesty
  5. singular IA in primary navigation
- Verify with targeted tests first, then `npm run typecheck`, then `npm run build`.
