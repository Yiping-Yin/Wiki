import Foundation
import SwiftData

/// Loom's Swift-side data model, Phase 2 of the architecture inversion.
///
/// Using SwiftData (macOS 14+) rather than Core Data's `.xcdatamodeld`
/// bundles — declarative `@Model` classes, simpler migration story,
/// less boilerplate, and no Xcode-only asset to edit.
///
/// This file declares the durable shape. Dynamic JSON (event streams on a
/// trace, rendered body on a panel) is stored as serialized String for now
/// so we can move the storage layer without forcing every caller to adopt
/// the new shape at once — the web layer still reads the same JSON shape
/// via message handlers in Phase 3.

// MARK: - LoomTrace

@Model
final class LoomTrace {
    @Attribute(.unique) var id: String

    /// 'reading' | 'problem' | 'concept' | 'free' — one of TraceKind.
    var kind: String

    /// Parent trace id for tree structure (nil = root).
    var parentId: String?

    /// Source doc id when this trace is anchored to a document.
    var sourceDocId: String?
    var sourceTitle: String?
    var sourceHref: String?

    /// Unix ms timestamps.
    var createdAt: Double
    var updatedAt: Double

    /// Serialized events array. Keeping this as opaque JSON during the
    /// migration phase so the web-side TraceEvent schema can stay the
    /// source of truth while we swap storage layers.
    var eventsJSON: String

    /// Summary materialised from folding the event log; written by the
    /// Swift side after each append. Empty string when no events yet.
    var currentSummary: String

    init(
        id: String,
        kind: String,
        parentId: String? = nil,
        sourceDocId: String? = nil,
        sourceTitle: String? = nil,
        sourceHref: String? = nil,
        createdAt: Double,
        updatedAt: Double,
        eventsJSON: String = "[]",
        currentSummary: String = ""
    ) {
        self.id = id
        self.kind = kind
        self.parentId = parentId
        self.sourceDocId = sourceDocId
        self.sourceTitle = sourceTitle
        self.sourceHref = sourceHref
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.eventsJSON = eventsJSON
        self.currentSummary = currentSummary
    }
}

// MARK: - LoomPanel

@Model
final class LoomPanel {
    @Attribute(.unique) var id: String

    var docId: String?

    /// 'draft' | 'provisional' | 'crystallized' etc.
    var status: String

    var title: String

    /// Rendered anchor body JSON.
    var bodyJSON: String

    var createdAt: Double
    var updatedAt: Double

    init(
        id: String,
        docId: String? = nil,
        status: String,
        title: String,
        bodyJSON: String = "{}",
        createdAt: Double,
        updatedAt: Double
    ) {
        self.id = id
        self.docId = docId
        self.status = status
        self.title = title
        self.bodyJSON = bodyJSON
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - LoomWeave

@Model
final class LoomWeave {
    @Attribute(.unique) var id: String

    var fromPanelId: String
    var toPanelId: String

    /// Relation kind, e.g. 'supports' | 'contradicts' | 'elaborates'.
    var kind: String

    /// Short freeform justification.
    var rationale: String

    var createdAt: Double
    var updatedAt: Double

    init(
        id: String,
        fromPanelId: String,
        toPanelId: String,
        kind: String,
        rationale: String = "",
        createdAt: Double,
        updatedAt: Double
    ) {
        self.id = id
        self.fromPanelId = fromPanelId
        self.toPanelId = toPanelId
        self.kind = kind
        self.rationale = rationale
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - LoomPursuit

/// Top-level "question the mind is holding." Users mint pursuits via the
/// Edit-menu "Hold a Question…" item or ⌘⇧P. Sources and panels attach
/// into a pursuit as the learner reads / crystallizes under its banner.
///
/// Array-valued fields (`sourceDocIds`, `panelIds`) are stored as
/// JSON-encoded strings rather than Swift arrays. SwiftData on macOS 14
/// has edge-case bugs when `[String]` collides with `@Attribute(.unique)`
/// predicates in the same `@Model`; the JSON-string workaround mirrors
/// `LoomTrace.eventsJSON` and keeps the storage shape stable if we ever
/// promote the attachments to first-class rows.
@Model
final class LoomPursuit {
    @Attribute(.unique) var id: String

    /// The actual question being held. First-class surface text.
    var question: String

    /// 'primary' | 'secondary' | 'tertiary' — attentional weight.
    var weight: String

    /// 'active' | 'waiting' | 'held' | 'retired' | 'contradicted'.
    var season: String

    /// JSON-encoded `[String]` of source doc ids gathered under this
    /// pursuit. Use `LoomPursuit.decodedSourceDocIds` to read, and the
    /// writer helpers to append/remove; don't mutate the JSON by hand.
    var sourceDocIdsJSON: String

    /// JSON-encoded `[String]` of panel ids crystallized within this
    /// pursuit. Same access pattern as `sourceDocIdsJSON`.
    var panelIdsJSON: String

    var createdAt: Double
    var updatedAt: Double

    /// Set when the user marks the pursuit 'held' or 'retired'; nil while
    /// the pursuit is still active / waiting / contradicted.
    var settledAt: Double?

    init(
        id: String,
        question: String,
        weight: String,
        season: String,
        sourceDocIdsJSON: String = "[]",
        panelIdsJSON: String = "[]",
        createdAt: Double,
        updatedAt: Double,
        settledAt: Double? = nil
    ) {
        self.id = id
        self.question = question
        self.weight = weight
        self.season = season
        self.sourceDocIdsJSON = sourceDocIdsJSON
        self.panelIdsJSON = panelIdsJSON
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.settledAt = settledAt
    }

    /// Decoded view of `sourceDocIdsJSON`. Empty array on malformed JSON.
    var decodedSourceDocIds: [String] {
        Self.decodeStringArray(sourceDocIdsJSON)
    }

    /// Decoded view of `panelIdsJSON`. Empty array on malformed JSON.
    var decodedPanelIds: [String] {
        Self.decodeStringArray(panelIdsJSON)
    }

    static func decodeStringArray(_ json: String) -> [String] {
        guard let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [String] else {
            return []
        }
        return arr
    }

    static func encodeStringArray(_ arr: [String]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: arr, options: []),
              let text = String(data: data, encoding: .utf8) else {
            return "[]"
        }
        return text
    }
}

// MARK: - LoomSoanCard

/// A single card on the Sōan "thinking draft table." Cards are the
/// learner's working pieces — thesis, counter, instance, question, fog,
/// weft, sketch — placed in pixel-space so the arrangement itself carries
/// meaning (proximity = relatedness, two columns = tension, etc.).
///
/// Position + size are stored as `Double` so we can translate directly
/// into the web's `left`/`top`/`width` CSS values without coercion. The
/// web-side shape (`SoanClient`'s `Card` type) mirrors these fields —
/// keep them in sync when either side adds a property.
///
/// `source` is an optional "Book · section" attribution shown at the
/// bottom of the card when the piece came from a specific passage; empty
/// string means "no source" so we don't need a separate optional.
@Model
final class LoomSoanCard {
    @Attribute(.unique) var id: String

    /// 'thesis' | 'instance' | 'counter' | 'question' | 'fog' | 'weft' | 'sketch'.
    var kind: String

    /// Short title — usually empty for non-thesis kinds; the web treats
    /// it as optional and falls back to a truncated body excerpt.
    var title: String

    /// Main content. First-class surface text; the card IS its body.
    var body: String

    /// "Book · section" attribution when the card came from a source.
    /// Empty string when the card is pure thinking (fog, sketch, etc.).
    var source: String

    /// Canvas coordinates in CSS px, top-left anchored.
    var x: Double
    var y: Double

    /// Card dimensions in CSS px. Defaults sized for a typical thesis /
    /// instance (260×120); the learner can resize in a later tick without
    /// touching the schema.
    var width: Double
    var height: Double

    var createdAt: Double
    var updatedAt: Double

    init(
        id: String,
        kind: String,
        title: String = "",
        body: String,
        source: String = "",
        x: Double,
        y: Double,
        width: Double = 260,
        height: Double = 120,
        createdAt: Double,
        updatedAt: Double
    ) {
        self.id = id
        self.kind = kind
        self.title = title
        self.body = body
        self.source = source
        self.x = x
        self.y = y
        self.width = width
        self.height = height
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

// MARK: - LoomSoanEdge

/// Directed relation between two Sōan cards. Two kinds today: `support`
/// (a card reinforces another) and `echo` (a card rhymes with another,
/// dashed line). Stored as its own row rather than embedded on the card
/// so a card can participate in many relations without rewriting its
/// body each time, and so deleting one edge doesn't invalidate another.
@Model
final class LoomSoanEdge {
    @Attribute(.unique) var id: String

    var fromCardId: String
    var toCardId: String

    /// 'support' | 'echo'.
    var kind: String

    var createdAt: Double

    init(
        id: String,
        fromCardId: String,
        toCardId: String,
        kind: String,
        createdAt: Double
    ) {
        self.id = id
        self.fromCardId = fromCardId
        self.toCardId = toCardId
        self.kind = kind
        self.createdAt = createdAt
    }
}

// MARK: - LoomDataSchema

/// Central list of `@Model` types, passed to `ModelContainer` at init.
/// Extend this tuple every time a new model is added; the container will
/// migrate storage automatically.
enum LoomDataSchema {
    static let models: [any PersistentModel.Type] = [
        LoomTrace.self,
        LoomPanel.self,
        LoomWeave.self,
        LoomPursuit.self,
        LoomSoanCard.self,
        LoomSoanEdge.self,
    ]
}
