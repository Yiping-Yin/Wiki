# Loom Installed Runtime Decoupling · Product Design

Status: approved design direction  
Updated: 2026-04-19

## 1. Decision

Loom will stop treating the repo checkout as the installed app's production runtime.

The approved direction is:

- the installed `Loom.app` will launch from an **installed runtime root**
- the user's local knowledge/content will remain in a separate **content root**
- the installed app will no longer require the repo's `.next-build` directory to stay on disk
- successful app installation may clean repo-local production build artifacts
- Phase 1 will still require a system `node` runtime
- bundling Node into the app is explicitly deferred to a later phase

This is a runtime separation project, not a product IA change.

## 2. Problem

Today the installed app is small, but its production runtime is not actually self-contained.

The real runtime footprint lives in the repo:

- `.next-build` is the installed app's production server payload
- `.next-app-dev` is the local dev server payload
- `node_modules` is required because production launch still shells into `next start`

That creates three concrete failures:

1. **The installed app is not truly installed**
   - it still depends on a live repo checkout
   - deleting repo build artifacts breaks the installed app

2. **The repo accumulates large runtime caches**
   - `.next-build` remains as a long-lived production dependency
   - the checkout stays much larger than necessary even after install succeeds

3. **Runtime and content are conflated**
   - the app uses the repo as:
     - server runtime
     - knowledge content root
     - build workspace
   - this makes future cleanup and packaging brittle

## 3. Product Goal

Installing `Loom.app` should feel like installing an app, not pinning a desktop shell to a development checkout.

The stable user-facing behavior should become:

1. the user installs Loom
2. Loom launches from a persistent installed runtime
3. Loom still reads the user's knowledge/content from the chosen content root
4. repo-local production caches are no longer required after install

The user should be able to slim the repo without accidentally breaking the installed app.

## 4. Current Reality

The current macOS shell starts a local Next.js server by:

- locating the repo root
- setting the process current directory to that repo
- running production mode against repo `.next-build`
- relying on repo `node_modules` and repo layout

This means the installed app is effectively:

- a native launcher
- plus a repo-bound web runtime

That launcher is fine. The runtime dependency shape is not.

## 5. Chosen Model

Loom will introduce two distinct roots:

### 5.1 Runtime Root

The runtime root is Loom-owned installed server code.

It will live under:

- `~/Library/Application Support/Loom/runtime/<build-id>/`

This runtime root contains:

- the built standalone Next server payload
- runtime static assets needed by that build
- a small launch manifest if needed

This root is versioned by build and is safe for Loom to replace.

### 5.2 Content Root

The content root is the user/project data Loom reads and writes.

In Phase 1 this remains the current local project root, for example:

- `/Users/yinyiping/Desktop/Wiki`

The content root continues to own:

- `knowledge/`
- `app/wiki/`
- uploads
- Loom-generated metadata and derived docs that belong to the project

This root is **not** copied into the installed runtime.

### 5.3 Separation Rule

The runtime root serves code.  
The content root serves content.

The installed app must no longer assume these are the same directory.

## 6. Runtime Architecture

### 6.1 Build Output

The production web build should move to a deployable standalone runtime shape instead of repo `.next-build` as a permanent dependency.

Phase 1 uses:

- Next standalone output
- runtime static assets
- public assets required at runtime

The runtime package should be installable outside the repo.

### 6.2 Launch Contract

When the app launches production mode, it should:

1. resolve content root
2. resolve installed runtime root
3. start the standalone server from the runtime root
4. pass content-root environment to the server process

The app should no longer set its working directory to the repo for installed production launches.

### 6.3 Server File Access

Server-side code that currently reads from `process.cwd()` must move to a shared content-root resolver.

The rule becomes:

- scripts may continue using repo `cwd`
- installed runtime server code must use `LOOM_CONTENT_ROOT` (or equivalent resolver) for project data access

This is the minimum refactor needed to separate runtime from content without duplicating knowledge files.

## 7. Build and Install Flow

### 7.1 Development

Development remains repo-local:

- `npm run dev`
- `.next-app-dev`
- repo `node_modules`

This is unchanged in Phase 1.

### 7.2 Production Install

`npm run app`, `app:user`, and `app:system` should change behavior:

1. build a standalone production runtime
2. install/copy runtime payload into Application Support
3. build/install native `Loom.app`
4. make the installed app point at the installed runtime root
5. optionally remove repo-local production runtime artifacts after successful install

After install succeeds, the repo should no longer be required to retain `.next-build`.

### 7.3 Packaging

Packaging scripts should package:

- the native app bundle
- the standalone runtime payload

They should no longer assume the runtime lives only in DerivedData plus a repo-side `.next-build`.

## 8. Cache Policy

### 8.1 Long-Lived

Long-lived installed artifacts:

- `/Applications/Loom.app` or `~/Applications/Loom.app`
- `~/Library/Application Support/Loom/runtime/<build-id>/`

### 8.2 Repo-Local and Disposable

Repo-local production artifacts should become disposable after successful install:

- `.next-build`
- related temporary build duplicates

Repo-local dev artifacts remain development-only:

- `.next-app-dev`

### 8.3 Not Disposable

These are not "cache" for this project phase:

- the content root itself
- source files
- knowledge metadata
- uploads
- user-owned raw sources

This project must not trade runtime decoupling for content duplication or source mutation.

## 9. Phase 1 Scope

Phase 1 includes:

- installed runtime root in Application Support
- standalone production runtime packaging
- runtime-root vs content-root separation
- server content-root resolver
- install flow updates
- safe repo `.next-build` cleanup after successful install

Phase 1 explicitly does **not** include:

- bundling Node
- full offline self-contained app distribution
- moving user content out of the project root
- changing how dev mode works

## 10. Phase 2

Phase 2 may bundle Node or another embedded server runtime if needed.

That would remove the installed app's dependence on a system Node installation.

This is valuable, but not required to solve the current repo-cache problem.

## 11. Failure Handling

If the installed runtime is missing or stale, Loom should report:

- installed runtime missing
- rebuild and reinstall required

It should not silently fall back to repo `.next-build` once this project lands.  
Silent fallback would reintroduce the very dependency this design is trying to remove.

## 12. Success Criteria

This project is successful when all of the following are true:

1. `Loom.app` launches successfully with repo `.next-build` removed
2. the app still reads the user's content from the configured content root
3. repo-local production build artifacts are no longer mandatory after install
4. installation leaves a persistent runtime in Application Support
5. development mode still works from the repo

## 13. Non-Goals

This project does not attempt to:

- redesign Atlas or Today
- change knowledge storage ownership
- change source immutability rules
- replace the user's content-root workflow
- solve every cache in the repo

The goal is narrower:

- stop the installed app from depending on repo production build caches

## 14. Risks

### 14.1 Server Code Path Assumptions

A lot of server/data code currently assumes `process.cwd()` is the project root.

This is the main technical migration risk.

The fix is not ad hoc callsite patching.  
The fix is introducing a shared content-root resolver and using it consistently in server-side project-data access.

### 14.2 Static Asset Wiring

The standalone runtime must preserve:

- Next static assets
- pagefind output
- public assets needed at runtime

If these are packaged incorrectly, the installed app will boot but render incompletely.

### 14.3 Install Cleanup Timing

Repo `.next-build` must only be removed after:

- runtime install succeeds
- native app install succeeds

Otherwise the current install path could be left broken midway through.

## 15. Recommended Next Step

Implementation should start with the runtime/content split contract, not with installer cleanup.

Order:

1. introduce a shared content-root resolver
2. make production runtime launch from an installed runtime root
3. update build/install scripts to stage standalone runtime there
4. only then remove repo `.next-build` after successful install
