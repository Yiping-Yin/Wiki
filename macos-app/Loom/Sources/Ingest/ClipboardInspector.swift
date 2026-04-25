import Foundation
import AppKit

// MARK: - ClipboardInspector
//
// Phase 7.4 — captures clipboard text plus best-effort source provenance
// at paste time. Used exclusively by `IngestionView.pasteClipboardText`;
// the result feeds the destination picker so the user can see WHERE the
// fragment came from before deciding where it lands.
//
// Sandbox notes (LOAD-BEARING):
//
//   - `NSPasteboard.general.string(forType:)` works under the macOS App
//     Sandbox without entitlement gymnastics — pasteboard access is
//     always allowed.
//
//   - `NSPasteboard.general.string(forType: .URL)` and `.fileURL` are
//     the documented hooks for pasteboard URLs. Browsers + Mail / Notes
//     populate these alongside the plain string when the user copies a
//     hyperlink. Apps that copy plain prose (Substack reader webpages
//     served as text) often DO NOT — `sourceURL` is best-effort, not
//     guaranteed.
//
//   - `NSWorkspace.shared.frontmostApplication?.bundleIdentifier` works
//     under the sandbox without extra entitlements. It returns whatever
//     app owns the menu bar at the moment of the call, which is usually
//     the app the user copied from (modulo a window-switch race).
//
//   - **Window title detection is the gnarly one.** `CGWindowListCopyWindowInfo`
//     under macOS 14+ requires the screen-recording permission to read
//     the `kCGWindowName` field — without it, you get a window list with
//     ALL TITLES NIL. Loom deliberately does NOT request screen-recording
//     just to populate a "from page X" subtitle. So `sourceTitle` stays
//     `nil` in practice. We return the field anyway because the schema
//     persists it as optional, and a future version (or a power user who
//     grants permission for other reasons) might surface it.

@MainActor
public enum ClipboardInspector {

    /// One paste's worth of clipboard data, plus best-effort source
    /// provenance. All fields except `text` are nil-tolerant. Callers
    /// must check `text.isEmpty` before invoking the picker — we do
    /// trim leading/trailing whitespace inside `captureNow` so a
    /// pasteboard with only `\n\n` becomes `nil`.
    public struct Capture: Equatable {
        public let text: String
        public let sourceURL: String?
        public let sourceApp: String?
        public let sourceTitle: String?

        public init(
            text: String,
            sourceURL: String?,
            sourceApp: String?,
            sourceTitle: String?
        ) {
            self.text = text
            self.sourceURL = sourceURL
            self.sourceApp = sourceApp
            self.sourceTitle = sourceTitle
        }
    }

    /// Probe `NSPasteboard.general` and the frontmost application for a
    /// fragment-paste capture. Returns `nil` when the pasteboard has no
    /// non-whitespace text — callers should beep and bail rather than
    /// open an empty destination picker.
    public static func captureNow() -> Capture? {
        let pasteboard = NSPasteboard.general

        // 1. Plain text. The only required field.
        guard let raw = pasteboard.string(forType: .string) else {
            return nil
        }
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        // 2. URL. Browsers populate this alongside the string; many
        //    apps do not. We probe `.URL` first, then `.fileURL` for
        //    the rare case where the user copied from Finder.
        let sourceURL = readURLString(from: pasteboard)

        // 3. Frontmost application bundle id. Sandbox-safe; does not
        //    require any entitlement. Captured at the moment of paste.
        let sourceApp = NSWorkspace.shared.frontmostApplication?.bundleIdentifier

        // 4. Window title. Best-effort; the sandbox blocks this without
        //    screen-recording permission. We try the cheapest probe and
        //    accept nil.
        let sourceTitle = readFrontmostWindowTitle()

        return Capture(
            text: trimmed,
            sourceURL: sourceURL,
            sourceApp: sourceApp,
            sourceTitle: sourceTitle
        )
    }

    // MARK: - URL probe

    /// Read a URL off the general pasteboard. Probes `.URL` first
    /// (matches browser hyperlink copies), then `.fileURL` for the
    /// occasional Finder source. Returns `nil` when neither is
    /// populated — many "copy text" sites don't carry a URL on the
    /// pasteboard at all. We do not synthesise one from `sourceApp`.
    private static func readURLString(from pasteboard: NSPasteboard) -> String? {
        if let urlString = pasteboard.string(forType: .URL),
           !urlString.isEmpty {
            return urlString
        }
        if let fileURLString = pasteboard.string(forType: .fileURL),
           !fileURLString.isEmpty {
            return fileURLString
        }
        // Last resort: an `NSURL` can sometimes be re-read from the
        // pasteboard's `propertyList` even when the string variants are
        // empty (rare; some legacy Cocoa apps).
        if let url = NSURL(from: pasteboard) as URL? {
            return url.absoluteString
        }
        return nil
    }

    // MARK: - Frontmost window title (best-effort)

    /// Attempt to read the frontmost window title via
    /// `CGWindowListCopyWindowInfo`. Under the sandbox without the
    /// screen-recording permission this returns `nil` for every window's
    /// `kCGWindowName` — we accept that and return `nil`. We deliberately
    /// do NOT prompt the user for screen-recording: window titles are a
    /// nice-to-have for the picker subtitle, not a load-bearing field,
    /// and TCC prompts violate the "no surprise dialogs" Loom posture.
    ///
    /// If a future build legitimately holds the permission for another
    /// feature, this implementation will start returning real titles
    /// without further changes.
    private static func readFrontmostWindowTitle() -> String? {
        guard let frontmost = NSWorkspace.shared.frontmostApplication else {
            return nil
        }
        let pid = frontmost.processIdentifier

        // `optionOnScreenOnly | excludeDesktopElements` keeps the list
        // small. Filter to windows owned by the frontmost PID, layer 0
        // (normal app windows), pick the first non-empty title.
        let listOptions: CGWindowListOption = [
            .optionOnScreenOnly,
            .excludeDesktopElements,
        ]
        guard let raw = CGWindowListCopyWindowInfo(listOptions, kCGNullWindowID) as? [[String: Any]] else {
            return nil
        }
        for entry in raw {
            guard let ownerPid = entry[kCGWindowOwnerPID as String] as? Int32,
                  ownerPid == pid else { continue }
            if let layer = entry[kCGWindowLayer as String] as? Int, layer != 0 {
                continue
            }
            if let name = entry[kCGWindowName as String] as? String, !name.isEmpty {
                return name
            }
        }
        return nil
    }
}
