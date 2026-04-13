import SwiftUI
import AppKit

// MARK: - State

final class NotchState: ObservableObject {
    @Published var presetId: String = ""
    @Published var presetLabel: String = ""
    @Published var noteCount: Int = 0
    @Published var aiActive: Bool = false
    @Published var saveFlash: Bool = false
    @Published var expanded: Bool = false

    func flashSave() {
        saveFlash = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.saveFlash = false
        }
    }
}

// MARK: - Preset accent colors

private let presetColors: [String: Color] = [
    "ingesting":   Color(red: 0.35, green: 0.65, blue: 0.95),
    "questioning": Color(red: 0.40, green: 0.75, blue: 0.55),
    "reviewing":   Color(red: 0.60, green: 0.55, blue: 0.85),
    "producing":   Color(red: 0.90, green: 0.65, blue: 0.30),
    "verifying":   Color(red: 0.85, green: 0.45, blue: 0.50),
    "recursing":   Color(red: 0.55, green: 0.70, blue: 0.80),
]

// MARK: - Notch geometry

/// MBP 16" (2024) notch: ~180pt wide. We leave some margin.
/// Notch width queried at runtime via NSScreen.auxiliaryTopLeftArea/Right.
/// Fallback: 185pt (measured on MBP 16" 2024, M4 Pro).
private func measuredNotchWidth() -> CGFloat {
    guard let screen = NSScreen.main else { return 185 }
    if #available(macOS 12.0, *),
       let tl = screen.auxiliaryTopLeftArea,
       let tr = screen.auxiliaryTopRightArea {
        return tr.minX - tl.maxX
    }
    return 185
}

// MARK: - Notch Window Controller

final class NotchWindowController {
    private var panel: NSPanel?
    private let state: NotchState
    private var onPresetSwitch: ((String) -> Void)?

    init(state: NotchState, onPresetSwitch: ((String) -> Void)? = nil) {
        self.state = state
        self.onPresetSwitch = onPresetSwitch
    }

    func show() {
        guard panel == nil else { return }

        let rect = Self.panelRect()

        let panel = NSPanel(
            contentRect: rect,
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .statusBar + 1
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovable = false
        panel.ignoresMouseEvents = false

        let hostView = NSHostingView(
            rootView: NotchOverlayView(state: state, onPresetSwitch: onPresetSwitch)
        )
        hostView.frame = panel.contentView?.bounds ?? .zero
        hostView.autoresizingMask = [.width, .height]
        panel.contentView?.addSubview(hostView)

        panel.orderFrontRegardless()
        self.panel = panel

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.repositionPanel()
        }
    }

    func hide() {
        panel?.orderOut(nil)
        panel = nil
    }

    private func repositionPanel() {
        guard let panel else { return }
        panel.setFrame(Self.panelRect(), display: true)
    }

    /// The panel sits at the same Y level as the notch, centered, wider than
    /// the notch. The center portion (behind the notch) is naturally invisible.
    /// Content on the left and right wings is visible.
    private static func panelRect() -> NSRect {
        guard let screen = NSScreen.main else {
            return NSRect(x: 400, y: 800, width: 500, height: 38)
        }

        let screenFrame = screen.frame
        let visibleFrame = screen.visibleFrame
        let topInset = screenFrame.maxY - visibleFrame.maxY
        let hasNotch = topInset > 24

        // Panel: notch width + 150pt wing on each side
        let measuredNotch: CGFloat = {
            if #available(macOS 12.0, *),
               let tl = screen.auxiliaryTopLeftArea,
               let tr = screen.auxiliaryTopRightArea {
                return tr.minX - tl.maxX
            }
            return 185
        }()
        let panelWidth: CGFloat = hasNotch ? measuredNotch + 300 : 300
        let panelHeight: CGFloat = hasNotch ? topInset : 28

        let x = screenFrame.origin.x + (screenFrame.width - panelWidth) / 2
        // Top-aligned with the notch area (screen top minus panel height)
        let y = screenFrame.maxY - panelHeight

        return NSRect(x: x, y: y, width: panelWidth, height: panelHeight)
    }
}

// MARK: - SwiftUI View

/// Content is split into left wing and right wing, with the notch gap in between.
/// The physical notch occludes the center — we don't draw there.
struct NotchOverlayView: View {
    @ObservedObject var state: NotchState
    var onPresetSwitch: ((String) -> Void)?

    @State private var hovered: Bool = false
    @State private var breathe: Bool = false
    @State private var notchGap: CGFloat = 185

    private var accentColor: Color {
        presetColors[state.presetId] ?? .accentColor
    }

    var body: some View {
        if state.expanded {
            expandedView
        } else {
            compactView
        }
    }

    // MARK: - Compact: two wings flanking the notch

    /// Each wing is a fixed-width ZStack: black background fills the entire
    /// rectangle, content is aligned inside. This guarantees the wings are
    /// flush with the notch — no gap.
    private let wingWidth: CGFloat = 120

    private var compactView: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)

            // ── Left wing ──
            ZStack(alignment: .trailing) {
                UnevenRoundedRectangle(
                    topLeadingRadius: 0, bottomLeadingRadius: 12,
                    bottomTrailingRadius: 0, topTrailingRadius: 0
                )
                .fill(Color.black)
                .shadow(color: .black.opacity(0.2), radius: 3, y: 2)

                HStack(spacing: 4) {
                    Circle()
                        .fill(accentColor)
                        .frame(width: 5, height: 5)
                        .scaleEffect(state.saveFlash ? 1.8 : 1.0)
                        .animation(.spring(response: 0.18, dampingFraction: 0.45), value: state.saveFlash)
                    Text(shortLabel)
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.white.opacity(0.7))
                }
                .padding(.trailing, 10)
            }
            .frame(width: wingWidth, height: 26)
            .onTapGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.78)) {
                    state.expanded = true
                }
            }

            // ── Notch gap ──
            Color.clear.frame(width: notchGap)

            // ── Right wing ──
            ZStack(alignment: .leading) {
                UnevenRoundedRectangle(
                    topLeadingRadius: 0, bottomLeadingRadius: 0,
                    bottomTrailingRadius: 12, topTrailingRadius: 0
                )
                .fill(Color.black)
                .shadow(color: .black.opacity(0.2), radius: 3, y: 2)

                HStack(spacing: 4) {
                    if state.aiActive {
                        Circle()
                            .fill(accentColor)
                            .frame(width: 4, height: 4)
                            .scaleEffect(breathe ? 1.0 : 0.5)
                            .opacity(breathe ? 0.9 : 0.3)
                            .animation(.easeInOut(duration: 1.0).repeatForever(autoreverses: true), value: breathe)
                            .onAppear { breathe = true }
                            .onDisappear { breathe = false }
                    }
                    if state.noteCount > 0 {
                        Text("\(state.noteCount)")
                            .font(.system(size: 10, weight: .medium, design: .monospaced))
                            .foregroundStyle(.white.opacity(0.4))
                    }
                }
                .padding(.leading, 10)
            }
            .frame(width: wingWidth, height: 26)
            .onTapGesture {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.78)) {
                    state.expanded = true
                }
            }

            Spacer(minLength: 0)
        }
        .opacity(state.presetLabel.isEmpty ? 0 : 1)
        .onAppear {
            notchGap = measuredNotchWidth()
        }
    }

    /// Short label for compact notch display. Max 6 chars.
    private var shortLabel: String {
        switch state.presetId {
        case "ingesting":   return "Ingest"
        case "questioning": return "Quest"
        case "reviewing":   return "Review"
        case "producing":   return "Produce"
        case "verifying":   return "Verify"
        case "recursing":   return "Recurse"
        default:            return String(state.presetLabel.prefix(6))
        }
    }

    // MARK: - Expanded: full bar below notch with all presets

    private static let presets: [(id: String, label: String, key: String)] = [
        ("ingesting",   "Ingest",   "1"),
        ("questioning", "Question", "2"),
        ("reviewing",   "Review",   "3"),
        ("producing",   "Produce",  "4"),
        ("verifying",   "Verify",   "5"),
        ("recursing",   "Recurse",  "6"),
    ]

    private var expandedView: some View {
        VStack(spacing: 0) {
            Spacer()
            HStack(spacing: 0) {
                Spacer()
                HStack(spacing: 3) {
                    ForEach(Self.presets, id: \.id) { preset in
                        let isActive = preset.id == state.presetId
                        let color = presetColors[preset.id] ?? .accentColor
                        Button {
                            onPresetSwitch?(preset.id)
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.78)) {
                                state.expanded = false
                            }
                        } label: {
                            VStack(spacing: 1) {
                                Text(preset.label)
                                    .font(.system(size: 9, weight: isActive ? .bold : .medium, design: .monospaced))
                                Text(preset.key)
                                    .font(.system(size: 8, design: .monospaced))
                                    .opacity(0.35)
                            }
                            .foregroundStyle(isActive ? .white : .white.opacity(0.45))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 4)
                            .background(
                                RoundedRectangle(cornerRadius: 5)
                                    .fill(isActive ? color.opacity(0.3) : .clear)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 0,
                        bottomLeadingRadius: 12,
                        bottomTrailingRadius: 12,
                        topTrailingRadius: 0
                    )
                    .fill(Color.black)
                )
                Spacer()
            }
        }
        .onTapGesture {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.78)) {
                state.expanded = false
            }
        }
        .onAppear {
            // Auto-collapse after 4 seconds
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak state] in
                guard let state, state.expanded else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.78)) {
                    state.expanded = false
                }
            }
        }
    }
}
