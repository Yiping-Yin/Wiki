import Foundation
import NaturalLanguage

/// Native text → vector embedding using Apple's `NLEmbedding`. Replaces
/// the Ollama-backed `/api/embed` route. Ships with every macOS install;
/// no external service, no network traffic, App-Store-clean.
///
/// The default English sentence embedding is 512-dim and pre-trained by
/// Apple. It's not as semantically sharp as `nomic-embed-text` or OpenAI
/// `text-embedding-3-small`, but for Loom's use case (find nearby notes
/// by cosine similarity) it's more than enough — and it works offline.
enum EmbeddingClient {
    struct Result {
        let vector: [Double]
        let dims: Int
        let model: String
    }

    enum Failure: Error, LocalizedError, Equatable {
        case unavailable
        case emptyText
        case embeddingFailed

        var errorDescription: String? {
            switch self {
            case .unavailable: return "Apple NLEmbedding not available on this macOS version."
            case .emptyText: return "Text too short to embed."
            case .embeddingFailed: return "NLEmbedding returned no vector."
            }
        }
    }

    private static let maxTextLength = 2000
    private static let lruCapacity = 500
    private static let cacheLock = NSLock()
    private static var cache: [String: [Double]] = [:]
    private static var cacheOrder: [String] = []

    static var modelName: String {
        "apple-nl-sentence-english"
    }

    private static let embedding: NLEmbedding? = {
        if #available(macOS 11.0, *) {
            return NLEmbedding.sentenceEmbedding(for: .english)
        }
        return nil
    }()

    static func embed(_ raw: String) throws -> Result {
        let trimmed = String(raw.prefix(maxTextLength))
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 5 else { throw Failure.emptyText }

        if let cached = lookup(trimmed) {
            return Result(vector: cached, dims: cached.count, model: modelName)
        }

        guard let embedding else { throw Failure.unavailable }
        guard let raw = embedding.vector(for: trimmed) else {
            throw Failure.embeddingFailed
        }

        store(trimmed, raw)
        return Result(vector: raw, dims: raw.count, model: modelName)
    }

    /// Internal cache key — keep this identical in shape to the old
    /// `/api/embed` route so tests comparing determinism can use either.
    static func cacheKey(_ text: String) -> String {
        var h: Int64 = 0
        for scalar in text.unicodeScalars {
            h = ((h << 5) &- h) &+ Int64(scalar.value)
        }
        return "\(h):\(text.count)"
    }

    private static func lookup(_ text: String) -> [Double]? {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        return cache[cacheKey(text)]
    }

    private static func store(_ text: String, _ vector: [Double]) {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        let key = cacheKey(text)
        if cache[key] != nil { return }
        cache[key] = vector
        cacheOrder.append(key)
        while cacheOrder.count > lruCapacity {
            let evicted = cacheOrder.removeFirst()
            cache.removeValue(forKey: evicted)
        }
    }

    /// Test hook — wipe the in-process cache.
    static func resetCache() {
        cacheLock.lock()
        defer { cacheLock.unlock() }
        cache.removeAll()
        cacheOrder.removeAll()
    }
}
