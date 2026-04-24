import SwiftUI
import UniformTypeIdentifiers
import PDFKit

/// Native port of `components/IngestionOverlay.tsx` → Phase 4 overlay #2.
///
/// **Phase 5 flow (plan §4 Phase 5, this commit):** user drops /
/// pastes / picks a file. We extract plaintext synchronously, then
/// consult `ExtractorRegistry` and surface a FOUR-STATE state machine:
///
///   - `idle`           — nothing ingested; drop zone + history visible.
///   - `textExtracted`  — file read; preview + chosen extractor badge
///                        + declared field list + "Extract" button.
///                        AI has NOT yet been called.
///   - `extracting`     — user clicked Extract; subtle pulse indicator
///                        + cancel button; AI / deterministic extractor
///                        in flight.
///   - `extracted`      — typed schema ready; rendered via
///                        `IngestExtractorResultView` (Phase 4 surface).
///
/// Respects `feedback_loom_never_do#2`: no auto-run AI at ingest. The
/// opt-in gate is the default. Power users can flip the
/// `loom.ingest.autoRunExtraction` AppStorage flag (exposed via
/// AIProviderSettingsView) to skip the gate — opt-OUT for them, but the
/// default stays opt-IN.
///
/// Scope (reading plaintext):
///   - .md / .mdx / .txt / .markdown / .pdf / .docx / .rtf
///   - ≤ 200 KB per file
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
            // Active workbench (Phase 5 state machine). Hidden when
            // there's no pending file — keeps the default surface as
            // quiet as the pre-Phase-5 view.
            if runner.state != .idle {
                workbench
                vellumHairline
            }
            history
        }
        .background(LoomTokens.paper)
        .frame(minWidth: 520, idealWidth: 620, minHeight: 520)
        .task { await runner.reload() }
        .onAppear {
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
            Text(isDragging ? "Drop to read" : "Drop .md / .txt / .pdf / .docx / .rtf")
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

    // MARK: - Workbench (Phase 5 state surface)

    @ViewBuilder
    private var workbench: some View {
        switch runner.state {
        case .idle:
            EmptyView()
        case .textExtracted(let extracted):
            TextExtractedPane(
                extracted: extracted,
                onExtract: { runner.runExtraction() },
                onClose: { runner.skipExtractionAndClose() }
            )
        case .extracting(let extractorId):
            ExtractingPane(
                extractorId: extractorId,
                onCancel: { runner.cancelExtraction() }
            )
        case .extracted(let ready):
            ExtractedPane(
                result: ready.result,
                sourceText: ready.sourceText,
                coordinator: runner.scrollCoordinator,
                onDismiss: { runner.dismissExtracted() }
            )
        case .failed(let message):
            FailurePane(
                message: message,
                onDismiss: { runner.dismissFailure() }
            )
        }
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
                                if !item.extractorLabel.isEmpty {
                                    Text(item.extractorLabel)
                                        .font(LoomTokens.mono(size: 9))
                                        .foregroundStyle(LoomTokens.muted)
                                }
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
    /// pipeline.
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

// MARK: - IngestState (plan §4 Phase 5 deliverable A)

/// Context for the `textExtracted` state — everything the gate UI needs
/// to render (preview, match badge, declared fields) without re-running
/// the extractor match.
struct ExtractedText: Equatable {
    let fileURL: URL?
    /// Remote URL for web-fetched content; `nil` for local file drops.
    /// Mutually exclusive with `fileURL` in practice.
    let remoteURL: URL?
    let filename: String
    let plainText: String
    let charCount: Int
    let chosenExtractorId: String
    let chosenExtractorScore: Double
    let description: SchemaDescription
    /// When `chosenExtractorScore` is below the 0.7 threshold the gate
    /// routes to `GenericDocExtractor` instead of the typed winner.
    /// This surfaces in the badge so the user knows.
    let usedFallbackToGeneric: Bool
    let preview: String
    /// Page-offset table emitted by `PDFExtraction` for PDF sources;
    /// `nil` for non-PDF drops. When present, flows through to every
    /// extractor's `extract(...)` so `verifySpans` can derive
    /// `SourceSpan.pageNum` post-hoc (2026-04-24 tech-debt fix; see
    /// `plans/ingest-extractor-refactor.md` §10 open question 5).
    let pageRanges: [PageRange]?

    /// Effective source href used for persistence — file:// or https://.
    var sourceHref: String? {
        remoteURL?.absoluteString ?? fileURL?.absoluteString
    }

    /// Effective sourceDocId used for persistence — namespaces file vs
    /// URL so downstream traces can distinguish the two.
    var sourceDocId: String {
        if let remoteURL { return "ingested-url:\(remoteURL.absoluteString)" }
        return "ingested:\(filename)"
    }

    static func == (lhs: ExtractedText, rhs: ExtractedText) -> Bool {
        lhs.filename == rhs.filename
            && lhs.plainText == rhs.plainText
            && lhs.chosenExtractorId == rhs.chosenExtractorId
            && lhs.chosenExtractorScore == rhs.chosenExtractorScore
    }
}

/// Packaged `extracted` state: carries the concrete schema + the
/// source text + the extractor id for downstream persistence.
struct ExtractionReady: Equatable {
    let filename: String
    let sourceText: String
    let extractorId: String
    let result: IngestExtractorResultView.Schema

    static func == (lhs: ExtractionReady, rhs: ExtractionReady) -> Bool {
        lhs.filename == rhs.filename
            && lhs.extractorId == rhs.extractorId
    }
}

/// Four-state ingest state machine (plan §4 Phase 5 deliverable A).
enum IngestState: Equatable {
    case idle
    case textExtracted(ExtractedText)
    case extracting(extractorId: String)
    case extracted(ExtractionReady)
    case failed(String)

    static func == (lhs: IngestState, rhs: IngestState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.textExtracted(let a), .textExtracted(let b)): return a == b
        case (.extracting(let a), .extracting(let b)): return a == b
        case (.extracted(let a), .extracted(let b)): return a == b
        case (.failed(let a), .failed(let b)): return a == b
        default: return false
        }
    }
}

// MARK: - IngestionRunner

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
        let extractorLabel: String
        let at: Double
    }

    @Published private(set) var inFlight: [IngestJob] = []
    @Published private(set) var ingested: [IngestedItem] = []
    @Published var state: IngestState = .idle

    /// Shared coordinator: the source pane observes this; the
    /// `IngestExtractorResultView` calls `scroll(to:)` on quote tap.
    let scrollCoordinator = SourcePaneScrollCoordinator()

    /// Active extraction task so Cancel can tear it down.
    private var activeExtractionTask: Task<Void, Never>?

    private static let maxBytes = 200_000

    /// Opt-in gate escape hatch (plan §4 Phase 5 deliverable F).
    /// Default `false` — the gate is the DEFAULT per feedback_loom_never_do#2.
    /// Flip to `true` for power-user opt-out via Settings.
    private var autoRunExtraction: Bool {
        UserDefaults.standard.bool(forKey: "loom.ingest.autoRunExtraction")
    }

    /// Remote-URL ingest: fetches the page via URLSession, strips HTML
    /// via NSAttributedString, routes through the Phase 5 gate.
    func ingest(remoteURL url: URL) {
        let jobID = UUID().uuidString
        let filename = url.host.map { "\($0)\(url.path)" } ?? url.absoluteString
        inFlight.append(IngestJob(id: jobID, filename: filename, status: .fetching))

        Task { @MainActor in
            do {
                let text = try await fetchAndStrip(url: url)
                if let idx = inFlight.firstIndex(where: { $0.id == jobID }) {
                    inFlight[idx].status = .extracting
                }
                enterTextExtracted(
                    fileURL: nil,
                    remoteURL: url,
                    filename: filename,
                    plainText: text,
                    pageRanges: nil
                )
                inFlight.removeAll { $0.id == jobID }
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
                guard let readResult = try readPlainText(url: fileURL) else {
                    throw IngestError.unreadable
                }
                enterTextExtracted(
                    fileURL: fileURL,
                    filename: filename,
                    plainText: readResult.text,
                    pageRanges: readResult.pageRanges
                )
                inFlight.removeAll { $0.id == jobID }
            } catch {
                if let idx = inFlight.firstIndex(where: { $0.id == jobID }) {
                    inFlight[idx].status = .failed
                    inFlight[idx].error = describe(error)
                }
            }
        }
    }

    // MARK: - State transitions

    /// Consult the registry, pick a winner (or Generic on low score),
    /// and enter `.textExtracted`. Honors the `autoRunExtraction` opt-out
    /// by auto-advancing into `.extracting` immediately.
    private func enterTextExtracted(
        fileURL: URL?,
        remoteURL: URL? = nil,
        filename: String,
        plainText: String,
        pageRanges: [PageRange]? = nil
    ) {
        let sample = String(plainText.prefix(2048))
        let parentPath = fileURL?.deletingLastPathComponent().lastPathComponent ?? ""
        let pick = ExtractorRegistry.bestMatchWithScore(
            filename: filename,
            parentPath: parentPath,
            sample: sample
        )

        // Apply the ≥0.7 threshold (plan §4 Phase 5 deliverable E). If
        // the typed winner's score is below the floor, fall back to
        // Generic so the user isn't promised fields that might miss.
        let effective: ExtractorRegistration
        let usedFallback: Bool
        if pick.score >= 0.7 {
            effective = pick.registration
            usedFallback = false
        } else {
            effective = ExtractorRegistry.byId(GenericDocExtractor.extractorId) ?? pick.registration
            usedFallback = true
        }

        let extracted = ExtractedText(
            fileURL: fileURL,
            remoteURL: remoteURL,
            filename: filename,
            plainText: plainText,
            charCount: plainText.count,
            chosenExtractorId: effective.extractorId,
            chosenExtractorScore: pick.score,
            description: effective.description,
            usedFallbackToGeneric: usedFallback,
            preview: String(plainText.prefix(500)),
            pageRanges: pageRanges
        )
        state = .textExtracted(extracted)

        // Opt-out path: when the user has explicitly enabled auto-run
        // in Settings, skip the gate. Default stays opt-in.
        if autoRunExtraction {
            runExtraction()
        }
    }

    /// Trigger the chosen extractor. Called by the Extract button in
    /// the `.textExtracted` surface.
    func runExtraction() {
        guard case .textExtracted(let extracted) = state else { return }
        // Resolve the registration we captured in the state.
        guard let registration = ExtractorRegistry.byId(extracted.chosenExtractorId) else {
            state = .failed("Unknown extractor: \(extracted.chosenExtractorId)")
            return
        }

        // AI-gate: if the extractor calls AI and the provider is
        // disabled, reject up front with a clear message. Matches the
        // gate's disabled Extract button, but defends against a state
        // drift where the button enables and then the provider flips.
        if extracted.description.callsAI && AIProviderKind.current == .disabled {
            state = .failed(IngestError.aiDisabled.localizedDescription)
            return
        }

        state = .extracting(extractorId: extracted.chosenExtractorId)

        let docId = "ingest:\(extracted.filename)-\(UUID().uuidString)"
        let sourceText = extracted.plainText
        let filename = extracted.filename
        let extractorId = extracted.chosenExtractorId
        let sourceDocId = extracted.sourceDocId
        let sourceHref = extracted.sourceHref
        let pageRanges = extracted.pageRanges

        activeExtractionTask?.cancel()
        activeExtractionTask = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let result = try await registration.run(sourceText, filename, docId, pageRanges)
                if Task.isCancelled { return }

                // Persist (plan §4 Phase 5 deliverable G).
                do {
                    try self.persistExtractedTrace(
                        sourceDocId: sourceDocId,
                        sourceHref: sourceHref,
                        filename: filename,
                        plainText: sourceText,
                        result: result
                    )
                } catch {
                    // Persistence failure shouldn't kill the UX — the
                    // extraction is still shown. Log + continue.
                    NSLog("[Loom] IngestionRunner persist failed: \(error)")
                }

                let schemaCase = Self.schemaCase(from: result)
                self.state = .extracted(ExtractionReady(
                    filename: filename,
                    sourceText: sourceText,
                    extractorId: extractorId,
                    result: schemaCase
                ))
                await self.reload()
            } catch {
                if Task.isCancelled { return }
                self.state = .failed(self.describe(error))
            }
        }
    }

    /// Close the `.textExtracted` surface WITHOUT running the AI.
    /// Saves a stub trace so the user can still find the file in
    /// history, but no schema / no AI call.
    func skipExtractionAndClose() {
        guard case .textExtracted(let extracted) = state else { return }
        do {
            try persistSkippedTrace(extracted: extracted)
        } catch {
            NSLog("[Loom] IngestionRunner persistSkipped failed: \(error)")
        }
        state = .idle
        Task { await reload() }
    }

    /// Tear down the in-flight extraction task and return to the
    /// `.textExtracted` state so the user can retry or close.
    func cancelExtraction() {
        activeExtractionTask?.cancel()
        activeExtractionTask = nil
        // Best-effort: recover the previous `.textExtracted` context
        // by redoing the match. The source text is still in memory via
        // the extracting id, but simpler — ask the user to re-drop.
        state = .idle
    }

    /// Dismiss the `.extracted` surface and return to `.idle`.
    func dismissExtracted() {
        state = .idle
    }

    /// Dismiss the `.failed` surface and return to `.idle`.
    func dismissFailure() {
        state = .idle
    }

    // MARK: - Persistence (plan §4 Phase 5 deliverable G)

    /// Write a `LoomTrace` for a completed typed extraction. Schema JSON
    /// is packed into `eventsJSON` (plan constraint: do NOT change
    /// LoomDataModel schema). `kind` carries the extractor id so
    /// downstream decoders can pick the right schema type.
    private func persistExtractedTrace(
        sourceDocId: String,
        sourceHref: String?,
        filename: String,
        plainText: String,
        result: AnyIngestResult
    ) throws {
        let extractorId = result.extractorId
        let isGeneric = extractorId == GenericDocExtractor.extractorId
        let kind = isGeneric ? "ingestion" : "ingestion-\(extractorId)"
        let summary = result.displaySummary
        let schemaJSON = try result.encodeJSON()

        var event: [String: Any] = [
            "kind": "thought-anchor",
            "blockId": "loom-ingestion-root",
            "content": plainText,
            "summary": summary,
            "extractorId": extractorId,
            "schemaJSON": schemaJSON,
            "at": Date().timeIntervalSince1970 * 1000,
        ]
        if let sourceHref {
            event["sourceURL"] = sourceHref
        }

        let trace = try LoomTraceWriter.createTrace(
            kind: kind,
            sourceDocId: sourceDocId,
            sourceTitle: filename,
            sourceHref: sourceHref,
            initialEvents: [event]
        )
        _ = try LoomTraceWriter.updateSummary(traceId: trace.id, summary: summary)
    }

    /// Write a stub trace when the user skipped AI via "Close". No
    /// schema, no summary — just the raw text so the file is not lost.
    private func persistSkippedTrace(extracted: ExtractedText) throws {
        let trace = try LoomTraceWriter.createTrace(
            kind: "ingestion",
            sourceDocId: extracted.sourceDocId,
            sourceTitle: extracted.filename,
            sourceHref: extracted.sourceHref,
            initialEvents: [[
                "kind": "thought-anchor",
                "blockId": "loom-ingestion-root",
                "content": extracted.plainText,
                "summary": "",
                "skippedAI": true,
                "at": Date().timeIntervalSince1970 * 1000,
            ]]
        )
        // No summary update — keep `currentSummary` empty so history
        // renders "(no summary)" rather than a truncated raw-text teaser.
        _ = trace
    }

    /// Map `AnyIngestResult` → `IngestExtractorResultView.Schema`. Kept
    /// as a tiny free function because the enum cases line up 1:1 but
    /// the types live in different modules conceptually.
    private static func schemaCase(
        from result: AnyIngestResult
    ) -> IngestExtractorResultView.Schema {
        switch result {
        case .syllabus(let s):       return .syllabus(s)
        case .transcript(let s):     return .transcript(s)
        case .textbook(let s):       return .textbook(s)
        case .slideDeck(let s):      return .slideDeck(s)
        case .markdownNotes(let s):  return .markdownNotes(s)
        case .spreadsheet(let s):    return .spreadsheet(s)
        case .generic(let s):        return .generic(s)
        }
    }

    func reload() async {
        do {
            var traces = try LoomTraceWriter.traces(ofKind: "ingestion")
            // Fold in every per-extractor kind so the history surface
            // shows typed extractions alongside the generic summary rows.
            for registration in ExtractorRegistry.all
            where registration.extractorId != GenericDocExtractor.extractorId {
                let kind = "ingestion-\(registration.extractorId)"
                let extra = try LoomTraceWriter.traces(ofKind: kind)
                traces.append(contentsOf: extra)
            }
            traces.sort { $0.updatedAt > $1.updatedAt }
            ingested = traces.map { trace in
                IngestedItem(
                    id: trace.id,
                    filename: trace.sourceTitle ?? "(unknown)",
                    summary: trace.currentSummary.isEmpty ? "(no summary)" : trace.currentSummary,
                    extractorLabel: Self.extractorLabel(fromTraceKind: trace.kind),
                    at: trace.updatedAt
                )
            }
        } catch {
            ingested = []
        }
    }

    /// Turn `"ingestion-syllabus-pdf"` → `"syllabus-pdf"` for the
    /// history row's extractor badge. Returns empty string for the
    /// generic `"ingestion"` kind so the badge just disappears.
    private static func extractorLabel(fromTraceKind kind: String) -> String {
        let prefix = "ingestion-"
        guard kind.hasPrefix(prefix) else { return "" }
        return String(kind.dropFirst(prefix.count))
    }

    // MARK: - Helpers

    /// Result of `readPlainText` — plain UTF-8 body plus optional
    /// page-offset table (PDF only).
    struct ReadResult {
        let text: String
        let pageRanges: [PageRange]?
    }

    private func readPlainText(url: URL) throws -> ReadResult? {
        let ext = url.pathExtension.lowercased()
        if ext == "pdf" {
            return try extractPDFText(url: url)
        }
        if ext == "docx" || ext == "doc" || ext == "rtf" || ext == "rtfd" {
            let text = try extractAttributedString(url: url)
            return ReadResult(text: text, pageRanges: nil)
        }
        let data = try Data(contentsOf: url)
        guard data.count <= Self.maxBytes else { throw IngestError.tooLarge }
        guard let text = String(data: data, encoding: .utf8) else { throw IngestError.notUtf8 }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw IngestError.empty }
        return ReadResult(text: trimmed, pageRanges: nil)
    }

    /// Load Word / RTF files through `NSAttributedString`, then clip to
    /// the plaintext byte cap.
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

    /// Extract cleaned plaintext + page-offset table from a PDF via
    /// `PDFExtraction`. `pageRanges` is threaded downstream so every
    /// typed extractor's `verifySpans` call can derive `pageNum` for
    /// emitted spans (2026-04-24 gap-fill; plan §10 open question 5).
    ///
    /// Trimming / clipping whitespace off the head of `text` WOULD
    /// invalidate the pageRange offsets (they're computed against the
    /// pre-trim cleaned output). We only trim in the rare case the
    /// PDF produced an entirely empty body, which also blows out the
    /// extraction as an error. In normal operation `extracted.text`
    /// and `ranges` stay co-indexed.
    private func extractPDFText(url: URL) throws -> ReadResult {
        do {
            let extracted = try PDFExtraction.extract(url: url, maxChars: Self.maxBytes)
            let body = extracted.text
            let trimmedCheck = body.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedCheck.isEmpty else { throw IngestError.empty }

            // Clip to maxBytes only if needed. Clipping invalidates
            // ranges past the clip point; we discard any PageRange
            // entirely past the clip so pageNum lookups don't read out
            // of bounds. Rare path in practice (PDFExtraction already
            // enforces its own maxChars).
            if body.utf8.count > Self.maxBytes {
                let data = body.data(using: .utf8) ?? Data()
                let clipped = data.prefix(Self.maxBytes)
                if let clippedText = String(data: clipped, encoding: .utf8) {
                    let clippedLen = clippedText.utf16.count
                    let clippedRanges = extracted.pageRanges.compactMap { r -> PageRange? in
                        guard r.charStart < clippedLen else { return nil }
                        let end = min(r.charEnd, clippedLen)
                        return PageRange(page: r.page, charStart: r.charStart, charEnd: end)
                    }
                    return ReadResult(text: clippedText, pageRanges: clippedRanges)
                }
            }
            return ReadResult(text: body, pageRanges: extracted.pageRanges)
        } catch PDFExtractionError.unreadable {
            throw IngestError.unreadable
        } catch PDFExtractionError.empty {
            throw IngestError.empty
        }
    }

    /// Phase 0 compatibility shim (plan §4 Phase 5 constraint): preserve
    /// `summarise(text:filename:) async throws -> String` so any callers
    /// outside IngestionView that still depend on the old signature keep
    /// compiling. Dispatches ONLY to `GenericDocExtractor` — it does not
    /// go through the Phase 5 gate / state machine. New call sites
    /// should prefer `ingest(fileURL:)` / `ingest(remoteURL:)` which
    /// handle the full opt-in flow.
    @available(*, deprecated, message: "Use ingest(fileURL:) / ingest(remoteURL:) which go through the Phase 5 opt-in gate. This shim is retained for pre-refactor call sites.")
    func summarise(text: String, filename: String) async throws -> String {
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

// MARK: - Phase 5 state panes

/// `.textExtracted` state — the opt-in gate. Shows preview + chosen
/// extractor + declared fields + Extract / Close buttons.
private struct TextExtractedPane: View {
    let extracted: ExtractedText
    let onExtract: () -> Void
    let onClose: () -> Void

    @AppStorage("loom.ai.provider") private var providerRaw: String = AIProviderKind.anthropic.rawValue

    private var providerDisabled: Bool {
        (AIProviderKind(rawValue: providerRaw) ?? .anthropic) == .disabled
    }

    private var extractDisabled: Bool {
        extracted.description.callsAI && providerDisabled
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "doc.text.magnifyingglass")
                    .foregroundStyle(LoomTokens.thread)
                    .font(.system(size: 12))
                Text(extracted.filename)
                    .font(LoomTokens.serif(size: 13, weight: .medium))
                    .foregroundStyle(LoomTokens.ink)
                Text("·")
                    .foregroundStyle(LoomTokens.muted)
                Text("\(extracted.charCount) chars")
                    .font(LoomTokens.mono(size: 11))
                    .foregroundStyle(LoomTokens.muted)
                Spacer()
                extractorBadge
            }

            fieldList

            if !extracted.preview.isEmpty {
                Text(extracted.preview)
                    .font(LoomTokens.serif(size: 12, italic: true))
                    .foregroundStyle(LoomTokens.muted)
                    .lineLimit(6)
                    .textSelection(.enabled)
            }

            HStack(spacing: 8) {
                Button(extractButtonTitle) { onExtract() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.regular)
                    .tint(LoomTokens.thread)
                    .disabled(extractDisabled)
                    .help(extractDisabled
                          ? "AI provider disabled in Settings"
                          : "Run \(extracted.description.title.lowercased()) extractor")

                Button(extracted.description.callsAI ? "Skip AI" : "Close") { onClose() }
                    .buttonStyle(.bordered)
                    .controlSize(.regular)
                    .help("Save the raw text without running the extractor")

                Spacer()
                if extractDisabled {
                    Text("AI is disabled in Settings.")
                        .font(LoomTokens.sans(size: 10))
                        .foregroundStyle(LoomTokens.rose)
                }
            }
        }
        .padding(16)
    }

    @ViewBuilder
    private var extractorBadge: some View {
        HStack(spacing: 4) {
            if extracted.usedFallbackToGeneric {
                Image(systemName: "exclamationmark.circle")
                    .foregroundStyle(LoomTokens.ochre)
                    .font(.system(size: 10))
            } else {
                Image(systemName: "checkmark.seal")
                    .foregroundStyle(LoomTokens.thread)
                    .font(.system(size: 10))
            }
            Text("Will extract as: \(extracted.description.title)")
                .font(LoomTokens.sans(size: 11))
                .foregroundStyle(LoomTokens.ink2)
            Text(String(format: "score %.1f", extracted.chosenExtractorScore))
                .font(LoomTokens.mono(size: 10))
                .foregroundStyle(LoomTokens.muted)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(
            RoundedRectangle(cornerRadius: 4)
                .fill(LoomTokens.hairFaint)
        )
    }

    @ViewBuilder
    private var fieldList: some View {
        if !extracted.description.fields.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(extracted.description.blurb)
                    .font(LoomTokens.serif(size: 12, italic: true))
                    .foregroundStyle(LoomTokens.ink2)
                Text("Declared fields: \(extracted.description.fields.joined(separator: ", "))")
                    .font(LoomTokens.sans(size: 11))
                    .foregroundStyle(LoomTokens.muted)
                    .lineLimit(3)
            }
        }
    }

    private var extractButtonTitle: String {
        extracted.description.callsAI ? "Extract" : "Read"
    }
}

/// `.extracting` state — subtle pulse + cancel. No percentage bar
/// (feedback_design.md: no progress indicators).
private struct ExtractingPane: View {
    let extractorId: String
    let onCancel: () -> Void

    @State private var pulse = false

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(LoomTokens.thread)
                .frame(width: 6, height: 6)
                .opacity(pulse ? 0.3 : 1.0)
                .animation(
                    .easeInOut(duration: 0.9).repeatForever(autoreverses: true),
                    value: pulse
                )
                .onAppear { pulse = true }
            Text("\(extractorId) extractor · running…")
                .font(LoomTokens.serif(size: 12, italic: true))
                .foregroundStyle(LoomTokens.ink2)
            Spacer()
            Button("Cancel", role: .cancel) { onCancel() }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(16)
    }
}

/// `.extracted` state — Phase 4 renderer + collapsible source pane.
/// Wraps in a fixed-height ScrollView so long schemas (Syllabus with
/// many weeks / assessments) don't push the history surface off-screen.
private struct ExtractedPane: View {
    let result: IngestExtractorResultView.Schema
    let sourceText: String
    @ObservedObject var coordinator: SourcePaneScrollCoordinator
    let onDismiss: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Spacer()
                    Button("Close") { onDismiss() }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                }
                IngestExtractorResultView(
                    schema: result,
                    sourceText: sourceText,
                    onQuoteTap: { span in
                        coordinator.scroll(to: span)
                    }
                )
                .padding(12)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(LoomTokens.hairFaint)
                )

                DisclosureGroup(
                    isExpanded: Binding(
                        get: { coordinator.expandPane },
                        set: { coordinator.expandPane = $0 }
                    )
                ) {
                    SourcePreviewPane(sourceText: sourceText, coordinator: coordinator)
                        .frame(minHeight: 200, idealHeight: 240, maxHeight: 360)
                        .background(LoomTokens.paper)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(LoomTokens.hair, lineWidth: 0.5)
                        )
                } label: {
                    Text("Source preview")
                        .font(LoomTokens.sans(size: 11))
                        .foregroundStyle(LoomTokens.muted)
                }
            }
            .padding(16)
        }
        .scrollContentBackground(.hidden)
        .background(LoomTokens.paper)
        .frame(maxHeight: 420)
    }
}

/// `.failed` state — one-line error + dismiss.
private struct FailurePane: View {
    let message: String
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .foregroundStyle(LoomTokens.rose)
                .font(.system(size: 12))
            Text(message)
                .font(LoomTokens.serif(size: 12))
                .foregroundStyle(LoomTokens.ink2)
                .lineLimit(3)
            Spacer()
            Button("Dismiss") { onDismiss() }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(16)
    }
}
