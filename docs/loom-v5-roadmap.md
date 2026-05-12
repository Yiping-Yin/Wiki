# Loom v5 — 全面升级路线图

**Date:** 2026-05-05
**Trigger:** User request "应该是对整个Loom都进行彻底的升级"
**Owner:** Sessions of work, must be picked up and continued by future agents

---

> ⚠️ **2026-05-08 update**: 本路线图被 [`docs/loom.md`](./loom.md)（产品规范 v1.1）替代为决策基准。
>
> 本文件保留作为**实施日志**（什么时候做了什么），不再作为方向指引。任何新功能 PR 必须先过 `loom.md` 的四问检查（哪个能力 / 哪个 surface / 6 条 Refusal / flipdisc+Moodle 试金石）。
>
> 简短摘要：Loom = 三能力（信息收集 / 信息整理 / 思维草稿）× Cursor for thought × 异质 corpus（web + 本地文件）。

---

## 路线图概览

| Phase | 目标 | 工程量估计 | 状态 |
|-------|------|-----------|------|
| 0 | Snapshot-as-default + 富态信息分流的雏形 | 2-3h | ✅ 完成 |
| 1 | 视觉语言 v5（typography + chrome 现代化） | 3-5d | 🟡 进行中 |
| 2 | 富态信息引擎（capture-type 自动分类 + split-screen） | 5-7d | ⏳ 待启 |
| 3 | 捕获引擎升级（ServiceWorker offline-first） | 1-2 week | ⏳ 待启 |
| 4 | 知识图层（Library / Search / 跨 capture 关联） | 1-2 week | ⏳ 待启 |
| 5 | AI 集成（Distill / RAG / annotation） | 1 week | ⏳ 待启 |

总：3-5 周 production-grade overhaul

---

## Phase 0 — 已完成（这次 session）

✅ **诊断**：Loom 当前架构对富态信息（interactive demo / WebGL / Astro islands）能力不足  
✅ **Tier ★ 实验**：per-widget iframe gallery — 实现了但视觉混乱（与 markdown body 双轨冲突）  
✅ **Tier 1 落地**：snapshot-as-default —— 单一 iframe 1:1 还原原页，干净统一  
✅ **iframe sandbox 修复**：snapshot/page.tsx + capture/page.tsx 都强制 `allow-same-origin allow-scripts ...`  
✅ **快照内容修复**：4 个补丁（ssr= 属性 / importmap / props 图片内联 / bundle 图片内联）—— 已落到 extension content.js，下次 fresh capture 自动应用  
✅ **headless 验证**：Chromium + WebKit at file:// 6/6 widgets 全部 work

⚠️ **未解决**：Loom UI 中 React fiber 不挂载（typing input[0] 不同步 input[1..4]）。原因不明，可能 WKWebView 嵌套 iframe 特定 bug。**Phase 1 期间需要 deep-dive 解决**。

---

## Phase 1 — 视觉语言 v5（进行中）

### 设计目标
- 去咖啡色木纹感，改为克制现代深色 + 暖灰中间调
- Typography 4 级金字塔（Display / Headline / Body / Caption）
- 精简 token 数量（176 → ~80）
- chrome 减薄（toolbar/breadcrumb 单层）

### Tasks
- [ ] 1.1 重做 globals.css 的 surface tokens（保留 kesi 灵魂，去厚重感）
- [ ] 1.2 capture 页 chrome 简化（toolbar 单行 + 浮动）
- [ ] 1.3 captures list 视觉刷新（更克制的 entry 卡片）
- [ ] 1.4 minimal root sidebar 现代化（折叠态 / hover 高亮 / 节奏）
- [ ] 1.5 snapshot view 框架（外层 chrome + 内层 iframe 视觉过渡）
- [ ] 1.6 dark mode 配色重做（去土色，更克制）
- [ ] 1.7 code blocks 升级（高亮 + 行号 + copy）
- [ ] 1.8 设计文档：`design-system-v5.md`

### Deliverables
- 视觉对比截图 before/after
- 新 token 表
- 应用范围：capture / captures / minimal-root / snapshot / library

---

## Phase 2 — 富态信息引擎

### 核心：分类 → 分流 → 各得其所

```
              capture 时分类
                    │
        ┌───────────┼───────────┐
        │           │           │
    article   interactive    data
    Reader    Snapshot      Structured
```

### Tasks
- [ ] 2.1 Extension content.js: 在 capture 时统计 islands/canvases/scroll-listeners，emit `capture-type` 字段
- [ ] 2.2 Loom.md frontmatter: 持久化 capture-type
- [ ] 2.3 capture/page.tsx 按 type 选默认渲染模式
- [ ] 2.4 Split-screen UI: snapshot 左 + reader 右，可拖动分割
- [ ] 2.5 双向滚动同步（snapshot 滚动 → reader 跟随，反之亦然）
- [ ] 2.6 修复 Loom UI iframe 嵌套导致的 React hydration 失败

---

## Phase 3 — 捕获引擎升级

### Goal: 100% offline fidelity, 0% iframe nesting issues

- [ ] 3.1 ServiceWorker 注册到 `loom-snapshot://<sha>` origin
- [ ] 3.2 SW 拦截 snapshot 内所有 fetch，从 inline cache 服务
- [ ] 3.3 替代当前的 importmap data:URL 方案
- [ ] 3.4 widget bundle: 每个 astro-island 一个独立 sw 缓存条目
- [ ] 3.5 移除 srcDoc + iframe 嵌套链路（直接 src 到 sw origin）
- [ ] 3.6 完全消除"snapshot 在 file:// 工作但在 Loom 里不工作"的差异

---

## Phase 4 — 知识图层

- [ ] 4.1 Library view 重做（grid / list / timeline 视图切换）
- [ ] 4.2 Search 升级（sourceful + semantic + tag-aware）
- [ ] 4.3 Capture metadata 重做（tags / collections / cross-refs）
- [ ] 4.4 Annotation 系统（在 snapshot 上贴注释 layer）
- [ ] 4.5 Loom Web of Captures（关联视图）

---

## Phase 5 — AI 集成

- [ ] 5.1 Distill v2: capture-type-aware（article 摘要 vs interactive 描述）
- [ ] 5.2 RAG over captures（语义检索）
- [ ] 5.3 跨 capture comparative analysis
- [ ] 5.4 AI annotation suggestions

---

## 当前 session 终点

Phase 0 完成。Phase 1 触地（写 ROADMAP + 视觉初稿）。

下次 session 入口：阅读本文件 → 选择 Phase 1 子任务（建议从 1.1 surface tokens 开始） → 提交 → 提交 → 推进。

---

## 2026-05-05 23:59 milestone — Annotation layer end-to-end + cross-capture quotes

This long autonomous session landed phases 4.4-v2 / 4.5 / 4.6 / 4.6.5.

### Phase 4.4-v2 — Vimeo / iframe scroll-jacking fix
Permanent click-to-activate. Iframes start with `pointer-events:none`
(`important` priority); a bronze-bordered overlay reads "▶ Click to
activate · scroll passes through". Replaces the wheel-toggle 4.4-v1
which caused white-flash from rapid pointer-events flipping.
File: `LoomURLSchemeHandler.swift` `injectAnnotationRuntime`.

### Phase 4.5 — Delete + jump-to-source
`loom://native/delete-quote.json` removes a quote (deletes the
sidecar file when the array goes empty). Quote-card click in the
per-capture panel posts `loom-jump-to-quote` to the snapshot iframe;
the injected runtime TreeWalker-finds the text, scrolls in, flashes a
1.4s bronze highlight. ✕ Delete button per card. File:
`app/loom-render/capture/page.tsx` `CaptureQuotesPanel`.

### Phase 4.6 — Cross-capture Quotes view (library aggregation)
- Native bridge `loom://native/quotes-all.json` walks every active
  root + every `Loom-quotes.json` sidecar; emits
  `{ entries: [{rootID, subPath, text, sourceURL, savedAt}, ...] }`
  sorted by savedAt desc.
- New "Quotes" pivot chip on the captures landing. Active pivot
  bypasses the magazine and renders a flat stack of kesi-serif quote
  cards. Card click deep-links to the source capture with
  `?…&quote=<savedAt>`; the capture page reads that arg and
  auto-jumps + flashes the source text after iframe load.
- Lazy fetch on first pivot switch; refresh on `loom:quote-saved` /
  `loom:quote-deleted` window events (dispatched by save / delete).
- Files: `LoomURLSchemeHandler.swift` (`buildQuotesAllPayload`),
  `app/loom-render/captures/page.tsx` (`AllQuotesPanel` +
  `PivotKey:'quotes'`),
  `app/loom-render/capture/page.tsx` (`wantedQuoteSavedAt` deep-link).

### Phase 4.6.5 — Quote search reuses top search box
The captures landing's debounced top search box also filters the
Quotes view. Case-insensitive match against quote text + source
title + eyebrow + domain. Distinct "No quotes match …" empty state
when filter yields zero.

### Build / deploy this session
- `xcodebuild -project Loom.xcodeproj -scheme Loom -configuration
  Release -derivedDataPath /tmp/loom-build` → `BUILD SUCCEEDED`,
  `ditto` to `/Applications/Loom.app`.
- `node scripts/build-static-export.mjs` for React; output at
  `.next-export/`.
- Loom launched with `LOOM_PROJECT_ROOT=<repo>` so the URL scheme
  handler serves the freshly built `.next-export` directly without
  needing a re-stage into `Loom.app/Contents/Resources/web`.
- Verified by string-search of binary + chunks. **End-to-end live
  verification still pending** — user has zero quote sidecars on
  disk so they need to save one quote first to exercise the full
  loop.

### Next session entry points
- **Phase 5**: AI integration on quotes — quote-aware distill prompt;
  RAG over the cross-capture quote corpus; "find related quotes"
  affordance.
- **Phase 4.7 (polish)**: quote tags / collections; export to
  markdown or Anki cards.

---

## 2026-05-06 00:30 milestone — AI on quotes (Phase 5.1 + 5.2)

### Phase 5.1 — Per-capture quote synthesis
- Native bridge `loom://native/synthesize-quotes.json?root=…&sub=…&title=…`
  reads `Loom-quotes.json` for the capture, builds a "find 2–4 themes
  across these quotes, cite by number" prompt, hands to the active AI
  provider (Anthropic / OpenAI / Apple Foundation / Custom / Ollama /
  Codex CLI — same provider switch as distill). Returns
  `{ success, summary, count, provider }` markdown.
- UI: a `✦ Synthesize themes` button in the per-capture quotes panel
  header (visible when ≥2 quotes). Click → fires the bridge → renders
  the markdown response inline above the quote stack with a bronze
  left-rule. Handles `success: false` with an inline error chip.
- Files: `LoomURLSchemeHandler.swift` (`respondSynthesizeQuotesJSON`,
  `buildSynthesizeQuotesPrompt`), `app/loom-render/capture/page.tsx`
  (`onSynthesize` + button + result-render in `CaptureQuotesPanel`).

### Phase 5.2 — Cross-capture quote synthesis
- Native bridge `loom://native/synthesize-all-quotes.json?limit=30`
  walks every active root's `Loom-quotes.json` sidecars, joins each
  quote with its source capture title (read from sibling `Loom.md`'s
  first `### …` heading), takes the most-recent N (default 30, capped
  60), and asks the AI to find 3–5 threads connecting quotes ACROSS
  sources. Different prompt from 5.1 — explicitly excludes
  single-source threads.
- UI: `✦ Synthesize across captures` bar at the top of the captures
  landing's Quotes pivot view. Click → fires the bridge → renders
  markdown above the quote stack. Shows "from N of M quotes · via
  <provider>" hint after success.
- Caps the prompt size by truncating each quote at 500 chars and the
  set at 60 quotes — protects against API token budget runaway.
- Files: `LoomURLSchemeHandler.swift`
  (`respondSynthesizeAllQuotesJSON`, `buildCrossCaptureSynthesisPrompt`),
  `app/loom-render/captures/page.tsx` (`onSynthesize` in
  `AllQuotesPanel` + new bar markup + styles).

### Build / deploy this milestone
- Same flow as the previous session: `xcodebuild` → `ditto` →
  `node scripts/build-static-export.mjs` → relaunch with
  `LOOM_PROJECT_ROOT` env. All four binary+chunk strings verified.

### Phase 5 still open
- **5.3 RAG / find-related-quotes** — needs an embedding store + a
  cheap nearest-neighbor lookup. Defer until the user has organic
  quote density that justifies it (single-digit quote counts can be
  served by 5.1+5.2 synthesis directly; embeddings only help once the
  list is too long for the synthesis prompt).

---

## 2026-05-06 00:50 milestone — Phase 4.7 quote tags

### Schema change
Each quote in `Loom-quotes.json` gets an optional `tags: string[]`.
Backward compatible — quotes without `tags` render as no-tag, the
sidecar shape stays JSON-stable across versions.

### New bridge
`loom://native/tag-quote.json?root=…&sub=…&savedAt=<iso>&tags=tag1,tag2`
overwrites the tags array on one quote (identified by savedAt).
Empty `tags=` removes all tags. Server-side trims, dedupes
case-insensitively, caps each tag at 32 chars and the list at 12.
Returns `{ ok, tags: [canonical], count }`. The
`buildQuotesAllPayload` walker also propagates tags through the
cross-capture payload.

### Per-capture quotes panel UI
Tag chip row sits between the quote text and the meta bar. Each
chip shows the tag name + a hover-reveal × button that removes it.
A `+ tag` chip at the end opens an inline `<input>` (autoFocus,
Enter to save, Esc/blur to cancel, max 32 chars). Optimistic state
update: on bridge success the canonical (deduped) tag list returned
by the server replaces the local state.

### Cross-capture quotes view UI
Same per-card chips + add affordance. Plus a tag-filter strip at the
top of the panel: "All [N]" + one chip per distinct tag, each with
the tag's count. Click a tag → filter; click the same tag again or
"All" → clear. Filter composes with the existing top-search-box
filter (Phase 4.6.5) — match against tag AND text/title/domain.

### Files changed
- `LoomURLSchemeHandler.swift` — `tagQuote` enum case, dispatch,
  `buildTagQuotePayload`, tags propagation in `buildQuotesAllPayload`.
- `app/loom-render/capture/page.tsx` — tag UI in `CaptureQuotesPanel`,
  `onAddTag`/`onRemoveTag`/`onSaveTags` callbacks, chip row CSS.
- `app/loom-render/captures/page.tsx` — `activeTag` state,
  `tagChips` derivation, tag-filter strip, per-card tag UI in
  `AllQuotesPanel`, `onSaveQuoteTags` callback,
  `Dispatch<SetStateAction<...>>` type import.

### Build / deploy
Same flow. Verified `tag-quote` + `buildTagQuotePayload` strings in
binary; chunk verification pending build retry (filesystem flake on
first attempt — pagefind copy ETIMEDOUT, retried).

---

## 2026-05-06 01:00 milestone — Phase 4.7.5 + 4.8

### Phase 4.7.5 — Tag-aware cross-capture synthesis
The `synthesize-all-quotes.json` bridge now accepts an optional
`tag=<name>` query arg. When set, only quotes with that tag (case
insensitive) are fed to the prompt. The captures landing's
`AllQuotesPanel.onSynthesize` automatically passes the currently
active tag (the chip selected in the tag-filter strip from 4.7).
Button label updates to `✦ Synthesize ‘<tag>’ quotes` when a tag is
selected so the user sees what scope the action will run on.

### Phase 4.8 — Copy quotes as markdown
- Per-capture panel: `⧉ Copy all` button next to Synthesize. Each
  card also has a `⧉ Copy` link next to Delete that copies just that
  quote.
- Cross-capture panel: `⧉ Copy filtered/all` button (label adapts to
  whether a search/tag filter is active). Each card has its own
  `⧉ Copy` link in the tag row, right-aligned via flex auto-margin.
- Markdown shape:
  ```
  > Quote text
  > _Tags: #foo #bar_
  > — [Source title](source-url)
  ```
  Multi-line quote text gets each line prefixed with `> `. Bulk
  copy joins entries with a blank line.
- Inline `✓ Copied N quotes` toast fades after 1.4-1.6s.
- File: `app/loom-render/capture/page.tsx` (`onCopyQuote`,
  `onCopyAllQuotes`, `formatQuoteAsMarkdown`),
  `app/loom-render/captures/page.tsx` (`onCopyOne`, `onCopyAll`).

### Total session deliverable
This long autonomous run (4.4-v2 → 4.5 → 4.6 → 4.6.5 → 5.1 → 5.2
→ 4.7 → 4.7.5 → 4.8) is a complete v5 annotation layer:
- Save quotes from any capture (Phase 4.x baseline).
- Persist + delete + jump-to-source (4.5).
- Library-level cross-capture view (4.6).
- Filter by text or tag (4.6.5 + 4.7).
- AI-synthesize themes per-capture or across captures, tag-scoped
  if desired (5.1 / 5.2 / 4.7.5).
- Export quotes as markdown for use elsewhere (4.8).
- Video iframes no longer scroll-jack the page (4.4-v2).

### Phase 5.3 still open (deferred)
RAG / find-related-quotes via embeddings + nearest-neighbor lookup.
Will become valuable once the user accumulates enough quotes that
synthesis prompts can't fit them all in the context window. Until
then, the 30-quote-cap synthesis (5.2) covers most use cases
directly.

---

## Known issues / Open questions

1. **WKWebView 嵌套 iframe React hydration**: 在 Loom UI 中 React 18 createRoot 不附 fiber 到 DOM 元素。Phase 3 SW 重构应该顺带解决，但短期 Phase 1/2 期间这是已知 bug。
2. **Snapshot-as-default 排版问题**: 原网站排版与 Loom kesi 哲学冲突。Phase 2 split-screen 方案是答案。
3. **Loom typography 升级 vs 简洁**: Phase 1.6 dark mode 重做需要审美判断 —— 保留多少 Vellum 木纹感。需要用户参与决策。

---

## 文件参考

- `app/globals.css` — design tokens (6182 lines)
- `app/loom-render/capture/page.tsx` — capture rendering (~6300 lines)
- `app/loom-render/snapshot/page.tsx` — snapshot rendering
- `app/loom-render/captures/page.tsx` — captures list
- `macos-app/Loom/Sources/LoomMinimalRootView.swift` — root SwiftUI shell
- `macos-app/Loom/Sources/CapturesView.swift` — Swift captures wrapper
- `macos-app/Loom/Sources/LoomURLSchemeHandler.swift` — URL handler
- `macos-app/Loom/LoomWebExtension/Resources/content.js` — capture engine
