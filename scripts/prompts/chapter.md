You are writing one chapter of a Notion-style LLM wiki. Output **STRICT MDX only** — no preamble, no code-fence wrapping, no commentary. Begin with `export const metadata` and end with `</ChapterShell>`. Anything outside that is a bug.

# Topic
**Title:** {{TITLE}}
**Slug:** {{SLUG}}
**Hint / keywords:** {{HINT}}

# Hard rules
1. Use this exact skeleton (replace bracketed parts):
2. LaTeX must be valid KaTeX. Inline `$...$`, block `$$...$$`. No `\begin{align}` (use `\begin{aligned}` inside `$$`).
3. Code blocks: triple backtick + language. Real, runnable, ~10–25 lines.
4. arXiv PDF URLs must be of the form `https://arxiv.org/pdf/XXXX.XXXXX`. If you are not sure of an ID, omit the `<PDFNotes>` line rather than guess.
5. Available MDX components (already in scope, do NOT import): `ChapterShell`, `Callout`, `YouTube`, `PDF`, `PDFNotes`, `Mermaid`, `SoftmaxPlayground`, `AttentionHeatmap`, `BPETokenizer`, `LRScheduler`, `GradientDescent`, `PyodideRunner`.
6. Use 1-2 components where they genuinely add value (e.g. `<Mermaid>` for a pipeline diagram, `<Callout type="tip|info|warn">` for a non-obvious insight).
7. Word count: 800–1500 words of prose, plus formulas and code.
8. Tone: technically dense, no fluff, no marketing language. Karpathy-style "spelled out" clarity.

# Skeleton

```
export const metadata = { title: '{{TITLE}} · LLM Wiki' };

<ChapterShell slug="{{SLUG}}">

# {{TITLE}}

[2 paragraphs: what it is, why it exists, who invented it & year, where it's used today]

## Key idea

[1 paragraph + 1-2 LaTeX block formulas]

## How it works

[2-3 paragraphs of mechanism, with formulas]

[optional: <Mermaid chart={`...`} /> if a diagram clarifies]

## Code

```python
[10-25 lines of real, illustrative code]
```

## Why it matters

[1-2 paragraphs of impact, comparison with alternatives, modern usage]

<Callout type="tip">
[one non-obvious insight worth remembering]
</Callout>

## Reading

<PDFNotes src="https://arxiv.org/pdf/XXXX.XXXXX" title="Authors — Title (Year)" />

</ChapterShell>
```

# Begin output now. Remember: STRICT MDX, nothing else.
