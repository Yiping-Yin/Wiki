# macOS Native Shell

Owns the native Loom desktop layer.

Primary responsibilities:

- native sidebar
- window and titlebar behavior
- native settings
- bridge handlers
- local runtime launch
- packaged app behavior
- App Store-facing native requirements

Key folders:

- `macos-app/Loom/Sources/`
- `macos-app/Loom/Tests/`
- `macos-app/Loom/Resources/`
- `scripts/build-install-loom-app.mjs`
- `scripts/package-loom-app.mjs`
- `scripts/export-loom-app-store.mjs`

Design rule:

The native shell should feel like the cabinet and system frame. It should support the knowledge surface without becoming a separate visual product.
