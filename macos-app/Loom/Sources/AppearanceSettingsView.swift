import SwiftUI

/// Native Settings pane for theme + motion prefs.
///
/// Only two controls after the 2026-04-23 cleanup:
///   - `theme`: System / Light / Dark — the standard Mac triplet.
///     Consumed by the webview via the inline `<script>` in
///     `app/layout.tsx` that reads `localStorage['wiki:theme']`.
///   - `wiki:reduce-motion`: hides non-essential animations (page-
///     enter fade, Shutter crossfade). Consumed by the media query
///     `prefers-reduced-motion` plus the `[data-reduce-motion]` hook.
///
/// Previously also exposed "Accent color" (system-blue / purple /
/// pink etc.) and "Sidebar default" (hidden / mini / pinned). Both
/// deleted: the accent set violated Vellum's "earth only, never
/// neon" rule (one canonical bronze thread, no user choice), and
/// nothing in the web or native side actually read either value.
struct AppearanceSettingsView: View {
    @AppStorage("theme") private var theme: String = "auto"
    @AppStorage("wiki:reduce-motion") private var reduceMotion: String = ""

    var body: some View {
        Form {
            Section("Theme") {
                Picker("Mode", selection: $theme) {
                    Text("System").tag("auto")
                    Text("Light").tag("light")
                    Text("Dark").tag("dark")
                }
                .pickerStyle(.segmented)
            }

            Section("Reading") {
                Toggle(
                    "Reduce motion",
                    isOn: Binding<Bool>(
                        get: { reduceMotion == "1" },
                        set: { reduceMotion = $0 ? "1" : "" }
                    )
                )
            }
        }
        .formStyle(.grouped)
        .scrollContentBackground(.hidden)
        .background(LoomTokens.paper)
        .tint(LoomTokens.thread)
        .padding()
        .frame(minWidth: 480, idealWidth: 520, minHeight: 260)
    }
}
