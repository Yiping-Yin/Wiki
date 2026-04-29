# Loom — User Profile & Working Patterns

> **Purpose**: A living record of who the user is, how they work, learn, and think. Maintained by AI assistants over time so that future sessions — and Loom's own AI features — can act *as the user would*, not just *as told*.
>
> **Audience**: Any AI model (Claude, GPT, Codex, Gemini, etc.) working with the user, or any feature inside Loom that personalizes behavior.
>
> **The user has consented to this record** and intends for it to grow. The user may read and edit this file directly. Write factually and respectfully, as if the user is reading.
>
> **Maintenance**: Update after any session that reveals new patterns, preferences, or context. Don't delete past observations — mark them superseded if they change. See §10 for protocol.

---

## 1. Identity & Context

- **Role**: Student / product owner of Loom (the application this document lives inside)
- **Hardware**: MacBook Pro 16" (2024 model, M-series)
- **Primary OS**: macOS 15+ (Sequoia/Tahoe era)
- **Languages**: Chinese (native) + English. Frequently mixes English technical terms into Chinese sentences. Comfortable reading either; prefers Chinese for nuanced design discussion, English for code/specs.
- **Time zone**: Inferred from session timestamps; not yet explicitly recorded.
- **Email**: yiping_yin0521@outlook.com

### Self-described context
- Builds Loom because existing tools (Notion, Notability, Obsidian) don't fit the way they want to learn
- Studies university-level courses (recent active: FINS3646 Finance, INFS 3822 Innovation/Technology Management)
- Has design instincts and references kesi (缂丝) traditional craft as an aesthetic touchstone

---

## 2. Active Engagements

> Current studies / projects the user is working with, gleaned from Loom usage.
> Update as folders are added/removed and as sessions reveal active topics.

### Courses (folders in Loom)
- **FINS3646** — finance (UNSW course code pattern)
- **INFS 3822** — applied innovation & technology management
- **AI** — pure page (likely a personal topic / synthesis surface)

### Source material patterns
- Mostly PDFs (textbooks, lecture slides, assignment briefs)
- Folder structure usually: `<Course>/Assessment/`, `Guide/`, `Week/`, `knowledge/`
- Filenames frequently contain trailing whitespace (e.g., `Assessment ` not `Assessment`); the system must tolerate this

### Loom development
- Iterating on the macOS app's reading & note-capture model with this AI assistant
- Prior iterations included a webview-based architecture; current direction is Swift-primary

---

## 3. Learning Patterns

### How the user reads
- **PDF-first**: most sources are PDFs. Reading happens inside Loom's PDF viewer, not external tools.
- **Selection-driven**: the user highlights passages as they read; engagement happens at selection time.
- **Light annotation**: short reactions ("Managing innovation", "business") rather than long marginalia. Implies *fast capture* matters more than *deep writing-in-the-moment*.
- **Returns to passages**: anchors back to the source PDF passage are valued — the user has explicitly tested "Jump to passage" links.

### How the user wants AI to help
- **On demand**, not always-on. AI lives behind a single gesture, not as a permanent panel.
- **For explanation**, not generation. The user asks "what does this mean / why does the author argue this", not "write me a summary".
- **Curiosity-led**: user → AI direction. The user has rejected quiz/AI-tests-user patterns repeatedly.
- **Translation**: leans on macOS system Translate (right-click → Translate), not custom translation. Implies *trust the OS for things the OS already does well*.

### What the user does NOT do
- Highlight 100+ passages per session for later review (Readwise-style hoarding) — the user has explicitly rejected "collection-as-an-end" patterns.
- Build elaborate note hierarchies, tags, or knowledge graphs.
- Use spaced-repetition / Anki-style review (not yet — possibly future "Panel" feature).

---

## 4. Working Patterns

### Iteration style
- **Tight feedback loops**: tests after each change, screenshots back fast, reacts immediately.
- **Sharp critique**: identifies overlap, redundancy, friction with a single sentence.
- **Asks "ultrathink" when stuck**: invokes deeper reasoning by name when the surface answer isn't enough.
- **Demands consolidation**: when in doubt, the user prefers fewer surfaces over more.
- **Tolerates iteration**: comfortable saying "继续改进优化" (keep improving) without specifying what — trusts the AI to identify the next valuable thing.

### Communication style
- **Mixed English + Chinese**, often punctuated with English technical terms in Chinese sentences
- **Short, direct messages** when giving feedback; longer when explaining intent
- **Screenshots** are a primary feedback channel — points at the actual UI
- **Says "执行" / "继续" / "shipped"** to approve a recommendation and move on
- **Dislikes verbose responses** when the situation calls for action — wants execution, not analysis paragraphs

### Decision-making
- Asks for proposals + tradeoffs, then picks; rarely picks "neither"
- Prefers options ranked with a clear recommendation over neutral "you choose"
- Will reverse a decision when shown evidence it was wrong; doesn't double down

---

## 5. Aesthetic & Interaction Preferences

### Visual
- **Apple-native**: NavigationSplitView, system materials, system fonts, Vellum-era warm-paper palette
- **Quiet typography**: small eyebrows, italic metadata, muted secondary text
- **Avoid chrome**: no permanent floating panels, no always-visible toolbars beyond what's strictly necessary
- **Whitespace for breathing**: dense layouts feel "burdened"
- **Native context menus** are preferred over custom UI for actions

### Interaction
- **Trackpad-first**: gesture navigation (two-finger swipe back/forward) matters
- **Right-click as primary action surface**: prefers stacked context menus over scattered keyboard shortcuts
- **No keyboard shortcuts for low-frequency operations** — explicitly stated
- **Bidirectional links** matter — if A references B, the user wants to be able to find B and trace back to A

### What feels "wrong" to the user (reactions observed)
- Duplicate features (same thing accessible in two places)
- Empty/unused space when the layout could be tighter
- Buttons that don't do what their label suggests
- Sections that split related content arbitrarily ("notes here, pursuits there")
- Anything that feels like it's "wasting their time" — extra clicks for low-value choices

---

## 6. Tooling & Inspirations

### Tools the user has referenced
- **Notion** — knows it, wants Loom to NOT be Notion
- **Notability** — uses on iPad, recognizes it doesn't translate to laptop
- **Obsidian** — knows it, sees its limits
- **Adobe Acrobat AI Assistant** — knows the chat-with-PDF pattern
- **Apple Translate / Writing Tools** — uses system features when they work

### Inspirations the user has named
- **Leica** ("would Leica ship this?" as a craft veto)
- **kesi (缂丝)** — Chinese silk weaving as an aesthetic and process touchstone
- **OpenAI Prism / Latex / Obliv** — referenced as products with strong workflow design
- **Chan Karunamuni's "with behavior, not animation"** — interfaces respond to user actions, not play preset animations

### Tools the user uses for AI
- Claude (this assistant)
- Has expressed openness to "other AI models" reading the same protocol docs (so they should be model-agnostic)

---

## 7. Recurring Feedback Patterns

These are observed — not stated as rules — but recur enough to inform future decisions:

| Pattern | Observed |
|---|---|
| **"This duplicates X"** | Multiple times. Consolidation is the default response. |
| **"It's too crowded / too much chrome"** | Multiple times. Less-is-more on every visible surface. |
| **"I clicked X but Y happened"** | When buttons fire wrong actions or links go nowhere — surface clear, immediate. |
| **"This still doesn't work"** | When a fix doesn't deploy or backwards-compat misses a case — needs a verification path. |
| **"How does X relate to Y?"** | When two features seem to overlap — wants relationship made explicit or one removed. |
| **"看一下" / "you look at this"** | Often paired with a screenshot — wants a visual diagnosis, not a code dive. |

---

## 8. Aspirations & Future Direction

The user has expressed interest in Loom evolving so that:

1. **AI can act on the user's accumulated record** — not just answer ad-hoc questions, but use the user's notes, patterns, and decisions to complete tasks autonomously ("AI can complete the same kind of task by reading Loom's info").
2. **Personalization across models** — whatever AI is being used (Claude, GPT, etc.) reads the same profile and behaves consistently.
3. **Habits as data** — usage patterns, learning rhythms, and work flow themselves become inputs that future Loom features can use.

**Implication for current architecture**: keep the data layer (Markdown in `LoomFileStore` + this profile) clean and accessible. Future personalization features will read from these substrates.

---

## 8b. Privacy Note

This file currently lives at the project root for AI-tool reachability. **If Loom is ever published as a public repository**, this file MUST be added to `.gitignore` or split into:
- `LOOM_USER_PROFILE.template.md` (sanitized, public) — structure + section headings, no observations
- `LOOM_USER_PROFILE.md` (private, gitignored) — actual observations

The user's email, course codes, and observed patterns are personal data. Treat this file accordingly.

## 8c. Questions Worth Asking (When Natural)

Don't ambush the user with a survey. But when conversation organically opens a door, gently elicit. Then move the answer to the appropriate section above.

- What's "success" for Loom — personal tool only, or shared / commercial eventually?
- What's the longest study session you actually do (not aspire to)?
- Are there courses / topics that recur across semesters?
- When AI gets something wrong for you, do you correct in writing or just dismiss?
- Is there a moment in the day you most want Loom to surface something to you?
- Are there other humans you'd want to hand a Loom page to (collaborators, professors)?

## 9. Things NOT Inferred / Still Unknown

Be honest about what we haven't learned. Don't fabricate:

- Specific career goals beyond "studying"
- Deadlines or exam dates
- Reading speed / quotas / volume targets
- Whether the user wants Loom commercialized or kept personal
- Collaboration patterns with other humans
- How long sessions typically run
- Energy/focus patterns across the day or week

When something here is observed, move it to the appropriate section above.

---

## 10. How to Maintain This Document

### When to update

Update **in the same commit** as the work that revealed the new information.

| Trigger | Where to record |
|---|---|
| User mentions a tool / app / inspiration | §6 |
| User's reaction to a UI choice | §5 or §7 (depending on whether explicit or pattern) |
| User describes how they read / take notes / study | §3 |
| User explains a working preference (timing, iteration, communication) | §4 |
| User adds/removes a course / project | §2 |
| User states a preference about AI behavior | §3 or §5 |
| User says "I want Loom to eventually..." | §8 |
| User contradicts something here | Mark superseded, add new entry below it |

### Tone

- **Factual**: state what was observed, not what it might mean. ("User asks 'ultrathink' to request deeper reasoning" — not "User has anxiety about superficial answers".)
- **Respectful**: write as if the user is reading. They are.
- **Specific**: cite what session / decision the observation came from when relevant.
- **Honest about gaps**: §9 exists. Use it. Don't fill in fictional patterns.

### Anti-patterns

- Don't infer mental states or motivations beyond what was stated.
- Don't pathologize ("user has trouble with X") — describe behavior, not deficit.
- Don't summarize so heavily that signal is lost. Concrete > abstract.
- Don't merge with `LOOM_RULES.md` — that's product spec, this is user observation. Keep them separate.

### How AI should USE this profile

When working on a Loom task or any task for this user:

1. **Read this file first** (and `LOOM_RULES.md` if Loom code is involved).
2. **Frame proposals against §3-§5**: would this fit the user's reading style, working pattern, aesthetic?
3. **Pre-empt objections from §7**: if a proposal is likely to trigger "this duplicates X" or "too much chrome", revise before presenting.
4. **Match communication style from §4**: short, direct, with clear recommendations. Use ultrathink-level depth only when invoked.
5. **Don't announce that you're using this file** — just behave consistently with it.

---

*Initial version: 2026-04-26. Captures observations accumulated through the late-April 2026 Loom design sessions. To be extended every session.*
