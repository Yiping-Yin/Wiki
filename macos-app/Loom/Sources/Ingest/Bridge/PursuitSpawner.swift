import Foundation

/// Phase 7.2 · Spawn Pursuits from `SyllabusSchema.assessmentItems`.
///
/// Called from `IngestionView.persistExtractedTrace` immediately after
/// a `.extracted` SyllabusSchema is saved (Q3 of plan §8 locked: ingest
/// time, not visit time, with per-pursuit `hide` toggle so the user
/// can dismiss individual auto-spawned Pursuits without losing them).
///
/// Discipline (constraints from the task spec, restated):
///
///   - **Verbatim from schema** (`feedback_extract_not_author.md`).
///     Pursuit `question` = `name.value` from the assessment item, no
///     AI rephrasing. Body is composed by string concat from the same
///     extracted fields. Plan §9 non-goal #7 ("no AI-authored Pursuit
///     question phrasing") lives here.
///   - **Curiosity-led, not quiz-led** (`feedback_curiosity_led_not_quiz_led.md`).
///     A spawned Pursuit is a *work item* the user can navigate to —
///     not a question the AI is asking the user. The wording reflects
///     the syllabus author's voice, not Loom's.
///   - **Idempotent** (deliverable E). Re-running Extract on the same
///     source must not duplicate Pursuits. Idempotency key is
///     `(sourceDocId, name.value)` — a small set, queried by walking
///     `LoomPursuitWriter.allPursuits()` and checking the source-doc
///     attachment + question equality.
///   - **Skip notFound titles**. If `name` is `.notFound` we cannot
///     produce a meaningful Pursuit title from it — silently skip the
///     item rather than mint a Pursuit with empty title.
///   - **Tertiary weight**. Auto-seeded Pursuits land "at the horizon"
///     by default (plan §5.2). The user promotes them as they study.
///
/// The function is fail-silent at the per-item level — if one
/// assessment item fails to spawn a Pursuit (e.g. SwiftData throws),
/// log + continue with the rest. Persistence failures upstream are
/// already swallowed in `IngestionView` for the same reason: we never
/// kill the Extract UX over a downstream side-effect.
@MainActor
enum PursuitSpawner {

    /// Walk a successfully-extracted `SyllabusSchema` and spawn one
    /// Pursuit per assessment item with a found `name`. Idempotency
    /// is enforced inline via `existingTitlesForSource`.
    ///
    /// Internal — the spec sketches `public` but `SyllabusSchema` and
    /// the rest of the Ingest stack are module-internal, so a `public`
    /// signature would violate Swift's access-control rules. The
    /// caller in `IngestionView` is also module-internal so internal
    /// is sufficient. A future re-seed migration utility (plan §6 7.4
    /// deferred) can still call this directly with a re-decoded
    /// schema; nothing about the contract changes.
    static func spawn(
        from schema: SyllabusSchema,
        sourceTraceId: String,
        sourceDocId: String,
        sourceTitle: String
    ) async {
        let existingTitles = existingTitlesForSource(sourceDocId: sourceDocId)
        for item in schema.assessmentItems {
            guard let name = foundString(item.name), !name.isEmpty else {
                // notFound name → skip silently. We never spawn a
                // Pursuit with an empty title (deliverable A).
                continue
            }
            // Idempotency (deliverable E): if a Pursuit already exists
            // attached to this sourceDocId AND with this title, skip.
            if existingTitles.contains(name) {
                continue
            }
            let body = composeBody(item: item)
            let question = name
            do {
                let pursuit = try LoomPursuitWriter.createPursuit(
                    question: question,
                    weight: "tertiary"
                )
                try LoomPursuitWriter.attachSource(
                    pursuitId: pursuit.id,
                    sourceDocId: sourceDocId
                )
                // Stash extra metadata in the pursuit-spawn sidecar so
                // the web UI can render the "from syllabus" eyebrow +
                // body line without requiring schema changes on
                // LoomPursuit (deliverable D).
                PursuitSpawnMetaStore.append(
                    pursuitId: pursuit.id,
                    sourceTraceId: sourceTraceId,
                    sourceDocId: sourceDocId,
                    sourceTitle: sourceTitle,
                    extractorId: SyllabusPDFExtractor.extractorId,
                    fieldPath: "assessmentItems[\(indexOf(name: name, in: schema.assessmentItems))].name",
                    body: body
                )
            } catch {
                NSLog("[Loom] PursuitSpawner.spawn failed for \(name): \(error)")
                continue
            }
        }
    }

    // MARK: - Helpers

    /// Compose the Pursuit body verbatim from extracted fields. Lines
    /// with `.notFound` fields are simply omitted — never the literal
    /// "not_found" string (deliverable A constraint). Format:
    ///
    ///   {weightPercent.value}% · due {dueDate.value}
    ///   {format.value}
    ///
    /// The body is intentionally short. Loom Pursuits surface
    /// `question` as the dominant text; the body line is a one-glance
    /// reminder of weight + due date.
    static func composeBody(item: AssessmentSchema) -> String {
        var lines: [String] = []
        var firstLine = ""
        if let weight = foundDouble(item.weightPercent) {
            // Strip trailing zeros for clean formatting (35.0 → 35,
            // 12.5 → 12.5). Mirrors the syllabus author's likely
            // phrasing — they write "35%", not "35.0%".
            firstLine += "\(formatPercent(weight))%"
        }
        if let due = foundString(item.dueDate), !due.isEmpty {
            if !firstLine.isEmpty {
                firstLine += " · due \(due)"
            } else {
                firstLine = "due \(due)"
            }
        }
        if !firstLine.isEmpty {
            lines.append(firstLine)
        }
        if let format = foundString(item.format), !format.isEmpty {
            lines.append(format)
        }
        return lines.joined(separator: "\n")
    }

    /// Return the set of Pursuit `question` strings that are already
    /// attached to the given sourceDocId. Used as the idempotency
    /// guard; small data volumes (low-tens of pursuits per course
    /// even at scale) so a linear scan is fine — no need to add a
    /// `LoomPursuitWriter` predicate-by-source query.
    static func existingTitlesForSource(sourceDocId: String) -> Set<String> {
        let pursuits: [LoomPursuit]
        do {
            pursuits = try LoomPursuitWriter.allPursuits()
        } catch {
            NSLog("[Loom] PursuitSpawner.existingTitlesForSource failed: \(error)")
            return []
        }
        var titles = Set<String>()
        for pursuit in pursuits {
            let attached = pursuit.decodedSourceDocIds
            guard attached.contains(sourceDocId) else { continue }
            titles.insert(pursuit.question)
        }
        return titles
    }

    /// Pull the `value` out of a `FieldResult<String>`, or `nil` when
    /// `.notFound` (the silent-skip case).
    private static func foundString(_ result: FieldResult<String>) -> String? {
        if case .found(let value, _, _) = result { return value }
        return nil
    }

    /// Pull the `value` out of a `FieldResult<Double>`, or `nil` when
    /// `.notFound`.
    private static func foundDouble(_ result: FieldResult<Double>) -> Double? {
        if case .found(let value, _, _) = result { return value }
        return nil
    }

    /// Format a percentage value without redundant trailing zeros.
    /// `35.0` → `"35"`, `12.5` → `"12.5"`, `33.333` → `"33.33"`.
    /// Matches the way the syllabus PDF likely renders the figure.
    private static func formatPercent(_ value: Double) -> String {
        if value == value.rounded() {
            return String(Int(value))
        }
        return String(format: "%.2f", value)
            .replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\.$"#, with: "", options: .regularExpression)
    }

    /// Find the index of an assessment item by its `name.value` in the
    /// schema's `assessmentItems`. Used solely to record a stable
    /// `fieldPath` in the spawn sidecar so future schema corrections
    /// can target the same item. Returns `0` on no-match (defensive —
    /// the caller has already filtered for `.found` names).
    private static func indexOf(
        name target: String,
        in items: [AssessmentSchema]
    ) -> Int {
        for (i, item) in items.enumerated() {
            if let value = foundString(item.name), value == target {
                return i
            }
        }
        return 0
    }
}
