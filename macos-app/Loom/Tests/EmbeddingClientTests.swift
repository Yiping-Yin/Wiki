import XCTest

@testable import Loom

final class EmbeddingClientTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EmbeddingClient.resetCache()
    }

    // MARK: cacheKey — deterministic, non-trivial collision behavior

    func testCacheKeyIsStableForSameText() {
        let a = EmbeddingClient.cacheKey("a deterministic phrase")
        let b = EmbeddingClient.cacheKey("a deterministic phrase")
        XCTAssertEqual(a, b)
    }

    func testCacheKeyDiffersForDifferentText() {
        let a = EmbeddingClient.cacheKey("first passage")
        let b = EmbeddingClient.cacheKey("second passage")
        XCTAssertNotEqual(a, b)
    }

    func testCacheKeyIncludesLengthSuffix() {
        // Length suffix prevents collisions on short hashes.
        let a = EmbeddingClient.cacheKey("hi")
        XCTAssertTrue(a.hasSuffix(":2"))
        let b = EmbeddingClient.cacheKey("hi there")
        XCTAssertTrue(b.hasSuffix(":8"))
    }

    // MARK: Failure taxonomy

    func testEmptyTextFailureSurfaces() {
        do {
            _ = try EmbeddingClient.embed("")
            XCTFail("expected emptyText failure")
        } catch let failure as EmbeddingClient.Failure {
            XCTAssertEqual(failure, .emptyText)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }

    func testShortTextFailureSurfaces() {
        do {
            _ = try EmbeddingClient.embed("abc")
            XCTFail("expected emptyText failure for <5 chars")
        } catch let failure as EmbeddingClient.Failure {
            XCTAssertEqual(failure, .emptyText)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }

    func testErrorDescriptionsArePopulated() {
        XCTAssertNotNil(EmbeddingClient.Failure.unavailable.errorDescription)
        XCTAssertNotNil(EmbeddingClient.Failure.emptyText.errorDescription)
        XCTAssertNotNil(EmbeddingClient.Failure.embeddingFailed.errorDescription)
    }

    // MARK: Integration — real NLEmbedding call

    /// NLEmbedding is deterministic for the same input on the same
    /// macOS version, so two embeds of the same sentence should return
    /// byte-identical vectors. We can't pin expected contents (Apple
    /// changes models over OS releases) but we can pin invariants.
    func testEmbedRoundTripDimsConsistent() throws {
        let text = "This sentence is long enough to embed meaningfully."
        let first = try EmbeddingClient.embed(text)
        XCTAssertGreaterThan(first.dims, 0)
        XCTAssertEqual(first.vector.count, first.dims)
        XCTAssertEqual(first.model, EmbeddingClient.modelName)

        // Second call hits cache; same vector, same dims.
        let second = try EmbeddingClient.embed(text)
        XCTAssertEqual(second.dims, first.dims)
        XCTAssertEqual(second.vector, first.vector)
    }

    func testEmbedTrimsAndBounds() throws {
        // Leading / trailing whitespace should not produce a different
        // cache entry than the trimmed form.
        let padded = "   Meaningful sentence for embedding.   "
        let clean = try EmbeddingClient.embed("Meaningful sentence for embedding.")
        let paddedResult = try EmbeddingClient.embed(padded)
        XCTAssertEqual(paddedResult.vector, clean.vector)
    }
}
