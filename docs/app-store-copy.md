# Loom App Store Copy

Canonical metadata for the first Mac App Store submission. All strings
here are checked by `scripts/app-store-preflight.mjs` before upload.

## App Information

- Name: Loom
- Bundle ID: `com.yinyiping.loom`
- Primary category: Education
- Secondary category: Reference
- Subtitle: A screen that replaces paper
- Privacy Policy URL: `https://loom.app/privacy.html`
- Support URL: `https://loom.app/support.html`

Apple limits the app name and subtitle to 30 characters. The subtitle above is 28 characters.

## Description

Loom turns the reading you already have into the learning you wanted.

Point Loom at a folder of PDFs, Word documents, and markdown notes. It presents them as they sit — no auto-clustering, no silent flattening. The tree you already arranged is the library.

— The page —
Every source opens as a page, not a file. Serif typography, paper tone, oldstyle numerals, a running head for the chapter. A quiet surface built for long reading.

— The weaver —
Select a passage and press ⌘E. A weaver opens in the margin with a dashed bronze curve back to the line you picked. Ask it a question. Summon a panel. The answer anchors to the passage that called it.

— What settles, settles —
Panels you keep settle into Patterns, a kesi mosaic of what mattered enough to hold. Patterns is not a note app. It is what is left after the reading.

— Pursuits —
A pursuit is a question your mind is holding across many sources. Loom lets it live as a first-class object, with its own weights and seasons, not a buried tag.

— Rehearsal and Examiner —
When it is time to remember, Loom writes from memory with you (⌘⇧R) or hands off to the Examiner (⌘⇧X) to quiz you. Both run against the sources you actually read.

— On a computer —
Loom is a macOS window, literary when you read alone, working when you show it to someone. ⌘K opens the Shuttle. ⌘4 jumps to Patterns. ⌘5 jumps to Weaves.

— Private by design —
Your files stay on your Mac. Bring your own key for Anthropic or OpenAI, or run Ollama locally for fully on-device AI. Keys live in the macOS Keychain. Sandboxed and notarized for the Mac App Store.

Loom is for students, researchers, editors, and anyone who reads long-form to think, not to skim. Built for macOS. Keyboard-and-trackpad first.

## Keywords

reading, study, pdf, notes, research, syllabus, textbook, rehearsal, learning, patterns, pursuit

## Promotional Text

Promotional text (170-character cap) can be updated without a new review:

```
Select a passage and Loom opens a weaver in the margin. Ask the page a question. Keep what matters. Every answer anchors back to the line that summoned it.
```

## Screenshot Plan

Apple currently accepts one to ten Mac screenshots in PNG or JPEG, using a 16:10 size: 1280 x 800, 1440 x 900, 2560 x 1600, or 2880 x 1800. Source: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/

Default screenshot command:

```bash
npm run app:screenshots
```

Default output:

```text
.app-store/screenshots/
```

Default screenshot format: JPEG, 2880 x 1800.

Default surfaces, ordered for the App Store reel (frontispiece first, because it is the hero slot):

- Frontispiece: a room for slow reading
- Library: your library, as you arranged it
- Home: where you left off
- Sōan: a whole argument on one sheet
- Patterns: what has settled

Optional dark-mode set:

```bash
LOOM_SCREENSHOT_WIDTH=2560 LOOM_SCREENSHOT_HEIGHT=1600 LOOM_SCREENSHOT_FORMAT=jpeg npm run app:screenshots
```

Preflight check before upload:

```bash
npm run app:preflight
```

Archive and export path:

```bash
npm run app:archive
LOOM_APPLE_TEAM_ID=<team id> LOOM_ALLOW_PROVISIONING_UPDATES=1 npm run app:archive:store
LOOM_APPLE_TEAM_ID=<team id> LOOM_ALLOW_PROVISIONING_UPDATES=1 npm run app:export:store
```

`app:archive` creates a local ad hoc archive for bundle validation. The `:store`
commands require an Apple Developer team and use
`macos-app/Loom/ExportOptions-AppStore.plist` with the `app-store-connect`
export method.

## Review Notes

- Loom stores user materials locally. The app never moves, rewrites, or uploads your source files.
- API keys are stored in the macOS Keychain under `com.yinyiping.loom`. Nothing about those keys is transmitted to Loom's developer.
- The Mac App Store build runs sandboxed under `com.apple.security.app-sandbox` with `files.user-selected.read-write` and `network.client`. There is no inbound `network.server` entitlement.
- CLI AI providers (Claude CLI, Codex CLI) are disabled in sandboxed App Store builds. The picker surfaces them with a grey-out explanation; users can still pick Anthropic, OpenAI, Ollama (local loopback on `http://127.0.0.1:11434`), or a Custom HTTPS Endpoint.
- All AI calls are user-initiated. Only the text of the prompt the user chose is transmitted; Loom does not inject user, device, or telemetry identifiers into those requests.
- There is no Loom analytics service, no account system, and no telemetry beyond Apple's standard install/crash channels.
- Loom's Privacy Manifest (`macos-app/Loom/Resources/PrivacyInfo.xcprivacy`) declares `NSPrivacyAccessedAPICategoryUserDefaults` and `NSPrivacyAccessedAPICategoryFileTimestamp` with the appropriate reason codes, and one `NSPrivacyCollectedDataTypeOtherUserContent` purpose (AppFunctionality), matching the prompt-transmission behavior above.
- For a working demo during review, drop any PDF into the Loom window to trigger ingestion. AI features are optional; a test Anthropic key can be supplied on request.
