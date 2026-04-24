# Loom App Store Copy

Draft metadata for the first Mac App Store submission.

## App Information

- Name: Loom
- Bundle ID: `com.yinyiping.loom`
- Primary category: Education
- Secondary category: Reference
- Subtitle: A screen that replaces paper
- Privacy Policy URL: `https://loom.app/privacy`

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

Default surfaces:

- Home: a room for slow reading
- Desk: return to the next reading action
- Knowledge: source library and local materials
- Knowledge docs: one collection in context
- Frontispiece: book-like identity, not dashboard chrome

Optional dark-mode set:

```bash
LOOM_SCREENSHOT_WIDTH=2560 LOOM_SCREENSHOT_HEIGHT=1600 npm run app:screenshots
```

## Review Notes

- Loom stores user materials locally.
- API keys are stored in macOS Keychain under `com.yinyiping.loom`.
- The Mac App Store build runs sandboxed.
- CLI AI providers are disabled in sandboxed App Store builds; HTTPS providers remain available.
- There is no Loom analytics service.
