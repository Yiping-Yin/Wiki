import SwiftUI
import AppKit

/// Native Shuttle palette — opened by ⌘K. Phase 4 of architecture
/// inversion. First cut: navigates to top-level routes. Since then,
/// queries also match the bundled document search-index and — as of
/// 2026-04-22 — live SwiftData content: pursuits, panels (reading
/// traces), Sōan cards, and weaves. Each data hit routes to the web
/// shell with the correct canonical object path (`/pursuit/<id>`,
/// `/panel/<id>`) or focused query (`?focusCardId=` / `?weaveId=`) so
/// the detail client fetches the right row from the native projection.
///
/// 2026-04-22 · M18 — Vellum + Liquid Glass upgrade.
/// The card reads as paper pressed behind glass: `.regularMaterial`
/// (NSVisualEffectView fallback on macOS < 26) tinted with warm paper,
/// hairline bronze edge, deep floating shadow. Typography is serif
/// throughout (Cormorant for titles, EB Garamond for the search field
/// and subtitles) per the Vellum design language.
///
/// Dismisses on Esc, Enter on a selection, or click-outside.
struct ShuttleView: View {
    @Environment(\.dismissWindow) private var dismissWindow
    @State private var query: String = ""
    @State private var selectedIndex: Int = 0
    @State private var hoverIndex: Int? = nil
    @State private var docIndex: [ShuttleDoc] = []
    // Live SwiftData slices — loaded on appear + refreshed via the
    // per-writer notification. Kept small (recent-first) so filtering
    // stays synchronous on the main actor.
    @State private var pursuits: [ShuttlePursuitHit] = []
    @State private var panels: [ShuttlePanelHit] = []
    @State private var soanCards: [ShuttleSoanHit] = []
    @State private var weaves: [ShuttleWeaveHit] = []
    @FocusState private var fieldFocused: Bool

    struct Command: Identifiable, Equatable {
        let id = UUID()
        let label: String
        let subtitle: String?
        let path: String
        let keywords: [String]
        /// When set, runSelected switches the inspector tab instead of
        /// navigating the webview. Used to surface Rehearsal / Examiner /
        /// Ingestion / Reconstructions which were removed from the sidebar
        /// but still need a reachable entry point from ⌘K.
        let inspectorTab: String?
        /// When set, runSelected posts this notification instead of
        /// navigating or switching tabs. Used for action commands that
        /// have no navigation target — e.g. "Hold a Question…" opens a
        /// sheet rather than loading a route.
        let notificationName: Notification.Name?

        init(
            label: String,
            subtitle: String?,
            path: String,
            keywords: [String],
            inspectorTab: String? = nil,
            notificationName: Notification.Name? = nil
        ) {
            self.label = label
            self.subtitle = subtitle
            self.path = path
            self.keywords = keywords
            self.inspectorTab = inspectorTab
            self.notificationName = notificationName
        }
    }

    private let commands: [Command] = [
        .init(label: "Home",            subtitle: "Where you left off",       path: "/",            keywords: ["home", "focus", "entry"]),
        .init(label: "Desk",            subtitle: "Between readings",         path: "/desk",        keywords: ["desk", "today", "queue", "resume"]),
        .init(label: "Workbench",       subtitle: "Writing with the loom visible", path: "/workbench", keywords: ["workbench", "writing", "draft", "compose", "desk"]),
        .init(label: "Sōan",            subtitle: "The thinking draft",       path: "/soan",        keywords: ["soan", "sōan", "thinking", "draft", "canvas", "pieces", "sheet"]),
        .init(label: "Pursuits",        subtitle: "Questions you are holding", path: "/pursuits",   keywords: ["pursuits", "questions", "mind", "inquiry", "held"]),
        .init(label: "Hold a Question…", subtitle: "Open the hold-question dialog (⌘⇧P)", path: "", keywords: ["hold", "question", "pursuit", "new", "mint", "ask", "wonder", "capture"], notificationName: .loomShowHoldQuestionDialog),
        .init(label: "Add a Sōan Card…", subtitle: "Open the add-card dialog (⌘⇧D)", path: "", keywords: ["soan", "sōan", "card", "add", "new", "thesis", "counter", "instance", "question", "fog", "weft", "sketch", "draft"], notificationName: .loomShowAddSoanCardDialog),
        .init(label: "Connect Sōan Cards… · ⌘⇧L", subtitle: "Open the connect-cards dialog", path: "", keywords: ["soan", "sōan", "connect", "edge", "relation", "link", "support", "echo", "draw", "relate", "join"], notificationName: .loomShowConnectSoanCardsDialog),
        .init(label: "Weave Two Panels… · ⌘⇧W", subtitle: "Open the weave-panels dialog", path: "", keywords: ["weave", "panels", "relation", "connect", "supports", "contradicts", "elaborates", "echoes", "link", "tie"], notificationName: .loomShowWeavePanelsDialog),
        .init(label: "Sources",         subtitle: "Your materials, grouped", path: "/sources",    keywords: ["sources", "source", "library", "materials", "atlas", "bookshelf", "shelf", "browse", "knowledge"]),
        .init(label: "Patterns",        subtitle: "What has settled",         path: "/patterns",    keywords: ["patterns", "panels", "kesi", "mosaic", "settled", "held", "habitat"]),
        .init(label: "Weaves",          subtitle: "Focused constellation around a panel", path: "/weaves", keywords: ["weaves", "constellation", "graph", "relations", "panel", "focus"]),
        .init(label: "Constellation",   subtitle: "Three basins forming",     path: "/constellation", keywords: ["constellation", "basins", "cluster", "thoughts", "gravity", "forming"]),
        .init(label: "Branching",       subtitle: "Argument as a tree",       path: "/branching",     keywords: ["branching", "argument", "tree", "supports", "counters", "debate"]),
        .init(label: "Palimpsest",      subtitle: "The thought's history",    path: "/palimpsest",    keywords: ["palimpsest", "history", "layers", "drafts", "past", "evolution"]),
        .init(label: "Diagrams",        subtitle: "Five ways to draw a thought", path: "/diagrams", keywords: ["diagrams", "diagram", "argument", "model", "architecture", "decision", "state", "draw", "shape", "five"]),
        .init(label: "Coworks",         subtitle: "Rehearsal surfaces",       path: "/coworks",     keywords: ["cowork", "rehearsal"]),
        .init(label: "Notes",           subtitle: "Anchored notes",           path: "/notes",       keywords: ["notes", "anchors"]),
        .init(label: "Highlights",      subtitle: "Flagged passages",         path: "/highlights",  keywords: ["highlights", "passages"]),
        .init(label: "Quizzes",         subtitle: "Past attempts",            path: "/quizzes",     keywords: ["quiz", "quizzes", "check"]),
        .init(label: "Help",            subtitle: "Usage guide",              path: "/help",        keywords: ["help", "manual", "docs"]),
        .init(label: "Uploads",         subtitle: "Intake",                   path: "/uploads",     keywords: ["uploads", "intake", "files"]),
        .init(label: "Rehearsal",       subtitle: "⌘⇧R",                      path: "",             keywords: ["rehearsal", "recall", "practice"], inspectorTab: "rehearsal"),
        .init(label: "Examiner",        subtitle: "⌘⇧X",                      path: "",             keywords: ["examiner", "quiz", "check"],        inspectorTab: "examiner"),
        .init(label: "Ingestion",       subtitle: "⌘⇧I",                      path: "",             keywords: ["ingestion", "intake", "import"],    inspectorTab: "ingestion"),
        .init(label: "Reconstructions", subtitle: nil,                        path: "",             keywords: ["reconstructions", "rebuild"],       inspectorTab: "reconstructions"),
        .init(label: "Colophon",        subtitle: "The type, the palette, the hand", path: "/colophon", keywords: ["colophon", "back matter", "credits", "type", "palette"]),
        .init(label: "Contents",        subtitle: "A reader's map",           path: "/contents",    keywords: ["contents", "toc", "table of contents", "map", "index", "front matter", "chapters"]),
        .init(label: "Frontispiece",    subtitle: "The book's title page",    path: "/frontispiece", keywords: ["frontispiece", "title", "front matter", "cover page", "opening"]),
        .init(label: "System",          subtitle: "The whole product on one sheet", path: "/system", keywords: ["system", "atlas", "ia", "architecture", "map", "overview", "sheet"]),
        // Actions — sending, writing, reading together.
        .init(label: "Letter",          subtitle: "Send a panel to a friend", path: "/letter",  keywords: ["letter", "send", "envelope", "correspondence", "mail", "share"]),
        .init(label: "Atelier",         subtitle: "Write across four sources", path: "/atelier", keywords: ["atelier", "write", "compose", "draft", "sources", "multi", "synthesis"]),
        .init(label: "Salon",           subtitle: "Read together",            path: "/salon",    keywords: ["salon", "together", "circle", "social", "shared", "group", "reading"]),
        // Data — flat-file JSON round-trip of the whole Loom store.
        .init(label: "Export Loom…",    subtitle: "Save your data to a file", path: "", keywords: ["export", "save", "backup", "dump", "json", "archive", "download"], notificationName: .loomExport),
        .init(label: "Import Loom…",    subtitle: "Restore data from a file", path: "", keywords: ["import", "restore", "load", "backup", "json", "archive", "upload"], notificationName: .loomImport),
    ]

    // MARK: - Hit pipeline

    private var activeQuery: Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Navigation-command hits (filtered against the live query, or the
    /// full list when the query is empty).
    private var navHits: [Command] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if q.isEmpty { return commands }
        return commands.filter { cmd in
            if cmd.label.lowercased().contains(q) { return true }
            if cmd.subtitle?.lowercased().contains(q) == true { return true }
            return cmd.keywords.contains { $0.contains(q) }
        }
    }

    /// Document hits — only while a query is active, bounded to 30.
    private var docHits: [ShuttleDoc] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return docIndex
            .filter { doc in
                doc.title.lowercased().contains(q)
                || doc.category.lowercased().contains(q)
            }
            .prefix(30)
            .map { $0 }
    }

    /// Pursuit hits — match against question text. Capped at 5 so a
    /// vague query like "why" doesn't flood the list over docs.
    private var pursuitHits: [ShuttlePursuitHit] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return pursuits
            .filter { $0.question.lowercased().contains(q) || $0.weight.lowercased().contains(q) }
            .prefix(5)
            .map { $0 }
    }

    /// Panel hits — derived from reading traces (sourceTitle + current
    /// summary). Capped at 5.
    private var panelHits: [ShuttlePanelHit] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return panels
            .filter {
                $0.title.lowercased().contains(q)
                || $0.summary.lowercased().contains(q)
            }
            .prefix(5)
            .map { $0 }
    }

    /// Sōan card hits — match on body + kind. Capped at 5.
    private var soanHits: [ShuttleSoanHit] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return soanCards
            .filter {
                $0.body.lowercased().contains(q)
                || $0.kind.lowercased().contains(q)
                || $0.title.lowercased().contains(q)
            }
            .prefix(5)
            .map { $0 }
    }

    /// Weave hits — match on kind + rationale. Capped at 5.
    private var weaveHits: [ShuttleWeaveHit] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return [] }
        return weaves
            .filter {
                $0.kind.lowercased().contains(q)
                || $0.rationale.lowercased().contains(q)
            }
            .prefix(5)
            .map { $0 }
    }

    /// Flat unified ordering used for keyboard navigation + selection. Empty
    /// Shuttle stays command-first; active queries become knowledge-first so
    /// the palette behaves like a reader's memory before it behaves like app
    /// navigation. Layout mirrors `resultsList` so selectedIndex lands where
    /// the eye expects.
    private var filtered: [ShuttleHit] {
        var out: [ShuttleHit] = []
        if activeQuery {
            out.append(contentsOf: pursuitHits.map { ShuttleHit.pursuit($0) })
            out.append(contentsOf: panelHits.map { ShuttleHit.panel($0) })
            out.append(contentsOf: soanHits.map { ShuttleHit.soanCard($0) })
            out.append(contentsOf: weaveHits.map { ShuttleHit.weave($0) })
            out.append(contentsOf: docHits.map { ShuttleHit.doc($0) })
            out.append(contentsOf: navHits.map { ShuttleHit.navCommand($0) })
        } else {
            out.append(contentsOf: navHits.map { ShuttleHit.navCommand($0) })
            out.append(contentsOf: docHits.map { ShuttleHit.doc($0) })
            out.append(contentsOf: pursuitHits.map { ShuttleHit.pursuit($0) })
            out.append(contentsOf: panelHits.map { ShuttleHit.panel($0) })
            out.append(contentsOf: soanHits.map { ShuttleHit.soanCard($0) })
            out.append(contentsOf: weaveHits.map { ShuttleHit.weave($0) })
        }
        return out
    }

    var body: some View {
        VStack(spacing: 0) {
            searchField
            Divider().background(LoomTokens.hair)

            ZStack {
                if filtered.isEmpty {
                    EmptyShuttleResultsView(query: query)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    resultsList
                }
            }
            .frame(maxHeight: .infinity)

            Divider().background(LoomTokens.hair)
            ShuttleFooterHints()
        }
        .frame(width: 560, height: 440)
        .background(shuttleCardBackground)
        .overlay(
            // Hairline bronze rim — 0.5pt matches --mat-border in web.
            // Uses LoomTokens.hair so the rim flips to a candle-tinted
            // hairline in dark mode (dark-on-dark would vanish).
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(LoomTokens.hair, lineWidth: 0.5)
        )
        .overlay(
            // Liquid-Glass specular: bronze highlight along the top edge
            // that fades to nothing by ~20% down. Non-interactive.
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(
                    LinearGradient(
                        colors: [
                            LoomTokens.threadHi.opacity(0.35),
                            Color.clear
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    ),
                    lineWidth: 0.8
                )
                .allowsHitTesting(false)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.18), radius: 30, y: 12)
        .padding(16) // lets shadow breathe outside the window bounds
        .background(ShuttleWindowTransparencyConfigurator())
        .onAppear {
            fieldFocused = true
            Task { await loadIndex() }
            loadSwiftData()
        }
        // Live refresh — if the user mints a pursuit / card / weave
        // while Shuttle is open, the next keystroke re-filters over the
        // fresh snapshot. (Data loads are cheap: small @MainActor
        // SwiftData fetches.)
        .onReceive(NotificationCenter.default.publisher(for: .loomPursuitChanged)) { _ in
            loadSwiftData()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomTraceChanged)) { _ in
            loadSwiftData()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomSoanChanged)) { _ in
            loadSwiftData()
        }
        .onReceive(NotificationCenter.default.publisher(for: .loomWeaveChanged)) { _ in
            loadSwiftData()
        }
        .onChange(of: query) { _, _ in
            selectedIndex = 0
        }
        .onKeyPress(.downArrow) {
            selectedIndex = min(selectedIndex + 1, max(0, filtered.count - 1))
            return .handled
        }
        .onKeyPress(.upArrow) {
            selectedIndex = max(0, selectedIndex - 1)
            return .handled
        }
        .onKeyPress(.escape) {
            dismissWindow(id: ShuttleWindow.id)
            return .handled
        }
    }

    // MARK: - Pieces

    /// Paper-tinted glass card. `.regularMaterial` delivers Liquid Glass
    /// on macOS Tahoe 26; older systems fall back to the translucent
    /// sidebar material, which still reads as vellum once the paper
    /// tint is layered on top.
    private var shuttleCardBackground: some View {
        ZStack {
            // 1. System material (NSVisualEffectView under the hood) —
            //    this is what carries the Liquid Glass specular + blur.
            ShuttleGlassBackdrop()

            // 2. Warm paper wash — 72% opacity keeps the glass readable
            //    while dominantly reading as vellum rather than clear.
            //    Flips to the night-paper tone in dark mode so the search
            //    palette doesn't glow as a cream rectangle over the
            //    ink-wash reading surface.
            LoomTokens.paper.opacity(0.72)
        }
    }

    /// Search field — no chrome. Italic serif placeholder + italic serif
    /// input. Magnifier glyph muted to bronze-ish.
    private var searchField: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14, weight: .light))
                .foregroundStyle(LoomTokens.muted)
            ZStack(alignment: .leading) {
                if query.isEmpty {
                    Text("Find a passage · open a room…")
                        .font(LoomTokens.serif(size: 16, italic: true))
                        .foregroundStyle(LoomTokens.muted.opacity(0.78))
                        .allowsHitTesting(false)
                }
                TextField("", text: $query)
                    .textFieldStyle(.plain)
                    .font(LoomTokens.serif(size: 16, italic: true))
                    .foregroundStyle(LoomTokens.ink)
                    .focused($fieldFocused)
                    .onSubmit(runSelected)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }

    /// Scroll + LazyVStack rather than `List` — `List`'s system selection
    /// styling (blue accent, inset rounded row) fights the bronze-soft
    /// palette we need. Arrow-key navigation is driven by `selectedIndex`
    /// at the outer view level, not by `List` selection, so we lose
    /// nothing by moving to a custom scroller.
    private var resultsList: some View {
        let nav = navHits
        let docs = docHits
        let pu = pursuitHits
        let pa = panelHits
        let so = soanHits
        let we = weaveHits

        if activeQuery {
            let puOffset = 0
            let paOffset = puOffset + pu.count
            let soOffset = paOffset + pa.count
            let weOffset = soOffset + so.count
            let docOffset = weOffset + we.count
            let navOffset = docOffset + docs.count

            return AnyView(ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if !pu.isEmpty {
                            sectionLabel("Pursuits")
                            ForEach(Array(pu.enumerated()), id: \.element.id) { idx, p in
                                row(hit: .pursuit(p), flatIndex: puOffset + idx)
                            }
                        }
                        if !pa.isEmpty {
                            sectionLabel("Reading panels").padding(.top, 8)
                            ForEach(Array(pa.enumerated()), id: \.element.id) { idx, p in
                                row(hit: .panel(p), flatIndex: paOffset + idx)
                            }
                        }
                        if !so.isEmpty {
                            sectionLabel("Sōan").padding(.top, 8)
                            ForEach(Array(so.enumerated()), id: \.element.id) { idx, c in
                                row(hit: .soanCard(c), flatIndex: soOffset + idx)
                            }
                        }
                        if !we.isEmpty {
                            sectionLabel("Weaves").padding(.top, 8)
                            ForEach(Array(we.enumerated()), id: \.element.id) { idx, w in
                                row(hit: .weave(w), flatIndex: weOffset + idx)
                            }
                        }
                        if !docs.isEmpty {
                            sectionLabel("Books and sources").padding(.top, 8)
                            ForEach(Array(docs.enumerated()), id: \.element.href) { idx, doc in
                                row(hit: .doc(doc), flatIndex: docOffset + idx)
                            }
                        }
                        if !nav.isEmpty {
                            sectionLabel("Go to").padding(.top, 8)
                            ForEach(Array(nav.enumerated()), id: \.element.id) { idx, cmd in
                                row(hit: .navCommand(cmd), flatIndex: navOffset + idx)
                            }
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                }
                .onChange(of: selectedIndex) { _, newIndex in
                    guard newIndex < filtered.count else { return }
                    withAnimation(.easeInOut(duration: 0.12)) {
                        proxy.scrollTo(filtered[newIndex].scrollId, anchor: .center)
                    }
                }
            })
        }

        let navOffset = 0
        let docOffset = navOffset + nav.count
        let puOffset = docOffset + docs.count
        let paOffset = puOffset + pu.count
        let soOffset = paOffset + pa.count
        let weOffset = soOffset + so.count

        return AnyView(ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if !nav.isEmpty {
                        sectionLabel("Go to")
                        ForEach(Array(nav.enumerated()), id: \.element.id) { idx, cmd in
                            row(hit: .navCommand(cmd), flatIndex: navOffset + idx)
                        }
                    }
                    if !docs.isEmpty {
                        sectionLabel("Documents").padding(.top, 8)
                        ForEach(Array(docs.enumerated()), id: \.element.href) { idx, doc in
                            row(hit: .doc(doc), flatIndex: docOffset + idx)
                        }
                    }
                    if !pu.isEmpty {
                        sectionLabel("Pursuits").padding(.top, 8)
                        ForEach(Array(pu.enumerated()), id: \.element.id) { idx, p in
                            row(hit: .pursuit(p), flatIndex: puOffset + idx)
                        }
                    }
                    if !pa.isEmpty {
                        sectionLabel("Panels").padding(.top, 8)
                        ForEach(Array(pa.enumerated()), id: \.element.id) { idx, p in
                            row(hit: .panel(p), flatIndex: paOffset + idx)
                        }
                    }
                    if !so.isEmpty {
                        sectionLabel("Sōan").padding(.top, 8)
                        ForEach(Array(so.enumerated()), id: \.element.id) { idx, c in
                            row(hit: .soanCard(c), flatIndex: soOffset + idx)
                        }
                    }
                    if !we.isEmpty {
                        sectionLabel("Weaves").padding(.top, 8)
                        ForEach(Array(we.enumerated()), id: \.element.id) { idx, w in
                            row(hit: .weave(w), flatIndex: weOffset + idx)
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
            }
            .onChange(of: selectedIndex) { _, newIndex in
                guard newIndex < filtered.count else { return }
                withAnimation(.easeInOut(duration: 0.12)) {
                    proxy.scrollTo(filtered[newIndex].scrollId, anchor: .center)
                }
            }
        })
    }

    /// Small-caps italic serif section heading — Vellum's standard eyebrow.
    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(LoomTokens.serif(size: 9, italic: true))
            .tracking(1.6)
            .textCase(.uppercase)
            .foregroundStyle(LoomTokens.muted)
            .padding(.horizontal, 14)
            .padding(.top, 10)
            .padding(.bottom, 4)
    }

    /// Result row — custom painting so we can land exact bronze-soft
    /// active fill + 2pt bronze leading rule. Hover adds a 4% bronze
    /// tint so the row reads as reachable before it's selected.
    private func row(hit: ShuttleHit, flatIndex: Int) -> some View {
        let isActive = flatIndex == selectedIndex
        let isHover = hoverIndex == flatIndex
        let bronze = LoomTokens.thread
        let display = hit.display

        return HStack(alignment: .firstTextBaseline, spacing: 12) {
            // Per-kind leading badge (nav rows leave the lane empty so
            // the classic palette still reads as "go to" without noise).
            if let badge = hit.badge {
                Text(badge)
                    .font(LoomTokens.serif(size: 11, italic: true))
                    .foregroundStyle(LoomTokens.muted)
                    .frame(width: 14, alignment: .center)
                    .padding(.top, 1)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(display.title)
                    .font(LoomTokens.display(size: 15, italic: true, weight: .regular))
                    .foregroundStyle(LoomTokens.ink)
                    .lineLimit(1)
                if let sub = display.subtitle, !sub.isEmpty {
                    Text(sub)
                        .font(LoomTokens.serif(size: 12, italic: true))
                        .foregroundStyle(LoomTokens.ink3)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if let sub = display.subtitle, isShortcutLike(sub) {
                Text(sub)
                    .font(LoomTokens.mono(size: 10))
                    .foregroundStyle(LoomTokens.muted)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(rowFill(isActive: isActive, isHover: isHover, bronze: bronze))
                if isActive {
                    Rectangle()
                        .fill(bronze)
                        .frame(width: 2)
                        .clipShape(
                            UnevenRoundedRectangle(
                                topLeadingRadius: 1,
                                bottomLeadingRadius: 1,
                                bottomTrailingRadius: 0,
                                topTrailingRadius: 0
                            )
                        )
                }
            }
        )
        .contentShape(Rectangle())
        .onHover { hovering in
            hoverIndex = hovering ? flatIndex : (hoverIndex == flatIndex ? nil : hoverIndex)
        }
        .onTapGesture {
            selectedIndex = flatIndex
            runSelected()
        }
        .id(hit.scrollId)
    }

    private func rowFill(isActive: Bool, isHover: Bool, bronze: Color) -> Color {
        if isActive {
            return bronze.opacity(0.18) // bronze-soft
        }
        if isHover {
            return bronze.opacity(0.04)
        }
        return .clear
    }

    /// True when the subtitle reads like "⌘⇧R" — i.e., mostly modifier
    /// glyphs. Used to right-align that row's subtitle in mono instead of
    /// showing it under the title.
    private func isShortcutLike(_ s: String) -> Bool {
        guard s.count <= 6 else { return false }
        // Any of ⌘ ⇧ ⌃ ⌥ present → treat as shortcut chip.
        return s.contains("⌘") || s.contains("⇧") || s.contains("⌃") || s.contains("⌥")
    }

    private func runSelected() {
        guard selectedIndex < filtered.count else { return }
        let hit = filtered[selectedIndex]
        switch hit {
        case .navCommand(let cmd):
            runCommand(cmd)
        case .doc(let doc):
            NotificationCenter.default.post(
                name: .loomShuttleNavigate,
                object: nil,
                userInfo: ["path": doc.href]
            )
            dismissWindow(id: ShuttleWindow.id)
        case .pursuit(let p):
            NotificationCenter.default.post(
                name: .loomShuttleNavigate,
                object: nil,
                userInfo: ["path": "/pursuit/\(encode(p.id))"]
            )
            dismissWindow(id: ShuttleWindow.id)
        case .panel(let p):
            NotificationCenter.default.post(
                name: .loomShuttleNavigate,
                object: nil,
                userInfo: ["path": "/panel/\(encode(p.id))"]
            )
            dismissWindow(id: ShuttleWindow.id)
        case .soanCard(let c):
            // SoanClient doesn't yet honour a focus param — passing it
            // is a harmless forward-compatibility hint so the link-style
            // is the same as the other kinds once focus lands.
            NotificationCenter.default.post(
                name: .loomShuttleNavigate,
                object: nil,
                userInfo: ["path": "/soan?focusCardId=\(encode(c.id))"]
            )
            dismissWindow(id: ShuttleWindow.id)
        case .weave(let w):
            NotificationCenter.default.post(
                name: .loomShuttleNavigate,
                object: nil,
                userInfo: ["path": "/weaves?weaveId=\(encode(w.id))"]
            )
            dismissWindow(id: ShuttleWindow.id)
        }
    }

    /// Execute a navigation Command — preserved from the original
    /// (action notification / inspector tab / web navigation).
    private func runCommand(_ cmd: Command) {
        if let name = cmd.notificationName {
            // Action command — posts a bare notification. Dismiss the
            // Shuttle first so the downstream sheet (e.g. Hold a
            // Question) lands on the main window rather than fighting
            // the palette for focus.
            dismissWindow(id: ShuttleWindow.id)
            NotificationCenter.default.post(name: name, object: nil)
            return
        }
        if let tab = cmd.inspectorTab {
            NotificationCenter.default.post(
                name: .loomShowInspectorTab,
                object: nil,
                userInfo: ["tab": tab]
            )
        } else {
            NotificationCenter.default.post(
                name: .loomShuttleNavigate,
                object: nil,
                userInfo: ["path": cmd.path]
            )
        }
        dismissWindow(id: ShuttleWindow.id)
    }

    private func encode(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? s
    }

    /// Load the static search index (`loom://bundle/search-index.json`)
    /// into memory so user queries can match document titles. The index
    /// is the MiniSearch dump produced by `scripts/build-search-index`,
    /// from which we only read `storedFields` entries with `title` +
    /// `href` + `category`.
    private func loadIndex() async {
        guard docIndex.isEmpty else { return }
        guard let url = URL(string: "loom://bundle/search-index.json") else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let index = root["index"] as? [String: Any],
                  let storedFields = index["storedFields"] as? [String: Any] else {
                return
            }
            var out: [ShuttleDoc] = []
            for (_, value) in storedFields {
                guard let fields = value as? [String: Any],
                      let title = fields["title"] as? String,
                      let href = fields["href"] as? String,
                      !title.isEmpty, !href.isEmpty else { continue }
                let category = (fields["category"] as? String) ?? ""
                out.append(ShuttleDoc(title: title, href: href, category: category))
            }
            await MainActor.run { self.docIndex = out }
        } catch {
            // Silent — the index isn't critical; fall back to static nav.
        }
    }

    /// Load + project the four SwiftData writers into immutable `@State`
    /// slices used by the filter pipeline. `try?` with empty-array
    /// fallback — a missing store is harmless, Shuttle falls back to
    /// nav + docs only. Reads happen on @MainActor (the call site is
    /// already main-isolated via SwiftUI).
    @MainActor
    private func loadSwiftData() {
        let pursuitModels = (try? LoomPursuitWriter.allPursuits()) ?? []
        self.pursuits = pursuitModels.map {
            ShuttlePursuitHit(id: $0.id, question: $0.question, weight: $0.weight)
        }

        let traceModels = (try? LoomTraceWriter.allTraces()) ?? []
        self.panels = traceModels
            .filter { $0.kind == "reading" }
            .map {
                ShuttlePanelHit(
                    id: $0.id,
                    title: $0.sourceTitle ?? "Untitled reading",
                    summary: $0.currentSummary
                )
            }

        let cardModels = (try? LoomSoanWriter.allCards()) ?? []
        self.soanCards = cardModels.map {
            ShuttleSoanHit(id: $0.id, kind: $0.kind, body: $0.body, title: $0.title)
        }

        let weaveModels = (try? LoomWeaveWriter.allWeaves()) ?? []
        self.weaves = weaveModels.map {
            ShuttleWeaveHit(
                id: $0.id,
                kind: $0.kind,
                rationale: $0.rationale,
                fromPanelId: $0.fromPanelId,
                toPanelId: $0.toPanelId
            )
        }
    }
}

// MARK: - Hit types

/// Unified discriminated union of everything the Shuttle can surface.
/// Separate value types per kind (rather than one bag-of-optional struct)
/// so the filter + render + route paths are exhaustive at compile time.
enum ShuttleHit {
    case navCommand(ShuttleView.Command)
    case doc(ShuttleDoc)
    case pursuit(ShuttlePursuitHit)
    case panel(ShuttlePanelHit)
    case soanCard(ShuttleSoanHit)
    case weave(ShuttleWeaveHit)

    struct Display {
        let title: String
        let subtitle: String?
    }

    /// Display title + subtitle for the row. Subtitle is italic serif
    /// small with the kind tag prefixed (e.g. "Pursuit · primary").
    var display: Display {
        switch self {
        case .navCommand(let cmd):
            return Display(title: cmd.label, subtitle: cmd.subtitle)
        case .doc(let doc):
            return Display(
                title: doc.title,
                subtitle: doc.category.isEmpty ? "Source · \(doc.href)" : "Source · \(doc.category)"
            )
        case .pursuit(let p):
            return Display(
                title: p.question,
                subtitle: "Pursuit · \(p.weight)"
            )
        case .panel(let p):
            let sub = p.summary.isEmpty ? "Panel" : "Panel · \(shortened(p.summary))"
            return Display(title: p.title, subtitle: sub)
        case .soanCard(let c):
            let title = c.title.isEmpty ? shortened(c.body, max: 80) : c.title
            return Display(title: title, subtitle: "Sōan · \(c.kind)")
        case .weave(let w):
            let sub = w.rationale.isEmpty
                ? "Weave · \(w.kind)"
                : "Weave · \(w.kind) · \(shortened(w.rationale))"
            return Display(
                title: "\(w.kind.capitalized) between panels",
                subtitle: sub
            )
        }
    }

    /// Tiny leading badge glyph per kind. Nav commands return nil (the
    /// lane stays empty) — otherwise a discreet serif glyph signals the
    /// source of the hit.
    var badge: String? {
        switch self {
        case .navCommand:
            return nil
        case .doc:
            return "▭"
        case .pursuit:
            return "·"
        case .panel:
            return "◇"
        case .soanCard(let c):
            return Self.soanGlyph(for: c.kind)
        case .weave:
            return "≈"
        }
    }

    /// Hashable identity used both for `ForEach` ids inside sections and
    /// for `scrollTo(_:)` targeting as selectedIndex changes.
    var scrollId: String {
        switch self {
        case .navCommand(let c): return "nav:\(c.id.uuidString)"
        case .doc(let d): return "doc:\(d.href)"
        case .pursuit(let p): return "pursuit:\(p.id)"
        case .panel(let p): return "panel:\(p.id)"
        case .soanCard(let c): return "soan:\(c.id)"
        case .weave(let w): return "weave:\(w.id)"
        }
    }

    private static func soanGlyph(for kind: String) -> String {
        switch kind.lowercased() {
        case "thesis": return "✦"
        case "counter": return "✕"
        case "instance": return "·"
        case "question": return "?"
        case "fog": return "~"
        case "weft": return "─"
        case "sketch": return "○"
        default: return "·"
        }
    }
}

/// Private helper for Display: clip long summary/body text down to one
/// line's worth without breaking mid-word when possible.
private func shortened(_ text: String, max: Int = 60) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.count <= max { return trimmed }
    let idx = trimmed.index(trimmed.startIndex, offsetBy: max)
    return trimmed[..<idx].trimmingCharacters(in: .whitespacesAndNewlines) + "…"
}

/// Projection of `LoomPursuit` into the Shuttle filter pipeline.
struct ShuttlePursuitHit: Identifiable, Equatable {
    let id: String
    let question: String
    let weight: String
}

/// Projection of a reading `LoomTrace` into a "Panel" hit.
struct ShuttlePanelHit: Identifiable, Equatable {
    let id: String
    let title: String
    let summary: String
}

/// Projection of `LoomSoanCard`.
struct ShuttleSoanHit: Identifiable, Equatable {
    let id: String
    let kind: String
    let body: String
    let title: String
}

/// Projection of `LoomWeave`. Endpoints kept so the future detail
/// view can resolve the two panels without a second fetch.
struct ShuttleWeaveHit: Identifiable, Equatable {
    let id: String
    let kind: String
    let rationale: String
    let fromPanelId: String
    let toPanelId: String
}

/// Shown when the current query matches nothing. A common-Mac-palette
/// touch (Raycast / Spotlight / Xcode quick-open all have it); without it
/// the panel just goes blank, which reads as broken. Vellum pass: italic
/// serif copy, bronze-muted glyph, no boxed art.
private struct EmptyShuttleResultsView: View {
    let query: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "text.magnifyingglass")
                .font(.system(size: 26, weight: .ultraLight))
                .foregroundStyle(LoomTokens.muted)
            VStack(spacing: 4) {
                Text("Nothing in the shuttle")
                    .font(LoomTokens.display(size: 16, italic: true))
                    .foregroundStyle(LoomTokens.ink2)
                if !query.isEmpty {
                    Text("for \u{201C}\(query)\u{201D}")
                        .font(LoomTokens.serif(size: 12, italic: true))
                        .foregroundStyle(LoomTokens.ink3)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Footer hint strip — keyboard shortcuts the palette accepts. Italic
/// serif in line with Vellum; the symbols stay glyph-rendered so the
/// return/esc/arrow keys are still legible at a glance.
private struct ShuttleFooterHints: View {
    var body: some View {
        HStack(spacing: 18) {
            hint(symbol: "return", label: "Open")
            hint(symbol: "arrow.up.arrow.down", label: "Navigate")
            Spacer()
            hint(symbol: "escape", label: "Dismiss")
        }
        .font(LoomTokens.serif(size: 11, italic: true))
        .foregroundStyle(LoomTokens.muted)
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
    }

    private func hint(symbol: String, label: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: symbol)
                .font(.system(size: 10, weight: .regular))
            Text(label)
        }
    }
}

// MARK: - AppKit bridges

/// `NSVisualEffectView` wrapper — gives us the hudWindow material that
/// SwiftUI's `.regularMaterial` doesn't expose directly. This is the
/// foundation the paper-tint layer sits on top of, together forming the
/// Liquid Glass look.
private struct ShuttleGlassBackdrop: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        view.isEmphasized = true
        view.wantsLayer = true
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = .hudWindow
        nsView.state = .active
    }
}

/// Zero-sized helper that reaches out to the hosting NSWindow once it
/// exists and makes its background transparent so the rounded glass
/// card is what the user sees — not a system window rectangle behind
/// the card. Safe if the window lookup fails (falls back to the scene's
/// default background).
private struct ShuttleWindowTransparencyConfigurator: NSViewRepresentable {
    func makeNSView(context: Context) -> NSView {
        let v = NSView()
        DispatchQueue.main.async {
            guard let window = v.window else { return }
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = false // the SwiftUI .shadow on the card handles this
            window.titlebarAppearsTransparent = true
            window.titleVisibility = .hidden
            window.styleMask.insert(.fullSizeContentView)
            // Hide the traffic-light buttons — the palette is ephemeral.
            window.standardWindowButton(.closeButton)?.isHidden = true
            window.standardWindowButton(.miniaturizeButton)?.isHidden = true
            window.standardWindowButton(.zoomButton)?.isHidden = true
            // Float above normal windows so it reads as an overlay.
            window.level = .floating
        }
        return v
    }

    func updateNSView(_ nsView: NSView, context: Context) {}
}

struct ShuttleDoc: Equatable {
    let title: String
    let href: String
    let category: String
}

enum ShuttleWindow {
    static let id = "com.loom.window.shuttle"
}

extension Notification.Name {
    static let loomShuttleNavigate = Notification.Name("loomShuttleNavigate")
}
