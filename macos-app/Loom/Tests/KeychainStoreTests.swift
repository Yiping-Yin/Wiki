import XCTest

@testable import Loom

/// In-memory fake so unit tests don't touch the real Keychain. Keyed on
/// (service, account) tuples extracted from the query dictionary.
final class FakeKeychainBackend: KeychainBackend {
    private var store: [String: Data] = [:]

    private func key(for query: [String: Any]) -> String? {
        guard let service = query[kSecAttrService as String] as? String,
              let account = query[kSecAttrAccount as String] as? String else { return nil }
        return "\(service)::\(account)"
    }

    func copyMatching(_ query: [String: Any]) -> (OSStatus, CFTypeRef?) {
        guard let key = key(for: query) else { return (errSecParam, nil) }
        guard let data = store[key] else { return (errSecItemNotFound, nil) }
        let wantsData = (query[kSecReturnData as String] as? Bool) == true
        return (errSecSuccess, wantsData ? (data as CFTypeRef) : nil)
    }

    func add(_ attributes: [String: Any]) -> OSStatus {
        guard let key = key(for: attributes),
              let data = attributes[kSecValueData as String] as? Data else {
            return errSecParam
        }
        if store[key] != nil { return errSecDuplicateItem }
        store[key] = data
        return errSecSuccess
    }

    func update(query: [String: Any], attributes: [String: Any]) -> OSStatus {
        guard let key = key(for: query) else { return errSecParam }
        guard store[key] != nil else { return errSecItemNotFound }
        if let newData = attributes[kSecValueData as String] as? Data {
            store[key] = newData
        }
        return errSecSuccess
    }

    func delete(_ query: [String: Any]) -> OSStatus {
        guard let key = key(for: query) else { return errSecParam }
        guard store.removeValue(forKey: key) != nil else { return errSecItemNotFound }
        return errSecSuccess
    }
}

final class KeychainStoreTests: XCTestCase {
    func testWriteReadRoundTrip() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("sk-secret", account: "test.key", backend: fake)
        XCTAssertEqual(KeychainStore.readString(account: "test.key", backend: fake), "sk-secret")
    }

    func testReadReturnsNilWhenMissing() {
        let fake = FakeKeychainBackend()
        XCTAssertNil(KeychainStore.readString(account: "absent.key", backend: fake))
    }

    func testWriteOverwritesExistingValue() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("v1", account: "k", backend: fake)
        try KeychainStore.writeString("v2", account: "k", backend: fake)
        XCTAssertEqual(KeychainStore.readString(account: "k", backend: fake), "v2")
    }

    func testDeleteRemovesValue() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("x", account: "k", backend: fake)
        try KeychainStore.delete(account: "k", backend: fake)
        XCTAssertNil(KeychainStore.readString(account: "k", backend: fake))
    }

    func testDeleteOnMissingKeyIsNotAnError() {
        let fake = FakeKeychainBackend()
        XCTAssertNoThrow(try KeychainStore.delete(account: "never.stored", backend: fake))
    }

    func testDifferentAccountsAreIsolated() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("one", account: KeychainAccount.anthropicAPIKey, backend: fake)
        try KeychainStore.writeString("two", account: KeychainAccount.openAIAPIKey, backend: fake)
        XCTAssertEqual(
            KeychainStore.readString(account: KeychainAccount.anthropicAPIKey, backend: fake),
            "one"
        )
        XCTAssertEqual(
            KeychainStore.readString(account: KeychainAccount.openAIAPIKey, backend: fake),
            "two"
        )
    }

    func testDifferentServicesAreIsolated() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("app", service: "com.loom.app", account: "k", backend: fake)
        try KeychainStore.writeString("dev", service: "com.loom.dev", account: "k", backend: fake)
        XCTAssertEqual(
            KeychainStore.readString(service: "com.loom.app", account: "k", backend: fake),
            "app"
        )
        XCTAssertEqual(
            KeychainStore.readString(service: "com.loom.dev", account: "k", backend: fake),
            "dev"
        )
    }

    // MARK: - applyKeychainSecretsToChildEnv

    func testApplyKeychainSecretsInjectsSetValues() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("sk-a", account: KeychainAccount.anthropicAPIKey, backend: fake)
        try KeychainStore.writeString("sk-o", account: KeychainAccount.openAIAPIKey, backend: fake)
        var env: [String: String] = [:]
        applyKeychainSecretsToChildEnv(&env, backend: fake)
        XCTAssertEqual(env["ANTHROPIC_API_KEY"], "sk-a")
        XCTAssertEqual(env["OPENAI_API_KEY"], "sk-o")
    }

    func testApplyKeychainSecretsLeavesEnvUntouchedWhenNothingStored() {
        let fake = FakeKeychainBackend()
        var env: [String: String] = ["PATH": "/usr/bin"]
        applyKeychainSecretsToChildEnv(&env, backend: fake)
        XCTAssertEqual(env, ["PATH": "/usr/bin"])
    }

    func testApplyKeychainSecretsSkipsBlankValues() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("   ", account: KeychainAccount.anthropicAPIKey, backend: fake)
        var env: [String: String] = [:]
        applyKeychainSecretsToChildEnv(&env, backend: fake)
        XCTAssertNil(env["ANTHROPIC_API_KEY"])
    }

    func testApplyKeychainSecretsOverwritesPreexistingEnv() throws {
        let fake = FakeKeychainBackend()
        try KeychainStore.writeString("sk-new", account: KeychainAccount.anthropicAPIKey, backend: fake)
        var env: [String: String] = ["ANTHROPIC_API_KEY": "sk-old"]
        applyKeychainSecretsToChildEnv(&env, backend: fake)
        XCTAssertEqual(env["ANTHROPIC_API_KEY"], "sk-new")
    }
}
