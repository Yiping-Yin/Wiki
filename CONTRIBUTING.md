# Contributing to Loom

Thanks for the interest. A few orientations before you start.

## The shape of the project

- Loom is an opinionated Mac app for reading and thinking, not a general-purpose note or productivity tool. Features that move it toward "chat client," "messaging," or "dashboard" are almost always rejected — even if they are individually good.
- The reading page is the center of the product. Every other surface serves it.
- We prefer **fewer, better-formed surfaces** over many options. If a proposed feature overlaps with an existing surface (Shuttle, Weaves, Sōan, Patterns, Pursuits, Rehearsal, Examiner, Atlas), the first question is whether it fits there.
- Design references: serif typography, paper tones, bronze accents, keyboard-first, trackpad-first. If you are unsure whether an interaction feels "Loom," look at the screenshots in the README.

## Before opening a PR

1. **Open an issue first** for anything more than a small bug fix. This saves both sides time.
2. **Search closed issues and the design notes in `docs/`** — many proposals have already been considered.
3. **Scope the change narrowly**: one intent per PR, one concern per commit.

## Local setup

```bash
git clone https://github.com/Yiping-Yin/Wiki.git loom
cd loom
npm install
npm run verify        # typecheck + build + smoke
npm run dev           # Next.js surface at :3000
npm run app:user      # build and install the macOS shell locally
```

See the "Dev Flow" section of the README for the full command set.

## PR checklist

- [ ] `npm run verify` passes (typecheck + build + smoke).
- [ ] `npm run app:preflight` passes if you touched anything in `.app-store/`, `docs/app-store-copy.md`, `public/*.html`, or `macos-app/Loom/`.
- [ ] New user-visible strings use the shipped vocabulary (Shuttle, weaver, panel, pursuit, pattern, weave, Sōan). No "Interlace," no "crystallize" in UI copy — those are internal names.
- [ ] No hardcoded user paths, API keys, or developer-machine assumptions.
- [ ] No new `com.apple.security.*` entitlements without explicit discussion. Sandbox surface is intentionally minimal.
- [ ] Commit messages describe the *intent*, not only the diff.

## License & DCO

By contributing, you agree that your contribution is licensed under the
[Apache License, Version 2.0](./LICENSE), the same license as the rest of
the project. You retain copyright; the Apache 2.0 grant applies.

We do not require a CLA. We do ask that every commit includes a
`Signed-off-by:` line (the [Developer Certificate of Origin](https://developercertificate.org/) model):

```bash
git commit -s -m "fix(reading): correct drop cap alignment in Vellum mode"
```

## Trademarks

"Loom," the Loom word-mark, and the Loom kesi-weave icon are trademarks of Yiping Yin. The Apache 2.0 license covers the source code. It does not grant a license to use these marks in a manner that suggests sponsorship or endorsement, or in a derivative product that identifies itself primarily as "Loom." Fork freely; rename the fork.

## AI collaborators

Loom is built collaboratively with AI coding assistants. This is not a
secret — it's tracked in the git history:

- Commits prefixed `[codex] …` come from **OpenAI Codex** (via the
  `codex` CLI or Codex Cloud). New Codex-assisted commits also include
  `Co-authored-by: Codex <267193182+codex@users.noreply.github.com>`
  so GitHub can attribute the `@codex` account in contributor surfaces.
- Commits whose body contains `Co-Authored-By: Claude …` come from
  **Anthropic Claude** (via Claude Code).
- Unprefixed commits without a `Co-Authored-By` trailer are
  hand-written by the maintainer.

If you send a PR, you don't need to disclose whether an AI helped you
draft it — we care that the code is correct, tested, and fits the
project's shape. But if an AI co-authored a substantial part of your
change, we ask you to add a `Co-Authored-By:` trailer crediting the
tool, matching the convention above.

See [AUTHORS.md](./AUTHORS.md) for the full attribution model.

## Security

Do not file public issues for security problems. Email the address in
[SECURITY.md](./SECURITY.md) (or the contact link in the issue chooser)
instead.
