import SwiftUI

@main
struct LoomApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 960, minHeight: 640)
                .environmentObject(delegate.server)
        }
        .windowToolbarStyle(.unified(showsTitle: true))
        .commands {
            CommandGroup(after: .textEditing) {
                Button("Search") { NotificationCenter.default.post(name: .loomSearch, object: nil) }
                    .keyboardShortcut("k", modifiers: .command)
                Button("Review") { NotificationCenter.default.post(name: .loomReview, object: nil) }
                    .keyboardShortcut("/", modifiers: .command)
                Button("Reload") { NotificationCenter.default.post(name: .loomReload, object: nil) }
                    .keyboardShortcut("r", modifiers: .command)
                Button("Open in Browser") { NotificationCenter.default.post(name: .loomOpenInBrowser, object: nil) }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {
    let server = DevServer()

    func applicationDidFinishLaunching(_ notification: Notification) {
        server.start()
    }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

extension Notification.Name {
    static let loomSearch = Notification.Name("loomSearch")
    static let loomReview = Notification.Name("loomReview")
    static let loomReload = Notification.Name("loomReload")
    static let loomOpenInBrowser = Notification.Name("loomOpenInBrowser")
}
