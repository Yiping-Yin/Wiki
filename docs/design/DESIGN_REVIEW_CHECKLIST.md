# Design Review Checklist

Status: active review checklist  
Updated: 2026-04-15

Use this checklist when reviewing UI, interaction, or AI-behavior changes.

## Product Identity

- Does this still feel like a loom for thought rather than a generic chat or notes product?
- Does the change preserve source primacy?
- Does the change strengthen or weaken the thought map as the product core?

## Presence

- Does this reduce or increase visible system presence?
- Is any new chrome truly necessary in the default state?
- Could this effect be delayed, scoped, or removed entirely?

## Capture

- Does this make capture faster or slower?
- Can the user still externalize a thought in under 2 steps?
- Did the change accidentally re-bind capture and elaboration into one action?

## Review

- Does `Cmd+/` still behave as the current review/elaboration surface?
- Are pending captures visible enough without becoming loud?
- Does the right-side surface feel like a pattern / draft, not a generic sidebar?
- If the same panel or weave appears in multiple surfaces, does it keep the same state label and action wording?

## Scheduler

- If Home or /today recommends a target, does it explain why now without turning into a scoring dashboard?
- Do panel and weave targets use the same grammar for primary and secondary actions?
- If this target were shown in another surface, would it still read as the same object?

## AI

- Does the AI remain summoned rather than ambient?
- Does the AI copy stay direct, quiet, and non-performative?
- Did the change introduce any visible “thinking / syncing / indexing” theater?

## Visual Language

- Does this stay within the Apple-native, Liquid Glass / glass-first visual language?
- Is accent used for intent rather than decoration?
- Is the page calmer or noisier after the change?

## Duplication

- Does this duplicate something the OS, browser, or existing product already does?
- If this feature were removed, would users actually lose something meaningful?

## Final Test

- If this shipped today, would Loom feel more focused or less focused?
- If a user never read the docs, would the interaction still teach itself gradually?
- If this were the first thing a new collaborator saw, would it point them toward the current canon or away from it?
- If a second contributor touched this same feature tomorrow, would the docs and the UI teach the same vocabulary?
