import Foundation
import Security

/// Keychain helper for storing secrets (API keys, primarily) that the user
/// provides through Settings and that the Next.js server layer then consumes
/// via environment injection at launch.
///
/// The backend is abstracted behind `KeychainBackend` so unit tests can swap
/// an in-memory fake. Production code uses the default `SystemKeychainBackend`
/// which wraps Apple's `SecItem*` APIs.
enum KeychainStore {
    static let defaultService = "com.yinyiping.loom"

    static func read(
        service: String = defaultService,
        account: String,
        backend: KeychainBackend = SystemKeychainBackend()
    ) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        let (status, result) = backend.copyMatching(query)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    static func write(
        _ data: Data,
        service: String = defaultService,
        account: String,
        backend: KeychainBackend = SystemKeychainBackend()
    ) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let (readStatus, _) = backend.copyMatching(query)

        if readStatus == errSecSuccess {
            let attributes: [String: Any] = [kSecValueData as String: data]
            let status = backend.update(query: query, attributes: attributes)
            guard status == errSecSuccess else { throw KeychainError.osStatus(status) }
        } else if readStatus == errSecItemNotFound {
            var attributes = query
            attributes[kSecValueData as String] = data
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let status = backend.add(attributes)
            guard status == errSecSuccess else { throw KeychainError.osStatus(status) }
        } else {
            throw KeychainError.osStatus(readStatus)
        }
    }

    static func delete(
        service: String = defaultService,
        account: String,
        backend: KeychainBackend = SystemKeychainBackend()
    ) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let status = backend.delete(query)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.osStatus(status)
        }
    }

    static func readString(
        service: String = defaultService,
        account: String,
        backend: KeychainBackend = SystemKeychainBackend()
    ) -> String? {
        guard let data = read(service: service, account: account, backend: backend) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func writeString(
        _ value: String,
        service: String = defaultService,
        account: String,
        backend: KeychainBackend = SystemKeychainBackend()
    ) throws {
        try write(Data(value.utf8), service: service, account: account, backend: backend)
    }
}

enum KeychainError: Error, Equatable {
    case osStatus(OSStatus)
}

protocol KeychainBackend {
    func copyMatching(_ query: [String: Any]) -> (OSStatus, CFTypeRef?)
    func add(_ attributes: [String: Any]) -> OSStatus
    func update(query: [String: Any], attributes: [String: Any]) -> OSStatus
    func delete(_ query: [String: Any]) -> OSStatus
}

struct SystemKeychainBackend: KeychainBackend {
    func copyMatching(_ query: [String: Any]) -> (OSStatus, CFTypeRef?) {
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        return (status, result)
    }

    func add(_ attributes: [String: Any]) -> OSStatus {
        SecItemAdd(attributes as CFDictionary, nil)
    }

    func update(query: [String: Any], attributes: [String: Any]) -> OSStatus {
        SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    }

    func delete(_ query: [String: Any]) -> OSStatus {
        SecItemDelete(query as CFDictionary)
    }
}

/// Well-known account names under `KeychainStore.defaultService`. Adding a new
/// secret? Add its account key here so every reader agrees on the name.
enum KeychainAccount {
    static let anthropicAPIKey = "anthropic.api-key"
    static let openAIAPIKey = "openai.api-key"
    static let customEndpointAPIKey = "custom-endpoint.api-key"
}

/// Merge user-provided API keys from the Keychain into a child-process
/// environment dict. Called from `DevServer` when spawning the node server so
/// the Next.js layer sees `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` via
/// `process.env` without ever storing the keys on disk outside the Keychain.
/// Silent no-op when no key has been set — preserves the current CLI-default
/// path for users who haven't migrated to BYO-key.
func applyKeychainSecretsToChildEnv(
    _ env: inout [String: String],
    backend: KeychainBackend = SystemKeychainBackend()
) {
    let mappings: [(account: String, envVar: String)] = [
        (KeychainAccount.anthropicAPIKey, "ANTHROPIC_API_KEY"),
        (KeychainAccount.openAIAPIKey, "OPENAI_API_KEY"),
    ]
    for (account, envVar) in mappings {
        guard let value = KeychainStore.readString(account: account, backend: backend) else { continue }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { continue }
        env[envVar] = trimmed
    }
}
