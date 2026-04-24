import SwiftUI
import UniformTypeIdentifiers
import PDFKit

/// Native port of `components/IngestionOverlay.tsx` → Phase 4 overlay #2.
///
/// User drops .md / .mdx / .txt files into the window; each is summarised
/// by the configured AI provider and persisted as a `LoomTrace` of kind
/// `"ingestion"` whose first event is the AI's summary. Already-ingested
/// files surface as a history list below the drop zone.
///
/// Scope limits (same as the web MVP per research):
///   - Plain text only (.md / .mdx / .txt / .markdown)
///   - ≤ 200 KB per file
///   - One AI call per file (no chunking)
///   - No PDF / DOCX / ZIP / image handling
struct IngestionView: View {
    @StateObject private var runner = IngestionRunner()
    @State private var isDragging = false
    @State private var urlText: String = ""
    @FocusState private var urlFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            dropZone
            vellumHairline
            urlBar
            vellumHairline
            history
        }
        .background(LoomTokens.paper)
        .frame(minWidth: 480, idealWidth: 560, minHeight: 440)
        .task { await runner.reload() }
        .onAppear {
            // Pick up any files the main window's .onDrop handler stashed
            // for us — auto-ingest so a drop-anywhere flow completes
            // without the user having to also re-drop inside this window.
            let pending = IngestionContext.shared.consume()
            for url in pending { runner.ingest(fileURL: url) }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomTraceChanged)) { _ in
            Task { await runner.reload() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomIngestFileDropped)) { _ in
            let pending = IngestionContext.shared.consume()
            for url in pending { runner.ingest(fileURL: url) }
        }
    }

    @ViewBuilder
    private var dropZone: some View {
        VStack(spacing: 8) {
            Image(systemName: "square.and.arrow.down")
                .font(.system(size: 32, weight: .light))
                .foregroundStyle(isDragging ? LoomTokens.thread : LoomTokens.muted)
            Text(isDragging ? "Drop to summarise" : "Drop .md / .txt / .pdf / .docx / .rtf")
                .font(LoomTokens.serif(size: 15, italic: true))
                .foregroundStyle(LoomTokens.ink)
            Text("PDFKit extracts PDF · NSAttributedString reads DOCX/RTF · 200 KB cap")
                .font(LoomTokens.sans(size: 10))
                .foregroundStyle(LoomTokens.muted)
            HStack(spacing: 6) {
                Button("Pick a file…") { pickFile() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(LoomTokens.thread)
                Button("Paste text") { pasteClipboardText() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(LoomTokens.thread)
                    .help("Ingest whatever plain text is on your clipboard")
            }
            .padding(.top, 6)
            if !runner.inFlight.isEmpty {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(runner.inFlight) { job in
                        HStack(spacing: 6) {
                            if job.status == .failed {
                                Image(systemName: "exclamationmark.triangle")
                                    .foregroundStyle(LoomTokens.rose)
                            } else {
                                ProgressView().controlSize(.mini)
                            }
                            Text(job.filename)
                                .font(LoomTokens.mono(size: 11))
                                .foregroundStyle(LoomTokens.ink2)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            if job.status != .failed {
                                Text(job.label)
                                    .font(LoomTokens.sans(size: 10))
                                    .foregroundStyle(LoomTokens.muted)
                            }
                            if let err = job.error {
                                Text("· \(err)")
                                    .font(LoomTokens.sans(size: 10))
                                    .foregroundStyle(LoomTokens.rose)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(
                    isDragging ? LoomTokens.thread : LoomTokens.hair,
                    style: StrokeStyle(lineWidth: 1.5, dash: [6, 4])
                )
                .padding(16)
        )
        .background(
            (isDragging ? LoomTokens.thread.opacity(0.06) : Color.clear)
                .padding(16)
        )
        .onDrop(of: [.fileURL], isTargeted: $isDragging) { providers in
            handleDrop(providers)
            return true
        }
    }

    /// Hairline in the Vellum border tone — used instead of the system
    /// Divider so the Ingestion surface matches the web `--loom-hair`.
    @ViewBuilder
    private var vellumHairline: some View {
        LoomTokens.hair.frame(height: 0.5)
    }

    @ViewBuilder
    private var urlBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "link")
                .foregroundStyle(LoomTokens.muted)
                .font(.system(size: 12))
            TextField("Or paste a URL to summarise…", text: $urlText)
                .textFieldStyle(.plain)
                .font(LoomTokens.serif(size: 13))
                .foregroundStyle(LoomTokens.ink)
                .focused($urlFocused)
                .onSubmit(submitURL)
                .autocorrectionDisabled()
            Button("Ingest") { submitURL() }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(LoomTokens.thread)
                .disabled(!isValidURL(urlText))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    private func isValidURL(_ s: String) -> Bool {
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return false }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }

    private func submitURL() {
        let trimmed = urlText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isValidURL(trimmed), let url = URL(string: trimmed) else { return }
        runner.ingest(remoteURL: url)
        urlText = ""
    }

    @ViewBuilder
    private var history: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("INGESTED")
                        .font(.system(size: 10, weight: .medium))
                        .kerning(1.8)
                        .foregroundStyle(LoomTokens.muted)
                    Spacer()
                    if !runner.ingested.isEmpty {
                        Text("\(runner.ingested.count)")
                            .font(LoomTokens.mono(size: 10))
                            .foregroundStyle(LoomTokens.muted)
                    }
                }
                if runner.ingested.isEmpty {
                    Text("Nothing ingested yet.")
                        .font(LoomTokens.serif(size: 12, italic: true))
                        .foregroundStyle(LoomTokens.muted)
                } else {
                    ForEach(runner.ingested) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 6) {
                                Image(systemName: "doc.text")
                                    .foregroundStyle(LoomTokens.thread)
                                    .font(.system(size: 10))
                                Text(item.filename)
                                    .font(LoomTokens.serif(size: 12, weight: .medium))
                                    .foregroundStyle(LoomTokens.ink)
                                Spacer()
                                Text(relativeDate(item.at))
                                    .font(LoomTokens.mono(size: 10))
                                    .foregroundStyle(LoomTokens.muted)
                            }
                            Text(item.summary)
                                .font(LoomTokens.serif(size: 12))
                                .foregroundStyle(LoomTokens.ink2)
                                .lineLimit(4)
                                .textSelection(.enabled)
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 6)
                                .fill(LoomTokens.hairFaint)
                        )
                    }
                }
            }
            .padding(16)
        }
        .scrollContentBackground(.hidden)
        .background(LoomTokens.paper)
    }

    /// Read plain text from the pasteboard, wrap it as a synthetic
    /// `.txt` file in a temp dir, and run it through the same ingest
    /// pipeline. Useful when the source isn't a file — e.g. an article
    /// copied from a browser, a chunk of chat, or meeting notes.
    private func pasteClipboardText() {
        guard let text = NSPasteboard.general.string(forType: .string) else {
            NSSound.beep()
            return
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            NSSound.beep()
            return
        }
        let tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("loom-ingestion", isDirectory: true)
        try? FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        let stamp = Int(Date().timeIntervalSince1970)
        let tmpFile = tmpDir.appendingPathComponent("clipboard-\(stamp).txt")
        do {
            try trimmed.write(to: tmpFile, atomically: true, encoding: .utf8)
            runner.ingest(fileURL: tmpFile)
        } catch {
            NSSound.beep()
        }
    }

    private func pickFile() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = true
        panel.prompt = "Ingest"
        panel.title = "Pick files to summarise"
        var types: [UTType] = [.plainText, .text, .utf8PlainText, .pdf, .rtf]
        if let md = UTType(filenameExtension: "md") { types.append(md) }
        if let mdx = UTType(filenameExtension: "mdx") { types.append(mdx) }
        if let mk = UTType(filenameExtension: "markdown") { types.append(mk) }
        if let docx = UTType(filenameExtension: "docx") { types.append(docx) }
        if let doc = UTType(filenameExtension: "doc") { types.append(doc) }
        if let rtfd = UTType(filenameExtension: "rtfd") { types.append(rtfd) }
        panel.allowedContentTypes = types
        guard panel.runModal() == .OK else { return }
        for url in panel.urls {
            runner.ingest(fileURL: url)
        }
    }

    private func handleDrop(_ providers: [NSItemProvider]) {
        for provider in providers {
            _ = provider.loadObject(ofClass: URL.self) { url, _ in
                guard let url else { return }
                Task { @MainActor in
                    runner.ingest(fileURL: url)
                }
            }
        }
    }

    private func relativeDate(_ timestampMs: Double) -> String {
        let date = Date(timeIntervalSince1970: timestampMs / 1000)
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

enum IngestionWindow {
    static let id = "com.loom.window.ingestion"
}

/// Main-window drops route through here so the Ingestion window can
/// auto-ingest on appear without a bridge hop. Singleton; consumed once.
@MainActor
final class IngestionContext: ObservableObject {
    static let shared = IngestionContext()
    @Published var pendingFileURLs: [URL] = []

    func consume() -> [URL] {
        let urls = pendingFileURLs
        pendingFileURLs = []
        return urls
    }
}

@MainActor
final class IngestionRunner: ObservableObject {
    struct IngestJob: Identifiable, Equatable {
        enum Status { case fetching, extracting, summarising, failed }
        let id: String
        let filename: String
        var status: Status
        var error: String?

        var label: String {
            switch status {
            case .fetching: return "fetching…"
            case .extracting: return "extracting…"
            case .summarising: return "summarising…"
            case .failed: return error ?? "failed"
            }
        }
    }

    struct IngestedItem: Identifiable, Equatable {
        let id: String
        let filename: String
        let summary: String
        let at: Double
    }

    @Published private(set) var inFlight: [IngestJob] = []
    @Published private(set) var ingested: [IngestedItem] = []

    private static let maxBytes = 200_000

    /// Remote-URL ingest: fetches the page via URLSession, strips HTML
    /// via NSAttributedString, runs the same AI summary pipeline, and
    /// persists as a trace of kind `"ingestion"` with `sourceHref` set
    /// to the URL so the user can click through to the original.
    func ingest(remoteURL url: URL) {
        let jobID = UUID().uuidString
        let filename = url.host.map { "\($0)\(url.path)" } ?? url.absoluteString
        inFlight.append(IngestJob(id: jobID, filename: filename, status: .fetching))

        Task { @MainActor in
            do {
                let text = try await fetchAndStrip(url: url)
                if let idx = inFlight.firstIndex(where: { $0.id == jobID }) {
                    inFlight[idx].status = .summarising
                }
                let summary = try await summarise(text: text, filename: filename)
                let trace = try LoomTraceWriter.createTrace(
                    kind: "ingestion",
                    sourceDocId: "ingested-url:\(url.absoluteString)",
                    sourceTitle: filename,
                    sourceHref: url.absoluteString,
                    initialEvents: [[
                        "kind": "thought-anchor",
                        "blockId": "loom-ingestion-root",
                        "content": text,
                        "summary": summary,
                        "sourceURL": url.absoluteString,
                        "at": Date().timeIntervalSince1970 * 1000,
                    ]]
                )
                _ = try LoomTraceWriter.updateSummary(traceId: trace.id, summary: summary)
                inFlight.removeAll { $0.id == jobID }
                await reload()
            } catch {
                if let idx = inFlight.firstIndex(where: { $0.id == jobID }) {
                    inFlight[idx].status = .failed
                    inFlight[idx].error = describe(error)
                }
            }
        }
    }

    private func fetchAndStrip(url: URL) async throws -> String {
        var request = URLRequest(url: url)
        request.timeoutInterval = 20
        request.addValue(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Loom/1.0",
            forHTTPHeaderField: "User-Agent"
        )
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw IngestError.unreadable
        }
        guard data.count <= 4_000_000 else { throw IngestError.tooLarge }
        // Strip HTML via NSAttributedString — same approach as DOCX/RTF
        // path, keeps the codebase uniform. Falls back to raw UTF-8 text
        // if the page isn't HTML (e.g. .txt served over HTTP).
        let attributed: NSAttributedString
        if let a = try? NSAttributedString(
            data: data,
            options: [.documentType: NSAttributedString.DocumentType.html],
            documentAttributes: nil
        ) {
            attributed = a
        } else if let raw = String(data: data, encoding: .utf8) {
            attributed = NSAttributedString(string: raw)
        } else {
            throw IngestError.notUtf8
        }
        let text = attributed.string
            .replacingOccurrences(of: "\n\\s*\n\\s*\n+", with: "\n\n", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw IngestError.empty }
        if text.utf8.count > Self.maxBytes {
            let utf8Data = text.data(using: .utf8) ?? Data()
            let clipped = utf8Data.prefix(Self.maxBytes)
            if let s = String(data: clipped, encoding: .utf8) { return s }
        }
        return text
    }

    func ingest(fileURL: URL) {
        let jobID = UUID().uuidString
        let filename = fileURL.lastPathComponent
        inFlight.append(IngestJob(id: jobID, filename: filename, status: .extracting))

        Task { @MainActor in
            do {
                guard let text = try readPlainText(url: fileURL) else {
                    throw IngestError.unreadable
                }
                let summary = try await summarise(text: text, filename: filename)
                let trace = try LoomTraceWriter.createTrace(
                    kind: "ingestion",
                    sourceDocId: "ingested:\(filename)",
                    sourceTitle: filename,
                    sourceHref: fileURL.absoluteString,
                    initialEvents: [[
                        "kind": "thought-anchor",
                        "blockId": "loom-ingestion-root",
                        "content": text,
                        "summary": summary,
                        "at": Date().timeIntervalSince1970 * 1000,
                    ]]
                )
                _ = try LoomTraceWriter.updateSummary(traceId: trace.id, summary: summary)
                inFlight.removeAll { $0.id == jobID }
                await reload()
            } catch {
                if let idx = inFlight.firstIndex(where: { $0.id == jobID }) {
                    inFlight[idx].status = .failed
                    inFlight[idx].error = describe(error)
                }
            }
        }
    }

    func reload() async {
        do {
            let traces = try LoomTraceWriter.traces(ofKind: "ingestion")
            ingested = traces.map { trace in
                IngestedItem(
                    id: trace.id,
                    filename: trace.sourceTitle ?? "(unknown)",
                    summary: trace.currentSummary.isEmpty ? "(no summary)" : trace.currentSummary,
                    at: trace.updatedAt
                )
            }
        } catch {
            ingested = []
        }
    }

    // MARK: - Helpers

    private func readPlainText(url: URL) throws -> String? {
        let ext = url.pathExtension.lowercased()
        if ext == "pdf" {
            return try extractPDFText(url: url)
        }
        if ext == "docx" || ext == "doc" || ext == "rtf" || ext == "rtfd" {
            // NSAttributedString loads Office Open XML (.docx), classic
            // Word (.doc), and RTF variants natively via Foundation —
            // no third-party library, sandbox-safe. `.string` strips
            // formatting to plain text ready for AI summarisation.
            return try extractAttributedString(url: url)
        }
        let data = try Data(contentsOf: url)
        guard data.count <= Self.maxBytes else { throw IngestError.tooLarge }
        guard let text = String(data: data, encoding: .utf8) else { throw IngestError.notUtf8 }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw IngestError.empty }
        return trimmed
    }

    /// Load Word / RTF files through `NSAttributedString`, then clip to
    /// the plaintext byte cap. Same size/empty contract as the plaintext
    /// path so the UI surface behaves uniformly.
    private func extractAttributedString(url: URL) throws -> String {
        let attributed = try NSAttributedString(
            url: url,
            options: [:],
            documentAttributes: nil
        )
        let trimmed = attributed.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw IngestError.empty }
        if trimmed.utf8.count > Self.maxBytes {
            let data = trimmed.data(using: .utf8) ?? Data()
            let clipped = data.prefix(Self.maxBytes)
            if let clippedText = String(data: clipped, encoding: .utf8) {
                return clippedText
            }
        }
        return trimmed
    }

    /// Extract cleaned plaintext from a PDF. Delegates to
    /// `PDFExtraction.extract()` which runs PDFKit + the Phase 2
    /// Node-parity `CleanText.apply()` pipeline so the Swift drop path
    /// produces the same cleaned output as the Node folder-scan path
    /// (plan §4 Phase 2).
    ///
    /// Page-range metadata is produced by `PDFExtraction` but not
    /// threaded through today — Phase 4 UI work is the consumer. Until
    /// then we just return `text`; the `ExtractedPDF` value is dropped
    /// on the floor.
    private func extractPDFText(url: URL) throws -> String {
        do {
            // Honor the existing 200 KB byte cap by asking `CleanText`
            // for an equivalent char cap. UTF-8 bytes ≥ chars, so a
            // char cap at `maxBytes` is a safe upper bound; the final
            // utf8 clip below enforces the exact byte limit.
            let extracted = try PDFExtraction.extract(url: url, maxChars: Self.maxBytes)
            let trimmed = extracted.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { throw IngestError.empty }
            if trimmed.utf8.count > Self.maxBytes {
                let data = trimmed.data(using: .utf8) ?? Data()
                let clipped = data.prefix(Self.maxBytes)
                if let clippedText = String(data: clipped, encoding: .utf8) {
                    return clippedText
                }
            }
            return trimmed
        } catch PDFExtractionError.unreadable {
            throw IngestError.unreadable
        } catch PDFExtractionError.empty {
            throw IngestError.empty
        }
    }

    private func summarise(text: String, filename: String) async throws -> String {
        // Phase 1 of the ingest-extractor refactor: consult
        // `ExtractorRegistry.bestMatch(...)` across registered typed
        // extractors, then dispatch.
        //
        // **Intentional caveat (plan §4, Phase 5):** auto-run of typed
        // extractors at ingest time is deferred. Until the Phase 5 UI
        // ("Extract" button) lands, this call path still dispatches to
        // `GenericDocExtractor` for the free-form summary the current
        // UI expects. Typed extractors like `SyllabusPDFExtractor` are
        // callable from Phase 5+ surfaces via their concrete types —
        // the registry is here so Phase 5 can flip the switch without
        // refactoring.
        //
        // See `Sources/Ingest/IngestExtractor.swift`,
        // `Sources/Ingest/ExtractorRegistry.swift`, and the per-file
        // extractor implementations.
        let sample = String(text.prefix(2048))
        let parentPath = "" // Reserved for Phase 3 — filename is enough for syllabus match.
        let chosen = ExtractorRegistry.bestMatch(
            filename: filename,
            parentPath: parentPath,
            sample: sample
        )
        // Log-only: surface which extractor would claim this file so
        // later debugging can spot mismatches.
        _ = chosen.extractorId

        let extractor = GenericDocExtractor()
        let result = try await extractor.extract(
            text: text,
            filename: filename,
            docId: "temp-\(UUID().uuidString)"
        )
        return result.rawOutput
    }

    private func describe(_ error: Error) -> String {
        if let ie = error as? IngestError { return ie.localizedDescription }
        return (error as? AnthropicClient.Failure)?.errorDescription
            ?? (error as? OpenAIClient.Failure)?.errorDescription
            ?? (error as? OllamaClient.Failure)?.errorDescription
            ?? (error as? CustomEndpointClient.Failure)?.errorDescription
            ?? (error as? CLIRuntimeClient.Failure)?.errorDescription
            ?? error.localizedDescription
    }
}

enum IngestError: LocalizedError {
    case tooLarge
    case notUtf8
    case empty
    case unreadable
    case aiDisabled

    var errorDescription: String? {
        switch self {
        case .tooLarge: return "File is larger than 200 KB."
        case .notUtf8: return "File isn't valid UTF-8 text."
        case .empty: return "File is empty."
        case .unreadable: return "Couldn't read file contents."
        case .aiDisabled: return "AI is disabled in Settings."
        }
    }
}
