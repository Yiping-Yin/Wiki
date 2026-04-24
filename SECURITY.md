# Security Policy

## Reporting a vulnerability

Do not file a public GitHub issue for security-sensitive problems.

Email **yiping_yin0521@outlook.com** with the subject line `Loom security`
and include:

- A short description of the issue and its impact.
- Steps to reproduce (or a proof-of-concept).
- macOS version, Loom version, and which build (Mac App Store / Developer-ID DMG / local).
- Your preferred credit line, if any, for the fix release notes.

You will get a reply within two working days. If you do not, please
re-send once — my inbox loses messages occasionally, but I do read every
security report.

## Scope

Loom is a local Mac app. The areas that matter most are:

- **API key handling.** Keys live in the macOS Keychain under
  `com.yinyiping.loom`. They are not logged, transmitted to any Loom
  server (Loom has no server), or written to disk outside the Keychain.
- **Sandbox surface.** The App Store build runs under
  `com.apple.security.app-sandbox` with only
  `files.user-selected.read-write` and `network.client` entitlements.
  Any escape or unintended filesystem access is in scope.
- **AI prompt transmission.** Only the text the user selected or typed
  is sent to the chosen AI provider. Any data leaving the Mac that the
  user did not initiate is in scope.
- **WKWebView ↔ Swift bridge.** Messages crossing the webview boundary
  should not allow arbitrary native action. Unauthorized bridge calls
  are in scope.

Out of scope: denial-of-service attacks against the user's own Mac,
issues that require physical access to an unlocked machine, and
behaviors that are documented as intentional in the README or
`docs/design/`.

## Disclosure

We coordinate disclosure. Please give us a reasonable window (typically
two weeks for high-severity, four for medium) before publishing details.
Fix releases include a credit line unless you prefer to stay anonymous.
