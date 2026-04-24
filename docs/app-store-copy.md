# Loom App Store Copy

Draft metadata for the first Mac App Store submission.

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

Loom is a local Mac app for slow reading, source-grounded notes, and AI-assisted thinking.

Choose a folder of PDFs, Markdown, notes, and slides. Loom keeps your materials on your Mac, lets you mark passages, hold questions, build panels, and connect ideas into patterns. AI lives in the margin: it can help organize a selection or sharpen a draft, but your library stays local and your configured provider receives only the prompts you choose to send.

Loom is not a chat inbox and not a productivity dashboard. It is a quiet workspace for turning loose reading into durable understanding.

## Keywords

reading, notes, research, knowledge, markdown, pdf, study, reference, ai, thinking

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

Default surfaces:

- Library: your library, as a bookshelf
- Home: a room for slow reading
- Sōan: cards become a thinking draft
- Patterns: thoughts that return settle here
- Frontispiece: book-like identity, not dashboard chrome

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

- Loom stores user materials locally.
- API keys are stored in macOS Keychain under `com.yinyiping.loom`.
- The Mac App Store build runs sandboxed.
- CLI AI providers are disabled in sandboxed App Store builds; HTTPS providers remain available.
- There is no Loom analytics service.
