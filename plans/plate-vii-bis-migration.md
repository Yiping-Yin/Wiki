# Plate VII-bis Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WebCaptureSetupView surface compliant with `docs/loom.md` §VII.bis (default-surface discipline) by relocating its 6 instructional/status/configuration cards into a new Settings > Capture pane + a Help > Capture-setup window, and dismantling the surface itself. Also patch §VII.bis.4 to reflect the actual codebase: Draft surface does not yet exist, LoomLibraryView is already mostly compliant, the only substantive migration target is WebCaptureSetupView.

**Architecture:** §VII.bis says: every Plate IV surface MUST have ONE foreground + no 教学/状态/空态/配置 visible by default. WebCaptureSetupView currently has SIX cards, all of them 教学/状态/配置 (not a foreground in sight). Rather than redesign it to find a foreground, we recognize that the page has no legitimate primary work object and **delete it** — its content goes to the right semantic homes:

- **Instructional content** (extension install / bookmarklet / capture flow / tips) → new `CaptureHelpView.swift` opened via menu bar `Help > Set up captures…`
- **Configuration content** (extension path, bookmarklet drag-link, storage location + Move to) → new `CaptureSettingsView.swift` (4th tab in Settings scene)
- **Status content** (pipeline status — embedding model loaded, indexed counts) → same `CaptureSettingsView.swift` as a sub-section

After migration, the sidebar loses its `Web Capture` entry; the user reaches setup content via Settings (⌘,) or Help menu (⌘?). The Captures inbox (existing `CapturesView`) becomes the sole capture-related sidebar entry.

The plan also patches `docs/loom.md` §VII.bis.4 to be honest about the current codebase state (Draft surface is TBD, not "already compliant").

**Tech Stack:** Swift 6 / SwiftUI / macOS 15 / xcodebuild / `tsx --test` contract tests

---

## File Structure

### Modify

| File | What changes | Responsibility |
|---|---|---|
| `docs/loom.md` | Patch §VII.bis.4 Per-surface migration clause | Honest state of Draft + Library |
| `macos-app/Loom/Sources/CapturesView.swift` | Delete `WebCaptureSetupView` struct (lines 1105–1607) and its 6 card view-builders | Remove the dismantled surface |
| `macos-app/Loom/Sources/LoomMinimalRootView.swift` | Remove `webCaptureSetupRow` (~lines 709–718), `.webCaptureSetup` enum case (~line 20), navigation references (~lines 920–922), and any `sidebarButton(rowID: "__webcapture", ...)` call sites | Sidebar entry removal |
| `macos-app/Loom/Sources/LoomApp.swift` | Add `CaptureSettingsView()` as 4th `.tabItem` in `Settings { TabView { … } }` (~line 50); add `Window("Capture Setup", id: CaptureHelpWindow.id) { CaptureHelpView() }` (~after line 65); add `CommandGroup` `.commands {}` block for `Help > Set up captures… ⌘?` (~line 132) | Wire new Settings tab + Help window + menu item |
| `macos-app/Loom/Sources/LoomLibraryView.swift` | Drop the "N page(s)" subtitle (line 45–47); add primary `+ Page` action button to empty state (line 52–62) | Minor §VII.bis compliance polish |

### Create

| File | Responsibility |
|---|---|
| `macos-app/Loom/Sources/CaptureSettingsView.swift` | 4th Settings tab. Three Form sections: (1) Browser Extension (extension path + Copy button), (2) Bookmarklet (drag-link), (3) Storage (path + Reveal in Finder + Move to…), (4) Pipeline (embedding model statuses + indexed counts + Refresh). All extracted verbatim from `WebCaptureSetupView`'s existing card bodies. |
| `macos-app/Loom/Sources/CaptureHelpView.swift` | New help window (paperChrome). Two sections: (1) Capture Flow — the 4-step `①②③④` enumeration, (2) Tips — the disclosure-group bullet list. Read-only narrative; no interactive controls. |
| `tests/sidebar-no-webcapture-row.test.ts` | Contract test: assert `webCaptureSetupRow` / `.webCaptureSetup` / `"Web Capture"` no longer appear in `LoomMinimalRootView.swift`. Mirror existing `tests/native-sidebar-source-row-fallback.test.ts` shape. |

### Important constants to introduce

In `macos-app/Loom/Sources/LoomApp.swift`:

```swift
enum CaptureHelpWindow {
    static let id = "loom.capture-help"
}
```

(Mirrors existing `KeyboardHelpWindow`, `AboutWindow`, etc. patterns.)

---

## Tasks

### Task 0: Patch `docs/loom.md` §VII.bis.4 to reflect real codebase state

**Files:**
- Modify: `docs/loom.md` (the §VII.bis.4 block around the "Draft — ✅ 已合规" line)

- [ ] **Step 1: Read current §VII.bis.4 text**

```bash
grep -n "VII.bis.4\|已合规" docs/loom.md
```

Expected: locate the section heading + the line claiming Draft is compliant.

- [ ] **Step 2: Edit §VII.bis.4 to match real state**

In `docs/loom.md`, replace the existing §VII.bis.4 sub-section with:

```markdown
#### §VII.bis.4 Per-surface 迁移清单（codebase-grounded, 2026-05-13 投影）

**LoomLibraryView (Sources / Organize 类似面)** — 接近合规但需小修：
- foreground = `rootGrid` list ✅
- header 上的 "N page(s)" count → 删除（违 §VII.bis.2 count badge in chrome）
- empty state 的纯文本 "Use the sidebar's + Page or + Folder" → 加 primary action 按钮（符 §VII.bis.3 empty-corpus = 1 prompt + 1 primary action）

**WebCaptureSetupView (Web Capture 设置面)** — 完全不合规，整体 **拆除**：
- 6 张卡片全部是 教学/状态/配置 —— 没有 foreground 候选
- 4 张教学卡 (extensionInstallCard / installCard / captureFlowCard / tipsCard) → `Help > Set up captures…` 菜单项打开 `CaptureHelpView` 窗口
- 1 张配置卡 (storageCard) + 1 张状态卡 (pipelineStatusCard) → Settings 第 4 个 tab "Capture" (`CaptureSettingsView`)
- WebCaptureSetupView 本体 struct + sidebar `Web Capture` entry 删除

**Draft surface** — 当前 codebase **不存在**。本次 amendment 之前的 spec 误把概念稿截图当作 shipped 代码。该 surface 留待 Phase X (TBD) 设计 + 实现，标记为 §VII.bis.7 待补章节。建成时按 §VII.bis.1 (single foreground = textarea) + §VII.bis.3 (cold-start = last draft) 设计，作为 Plate VII-bis 的样板。

**其余 16 个 Plate IV surface** — 每个 PR 单独按 §VII.bis.1–3 declare，本计划不覆盖。
```

- [ ] **Step 3: Verify diff looks right**

```bash
git diff docs/loom.md
```

Expected: only the §VII.bis.4 block changes; other amendments untouched.

- [ ] **Step 4: Commit**

```bash
git add docs/loom.md
git commit -m "docs(spec): patch §VII.bis.4 to reflect actual codebase (no Draft surface yet)

Original §VII.bis.4 (PR #28) mistakenly treated user-shared screenshots
as evidence of shipped Draft / Collect / Organize surfaces. Grep across
all branches confirms those labels and the Draft surface code do not
exist in this repository. Spec is amended to be ground-truth:

- LoomLibraryView is the real 'Sources / Organize' surface, mostly
  compliant; needs only minor polish (drop count, primary-action empty)
- WebCaptureSetupView is the real migration target — fully non-compliant,
  6 cards all 教学/状态/配置, dismantled rather than redesigned
- Draft surface marked as TBD §VII.bis.7

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: Create `CaptureSettingsView.swift` skeleton + register as 4th Settings tab

**Files:**
- Create: `macos-app/Loom/Sources/CaptureSettingsView.swift`
- Modify: `macos-app/Loom/Sources/LoomApp.swift` (~line 50)

- [ ] **Step 1: Read existing Settings pane reference**

```bash
cat macos-app/Loom/Sources/AppearanceSettingsView.swift
```

Note the pattern: `import SwiftUI`, `struct XxxSettingsView: View { var body: some View { Form { Section(…) { … } } } }`.

- [ ] **Step 2: Create `CaptureSettingsView.swift` skeleton**

```swift
import SwiftUI

/// Settings pane for capture infrastructure: browser extension setup,
/// bookmarklet fallback, storage location, and embedding-pipeline
/// status. Replaces the dismantled WebCaptureSetupView surface per
/// docs/loom.md §VII.bis.
struct CaptureSettingsView: View {
    var body: some View {
        Form {
            Section("Browser Extension") {
                Text("TODO: extension path + Copy button — filled in Task 2")
            }
            Section("Bookmarklet (fallback)") {
                Text("TODO: bookmarklet drag-link — filled in Task 3")
            }
            Section("Storage") {
                Text("TODO: path + Reveal + Move to — filled in Task 4")
            }
            Section("Pipeline") {
                Text("TODO: model status + indexed counts + Refresh — filled in Task 5")
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 480, minHeight: 440)
    }
}

#Preview {
    CaptureSettingsView()
}
```

- [ ] **Step 3: Register as 4th Settings tab in `LoomApp.swift`**

In `macos-app/Loom/Sources/LoomApp.swift`, find the `Settings { TabView { … } }` block (~line 50). Add the new tab after `DataSettingsView`:

```swift
Settings {
    TabView {
        AppearanceSettingsView()
            .tabItem { Label("Appearance", systemImage: "paintbrush") }
        AIProviderSettingsView()
            .environmentObject(delegate.server)
            .tabItem { Label("AI", systemImage: "sparkles") }
        DataSettingsView()
            .tabItem { Label("Data", systemImage: "externaldrive") }
        CaptureSettingsView()
            .tabItem { Label("Capture", systemImage: "tray.and.arrow.down") }
    }
}
```

- [ ] **Step 4: Build to verify**

```bash
npm run app:check-project && xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -20
```

Expected: BUILD SUCCEEDED. If `Cannot find 'CaptureSettingsView' in scope`, ensure the new file was added to the Xcode project (`npm run app:check-project` flags this).

- [ ] **Step 5: Commit**

```bash
git add macos-app/Loom/Sources/CaptureSettingsView.swift macos-app/Loom/Sources/LoomApp.swift
git commit -m "feat(settings): add CaptureSettingsView skeleton as 4th Settings tab

Empty placeholder Form with 4 sections (Browser Extension / Bookmarklet /
Storage / Pipeline). Content moved from WebCaptureSetupView in Tasks 2–5.
Tab label 'Capture', SF Symbol 'tray.and.arrow.down' (matches the
existing toolbar Capture button).

Refs docs/loom.md §VII.bis migration plan Task 1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Move `extensionInstallCard` contents → `CaptureSettingsView` "Browser Extension" section

**Files:**
- Modify: `macos-app/Loom/Sources/CaptureSettingsView.swift` (Browser Extension Section)
- Read-reference: `macos-app/Loom/Sources/CapturesView.swift:1271-1314` (extensionInstallCard)

- [ ] **Step 1: Read extensionInstallCard exact contents**

```bash
sed -n '1271,1314p' macos-app/Loom/Sources/CapturesView.swift
```

Note: extension path is computed by `extensionResourcesPath` (lines 1165-1187). That helper must be copied to `CaptureSettingsView.swift` too.

- [ ] **Step 2: Copy `extensionResourcesPath` helper into `CaptureSettingsView`**

Add inside `struct CaptureSettingsView` (above `body`):

```swift
@State private var extensionPathCopied: Bool = false

private var extensionResourcesPath: String {
    let fm = FileManager.default
    if let pluginURL = Bundle.main.builtInPlugInsURL?
        .appendingPathComponent("LoomWebExtension.appex")
        .appendingPathComponent("Contents")
        .appendingPathComponent("Resources"),
       fm.fileExists(atPath: pluginURL.appendingPathComponent("manifest.json").path) {
        return pluginURL.path(percentEncoded: false)
    }
    let repoURL = fm.homeDirectoryForCurrentUser
        .appendingPathComponent("Desktop")
        .appendingPathComponent("LOOM")
        .appendingPathComponent("macos-app")
        .appendingPathComponent("Loom")
        .appendingPathComponent("LoomWebExtension")
        .appendingPathComponent("Resources")
    if fm.fileExists(atPath: repoURL.appendingPathComponent("manifest.json").path) {
        return repoURL.path(percentEncoded: false)
    }
    return "macos-app/Loom/LoomWebExtension/Resources"
}
```

- [ ] **Step 3: Replace the Browser Extension Section body**

In `CaptureSettingsView.body`, replace the `Section("Browser Extension") { Text("TODO: …") }` block with:

```swift
Section("Browser Extension") {
    LabeledContent("Resources path") {
        Text(extensionResourcesPath)
            .font(.system(size: 11, design: .monospaced))
            .textSelection(.enabled)
            .lineLimit(2)
            .truncationMode(.middle)
    }
    HStack {
        Button(extensionPathCopied ? "Copied!" : "Copy extension path") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(extensionResourcesPath, forType: .string)
            extensionPathCopied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                extensionPathCopied = false
            }
        }
        Spacer()
    }
    Text("Atlas / Chrome: open the extensions page, turn on Developer mode, choose Load unpacked, then select the path above. It is the folder that contains manifest.json. If the L button is missing on a page, the extension is not injected there — reload the extension, refresh the source page, then click L again. Do not choose the parent LoomWebExtension folder; that folder has no manifest.json.")
        .font(.system(size: 11, design: .serif))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
}
```

- [ ] **Step 4: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add macos-app/Loom/Sources/CaptureSettingsView.swift
git commit -m "feat(settings): migrate extensionInstallCard into Capture > Browser Extension

Moves the extension-resources path display + Copy button + install
instructions from WebCaptureSetupView.extensionInstallCard
(CapturesView.swift:1271-1314) into the new CaptureSettingsView's
'Browser Extension' Section verbatim. extensionResourcesPath helper
copied alongside.

Refs docs/loom.md §VII.bis migration plan Task 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Move `installCard` (bookmarklet) → `CaptureSettingsView` "Bookmarklet (fallback)" section

**Files:**
- Modify: `macos-app/Loom/Sources/CaptureSettingsView.swift` (Bookmarklet Section)
- Read-reference: `macos-app/Loom/Sources/CapturesView.swift:1315-1376` (installCard) + `:1130-1132` (bookmarkletJS)

- [ ] **Step 1: Read installCard + bookmarkletJS exact contents**

```bash
sed -n '1130,1132p;1315,1376p' macos-app/Loom/Sources/CapturesView.swift
```

- [ ] **Step 2: Copy `bookmarkletJS` static let into `CaptureSettingsView`**

Add at the top of `struct CaptureSettingsView`:

```swift
/// Bookmarklet v2 (2026-04-27). Single source of truth.
/// (Verbatim from former WebCaptureSetupView.bookmarkletJS — see
/// CapturesView.swift commit history for extraction strategy notes.)
static let bookmarkletJS: String = """
javascript:(function(){function g(n){return document.querySelector('meta[name="'+n+'"], meta[property="'+n+'"]')?.content||'';}function ex(){var s=window.getSelection().toString();if(s)return s;var sem=document.querySelector('article, main, [role="main"]');if(sem&&sem.innerText&&sem.innerText.length>500)return sem.innerText;var c=document.body.cloneNode(true);c.querySelectorAll('nav, header, footer, aside, script, style, noscript, iframe, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]').forEach(function(e){e.remove();});var sk=/(^|[\\s_-])(nav|menu|sidebar|breadcrumb|toolbar|cookie|consent|banner|advert|ads?|popup|modal|comments?|share|social|footer|header|widget|related|recommended|teaching[-_\\s]?contact)([\\s_-]|$)/i;c.querySelectorAll('[id],[class]').forEach(function(el){var id=(el.id||'').toLowerCase();var cls=(typeof el.className==='string'?el.className:'').toLowerCase();if(sk.test(id)||sk.test(cls))el.remove();});return c.innerText;}var p={url:location.href,title:document.title,selection:window.getSelection().toString(),description:g('og:description')||g('description'),siteName:g('og:site_name'),body:ex().slice(0,20000)};var u='loom://capture?payload='+encodeURIComponent(JSON.stringify(p));var a=document.createElement('a');a.href=u;document.body.appendChild(a);a.click();a.remove();})();
"""

@State private var bookmarkletCopied: Bool = false
```

- [ ] **Step 3: Replace the Bookmarklet Section body**

In `CaptureSettingsView.body`, replace the placeholder block with:

```swift
Section("Bookmarklet (fallback)") {
    Text("Use this only when the browser extension is unavailable. It captures title, URL, selection, and main text — but not rich media, styled SVG, or canvas. Drag the link below into your bookmarks bar.")
        .font(.system(size: 11, design: .serif))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
    HStack {
        Link(destination: URL(string: Self.bookmarkletJS)!) {
            Label("Capture to Loom", systemImage: "link")
        }
        .buttonStyle(.borderedProminent)
        Spacer()
        Button(bookmarkletCopied ? "Copied!" : "Copy bookmarklet JS") {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(Self.bookmarkletJS, forType: .string)
            bookmarkletCopied = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                bookmarkletCopied = false
            }
        }
    }
}
```

- [ ] **Step 4: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED. If `URL(string: Self.bookmarkletJS)!` fails (the long JS string may break URL parsing in some Swift versions), wrap in `URL(string: Self.bookmarkletJS) ?? URL(string: "about:blank")!`.

- [ ] **Step 5: Commit**

```bash
git add macos-app/Loom/Sources/CaptureSettingsView.swift
git commit -m "feat(settings): migrate installCard (bookmarklet) into Capture > Bookmarklet

Moves the drag-link bookmarklet + Copy JS button + fallback caveat copy
from WebCaptureSetupView.installCard (CapturesView.swift:1315-1376)
into CaptureSettingsView's 'Bookmarklet (fallback)' Section. The
bookmarkletJS static-let is the single source of truth and lives here
now (not in the dismantled view).

Refs docs/loom.md §VII.bis migration plan Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Move `storageCard` → `CaptureSettingsView` "Storage" section

**Files:**
- Modify: `macos-app/Loom/Sources/CaptureSettingsView.swift` (Storage Section)
- Read-reference: `macos-app/Loom/Sources/CapturesView.swift:1394-1455` (storageCard) + `:1145-1163, :1189-1238` (helpers)

- [ ] **Step 1: Read storageCard + its helpers exact contents**

```bash
sed -n '1145,1163p;1189,1240p;1394,1455p' macos-app/Loom/Sources/CapturesView.swift
```

Identify: `storeLocation`, `storeIsCustom`, `migrationStatus` state vars; `refreshStoreLocation()`, `revealStoreInFinder()`, `chooseAndMoveStore()` helpers.

- [ ] **Step 2: Copy state vars + helpers into `CaptureSettingsView`**

Add to `CaptureSettingsView`:

```swift
@State private var storeLocation: String = ""
@State private var storeIsCustom: Bool = false
@State private var migrationStatus: String? = nil

private func refreshStoreLocation() {
    let url = LoomFileStore.rootURL
    storeLocation = url.path(percentEncoded: false)
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
    let defaultPath = docs?.appendingPathComponent("Loom Data").path
    storeIsCustom = (defaultPath != url.path)
}

private func revealStoreInFinder() {
    let url = LoomFileStore.rootURL
    NSWorkspace.shared.activateFileViewerSelecting([url])
}

// (copy chooseAndMoveStore() verbatim from CapturesView.swift:1189-1238)
```

- [ ] **Step 3: Replace the Storage Section body**

In `CaptureSettingsView.body`:

```swift
Section("Storage") {
    LabeledContent(storeIsCustom ? "Custom location" : "Default · sandbox container") {
        Text(storeLocation)
            .font(.system(size: 11, design: .monospaced))
            .textSelection(.enabled)
            .lineLimit(2)
            .truncationMode(.middle)
    }
    HStack {
        Button("Reveal in Finder") { revealStoreInFinder() }
        Button("Move to…") { chooseAndMoveStore() }
        Spacer()
    }
    if let status = migrationStatus {
        Text(status)
            .font(.system(size: 11))
            .foregroundStyle(status.hasPrefix("Moved") ? .green : .red)
    }
    Text("Default lives in your Loom sandbox container — Finder doesn't browse there by default. Move to ~/Documents/Loom Data/ (or any folder you pick) to make captures inspectable, syncable to iCloud, and backed up by Time Machine.")
        .font(.system(size: 11, design: .serif))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
}
```

- [ ] **Step 4: Trigger refresh on appear**

Add to `CaptureSettingsView.body` (after the `Form { … }.formStyle(.grouped)…`):

```swift
.onAppear { refreshStoreLocation() }
```

- [ ] **Step 5: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add macos-app/Loom/Sources/CaptureSettingsView.swift
git commit -m "feat(settings): migrate storageCard into Capture > Storage

Moves the file-store path display + Reveal in Finder + Move to…
+ migration-status banner from WebCaptureSetupView.storageCard
(CapturesView.swift:1394-1455) into CaptureSettingsView's 'Storage'
Section. State vars (storeLocation / storeIsCustom / migrationStatus)
and helpers (refreshStoreLocation / revealStoreInFinder /
chooseAndMoveStore) copied verbatim.

Refs docs/loom.md §VII.bis migration plan Task 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Move `pipelineStatusCard` → `CaptureSettingsView` "Pipeline" section

**Files:**
- Modify: `macos-app/Loom/Sources/CaptureSettingsView.swift` (Pipeline Section)
- Read-reference: `macos-app/Loom/Sources/CapturesView.swift:1456-1539` (pipelineStatusCard) + `:1136-1155` (state + refreshDiagnostics)

- [ ] **Step 1: Read pipelineStatusCard + refreshDiagnostics + statusGridRow**

```bash
sed -n '1136,1155p;1456,1577p' macos-app/Loom/Sources/CapturesView.swift
```

- [ ] **Step 2: Copy state vars + refreshDiagnostics + statusGridRow into `CaptureSettingsView`**

```swift
@State private var stats: [LoomEmbeddingStore.RootStats] = []
@State private var enModelOK: Bool = false
@State private var zhModelOK: Bool = false
@State private var jaModelOK: Bool = false

private func refreshDiagnostics() {
    stats = LoomEmbeddingStore.diagnosticStats()
    enModelOK = LoomEmbeddingStore.modelAvailable(for: .english)
    zhModelOK = LoomEmbeddingStore.modelAvailable(for: .simplifiedChinese)
    jaModelOK = LoomEmbeddingStore.modelAvailable(for: .japanese)
    refreshStoreLocation()
}

@ViewBuilder
private func statusGridRow(ok: Bool, label: String, detail: String) -> some View {
    GridRow {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: ok ? "checkmark.circle.fill" : "xmark.octagon.fill")
                .foregroundStyle(ok ? Color.green : Color.red)
                .font(.system(size: 11))
            Text(label)
                .font(.system(size: 11, design: .serif))
        }
        Text(detail)
            .font(.system(size: 10, design: .monospaced))
            .foregroundStyle(.secondary)
            .gridColumnAlignment(.trailing)
    }
}
```

Note: original used `LoomTokens.sage / .rose / .ink / .ink2`. CaptureSettingsView uses the Form's default colors instead since Settings panes follow system chrome, not paper canvas.

- [ ] **Step 3: Replace the Pipeline Section body**

```swift
Section("Pipeline") {
    Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 4) {
        statusGridRow(ok: enModelOK, label: "Embedding model · English", detail: enModelOK ? "loaded" : "missing — English captures fall back to text-only")
        statusGridRow(ok: zhModelOK, label: "Embedding model · 中文", detail: zhModelOK ? "loaded" : "missing — Chinese captures fall back to text-only")
        statusGridRow(ok: jaModelOK, label: "Embedding model · 日本語", detail: jaModelOK ? "loaded" : "missing — Japanese captures fall back to text-only")
        statusGridRow(ok: true, label: "Active workspaces", detail: "\(stats.count)")
        statusGridRow(ok: true, label: "Captures indexed", detail: "\(stats.reduce(0) { $0 + $1.count }) total")
    }
    ForEach(stats, id: \.rootID) { s in
        HStack {
            Text("· \(s.label)")
                .font(.system(size: 11, design: .serif))
                .foregroundStyle(.secondary)
            Spacer()
            Text("\(s.count)  \(s.languageBreakdown)")
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(.tertiary)
        }
    }
    HStack {
        Spacer()
        Button("Refresh") { refreshDiagnostics() }
    }
    Text("If a capture should be indexed but isn't shown here, click Refresh after a few seconds (indexing is async). Embedding-model gaps mean similarity matching is degraded but Loom still saves the capture.")
        .font(.system(size: 11, design: .serif))
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)
}
```

- [ ] **Step 4: Wire `.onAppear { refreshDiagnostics() }`**

In `CaptureSettingsView.body`, replace the existing `.onAppear { refreshStoreLocation() }` (from Task 4) with:

```swift
.onAppear { refreshDiagnostics() }
```

(refreshDiagnostics calls refreshStoreLocation internally.)

- [ ] **Step 5: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED. If `LoomEmbeddingStore.RootStats` access is `private`, expose it via a typealias or move the import. Verify with `grep -n "public\|internal\|private.*struct RootStats" macos-app/Loom/Sources/LoomEmbeddingStore.swift`.

- [ ] **Step 6: Commit**

```bash
git add macos-app/Loom/Sources/CaptureSettingsView.swift
git commit -m "feat(settings): migrate pipelineStatusCard into Capture > Pipeline

Moves embedding-model availability grid + indexed counts + per-workspace
breakdown + Refresh button from WebCaptureSetupView.pipelineStatusCard
(CapturesView.swift:1456-1539) into CaptureSettingsView's 'Pipeline'
Section. statusGridRow helper + state vars (stats / enModelOK / zhModelOK
/ jaModelOK) + refreshDiagnostics() copied verbatim. Color tokens
(sage/rose/ink) substituted with system green/red/.secondary so the
pane fits Settings system chrome instead of paper canvas.

Refs docs/loom.md §VII.bis migration plan Task 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Create `CaptureHelpView.swift` + register as Window scene

**Files:**
- Create: `macos-app/Loom/Sources/CaptureHelpView.swift`
- Modify: `macos-app/Loom/Sources/LoomApp.swift` (~after line 65, add Window scene)

- [ ] **Step 1: Read existing Help-window reference**

```bash
cat macos-app/Loom/Sources/KeyboardHelpView.swift
```

Note the chrome pattern: `.paperChrome()` modifier, fixed `defaultSize`, simple body with VStack of sections.

- [ ] **Step 2: Create `CaptureHelpView.swift` skeleton**

```swift
import SwiftUI

/// Help window content for setting up Loom Web Capture. Read-only
/// narrative — extension install flow + 4-step capture flow + tips.
/// Opened via menu bar Help > Set up captures… (⌘?).
///
/// Replaces the dismantled WebCaptureSetupView surface per docs/loom.md
/// §VII.bis: instructional content does not appear in default surfaces;
/// it lives in Help.
struct CaptureHelpView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                header
                captureFlowSection
                tipsSection
            }
            .padding(.horizontal, 32)
            .padding(.vertical, 28)
            .frame(maxWidth: 560, alignment: .topLeading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Set up captures")
                .font(.custom("Cormorant Garamond", size: 28).weight(.medium))
            Text("How to wire Loom Web Capture and what each capture path does. For interactive setup (extension path, bookmarklet, storage, pipeline status) open Settings > Capture.")
                .font(.system(size: 13, design: .serif))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var captureFlowSection: some View {
        Text("TODO: 4-step flow — filled in Task 8")
    }

    private var tipsSection: some View {
        Text("TODO: tips — filled in Task 9")
    }
}

#Preview {
    CaptureHelpView()
}
```

- [ ] **Step 3: Add `CaptureHelpWindow` enum + Window scene in `LoomApp.swift`**

In `macos-app/Loom/Sources/LoomApp.swift`, near other window-id enums (search `enum KeyboardHelpWindow` or `enum AboutWindow`), add:

```swift
enum CaptureHelpWindow {
    static let id = "loom.capture-help"
}
```

Then after the existing `Window("Keyboard Shortcuts", id: KeyboardHelpWindow.id) { ... }` block (~line 62-67), add:

```swift
Window("Set up captures", id: CaptureHelpWindow.id) {
    CaptureHelpView()
        .paperChrome()
}
.windowResizability(.contentSize)
.defaultSize(width: 560, height: 540)
```

- [ ] **Step 4: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Commit**

```bash
git add macos-app/Loom/Sources/CaptureHelpView.swift macos-app/Loom/Sources/LoomApp.swift
git commit -m "feat(help): add CaptureHelpView window + scene registration

Skeleton view with header + two TODO sections (filled in Tasks 8–9).
Registered as Window scene via CaptureHelpWindow.id = 'loom.capture-help'
with .paperChrome and 560×540 default size, matching the existing
KeyboardHelpView shape.

Menu-bar item wiring to follow in Task 7.

Refs docs/loom.md §VII.bis migration plan Task 6.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Add `Help > Set up captures…` menu item with ⌘? shortcut

**Files:**
- Modify: `macos-app/Loom/Sources/LoomApp.swift` (~line 132 in `.commands { }`)

- [ ] **Step 1: Inspect existing `.commands {}` block structure**

```bash
sed -n '130,200p' macos-app/Loom/Sources/LoomApp.swift
```

Note where `CommandGroup(replacing: .help)` or `CommandMenu("Help")` lives. If neither, add `CommandGroup(after: .help)`.

- [ ] **Step 2: Add the menu item**

In `macos-app/Loom/Sources/LoomApp.swift`, inside the existing `.commands { }` block (~line 132), append:

```swift
CommandGroup(after: .help) {
    Button("Set up captures…") {
        openWindow(id: CaptureHelpWindow.id)
    }
    .keyboardShortcut("?", modifiers: [.command])
}
```

Ensure `@Environment(\.openWindow) private var openWindow` is declared on the `LoomApp` struct (or whatever struct owns the Scene); look for an existing `@Environment(\.openWindow)` and add one if absent at the top of the scene-owning struct.

- [ ] **Step 3: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED. If `Cannot use instance member 'openWindow' within property initializer`, restructure as a separate Button view (see existing examples like `OpenAboutButton` at ~line 506-513).

- [ ] **Step 4: Manual verify in app**

```bash
npm run app
```

Then in the running Loom app:
1. Click Help menu → "Set up captures…" item should be visible
2. ⌘? should open the CaptureHelpView window
3. The window should show the placeholder TODO text (filled in Tasks 8–9)

- [ ] **Step 5: Commit**

```bash
git add macos-app/Loom/Sources/LoomApp.swift
git commit -m "feat(menu): add Help > Set up captures… (⌘?) menu item

CommandGroup(after: .help) opens CaptureHelpWindow. Keyboard shortcut
⌘? matches macOS convention (Help menus traditionally use ⌘?).
Replaces the sidebar 'Web Capture' entry as the discoverability path
for capture setup, per docs/loom.md §VII.bis Subtraction rule.

Refs docs/loom.md §VII.bis migration plan Task 7.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Move `captureFlowCard` contents → `CaptureHelpView.captureFlowSection`

**Files:**
- Modify: `macos-app/Loom/Sources/CaptureHelpView.swift` (captureFlowSection)
- Read-reference: `macos-app/Loom/Sources/CapturesView.swift:1377-1393` (captureFlowCard)

- [ ] **Step 1: Read captureFlowCard exact contents**

```bash
sed -n '1377,1393p' macos-app/Loom/Sources/CapturesView.swift
```

- [ ] **Step 2: Replace `captureFlowSection` body**

In `macos-app/Loom/Sources/CaptureHelpView.swift`:

```swift
private var captureFlowSection: some View {
    VStack(alignment: .leading, spacing: 12) {
        Text("Use it")
            .font(.custom("EB Garamond", size: 11).weight(.medium).smallCaps())
            .tracking(0.16 * 11)
            .foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 8) {
            flowStep(index: "①", text: "Open any web page and confirm the L capture button is visible.")
            flowStep(index: "②", text: "Click L for full capture; Shift+L for reader-only; Cmd+L for script-preserved snapshot.")
            flowStep(index: "③", text: "Loom comes to the foreground; the capture sheet pre-fills with title, URL, and content.")
            flowStep(index: "④", text: "Pick anchor (Web · domain, or Inbox), edit if needed, Save.")
        }
    }
}

@ViewBuilder
private func flowStep(index: String, text: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
        Text(index)
            .font(.system(size: 13, design: .serif))
            .foregroundStyle(.secondary)
            .frame(width: 18, alignment: .leading)
        Text(text)
            .font(.system(size: 13, design: .serif))
            .fixedSize(horizontal: false, vertical: true)
    }
}
```

- [ ] **Step 3: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Commit**

```bash
git add macos-app/Loom/Sources/CaptureHelpView.swift
git commit -m "feat(help): migrate captureFlowCard into CaptureHelpView flow section

Moves the 4-step ①②③④ enumeration from WebCaptureSetupView.captureFlowCard
(CapturesView.swift:1377-1393) into CaptureHelpView. flowStep() helper
keeps the index-circle + serif body shape; tracking and smallcaps mimic
the original eyebrow.

Refs docs/loom.md §VII.bis migration plan Task 8.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Move `tipsCard` contents → `CaptureHelpView.tipsSection`

**Files:**
- Modify: `macos-app/Loom/Sources/CaptureHelpView.swift` (tipsSection)
- Read-reference: `macos-app/Loom/Sources/CapturesView.swift:1540-1559` (tipsCard)

- [ ] **Step 1: Read tipsCard exact contents**

```bash
sed -n '1540,1559p' macos-app/Loom/Sources/CapturesView.swift
```

- [ ] **Step 2: Replace `tipsSection` body**

In `macos-app/Loom/Sources/CaptureHelpView.swift`:

```swift
private var tipsSection: some View {
    VStack(alignment: .leading, spacing: 12) {
        Text("Tips")
            .font(.custom("EB Garamond", size: 11).weight(.medium).smallCaps())
            .tracking(0.16 * 11)
            .foregroundStyle(.secondary)
        VStack(alignment: .leading, spacing: 8) {
            tip("Missing L means the extension is not running on that tab. Reload the extension and then refresh the source page; already-open tabs do not always receive a newly loaded content script.")
            tip("Select first for the cleanest result. Selection still wins over auto-extraction when you only need a passage.")
            tip("The bookmarklet is a fallback, not the rich-media path. Use the extension for SVG, canvas, iframe, video, and image-sidecar capture.")
            tip("Web captures default to the Web/<domain>/Loom.md folder so domains pre-cluster naturally for similarity search.")
            tip("Rich extension captures are not capped to the bookmarklet's 20K-character text fallback.")
        }
    }
}

@ViewBuilder
private func tip(_ text: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text("·")
            .foregroundStyle(.secondary)
        Text(text)
            .font(.system(size: 12, design: .serif))
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }
}
```

Note: collapsed the original DisclosureGroup pattern into always-visible bullets — in a Help window the user opened explicitly, the tips do not need re-collapse to save space; they ARE the content.

- [ ] **Step 3: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 4: Manual verify**

```bash
npm run app
```

Open Help > Set up captures… (or ⌘?). The window should show:
1. Header: "Set up captures" + subtitle
2. Use it (4 numbered steps)
3. Tips (5 bullet points)

All content visible without scrolling on default size.

- [ ] **Step 5: Commit**

```bash
git add macos-app/Loom/Sources/CaptureHelpView.swift
git commit -m "feat(help): migrate tipsCard into CaptureHelpView tips section

Moves the 5 bullet tips from WebCaptureSetupView.tipsCard
(CapturesView.swift:1540-1559) into CaptureHelpView. Collapsed
DisclosureGroup pattern — in a help window opened explicitly, the
tips don't need re-collapse to save chrome space, they ARE the content.

Refs docs/loom.md §VII.bis migration plan Task 9.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Delete `WebCaptureSetupView` struct + helpers from `CapturesView.swift`

**Files:**
- Modify: `macos-app/Loom/Sources/CapturesView.swift` (delete lines 1105–1607)

- [ ] **Step 1: Confirm all unique content is migrated**

```bash
diff <(sed -n '1105,1607p' macos-app/Loom/Sources/CapturesView.swift) \
     <(cat macos-app/Loom/Sources/CaptureSettingsView.swift macos-app/Loom/Sources/CaptureHelpView.swift) \
  2>&1 | head -40
```

Skim. All distinctive lines (bookmarkletJS, extensionResourcesPath, refreshDiagnostics, the 4-step copy, the 5 tip strings) should appear in one of the two destination files. If anything is missing, fix in the appropriate prior task before deletion.

- [ ] **Step 2: Delete the WebCaptureSetupView block**

```bash
awk 'NR<1105 || NR>1607' macos-app/Loom/Sources/CapturesView.swift > /tmp/CapturesView.swift.new && mv /tmp/CapturesView.swift.new macos-app/Loom/Sources/CapturesView.swift
```

Verify:

```bash
grep -n "WebCaptureSetupView\|extensionInstallCard\|installCard\|captureFlowCard\|storageCard\|pipelineStatusCard\|tipsCard" macos-app/Loom/Sources/CapturesView.swift
```

Expected: zero matches.

- [ ] **Step 3: Search for callers**

```bash
grep -rn "WebCaptureSetupView" macos-app/Loom/Sources/
```

Expected: only `LoomMinimalRootView.swift` (handled in Task 11). If anything else, surface it.

- [ ] **Step 4: Build to verify (will FAIL due to LoomMinimalRootView still referencing the removed struct — that's expected)**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD FAILED with `Cannot find 'WebCaptureSetupView' in scope` somewhere in LoomMinimalRootView.swift. Confirms Task 11 is the closing task.

- [ ] **Step 5: Commit (with build-fail acknowledgement)**

```bash
git add macos-app/Loom/Sources/CapturesView.swift
git commit -m "refactor(captures): delete WebCaptureSetupView struct (content migrated)

Removes WebCaptureSetupView + its 6 card view-builders + bookmarkletJS
+ extensionResourcesPath + refreshDiagnostics + storage/pipeline state
from CapturesView.swift (lines 1105-1607). All content lives in the new
CaptureSettingsView (Settings > Capture) and CaptureHelpView (Help >
Set up captures…).

Build temporarily fails at this commit because LoomMinimalRootView.swift
still references the removed struct — Task 11 closes the loop. Per
plan-author choice to keep each task as a clean atomic commit, the
build-fail window is one commit wide.

Refs docs/loom.md §VII.bis migration plan Task 10.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Remove `webCaptureSetupRow` + `.webCaptureSetup` from sidebar navigation

**Files:**
- Modify: `macos-app/Loom/Sources/LoomMinimalRootView.swift` (several locations)

- [ ] **Step 1: Inventory references**

```bash
grep -n "webCaptureSetup\|webCaptureSetupRow\|\"Web Capture\"\|WebCaptureSetupView" macos-app/Loom/Sources/LoomMinimalRootView.swift
```

Expected references (line numbers approximate, may have drifted):
- `case webCaptureSetup` in DetailSurface enum (~line 20)
- `private var webCaptureSetupRow: some View { … }` (~lines 709-718)
- `webCaptureSetupRow` call site inside the sidebar's LazyVStack (~lines 605-620 area)
- `case .webCaptureSetup: WebCaptureSetupView()` in `detail` switch (~lines 920-922)
- `"__webcapture"` rowID in `orderedNavigableRowIDs` and `currentNavigableRowID` and `activateSidebarRow` (~lines 402-460)

- [ ] **Step 2: Remove the enum case**

In `DetailSurface` enum (~line 15-21), remove the `case webCaptureSetup` line. The enum should end with `captures` as the last case.

- [ ] **Step 3: Remove the row var + call site**

Delete the entire `private var webCaptureSetupRow: some View { … }` block. Also remove the `webCaptureSetupRow` call in the sidebar body (search for the bare `webCaptureSetupRow` invocation; it sits between `capturesRow` and `foldersHeader()`).

- [ ] **Step 4: Remove the detail case**

In the `detail` switch (~line 909-924), remove:

```swift
case .webCaptureSetup:
    WebCaptureSetupView()
```

- [ ] **Step 5: Remove `__webcapture` from keyboard nav helpers**

In `orderedNavigableRowIDs`:

```swift
var ids: [String] = ["__pages", "__captures", "__webcapture"]
```

Becomes:

```swift
var ids: [String] = ["__pages", "__captures"]
```

In `currentNavigableRowID()`:

```swift
case .webCaptureSetup: return "__webcapture"
```

— delete that case (enum is gone, so Swift will require the switch be exhaustive without it).

In `activateSidebarRow(byID:)`:

```swift
case "__webcapture":
    navigate(.webCaptureSetup)
```

— delete that case.

- [ ] **Step 6: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -20
```

Expected: BUILD SUCCEEDED. If any `case .webCaptureSetup` still lingers, the exhaustive-switch checker will flag it.

- [ ] **Step 7: Smoke test the installed app**

```bash
npm run app && npm run app:smoke
```

Expected: smoke passes. Sidebar shows only Sources / Captures (no Web Capture). Settings has 4 tabs (Appearance / AI / Data / Capture). Help menu shows "Set up captures… ⌘?".

- [ ] **Step 8: Commit**

```bash
git add macos-app/Loom/Sources/LoomMinimalRootView.swift
git commit -m "refactor(sidebar): remove Web Capture sidebar entry + .webCaptureSetup surface

Closes the §VII.bis WebCaptureSetupView dismantling started in Task 10:

- DetailSurface enum: case .webCaptureSetup deleted
- webCaptureSetupRow private var + its call site deleted
- detail switch case for .webCaptureSetup deleted
- orderedNavigableRowIDs: '__webcapture' dropped
- currentNavigableRowID: .webCaptureSetup → '__webcapture' case dropped
- activateSidebarRow: '__webcapture' case dropped

Build now succeeds. Sidebar shows Sources + Captures only. Capture
setup content reachable via Settings > Capture or Help > Set up
captures… (⌘?).

Refs docs/loom.md §VII.bis migration plan Task 11.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Contract test — assert Web Capture sidebar entry is gone

**Files:**
- Create: `tests/sidebar-no-webcapture-row.test.ts`
- Modify: `package.json` (add to `test:contracts` glob)

- [ ] **Step 1: Read existing contract-test reference**

```bash
cat tests/native-sidebar-source-row-fallback.test.ts
```

Note: contract tests grep source files for invariant patterns and assert.

- [ ] **Step 2: Create the contract test**

`tests/sidebar-no-webcapture-row.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SOURCE = resolve('macos-app/Loom/Sources/LoomMinimalRootView.swift');

test('LoomMinimalRootView.swift no longer references the Web Capture sidebar surface', () => {
  const text = readFileSync(SOURCE, 'utf-8');
  const forbidden = [
    'webCaptureSetupRow',
    '.webCaptureSetup',
    'case webCaptureSetup',
    'WebCaptureSetupView',
    '"Web Capture"',
    "'__webcapture'",
    '"__webcapture"',
  ];
  for (const needle of forbidden) {
    assert.equal(
      text.includes(needle),
      false,
      `Found forbidden token "${needle}" in LoomMinimalRootView.swift — ` +
        `per docs/loom.md §VII.bis the Web Capture sidebar surface is dismantled; ` +
        `capture setup content lives in Settings > Capture and Help > Set up captures…`
    );
  }
});

test('CapturesView.swift no longer defines WebCaptureSetupView', () => {
  const text = readFileSync(resolve('macos-app/Loom/Sources/CapturesView.swift'), 'utf-8');
  assert.equal(
    text.includes('struct WebCaptureSetupView'),
    false,
    'WebCaptureSetupView struct must be deleted from CapturesView.swift per §VII.bis migration'
  );
});

test('CaptureSettingsView and CaptureHelpView exist', () => {
  const settings = readFileSync(resolve('macos-app/Loom/Sources/CaptureSettingsView.swift'), 'utf-8');
  const help = readFileSync(resolve('macos-app/Loom/Sources/CaptureHelpView.swift'), 'utf-8');
  assert.ok(settings.includes('struct CaptureSettingsView'));
  assert.ok(help.includes('struct CaptureHelpView'));
});
```

- [ ] **Step 3: Run the test standalone**

```bash
tsx --test tests/sidebar-no-webcapture-row.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 4: Add to `test:contracts` script**

In `package.json`, locate the `"test:contracts"` line and append `tests/sidebar-no-webcapture-row.test.ts` to the space-separated list.

- [ ] **Step 5: Run the full contract suite**

```bash
npm run test:contracts
```

Expected: all tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add tests/sidebar-no-webcapture-row.test.ts package.json
git commit -m "test(contracts): pin Web Capture sidebar dismantling per §VII.bis

Three assertions:
  1. LoomMinimalRootView.swift contains no webCaptureSetup* / Web Capture
     row tokens
  2. CapturesView.swift no longer defines struct WebCaptureSetupView
  3. CaptureSettingsView + CaptureHelpView files exist

Wired into the test:contracts npm script so CI verifies the dismantling
invariant going forward.

Refs docs/loom.md §VII.bis migration plan Task 12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: LoomLibraryView minor compliance — drop count, add empty-state primary action

**Files:**
- Modify: `macos-app/Loom/Sources/LoomLibraryView.swift`

- [ ] **Step 1: Drop the "N page(s)" subtitle from header**

In `macos-app/Loom/Sources/LoomLibraryView.swift`, replace `header` (~lines 40-48):

```swift
private var header: some View {
    Text("Your pages")
        .font(.system(size: 26, weight: .medium, design: .serif))
        .italic()
}
```

(Remove the "N page(s)" subtitle entirely — it was a count badge in chrome, banned by §VII.bis.2.)

- [ ] **Step 2: Replace `emptyState` with foreground prompt + primary action**

Replace `emptyState` (~lines 52-62):

```swift
@ViewBuilder
private var emptyState: some View {
    VStack(alignment: .leading, spacing: 16) {
        Text("No pages yet.")
            .font(.system(size: 16, design: .serif))
            .foregroundStyle(.secondary)
        Button {
            NotificationCenter.default.post(name: .loomBeginNewPage, object: nil)
        } label: {
            Label("New page", systemImage: "plus")
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
    }
    .padding(.vertical, 32)
}
```

Per §VII.bis.3 empty-corpus cold-start: 1-line prompt + 1 primary action.

- [ ] **Step 3: Define `.loomBeginNewPage` notification if it does not already exist**

```bash
grep -rn "loomBeginNewPage" macos-app/Loom/Sources/
```

If no matches, add to the `extension Notification.Name { … }` block at the bottom of `LoomLibraryView.swift`:

```swift
extension Notification.Name {
    static let loomShowLibrary = Notification.Name("loomShowLibrary")
    static let loomBeginNewPage = Notification.Name("loomBeginNewPage")
}
```

Then wire the receiver in `LoomMinimalRootView.swift` near the existing `.loomContentRootsChanged` receiver (~line 35-38):

```swift
.onReceive(NotificationCenter.default.publisher(for: .loomBeginNewPage)) { _ in
    startNewPage()  // existing helper around line ~982
}
```

- [ ] **Step 4: Build to verify**

```bash
xcodebuild -workspace macos-app/Loom/Loom.xcworkspace -scheme Loom -configuration Debug build 2>&1 | tail -10
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 5: Manual verify**

```bash
npm run app
```

In the running app, open Sources surface:
- If you have pages: header is just "Your pages" (no "N pages" subtitle)
- If empty (try in a fresh container — or temporarily delete all roots via right-click): header + "No pages yet." + "New page" prominent button

- [ ] **Step 6: Commit**

```bash
git add macos-app/Loom/Sources/LoomLibraryView.swift macos-app/Loom/Sources/LoomMinimalRootView.swift
git commit -m "fix(library): drop 'N pages' count + give empty state a primary action

Two §VII.bis.2/§VII.bis.3 compliance fixes for LoomLibraryView:

  1. Drop 'N page(s)' header subtitle. Count badge in nav chrome
     violates §VII.bis.2; if user needs to count pages, they can
     count the visible list.
  2. Empty state was a pure-text prompt with no action. §VII.bis.3
     empty-corpus cold-start spec: 1-line prompt + 1 primary action.
     Added prominent 'New page' button posting .loomBeginNewPage so
     the sidebar's existing startNewPage() helper handles creation.

Refs docs/loom.md §VII.bis migration plan Task 13.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Final smoke + screenshot validation

**Files:** (no source changes — validation only)

- [ ] **Step 1: Run the full verify chain**

```bash
npm run verify
```

Expected: typecheck + build + smoke all pass.

- [ ] **Step 2: Rebuild and install Loom.app**

```bash
npm run app
```

- [ ] **Step 3: Launch + visual check**

Launch Loom.app from `~/Applications/Loom.app`. Verify:

- [ ] **Sidebar:** Workspaces section shows only Sources + Captures (no Web Capture row)
- [ ] **Settings (⌘,):** TabView has 4 tabs: Appearance / AI / Data / Capture. Capture pane shows Browser Extension / Bookmarklet / Storage / Pipeline sections with the content migrated in Tasks 2–5
- [ ] **Help menu:** "Set up captures…" item visible; ⌘? opens the CaptureHelpView window showing header + flow + tips
- [ ] **Sources surface:** header is "Your pages" alone; empty state (try in fresh container) shows "No pages yet." + "New page" button
- [ ] **No regressions:** Captures surface (CapturesView) still works for browsing captured items
- [ ] **Keyboard navigation:** ↑/↓ in sidebar moves through Sources ↔ Captures ↔ folder rows (no longer goes through Web Capture)

- [ ] **Step 4: Run the contract suite one final time**

```bash
npm run test:contracts
```

Expected: all pass.

- [ ] **Step 5: Commit the plan completion marker**

```bash
git commit --allow-empty -m "chore(plan): Plate VII-bis migration complete — Tasks 0-14 done

WebCaptureSetupView dismantled. Capture setup content lives in:
  Settings > Capture pane (4 sections: Browser Extension /
                          Bookmarklet / Storage / Pipeline)
  Help > Set up captures… ⌘? window (header / flow / tips)

LoomLibraryView minor compliance fixes applied.

§VII.bis.4 spec patched to reflect ground truth (no Draft surface yet,
LoomLibraryView mostly compliant before this fix, WebCaptureSetupView
fully dismantled).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Plan Self-Review Summary

**Spec coverage:** §VII.bis.1 (single foreground) addressed in Task 13 for LoomLibraryView; for WebCaptureSetupView, the surface is dismantled rather than redesigned (foreground was impossible to find). §VII.bis.2 (subtraction) implemented via Tasks 1–9 (content → Settings + Help). §VII.bis.3 (cold-start) addressed in Task 13 empty state. §VII.bis.4 (per-surface migration) is the work itself, and patched in Task 0. §VII.bis.5 (PR review rule) is process-only — no implementation needed. §VII.bis.6 (relation to Plate VII) is documentation — no implementation needed.

**Placeholder scan:** No TBD / TODO / placeholder code in the plan. The two TODO markers in Tasks 1 and 6 are intentional skeleton scaffolds replaced in subsequent tasks (Tasks 2–5 fill CaptureSettingsView; Tasks 8–9 fill CaptureHelpView).

**Type consistency:** `extensionResourcesPath`, `bookmarkletJS`, `refreshDiagnostics`, `statusGridRow`, `storeLocation`, `chooseAndMoveStore` retain identical signatures across origin (CapturesView) and destination (CaptureSettingsView). `CaptureHelpWindow.id = "loom.capture-help"` is unique. `.loomBeginNewPage` notification name is new and used in exactly two places (post in LoomLibraryView, receive in LoomMinimalRootView).

**Scope check:** This plan covers ONLY the WebCaptureSetupView migration + LoomLibraryView minor polish + spec amendment. Future Plate IV surfaces (the other 16) and the eventual Draft surface are out of scope per §VII.bis.4 (codebase-grounded version after Task 0).
