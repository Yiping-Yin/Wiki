# Loom macOS Native Layer Audit - 2026-04-24

Status: working-tree boundary audit

## Purpose

`ShuttleView.swift` is not a standalone file. It is part of the current
macOS-native Loom layer: window registration, native command handling,
SwiftData writers, the Vellum token layer, bridge handlers, settings, and
native action surfaces all move together.

This audit records the safe commit boundary before staging any of that work.

## Findings

1. `project.yml` is the intended source shape.
   - `Loom` target includes `Sources`, `Assets.xcassets`, and `Resources`.
   - `LoomTests` includes `Tests`.
   - XcodeGen 2.45.3 can generate a project with the same Swift file set.

2. `Loom.xcodeproj` already references the new native layer.
   - `ShuttleView.swift` is in the app target.
   - `LoomTokens.swift`, `LoomDataModel.swift`, the writer files, bridge handlers,
     native settings views, and AI clients are also in the app target.
   - The new macOS tests are in the test target.

3. Git still treats the native layer as incomplete.
   - Many files under `macos-app/Loom/Sources` are untracked.
   - Many files under `macos-app/Loom/Tests` are untracked.
   - `macos-app/Loom/Resources/PrivacyInfo.xcprivacy` is untracked through the
     `Resources/` directory.
   - Therefore, staging only `ShuttleView.swift` would create a broken review
     boundary: the project would reference files that might not be present in a
     clean checkout.

4. Deployment target is now consistent again.
   - `project.yml` declares macOS 14.0.
   - `Loom.xcodeproj` now declares macOS 14.0 in all build configurations.
   - The macOS 15-only `.containerBackground(..., for: .window)` call is now
     behind `loomWindowBackground(_:)`, with a macOS 14 fallback.

## Required Commit Boundary

Treat these as one macOS shell bucket:

- `macos-app/Loom/project.yml`
- `macos-app/Loom/Loom.xcodeproj/project.pbxproj`
- `macos-app/Loom/Resources/**`
- all untracked and modified files under `macos-app/Loom/Sources/**`
- all untracked and modified files under `macos-app/Loom/Tests/**`
- related repo checks such as `scripts/check-loom-macos-project-files.mjs`
- focused Shuttle behavior tests under `tests/shuttle-canonical-ia.test.ts`

Do not stage a single new Swift file from this bucket in isolation.

## Verification Commands

Run these before staging the bucket:

```bash
npm run app:check-project
npx tsx --test tests/shuttle-canonical-ia.test.ts tests/desk-first-ia.test.ts tests/canonical-detail-routes.test.ts
xcodebuild -project macos-app/Loom/Loom.xcodeproj -scheme Loom -configuration Debug -derivedDataPath /tmp/loom-shuttle-dd CODE_SIGNING_ALLOWED=NO build
```

After staging the macOS bucket, this stricter check should pass:

```bash
node scripts/check-loom-macos-project-files.mjs --require-tracked
```

## Review Notes

- `npm run app:check-project` warns while files are untracked; this is expected
  before staging. It fails only on project/reference/deployment mismatches.
- `--require-tracked` is intentionally stricter and should be used after the
  macOS bucket has been staged.
- The current working tree has unrelated non-macOS changes. Keep the macOS
  shell bucket separate from web app, generated public assets, and docs/spec
  buckets unless intentionally making a larger integration commit.
