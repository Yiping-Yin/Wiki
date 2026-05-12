import SwiftUI

/// Settings pane for capture infrastructure: browser extension setup,
/// bookmarklet fallback, storage location, and embedding-pipeline
/// status. Replaces the dismantled WebCaptureSetupView surface per
/// docs/loom.md §VII.bis.
///
/// Sections filled task-by-task per plans/plate-vii-bis-migration.md:
///   - Browser Extension (Task 2)
///   - Bookmarklet (Task 3)
///   - Storage (Task 4)
///   - Pipeline (Task 5)
struct CaptureSettingsView: View {
    /// Bookmarklet v2 (2026-04-27). Single source of truth.
    /// (Verbatim from former WebCaptureSetupView.bookmarkletJS — see
    /// CapturesView.swift commit history for extraction-strategy notes.)
    static let bookmarkletJS: String = """
    javascript:(function(){function g(n){return document.querySelector('meta[name="'+n+'"], meta[property="'+n+'"]')?.content||'';}function ex(){var s=window.getSelection().toString();if(s)return s;var sem=document.querySelector('article, main, [role="main"]');if(sem&&sem.innerText&&sem.innerText.length>500)return sem.innerText;var c=document.body.cloneNode(true);c.querySelectorAll('nav, header, footer, aside, script, style, noscript, iframe, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]').forEach(function(e){e.remove();});var sk=/(^|[\\s_-])(nav|menu|sidebar|breadcrumb|toolbar|cookie|consent|banner|advert|ads?|popup|modal|comments?|share|social|footer|header|widget|related|recommended|teaching[-_\\s]?contact)([\\s_-]|$)/i;c.querySelectorAll('[id],[class]').forEach(function(el){var id=(el.id||'').toLowerCase();var cls=(typeof el.className==='string'?el.className:'').toLowerCase();if(sk.test(id)||sk.test(cls))el.remove();});return c.innerText;}var p={url:location.href,title:document.title,selection:window.getSelection().toString(),description:g('og:description')||g('description'),siteName:g('og:site_name'),body:ex().slice(0,20000)};var u='loom://capture?payload='+encodeURIComponent(JSON.stringify(p));var a=document.createElement('a');a.href=u;document.body.appendChild(a);a.click();a.remove();})();
    """

    @State private var extensionPathCopied: Bool = false
    @State private var bookmarkletCopied: Bool = false

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

    var body: some View {
        Form {
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
            Section("Bookmarklet (fallback)") {
                Text("Use this only when the browser extension is unavailable. It captures title, URL, selection, and main text — but not rich media, styled SVG, or canvas resources. Drag the pill into your bookmarks bar.")
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                BookmarkletDragPill(bookmarkletJS: Self.bookmarkletJS)
                    .frame(height: 56)
                    .frame(maxWidth: .infinity)
                HStack {
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
            Section("Storage") {
                Text("TODO: path + Reveal + Move to — filled in Task 4")
                    .foregroundStyle(.secondary)
            }
            Section("Pipeline") {
                Text("TODO: model status + indexed counts + Refresh — filled in Task 5")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 480, minHeight: 440)
    }
}

#Preview {
    CaptureSettingsView()
}
