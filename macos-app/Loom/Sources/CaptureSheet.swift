import SwiftUI
import AppKit
import os.log

/// Lightweight diagnostic logger for capture-side issues. Triple-write:
///   1. os_log (subsystem com.yinyiping.loom, category capture)
///   2. NSLog (Xcode console)
///   3. Append to /tmp/loom-capture-debug.log (bulletproof — bypasses
///      every Apple log-filtering layer; user can `cat` it directly
///      to diagnose without permission, subsystem, or level filters)
private let captureLog = OSLog(subsystem: "com.yinyiping.loom", category: "capture")
private func os_log_debug(_ message: String) {
    // Use error level so default `log show` filtering doesn't drop it.
    os_log("%{public}@", log: captureLog, type: .error, message)
    NSLog("[LoomCapture] %@", message)
    let formatter = DateFormatter()
    formatter.dateFormat = "HH:mm:ss.SSS"
    let line = "\(formatter.string(from: Date())) [LoomCapture] \(message)\n"
    guard let data = line.data(using: .utf8) else { return }
    // Loom is sandboxed — /tmp is outside the sandbox and writes
    // silently fail. The container's own Documents is always
    // writable; we put the diagnostic log there. User reads with:
    //   cat ~/Library/Containers/com.yinyiping.loom/Data/Documents/loom-capture-debug.log
    guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let url = docs.appendingPathComponent("loom-capture-debug.log")
    if FileManager.default.fileExists(atPath: url.path) {
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(data)
            try? h.close()
        }
    } else {
        try? data.write(to: url)
    }
}

// MARK: - Phase A1+A2 capture surface
//
// Implements the two entry points to the new capture path:
//   • ⌘⇧L (LoomMinimalRootView)  → quick text capture (typed or pasted)
//   • ⌘⇧V (SourceFileView)       → AI-conversation paste from clipboard
//
// Architecture vision (project_loom_personal_wiki_vision.md, 2026-04-27):
// AI thinking happens OUTSIDE Loom (Atlas / ChatGPT / Claude). Loom is
// the structured archive — capture is the pipe back. This sheet is the
// review-and-route surface that pulls a freeform paste / typed thought
// into the right anchor and writes it via LoomFileStore. Source folder
// is never touched (feedback_loom_source_folder_immutable.md).

// MARK: Payload model

/// A single AI-conversation turn, editable in the review sheet.
struct CaptureTurn: Identifiable, Hashable {
    enum Role: String, CaseIterable, Identifiable {
        case user, ai
        var id: String { rawValue }
        var label: String { self == .user ? "You" : "AI" }
    }
    let id = UUID()
    var role: Role
    var text: String
}

/// Where the capture lands on disk (resolved to a LoomFileStore URL).
/// Always sandbox-scoped — never an external folder URL.
enum CaptureAnchor: Identifiable, Hashable {
    /// Per-root inbox: `<store>/<rootID>/sub/Inbox/Loom.md`. Default
    /// fallback when no specific anchor applies.
    case inbox(rootID: UUID, rootLabel: String)
    /// A folder page within the root, addressed by sub-path relative
    /// to the external root. Empty sub-path = the root's own Loom.md.
    case page(rootID: UUID, subPath: String, label: String)
    /// A passage selection inside a PDF. Routes to the containing
    /// folder's Loom.md and adds an anchor URL eyebrow + jump link.
    /// `fileLoomURL` carries the full `loom://content/...` of the PDF
    /// so the writer can synthesize a `loom://anchor?src=…` jump link
    /// without re-encoding paths (parity with `SourceFileView` notes).
    case passage(rootID: UUID, subPath: String, fileLabel: String,
                 fileLoomURL: URL,
                 pageIndex: Int, rect: CGRect, text: String)
    /// A web-page capture (Phase A3). Routes to a per-domain inbox
    /// `<store>/<rootID>/sub/Web/<domain>/Loom.md` so domains
    /// pre-cluster naturally. `sourceURL` is the original page URL,
    /// preserved for citation.
    case web(rootID: UUID, rootLabel: String, domain: String, sourceURL: String, title: String)

    var id: String {
        switch self {
        case .inbox(let r, _):           return "inbox:\(r.uuidString)"
        case .page(let r, let s, _):     return "page:\(r.uuidString):\(s)"
        case .passage(let r, let s, let f, _, let p, _, _):
            return "passage:\(r.uuidString):\(s):\(f):\(p)"
        case .web(let r, _, let d, let u, _):
            return "web:\(r.uuidString):\(d):\(u)"
        }
    }
    var label: String {
        switch self {
        case .inbox(_, let r):           return "Inbox · \(r)"
        case .page(_, _, let l):         return l
        case .passage(_, _, let f, _, let p, _, _): return "\(f) · p.\(p + 1)"
        case .web(_, _, let d, _, _):    return "Web · \(d)"
        }
    }
    var rootID: UUID {
        switch self {
        case .inbox(let r, _), .page(let r, _, _),
             .passage(let r, _, _, _, _, _, _),
             .web(let r, _, _, _, _):
            return r
        }
    }
    /// User-readable hint about where the entry will land. Used in the
    /// sheet so the user sees which file gets written.
    var pathHint: String {
        switch self {
        case .inbox(_, let r):
            return "\(r) / Inbox / Loom.md"
        case .page(_, let s, _):
            return s.isEmpty ? "(root) / Loom.md" : "\(s) / Loom.md"
        case .passage(_, let s, _, _, _, _, _):
            return s.isEmpty ? "(root) / Loom.md" : "\(s) / Loom.md"
        case .web(_, _, let d, _, _):
            return "Web / \(d) / Loom.md"
        }
    }
}

/// Full capture payload — passed into the sheet, edited by the user,
/// then handed to `CaptureWriter` for disk persistence.
struct CapturePayload {
    enum Body { case freeform(String); case aiThread([CaptureTurn]) }
    enum Source: String {
        case manual            // typed in the sheet
        case aiPaste           // clipboard, parsed as a thread
        case clipboardFreeform // clipboard, but couldn't detect a thread
        var label: String {
            switch self {
            case .manual:            return "manual"
            case .aiPaste:           return "ai paste"
            case .clipboardFreeform: return "clipboard"
            }
        }
    }
    var title: String
    var body: Body
    var source: Source
    var sourceURL: String?       // optional permalink (Atlas / ChatGPT exports)
    var model: String?            // optional, when paste mentions it
    var detectedProvider: String? // "chatgpt" / "claude" / "atlas" / nil
    /// Original clipboard paste, preserved verbatim. Lets the user
    /// recover the source if the parser mis-splits — sheet exposes a
    /// "Show raw paste" disclosure that re-edits this back into the
    /// freeform body. nil for typed (manual) captures.
    var originalPaste: String?
    /// Short note about what the parser decided. Surfaced in the sheet
    /// so the user knows whether heuristics fired ("ChatGPT export
    /// detected · 4 turns") or fell through ("no role markers detected
    /// · saved as freeform"). Helps debugging and trust.
    var parserNotes: String?
    var anchor: CaptureAnchor
    var availableAnchors: [CaptureAnchor]
    let capturedAt: Date
    /// Phase D Snapshot Mode v0. Self-contained HTML (DOM + inlined
    /// CSS + base64 images) shipped by the web extension when the user
    /// shift-clicked the L button. CaptureWriter writes this to a
    /// `Loom-snapshot-<timestamp>.html` file next to the per-domain
    /// Loom.md. nil for regular Reader-mode captures.
    var snapshotHtml: String? = nil
    /// Phase D media — base64-encoded blobs (canvas screenshots, video
    /// recordings, audio clips) the extension shipped alongside the
    /// markdown body. Each attachment carries a `tmpId` referenced from
    /// the body via `loom://media/<tmpId>`; CaptureWriter decodes each
    /// blob to disk under the per-anchor folder, then rewrites the body
    /// substituting tmpId with a stable `loom://content/...` URL the
    /// scheme handler can serve. Always present; empty when no media.
    var mediaAttachments: [MediaAttachment] = []
    /// Compact diagnostics emitted by the browser extension that produced
    /// this web capture. This is Loom-owned provenance metadata; it is
    /// persisted as a hidden comment in Loom.md so support/debugging can
    /// prove extension version, transport, and media sidecar behavior
    /// without touching the user's source folders.
    var webDiagnostics: CaptureExtensionDiagnostics? = nil
    /// Typed, compact structure emitted by the web extension. Markdown
    /// remains the editable canonical body, but CaptureAST records the
    /// original content contract: section breaks, headings, rich media
    /// roles, and extraction census. CaptureWriter persists this under
    /// Loom-managed storage next to Loom.md, never in the user's source
    /// folders.
    var captureAST: CaptureAST? = nil
    var captureASTFilename: String? = nil

    /// Browser captures already passed through deterministic DOM extraction.
    /// The sheet may let users trim manually, but it must not pre-drop
    /// structural blocks such as headings, dividers, tables of contents, or
    /// provider/media markers before the capture is saved.
    var shouldPreserveWebCaptureStructure: Bool {
        sourceURL != nil || captureAST != nil || webDiagnostics != nil
    }

    static func makeQuickCapture(anchor: CaptureAnchor, available: [CaptureAnchor]) -> CapturePayload {
        CapturePayload(
            title: "",
            body: .freeform(""),
            source: .manual,
            anchor: anchor,
            availableAnchors: available,
            capturedAt: Date()
        )
    }
    /// Phase A3 entry: the JSON shape posted by the bookmarklet,
    /// unwrapped into a CapturePayload. Anchor list comes from
    /// `CaptureAnchorResolver.resolveForWebCapture(...)`. Body is
    /// always freeform — Loom's strict no-LLM-at-capture line means
    /// no template / interpreter / summarization happens here; the
    /// extracted markdown is what the user sees, edits, and commits.
    static func makeFromWebPayload(
        _ web: CaptureWebPayload,
        anchor: CaptureAnchor,
        available: [CaptureAnchor]
    ) -> CapturePayload {
        let body: String = {
            // The page body stays canonical. Selection is preserved on
            // the raw payload and in parser notes, but it must not
            // override the rich-media body: a stray browser selection
            // would otherwise drop videos, GIFs, provider cards, and
            // canvas sidecars.
            let pageBody = web.body.trimmingCharacters(in: .whitespacesAndNewlines)
            if !pageBody.isEmpty { return web.body }
            return web.selection
        }()
        let trimmedTitle = web.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let suggestedTitle = trimmedTitle.isEmpty
            ? Self.suggestTitle(fromFreeform: body)
            : trimmedTitle
        var payload = CapturePayload(
            title: suggestedTitle,
            body: .freeform(body),
            source: .clipboardFreeform,
            sourceURL: web.url,
            anchor: anchor,
            availableAnchors: available,
            capturedAt: Date()
        )
        payload.parserNotes = web.selection.isEmpty
            ? "web · full page · \(body.count) chars"
            : "web · full page + selection · \(body.count) chars"
        if let diag = web.loomExtension {
            payload.parserNotes = [payload.parserNotes, diag.sheetSummary]
                .compactMap { $0 }
                .joined(separator: " · ")
        }
        // Original paste = the full bookmarklet payload as JSON, so the
        // user can recover both selection and body via "Use raw paste".
        // EXCEPT when a snapshotHtml is present — that field can be a
        // multi-MB HTML blob, and embedding it in originalPaste would
        // wedge the "Show raw paste" disclosure with a giant string in
        // memory. Strip it from rawJSON for the disclosure copy.
        if web.snapshotHtml != nil {
            payload.originalPaste = stripSnapshotFromRawJSON(web.rawJSON)
        } else {
            payload.originalPaste = web.rawJSON
        }
        // Phase D — carry the snapshot HTML through the sheet so the
        // chip can show "Snapshot · X KB" and Save can write it to disk.
        payload.snapshotHtml = web.snapshotHtml
        // Phase D media — base64 blobs travel through the sheet so the
        // writer can decode them after the user finalizes the anchor
        // (per-domain folder is determined at save time).
        payload.mediaAttachments = web.mediaAttachments ?? []
        payload.webDiagnostics = web.loomExtension
        payload.captureAST = web.captureAst
        return payload
    }

    /// When the bookmarklet payload includes `snapshotHtml`, strip it
    /// before stashing in `originalPaste`. The "Show raw paste"
    /// disclosure renders the raw JSON in a TextEditor; a 2MB HTML
    /// string makes that surface unusable. Lossy regex is fine —
    /// raw paste is a debugging aid, not a contract.
    private static func stripSnapshotFromRawJSON(_ raw: String) -> String {
        guard !raw.isEmpty else { return raw }
        // Match "snapshotHtml":"...escaped..." up to the closing quote
        // before the next field separator.
        let pattern = #""snapshotHtml"\s*:\s*"(?:[^"\\]|\\.)*"\s*,?"#
        let placeholder = "\"snapshotHtml\":\"<elided · see Loom-snapshot-*.html>\""
        if let regex = try? NSRegularExpression(pattern: pattern) {
            let ns = raw as NSString
            return regex.stringByReplacingMatches(
                in: raw,
                range: NSRange(location: 0, length: ns.length),
                withTemplate: placeholder
            )
        }
        return raw
    }

    static func makeFromClipboard(anchor: CaptureAnchor, available: [CaptureAnchor]) -> CapturePayload {
        let raw = NSPasteboard.general.string(forType: .string) ?? ""
        let parsed = AIConversationParser.parse(raw)
        var payload = CapturePayload(
            title: "",
            body: .freeform(""),
            source: .manual,
            anchor: anchor,
            availableAnchors: available,
            capturedAt: Date()
        )
        switch parsed {
        case .freeform(let text):
            payload.body = .freeform(text)
            payload.source = raw.isEmpty ? .manual : .clipboardFreeform
            payload.parserNotes = raw.isEmpty
                ? nil
                : "no role markers detected · saved as freeform"
        case .thread(let turns, let provider):
            payload.body = .aiThread(turns)
            payload.source = .aiPaste
            payload.detectedProvider = provider
            payload.parserNotes = "\(provider ?? "generic") thread detected · \(turns.count) turns"
        }
        payload.originalPaste = raw.isEmpty ? nil : raw
        payload.sourceURL = AIConversationParser.extractURL(from: raw)
        payload.model = AIConversationParser.extractModel(from: raw)
        payload.title = Self.defaultTitle(for: payload)
        return payload
    }

    /// Title suggestion that adapts to the anchor + body. Inbox/page
    /// captures get their first-line summary; passage captures default
    /// to "Note on <filename>" so the saved heading reads as a
    /// commentary on the source rather than a standalone fragment.
    static func defaultTitle(for payload: CapturePayload) -> String {
        if case .passage(_, _, let fileLabel, _, _, _, _) = payload.anchor {
            return "Note on \(fileLabel)"
        }
        switch payload.body {
        case .freeform(let text):  return suggestTitle(fromFreeform: text)
        case .aiThread(let turns): return suggestTitle(fromThread: turns)
        }
    }

    /// Heuristic: first user turn's first sentence, capped to 60 chars.
    static func suggestTitle(fromThread turns: [CaptureTurn]) -> String {
        let first = turns.first(where: { $0.role == .user })?.text
            ?? turns.first?.text
            ?? ""
        return suggestTitle(fromFreeform: first)
    }
    static func suggestTitle(fromFreeform text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "" }
        let firstLine = trimmed.split(separator: "\n").first.map(String.init) ?? trimmed
        let firstSentence = firstLine.split(whereSeparator: { ".?!。？！".contains($0) }).first.map(String.init) ?? firstLine
        let cleaned = firstSentence.trimmingCharacters(in: .whitespaces)
        if cleaned.count <= 60 { return cleaned }
        let cutoff = cleaned.index(cleaned.startIndex, offsetBy: 60)
        return String(cleaned[..<cutoff]) + "…"
    }

    /// Re-parse the original paste (used when the user wants to redo
    /// the heuristic split after manual edits). Returns nil if the
    /// payload has no preserved paste (i.e. typed manually).
    func reparsedFromOriginal() -> CapturePayload? {
        guard let raw = originalPaste, !raw.isEmpty else { return nil }
        var copy = self
        let parsed = AIConversationParser.parse(raw)
        switch parsed {
        case .freeform(let text):
            copy.body = .freeform(text)
            copy.source = .clipboardFreeform
            copy.parserNotes = "no role markers · saved as freeform"
        case .thread(let turns, let provider):
            copy.body = .aiThread(turns)
            copy.source = .aiPaste
            copy.detectedProvider = provider
            copy.parserNotes = "\(provider ?? "generic") thread · \(turns.count) turns"
        }
        return copy
    }
}

// MARK: Web bookmarklet payload (Phase A3)

/// One media blob attached to a web capture. The web extension renders
/// or records media (canvas screenshots, video recordings, audio clips)
/// in the browser, base64-encodes the bytes, and ships them inside the
/// JSON payload so Loom (sandboxed) doesn't need any direct disk
/// handshake with the browser. The body markdown references each blob
/// via `loom://media/<tmpId>`; CaptureWriter decodes each blob to a
/// stable file under the per-anchor folder and rewrites the body to
/// point at the existing scheme handler's `loom://content/...` URL.
///
/// `tmpId` is per-capture; the writer mints a new `stableID` random
/// nonce for the on-disk filename so re-captures from the same browser
/// session don't collide.
struct MediaAttachment: Decodable {
    var tmpId: String
    var mime: String
    var base64: String
    var role: String?

    private enum CodingKeys: String, CodingKey {
        case tmpId, mime, base64, role
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.tmpId = (try? c.decodeIfPresent(String.self, forKey: .tmpId)) ?? ""
        self.mime = (try? c.decodeIfPresent(String.self, forKey: .mime)) ?? ""
        self.base64 = (try? c.decodeIfPresent(String.self, forKey: .base64)) ?? ""
        self.role = try? c.decodeIfPresent(String.self, forKey: .role)
    }

    init(tmpId: String, mime: String, base64: String, role: String? = nil) {
        self.tmpId = tmpId
        self.mime = mime
        self.base64 = base64
        self.role = role
    }

    /// File extension keyed off MIME, with byte-sniff fallback for old
    /// / browser-generated blobs that arrive as application/octet-stream.
    /// Falls back to `.bin` for unknown types so we never silently drop
    /// the attachment.
    var fileExtension: String {
        fileExtension(for: nil)
    }

    func fileExtension(for data: Data?) -> String {
        let baseMime = mime
            .lowercased()
            .split(separator: ";", maxSplits: 1, omittingEmptySubsequences: true)
            .first
            .map(String.init) ?? ""
        switch baseMime.trimmingCharacters(in: .whitespacesAndNewlines) {
        case "video/webm":            return "webm"
        case "video/mp4":             return "mp4"
        case "video/quicktime":        return "mov"
        case "image/png":             return "png"
        case "image/jpeg", "image/jpg": return "jpg"
        case "image/gif":             return "gif"
        case "image/webp":            return "webp"
        case "audio/mp3", "audio/mpeg": return "mp3"
        case "audio/wav", "audio/x-wav": return "wav"
        case "audio/webm":            return "webm"
        default:
            return Self.sniffedFileExtension(from: data) ?? "bin"
        }
    }

    private static func sniffedFileExtension(from data: Data?) -> String? {
        guard let data, !data.isEmpty else { return nil }
        let bytes = [UInt8](data.prefix(64))
        if bytes.starts(with: [0x1A, 0x45, 0xDF, 0xA3]),
           let ascii = String(data: Data(bytes), encoding: .ascii),
           ascii.lowercased().contains("webm") {
            return "webm"
        }
        if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "png" }
        if bytes.starts(with: [0xFF, 0xD8, 0xFF]) { return "jpg" }
        if bytes.count >= 4,
           String(bytes: bytes.prefix(4), encoding: .ascii)?.hasPrefix("GIF8") == true {
            return "gif"
        }
        if bytes.count >= 12,
           String(bytes: Array(bytes[0..<4]), encoding: .ascii) == "RIFF",
           String(bytes: Array(bytes[8..<12]), encoding: .ascii) == "WEBP" {
            return "webp"
        }
        if bytes.count >= 12,
           String(bytes: Array(bytes[4..<8]), encoding: .ascii) == "ftyp" {
            return "mp4"
        }
        return nil
    }
}

struct CaptureAST: Codable {
    var version: Int?
    var sourceURL: String?
    var title: String?
    var diagnostics: CaptureASTDiagnostics?
    var blocks: [CaptureASTBlock]?
}

struct CaptureASTDiagnostics: Codable {
    var captureCensus: CaptureCensus?
    var sectionHeadings: [String]?
    var blockCount: Int?
}

struct CaptureCensus: Codable {
    var headingCount: Int?
    var sectionHeadings: [String]?
    var mediaNodeCount: Int?
    var mediaKindCounts: [String: Int]?
    var imageCount: Int?
    var gifCount: Int?
    var videoCount: Int?
    var providerEmbedCount: Int?
    var visualAssemblyCount: Int?
    var codeBlockCount: Int?
    var linkCount: Int?
}

struct CaptureASTBlock: Codable {
    var id: String?
    var kind: String?
    var level: Int?
    var text: String?
    var markdown: String?
    var url: String?
    var title: String?
    var provider: String?
    var mediaRole: String?
    var snapshotTarget: String?
}

struct CaptureExtensionDiagnostics: Codable {
    var manifestName: String?
    var manifestVersion: String?
    var extensionId: String?
    var extensionBaseUrl: String?
    var manifestUrl: String?
    var captureUrl: String?
    var capturedAt: String?
    var bodyLength: Int?
    var bodyWordCount: Int?
    var mediaAttachmentCount: Int?
    var mediaAttachmentRoleCounts: [String: Int]?
    var captureAstBlockCount: Int?
    var captureCensus: CaptureCensus?
    var payloadByteCount: Int?
    var transportMethod: String?
    var clipboardWarnings: [String]?

    var sheetSummary: String {
        var parts: [String] = []
        if let version = manifestVersion, !version.isEmpty {
            parts.append("ext \(version)")
        }
        if let transport = transportMethod, !transport.isEmpty {
            parts.append(transport)
        }
        if let mediaAttachmentCount, mediaAttachmentCount > 0 {
            parts.append("\(mediaAttachmentCount) media")
        }
        return parts.isEmpty ? "extension diagnostics" : parts.joined(separator: " · ")
    }

    var compactCommentJSON: String? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(self),
              var text = String(data: data, encoding: .utf8),
              !text.isEmpty else {
            return nil
        }
        // HTML comments cannot contain `--`; keep provenance hidden but
        // syntactically valid even if a browser error message contains it.
        text = text.replacingOccurrences(of: "--", with: "\\u002d\\u002d")
        return text
    }
}

/// JSON shape posted by the Loom bookmarklet to `loom://capture`.
/// Browsers do main-content extraction (DOM access is theirs to win)
/// — Loom is the markdown sink. Each field corresponds to a property
/// the bookmarklet reads off the page; missing fields default empty.
struct CaptureWebPayload: Decodable {
    var url: String = ""
    var title: String = ""
    var selection: String = ""
    var description: String = ""
    var siteName: String = ""
    var body: String = ""
    /// Phase D Snapshot Mode v0 (extension v1.3.0). When set, the
    /// extension shipped a self-contained HTML capture (DOM + inlined
    /// CSS + base64 images) alongside the markdown body. CaptureWriter
    /// writes this to `Loom-snapshot-<timestamp>.html` next to the
    /// per-domain Loom.md so the design-rich page can be re-rendered
    /// in an iframe at /loom-render/snapshot.
    var snapshotHtml: String? = nil
    /// Phase D media — base64-encoded media blobs the extension shipped
    /// alongside the markdown body. Each attachment is referenced from
    /// the body via `loom://media/<tmpId>`. CaptureWriter decodes each
    /// to disk + rewrites the body. Optional in JSON (older extension
    /// versions don't send it); defaults to empty list.
    var mediaAttachments: [MediaAttachment]? = nil
    /// Extension/runtime/transport provenance emitted by content.js.
    /// Unknown to older payloads and optional by design.
    var loomExtension: CaptureExtensionDiagnostics? = nil
    /// Typed capture outline + media census emitted by the extension.
    /// Optional for older extension payloads.
    var captureAst: CaptureAST? = nil
    /// Raw JSON kept for `CapturePayload.originalPaste` — lets the
    /// user re-derive everything if Loom-side parsing was off.
    var rawJSON: String = ""

    /// Explicit CodingKeys excludes `rawJSON` — that field is metadata
    /// set by the URL parser AFTER decode (so it can hold the original
    /// JSON for "Show raw paste" recovery), not something the bookmarklet
    /// or extension sends. Without this, Swift's synthesized Codable
    /// requires `rawJSON` to be present in every JSON payload, causing
    /// `dataCorrupted` ("data missing") errors on every real capture.
    private enum CodingKeys: String, CodingKey {
        case url, title, selection, description, siteName, body, snapshotHtml, mediaAttachments, captureAst, loomExtension
    }

    /// Custom init tolerant of missing fields. Bookmarklet may omit
    /// any of: selection, description, siteName when the page lacks
    /// them. Each missing key falls back to default empty string,
    /// keeping decoding robust against minor schema drift between
    /// extension versions.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.url = (try? c.decodeIfPresent(String.self, forKey: .url)) ?? ""
        self.title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? ""
        self.selection = (try? c.decodeIfPresent(String.self, forKey: .selection)) ?? ""
        self.description = (try? c.decodeIfPresent(String.self, forKey: .description)) ?? ""
        self.siteName = (try? c.decodeIfPresent(String.self, forKey: .siteName)) ?? ""
        self.body = (try? c.decodeIfPresent(String.self, forKey: .body)) ?? ""
        self.snapshotHtml = try? c.decodeIfPresent(String.self, forKey: .snapshotHtml)
        self.mediaAttachments = try? c.decodeIfPresent([MediaAttachment].self, forKey: .mediaAttachments)
        self.captureAst = try? c.decodeIfPresent(CaptureAST.self, forKey: .captureAst)
        self.loomExtension = try? c.decodeIfPresent(CaptureExtensionDiagnostics.self, forKey: .loomExtension)
        self.rawJSON = ""
    }

    init() {}

    var hasSubstantiveCaptureContent: Bool {
        if !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        if !selection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        if let snapshotHtml,
           !snapshotHtml.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        if let mediaAttachments, !mediaAttachments.isEmpty { return true }
        if let blocks = captureAst?.blocks, !blocks.isEmpty { return true }
        return false
    }

    /// Decode the `payload=<percent-encoded JSON>` query item from a
    /// `loom://capture?payload=…` URL. Returns nil for malformed input;
    /// caller surfaces a toast.
    ///
    /// Two-strategy parser:
    ///   1. URLComponents (standard, fastest) — handles short / clean URLs.
    ///   2. Manual scan for `?payload=` (fallback) — URLComponents has
    ///      known issues with non-http(s) schemes when the query
    ///      contains lots of percent-encoded data, sometimes returning
    ///      nil queryItems on otherwise valid URLs. The manual path
    ///      sidesteps that by working on the raw URL string.
    ///
    /// Errors are logged via `os_log` so failed payloads can be
    /// diagnosed without re-running the whole pipeline.
    static func from(url: URL) -> CaptureWebPayload? {
        let urlString = url.absoluteString
        os_log_debug("Loom URL handler received: \(urlString.prefix(120))… (length: \(urlString.count))")

        // Strategy 0 — pasteboard handoff. URL contains `?via=clipboard`
        // (extension wrote full JSON to NSPasteboard.general before
        // firing this short URL, bypassing macOS AppleEvent URL
        // truncation). Read pasteboard text, parse as JSON.
        if urlString.contains("via=clipboard") {
            let pb = NSPasteboard.general
            guard let json = pb.string(forType: .string) else {
                os_log_debug("Pasteboard handoff: no string on general pasteboard")
                return nil
            }
            os_log_debug("Pasteboard handoff: read \(json.count) chars from pasteboard")
            if let payload = decodeJSON(json) {
                return payload
            }
            os_log_debug("Pasteboard handoff: decodeJSON failed; refusing fallback for clipboard transport")
            return nil
        }

        // Strategy 1 — URLComponents.
        if let comps = URLComponents(url: url, resolvingAgainstBaseURL: false),
           let item = comps.queryItems?.first(where: { $0.name == "payload" }),
           let raw = item.value {
            // `URLComponents.queryItems[i].value` returns a percent-
            // decoded string. Calling removingPercentEncoding on
            // already-decoded text is mostly idempotent, but if the
            // body contains literal `%` chars not followed by 2 hex
            // digits it returns nil — so we treat raw as the source
            // of truth and skip the second decode.
            if let payload = decodeJSON(raw) {
                return payload
            }
            os_log_debug("Loom URL handler: URLComponents path got value but JSON decode failed (value length \(raw.count))")
        } else {
            os_log_debug("Loom URL handler: URLComponents path failed to extract payload query item")
        }

        // Strategy 2 — manual scan of the raw URL string.
        if let payloadRange = urlString.range(of: "?payload=") {
            let encoded = String(urlString[payloadRange.upperBound...])
            // Strip any trailing `&other=...` query-items if added
            // later. Bookmarklet doesn't add them, but be defensive.
            let firstAmp = encoded.firstIndex(of: "&").map { String(encoded[..<$0]) } ?? encoded
            if let decoded = firstAmp.removingPercentEncoding,
               let payload = decodeJSON(decoded) {
                return payload
            }
            os_log_debug("Loom URL handler: manual scan found ?payload= but decode/JSON failed (encoded length \(firstAmp.count))")
        } else {
            os_log_debug("Loom URL handler: manual scan found no ?payload= substring")
        }

        return nil
    }

    /// Try to decode the (already-decoded) JSON string into a payload.
    /// Logs the JSON parse error context so subtle malformed payloads
    /// (e.g. truncated mid-string) are diagnosable.
    private static func decodeJSON(_ jsonString: String) -> CaptureWebPayload? {
        guard let data = jsonString.data(using: .utf8) else {
            os_log_debug("Loom URL handler: JSON string not valid UTF-8 (length \(jsonString.count))")
            return nil
        }
        do {
            var payload = try JSONDecoder().decode(CaptureWebPayload.self, from: data)
            payload.rawJSON = jsonString
            return payload
        } catch {
            // Log BOTH head and tail of failing JSON so truncation is
            // diagnosable: head shows opening fields, tail shows where
            // it broke off. macOS AppleEvent silently truncates large
            // URL payloads — without seeing the tail we can't tell
            // truncation from genuinely malformed JSON.
            let head = jsonString.count > 150
                ? String(jsonString.prefix(150))
                : jsonString
            let tail = jsonString.count > 150
                ? String(jsonString.suffix(150))
                : ""
            os_log_debug("Loom URL handler: JSON decode threw \(error.localizedDescription)")
            os_log_debug("  HEAD (first 150): \(head)")
            os_log_debug("  TAIL (last 150): \(tail)")
            os_log_debug("  TOTAL JSON length: \(jsonString.count)")
            return nil
        }
    }

    /// Extract a clean domain from a URL string for the per-domain
    /// anchor folder (`Web/<domain>/Loom.md`). Strips `www.`. Falls
    /// back to "unknown" if URL parsing fails.
    var domain: String {
        guard let host = URL(string: url)?.host else { return "unknown" }
        if host.hasPrefix("www.") { return String(host.dropFirst(4)) }
        return host
    }
}

// MARK: AI conversation parser

/// Parses a clipboard paste into either a structured thread (when
/// per-source markers are detected) or freeform text. Three layered
/// strategies — first match wins. Heuristics are intentionally
/// generous: false positives just mean the user gets a thread shape
/// they can re-merge, false negatives lose structure entirely.
enum AIConversationParser {
    enum Result: Equatable {
        case freeform(String)
        case thread([CaptureTurn], detectedSource: String?)
    }

    static func parse(_ raw: String) -> Result {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .freeform("") }

        // Strategy 1: ChatGPT/Atlas web export shape — `You said:` /
        // `ChatGPT said:` headers (each on its own line, body follows).
        // Try this first because it's the highest-confidence pattern
        // and works whether the headers are bare, **bold**, or bullet
        // prefixed.
        if let turns = parseSaidExport(trimmed), turns.count >= 2 {
            return .thread(turns, detectedSource: detectSource(in: trimmed) ?? "chatgpt")
        }

        // Strategy 2: ChatGPT mobile / single-line concatenated form
        // where role headers are inline (`You said: ... ChatGPT said: ...`).
        if let turns = parseInlineSaid(trimmed), turns.count >= 2 {
            return .thread(turns, detectedSource: detectSource(in: trimmed) ?? "chatgpt")
        }

        // Strategy 3: explicit `Role:` prefix lines, including markdown
        // decoration (`**You:**`, `### User`, `> Human:`) and CJK
        // localization (`用户:`, `我:`, `助手:`, `AI:`).
        if let turns = parseWithRoleMarkers(trimmed), turns.count >= 2 {
            return .thread(turns, detectedSource: detectSource(in: trimmed))
        }

        return .freeform(trimmed)
    }

    /// Strip markdown decoration so a label line like `**You:**` or
    /// `### User` matches the same role tokens as a bare `You:`.
    /// Removes leading `>`, `-`, `*`, `+`, `#`, and surrounding `*` /
    /// `_` emphasis. Lowercased.
    private static func canonicalizeRoleToken(_ raw: String) -> String {
        var s = raw.trimmingCharacters(in: .whitespaces)
        // Drop leading list / quote / heading prefix glyphs.
        let leading: Set<Character> = ["#", ">", "-", "*", "+"]
        while let first = s.first, leading.contains(first) {
            s.removeFirst()
            s = s.trimmingCharacters(in: .whitespaces)
        }
        // Drop wrapping emphasis (`**X**`, `*X*`, `_X_`).
        let wrappers = ["**", "__", "*", "_"]
        for w in wrappers {
            if s.hasPrefix(w) && s.hasSuffix(w) && s.count > 2 * w.count {
                s.removeFirst(w.count)
                s.removeLast(w.count)
                s = s.trimmingCharacters(in: .whitespaces)
            }
        }
        // Drop a trailing colon if present (callers handle the colon
        // separately when they need to).
        if s.hasSuffix(":") || s.hasSuffix("：") { s.removeLast() }
        // CJK colon normalization handled by the caller looking at
        // both `:` and `：`.
        return s.lowercased()
    }

    private static let userTokens: Set<String> = [
        "you", "user", "human", "me",
        "用户", "我", "提问", "提问者"
    ]
    private static let aiTokens: Set<String> = [
        "ai", "assistant", "chatgpt", "claude", "bot", "atlas",
        "gemini", "gpt", "o1", "o3", "copilot",
        "助手", "回答", "回应"
    ]

    /// Strategy 3: line-by-line role markers. Tolerates markdown
    /// emphasis, headings, bullet/quote prefixes, and CJK colons.
    private static func parseWithRoleMarkers(_ text: String) -> [CaptureTurn]? {
        let lines = text.components(separatedBy: "\n")
        var turns: [CaptureTurn] = []
        var currentRole: CaptureTurn.Role? = nil
        var currentText = ""
        func flush() {
            guard let role = currentRole else { return }
            let body = currentText.trimmingCharacters(in: .whitespacesAndNewlines)
            if !body.isEmpty { turns.append(CaptureTurn(role: role, text: body)) }
            currentText = ""
        }
        for line in lines {
            let stripped = line.trimmingCharacters(in: .whitespaces)
            // Find the first colon — ASCII or CJK.
            let colonRange = stripped.range(of: ":") ?? stripped.range(of: "：")
            if let cr = colonRange {
                let prefixRaw = String(stripped[..<cr.lowerBound])
                let rest = String(stripped[cr.upperBound...])
                    .trimmingCharacters(in: .whitespaces)
                let token = canonicalizeRoleToken(prefixRaw)
                if userTokens.contains(token) {
                    flush(); currentRole = .user; currentText = rest; continue
                }
                if aiTokens.contains(token) {
                    flush(); currentRole = .ai; currentText = rest; continue
                }
            }
            // Pure heading / emphasis line with NO colon ("### User",
            // "**ChatGPT**"). Treat the whole stripped line as a token.
            let lineToken = canonicalizeRoleToken(stripped)
            if !lineToken.isEmpty && lineToken.count <= 12 {
                if userTokens.contains(lineToken) {
                    flush(); currentRole = .user; currentText = ""; continue
                }
                if aiTokens.contains(lineToken) {
                    flush(); currentRole = .ai; currentText = ""; continue
                }
            }
            if currentRole != nil {
                if !currentText.isEmpty { currentText += "\n" }
                currentText += line
            }
        }
        flush()
        return turns.isEmpty ? nil : turns
    }

    /// Strategy 1: `You said:` / `ChatGPT said:` / `Atlas said:` /
    /// `Assistant said:` headers, optionally wrapped in `**…**` or
    /// preceded by markdown list / quote glyphs. Each header owns
    /// everything until the next header.
    private static func parseSaidExport(_ text: String) -> [CaptureTurn]? {
        // (?im) = case-insensitive, multiline. Allow leading
        // whitespace + bullet/quote/heading glyphs + `**` emphasis.
        // The `said:` literal is the discriminator.
        let pattern = #"(?im)^[\s>\-*+#]*\**(you|chatgpt|assistant|atlas|claude|gemini|copilot)\**\s+said\s*[:：]\s*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let ns = text as NSString
        let matches = regex.matches(in: text, range: NSRange(location: 0, length: ns.length))
        guard matches.count >= 2 else { return nil }
        return assembleTurns(in: ns, headers: matches)
    }

    /// Strategy 2: inline `You said: ... ChatGPT said: ...` — same
    /// pattern but without anchoring to the start of a line, useful
    /// for mobile-share pastes that strip newlines.
    private static func parseInlineSaid(_ text: String) -> [CaptureTurn]? {
        let pattern = #"(?i)\b(you|chatgpt|assistant|atlas|claude|gemini)\b\s+said\s*[:：]"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return nil }
        let ns = text as NSString
        let matches = regex.matches(in: text, range: NSRange(location: 0, length: ns.length))
        guard matches.count >= 2 else { return nil }
        return assembleTurns(in: ns, headers: matches)
    }

    /// Shared helper for the two `said:`-based strategies. Each header
    /// owns the text from `header.upperBound` to the next header (or
    /// end of input). Role determined by the first capture group.
    private static func assembleTurns(in ns: NSString, headers: [NSTextCheckingResult]) -> [CaptureTurn]? {
        var turns: [CaptureTurn] = []
        for (idx, match) in headers.enumerated() {
            let header = ns.substring(with: match.range).lowercased()
            let role: CaptureTurn.Role = header.contains("you") ? .user : .ai
            let bodyStart = match.range.location + match.range.length
            let bodyEnd = idx + 1 < headers.count
                ? headers[idx + 1].range.location
                : ns.length
            guard bodyEnd > bodyStart else { continue }
            let body = ns.substring(with: NSRange(location: bodyStart, length: bodyEnd - bodyStart))
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !body.isEmpty {
                turns.append(CaptureTurn(role: role, text: body))
            }
        }
        return turns.isEmpty ? nil : turns
    }

    private static func detectSource(in text: String) -> String? {
        let lower = text.lowercased()
        if lower.contains("chatgpt.com") || lower.contains("chat.openai") { return "chatgpt" }
        if lower.contains("claude.ai")   { return "claude" }
        if lower.contains("atlas")        { return "atlas" }
        if lower.contains("gemini")       { return "gemini" }
        if lower.contains("chatgpt")      { return "chatgpt" }
        if lower.contains("claude")       { return "claude" }
        return nil
    }

    /// Pull a permalink out of the paste if one is present. Recognizes
    /// ChatGPT/Atlas shares, Claude conversation links, and any
    /// arbitrary http(s) URL on its own line as a fallback.
    static func extractURL(from raw: String) -> String? {
        let preferred = #"https?://(?:chatgpt\.com|chat\.openai\.com|claude\.ai|atlas\.ai|atlas\.[^\s]+|share\.openai\.com)/[^\s>)\]]+"#
        if let r = try? NSRegularExpression(pattern: preferred),
           let m = r.firstMatch(in: raw, range: NSRange(location: 0, length: (raw as NSString).length)) {
            return (raw as NSString).substring(with: m.range)
        }
        // Loose fallback: any standalone http(s) URL.
        let any = #"https?://[^\s<>)\]]+"#
        if let r = try? NSRegularExpression(pattern: any),
           let m = r.firstMatch(in: raw, range: NSRange(location: 0, length: (raw as NSString).length)) {
            return (raw as NSString).substring(with: m.range)
        }
        return nil
    }

    /// Try to pull a recognizable model name out of the paste. Cheap
    /// regex; misses bespoke names but catches the common ones.
    static func extractModel(from raw: String) -> String? {
        let patterns: [String] = [
            #"GPT-?\s?(5(?:\.5)?|4o|4\.5|4\b|3\.5)"#,
            #"Claude\s+(Opus|Sonnet|Haiku)\s+\d(?:\.\d)?"#,
            #"Claude\s+(Opus|Sonnet|Haiku)"#,
            #"Claude\s+\d(?:\.\d)?\s+(Opus|Sonnet|Haiku)"#,
            #"o1(?:-(?:mini|preview))?"#,
            #"o3(?:-(?:mini|preview))?"#,
            #"Gemini\s+(?:1\.5\s+)?(Pro|Flash|Ultra)"#,
        ]
        let ns = raw as NSString
        for p in patterns {
            guard let r = try? NSRegularExpression(pattern: p, options: [.caseInsensitive]) else { continue }
            if let m = r.firstMatch(in: raw, range: NSRange(location: 0, length: ns.length)) {
                return ns.substring(with: m.range)
            }
        }
        return nil
    }
}

// MARK: Disk writer

/// Routes a saved CapturePayload to a `LoomFileStore`-managed Loom.md
/// under the chosen anchor. Never writes to the user's external folder
/// (Source Fidelity rule, 2026-04-27).
enum CaptureWriter {
    /// Maximum chars of a passage quote rendered into the saved entry.
    /// Long selections (5KB+) bloat Loom.md with no benefit; the user
    /// can re-open the source via the jump-link. Picked to fit a few
    /// sentences while staying readable in the rendered note.
    static let passageQuoteLimit = 240

    /// Dedup window: same anchor + same body inside this many seconds
    /// is treated as an accidental double-save. Sheet shows the user
    /// the conflict before committing the duplicate.
    static let dedupWindowSeconds: TimeInterval = 30

    enum Failure: LocalizedError {
        case missingTarget
        case emptyCapture
        case writeFailed(Error)
        case duplicate(existingTimestamp: String)
        var errorDescription: String? {
            switch self {
            case .missingTarget:
                return "Couldn't find a target Loom.md for this capture."
            case .emptyCapture:
                return "Capture payload was empty. Re-capture from the page."
            case .writeFailed(let e):
                return e.localizedDescription
            case .duplicate(let ts):
                return "An identical capture was saved at \(ts). Save again anyway?"
            }
        }
    }

    static func hasSubstantiveContent(_ payload: CapturePayload) -> Bool {
        if !bodyText(payload).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        if let snapshotHtml = payload.snapshotHtml,
           !snapshotHtml.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        if !payload.mediaAttachments.isEmpty { return true }
        if let blocks = payload.captureAST?.blocks, !blocks.isEmpty { return true }
        return false
    }

    @discardableResult
    static func save(_ payload: CapturePayload, force: Bool = false) throws -> URL {
        guard hasSubstantiveContent(payload) else {
            throw Failure.emptyCapture
        }
        let target = anchorTarget(for: payload.anchor)
        let existing = (try? String(contentsOf: target, encoding: .utf8)) ?? ""
        if !force, let conflict = detectDuplicate(payload: payload, in: existing) {
            throw Failure.duplicate(existingTimestamp: conflict)
        }
        // Phase D media — decode each base64 blob to a sibling file and
        // rewrite `loom://media/<tmpId>` references in the body BEFORE
        // we render the entry to markdown. The substitution happens in
        // a local copy of the payload so the rest of the pipeline
        // (renderEntry, embedding index, dedup fingerprint) sees the
        // final URL form. Media write failures are non-fatal: a missing
        // attachment leaves the placeholder URL in the body, which
        // renders as a broken link rather than blocking the capture.
        var working = payload
        if !working.mediaAttachments.isEmpty {
            do {
                try writeMediaAttachments(payload: &working, alongside: target)
            } catch {
                NSLog("Media attachment write failed (non-fatal): \(error.localizedDescription)")
            }
        }
        if working.captureAST != nil {
            do {
                try writeCaptureAST(payload: &working, alongside: target)
            } catch {
                NSLog("CaptureAST sidecar write failed (non-fatal): \(error.localizedDescription)")
            }
        }
        let entry = renderEntry(working)
        guard !entry.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw Failure.emptyCapture
        }
        do {
            try FileManager.default.createDirectory(
                at: target.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let updated = appendUnderNotes(entry: entry, to: existing)
            try updated.write(to: target, atomically: true, encoding: .utf8)
        } catch {
            throw Failure.writeFailed(error)
        }
        // Phase D Snapshot Mode v0 — when the payload carries an HTML
        // snapshot, write it as a sibling file `Loom-snapshot-<ts>.html`.
        // Failure is non-fatal: markdown body still saved above; the
        // snapshot is a bonus surface, not the canonical capture.
        if let html = working.snapshotHtml,
           !html.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            do {
                try writeSnapshotHTML(html, payload: working, alongside: target)
            } catch {
                NSLog("Snapshot write failed (non-fatal): \(error.localizedDescription)")
            }
        }
        // Phase B — index the just-saved entry for capture-time
        // similarity queries on future captures. Indexing is async +
        // non-fatal; embedding is an optimization, not a contract.
        LoomEmbeddingStore.index(
            rootID: working.anchor.rootID,
            anchorID: working.anchor.id,
            anchorLabel: working.anchor.label,
            targetPath: target.path,
            body: bodyText(working),
            capturedAt: working.capturedAt
        )
        return target
    }

    /// Phase D media — decode each base64 attachment to disk under the
    /// per-anchor directory (sibling of Loom.md) and rewrite every
    /// `loom://media/<tmpId>` reference in the body to the stable
    /// `loom://content/<rootID>/<sub-path>/Loom-media-<stableID>.<ext>`
    /// URL the existing scheme handler can serve.
    ///
    /// Notes:
    ///   - `stableID` is a fresh 12-char nonce per attachment, so two
    ///     captures from the same browser session that happen to mint
    ///     the same `tmpId` (which is per-capture, but the extension
    ///     could re-use IDs) never collide on disk.
    ///   - The path used for substitution mirrors the anchor's location
    ///     under `<rootID>/[sub/<sub-path>/]Loom-media-…` exactly. Web
    ///     captures land in `<rootID>/sub/Web/<domain>/`; Inbox + page
    ///     captures land alongside their respective Loom.md.
    ///   - Body mutation happens in-place on the working payload so
    ///     downstream render / dedup / embedding sees the final URL.
    private static func writeMediaAttachments(
        payload: inout CapturePayload,
        alongside target: URL
    ) throws {
        guard !payload.mediaAttachments.isEmpty else { return }
        let dir = target.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        // The relative path under the root that the scheme handler will
        // append. Derived from the anchor — matches what `anchorTarget`
        // produces, just expressed as a forward-slash path string.
        let rootID = payload.anchor.rootID
        let subPathSegments = mediaSubPathSegments(for: payload.anchor)

        // Map of tmpId → final loom://content/... URL, used for body
        // substitution after every blob is written successfully.
        var substitutions: [String: String] = [:]

        for attachment in payload.mediaAttachments {
            let trimmedTmp = attachment.tmpId.trimmingCharacters(in: .whitespacesAndNewlines)
            let trimmedB64 = attachment.base64.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedTmp.isEmpty, !trimmedB64.isEmpty else { continue }
            // Tolerate `data:<mime>;base64,<...>` if the extension ever
            // ships the data URL form by mistake — strip the prefix.
            let raw: String = {
                if let comma = trimmedB64.range(of: ","),
                   trimmedB64[..<comma.lowerBound].contains("base64") {
                    return String(trimmedB64[comma.upperBound...])
                }
                return trimmedB64
            }()
            guard let bytes = Data(base64Encoded: raw, options: [.ignoreUnknownCharacters]) else {
                NSLog("Media decode failed for tmpId=\(trimmedTmp) (mime=\(attachment.mime))")
                continue
            }
            let stableID = makeMediaStableID()
            let filename = "Loom-media-\(stableID).\(attachment.fileExtension(for: bytes))"
            let fileURL = dir.appendingPathComponent(filename)
            do {
                try bytes.write(to: fileURL, options: [.atomic])
            } catch {
                NSLog("Media write failed for tmpId=\(trimmedTmp): \(error.localizedDescription)")
                continue
            }
            // Build the loom://content/... URL the scheme handler can
            // serve. Path components must be percent-encoded so domain
            // strings like `news.ycombinator.com` survive any future
            // tightening of URL handling.
            var pathParts: [String] = [rootID.uuidString.lowercased()]
            pathParts.append(contentsOf: subPathSegments.map(percentEncodePathSegment))
            pathParts.append(filename)
            let urlPath = pathParts.joined(separator: "/")
            substitutions[trimmedTmp] = "loom://content/\(urlPath)"
        }

        guard !substitutions.isEmpty else { return }
        // Apply substitutions to the body. Both freeform and AI-thread
        // shapes can carry media references (e.g. canvas screenshots
        // pasted into a thread turn).
        switch payload.body {
        case .freeform(let text):
            payload.body = .freeform(applyMediaSubstitutions(text, map: substitutions))
        case .aiThread(let turns):
            payload.body = .aiThread(turns.map { turn in
                var copy = turn
                copy.text = applyMediaSubstitutions(turn.text, map: substitutions)
                return copy
            })
        }
        payload.captureAST = applyMediaSubstitutions(to: payload.captureAST, map: substitutions)
    }

    /// Forward-slash path segments under the root for a given anchor.
    /// Mirrors the directory structure that `anchorTarget` resolves to:
    ///   - `.inbox`            → ["sub", "Inbox"]
    ///   - `.page` (sub=…)     → ["sub", segs…]
    ///   - `.page` (sub="")    → []  (root-level Loom.md)
    ///   - `.passage`          → ["sub", segs…]
    ///   - `.web`              → ["sub", "Web", <safe domain>]
    private static func mediaSubPathSegments(for anchor: CaptureAnchor) -> [String] {
        switch anchor {
        case .inbox:
            return ["sub", "Inbox"]
        case .page(_, let sub, _), .passage(_, let sub, _, _, _, _, _):
            let trimmed = sub.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            if trimmed.isEmpty { return [] }
            return ["sub"] + trimmed.split(separator: "/").map(String.init)
        case .web(_, _, let domain, _, _):
            let safe = domain
                .lowercased()
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: ":", with: "_")
            return ["sub", "Web", safe]
        }
    }

    /// 12-character lower-case alphanumeric nonce. Stripped of dashes
    /// from `UUID().uuidString` and lowercased; first 12 chars give us
    /// 60 bits of entropy — vastly more than enough for per-capture
    /// uniqueness.
    private static func makeMediaStableID() -> String {
        let raw = UUID().uuidString
            .replacingOccurrences(of: "-", with: "")
            .lowercased()
        return String(raw.prefix(12))
    }

    /// Replace every `loom://media/<tmpId>` occurrence in `body` with
    /// the corresponding URL from `map`. Uses literal string replace so
    /// we don't have to worry about regex escaping for tmpIds that
    /// contain regex meta-characters.
    private static func applyMediaSubstitutions(_ body: String, map: [String: String]) -> String {
        var out = body
        for (tmpId, finalURL) in map {
            out = out.replacingOccurrences(
                of: "loom://media/\(tmpId)",
                with: finalURL
            )
        }
        return out
    }

    private static func applyMediaSubstitutions(
        to ast: CaptureAST?,
        map: [String: String]
    ) -> CaptureAST? {
        guard var ast else { return nil }
        ast.sourceURL = ast.sourceURL.map { applyMediaSubstitutions($0, map: map) }
        ast.title = ast.title.map { applyMediaSubstitutions($0, map: map) }
        ast.blocks = ast.blocks?.map { block in
            var copy = block
            if let text = copy.text {
                copy.text = applyMediaSubstitutions(text, map: map)
            }
            if let markdown = copy.markdown {
                copy.markdown = applyMediaSubstitutions(markdown, map: map)
            }
            if let url = copy.url {
                copy.url = applyMediaSubstitutions(url, map: map)
            }
            if let title = copy.title {
                copy.title = applyMediaSubstitutions(title, map: map)
            }
            return copy
        }
        return ast
    }

    private static func writeCaptureAST(
        payload: inout CapturePayload,
        alongside target: URL
    ) throws {
        guard let ast = payload.captureAST else { return }
        let dir = target.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let ts = formatter.string(from: payload.capturedAt)
        let nonce = makeMediaStableID()
        let filename = "Loom-capture-ast-\(ts)-\(nonce).json"
        let fileURL = dir.appendingPathComponent(filename)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(ast)
        try data.write(to: fileURL, options: [.atomic])
        payload.captureASTFilename = filename
    }

    /// Percent-encode a single path segment for `loom://content/...`
    /// URLs. Keeps the segment safe for hosts/paths with spaces or
    /// punctuation. Uses `urlPathAllowed` (which keeps `/`) but we
    /// pass a single segment so there's no `/` in the input.
    private static func percentEncodePathSegment(_ segment: String) -> String {
        // urlPathAllowed permits `/`; since segments here are atomic
        // we use a stricter set that rejects `/` to avoid accidental
        // segment merging.
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        return segment.addingPercentEncoding(withAllowedCharacters: allowed) ?? segment
    }

    /// Writes the snapshot HTML to a `Loom-snapshot-<timestamp>.html`
    /// file in the same directory as the per-domain Loom.md. Filename
    /// includes seconds + a 4-char nonce so re-captures within the
    /// same minute don't collide. Returns the snapshot URL.
    @discardableResult
    private static func writeSnapshotHTML(
        _ html: String,
        payload: CapturePayload,
        alongside target: URL
    ) throws -> URL {
        let dir = target.deletingLastPathComponent()
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let ts = formatter.string(from: payload.capturedAt)
        // 4-char alpha-num nonce — enough collision avoidance for
        // human-paced re-captures (≤1/sec).
        let nonce = String(UUID().uuidString.prefix(4)).lowercased()
        let filename = "Loom-snapshot-\(ts)-\(nonce).html"
        let url = dir.appendingPathComponent(filename)
        try html.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    /// Flatten the payload's body into a single string for embedding
    /// + similarity queries. Threads concatenate turns separated by
    /// blank lines so the embedding sees a coherent passage rather
    /// than a single user message.
    static func bodyText(_ payload: CapturePayload) -> String {
        switch payload.body {
        case .freeform(let s):
            return s
        case .aiThread(let turns):
            return turns.map { $0.text }.joined(separator: "\n\n")
        }
    }

    private static func anchorTarget(for anchor: CaptureAnchor) -> URL {
        switch anchor {
        case .inbox(let id, _):
            return LoomFileStore.inboxURL(for: id)
        case .page(let id, let sub, _):
            return LoomFileStore.loomMDURL(for: id, subPath: sub)
        case .passage(let id, let sub, _, _, _, _, _):
            return LoomFileStore.loomMDURL(for: id, subPath: sub)
        case .web(let id, _, let domain, _, _):
            // Domain pre-clustering — a single safe path segment per
            // host (slashes / colons stripped). All web captures from
            // the same domain land in one Loom.md file.
            let safe = domain
                .lowercased()
                .replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: ":", with: "_")
            return LoomFileStore.loomMDURL(for: id, subPath: "Web/\(safe)")
        }
    }

    private static func renderEntry(_ payload: CapturePayload) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        let timestamp = formatter.string(from: payload.capturedAt)

        let title = payload.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let header = title.isEmpty ? defaultHeader(for: payload, timestamp: timestamp) : title

        // Eyebrow: align with existing Loom.md notes that read
        // `*p.N · timestamp*` for passage anchors, augmented with
        // capture-source + optional model + permalink.
        var attribution: [String] = []
        if case .passage(_, _, _, _, let pageIndex, _, _) = payload.anchor {
            attribution.append("p.\(pageIndex + 1)")
        }
        attribution.append(payload.source.label)
        if let provider = payload.detectedProvider, !provider.isEmpty {
            attribution.append(provider)
        }
        if let model = payload.model, !model.isEmpty {
            attribution.append(model)
        }
        attribution.append(timestamp)
        var eyebrow = "*" + attribution.joined(separator: " · ")
        if let url = payload.sourceURL, !url.isEmpty {
            eyebrow += " · [↗](\(url))"
        }
        eyebrow += "*"

        var body = "### \(header)\n"
        body += eyebrow + "\n\n"
        if let diagnosticsComment = captureDiagnosticsComment(payload.webDiagnostics) {
            body += diagnosticsComment + "\n\n"
        }
        if let captureASTComment = captureASTSidecarComment(payload.captureASTFilename) {
            body += captureASTComment + "\n\n"
        }

        if case .passage(_, _, let fileLabel, let fileLoomURL, let pageIndex, let rect, let text) = payload.anchor {
            let truncated = truncate(text, to: passageQuoteLimit)
            body += "From **\(fileLabel)** · p.\(pageIndex + 1):\n"
            for line in truncated.split(separator: "\n", omittingEmptySubsequences: false) {
                body += "> \(line)\n"
            }
            body += "\n"
            // Jump-back link — mirrors the format `SourceFileView` uses
            // for its own notes so the renderer's existing handler
            // works without changes.
            body += "[📍 Jump to passage](\(jumpURL(fileLoomURL: fileLoomURL, page: pageIndex, rect: rect, text: text)))\n\n"
        }

        if case .web(_, _, _, let url, let title) = payload.anchor, !url.isEmpty {
            // Web-source citation: title (if any) + permalink. Renders
            // as a clickable link in the markdown viewer; gives the
            // captured note an unambiguous origin.
            let display = title.isEmpty ? url : title
            body += "From [\(display)](\(url))\n\n"
        }

        switch payload.body {
        case .freeform(let text):
            body += text.trimmingCharacters(in: .whitespacesAndNewlines)
            body += "\n"
        case .aiThread(let turns):
            for turn in turns {
                body += "**\(turn.role.label):** \(turn.text)\n\n"
            }
        }
        return body
    }

    private static func captureDiagnosticsComment(_ diagnostics: CaptureExtensionDiagnostics?) -> String? {
        guard let json = diagnostics?.compactCommentJSON else { return nil }
        return "<!-- loom-capture-diagnostics: \(json) -->"
    }

    private static func captureASTSidecarComment(_ filename: String?) -> String? {
        guard let filename,
              filename.hasPrefix("Loom-capture-ast-"),
              filename.hasSuffix(".json"),
              !filename.contains("/") else {
            return nil
        }
        return "<!-- loom-capture-ast: \(filename) -->"
    }

    private static func defaultHeader(for payload: CapturePayload, timestamp: String) -> String {
        switch payload.anchor {
        case .passage(_, _, let fileLabel, _, _, _, _):
            return "Note on \(fileLabel)"
        case .page(_, _, let label):
            return "Capture · \(label)"
        case .inbox:
            return "Capture · \(timestamp)"
        case .web(_, _, _, _, let title):
            return title.isEmpty ? "Web capture · \(timestamp)" : title
        }
    }

    private static func truncate(_ text: String, to limit: Int) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= limit { return trimmed }
        let cutoff = trimmed.index(trimmed.startIndex, offsetBy: limit)
        return String(trimmed[..<cutoff]) + "…"
    }

    /// Construct a `loom://anchor?src=…&page=N&rect=…&text=…` URL
    /// that mirrors the format `SourceFileView.anchorURL(for:)`
    /// produces, so jump-back works through the existing handler.
    private static func jumpURL(fileLoomURL: URL, page: Int, rect: CGRect, text: String) -> String {
        let src = fileLoomURL.absoluteString
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? fileLoomURL.absoluteString
        let rectStr = String(format: "%.1f,%.1f,%.1f,%.1f", rect.minX, rect.minY, rect.width, rect.height)
        let excerpt = String(text.prefix(80))
        let textComp = excerpt
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? excerpt
        return "loom://anchor?src=\(src)&page=\(page)&rect=\(rectStr)&text=\(textComp)"
    }

    /// Detect a near-identical capture already in the file. Compares
    /// the rendered body's content fingerprint (anchor file + first
    /// 200 chars of body) against the most recent entry; if it's
    /// within `dedupWindowSeconds`, returns the existing timestamp.
    private static func detectDuplicate(payload: CapturePayload, in existing: String) -> String? {
        guard !existing.isEmpty else { return nil }
        let fingerprint = bodyFingerprint(payload: payload)
        // Inspect the last `### …` entry only — accidental repeats
        // are by definition the freshest write.
        let lines = existing.components(separatedBy: "\n")
        var entry: [String] = []
        for line in lines.reversed() {
            entry.insert(line, at: 0)
            if line.hasPrefix("### ") { break }
        }
        let entryText = entry.joined(separator: "\n")
        guard !entryText.isEmpty else { return nil }
        // Pull the eyebrow timestamp (`*… · 2026-04-27 02:15*`).
        guard let tsMatch = try? NSRegularExpression(pattern: #"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}"#),
              let m = tsMatch.firstMatch(in: entryText, range: NSRange(location: 0, length: (entryText as NSString).length))
        else { return nil }
        let ts = (entryText as NSString).substring(with: m.range)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        guard let parsed = formatter.date(from: ts) else { return nil }
        if abs(payload.capturedAt.timeIntervalSince(parsed)) > dedupWindowSeconds { return nil }
        // Body must overlap.
        let existingFP = simpleFingerprint(of: entryText)
        return fingerprint == existingFP || existingFP.contains(fingerprint) ? ts : nil
    }

    private static func bodyFingerprint(payload: CapturePayload) -> String {
        switch payload.body {
        case .freeform(let s):
            return simpleFingerprint(of: s)
        case .aiThread(let turns):
            return simpleFingerprint(of: turns.map { $0.text }.joined(separator: " "))
        }
    }
    private static func simpleFingerprint(of text: String) -> String {
        let collapsed = text
            .lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        return String(collapsed.prefix(200))
    }

    /// Append `entry` to the source under `## Notes`. Creates the
    /// heading on first save. Mirrors the existing append-under-notes
    /// helper used by `SourceFileView` so Inbox / page Loom.md
    /// renders consistently.
    private static func appendUnderNotes(entry: String, to source: String) -> String {
        var working = source
        if !working.contains("## Notes") {
            if !working.isEmpty && !working.hasSuffix("\n\n") {
                working += working.hasSuffix("\n") ? "\n" : "\n\n"
            }
            working += "## Notes\n\n"
        } else if !working.hasSuffix("\n\n") {
            working += working.hasSuffix("\n") ? "\n" : "\n\n"
        }
        working += entry
        if !working.hasSuffix("\n") { working += "\n" }
        return working
    }
}

// MARK: Anchor resolution helpers

/// Builds the anchor list for a given context. The first entry is the
/// recommended default (selection > page > inbox). Always includes
/// Inbox as a fallback so the user can defer routing.
enum CaptureAnchorResolver {
    /// From a `loom://content/<rootID>/<sub-path>/<file>` URL plus an
    /// optional PDF selection. Used by `SourceFileView`.
    static func resolveForSourceFile(
        loomURL: URL,
        selection: (pageIndex: Int, rect: CGRect, text: String)?
    ) -> [CaptureAnchor] {
        guard loomURL.scheme == "loom",
              loomURL.host == "content",
              let parsed = parseLoomContentPath(loomURL)
        else {
            return inboxOnly()
        }
        let (rootID, segments) = parsed
        let rootLabel = rootDisplayName(for: rootID)
        let fileLabel = segments.last ?? rootLabel
        let folderSub = segments.dropLast().joined(separator: "/")
        let folderLabel = segments.dropLast().last ?? rootLabel

        var anchors: [CaptureAnchor] = []
        if let sel = selection, !sel.text.isEmpty {
            anchors.append(.passage(
                rootID: rootID, subPath: folderSub, fileLabel: fileLabel,
                fileLoomURL: loomURL,
                pageIndex: sel.pageIndex, rect: sel.rect, text: sel.text
            ))
        }
        anchors.append(.page(rootID: rootID, subPath: folderSub, label: folderLabel))
        anchors.append(.inbox(rootID: rootID, rootLabel: rootLabel))
        return anchors
    }

    /// From a `.folderHome(URL)` selection in `LoomMinimalRootView`.
    /// Used by ⌘⇧L when the active surface is a folder page.
    static func resolveForFolderHome(loomURL: URL) -> [CaptureAnchor] {
        guard loomURL.scheme == "loom",
              loomURL.host == "content",
              let parsed = parseLoomContentPath(loomURL)
        else {
            return inboxOnly()
        }
        let (rootID, segments) = parsed
        let rootLabel = rootDisplayName(for: rootID)
        let folderSub = segments.joined(separator: "/")
        let folderLabel = segments.last ?? rootLabel
        var anchors: [CaptureAnchor] = []
        anchors.append(.page(rootID: rootID, subPath: folderSub, label: folderLabel))
        anchors.append(.inbox(rootID: rootID, rootLabel: rootLabel))
        return anchors
    }

    /// Library / no-active-page fallback. Inbox of the first active
    /// root is the only target. Returns empty when no root exists yet.
    static func resolveDefault() -> [CaptureAnchor] {
        return inboxOnly()
    }

    /// Phase A3 — anchor list for a web-bookmarklet capture. The
    /// per-domain `Web/<domain>` is the recommended primary anchor
    /// (so domains pre-cluster naturally for Phase B's similarity
    /// surface). Inbox is offered as a secondary "I'll triage later"
    /// option. We don't propose the current page / selection as
    /// anchors here — the user came from a browser, not from inside
    /// Loom; the browser tab is the authoritative context.
    static let lastWebCaptureRootDefaultsKey = "loom.capture.web.last-root-id"

    static func resolveForWebCapture(
        _ payload: CaptureWebPayload,
        preferredRootID: UUID? = nil,
        defaults: UserDefaults = .standard
    ) -> [CaptureAnchor] {
        guard let rootID = webCaptureRootID(preferredRootID: preferredRootID, defaults: defaults) else {
            return []
        }
        let label = rootDisplayName(for: rootID)
        let webAnchor = CaptureAnchor.web(
            rootID: rootID,
            rootLabel: label,
            domain: payload.domain,
            sourceURL: payload.url,
            title: payload.title
        )
        return [
            webAnchor,
            .inbox(rootID: rootID, rootLabel: label),
        ]
    }

    static func rememberWebCaptureRoot(_ id: UUID, defaults: UserDefaults = .standard) {
        defaults.set(id.uuidString.lowercased(), forKey: lastWebCaptureRootDefaultsKey)
    }

    static func lastWebCaptureRootID(defaults: UserDefaults = .standard) -> UUID? {
        guard let raw = defaults.string(forKey: lastWebCaptureRootDefaultsKey) else { return nil }
        return UUID(uuidString: raw)
    }

    private static func webCaptureRootID(
        preferredRootID: UUID?,
        defaults: UserDefaults
    ) -> UUID? {
        let roots = ContentRootStore.loadAll()
        let ids = roots.map(\.id)
        let idSet = Set(ids)
        if let preferredRootID, idSet.contains(preferredRootID) {
            return preferredRootID
        }
        if let last = lastWebCaptureRootID(defaults: defaults), idSet.contains(last) {
            return last
        }
        return ids.first
    }

    private static func inboxOnly() -> [CaptureAnchor] {
        guard let firstID = ContentRootStore.loadAll().first?.id else { return [] }
        let label = rootDisplayName(for: firstID)
        return [.inbox(rootID: firstID, rootLabel: label)]
    }
    private static func parseLoomContentPath(_ url: URL) -> (UUID, [String])? {
        let segs = url.path
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            .split(separator: "/").map(String.init)
        guard let first = segs.first, let uuid = UUID(uuidString: first) else { return nil }
        let decoded = segs.dropFirst().map { $0.removingPercentEncoding ?? $0 }
        return (uuid, decoded)
    }
    private static func rootDisplayName(for id: UUID) -> String {
        ContentRootStore.loadAll().first(where: { $0.id == id })?.displayName ?? "Workspace"
    }
}

// MARK: Review sheet UI

/// The review surface shared by ⌘⇧L (quick capture) and ⌘⇧V (AI paste).
/// The user sees the parsed turns / freeform body, can edit anything,
/// pick an anchor, retitle, and Save / Discard. Save flows through
/// `CaptureWriter` → `LoomFileStore`. No external folder writes.
struct CaptureSheet: View {
    @Binding var payload: CapturePayload?
    var onSaved: (URL) -> Void = { _ in }

    @State private var saveError: String? = nil
    @State private var duplicateWarning: String? = nil
    @State private var showRawPaste: Bool = false
    @State private var similarHits: [LoomEmbeddingStore.SimilarHit] = []
    @State private var similarQueryDone: Bool = false
    @FocusState private var titleFocused: Bool

    // Reader / Edit dual-mode for the body editor (Phase A3 follow-up,
    // 2026-04-27). When the capture came from a clipboard or web
    // bookmarklet, default to Reader mode so the user can scan + trim
    // by clicking individual paragraphs instead of hand-deleting in
    // a TextEditor. Edit mode is the escape hatch for surgical fixes.
    enum BodyEditMode: String, CaseIterable, Identifiable {
        case reader, edit
        var id: String { rawValue }
        var label: String { self == .reader ? "Reader" : "Edit raw" }
        var icon: String { self == .reader ? "text.justify" : "pencil.line" }
    }
    @State private var bodyEditMode: BodyEditMode = .edit
    /// Per-paragraph state when in Reader mode. Each row carries the
    /// text + a `kept` flag that the user toggles by clicking. Save
    /// flattens kept paragraphs back into the freeform body. Empty
    /// when the body isn't paragraph-shaped (manual / single-line
    /// captures stay in Edit mode and never populate this).
    struct ParagraphState: Identifiable, Hashable {
        let id = UUID()
        var text: String
        var kept: Bool
    }
    @State private var paragraphs: [ParagraphState] = []

    var body: some View {
        if let payload = payload {
            content(for: payload)
                .frame(minWidth: 560, idealWidth: 680, minHeight: 480, idealHeight: 580, maxHeight: 720)
                .onAppear {
                    saveError = nil
                    duplicateWarning = nil
                    showRawPaste = false
                    similarHits = []
                    similarQueryDone = false
                    if payload.title.isEmpty {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
                            titleFocused = true
                        }
                    }
                    runSimilarityQuery(payload)
                    // Reader mode default for clipboard / web captures
                    // (where there's an originalPaste) AND the body is
                    // paragraph-shaped freeform. Manual / AI-thread
                    // captures keep Edit mode (single-line freeforms
                    // and turn editors don't benefit from Reader).
                    if case .freeform(let text) = payload.body,
                       payload.originalPaste != nil,
                       text.split(separator: "\n").count > 2 {
                        bodyEditMode = .reader
                        paragraphs = Self.splitIntoParagraphs(
                            text,
                            keepAllByDefault: payload.shouldPreserveWebCaptureStructure
                        )
                    } else {
                        bodyEditMode = .edit
                        paragraphs = []
                    }
                }
        } else {
            EmptyView()
        }
    }

    @ViewBuilder
    private func content(for current: CapturePayload) -> some View {
        let binding = Binding<CapturePayload>(
            get: { payload ?? current },
            set: { payload = $0 }
        )
        // Body inside a ScrollView, footer pinned. Without this, when
        // the captured body is long the sheet grows past the window
        // height and Save button gets clipped off-screen.
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    header(binding)
                    anchorRow(binding)
                    if case .passage = binding.wrappedValue.anchor {
                        passagePreview(binding)
                    }
                    if let notes = binding.wrappedValue.parserNotes {
                        parserNotesPill(notes, binding: binding)
                    }
                    if let snap = binding.wrappedValue.snapshotHtml,
                       !snap.isEmpty {
                        snapshotChip(snap)
                    }
                    if !similarHits.isEmpty {
                        similarMatchesPanel(binding)
                    }
                    Divider()
                    bodyEditor(binding)
                    if binding.wrappedValue.originalPaste != nil {
                        rawPasteDisclosure(binding)
                    }
                }
                .padding(DSSpace.md.value)
            }
            Divider()
            footer(binding)
                .padding(DSSpace.md.value)
        }
    }

    @ViewBuilder
    private func header(_ binding: Binding<CapturePayload>) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(binding.wrappedValue.source == .aiPaste ? "Capture AI thread" : "Capture")
                .font(.system(size: 18, weight: .semibold, design: .serif))
            Spacer()
            Text(timestampString(binding.wrappedValue.capturedAt))
                .font(.system(size: 10, design: .monospaced))
                .foregroundStyle(LoomTokens.dsInk2)
            Button("Cancel") { payload = nil }
                .keyboardShortcut(.cancelAction)
                .help("Discard this capture without saving · Esc")
        }
        TextField("Title (optional)", text: binding.title)
            .font(.system(size: 14, design: .serif))
            .textFieldStyle(.plain)
            .focused($titleFocused)
    }

    @ViewBuilder
    private func anchorRow(_ binding: Binding<CapturePayload>) -> some View {
        let anchors = binding.wrappedValue.availableAnchors
        if anchors.isEmpty {
            Text("No active workspace — open a folder first to enable Inbox.")
                .font(.system(size: 11, design: .serif))
                .foregroundStyle(LoomTokens.dsInk2)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text("Anchor")
                        .font(.system(size: 10, design: .serif).smallCaps())
                        .foregroundStyle(LoomTokens.dsInk2)
                    if anchors.count <= 3 {
                        // Compact button strip for the common case.
                        ForEach(anchors) { a in
                            Button {
                                binding.wrappedValue.anchor = a
                            } label: {
                                Text(a.label)
                                    .font(.system(size: 11, design: .serif))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(
                                        Capsule().fill(
                                            binding.wrappedValue.anchor.id == a.id
                                                ? LoomTokens.dsThread.opacity(0.18)
                                                : LoomTokens.dsHairFaint
                                        )
                                    )
                                    .overlay(
                                        Capsule().stroke(
                                            binding.wrappedValue.anchor.id == a.id
                                                ? LoomTokens.dsThread.opacity(0.45)
                                                : LoomTokens.dsHair,
                                            lineWidth: 1
                                        )
                                    )
                            }
                            .buttonStyle(.plain)
                        }
                    } else {
                        Picker("", selection: Binding<String>(
                            get: { binding.wrappedValue.anchor.id },
                            set: { newID in
                                if let chosen = anchors.first(where: { $0.id == newID }) {
                                    binding.wrappedValue.anchor = chosen
                                }
                            }
                        )) {
                            ForEach(anchors) { a in
                                Text(a.label).tag(a.id)
                            }
                        }
                        .pickerStyle(.menu)
                        .labelsHidden()
                        .fixedSize()
                    }
                    Spacer(minLength: 0)
                }
                Text("→ \(binding.wrappedValue.anchor.pathHint)")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(LoomTokens.dsInk3)
                if let url = binding.wrappedValue.sourceURL, !url.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "link")
                            .font(.system(size: 9))
                            .foregroundStyle(LoomTokens.dsInk2)
                        Text(url)
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(LoomTokens.dsInk2)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func passagePreview(_ binding: Binding<CapturePayload>) -> some View {
        if case .passage(_, _, let fileLabel, _, let pageIndex, _, let text) = binding.wrappedValue.anchor {
            VStack(alignment: .leading, spacing: 4) {
                Text("Anchored to \(fileLabel) · p.\(pageIndex + 1)")
                    .font(.system(size: 10, design: .serif).smallCaps())
                    .foregroundStyle(LoomTokens.dsInk2)
                Text(passagePreviewText(text))
                    .font(.system(size: 11, design: .serif))
                    .italic()
                    .foregroundStyle(LoomTokens.dsInk2)
                    .padding(DSSpace.sm.value)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: DSRadius.sm.value)
                            .fill(LoomTokens.dsHairFaint)
                    )
                    .overlay(
                        Rectangle()
                            .fill(LoomTokens.dsThread.opacity(0.4))
                            .frame(width: 2),
                        alignment: .leading
                    )
            }
        }
    }

    private func passagePreviewText(_ text: String) -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.count <= 200 { return trimmed }
        let cutoff = trimmed.index(trimmed.startIndex, offsetBy: 200)
        return String(trimmed[..<cutoff]) + "…"
    }

    /// Phase D — small chip near the eyebrow row indicating that a
    /// snapshot HTML payload accompanies this capture. Shows size in
    /// KB so the user knows whether the design fidelity passes the
    /// "is this big enough to be useful" gut check.
    @ViewBuilder
    private func snapshotChip(_ html: String) -> some View {
        let kb = max(1, html.utf8.count / 1024)
        HStack(spacing: 6) {
            Image(systemName: "rectangle.on.rectangle.angled")
                .font(.system(size: 9))
                .foregroundStyle(LoomTokens.dsInk3)
            Text("Snapshot mode · \(kb) KB")
                .font(.system(size: 10, design: .serif))
                .foregroundStyle(LoomTokens.dsInk2)
            Spacer(minLength: 0)
            Text("Will save Loom-snapshot-*.html")
                .font(.system(size: 9, design: .serif))
                .italic()
                .foregroundStyle(LoomTokens.dsInk3)
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.sm.value)
                .fill(LoomTokens.dsThread.opacity(0.06))
                .overlay(
                    RoundedRectangle(cornerRadius: DSRadius.sm.value)
                        .stroke(LoomTokens.dsThread.opacity(0.2), lineWidth: 0.5)
                )
        )
    }

    private func parserNotesPill(_ notes: String, binding: Binding<CapturePayload>) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "sparkles")
                .font(.system(size: 9))
                .foregroundStyle(LoomTokens.dsInk3)
            Text(notes)
                .font(.system(size: 10, design: .serif))
                .foregroundStyle(LoomTokens.dsInk2)
            Spacer(minLength: 0)
            if binding.wrappedValue.originalPaste != nil {
                Button("Re-parse") {
                    if let reparsed = binding.wrappedValue.reparsedFromOriginal() {
                        binding.wrappedValue = reparsed
                    }
                }
                .font(.system(size: 10, design: .serif))
                .buttonStyle(.plain)
                .foregroundStyle(LoomTokens.dsThread)
            }
        }
    }

    @ViewBuilder
    private func rawPasteDisclosure(_ binding: Binding<CapturePayload>) -> some View {
        DisclosureGroup(isExpanded: $showRawPaste) {
            ScrollView {
                Text(binding.wrappedValue.originalPaste ?? "")
                    .font(.system(size: 10, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
                    .padding(DSSpace.sm.value)
            }
            .frame(maxHeight: 140)
            .background(
                RoundedRectangle(cornerRadius: DSRadius.sm.value)
                    .fill(LoomTokens.dsHairFaint)
            )
            HStack(spacing: 6) {
                Button("Use raw paste as freeform body") {
                    if let raw = binding.wrappedValue.originalPaste {
                        binding.wrappedValue.body = .freeform(raw)
                        binding.wrappedValue.parserNotes = "switched to raw paste"
                    }
                }
                .font(.system(size: 10, design: .serif))
                .buttonStyle(.plain)
                .foregroundStyle(LoomTokens.dsThread)
                Spacer(minLength: 0)
            }
        } label: {
            Text("Show raw paste")
                .font(.system(size: 10, design: .serif).smallCaps())
                .foregroundStyle(LoomTokens.dsInk2)
        }
    }

    private func timestampString(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.string(from: date)
    }

    /// Phase B — query the local embedding store for previously
    /// captured entries similar to this one. Async hop keeps sheet
    /// responsive; results render via the `similarMatchesPanel`.
    private func runSimilarityQuery(_ payload: CapturePayload) {
        let body = CaptureWriter.bodyText(payload).trimmingCharacters(in: .whitespacesAndNewlines)
        guard body.count >= 24 else {
            similarQueryDone = true
            return
        }
        let rootID = payload.anchor.rootID
        DispatchQueue.global(qos: .userInitiated).async {
            let hits = LoomEmbeddingStore.similar(to: body, in: rootID)
            DispatchQueue.main.async {
                similarHits = hits
                similarQueryDone = true
            }
        }
    }

    // MARK: Reader / Edit dual-mode body

    /// Mode picker rendered above the body editor. Switching to Edit
    /// flushes the kept paragraphs back into the freeform string;
    /// switching back to Reader re-parses the (possibly user-edited)
    /// freeform string into paragraphs with default-kept = true.
    @ViewBuilder
    private func bodyModeSwitcher(
        binding: Binding<CapturePayload>,
        textBinding: Binding<String>
    ) -> some View {
        HStack(spacing: 6) {
            Text("Body")
                .font(.system(size: 10, design: .serif).smallCaps())
                .foregroundStyle(LoomTokens.dsInk2)
            ForEach(BodyEditMode.allCases) { mode in
                Button {
                    if mode == bodyEditMode { return }
                    if mode == .edit {
                        // Flush kept paragraphs into freeform body.
                        textBinding.wrappedValue = paragraphs
                            .filter { $0.kept }
                            .map { $0.text }
                            .joined(separator: "\n\n")
                    } else {
                        // Re-parse current text into paragraphs.
                        paragraphs = Self.splitIntoParagraphs(
                            textBinding.wrappedValue,
                            keepAllByDefault: binding.wrappedValue.shouldPreserveWebCaptureStructure
                        )
                    }
                    bodyEditMode = mode
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: mode.icon).font(.system(size: 9))
                        Text(mode.label)
                            .font(.system(size: 10, design: .serif))
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(
                        Capsule().fill(
                            bodyEditMode == mode
                                ? LoomTokens.dsThread.opacity(0.18)
                                : LoomTokens.dsHairFaint
                        )
                    )
                    .overlay(
                        Capsule().stroke(
                            bodyEditMode == mode
                                ? LoomTokens.dsThread.opacity(0.4)
                                : LoomTokens.dsHair,
                            lineWidth: 1
                        )
                    )
                }
                .buttonStyle(.plain)
            }
            if bodyEditMode == .reader {
                let keptCount = paragraphs.filter { $0.kept }.count
                Text("\(keptCount) / \(paragraphs.count) paragraphs kept")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(LoomTokens.dsInk3)
                Spacer(minLength: 0)
                Button {
                    paragraphs = Self.splitIntoParagraphs(
                        paragraphs.map { $0.text }.joined(separator: "\n\n"),
                        keepAllByDefault: binding.wrappedValue.shouldPreserveWebCaptureStructure
                    )
                } label: {
                    Text("Reset trim")
                        .font(.system(size: 10, design: .serif))
                }
                .buttonStyle(.plain)
                .foregroundStyle(LoomTokens.dsInk2)
                Button {
                    paragraphs = paragraphs.map { var p = $0; p.kept = true; return p }
                } label: {
                    Text("Keep all")
                        .font(.system(size: 10, design: .serif))
                }
                .buttonStyle(.plain)
                .foregroundStyle(LoomTokens.dsInk2)
            } else {
                Spacer(minLength: 0)
            }
        }
    }

    /// Reader view: each paragraph as a clickable card. Kept = full
    /// color, dropped = grayed + struck-through (still visible so
    /// undo is one click). Auto-pre-drops likely chrome (≤ 4 words,
    /// short all-caps fragments, repeated lines).
    @ViewBuilder
    private func readerModeBody() -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(paragraphs.enumerated()), id: \.element.id) { idx, p in
                    Button {
                        paragraphs[idx].kept.toggle()
                    } label: {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: p.kept ? "checkmark.circle.fill" : "circle.dashed")
                                .font(.system(size: 11))
                                .foregroundStyle(p.kept ? LoomTokens.dsThread : LoomTokens.dsInk2)
                                .padding(.top, 3)
                            Text(p.text)
                                .font(.system(size: 13, design: .serif))
                                .foregroundStyle(p.kept ? Color.primary : LoomTokens.dsInk2)
                                .strikethrough(!p.kept, color: LoomTokens.dsInk2)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .multilineTextAlignment(.leading)
                                .textSelection(.enabled)
                        }
                        .padding(DSSpace.sm.value)
                        .background(
                            RoundedRectangle(cornerRadius: DSRadius.sm.value)
                                .fill(LoomTokens.dsHairFaint)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: DSRadius.sm.value)
                                .stroke(
                                    p.kept ? LoomTokens.dsHair : LoomTokens.dsHairFaint,
                                    lineWidth: 1
                                )
                        )
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 4)
        }
        .frame(minHeight: 280, maxHeight: 480)
    }

    /// Split a freeform text body into reader paragraphs. Splits on
    /// blank lines (≥1 empty line between blocks). Each paragraph
    /// gets a `kept` flag computed by `isLikelyChrome`, with fenced
    /// code protected so reader trim never drops closing fences or
    /// short code lines. Whitespace-only paragraphs are dropped from
    /// the array entirely.
    static func splitIntoParagraphs(_ text: String, keepAllByDefault: Bool = false) -> [ParagraphState] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
        let chunks = normalized.components(separatedBy: "\n\n")
        var seenCounts: [String: Int] = [:]
        var isInsideCodeFence = false
        let trimmedChunks: [String] = chunks
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return trimmedChunks.map { chunk in
            // Repeated chunk = boilerplate (cookie banner, footer).
            // Only the FIRST occurrence is kept; later duplicates drop.
            let seenCount = seenCounts[chunk] ?? 0
            seenCounts[chunk] = seenCount + 1
            let isDuplicate = seenCount > 0

            let wasInsideCodeFence = isInsideCodeFence
            let containsCodeFence = containsMarkdownCodeFence(chunk)
            if hasOddMarkdownCodeFenceCount(chunk) {
                isInsideCodeFence.toggle()
            }
            let protectedByCodeFence = wasInsideCodeFence || isInsideCodeFence || containsCodeFence
            let kept = keepAllByDefault || protectedByCodeFence || (!isLikelyChrome(chunk) && !isDuplicate)
            return ParagraphState(text: chunk, kept: kept)
        }
    }

    /// Heuristic: return true when `chunk` smells like page chrome
    /// (nav links, button labels, sidebar widgets). Run AFTER trim.
    /// False positives just mean the user clicks once to keep it.
    /// False negatives leak chrome into the saved capture.
    ///
    /// Markdown-aware exemptions (added 2026-05-01) — these structural
    /// elements carry the document's information architecture and must
    /// never auto-drop, even when they are short:
    ///   • Heading lines (`# ...` / `## ...` / etc.)
    ///   • Horizontal rules (`---` / `***` / `___`)
    ///   • Multi-line lists containing markdown links (`[text](url)`),
    ///     e.g. an Inspiration / Reference / See-also list
    /// Without these exemptions, the auto-drop heuristic was hiding
    /// every heading and link-list from saved captures (per user report
    /// 2026-05-01 + peer-chat msg-029/032).
    static func isLikelyChrome(_ chunk: String) -> Bool {
        let trimmed = chunk.trimmingCharacters(in: .whitespacesAndNewlines)
        let lines = chunk.split(separator: "\n")
        // Markdown structural elements: heading lines start with `#`.
        if trimmed.hasPrefix("#") { return false }
        // Markdown horizontal rules.
        if trimmed == "---" || trimmed == "***" || trimmed == "___" { return false }
        // Markdown lists containing inline links — ANY line with the
        // `[text](url)` pattern means this chunk is structural content
        // (a list of references), not nav chrome.
        let hasMarkdownLink = lines.contains { line in
            String(line).range(of: #"\[[^\]]+\]\([^)]+\)"#, options: .regularExpression) != nil
        }
        if hasMarkdownLink { return false }
        let words = chunk.split { $0.isWhitespace }
        // Very short: ≤ 4 words → menu / button label.
        if words.count <= 4 { return !isTechnicalShortContent(chunk) }
        // Many lines, each tiny: nav menu rendered as a list.
        if lines.count >= 3 && lines.allSatisfy({ $0.split { $0.isWhitespace }.count <= 3 }) {
            return true
        }
        return false
    }

    static func isTechnicalShortContent(_ chunk: String) -> Bool {
        let trimmed = chunk.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowercased = trimmed.lowercased()
        if lowercased.hasPrefix("npm install ") { return true }
        if lowercased.contains("documentation") { return true }
        if trimmed.contains("```") { return true }
        if trimmed.contains("(") && trimmed.contains(")") { return true }
        if trimmed.contains("=") || trimmed.contains(";") || trimmed.contains("{") || trimmed.contains("}") {
            return true
        }
        return false
    }

    static func containsMarkdownCodeFence(_ chunk: String) -> Bool {
        chunk.split(separator: "\n", omittingEmptySubsequences: false).contains { line in
            line.trimmingCharacters(in: .whitespaces).hasPrefix("```")
        }
    }

    static func hasOddMarkdownCodeFenceCount(_ chunk: String) -> Bool {
        let count = chunk.split(separator: "\n", omittingEmptySubsequences: false).filter { line in
            line.trimmingCharacters(in: .whitespaces).hasPrefix("```")
        }.count
        return count % 2 == 1
    }

    @ViewBuilder
    private func similarMatchesPanel(_ binding: Binding<CapturePayload>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: "link.circle")
                    .font(.system(size: 10))
                    .foregroundStyle(LoomTokens.dsInk2)
                Text("类似既有捕获 · \(similarHits.count)")
                    .font(.system(size: 10, design: .serif).smallCaps())
                    .foregroundStyle(LoomTokens.dsInk2)
                Spacer(minLength: 0)
            }
            ForEach(similarHits) { hit in
                Button {
                    NSWorkspace.shared.open(URL(fileURLWithPath: hit.record.targetPath))
                } label: {
                    HStack(alignment: .top, spacing: 8) {
                        Text("\(Int(hit.similarity * 100))%")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(LoomTokens.dsThread)
                            .frame(width: 36, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(hit.record.anchorLabel)
                                .font(.system(size: 11, design: .serif))
                                .foregroundStyle(.primary)
                            Text(hit.record.snippet)
                                .font(.system(size: 10, design: .serif))
                                .italic()
                                .foregroundStyle(LoomTokens.dsInk2)
                                .lineLimit(2)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 4)
                    .padding(.horizontal, 6)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .background(
                    RoundedRectangle(cornerRadius: DSRadius.sm.value)
                        .fill(LoomTokens.dsHairFaint)
                )
            }
        }
        .padding(DSSpace.sm.value)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.sm.value)
                .fill(LoomTokens.dsThread.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DSRadius.sm.value)
                .stroke(LoomTokens.dsThread.opacity(0.2), lineWidth: 1)
        )
    }

    @ViewBuilder
    private func bodyEditor(_ binding: Binding<CapturePayload>) -> some View {
        switch binding.wrappedValue.body {
        case .freeform:
            let textBinding = Binding<String>(
                get: {
                    if case .freeform(let s) = binding.wrappedValue.body { return s }
                    return ""
                },
                set: { binding.wrappedValue.body = .freeform($0) }
            )
            VStack(alignment: .leading, spacing: 6) {
                if !paragraphs.isEmpty {
                    bodyModeSwitcher(binding: binding, textBinding: textBinding)
                }
                if bodyEditMode == .reader && !paragraphs.isEmpty {
                    readerModeBody()
                } else {
                    TextEditor(text: textBinding)
                        .font(.system(size: 13, design: .serif))
                        .frame(minHeight: 220, maxHeight: 480)
                        .overlay(
                            RoundedRectangle(cornerRadius: DSRadius.sm.value)
                                .stroke(LoomTokens.dsHair, lineWidth: 1)
                        )
                }
            }
        case .aiThread(let turns):
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(turns.indices, id: \.self) { i in
                        turnRow(binding, index: i)
                    }
                    Button {
                        appendBlankTurn(binding)
                    } label: {
                        Label("Add turn", systemImage: "plus.circle")
                            .font(.system(size: 11, design: .serif))
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(LoomTokens.dsInk2)
                }
                .padding(2)
            }
            .frame(minHeight: 260)
        }
    }

    @ViewBuilder
    private func turnRow(_ binding: Binding<CapturePayload>, index: Int) -> some View {
        if case .aiThread(let turns) = binding.wrappedValue.body, index < turns.count {
            let turn = turns[index]
            let roleBinding = Binding<CaptureTurn.Role>(
                get: { turn.role },
                set: { newRole in
                    var t = turns
                    t[index].role = newRole
                    binding.wrappedValue.body = .aiThread(t)
                }
            )
            let textBinding = Binding<String>(
                get: { turn.text },
                set: { newText in
                    var t = turns
                    t[index].text = newText
                    binding.wrappedValue.body = .aiThread(t)
                }
            )
            HStack(alignment: .top, spacing: 8) {
                Picker("", selection: roleBinding) {
                    ForEach(CaptureTurn.Role.allCases) { role in
                        Text(role.label).tag(role)
                    }
                }
                .labelsHidden()
                .pickerStyle(.segmented)
                .fixedSize()
                TextEditor(text: textBinding)
                    .font(.system(size: 13, design: .serif))
                    .frame(minHeight: 60)
                    .overlay(
                        RoundedRectangle(cornerRadius: DSRadius.sm.value)
                            .stroke(LoomTokens.dsHair, lineWidth: 1)
                    )
                Button {
                    var t = turns
                    t.remove(at: index)
                    binding.wrappedValue.body = .aiThread(t)
                } label: {
                    Image(systemName: "xmark.circle")
                        .foregroundStyle(LoomTokens.dsInk2)
                }
                .buttonStyle(.plain)
                .help("Remove this turn")
            }
        }
    }

    private func appendBlankTurn(_ binding: Binding<CapturePayload>) {
        if case .aiThread(var turns) = binding.wrappedValue.body {
            let nextRole: CaptureTurn.Role = turns.last?.role == .user ? .ai : .user
            turns.append(CaptureTurn(role: nextRole, text: ""))
            binding.wrappedValue.body = .aiThread(turns)
        }
    }

    @ViewBuilder
    private func footer(_ binding: Binding<CapturePayload>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let dup = duplicateWarning {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(LoomTokens.dsWarning)
                        .font(.system(size: 11))
                    Text(dup)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(.primary)
                    Spacer(minLength: 0)
                    Button("Save anyway") { commit(binding.wrappedValue, force: true) }
                        .font(.system(size: 11, design: .serif))
                }
                .padding(DSSpace.sm.value)
                .background(
                    RoundedRectangle(cornerRadius: DSRadius.sm.value).fill(LoomTokens.dsWarning.opacity(0.12))
                )
            } else if let err = saveError {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "xmark.octagon.fill")
                        .foregroundStyle(LoomTokens.dsAlert)
                        .font(.system(size: 11))
                    Text(err)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(.primary)
                    Spacer(minLength: 0)
                }
                .padding(DSSpace.sm.value)
                .background(
                    RoundedRectangle(cornerRadius: DSRadius.sm.value).fill(LoomTokens.dsAlert.opacity(0.10))
                )
            }
            HStack {
                Spacer()
                Button("Cancel") { payload = nil }
                    .keyboardShortcut(.cancelAction)
                    .help("Discard this capture without saving · Esc")
                Button("Save") { commit(binding.wrappedValue, force: false) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(!isCommittable(binding.wrappedValue))
            }
        }
    }

    private func isCommittable(_ p: CapturePayload) -> Bool {
        if p.availableAnchors.isEmpty { return false }
        // Reader-mode trim: at least one paragraph must be kept.
        if bodyEditMode == .reader && !paragraphs.isEmpty {
            return paragraphs.contains(where: {
                $0.kept && !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            })
        }
        switch p.body {
        case .freeform(let s):
            return !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .aiThread(let turns):
            return turns.contains(where: { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
        }
    }

    private func commit(_ p: CapturePayload, force: Bool) {
        var toSave = p
        // Reader-mode trim: flush kept paragraphs into freeform body
        // before write. Edit mode already has the canonical text in
        // the binding so no flush needed.
        if bodyEditMode == .reader && !paragraphs.isEmpty {
            let merged = paragraphs.filter { $0.kept }.map { $0.text }.joined(separator: "\n\n")
            toSave.body = .freeform(merged)
        }
        do {
            let url = try CaptureWriter.save(toSave, force: force)
            if case .web(let rootID, _, _, _, _) = toSave.anchor {
                CaptureAnchorResolver.rememberWebCaptureRoot(rootID)
            } else if case .inbox(let rootID, _) = toSave.anchor, toSave.sourceURL != nil {
                CaptureAnchorResolver.rememberWebCaptureRoot(rootID)
            }
            payload = nil
            saveError = nil
            duplicateWarning = nil
            onSaved(url)
        } catch CaptureWriter.Failure.duplicate(let ts) {
            duplicateWarning = "Looks like the same capture was saved at \(ts). Save anyway?"
            saveError = nil
        } catch {
            saveError = error.localizedDescription
            duplicateWarning = nil
            NSLog("Capture write failed: \(error.localizedDescription)")
        }
    }
}
