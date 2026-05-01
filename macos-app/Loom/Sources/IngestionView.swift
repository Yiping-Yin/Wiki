import SwiftUI
import UniformTypeIdentifiers
import PDFKit
import SwiftData

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

    /// Phase 7.4 fragment-paste picker state. The capture is held in
    /// memory only between paste and Save/Cancel — there is no
    /// persistence between sheet dismissal and re-open, by design
    /// (`feedback_loom_never_do#3`: cancel = data loss).
    @State private var fragmentPickerCapture: ClipboardInspector.Capture? = nil
    @State private var fragmentPickerVisible: Bool = false

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
        .sheet(isPresented: $fragmentPickerVisible) {
            // Phase 7.4 — mandatory destination picker. Save commits;
            // Cancel discards the in-memory capture (no fallback inbox).
            if let capture = fragmentPickerCapture {
                FragmentDestinationPicker(
                    capture: capture,
                    pursuits: runner.fragmentPickerPursuits(),
                    panels: runner.fragmentPickerPanels(),
                    onSave: { destination in
                        // Hide the sheet first so the picker tears down
                        // before the runner mutates state. Then run the
                        // ingest off the main task so slow SwiftData
                        // writes don't block dismiss animation.
                        let pending = capture
                        fragmentPickerVisible = false
                        fragmentPickerCapture = nil
                        Task { @MainActor in
                            await runner.ingestFragment(
                                capture: pending,
                                destination: destination
                            )
                        }
                    },
                    onCancel: {
                        // Cancel = discard. NO inbox fallback by design.
                        fragmentPickerVisible = false
                        fragmentPickerCapture = nil
                    }
                )
            } else {
                // Defensive: should never render — if capture went nil
                // before sheet hydrated, fall back to a no-op view.
                Color.clear.frame(width: 1, height: 1)
            }
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
                Button("Paste fragment") { pasteClipboardText() }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .tint(LoomTokens.thread)
                    .help("Quote a paragraph from anywhere — pick a destination at capture time.")
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

    /// Phase 7.4 — paste flow now opens the mandatory destination picker
    /// rather than wrapping the clipboard as a `.txt` file. Capturing
    /// the source provenance (URL + frontmost app + best-effort window
    /// title) happens at this moment via `ClipboardInspector.captureNow`.
    /// If the clipboard is empty or whitespace-only the call is a no-op
    /// (system beep) and the picker never opens.
    @MainActor
    private func pasteClipboardText() {
        guard let capture = ClipboardInspector.captureNow(),
              !capture.text.isEmpty else {
            NSSound.beep()
            return
        }
        // Stash the capture and present the picker. The user must
        // choose a destination or Cancel — there is NO fallback to
        // auto-save (`feedback_loom_never_do#3`). The picker view
        // bound on `body` reads `fragmentPickerCapture` and renders
        // when `fragmentPickerVisible` flips true.
        fragmentPickerCapture = capture
        fragmentPickerVisible = true
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

    // MARK: - Phase 7.4 · Fragment paste

    /// Produce projection rows for the destination picker's "Pursuits"
    /// section. Most-recently-updated first, lightly filtered to the
    /// pursuits the user is most likely to want — `retired` season is
    /// dropped so a long tail of stale questions doesn't hide the
    /// active ones. Empty list when no pursuits exist; the picker
    /// nudges toward "+ Or start a new question…".
    func fragmentPickerPursuits() -> [PursuitPickerRow] {
        let pursuits: [LoomPursuit]
        do {
            pursuits = try LoomPursuitWriter.allPursuits()
        } catch {
            NSLog("[Loom] fragmentPickerPursuits fetch failed: \(error)")
            return []
        }
        return pursuits
            .filter { $0.season != "retired" }
            .map { p in
                PursuitPickerRow(
                    id: p.id,
                    question: p.question,
                    weight: p.weight,
                    season: p.season,
                    updatedAt: p.updatedAt
                )
            }
    }

    /// Produce projection rows for the destination picker's "Panels"
    /// section. The Swift side has no `LoomPanelWriter` (panels are
    /// derived on the web side via `derivePanelFromTraces`), so we
    /// query the SwiftData store directly through `LoomDataStore`.
    /// When the picker presents these and the user picks one, the
    /// fragment is persisted as a `reading`-kind trace whose
    /// `sourceDocId` matches the panel's docId — the existing
    /// derivation pipeline picks it up without requiring a writer
    /// API extension.
    func fragmentPickerPanels() -> [PanelPickerRow] {
        let store = LoomDataStore.shared
        var descriptor = FetchDescriptor<LoomPanel>()
        descriptor.sortBy = [SortDescriptor(\.updatedAt, order: .reverse)]
        let panels: [LoomPanel]
        do {
            panels = try store.mainContext.fetch(descriptor)
        } catch {
            NSLog("[Loom] fragmentPickerPanels fetch failed: \(error)")
            return []
        }
        return panels.map { p in
            PanelPickerRow(
                id: p.id,
                title: p.title,
                docId: p.docId,
                status: p.status,
                updatedAt: p.updatedAt
            )
        }
    }

    /// Phase 7.4 deliverable F — persist a paste fragment with a
    /// mandatory destination. Steps:
    ///
    ///   1. Build a `FragmentSchema` from the capture (verbatim text).
    ///   2. Mint a `LoomTrace` of kind `"fragment-paste"` with a
    ///      synthetic `sourceDocId = "fragment:<uuid>"`. The schema
    ///      JSON is packed into `eventsJSON` like every other typed
    ///      extraction (plan: do not change LoomDataModel).
    ///   3. Attach to destination:
    ///        • `.pursuit(id:)`     — `LoomPursuitWriter.attachSource`
    ///        • `.panel(id:)`       — append a thought-anchor event onto
    ///          a reading-kind trace whose `sourceDocId == panel.docId`.
    ///          (The Swift side has no panel writer; this is the
    ///          Phase 7.3 pattern: derive via the existing
    ///          `derivePanelFromTraces` web reader.)
    ///        • `.newQuestion(text:)` — `createPursuit` at tertiary
    ///          weight, then `attachSource` against the new id.
    ///   4. Transition state to `.extracted` so the IngestionView's
    ///      ExtractedPane renders the fragment card. No `.extracting`
    ///      step — fragments are one-shot, no AI call.
    ///   5. Reload history so the fragment shows up under "INGESTED".
    ///
    /// Failures are non-fatal at the per-step level: a downstream
    /// attach failure does not roll back the trace mint (the fragment
    /// itself is not lost), but does post a `.failed` state so the
    /// user sees the error.
    @MainActor
    func ingestFragment(
        capture: ClipboardInspector.Capture,
        destination: FragmentDestination
    ) async {
        let now = Date().timeIntervalSince1970 * 1000

        // 1. Build the schema verbatim. No AI call.
        let schema = FragmentExtractor.build(
            text: capture.text,
            sourceURL: capture.sourceURL,
            sourceApp: capture.sourceApp,
            sourceTitle: capture.sourceTitle,
            capturedAt: now
        )

        // 2. Mint the LoomTrace. The synthetic sourceDocId namespaces
        //    fragments separately from `ingested:<filename>` and
        //    `ingested-url:<url>` so consumers can disambiguate.
        let fragmentId = UUID().uuidString
        let sourceDocId = "fragment:\(fragmentId)"
        let summary = composeFragmentSummary(schema: schema)
        let sourceTitle = capture.sourceTitle
            ?? capture.sourceURL
            ?? "Pasted fragment"

        let schemaJSON: String
        do {
            let data = try JSONEncoder().encode(schema)
            schemaJSON = String(data: data, encoding: .utf8) ?? "{}"
        } catch {
            NSLog("[Loom] ingestFragment schema encode failed: \(error)")
            self.state = .failed("Couldn't encode fragment schema.")
            return
        }

        var event: [String: Any] = [
            "kind": "thought-anchor",
            "blockId": "fragment-root",
            "content": capture.text,
            "summary": summary,
            "extractorId": FragmentExtractor.extractorId,
            "schemaJSON": schemaJSON,
            "at": now,
        ]
        if let sourceURL = capture.sourceURL {
            event["sourceURL"] = sourceURL
        }
        if let sourceApp = capture.sourceApp {
            event["sourceApp"] = sourceApp
        }

        let trace: LoomTrace
        do {
            trace = try LoomTraceWriter.createTrace(
                kind: "fragment-paste",
                sourceDocId: sourceDocId,
                sourceTitle: sourceTitle,
                sourceHref: capture.sourceURL,
                initialEvents: [event]
            )
            _ = try LoomTraceWriter.updateSummary(traceId: trace.id, summary: summary)
        } catch {
            NSLog("[Loom] ingestFragment trace mint failed: \(error)")
            self.state = .failed("Couldn't save fragment.")
            return
        }

        // 3. Attach to destination.
        let resolvedDestination: FragmentDestination
        do {
            resolvedDestination = try await attachFragment(
                sourceDocId: sourceDocId,
                fragmentEvent: event,
                destination: destination
            )
        } catch {
            NSLog("[Loom] ingestFragment attach failed: \(error)")
            self.state = .failed("Couldn't attach fragment to destination.")
            return
        }

        // 4. Transition to .extracted with the fragment schema bound to
        //    its committed destination. The pane renders FragmentSchemaView.
        let ready = ExtractionReady(
            filename: sourceTitle,
            sourceText: capture.text,
            extractorId: FragmentExtractor.extractorId,
            result: .fragment(schema, destination: resolvedDestination)
        )
        self.state = .extracted(ready)

        // 5. Reload + broadcast notifications. Loom's webview reads
        //    pursuit + trace projections through these events.
        await self.reload()
        NotificationCenter.default.post(
            name: .loomTraceChanged,
            object: nil,
            userInfo: ["traceId": trace.id, "op": "fragment-paste"]
        )
        switch resolvedDestination {
        case .pursuit, .newQuestion:
            NotificationCenter.default.post(
                name: .loomPursuitChanged,
                object: nil,
                userInfo: ["pursuitId": "", "op": "fragment-attach"]
            )
        case .panel:
            // No panel writer change; the panel-derivation pipeline
            // re-runs off the trace event we just emitted.
            break
        }
    }

    /// Wire the just-minted fragment trace into its destination. Returns
    /// the destination (possibly canonicalised — e.g. `.newQuestion`
    /// becomes `.pursuit(id:)` after the new pursuit is minted) so the
    /// rendered card shows the FINAL attachment.
    @MainActor
    private func attachFragment(
        sourceDocId: String,
        fragmentEvent: [String: Any],
        destination: FragmentDestination
    ) async throws -> FragmentDestination {
        switch destination {
        case .pursuit(let id):
            try LoomPursuitWriter.attachSource(
                pursuitId: id,
                sourceDocId: sourceDocId
            )
            return .pursuit(id: id)

        case .newQuestion(let text):
            // Verbatim — no AI re-phrasing. `feedback_extract_not_author`
            // applies even when the source is the user typing the
            // question themselves: we save what they typed.
            let pursuit = try LoomPursuitWriter.createPursuit(
                question: text,
                weight: "tertiary"
            )
            try LoomPursuitWriter.attachSource(
                pursuitId: pursuit.id,
                sourceDocId: sourceDocId
            )
            return .pursuit(id: pursuit.id)

        case .panel(let id):
            // No `LoomPanelWriter.attachSource` exists — Panels are
            // derived on the web side via `derivePanelFromTraces`.
            // Smallest extension that doesn't fork the storage layer:
            // emit a `reading`-kind trace whose `sourceDocId == panel.docId`
            // carrying the same fragment event. The web-side derivation
            // pipeline already folds `thought-anchor` events from
            // reading traces into Panels (Phase 7.3 pattern).
            let store = LoomDataStore.shared
            let descriptor = FetchDescriptor<LoomPanel>(
                predicate: #Predicate { $0.id == id }
            )
            guard let panel = try store.mainContext.fetch(descriptor).first,
                  let panelDocId = panel.docId,
                  !panelDocId.isEmpty else {
                throw NSError(
                    domain: "IngestionRunner",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "Panel \(id) has no docId; cannot attach."]
                )
            }
            // Mint a sibling reading trace anchored to the panel's docId.
            // Same event payload as the fragment-paste trace so the
            // verbatim quote survives in both places. Trace title carries
            // the panel title so traces-for-doc views read clearly.
            let panelTitle = panel.title.isEmpty ? "Panel \(id)" : panel.title
            _ = try LoomTraceWriter.createTrace(
                kind: "reading",
                sourceDocId: panelDocId,
                sourceTitle: panelTitle,
                sourceHref: nil,
                initialEvents: [fragmentEvent]
            )
            return .panel(id: id)
        }
    }

    /// Compose the short summary line that appears in the INGESTED list.
    /// The first ~80 chars of the verbatim text, collapsed whitespace,
    /// with a "fragment · Nw" suffix so users can tell paste rows apart
    /// from file rows at a glance.
    private func composeFragmentSummary(schema: FragmentSchema) -> String {
        let collapsed = schema.text.collapsingWhitespace()
        let head: String
        if collapsed.count <= 80 {
            head = collapsed
        } else {
            head = String(collapsed.prefix(80)) + "…"
        }
        return "fragment · \(schema.wordCount)w · \(head)"
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

        // Phase 7.2 · Spawn Pursuits from SyllabusSchema.assessmentItems.
        // Q3 of plan §8 locked: ingest-time spawn (not visit-time), with
        // per-pursuit hide for individual dismissal. Limited to syllabus
        // for now — other schemas have separate Phase 7.3+ bridges.
        // Side-effect spawning is fire-and-forget at the IngestionView
        // level: PursuitSpawner is fail-silent at the per-item level so a
        // single failed spawn never blocks the rest, and the surrounding
        // do/catch in `runExtraction` already swallows persist errors.
        if case .syllabus(let syllabus) = result {
            Task { @MainActor in
                await PursuitSpawner.spawn(
                    from: syllabus,
                    sourceTraceId: trace.id,
                    sourceDocId: sourceDocId,
                    sourceTitle: filename
                )
                // Notify the webview to refresh — same pattern the
                // Pursuit writer uses for create/update events.
                NotificationCenter.default.post(
                    name: .loomPursuitChanged,
                    object: nil,
                    userInfo: ["pursuitId": "", "op": "spawn"]
                )
            }
        }
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
            // Phase 7.4: include paste fragments so they show up in the
            // INGESTED list alongside file ingests. They live under
            // their own `fragment-paste` kind (NOT `ingestion-fragment`)
            // so the registry never auto-picks them and downstream
            // readers can distinguish file ingest from paste capture.
            let fragments = try LoomTraceWriter.traces(ofKind: "fragment-paste")
            traces.append(contentsOf: fragments)
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
    /// generic `"ingestion"` kind so the badge just disappears. The
    /// Phase 7.4 fragment-paste kind gets its own short label so the
    /// history row reads "fragment" alongside the verbatim quote.
    private static func extractorLabel(fromTraceKind kind: String) -> String {
        if kind == "fragment-paste" { return "fragment" }
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
