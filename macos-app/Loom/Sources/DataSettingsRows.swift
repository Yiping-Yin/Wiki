import SwiftUI

/// Helper views + types for `DataSettingsView`'s "Your Loom" section.
/// Split out to keep `DataSettingsView.swift` focused on its Form body
/// and data wiring — these are pure rendering + one sum-type record.

// MARK: - Per-category sub-group

/// Renders one collection (Pursuits / Panels / Sōan / Weaves) inside
/// the "Your Loom" section: an eyebrow with count, a scrollable list
/// capped at ~10rem so a large catalogue doesn't steal the whole pane,
/// and an italic empty-state copy when the collection is empty.
struct LoomContentGroup<Content: View>: View {
    let label: String
    let count: Int
    let emptyCopy: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 6) {
                Text(label.uppercased())
                    .font(.system(size: 10, weight: .medium))
                    .kerning(0.8)
                    .foregroundStyle(LoomTokens.muted)
                Text("·")
                    .font(.system(size: 10))
                    .foregroundStyle(LoomTokens.muted)
                Text("\(count)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(LoomTokens.muted)
                Spacer()
            }
            .padding(.top, 2)

            if count == 0 {
                Text(emptyCopy)
                    .font(Font.custom("EB Garamond", size: 13).italic())
                    .foregroundStyle(LoomTokens.muted)
                    .padding(.vertical, 6)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 2) {
                        content()
                    }
                }
                .frame(maxHeight: 160)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Per-row with delete

/// One item row. Title in Cormorant-italic, meta chips in small muted
/// sans, and a trailing `xmark.circle` button tinted rose on hover.
/// Hover state lives on the button itself so the rest of the row stays
/// still — avoids a jitter when the cursor glides down the list.
struct LoomManagementRow: View {
    let title: String
    let meta: [String]
    let onDelete: () -> Void

    @State private var hovering = false

    var body: some View {
        HStack(spacing: 8) {
            Text(title)
                .font(Font.custom("Cormorant Garamond", size: 14).italic())
                .foregroundStyle(LoomTokens.ink)
                .lineLimit(1)
                .truncationMode(.tail)

            ForEach(Array(meta.enumerated()), id: \.offset) { _, chip in
                if !chip.isEmpty {
                    Text("·")
                        .font(.system(size: 10))
                        .foregroundStyle(LoomTokens.muted)
                    Text(chip)
                        .font(.system(size: 10))
                        .foregroundStyle(LoomTokens.muted)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 8)

            Button(action: onDelete) {
                Image(systemName: "xmark.circle")
                    .font(.system(size: 12))
                    .foregroundStyle(hovering ? LoomTokens.rose : LoomTokens.muted)
            }
            .buttonStyle(.plain)
            .help("Remove")
            .onHover { hovering = $0 }
        }
        .padding(.vertical, 3)
        .padding(.horizontal, 2)
        .contentShape(Rectangle())
    }
}

// MARK: - Pending deletion sum-type

/// Small record tying together "what is about to be removed" so a
/// single `.alert` binding can drive every category without a matrix
/// of per-row state.
struct PendingDeletion: Identifiable {
    enum Category {
        case pursuit, panel, soan, weave

        var label: String {
            switch self {
            case .pursuit: return "pursuit"
            case .panel:   return "panel"
            case .soan:    return "Sōan card"
            case .weave:   return "weave"
            }
        }
    }

    let id: String
    let name: String
    let category: Category
}
