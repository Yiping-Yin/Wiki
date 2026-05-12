import Foundation
import SwiftUI

// MARK: Phase C M1 — Capture shape detection + per-shape rendering
//
// Phase C constitutional rules (from plans/phase-c-presentation-layer.md):
//   1. Source folder immutable
//   2. `.md` is canonical, render is derived
//   3. Content-shape-aware (one renderer per shape, picked by detection)
//   4. No AI rewriting at render time
//   5. User retains full editing power
//   6. No in-Loom AI chat
//
// Shapes shipped in M1: List (HN / Reddit / arxiv list), Article
// (prose). Passage / Conversation / Syllabus land in M2-M3.
//
// Detection runs in <5ms (regex passes, no parser). Falls back to
// .article when no shape matches with confidence.

/// Output of shape detection on a single capture entry's markdown.
enum CaptureShape {
    case list([ListItem])
    case article
    // Future: case passage, case conversation, case syllabus
}

/// One row in a list-shape capture (HN frontpage story, Reddit post,
/// arxiv listing). Parsed from the canonical extractor output:
///
///     1. [title](url) _(domain)_
///        meta1 · meta2 · meta3 · [comments](url)
///
/// Meta entries are surfaced as a simple string list — the renderer
/// formats them with `·` separators. URL fields stay typed so the
/// card can route clicks without re-parsing markdown.
struct ListItem: Identifiable, Hashable {
    let id = UUID()
    var rank: Int?
    var title: String
    var url: URL?
    var domain: String?
    var metaPlain: [String]
    /// First markdown link inside the meta line, typically the
    /// comments / discuss URL. Surfaced as a tail action on each card.
    var metaTailLabel: String?
    var metaTailURL: URL?
}

enum CaptureShapeDetector {
    /// Pattern: `1. [title](url) _(domain)_`
    /// Captures: rank, title, url, domain
    private static let titleRegex: NSRegularExpression = {
        let pattern = #"^(\d+)\.\s+\[(.+?)\]\((.+?)\)(?:\s+_\((.+?)\)_)?\s*$"#
        return try! NSRegularExpression(pattern: pattern, options: [])
    }()

    /// Markdown link pattern used to pull the comments URL out of a
    /// meta line.
    private static let mdLinkRegex: NSRegularExpression = {
        let pattern = #"\[(.+?)\]\((.+?)\)"#
        return try! NSRegularExpression(pattern: pattern, options: [])
    }()

    /// Inspects the markdown body of one capture entry and returns
    /// the most-confident shape match. List requires ≥3 matched items
    /// to fire; otherwise we fall back to article.
    static func detect(_ markdown: String) -> CaptureShape {
        let items = parseListItems(from: markdown)
        if items.count >= 3 {
            return .list(items)
        }
        return .article
    }

    /// Walk the markdown line-by-line. A list item is a `\d+. [t](u) _(d)_`
    /// title line followed by an optional meta line (3-space indent).
    /// The meta line splits on ` · ` separators — that's what the HN
    /// extractor produces. Other extractors that follow this contract
    /// get the same treatment for free.
    static func parseListItems(from markdown: String) -> [ListItem] {
        let lines = markdown.components(separatedBy: "\n")
        var items: [ListItem] = []
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let ns = line as NSString
            if let m = titleRegex.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)),
               m.numberOfRanges >= 4 {
                let rank = Int(ns.substring(with: m.range(at: 1)))
                let title = ns.substring(with: m.range(at: 2))
                let urlString = ns.substring(with: m.range(at: 3))
                let url = URL(string: urlString)
                let domain: String? = {
                    let r = m.range(at: 4)
                    return r.location == NSNotFound ? nil : ns.substring(with: r)
                }()

                // Optional meta line follows on the next non-blank line.
                var metaPlain: [String] = []
                var metaTailLabel: String? = nil
                var metaTailURL: URL? = nil
                if i + 1 < lines.count {
                    let metaLine = lines[i + 1].trimmingCharacters(in: .whitespaces)
                    if !metaLine.isEmpty && !metaLine.hasPrefix("#") {
                        // Pull markdown-link out of meta line — typically
                        // the comments URL on HN-shape data.
                        let metaNS = metaLine as NSString
                        if let lm = mdLinkRegex.matches(in: metaLine, range: NSRange(location: 0, length: metaNS.length)).last {
                            metaTailLabel = metaNS.substring(with: lm.range(at: 1))
                            metaTailURL = URL(string: metaNS.substring(with: lm.range(at: 2)))
                        }
                        // Strip the markdown link out of the displayed
                        // string so the card chrome stays clean — the
                        // tail link is rendered as its own affordance.
                        let stripped = mdLinkRegex.stringByReplacingMatches(
                            in: metaLine,
                            range: NSRange(location: 0, length: metaNS.length),
                            withTemplate: ""
                        )
                        metaPlain = stripped
                            .components(separatedBy: " · ")
                            .map { $0.trimmingCharacters(in: .whitespaces) }
                            .filter { !$0.isEmpty }
                        i += 1   // consume meta line
                    }
                }

                items.append(ListItem(
                    rank: rank,
                    title: title,
                    url: url,
                    domain: domain,
                    metaPlain: metaPlain,
                    metaTailLabel: metaTailLabel,
                    metaTailURL: metaTailURL
                ))
            }
            i += 1
        }
        return items
    }
}

// MARK: Renderers

/// List-shape renderer. Each item is a card with title (serif),
/// domain (small-caps top-right), meta (sans separators), and an
/// optional tail link (typically "37 comments"). Hairline borders,
/// no shadow lift — flat per the craft rules.
struct ListGridView: View {
    let items: [ListItem]

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(items) { item in
                ListItemCard(item: item)
            }
        }
    }
}

/// SwiftUI port of the Next.js `WorkSurface` primitive used by
/// `/llm-wiki` and other Vellum surfaces. Paper-tone background +
/// hairline border + r-4 rounded corner. Density="regular" maps to
/// 1.12rem padding (≈18pt). The rendering target is "looks unmistakably
/// like a Loom Vellum surface" so captures share visual language with
/// every other in-Loom view.
struct WorkSurfaceCard<Content: View>: View {
    var density: CGFloat = 18
    var tone: Tone = .quiet
    @ViewBuilder var content: () -> Content

    enum Tone { case `default`, quiet }

    var body: some View {
        content()
            .padding(.horizontal, density - 2)
            .padding(.vertical, density)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(LoomTokens.paper.opacity(tone == .quiet ? 0.45 : 0.85))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(LoomTokens.hair, lineWidth: 0.5)
            )
    }
}

private struct ListItemCard: View {
    let item: ListItem
    @Environment(\.openURL) private var openURL

    var body: some View {
        WorkSurfaceCard {
            VStack(alignment: .leading, spacing: 8) {
                // Eyebrow row: rank + domain (smallcaps · accent tone),
                // mirrors WorkEyebrow component on Next.js side.
                HStack(spacing: 6) {
                    if let r = item.rank {
                        Text("№ \(r)")
                            .font(.system(size: 10, design: .serif).smallCaps())
                            .foregroundStyle(LoomTokens.thread)
                            .tracking(0.6)
                    }
                    if let domain = item.domain {
                        if item.rank != nil {
                            Text("·")
                                .font(.system(size: 10))
                                .foregroundStyle(LoomTokens.ink3)
                        }
                        Text(domain)
                            .font(.system(size: 10, design: .serif).smallCaps())
                            .foregroundStyle(LoomTokens.ink3)
                            .tracking(0.4)
                    }
                    Spacer(minLength: 0)
                }
                // Title — display weight, serif, the visually loudest
                // element of the card. Clickable.
                titleLine
                if !item.metaPlain.isEmpty || item.metaTailURL != nil {
                    metaLine
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if let u = item.url { openURL(u) }
        }
    }

    @ViewBuilder
    private var titleLine: some View {
        if let url = item.url {
            Button {
                openURL(url)
            } label: {
                Text(item.title)
                    .font(.system(size: 16, weight: .medium, design: .serif))
                    .foregroundStyle(LoomTokens.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .lineSpacing(2)
            }
            .buttonStyle(.plain)
        } else {
            Text(item.title)
                .font(.system(size: 16, weight: .medium, design: .serif))
                .foregroundStyle(LoomTokens.ink)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder
    private var metaLine: some View {
        HStack(spacing: 6) {
            if !item.metaPlain.isEmpty {
                Text(item.metaPlain.joined(separator: " · "))
                    .font(.system(size: 11, design: .serif))
                    .foregroundStyle(LoomTokens.ink2)
            }
            if let tail = item.metaTailLabel, let tailURL = item.metaTailURL {
                if !item.metaPlain.isEmpty {
                    Text("·")
                        .foregroundStyle(LoomTokens.ink3)
                        .font(.system(size: 11))
                }
                Button {
                    openURL(tailURL)
                } label: {
                    Text(tail)
                        .font(.system(size: 11, design: .serif))
                        .foregroundStyle(LoomTokens.thread)
                        .underline()
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }
}
