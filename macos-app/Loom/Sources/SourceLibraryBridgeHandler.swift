import Foundation
import WebKit

/// Reply bridge for source-library shelf edits from the static `/sources`
/// page. The shipped Loom app has no Next.js API server, so source-library
/// mutations that use `/api/source-library/*` in browser/dev mode are routed
/// here in native mode.
///
/// Writes are intentionally confined to Loom's Application Support user-data
/// root. The selected content root, e.g. a user's "Knowledge System" folder,
/// is read-only source material and must never receive shelf metadata writes.
///
/// JS:
///   `window.webkit.messageHandlers.loomSourceLibrary.postMessage({ action, ... })`
///     -> `{ groups: [{ id, label, order, count, categories }] }`
@MainActor
final class SourceLibraryBridgeHandler: NSObject, WKScriptMessageHandlerWithReply {
    static let name = "loomSourceLibrary"

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let payload = message.body as? [String: Any],
              let action = payload["action"] as? String else {
            replyHandler(nil, "missing action")
            return
        }

        do {
            let groups = try SourceLibraryNativeStore.mutate(action: action, payload: payload)
            replyHandler(["groups": groups], nil)
        } catch {
            replyHandler(nil, error.localizedDescription)
        }
    }
}

enum SourceLibraryNativeStore {
    private static let fallbackGroupId = "ungrouped"
    private static let fallbackGroupLabel = "Ungrouped"
    private static let defaultOrder = 9999.0
    private static let fileManager = FileManager.default

    static func metadataPayload() throws -> [String: Any] {
        let metadata = try loadMetadata()
        return metadataDictionary(metadata)
    }

    static func mutate(action: String, payload: [String: Any]) throws -> [[String: Any]] {
        var metadata = try loadMetadata()

        switch action {
        case "createGroup":
            let label = try requiredLabel(payload["label"], "Group label is required")
            if metadata.groups.contains(where: { $0.label.caseInsensitiveCompare(label) == .orderedSame }) {
                throw error("Group label already exists")
            }
            metadata.groups.append(SourceLibraryGroupRecord(
                id: UUID().uuidString,
                label: label,
                order: nextGroupOrder(metadata.groups)
            ))

        case "renameGroup":
            let groupId = try requiredString(payload["groupId"], "Group id is required")
            let label = try requiredLabel(payload["label"], "Group label is required")
            if groupId == fallbackGroupId { throw error("Ungrouped cannot be renamed") }
            guard metadata.groups.contains(where: { $0.id == groupId }) else {
                throw error("Unknown group id")
            }
            if metadata.groups.contains(where: { $0.id != groupId && $0.label.caseInsensitiveCompare(label) == .orderedSame }) {
                throw error("Group label already exists")
            }
            metadata.groups = metadata.groups.map { group in
                group.id == groupId
                    ? SourceLibraryGroupRecord(id: group.id, label: label, order: group.order)
                    : group
            }

        case "deleteGroup":
            let groupId = try requiredString(payload["groupId"], "Group id is required")
            if groupId == fallbackGroupId { throw error("Ungrouped cannot be deleted") }
            guard metadata.groups.contains(where: { $0.id == groupId }) else {
                throw error("Unknown group id")
            }
            metadata.groups.removeAll { $0.id == groupId }
            metadata.memberships = metadata.memberships.map { membership in
                membership.groupId == groupId
                    ? SourceLibraryMembershipRecord(
                        categorySlug: membership.categorySlug,
                        groupId: fallbackGroupId,
                        order: membership.order,
                        hidden: membership.hidden
                    )
                    : membership
            }

        case "assignCategory":
            let categorySlug = try requiredString(payload["categorySlug"], "Category slug is required")
            let groupId = try requiredString(payload["groupId"], "Group id is required")
            try validateSourceCategory(categorySlug)
            guard metadata.groups.contains(where: { $0.id == groupId }) else {
                throw error("Unknown group id")
            }
            metadata.memberships.removeAll { $0.categorySlug == categorySlug }
            metadata.memberships.append(SourceLibraryMembershipRecord(
                categorySlug: categorySlug,
                groupId: groupId,
                order: defaultOrder,
                hidden: nil
            ))

        case "hideCategory":
            let categorySlug = try requiredString(payload["categorySlug"], "Category slug is required")
            try validateSourceCategory(categorySlug)
            let existing = metadata.memberships.first { $0.categorySlug == categorySlug }
            metadata.memberships.removeAll { $0.categorySlug == categorySlug }
            metadata.memberships.append(SourceLibraryMembershipRecord(
                categorySlug: categorySlug,
                groupId: existing?.groupId ?? fallbackGroupId,
                order: existing?.order ?? defaultOrder,
                hidden: true
            ))

        default:
            throw error("Unknown source-library action")
        }

        metadata = normalize(metadata)
        try persist(metadata)
        return try groupsPayload(metadata: metadata)
    }

    private static func loadMetadata() throws -> SourceLibraryMetadata {
        for url in metadataReadURLs() {
            guard fileManager.fileExists(atPath: url.path) else { continue }
            do {
                let data = try Data(contentsOf: url)
                return normalize(try JSONDecoder().decode(SourceLibraryMetadata.self, from: data))
            } catch {
                throw self.error("Unable to read source library metadata")
            }
        }
        return normalize(SourceLibraryMetadata(groups: [], memberships: []))
    }

    private static func persist(_ metadata: SourceLibraryMetadata) throws {
        let data = try JSONEncoder.sortedPretty.encode(normalize(metadata))
        var lastError: Error?
        var wrote = false

        for url in metadataWriteURLs() {
            do {
                try fileManager.createDirectory(
                    at: url.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try data.write(to: url, options: .atomic)
                wrote = true
            } catch {
                lastError = error
            }
        }

        if !wrote {
            throw lastError ?? self.error("Unable to write source library metadata")
        }
    }

    private static func metadataReadURLs() -> [URL] {
        var urls = [userDataMetadataURL()]
        if let mirror = contentRootMetadataURL() {
            urls.append(mirror)
        }
        return urls
    }

    private static func metadataWriteURLs() -> [URL] {
        [userDataMetadataURL()]
    }

    private static func userDataMetadataURL() -> URL {
        URL(fileURLWithPath: LoomRuntimePaths.appSupportRoot())
            .appendingPathComponent("user-data", isDirectory: true)
            .appendingPathComponent("knowledge", isDirectory: true)
            .appendingPathComponent("manifest", isDirectory: true)
            .appendingPathComponent("source-library-groups.json")
    }

    private static func contentRootMetadataURL() -> URL? {
        contentRootURL()?
            .appendingPathComponent("knowledge", isDirectory: true)
            .appendingPathComponent(".cache", isDirectory: true)
            .appendingPathComponent("manifest", isDirectory: true)
            .appendingPathComponent("source-library-groups.json")
    }

    private static func contentRootNavURL() -> URL? {
        contentRootURL()?
            .appendingPathComponent("knowledge", isDirectory: true)
            .appendingPathComponent(".cache", isDirectory: true)
            .appendingPathComponent("manifest", isDirectory: true)
            .appendingPathComponent("knowledge-nav.json")
    }

    private static func contentRootURL() -> URL? {
        if let active = SecurityScopedFolderStore.currentActiveURL {
            return active
        }
        if let path = LoomRuntimePaths.resolveContentRoot() {
            return URL(fileURLWithPath: path)
        }
        return nil
    }

    private static func normalize(_ metadata: SourceLibraryMetadata) -> SourceLibraryMetadata {
        var groupsById: [String: SourceLibraryGroupRecord] = [:]
        for group in metadata.groups {
            let id = group.id.trimmingCharacters(in: .whitespacesAndNewlines)
            let label = normalizeLabel(group.label)
            guard !id.isEmpty, !label.isEmpty else { continue }
            groupsById[id] = SourceLibraryGroupRecord(id: id, label: label, order: group.order)
        }
        groupsById[fallbackGroupId] = fallbackGroup()

        let validGroupIds = Set(groupsById.keys)
        var membershipsBySlug: [String: SourceLibraryMembershipRecord] = [:]
        for membership in metadata.memberships {
            let slug = membership.categorySlug.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !slug.isEmpty else { continue }
            let groupId = validGroupIds.contains(membership.groupId)
                ? membership.groupId
                : fallbackGroupId
            membershipsBySlug[slug] = SourceLibraryMembershipRecord(
                categorySlug: slug,
                groupId: groupId,
                order: membership.order,
                hidden: membership.hidden == true ? true : nil
            )
        }

        return SourceLibraryMetadata(
            groups: groupsById.values.sorted(by: sortGroup),
            memberships: membershipsBySlug.values.sorted(by: sortMembership)
        )
    }

    private static func groupsPayload(metadata: SourceLibraryMetadata) throws -> [[String: Any]] {
        let categories = try sourceCategories()
        let membershipByCategory = Dictionary(uniqueKeysWithValues: metadata.memberships.map {
            ($0.categorySlug, $0)
        })

        var buckets: [String: [SourceLibraryCategoryRecord]] = Dictionary(
            uniqueKeysWithValues: metadata.groups.map { ($0.id, []) }
        )

        for category in categories {
            let membership = membershipByCategory[category.slug]
            if membership?.hidden == true { continue }
            let groupId = membership.flatMap { buckets[$0.groupId] != nil ? $0.groupId : nil }
                ?? fallbackGroupId
            buckets[groupId, default: []].append(category)
        }

        return metadata.groups.sorted(by: sortGroup).map { group in
            let sortedCategories = (buckets[group.id] ?? []).sorted { lhs, rhs in
                let lhsOrder = membershipByCategory[lhs.slug]?.order ?? defaultOrder
                let rhsOrder = membershipByCategory[rhs.slug]?.order ?? defaultOrder
                if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
                return lhs.label.localizedCaseInsensitiveCompare(rhs.label) == .orderedAscending
            }
            return [
                "id": group.id,
                "label": group.label,
                "order": group.order,
                "count": sortedCategories.count,
                "categories": sortedCategories.map(\.slug),
            ]
        }
    }

    private static func metadataDictionary(_ metadata: SourceLibraryMetadata) -> [String: Any] {
        [
            "groups": metadata.groups.map { group in
                [
                    "id": group.id,
                    "label": group.label,
                    "order": group.order,
                ]
            },
            "memberships": metadata.memberships.map { membership in
                var row: [String: Any] = [
                    "categorySlug": membership.categorySlug,
                    "groupId": membership.groupId,
                    "order": membership.order,
                ]
                if membership.hidden == true {
                    row["hidden"] = true
                }
                return row
            },
        ]
    }

    private static func sourceCategories() throws -> [SourceLibraryCategoryRecord] {
        guard let navURL = contentRootNavURL(),
              fileManager.fileExists(atPath: navURL.path) else {
            return []
        }
        let data = try Data(contentsOf: navURL)
        let nav = try JSONDecoder().decode(SourceLibraryNavPayload.self, from: data)
        return nav.knowledgeCategories.filter { $0.kind != "wiki" }
    }

    private static func validateSourceCategory(_ slug: String) throws {
        let categories = try sourceCategories()
        guard categories.contains(where: { $0.slug == slug }) else {
            throw error("Unknown category slug")
        }
    }

    private static func nextGroupOrder(_ groups: [SourceLibraryGroupRecord]) -> Double {
        let orders = groups
            .filter { $0.id != fallbackGroupId }
            .map(\.order)
        return (orders.max() ?? -1) + 1
    }

    private static func fallbackGroup() -> SourceLibraryGroupRecord {
        SourceLibraryGroupRecord(id: fallbackGroupId, label: fallbackGroupLabel, order: defaultOrder)
    }

    private static func normalizeLabel(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
    }

    private static func requiredString(_ value: Any?, _ message: String) throws -> String {
        guard let value = value as? String else { throw error(message) }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw error(message) }
        return trimmed
    }

    private static func requiredLabel(_ value: Any?, _ message: String) throws -> String {
        let label = normalizeLabel(try requiredString(value, message))
        guard !label.isEmpty else { throw error(message) }
        return label
    }

    private static func sortGroup(_ lhs: SourceLibraryGroupRecord, _ rhs: SourceLibraryGroupRecord) -> Bool {
        if lhs.order != rhs.order { return lhs.order < rhs.order }
        return lhs.label.localizedCaseInsensitiveCompare(rhs.label) == .orderedAscending
    }

    private static func sortMembership(
        _ lhs: SourceLibraryMembershipRecord,
        _ rhs: SourceLibraryMembershipRecord
    ) -> Bool {
        if lhs.order != rhs.order { return lhs.order < rhs.order }
        return lhs.categorySlug < rhs.categorySlug
    }

    private static func error(_ message: String) -> NSError {
        NSError(
            domain: "LoomSourceLibrary",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

private struct SourceLibraryMetadata: Codable {
    var groups: [SourceLibraryGroupRecord]
    var memberships: [SourceLibraryMembershipRecord]
}

private struct SourceLibraryGroupRecord: Codable {
    var id: String
    var label: String
    var order: Double

    init(id: String, label: String, order: Double) {
        self.id = id
        self.label = label
        self.order = order
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = (try? container.decode(String.self, forKey: .id)) ?? ""
        label = (try? container.decode(String.self, forKey: .label)) ?? ""
        order = (try? container.decode(Double.self, forKey: .order)) ?? 9999
    }
}

private struct SourceLibraryMembershipRecord: Codable {
    var categorySlug: String
    var groupId: String
    var order: Double
    var hidden: Bool?

    init(categorySlug: String, groupId: String, order: Double, hidden: Bool?) {
        self.categorySlug = categorySlug
        self.groupId = groupId
        self.order = order
        self.hidden = hidden
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        categorySlug = (try? container.decode(String.self, forKey: .categorySlug)) ?? ""
        groupId = (try? container.decode(String.self, forKey: .groupId)) ?? "ungrouped"
        order = (try? container.decode(Double.self, forKey: .order)) ?? 9999
        hidden = try? container.decode(Bool.self, forKey: .hidden)
    }
}

private struct SourceLibraryNavPayload: Decodable {
    var knowledgeCategories: [SourceLibraryCategoryRecord]

    private enum CodingKeys: String, CodingKey {
        case knowledgeCategories
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        knowledgeCategories = (try? container.decode([SourceLibraryCategoryRecord].self, forKey: .knowledgeCategories)) ?? []
    }
}

private struct SourceLibraryCategoryRecord: Decodable {
    var slug: String
    var label: String
    var kind: String

    private enum CodingKeys: String, CodingKey {
        case slug, label, kind
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        slug = (try? container.decode(String.self, forKey: .slug)) ?? ""
        label = (try? container.decode(String.self, forKey: .label)) ?? slug
        kind = (try? container.decode(String.self, forKey: .kind)) ?? "source"
    }
}

private extension JSONEncoder {
    static var sortedPretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
