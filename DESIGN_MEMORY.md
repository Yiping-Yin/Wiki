# Loom · Design Memory

Last updated: 2026-04-10 (rev 27)

---

## Part 0 · Product Core · 五条不可还原的定义

这五条从 39 条原则中提炼而来。每一条都不可删减。合在一起,它们**完整定义了 Loom 是什么**。任何未来的设计决策,如果和这五条中的任何一条冲突,决策是错的。

---

### ① Loom 是织机

> 织匠的工作过程,就是思考者用 Loom 的过程。

Loom 不"借喻"缂丝。Loom **就是**缂丝 — 织的材料从丝线变成了思维。

物理织机吸收了对齐、绷紧、结构化的负担,织匠只需要选色和断纬。Loom 吸收了整理、锚定、结构化的负担,使用者只需要**提问和判断**。

产品的每一个动作都是缂丝的一个物理动作:

```
阅读     = 看到经线(源材料)
提问     = 过一次梭子
AI 回答   = 纬线被织入
✓ commit = 一个色块完成
crystallize = panel 入库
/kesi    = 展开你的整幅缂丝
```

### ② 润物细无声

> 春雨是功能名字,润是功能的动作,如酥是最终效果。但是整个过程,是让人感觉悄无声息的。

工具存在,动作发生,结果丰富 — 但用户**只感觉到结果**。不感觉到工具出场,不感觉到 AI 在工作,不感觉到界面在变化。像春雨落在土上: 你感觉到的是清晨的湿润和花香,不是雨滴本身。

这不是"零动画" — 入场、阴影、渐变都允许。约束是**体感**,不是技术手段。

### ③ 原文神圣,笔记不扰

> 沉浸式的工作,沉浸式的思考。主体是注意力最直接的地方。不要有其他东西喧宾夺主。

源文档**永远不被修改、不被插入、不被打断**。笔记以 ◆ 标记存在于页边,三层渐进显现:

- **Layer 0**: 纯阅读。零标记。沉浸。
- **Layer 1**: 页边极微的 ◆ 点(4px)。余光察觉"这里有笔记"。
- **Layer 2**: hover ◆ → 单条笔记浮出。鼠标移开消失。
- **Layer 3**: ⌘/ → 所有笔记同时浮现,原文暗淡。思维结构全景。

用户决定看多少。默认永远是零。

### ④ 比手写更干净更快

> 不是替代手写,是让思维比手写更干净更快。缂丝的过程也是这个道理。

如果某个操作比拿笔写字还慢 → 设计错了。
如果 AI 的产出比手写还乱 → prompt 错了。
标准不是"和手写一样好" — 是**超过手写**。

这是产品存在的理由。手写 = 人自己组织,结果乱。Loom = AI 替你组织,结果是结构化的 thought-anchor。

### ⑤ Thought Map 是画稿

> 缂丝的过程就是织匠脑里有快速的思维,有完整的架构,才能准确无误的完成织。

织匠开工前,脑中已有整幅图案(画稿): 哪里断纬、哪里换色、下四十步怎么走。没有画稿,手再快也只能织出乱线。

Loom 的 **Thought Map**(◆ 结构)是画稿的数字化投影:
- 开始前: ◇ 空节点,显示文档的每个 section — 你**可以**织的图案
- 过程中: 每次 ✓ commit 填一个 ◇ → ◆ — 图案成形
- 任何时候: ⌘/ 全览 — 织匠退后看整体的动作

**Thought Map 不是一个功能。它是产品存在的理由。** 没有它,Loom 只是 chat 工具。有了它,Loom 才是织机。

---

*以上五条是 Loom 的全部。39 条具体原则是它们的推论。*

---

## Part I · Supreme Principles (the constitution)

These are the laws that override all other considerations. When two principles
conflict, the lower number wins.

### §0 · The Apple Continuum
> "设计的标准是希望 Apple 系统上使用时完全的沉浸感。所以要和 Apple 统一"

Loom must feel like an Apple first-party app — not "look like" Apple, but
actually feel native on macOS / iPadOS. The user should never sense that they
are using a web app.

**Practical implications:**
- System-level integration: P3 colors, dynamic type, prefers-color-scheme,
  prefers-reduced-motion, prefers-contrast
- macOS HIG keyboard conventions (avoid browser-occupied shortcuts)
- Native scrollbar behavior (overlay, fades on idle)
- SF Pro typography
- Spring motion that mirrors macOS Sonoma+ system animations

### §1 · 悄无声息,而不是喧宾夺主 · 润物细无声
> "悄无声息,而不是喧宾夺主" / "这种沉浸感才能和思维的活跃搭配"
> "沉浸感的一个重要使用感受就是润物细无声"

Every visible UI element taxes the user's attention budget. Immersion is not
a matter of taste — it is **cognitive infrastructure**. For thinking to be
active, the interface must withdraw to near-invisibility.

**润物细无声** (Du Fu, 春夜喜雨 — *moisten things silently, imperceptibly*)
extends 悄无声息 in a critical way: stealth alone is not enough. The system
must also be **continuously, gently doing its work** in the background — like
a fine spring rain that nourishes the soil without anyone noticing it fall.

The distinction matters:
- 悄无声息 = absent until summoned (the *negative* requirement)
- 润物细无声 = quietly working even when you don't see it (the *positive* one)

Together they describe a UI that disappears visually but is always
contributing — saving traces, weaving panels, surfacing recall, embedding,
indexing, recomputing mastery — without ever announcing itself.

**Practical implications:**
- Default state of every chrome element is "absent"
- Visible only when summoned by intent
- No always-on toolbars, status bars, indicators, badges
- Empty space is content, not opportunity for decoration
- **Background work never asks for permission, never reports completion,
  never shows a progress bar.** Save indicators, "synced ✓" toasts, "AI is
  thinking" overlays, "indexing 47 of 200" banners — all forbidden. The user
  notices the *result* (a new recall card, a denser kesi, a faster search)
  but never the *act*.
- No confirmation dialogs for reversible actions. No "are you sure" for
  anything that can be undone.
- Animations that mark background work (a brief shuttle, a hairline
  fade-in) are allowed, but only at the moment of *delivery*, never at the
  moment of *attempt*.

### §2 · AI like Siri · AI 也要润物细无声
> "就像 Siri 一样,感受不到它的存在,但是需要时它自动就在"
> "包括 AI 本身也要给使用者这个感受"

AI is summoned, not opened. There must be no persistent AI button, panel,
icon, or affordance. Only one keyboard shortcut and one contextual selection
trigger may exist. When the AI is not in use, the screen is the same as if
no AI existed.

**润物细无声 applies to the AI's *output and behavior*, not just its UI.**
The AI itself must feel like rain on soil — present in the result, invisible
in the act. This shapes the system prompt, the streaming behavior, and the
content of every response.

**Forbidden in AI output:**
- Preambles: "Sure!", "Of course!", "Great question!", "I'd be happy to…"
- Self-narration: "Let me think about this…", "I'm going to start by…",
  "Now I'll explain…", "First, let me…"
- Trailing recaps: "To summarize what I just said…", "In short, …" (when
  the answer is already short), "Hope this helps!", "Let me know if…"
- Meta-disclaimers: "As an AI…", "I should note that…", "It's worth
  mentioning…", "Keep in mind that…"
- Effort signals: "This is a complex topic but…", "Bear with me…",
  "I'll try my best to…"
- Permission-seeking: "Would you like me to…?", "Should I go deeper?",
  "Want me to expand on this?"
- Identity statements: "I'm Claude", "As your assistant", any first-person
  framing of role
- Affective copy: "Fascinating!", "Beautiful question!", any emoji,
  exclamation marks beyond the literal content

**Required in AI output:**
- Start with the answer's first content word, not a transition
- End at the last content word, not a wrap-up
- Markdown when it aids comprehension; plain text when it doesn't
- Same register as a teammate's whiteboard explanation — declarative, dense,
  no performance
- If the user's question is unclear, ask exactly one short clarifying
  question and stop. No "I want to make sure I understand correctly…"

**Behavioral implication:** The AI should never prompt the user to come
back. No "want me to elaborate", no "let me know if". The user re-engages
when they want to; the AI's job is to be ready, not to chase.

The system prompt sent from QuickBar must enforce this. So must any future
agent / decompose / explain prompt. This is a project-wide invariant.

**润物细无声 also covers the *whole arc of interaction*, not just the
words spoken.**

> "AI 在不展示的时候的陪伴到展开参与这个整个过程都需要这个状态"

The full lifecycle — *companion (absent-but-present)* → *summon* →
*engagement* → *dismissal* → *companion again* — must feel like rain
falling, pooling, soaking in, evaporating. Not like an app opening, taking
the stage, performing, and closing.

This rules out a long list of "normal" UI conventions:

- **No entrance animation that announces arrival.** QuickBar appearing must
  feel like a thought surfacing, not a modal launching. Spring scale-in,
  bounce, slide-from-edge — all forbidden. Only opacity + a few pixels of
  vertical settle.
- **No "AI is thinking" state between summon and first token.** Spinners,
  shimmer placeholders, "Claude is typing…" copy, animated dots — all
  forbidden. The shuttle bar (§19) is the *only* allowed indicator, and
  even it must be small and lateral, not central.
- **No "ready" state.** The AI does not announce that it has been
  summoned. Cursor lands in the input. That is the entire "hello".
- **Latency must be masked, not labeled.** If the first token takes 400ms,
  the gap is silence — never a label saying "thinking…". If it takes
  longer, the shuttle is enough.
- **Dismissal must feel like rain stopping.** No exit animation that
  collapses inward, no "saved ✓" toast, no "session ended" anything. Esc
  → opacity to 0 over 180ms → gone. The same artifact in the main frame
  is unchanged; the AI just stopped being asked.
- **The "absent-but-present" companion state is the default.** Between
  invocations, AI presence is felt only through its prior contributions
  already living in the artifact / trace. No floating bubble in the
  corner, no breathing dot, no "I'm here if you need me" affordance.
  Presence is *implicit in the kesi*, not signaled by chrome.
- **Continuity across summons.** Re-opening QuickBar on the same doc must
  feel like resuming a half-thought, not starting a new session. Same
  trace, same context, no "Welcome back" anything, no greeting, no
  re-introduction.

The test: if a user closed their eyes, summoned the AI, asked something,
got an answer, and dismissed it — the only thing they should sense is the
*answer arriving*. Not the AI arriving. Not the AI leaving. Not the AI
waiting. Just the answer, the way rain just makes the soil wet without
anyone noticing the drops fall.

### §3 · One AI, never split
> "AI 系统也要重做并统一" / "AI 也要陪着人一起快速联动"

Loom may have only **one** AI input across the entire app. The AI must
context-bind automatically (current document → that doc's trace; non-doc
page → a daily free trace). No separate chat panels, drawers, or floating
buttons may compete for the same role. All AI conversation must persist —
nothing is lost when a tab is closed.

### §4 · Don't reinvent what the browser provides
> "网页一般自带滚动条,除非是 app 里可以直接重新设计。不然这个功能其实需要重新考虑"

If the browser already provides a feature (scrollbar, tab navigation,
back/forward, URL bar, text selection), do not reinvent it inside the web
app. The exception is when the app fully replaces the native function with
a deeply customized alternative — but partial reinvention always loses.

### §5 · Glass over surface
> "Apple 的设计风格,玻璃感,这些也要保持"

Stealth does not mean flat. Apple material — `material-thin / regular /
thick` glass with backdrop blur, inner highlight, aurora bloom, grain — is
the visual baseline. Every container that has a background must default to
glass. Solid `bg-elevated` is a fallback, never a first choice.

### §6 · Slow hands, fast mind
> "kesi 虽然是慢工出细活的作品,但是不代表编织的手工艺人脑袋不活跃"

The kesi craft is slow only at the hands. The weaver's mind is fully active
— holding the entire pattern, every transition, the next forty moves. Loom's
calm interface is not a reflection of slow function. It is calm so the mind
can run.

**Implication:** Never confuse "calm UI" with "slow features." Fast AI
response, instant streaming, immediate recall, and zero-step interaction are
all required alongside the visual restraint.

### §7 · Errors are local, like blocks on a chain
> "通经断纬的方法可以让完成作品不中断。有点类似区块链,或者工程分工进行"

通经断纬 (continuous warp, broken weft) means a mistake in any one panel
never unravels the others. Each Trace is an append-only event log; each
panel is independent. Mistakes are atomic, like a git commit. This is the
data architecture, the UI behavior, and the philosophical stance.

### §8 · Two surfaces, one trace · the artifact is recompiled, not appended
> "Loom 里的主体展示就是实时更新的总结。像 openai prism 一样实时编译了"
> "偶尔就会打断你的原来进程,就导致需要调整下一步方向...然后我需要你把这些总结,开始下一步"

The main-frame display is **not a chat log of AI answers**. It is a single
living artifact (a derivation, a note, a panel) that gets **fully
recompiled** every time the user adds new input. Each new question, each
new piece of feedback, each correction does not produce a new section
appended below — it produces a new *version* of the same artifact, the way
Canvas / Artifacts / OpenAI Prism rewrite a document in place.

The cognitive principle: in the chat-log model, the user must mentally fold
all turns to know "what is the current best understanding". Loom must do
this folding for the user. The user always sees the latest version — the
prior versions are never lost, but they are not what the eye lands on.

**Architecture:**
- **Scratchpad (QuickBar)** = the input stream. Append-only, the literal
  history of the user's hand moving.
- **Live Artifact (main frame)** = the output. A single composed object
  that the AI rewrites in full on every turn, given (a) the source
  material, (b) the entire scratchpad history, (c) the previous version of
  the artifact.
- **Trace** = the substrate. Append-only event log per §7. Every recompile
  is a `kind: 'recompile'` event with a pointer to the previous artifact
  hash. Versioned, replayable, undoable, but not visible by default.

This is the kesi metaphor at full force:
- The shuttle moves (scratchpad input)
- The pattern emerges and reshapes itself (live artifact)
- The back of the tapestry holds every knot (trace event log)
- You only ever look at the front

**Implication for AI prompts:** The model is not asked "answer this
question." It is asked "given this artifact and this new input, produce the
next version of the artifact." The system prompt for this mode must make
the recompile contract explicit.
> "和 AI 的快速推演思维展示是在主框,像 Wiki 里的笔记展示一样,只是它是实时更新。和 AI 的对话框,应该就像草稿纸一样,无负担,快速使用"
>
> "AI 对话框这里是相当于成为了另一种草稿纸的形式,思维的草稿"

Pencil and paper used to do two jobs at once: scratchpad and display. Loom
splits them — both fed by the same Trace.

- **Scratchpad** (the QuickBar, ⌘/) — thinking-with-AI surface. No format, no
  burden. Modern equivalent of the margin of a textbook.
- **Live Note** (the main frame) — the same dialogue restructured as a
  growing formal derivation, updated in real time.

The user scribbles in the scratchpad; the note grows beside them on its own.

---

## Part II · Specific principles & enforcement rules

These are derived from the supreme principles and turned into actionable
checks for daily development.

### §9 · Verb over label
Page titles and section headers should be the verb the user is performing
(`Notes`, `Today`, `Browse`), never an explanatory caption (`MY NOTES SECTION`,
`DAILY DASHBOARD`). If the title can stand alone, the eyebrow / description
should not exist.

### §10 · Trust the reader
Don't write captions explaining what page the user is on. Don't add
"Welcome" or "Get started" hints. Don't label the obvious. If the user
opened the page, they know what page they opened.

### §11 · Empty space is content
Don't fill empty space with charts, illustrations, motivational copy, or
"recommendations." Whitespace is not opportunity — it is the field that
makes the foreground legible.

### §12 · Hide all empty / zero-value statistics
> "0 quizzes" / "0 notes" should never appear. PageHero's stats array auto-
filters out 0 values. Apply the same logic everywhere a count is shown.

### §13 · Internal scrollbars are forbidden
> "不要再突出出现。会严重影响沉浸感"

Only the browser's native page scrollbar (on `html` / `body`) may be visible.
Every internal scrollable container — sidebar, companion, popover, dropdown,
list, widget, textarea — hides its scrollbar entirely. Wheel / trackpad /
keyboard scrolling still works.

CSS rule:
```css
*:not(html):not(body) { scrollbar-width: none; }
*:not(html):not(body)::-webkit-scrollbar { display: none; }
```

### §14 · No decorative chrome on embedded content
> "PDF 里这个是否能尽可能只展现 PDF 本身,外框和滚动条也尽可能隐藏。功能保留,视觉消失"

When embedding source content (PDF iframes, video, code editors), strip
every chrome element to the minimum: PDF.js toolbar, navpanes, statusbar
all disabled via URL hash. The outer frame's title and controls fade in
only on hover. The document is the host, the chrome is a guest.

### §15 · Browser-shortcut hazard list
Never claim shortcuts owned by the browser. Verify before assigning:

**Reserved (do not use):**
- `⌘L` — address bar
- `⌘J` — downloads
- `⌘D` — bookmarks
- `⌘T` — new tab
- `⌘W` — close tab
- `⌘N` — new window
- `⌘P` — print (catchable but unreliable)
- `⌘F` — find in page (catchable)

**Safe (in priority order):**
- `⌘/` ← Loom uses this for the scratchpad
- `⌘\`
- `⌘.`
- `⌘'`
- `⌘E`, `⌘B`, `⌘I`, `⌘U`

Source: "command+L 在浏览器里唤起的是顶部 address"

### §16 · AI must be instant, not opened
> "如果有不明白或者不会,最好的不中断的办法是什么?是一旁的队友直接告诉或者点播,或者进入一场和他的沟通。然后立马就能切回到正轨。"

Maximum interaction steps: **3** (summon → ask → dismiss). Anything more
violates this principle. The right model is "a teammate sitting next to
you" — not "open a panel and wait."

### §17 · Scratchpad ≠ chat
The AI input is a scratchpad for thinking, not a messaging app. Forbidden
conventions: chat bubbles, send buttons, "You asked" recaps, message
history lists, "AI is typing" copy, avatars, names. Required: multi-line
textarea, Enter to send, no formal Q/A framing.

### §18 · Don't borrow Obsidian / Notion patterns
> "别人还在用 obsidian 那种知识连接图,只是看上去很酷,但是没意义。缂丝却可以有完全不同的方式"

Obsidian-style force-directed knowledge graphs are decorative, not
informative. Loom's visualizations must derive from the kesi metaphor:
warp and weft, panels, color blocks, weaving — not floating circles
connected by lines.

### §19 · The kesi grammar (8 physical properties → 8 design hooks)

| Kesi physical property | Loom design hook |
|---|---|
| 通经断纬 · warp continuous, weft broken | Library = warp; Trace = weft |
| Color blocks woven independently | Each panel is an isolated unit with mastery-driven color |
| Shuttle moves horizontally | All loading and streaming shows a horizontal shuttle |
| Hooks at color boundaries | Concept reuse across docs creates visible connections |
| Backside vs frontside | Default = polished output; `/dev/traces` = raw events |
| Slow but continuous | No spinners; weft fills progressively |
| Whole image vs single grid cell | LOD: KesiView at distance, panel at zoom |
| Time crystallizes | Unread = exposed warp; read = woven block |

### §20 · Memory itself is permanent
> "你要学会把我每次给你的反馈做总结,并在后续的开发当中考虑进去"
>
> "记得总结归纳为的反馈。这可以为日后该功能的更新提供基础"

Every piece of feedback the owner gives must be:

1. **Recorded** in this document at the time it is given
2. **Linked** to the source quote in Chinese
3. **Reviewed** before any future change to the relevant area
4. **Never overwritten** without an explicit superseding entry

This document is the project's longest-lived asset. Future contributors
(including future me) will be evaluated against it.

### §21 · Silence-first latency mask
> "typing 这种变成加载的动画,或者有更好更高级的方案?" → silence + stream-as-signal

The only acceptable indicator for AI latency is **the answer itself**. For
the first 600ms after the user submits, the UI does **nothing** — no
spinner, no shimmer, no "thinking…" copy, no breathing dot. Token streaming
begins ≤500ms in the typical case, so most requests show no indicator at
all. The user's experience is "I asked, the answer arrived" — no
intermediate state to track.

Only if first-token latency exceeds **600ms** does a single fallback
indicator appear: a 1px-tall accent hairline along the bottom edge of the
QuickBar, with a short bar shuttling laterally (see §19 — kesi shuttle
distilled to its thinnest mark). Token arrival removes it instantly.

**Implementation contract** — every AI surface in Loom (current QuickBar,
future Recall, future Decompose, any agent flow) must follow this rule:

```
setStreaming(true);
const t = setTimeout(() => { if (!firstToken) showHairline(); }, 600);
// ... on first delta: clearTimeout(t); hideHairline(); ...
```

**Forbidden alternatives**: spinners, dots, shimmer placeholders, "AI is
typing", breathing accent dots, progress percentages, latency labels,
estimated-time text. Any of these = §1 violation = §2 violation.

### §22 · Recompile, not append
> "Loom 里的主体展示就是实时更新的总结。像 openai prism 一样实时编译了"

The Live Note in the main frame must always read as **one coherent
document**, never an appended chat log. The user should land on a woven
understanding, not on raw turns.

There are now two implementations of this rule:

- **Document mode**: the Live Note is the ordered weave of all committed
  `thought-anchor` events. Each new ✓ commit updates one anchored note;
  the Live Note re-renders from the weave.
- **Free mode** (`free/<date>`): when there is no source-shaped anchor
  system, the artifact may still be rewritten in full on each turn via
  whole-note recomposition.

**Architecture contract:**
- The persistent document-facing truth is never a chat transcript
- In document mode, `LiveArtifact` / `ReviewSheet` derive from committed
  anchored notes ordered by source position
- In free mode, whole-note recomposition may still stream a new full
  artifact via `loom:artifact:stream` and commit a `kind: 'recompile'`
  event to the trace
- Version history, if present, is secondary and never the default surface

**Implication for system prompts**: note-organization and whole-note
recomposition both still use the shared rules in
`lib/ai/system-prompt.ts`. The AI may operate in different shapes, but the
output contract is identical: coherent note, not appended chat.

### §23 · Ask absorbs Note · Selection menu = 2 atoms
> "AI 对话框这里是相当于成为了另一种草稿纸的形式,思维的草稿"
> "尽量减少多余的交互操作"

The selection menu has only two actions: **Ask** (✦) and **Highlight** (▱).
Note is not a separate action — **opening ChatFocus and discussing the
passage IS the scratch-note act**. The user does not first decide
"am I highlighting, noting, or asking?" They simply ask. If the
discussion is worth keeping, ✓ commits it into one anchored note.

**Reasoning**: Every separate "Note" button is a request for the user to
classify their own thought before they have it. The classifier should be
the action they take *next*, not a button they click *first*.

**Forbidden**: separate "save as note" / "save as quote" / "save to AI"
buttons. Forbidden: any selection-menu action whose function is replicated
by the OS (Copy = ⌘C is the browser's job per §4).

### §24 · Apple 就是苹果 · direct over abstract
> "apple 就是苹果"

Apple's logo is not an "abstraction of nourishment" or "the concept of
knowledge" — it is a literal apple silhouette with a bite mark. The name
is the thing is the mark. **The most refined design is not the cleverest
abstraction; it is the most direct identification of the thing with its
name.**

Operational implications:
- Loom's icon should literally BE a loom (not a stylized warp+weft, not a
  cursor in a capsule, not a knot — a loom)
- Page titles should be the page's verb, not a metaphor for it (already §9,
  reinforced here)
- AI output should be the answer, not a frame around the answer (already §2)
- When in doubt between "clever" and "direct," choose direct

The trap to avoid: equating "refined" with "abstract." Apple Notes is not
abstract — it is a yellow legal pad. Apple Music is not abstract — it is
a music note in a colored field. The refinement is in the *fidelity*, not
the *distance*, between the product and its mark.

### §25 · Existing over new · prefer self-reference
> Owner pointed at the BlankWarp empty state on /kesi and said: this is
> already the right shape — I just need to make it move.

Before designing anything new, check whether the product already contains
something that does the job. If it does, **use that thing as the answer**,
even if it was originally built for a different purpose. The result is
self-referential: the icon, the empty state, and the live product become
the same object. This is the highest form of consistency — not "matching
styles" but "being the same thing in different sizes."

Examples already in the codebase:
- The `BlankWarp` visual on `/kesi` empty state IS the Loom mark
- The `/about` page IS rendered by Loom's own typography pipeline
- The `/dev/principles` page IS DESIGN_MEMORY.md rendered inside the product
- The `LiveArtifact` body inherits the same `prose-notion` class as
  every wiki page — the artifact reads as a continuation of the source

The discipline: when about to draw a new icon / build a new component /
write a new page, first ask **"is there already something in the product
that, slightly adjusted, would do this?"** If yes, that adjustment is
the answer, and it is always better than the new thing.

### §26 · Subtraction over addition · the limit must be reached
> "是不是太复杂?" — asked repeatedly, in many forms.

Every design pass must end with a subtraction, not an addition. The
target is not "the right number of elements" — it is "the smallest
number that still works, then test if you can remove one more."

Practical rule: if a proposal has more than ~3 elements, the proposal
is wrong. Find the version with 2. If 2 works, try 1.

This is not minimalism for its own sake. It is because every visible
element is a tax on the user's attention budget (§1), and because the
mind running fast needs the surface to stay still (§6). Each element
that survives the cut earns its place by being load-bearing — removable
elements are not "nice to have," they are damage.

The owner's reflex check is the meta-question: **"is this too
complex?"** Whenever you propose something and you cannot honestly answer
"no" to that question, you have not finished. Reduce again.

### §27 · Action over state · Loom is a verb
> Owner: "我看到原版图标的动画,体现了织的动作"

Most products are nouns: Notes (a notepad), Music (a song), Reminders (a
list). Their icons can be static because the products are static artifacts
themselves.

**Loom is a verb.** It is the act of weaving, not a piece of cloth. Its
identity must therefore be capable of motion — the static frame is at
best a paused frame of the action, never the canonical form.

Operational implications:
- The Loom mark must have an animated form — that animation is part of
  the identity, not decoration
- The static export of the mark is "the moment the shuttle is held mid-pass,"
  not "the loom at rest"
- §22 (recompile) is the textual analogue of this: each AI turn is a
  verb (rewriting), not a noun (appending)
- Empty states should suggest motion-about-to-happen, not stillness
- Loading should never freeze the surface — if the surface is frozen,
  we have failed to express the verb

The trap: equating "Apple-like" with "static / flat / boxed." Apple-like
means *native to the OS*, not *immobile*. macOS itself is full of motion
(Mission Control, dock magnification, sheet animations) — the discipline
is that the motion serves the verb, never decoration.

### §28 · Self-reference over metaphor
> Synthesizing several feedback moments — owner consistently rejects
> "stylized representation of X" in favor of "literally X, used in place."

The strongest design move is to make the product, the product's
description, and the product's identity all the same object — not three
things that resemble each other. This is the difference between *consistency*
(things that look alike) and *identity* (things that ARE alike).

In Loom this looks like:
- The mark IS the empty state of /kesi (§25 made literal)
- /about IS rendered by Loom's typography (it is itself a Loom doc)
- /dev/principles IS DESIGN_MEMORY rendered through Loom (the constitution
  reads itself in its own product)
- The QuickBar IS the only AI surface (§3 — there cannot be a second one
  even for "different purposes")
- Every list page (Home, Today, Notes, Highlights, Quizzes, Uploads,
  Browse) IS the same grammar at the same width with the same hairlines
  (§29 below)

When something in the product can stand in for its own identity, that
substitution is always the right answer — even if a freshly-designed
alternative is "objectively prettier." Self-reference compounds; cleverness
does not.

### §29 · One grammar across surfaces
Every list view in Loom uses the same shape:

```
prose-notion 760px container
└─ 18px accent hairline · UPPERCASE label · long hairline ─
└─ list rows: title (display, 0.94–1rem, 500w) · right-aligned
   mono metadata · 0.5px hairline divider
└─ empty data → return null (no "nothing here yet" copy)
```

This applies to: `/`, `/today`, `/notes`, `/highlights`, `/quizzes`,
`/uploads`, `/browse`. The only intentional exception is `/knowledge`,
which uses a `KesiSwatch` grid because the kesi visualization is the
unique differentiator of that page.

The reason: a single visual grammar repeated across surfaces is not
"styling consistency" — it is **the same fabric**. Per §28, every list
view becomes the same object at different sizes, and the user's eye
learns the grammar once and reads everything.

Forbidden in list views:
- Card chrome (shadows, rounded boxes, gradient covers)
- Filter pill rows when the list is short enough to read
- Stat boxes / segmented controls
- Greeting headers / descriptive subtitles
- "View all →" CTAs
- Per-row × delete affordances (deletion belongs at the source, not in
  the inventory)

### §30 · Reward depth, do not punish shallowness
> "懂的人懂,不懂的人不被打扰"

The kesi metaphor, 通经断纬, 润物细无声, the recompile architecture, the
trace event log, the §19 grammar table — most users will never see any
of this and that is fine. The product must work, look elegant, and feel
calm to someone who knows nothing about kesi or weaving or any of the
philosophy underneath it.

But for those who notice — for those who hover over a cell, who read
/about, who open /dev/principles, who notice that the QuickBar's ✦ is
the same ✦ as the SelectionMenu's ✦ — there must be a reward: a
*coherent worldview* that holds together at every layer they peel back.

The discipline: design for both readers simultaneously.
- The shallow reader gets a calm, beautiful, fast tool
- The deep reader gets a 2,500-year-old craft tradition expressed in code

Neither reader is the "correct" reader. **The product must not punish
either.** No "for advanced users" hints, no "did you know?" tooltips,
no progressive disclosure dialogs. The depth is *available* but never
*announced*. The shallow reader never feels they are missing something;
the deep reader never feels they are condescended to.

This is the writing-for-two-audiences trick that the best technical
writing uses — Knuth, Dijkstra, the Apple HIG. Loom inherits it.

### §31 · Immersion outranks identity · the logo is forbidden inside the product
> "一切为了沉浸式,logo 复杂,也会影响"

This is the principle that **breaks the tie** between §1 (immersion) and
§24 (Apple is an apple). When they conflict — and they conflict every
time anyone proposes putting a logo, wordmark, or brand mark anywhere
inside the product surface — **§1 wins**.

The reasoning: a logo, no matter how perfectly designed, is *chrome*.
Every pixel of chrome is a pixel that competes with content for the
user's attention budget. A "great logo on the sidebar" is still a worse
sidebar than no logo on the sidebar. Apple itself follows this rule:
open any Apple first-party app — Notes, Safari, Mail, Music — and you
will not find an Apple logo anywhere inside it. The Apple logo lives on
the dock icon, on the About panel, on apple.com — never on the working
surface.

**Operational rules:**

- **No logo, wordmark, or brand mark anywhere inside the product surface.**
  Not in the sidebar header, not in the page header, not in the footer,
  not in the empty state, not in the loading state, not in the help
  modal, not in the share dialog. **Anywhere.**
- **The product name as plain text is acceptable** in exactly one place:
  the sidebar header, set in the same family as everything else. It is
  text, not identity.
- **OS-level icons are exempt and required**: `icon.svg` for favicon /
  PWA install / Apple touch icon. These are not part of the product
  surface; they live in the dock, the browser tab, the home screen.
  They must exist for OS contracts but they must never bleed back in.
- **Splash screens are forbidden**: any "Loom" branded splash on app
  load is a §1 violation. The product opens directly to its content.
- **About page may not have a hero logo**: no Apple-style branded
  hero at the top of /about. The page opens with prose like every
  other page.
- **Exception · icons-as-content (rev 8):** /about and /dev/principles
  are *design-system documentation*. They are allowed to render the
  icon variants (`icon.svg`, `BlankWarp`, `WeftHairline`, etc.) inline
  **as content the user is reading about**, not as chrome decorating
  the page. The test: if the icon were removed, would the surrounding
  text become incomplete? If yes, it is content. If no, it is chrome
  and forbidden. A logo "to make the page feel branded" is chrome.
  A diagram showing the three icon scopes(8 / 12 / 3+1) is content.
- **No "powered by Loom" / "Loom v4.2" / version chrome anywhere**.

**The harder corollary:**

This principle is what *retroactively kills* every logo proposal made
in this session — the cursor-in-capsule, the asymmetric oo wordmark,
the two-stroke knot, the upright loom silhouette, the BlankWarp +
sliding weft. Every one of them was a §24 + §27 win, but every one
of them was a §1 + §31 loss the moment you imagined it placed inside
the sidebar or the about page or anywhere else the user has to look at
it during work.

The right answer is: **none of the above**. The `icon.svg` that exists
already (warp threads + weft + shuttle dot) is fine *because it lives
in OS-level contexts that never enter the product*. No wordmark.svg.
No sidebar mark. No about hero. The product is naked of branding by
design, and that nakedness is the brand.

**The test:** if a user closed every Loom tab, opened the dock, and
re-opened it, the only place they should have seen the word "Loom"
during their entire previous session is the browser tab title and the
sidebar header text. Not in the prose, not as a logo, not as a
watermark, not as a footer. If you find Loom written anywhere else
inside the product, that is a §31 violation and it must be removed.

### §32 · LOOM = 8 warps + 7 wefts · the name is the loom
> "LOOM 相当于有 8 个竖线,7 个横线"

The four letters L-O-O-M, when decomposed into their structural strokes,
contain exactly **eight vertical strokes and seven horizontal strokes**:

```
L = 1 vertical · 1 horizontal
O = 2 verticals · 2 horizontals (treating O as a square frame)
O = 2 verticals · 2 horizontals
M = 3 verticals · 2 horizontals (left post + valley + right post)
─────────────────────────────────
    8 verticals · 7 horizontals
```

This is not a coincidence. **The name LOOM is structurally a tiny
loom**: 8 warp threads, 7 weft threads. Writing the four letters in
capitals is the same act as warping a small loom.

This is §24 (apple is an apple) at its deepest possible layer. Apple's
logo was designed *after* the company was named — a fruit chosen to
match a name. Loom's mark was *latent in the name itself*: the four
letters were already a loom before anyone drew anything.

**Operational consequences — and a critical scoping caveat:**

The 8-warp count is the **identity constraint of the brand icon ONLY**.
It is not a global rule for every warp visualization in the product.
Other scenes use other counts because other scenes have other goals.

- **Logo / `icon.svg` / `icon-mono.svg` / favicon / PWA / dock**: exactly
  8 warps. This count is **load-bearing** — it encodes L-O-O-M. Do not
  change it. The 7 wefts are NOT drawn; they are the negative space the
  user fills by using the product.
- **Static empty states** (e.g. the `BlankWarp` on `/kesi`): use a denser
  count (currently 12) because static visuals at prose width need
  density to read as "a piece of fabric" rather than "a few sticks".
  8 is too sparse here.
- **Animated loading / "thinking" indicators** (e.g. the `WeftHairline`
  pattern, the original `loom-shuttle` animation): use a sparser
  structure (typically 3–4 warps + 1 sliding weft) so the *motion*
  is legible at small sizes. 8 warps + a moving weft would be visual
  noise at favicon scale.

**Earlier mistake (rev 6 first draft):** I unified all three scenes
under "8 warps" and forced `BlankWarp` to match the icon. That was a
§29 over-application — I confused "shared metaphor" with "shared
byte count". The shared thing is **the kesi grammar (§19)**: warp +
weft + the act of weaving. The exact count varies with the scene's
needs. Self-reference (§28) means the *meaning* is the same object;
it does not mean the *pixels* are the same object.

**The scoping rule:** when in doubt about a warp visualization's
count, ask:
1. Is this the brand mark? → 8 (encodes LOOM)
2. Is this a static visual at content width? → enough to read as fabric
3. Is this an animated indicator? → enough to read the motion, no more

**The poetic reading:** the icon is the name in its purest form. Every
time the user opens the product, they see the four letters of LOOM
re-decomposed into their constituent threads, waiting for the user's
own thinking to weave the seven wefts that will turn it back into a
written word — at which point a new empty loom appears, and the cycle
begins again.

This is why no wordmark is needed (§31 — and now also §32). The name,
when written, IS the icon. When abstracted, IS the icon. They cannot
be separated because they were never two things.

### §33 · Visual pages must use visual effects · empty space is NOT content here
> "大图展示的静态时候要学会利用视觉效果。静态需要很好的利用视觉效果"

§11 (empty space is content) and §1 (悄无声息) are correct *for the
right kind of page*. They apply when a page is **chrome wrapped around
content** — list views, prose pages, dashboards. There, whitespace is
the field that makes the foreground legible, and reducing chrome to
zero is the right move.

**But some pages are not chrome around content. Some pages ARE the
visual.** /kesi is the canonical example: the tapestry IS the page. The
visualization is not framing for some other content; it is the content.
For these pages, the rules invert.

**Operational distinction:**

| Page kind | Empty state | When data exists |
|---|---|---|
| **Chrome page** (lists, prose, indexes) | `return null` — empty space | Data takes the surface |
| **Visual page** (tapestry, atlas, gallery) | **Visual effects fill the surface** | Data adds richness on top |

**The trap I fell into earlier in this session:** I treated /kesi like
a list page. When there were no traces, I rendered a 280px-wide
12-line hairline whisper floating in the middle of a 1440px viewport.
That is wrong for /kesi — it makes the flagship page **fail to deliver
on its own promise**. The user opens "Your Kesi" expecting to see a
fabric and finds an apologetic dot pattern. The brand collapses.

**For visual pages, the empty state must:**

- **Take the surface** — large enough that the page's purpose is
  visible at a glance, not centered in a sea of white
- **Use Apple material when appropriate** — `material-thin` glass,
  subtle gradients, soft halos. These are §5 in action: glass over
  surface, with the visual element as the surface
- **Have motion** — even subtle (breathing opacity, slow shimmer,
  light catching the warp). §27: Loom is a verb. The visual must
  move, even when nothing has been woven yet
- **Suggest potential, not absence** — the empty state of a visual
  page is "the canvas is ready and alive," not "there is nothing here"

**For visual pages, what does NOT change:**

- §1 still applies: no copy, no CTAs, no "drop a file here →" prompts.
  The visual itself is the message; do not narrate it
- §11 still applies in spirit: no decorative chrome — but the visual
  effects are not chrome, they are the content
- §10 still applies: no "Your kesi will start to weave itself"
  explanatory text. The visual speaks
- §13 still applies: no scrollbars

**The deeper rule:** "empty space is content" only when the page is
about content that happens to be missing. When the page is about
*the visual itself*, the visual must be present even when there is
no data — because the visual IS what the page promises, and a missing
promise is a worse experience than too much chrome.

**Pages in Loom that are visual:**

- `/kesi` — the tapestry visualization (KesiView)
- Future: any "atlas," "gallery," or "fabric" view

**Pages in Loom that are chrome:**

- `/`, `/today`, `/notes`, `/highlights`, `/quizzes`, `/uploads`,
  `/browse`, `/knowledge` index, `/about`, `/dev/principles`
- All wiki and knowledge document pages (the doc body is the content,
  the page is its frame)

When in doubt about a new page, ask: **"Is this page promising a
visual experience, or is it a frame for some other content?"** The
answer determines which set of rules applies.

### §34 · Ask absorbs Highlight · §23 extended
> "AI 已经在帮助 highlight 了"

The user observed that asking the AI about a passage already implies
the passage is meaningful — the act of selecting it and triggering Ask
is itself a highlight. The corollary: there is no longer any reason
for Highlight to be a separate, manual action that competes with Ask.

**Operational rule:** every Ask via the SelectionWarp ✦ silently
records the quoted selection as a Highlight on the current document
(in the user's current tint). The user does not need to remember to
highlight separately. Highlight remains accessible via ⌥-click on the
SelectionWarp for the rare case where the user wants to mark something
WITHOUT also asking — but the default flow folds the two actions into
one keystroke.

This is §23's "Ask absorbs Note" applied a second time. The pattern
holds: every single-purpose button next to the AI input is a candidate
for absorption. The rule of thumb: **if the user is already reaching
for the AI from this passage, the AI surface should also do the
small adjacent thing for free.**

### §35 · Scratchpad commits to Live Note · §8 made operational
> "草稿是要整理才能在 live note"

§8 says "two surfaces, one trace" — the scratchpad and the Live Note
are separate roles fed by the same data substrate. This principle
makes the contract between them concrete:

**The scratchpad is ephemeral. The Live Note is persistent. The
boundary between them is an explicit commit step (the ✓ button).**

- A scratchpad session accumulates raw {q, a} turns inside **ChatFocus**,
  directly below the selected passage. Multi-turn iteration is encouraged;
  the user should feel free to ask three things, get three answers,
  restart, ask differently. None of this touches the persistent note
  structure yet. The scratchpad is genuinely a draft.
- Pressing **✓** commits: the AI takes the scratch transcript and
  organizes it into **one anchored note** for that passage. The
  document's Live Note is then updated indirectly, because the Live Note
  is the ordered weave of all committed anchored notes.
- Pressing **Esc** or **×** closes the scratchpad and clears it. Only
  committed notes survive. This keeps the draft mode lightweight and
  prevents half-finished wandering from polluting the persistent weave.

The cognitive principle: drafts and finished notes serve different
mental modes. A draft is permission to be wrong, to wander, to ask
the same question three different ways. A finished note is a single
coherent stance. Forcing every keystroke to immediately become "final"
collapses these two modes into one and kills the draft mode.

**Architectural consequence:** on source documents there is exactly ONE
scratch surface — the in-place ChatFocus discussion bound to the
selected passage. It is not a bottom bar, not a floating popover, and
not a side panel. **One passage, one scratch discussion, one commit,
one anchored note, one Live Note derived from the weave** — that is the
pipeline.

### §37 · Two geometries, two intents · Chat 与 Review
> "claude 不是有 chat 和 cowork 两种吗?看看是否可以借鉴"
> "选中询问以后,所有其他内容被上下分开,中间呈现一个只有选中内容的空白"
> "居中的文案和 AI 的回答开始左右分屏"

Loom has exactly two AI surfaces. Their boundary is **geometry**, not
a UI mode toggle. Borrowing the Anthropic Claude product framing, they
correspond to Chat (quick, local) and Review (persistent, document-wide):

| | **Chat** (selection ✦) | **Review** (⌘/) |
|---|---|---|
| Geometry | **Vertical** focus tunnel | **Centered glass sheet + companion map** |
| Trigger | Click SelectionWarp ✦ on a selection | Press ⌘/ |
| Intent | "discuss this passage right here" | "review what this document now means" |
| What happens | Doc collapses everything except the selected passage; an inline scratch discussion appears below | Source recedes; a centered Live Note comes forward; a companion thought map appears on its right |
| Lifecycle | Ephemeral. Discussion dies on close, unless ✓ commits it into one anchored note | Persistent. The centered Live Note is derived from all committed anchored notes in the trace |
| Restoration | Esc / × closes; doc fully restores | ⌘/ again or Esc closes; source returns to foreground |

**Why two geometries instead of one mode toggle:**

Claude needs `Chat | Cowork` tabs because its surfaces look identical
otherwise. Loom doesn't — the geometry IS the mode signal. When the
user sees the doc opening vertically around their selection, they know
they're in Chat. When they see the Live Note come to the center with
its companion thought map beside it, they know they're in Review. **The shape of the screen
tells you what kind of conversation you're in.** No tab, no toggle, no
chrome to find.

This is §28 (self-reference) at the meta-architecture level: the
geometry of the action is the affordance of the action.

**Operational rules:**

- **No tab toggle, no mode picker, no settings.** The trigger picks
  the mode automatically.
- **The two modes share one trace.** Whatever Chat commits via ✓
  becomes a `thought-anchor` event in the same trace that Review reads
  to build its Live Note and companion thought map.
- **Chat commits one note, Review reads the weave.** Review does not
  display scratch turns or a separate panel-state model; it shows the
  structured understanding formed by all committed anchored notes.
- **The two modes may overlap in time, but not in semantics.** Chat is
  for making one note. Review is for seeing the document's woven whole.
- **No right-side cowork panel anymore.** The old panel model competed
  with the source and made geometry unstable. Review mode now brings the
  Live Note to the center instead.
- **Falling back on non-doc pages** (`/`, `/today`, etc.): there is no
  source passage to focus, so Chat mode is unavailable. Review is a
  document-reading mode and appears only when a source document is open.

**File map of the architecture:**

- `components/ChatFocus.tsx` — vertical focus mode
- `components/CoworkSplit.tsx` — review mode shell (legacy filename)
- `components/SelectionWarp.tsx` — dispatches `loom:chat:focus`
- `components/ReviewSheet.tsx` — centered glass Live Note
- `components/ReviewThoughtMap.tsx` — companion thought map beside Review
- `app/globals.css` — `body.loom-chat-focus-active` collapses paragraphs
  except `[data-loom-chat-focus]`; `body.loom-study-mode` dims source and
  brings Review forward without moving the stage
- `components/LiveArtifact.tsx` — doc-page Live Note below the source, and
  the same understanding model rendered again inside Review

**The check:** if a future AI surface is proposed, ask first: is its
intent "ephemeral, about a specific passage" or "persistent, about
the woven whole of the doc"? Chat or Review. If neither, the proposal is wrong —
those are the only two coherent intents.

### §39 · Faster and cleaner than handwriting · the kesi principle
> "不是替代手写,是让思维比手写更干净更快"
> "缂丝的过程也是这个道理呀"

This is the deepest connection between the product and the craft it
is named after.

**Freehand painting vs kesi weaving:**

A painter works freehand — every stroke is the painter's alone.
Beautiful, but imprecise: the hand trembles, the ink bleeds, the
composition drifts. The painter must be both the creator AND the
organizer of every mark.

A kesi weaver uses a **loom**. The loom provides structure: the warp
holds tension, the heddles separate threads, the reed aligns the
weft. The weaver's job is to choose WHERE to place color and WHEN
to break the weft. The loom handles alignment, tension, spacing,
and structure. The result: fabric MORE PRECISE than any freehand
painting could ever be. Not "painting but slower" — **painting but
more structured, because the tool organizes for the human.**

**Handwriting vs Loom:**

A student takes handwritten notes — every word is the student's
alone. Natural, but messy: abbreviations drift, structure collapses,
connections are lost. The student must be both the thinker AND the
organizer of every note.

A Loom user uses **AI + the thought-anchor system**. The AI provides
structure: it organizes the conversation into a clean note, anchors
it to the right passage, connects it to prior thoughts. The user's
job is to choose WHAT to ask and WHEN to commit. The AI handles
summarization, anchoring, structuring, and linking. The result:
thought structures MORE ORGANIZED than any handwritten margin notes
could ever be. Not "handwriting but digital" — **thinking but more
structured, because the tool organizes for the human.**

```
Freehand painting  :  Kesi weaving
Handwriting        :  Loom

Both pairs share the same relationship:
the tool (loom / Loom) absorbs the organizational burden,
freeing the human to focus on intent (color choice / questions).
```

**This is why the product is called Loom** — not because it displays
warp/weft visuals, but because it IS a loom: a tool that turns messy
human input into precise structural output, the way a physical loom
turns loose thread into woven fabric.

**§39b · 织匠的工作过程,就是思考者用 Loom 的过程**

> "织匠的工作过程,就是思考者用 Loom 的过程"

This sentence closes the final gap between metaphor and product. It
is not an analogy ("the weaver is LIKE the thinker"). It is an
identity ("the weaver IS the thinker, using a different loom").

| Kesi weaver | Loom user |
|---|---|
| Sits before the loom | Opens a document |
| Studies the pattern (画稿) | Reads the source material |
| Selects a color of silk | Selects a passage to think about |
| Passes the shuttle through the warp | Asks AI a question (⌘/ or ✦) |
| The loom holds the tension and alignment | AI organizes the answer into a thought-anchor |
| The weft thread is cut at the color boundary (断纬) | The thought-anchor is bounded to one passage (§7) |
| One color block is finished | One ◆ note is committed (✓) |
| Steps back to see the emerging pattern | Opens Layer 3 (⌘/) to see all thought-anchors |
| Decides: this panel is complete | Crystallizes the Live Note (✦) |
| The panel joins the finished kesi | The panel joins /kesi |
| Years later, unfolds the kesi to see the work | Opens the document, sees ◆ marks, hovers to recall |

Every row is not a metaphor — it is the SAME act performed on
different material (silk vs. understanding). The product does not
"reference" kesi. The product IS kesi, performed on thought instead
of thread.

**§39c · 脑中有画稿,手上才精准**

> "缂丝的过程就是织匠的脑里有快速的思维,有完整的架构,才能准确无误的完成织"

The weaver's hands are slow — one shuttle pass at a time. But the
weaver's mind has already seen the entire pattern before the first
thread is laid: where to break the weft, where to change color, how
the next forty moves connect. **Slow hands, fast mind** (§6).

The pattern in the weaver's mind IS the thought map. Without it, the
hands produce tangled thread. With it, every shuttle pass lands in
the right place.

Loom's **thought map (◆ structure)** is the digital equivalent of the
weaver's mental pattern (画稿):
- Before you start: the thought map shows ◇ empty nodes for every
  section of the document — the pattern you COULD weave
- As you work: each ✓ commit fills a ◇ → ◆ — the pattern takes shape
- At any moment: you can ⌘/ to see the full thought map — the same
  act as the weaver stepping back to see the emerging fabric

**The thought map is not a feature. It is the product's reason for
existing.** Without it, Loom is just a chat tool. With it, Loom is
a loom — a tool for structured, intentional, pattern-aware thinking.

**Operational constraint:** if an action takes MORE steps than
handwriting, the design is wrong. If AI output is LESS structured
than handwriting, the prompt is wrong. The bar: **better than the
best handwritten notes, at the speed of asking a question.**

### §38 · Parallel structures · doc outline ↔ thought map
> "左边是笔记的框架...右边应该是体现从思维草稿整理下来,进入 livenote 的思维结构。这个才是重点。并且思维结构能准确对应选中的文字或者段落"
> "日后复习起来,就可以从思维结构快速捡起知识"
> "如果是注意力在 livenote,就把 livenote 和思维结构一起成为注意力关注对象。如果是在阅读主体,那就是左边主体结构,右边思维结构"

The document and the user's understanding are **two parallel
structures** — one comes from the author, the other grows from the
user. The product's job is to render them **side by side, anchored to
each other**, so the user can see at a glance: what they've understood,
what they haven't, and how their thinking maps to the source.

**The two structures:**

| | **Doc Outline** (left) | **Thought Map** (right) |
|---|---|---|
| Source | The document's headings, sections, paragraphs | The user's AI discussions, crystallized |
| In kesi terms | **Warp** (经) — continuous, from the author | **Weft** (纬) — broken, from the user |
| Node content | Heading text (brief) | 1-2 line summary of user's understanding |
| Empty state | All nodes present (from the doc) | Only nodes where user has asked/thought |
| Anchor | Each doc node IS a location in the source | Each thought node LINKS to a doc node |
| Growth | Fixed (doesn't change) | Grows as user asks more questions |

**Three attention states — layout follows focus:**

| User is doing | Center | Left | Right |
|---|---|---|---|
| Reading (default) | Prose, centered | Hidden | Hidden |
| Reading + asking (⌘/ or ✦) | Prose | Doc outline fades in | Thought map fades in |
| Reviewing Live Note | Live Note (editable) | Thought map (navigation) | Doc outline (reference) |

The layout transitions are 润物无声 (§36): columns fade in when the
user's action implies they're needed, fade out when the user returns
to pure reading. No toggle button, no mode switch.

**Bidirectional anchoring:**

- Click a thought node → document scrolls to the anchored passage,
  passage highlights
- Click a doc heading → thought map highlights the corresponding
  thought node (if any); empty nodes show a faint ✦ affordance
- The vertical positions of the two outlines are **aligned** — a
  thought node sits at the same screen height as its anchor heading.
  The user can glance left-right and see the correspondence instantly.

**Data model — thought-anchor events:**

Each thought node in the map is stored as a `kind: 'thought-anchor'`
event in the trace, containing:
- `anchorId`: the heading or paragraph element ID it's linked to
- `summary`: 1-2 line crystallized summary
- `content`: the full organized note for that section

The Live Note is no longer a single monolithic recompile. It is the
**concatenation of all thought-anchor nodes**, ordered by their
position in the document. This means:
- Each section of the Live Note maps to a specific document passage
- The user can delete individual sections without wiping the whole note
- The thought map IS the Live Note's table of contents

**Review path (日后复习):**

Open any previously-studied document → the thought map immediately
shows all prior crystallized thought nodes:

```
◆ Forward contracts     → "risk transfer, not asset transfer"
◆ Futures vs forwards   → "mark-to-market is the core difference"
◇ Option pricing        → (empty — not yet explored)
◇ Greek letters         → (empty)
```

One glance tells you: what you've woven, what's still bare warp.
Click any ◆ to expand its full note. Click any ◇ to start a new
ChatFocus discussion on that section.

**Thought-map node contract (rev 19):**

- The thought map is the **full pattern**, not a list of only the notes
  that already exist.
- Every structural heading in the source appears as a node in the map.
- `◇` means "this section exists in the pattern but has not been woven yet."
- `◆` means "this section has at least one committed anchored note."
- Therefore the user can see both: what has been understood, and what
  remains bare warp.
- `◇` is not decorative. Clicking it should take the user into making the
  first note for that section.
- The thought map appears in two different forms:
  - **Reading rail**: differential, not duplicative. It shows woven `◆`
    nodes plus at most the currently active empty `◇`. It must not mirror
    the full source outline, because the Source rail already does that.
  - **Review companion map**: full pattern. Here the user is reviewing the
    whole weave, so the complete `◇/◆` structure belongs on screen.
- In review mode, the **Source rail becomes skeletal reference**. It should
  keep source coordinates available, but it should not repeat the same full
  semantic labels that the companion thought map is already carrying.
  The preferred form is a **numbered ruler** with only the current section's
  label exposed; the rest stay as quiet ticks / coordinates.
- In review mode, the companion thought map must track the current
  section of the centered Live Note. It is a navigation companion, not
  a static ornament.
- In review mode, clicking a woven thought-map node should navigate the
  **centered Live Note**, not the dimmed source prose behind it.

**Geometry lock-in (rev 13):**

- The **main stage width and center line never change**. Sidebar, source
  rail, thought map, anchored notes, and review surfaces may appear or
  disappear, but they may NOT push, widen, narrow, or re-center the
  body text. If the screen "jumps", the implementation is wrong.
- The **Source rail is persistent reference warp**. It stays with the
  document as the user scrolls and remains available during normal
  reading. It may be quiet / low-contrast, but it should not blink in
  and out as a hover utility.
- The **Thought map is not a permanent right sidebar**. It is an
  intro/review affordance: visible near the top of a document, then
  gradually fades as the user reads deeper. It returns as a primary
  structure only in review mode (⌘/).
- **Review mode (⌘/) means Live Note takes the center.** The dimmed
  source is background; the centered Live Note is the user's current
  object of attention. The thought map should support this mode, not
  compete with it.

**Anchored-note lifecycle lock-in (rev 13):**

- One source passage = **one anchored note**. Asking again about the
  same passage updates that note; it does not stack another note into
  the same physical slot.
- A "passage" is a **semantic fragment**, not blindly the whole top-level
  DOM block. For prose a paragraph may be the passage; for code/math a
  single selected fragment inside one block may need its own anchored note.
- Fragment anchors should be derived from the selection's **actual text
  range inside the block**, not only visual offset or selected text hash.
  DOM wrappers, syntax spans, and math markup must not collapse distinct
  fragments back into one note.
- Different passages may each have their own ◆. The page may contain
  many anchored notes, but only **one expanded pinned note** may be the
  active foreground object at a time.
- A pinned anchored note belongs to its passage. It should not vanish
  the moment the user scrolls slightly. Instead:
  - while the passage is still within the user's active reading region, the
    note stays fully solid
  - once the note itself is being read / hovered / scrolled, that reading
    state takes precedence over the passage's exact position
  - because reading moves downward, dismissal is triggered only when the
    anchored semantic range has genuinely exited upward into the already-
    read region, not because it drifted away from the center line
  - the upward exit zone should be defined as a **proportion of viewport
    height**, not fixed pixels, so the behavior feels the same on 13", 14",
    and 16" laptop screens
  - the preferred effect is not prolonged opacity-fading; it is a
    **collapse back into the ◆** once the anchored range has truly left the
    reading field

**Highlight vs note lock-in (rev 13):**

- A **highlight** belongs to the source layer: "I marked this passage."
- A **note** belongs to the understanding layer: "I understood this."
- Therefore selecting text inside an anchored note does NOT create a
  source highlight. Highlight marks the original material; note marks the
  user's interpretation of it.

**AI backend contract (rev 24):**

- Loom's AI surfaces may run on either **Codex CLI** or **Claude CLI**.
- Provider choice is an infrastructural preference, not page chrome. It
  belongs in Settings, not as a mode toggle on the reading surface.
- If the selected CLI is unauthenticated, the product should fail
  gracefully: prefer a quiet fallback to the other allowed CLI over
  dumping raw authentication errors into the reading surface.
- The user's mental model is "I asked Loom", not "which vendor answered."

**Reading-trace visibility contract (rev 27):**

- A document page must render the **union of all root reading traces for
  that doc**, not arbitrarily the first one.
- Old split traces may exist due to earlier versions or races; the UI must
  still surface their notes/highlights rather than making them appear lost.
- Deleting one anchored note or highlight must target the specific trace
  that owns it.

**Why this is the final form of the kesi metaphor:**

```
Doc outline (left)  =  warp  =  source, vertical, continuous
Thought map (right) =  weft  =  thinking, horizontal, broken
Center content      =  kesi  =  the fabric of understanding

Reading     = seeing the warp
Asking      = laying one weft thread
✓ commit    = one color block finished
Crystallize = the whole panel enters your kesi
/kesi       = your complete tapestry
```

Every user action maps to a physical kesi operation. The product
does not "use the kesi metaphor" — the product IS kesi.

### §36 · 春雨知时节 · the four-part 润物无声
> "春雨是功能名字,润是功能的动作,如酥是最终效果。但是整个过程,是让人感觉悄无声息的"

The user's most precise statement of how 润物无声 works inside Loom.
This corrects an earlier misreading I held: that "润物无声" meant
"absolute silence — no animations, no shadows, no entrance, nothing".

It does not mean that. It is a constraint on the **felt experience**,
not on the **technical absence** of animation. The principle has four
nested parts, each from Du Fu / Han Yu's lineage of spring-rain poetry:

| Part | What it is | What it means in Loom |
|---|---|---|
| **春雨** · the rain | The function exists | The QuickBar exists, the LiveArtifact exists, the SelectionWarp exists. They are real tools, occupying real space when summoned. |
| **润** · the moistening | The action happens | The AI streams tokens, the Live Note recompiles, the scratchpad accumulates turns, the commit reorganizes. Real work is done. |
| **如酥** · soft and rich | The result is felt | The Live Note is a clean note, the kesi is a finished panel, the user has actually understood something. The output has substance. |
| **悄无声息** · silent throughout | The experience is gentle | The user notices the *result* (wet grass at dawn), not the *act* (raindrops falling). |

**What this allows:**

- Entrance animations — as long as they feel like "settling in", not
  "appearing on stage". 240ms ease-out fades are fine. Bouncy springs
  with 1.05x scale overshoot are not.
- Drop shadows — as long as they anchor the element in space, not
  shout "I have depth". 0 8px 24px rgba(0,0,0,0.06) is fine.
  Glowing accent halos are not.
- Width / height transitions — as long as they feel like the element
  is "gently growing into the right shape", not "expanding". Smooth
  ease-out cubic-bezier is the right curve.
- Visible work indicators — as long as they're the *result* of work
  being done (token-by-token streaming text is fine; it IS the work),
  not a *substitute* for work (a spinner saying "thinking..." is not).

**What this still forbids (per §1, §2, §21, §27):**

- Bouncy springs with overshoot
- Sliding from far off-screen
- Sudden appearances without any transition
- "Loading..." text or spinners
- Toasts saying "saved" or "synced"
- Highlight-style animations on user-initiated changes
- Anything that draws the eye to the chrome rather than the content

**The test:** if the user closed their eyes between summoning a
function and seeing its result, would they be aware of the function
having "done something"? If yes (they'd notice the act), the design
is too loud. If no (they'd only notice the result), the design is
correctly 润物无声.

The relationship between this and §1, §2, §21:
- §1 says "absent until summoned"
- §2 says "the AI doesn't perform"
- §21 says "no latency labels"
- §36 unifies them: **the experience is gentle throughout the entire
  arc — summon, work, deliver, dismiss — even though each individual
  step is allowed to have some visible motion.**

---

## Part II.5 · Operational forbidden list

A consolidated check sheet of things that must never appear in Loom.
Each is grounded in one or more principles above.

| Forbidden | Why |
|---|---|
| `toast('Saved')` / `toast('Synced ✓')` / any completion toast | §1, §21 |
| Spinners, shimmer placeholders, "Loading…" copy | §21 |
| `confirm()` for reversible operations (only for destructive irreversible) | §1 |
| Greetings: "Welcome", "Good morning", "Hello, {name}" | §10 |
| Streaks, fire emojis, score donuts, daily rings, GitHub heatmaps | §11 |
| Internal scrollbars visible (sidebars, popovers, dropdowns, lists) | §13 |
| Decorative emoji in buttons, headers, empty states | §1 |
| "Open the Loom →" / "Get started" / any CTA button | §10, §11 |
| `PageHero` triple (eyebrow + title + description) on user-facing pages | §10 |
| Card shadows when prose can carry the content | §1, §5 |
| Chat bubbles, "AI is typing", AI avatars, AI names | §17 |
| Re-implementing browser-native features (scroll, ⌘C, ⌘F, tab) | §4 |
| Obsidian-style force-directed knowledge graphs | §18 |
| Two AI inputs in the same product | §3 |
| AI preambles ("Sure!", "Let me…", "I'd be happy to…") | §2 |
| AI trailing recaps ("Hope this helps", "Let me know if…") | §2 |
| Filter pill rows on lists with <20 items | §11, §29 |
| Per-row delete (×) buttons in inventory pages | §29 |
| `?` help icons / "(beta)" labels / "new!" badges | §1, §10 |
| Brand colors that aren't Apple system tints | §0 |
| Custom scrollbar styling that isn't "completely hidden" | §13 |
| Gradient backgrounds on text-content pages | §1, §5 |
| `bg-elevated` solid backgrounds when `material-thick` glass would do | §5 |
| Logo / wordmark / brand mark anywhere inside the product surface | §31 |
| Splash screens on app load | §31 |
| "Loom" written outside the sidebar header text and browser tab title | §31 |

---

## Part II.6 · Decision evaluation triggers

These are the questions to ask BEFORE shipping anything. They are the
owner's own reflex questions, distilled.

1. **"Is this too complex?"** — if more than ~3 visible elements, the
   answer is yes. Reduce. (§26)
2. **"Is there a more refined approach?"** — if the proposal is the
   first reasonable answer, the answer is yes. Reframe. (§24, §28)
3. **"Does the product already have something that does this?"** — if
   yes, use that. (§25)
4. **"Does it move? Should it?"** — if Loom's identity is acting on this
   surface and the surface is static, the surface is wrong. (§27)
5. **"Would the deep reader be rewarded? Would the shallow reader be
   punished?"** — both must be no-yes. (§30)
6. **"Does this duplicate something the sidebar / OS / browser already
   does?"** — if yes, delete. (§4, §29)
7. **"If I removed this, would anything actually be lost?"** — if no,
   it was decoration. Remove. (§11, §26)

When unsure on any of the seven, the answer is "remove and ship."
Adding can always happen later; removing after shipping is harder.

---

## Part III · Process · how this document is used

### Before any code change

1. **Read** the relevant principles in this document
2. **Ask**: does my plan violate any principle?
3. **If yes**: redesign the plan, do not proceed
4. **If no**: proceed and verify the result against the principles after

### When the owner gives new feedback

1. **Reproduce** their words verbatim (Chinese + English translation if needed)
2. **Identify** which existing principle this clarifies, strengthens, or
   contradicts
3. **Add** a new entry to Part II, or update Part I if it's a foundational
   shift
4. **Refactor** any existing code that violates the new principle, in the
   same delivery
5. **Acknowledge** the addition in the response so the owner can verify

### When deciding scope / priority

1. Anything that **violates a principle** is highest priority — fix before
   building new features
2. Anything that **strengthens stealth, glass, or AI immediacy** is next
3. Functional features come third
4. Nice-to-have polish is last
5. Decorative additions are never

---

## Part IV · The history (chronological feedback log)

| Date | Quote (Chinese) | Principle |
|---|---|---|
| 2026-04-09 | "apple 风格审美为核心" | §0 The Apple Continuum |
| 2026-04-09 | "注重与人的交互(可读性,可视化等等)" | §6 Slow hands, fast mind |
| 2026-04-09 | "AI 时代,需要的是思维活跃" | §6, §16 |
| 2026-04-09 | "目前 AI 的方案还是不够高级,不够 apple。就像 Siri 一样,感受不到它的存在,但是需要时它自动就在" | §2 AI like Siri |
| 2026-04-09 | "和 AI 的对话框也要符合 Apple 美学设计风格" | §0, §17 |
| 2026-04-09 | "设计美学,哲学需要保持统一" | All §§ |
| 2026-04-09 | "悄无声息,而不是喧宾夺主" | §1 |
| 2026-04-09 | "command+L 在浏览器里唤起的是顶部 address" | §15 |
| 2026-04-09 | "这种沉浸感才能和思维的活跃搭配" | §1, §6 |
| 2026-04-09 | "这里加滚条没必要。多余的设计,多余的东西越多,越影响注意力" | §13 |
| 2026-04-09 | "你要学会把我每次给你的反馈做总结" | §20 |
| 2026-04-09 | "AI 系统也要重做并统一。AI 也要陪着人一起快速联动" | §3 |
| 2026-04-09 | "PDF 里这个是否能尽可能只展现 PDF 本身,外框和滚动条也尽可能隐藏。功能保留,视觉消失" | §14 |
| 2026-04-09 | "深挖 Loom 和 Kesi 的元素,把它们潜移默化的用在产品当中。比如别人还在用 obsidian 那种知识连接图,只是看上去很酷,但是没意义。缂丝却可以有完全不同的方式" | §18, §19 |
| 2026-04-09 | "知识库的管理也可以借鉴这套哲学" | §19 (extended to knowledge management) |
| 2026-04-09 | "kesi 虽然是慢工出细活的作品,但是不代表编织的手工艺人脑袋不活跃...通经断纬的方法可以让完成作品不中断。有点类似区块链,或者工程分工进行" | §6, §7 |
| 2026-04-09 | "网页一般自带滚动条...这个功能其实需要重新考虑" | §4 |
| 2026-04-09 | "AI 交互这块还得继续升级改进。不要花大量时间在操作交互上...是一旁的队友直接告诉或者点播,或者进入一场和他的沟通。然后立马就能切回到正轨。这个过程不应该浪费更多时间在操作交互" | §16 |
| 2026-04-09 | "因为人类在用纸张或者黑板推演的时候,纸张不仅承担了展示的功能,也承担了快速草稿的功能。现在是要两个功能分开" | §8 Two surfaces, one trace |
| 2026-04-09 | "AI 对话框这里是相当于成为了另一种草稿纸的形式,思维的草稿" | §17 Scratchpad ≠ chat |
| 2026-04-09 | "记得总结归纳为的反馈。这可以为日后该功能的更新提供基础" | §20 (this doc) |
| 2026-04-09 | "也要注意,不能挡住太多主体" | §1, §11 (QuickBar input-only) |
| 2026-04-09 | "尽量减少多余的交互操作" | §16 (SelectionMenu → Ask·Highlight, Note 被 Ask 吃掉) |
| 2026-04-09 | "沉浸感的一个重要使用感受就是润物细无声" | §1 (extended) |
| 2026-04-09 | "包括 AI 本身也要给使用者这个感受" | §2 (extended — AI output rules) |
| 2026-04-09 | "Loom 里的主体展示就是实时更新的总结。像 openai prism 一样实时编译了" | §8 (extended — recompile, not append) |
| 2026-04-09 | "AI 在不展示的时候的陪伴到展开参与这个整个过程都需要这个状态" | §2 (extended — full interaction arc) |
| 2026-04-09 | "typing 这种变成加载的动画,或者有更好更高级的方案?" | §21 Silence-first latency mask |
| 2026-04-09 | "Loom 里的主体展示就是实时更新的总结" (recompile) | §22 Recompile, not append |
| 2026-04-09 | "尽量减少多余的交互操作" (selection menu = 2 atoms) | §23 Ask absorbs Note |
| 2026-04-09 | "apple 就是苹果" | §24 Direct over abstract |
| 2026-04-09 | "我看到原版图标的动画,体现了织的动作" | §27 Action over state |
| 2026-04-09 | (Pointed at BlankWarp on /kesi as the answer) | §25 Existing over new |
| 2026-04-09 | "是不是太复杂?" (asked repeatedly) | §26 Subtraction over addition |
| 2026-04-09 | (Synthesized from approval of self-referential moves) | §28 Self-reference over metaphor |
| 2026-04-09 | (Synthesized from list-page rewrites this session) | §29 One grammar across surfaces |
| 2026-04-09 | "懂的人懂,不懂的人不被打扰" | §30 Reward depth, do not punish shallowness |
| 2026-04-09 | (Verified comprehensive understanding · rev 4 lock-in) | §24-§30 + Operational forbidden + Decision triggers |
| 2026-04-09 | "一切为了沉浸式,logo 复杂,也会影响" | §31 Immersion outranks identity (rev 5) |
| 2026-04-09 | "LOOM 相当于有 8 个竖线,7 个横线" | §32 LOOM = 8 warps + 7 wefts (rev 6) |
| 2026-04-09 | "12 经线和 3+1 那个方案是在另外不同的场景" | §32 scoping caveat — 8 is for the logo only |
| 2026-04-09 | "大图展示的静态时候要学会利用视觉效果" | §33 Visual pages must use visual effects (rev 7) |
| 2026-04-09 | "再 about 里加入 logo 和刚才讨论的静态,动态的图标" | §31 exception · icons-as-content (rev 8) |
| 2026-04-09 | "AI 已经在帮助 highlight 了" | §34 Ask absorbs Highlight (rev 9) |
| 2026-04-09 | "草稿是要整理才能在 live note" | §35 Scratchpad commits to Live Note (rev 9) |
| 2026-04-09 | "春雨是功能名字,润是功能的动作,如酥是最终效果。但是整个过程,是让人感觉悄无声息的" | §36 春雨知时节 · the four-part 润物无声 (rev 9) |
| 2026-04-09 | "claude 不是有 chat 和 cowork 两种吗" + "选中后上下分开" + "⌘/ 居中分屏" | §37 Two geometries, two intents (rev 10) |
| 2026-04-09 | "左边是笔记框架...右边是思维结构...能准确对应选中的文字" + "日后复习可以从思维结构快速捡起知识" | §38 Parallel structures · doc outline ↔ thought map (rev 11) |
| 2026-04-09 | "不是替代手写,是让思维比手写更干净更快" | §39 Faster and cleaner than handwriting (rev 12) |
| 2026-04-10 | "Source 应该一直陪着主体滑动跟着。Thought map 只是开头出现，往下滑自动消失" | §38 Geometry lock-in (rev 13) |
| 2026-04-10 | "每个点开的 note, 对应文段离开注意力范围后开始退场，离开视口再收起" | §38 Anchored-note lifecycle lock-in (rev 13) |
| 2026-04-10 | "阅读是往下，所以看过的内容往上。note 应该只在对应文段接近上方 / 离开上方时才退场" | §38 Anchored-note lifecycle lock-in (rev 13, reading-direction clause) |
| 2026-04-10 | "按视口比例也写入 design 规则" | §38 Anchored-note lifecycle lock-in (rev 13, viewport-proportional clause) |
| 2026-04-10 | "用户正在看旁边解释时，不该因为离开中线就自己变淡" | §38 Anchored-note lifecycle lock-in (rev 13, engaged-note clause) |
| 2026-04-10 | "highlight 属于 source；anchored note 才是真正的 note" | §38 Highlight vs note lock-in (rev 13) |
| 2026-04-10 | "Live Note 可以居中玻璃化挡住主体；它右边应该有伴随的 Thought map，就像 source 和主体的关系一样" | §37 Two geometries, two intents (rev 14 · Review replaces Cowork panel) |
| 2026-04-10 | "草稿要整理以后才能成为 note；scratch 不应该再写成 QuickBar 模型" | §35 Scratchpad commits to Live Note (rev 15 · ChatFocus scratch model) |
| 2026-04-10 | "Live Note 不该再被写成 QuickBar/recompile 单一路径；Ask / Note 也不该再按 QuickBar 解释" | §22 Recompile, not append + §23 Ask absorbs Note (rev 16) |
| 2026-04-10 | "Thought map 应该像画稿，要看到已经织的和还没织的" | §38 Thought-map node contract (rev 17 · ◇/◆ full pattern) |
| 2026-04-10 | "◇ 应该能直接开始这一节；review 右侧 thought map 应该跟着中间 Live Note 走" | §38 Thought-map node contract (rev 18 · actionable empty nodes + companion sync) |
| 2026-04-10 | "这样 source 和 thought map 就会有很多重复重叠" | §38 Thought-map node contract (rev 19 · reading rail is differential, review map is full pattern) |
| 2026-04-10 | "review 里左边 source 和右边 thought map 不能再讲同一种结构语言" | §38 Thought-map node contract (rev 20 · skeletal source rail in review) |
| 2026-04-10 | "review 左边 source 应该更像坐标尺，不要继续像目录那样说话" | §38 Thought-map node contract (rev 21 · numbered ruler source rail) |
| 2026-04-10 | "review 右边 thought map 点了以后，应该服务中间 Live Note，不该去滚背景 source" | §38 Thought-map node contract (rev 22 · review map navigates Live Note) |
| 2026-04-10 | "问了很多地方，却只有一个 note" | §38 Anchored-note lifecycle lock-in (rev 23 · fragment-level anchors for code/math) |
| 2026-04-10 | "AI 用 CLI，允许 codex cli 和 Claude cli" | §38 AI backend contract (rev 24 · dual CLI providers + graceful fallback) |
| 2026-04-10 | "同一个 block 里不同片段还是可能被压成一个 note" | §38 Anchored-note lifecycle lock-in (rev 25 · fragment range must be computed from DOM range text offsets) |
| 2026-04-10 | "对于 live note 内容增加可删减选项" | §38 Live Note section contract (rev 26 · anchored sections are individually deletable) |
| 2026-04-10 | "历史上已经分叉的 reading trace 不能让 note 像随机消失" | §38 Reading-trace visibility contract (rev 27 · merge root traces in doc views) |

---

*This document is the truth. The code is its manifestation.*
