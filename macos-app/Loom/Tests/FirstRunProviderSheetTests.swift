import XCTest

@testable import Loom

final class FirstRunProviderSheetTests: XCTestCase {
    private func suite() -> UserDefaults {
        UserDefaults(suiteName: "loom.tests.\(UUID().uuidString)")!
    }

    func testLocalProviderDoesNotRequireAnthropicKeyOnFirstRun() {
        let defaults = suite()
        defaults.set(AIProviderKind.claudeCli.rawValue, forKey: "loom.ai.provider")

        XCTAssertFalse(
            AIProviderKind.shouldShowFirstRunPrompt(
                defaults: defaults,
                keyReader: { _ in nil },
                hasFolder: true
            )
        )
    }

    func testDisabledProviderDoesNotRequireAnyKeyOnFirstRun() {
        let defaults = suite()
        defaults.set(AIProviderKind.disabled.rawValue, forKey: "loom.ai.provider")

        XCTAssertFalse(
            AIProviderKind.shouldShowFirstRunPrompt(
                defaults: defaults,
                keyReader: { _ in nil },
                hasFolder: true
            )
        )
    }

    func testOpenAIProviderChecksOpenAIKeyNotAnthropicKey() {
        let defaults = suite()
        defaults.set(AIProviderKind.openai.rawValue, forKey: "loom.ai.provider")

        XCTAssertTrue(
            AIProviderKind.shouldShowFirstRunPrompt(
                defaults: defaults,
                keyReader: { account in
                    account == KeychainAccount.anthropicAPIKey ? "sk-ant-present" : nil
                },
                hasFolder: true
            )
        )

        XCTAssertFalse(
            AIProviderKind.shouldShowFirstRunPrompt(
                defaults: defaults,
                keyReader: { account in
                    account == KeychainAccount.openAIAPIKey ? "sk-openai-present" : nil
                },
                hasFolder: true
            )
        )
    }

    func testPromptStaysHiddenAfterSeenFlag() {
        let defaults = suite()
        defaults.set(true, forKey: "loom.ai.firstRunPromptSeen")
        defaults.set(AIProviderKind.anthropic.rawValue, forKey: "loom.ai.provider")

        XCTAssertFalse(
            AIProviderKind.shouldShowFirstRunPrompt(
                defaults: defaults,
                keyReader: { _ in nil },
                hasFolder: false
            )
        )
    }
}
