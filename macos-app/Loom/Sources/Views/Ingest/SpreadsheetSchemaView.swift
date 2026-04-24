import SwiftUI

// MARK: - SpreadsheetSchemaView
//
// Phase 4 — renderer for SpreadsheetSchema. Deterministic (no AI),
// no FieldResult, no click-to-quote. Plan §3.3 / Phase 4 brief layout:
//
//   1. Sheet tabs (if multiple sheets)
//   2. Per-sheet: row/column count + 10×10 preview as an actual table
//   3. Column names as header row (if detected)
//
// Current schema carries a single 10×10 `preview` array on the root
// (not per-sheet) — so multi-sheet XLSX renders the tab list but the
// table always reflects the first sheet's preview. Phase 5 can extend
// if per-sheet preview ships later.

struct SpreadsheetSchemaView: View {
    let schema: SpreadsheetSchema

    @State private var selectedSheetIndex: Int = 0

    init(schema: SpreadsheetSchema) {
        self.schema = schema
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            summaryBlock
            if schema.sheets.count > 1 {
                sheetTabs
            }
            if !schema.preview.isEmpty {
                IngestHairline()
                tableBlock
            } else {
                Text("No preview available.")
                    .font(LoomTokens.serif(size: 12, italic: true))
                    .foregroundStyle(LoomTokens.muted)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Summary row

    private var summaryBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            IngestSectionHeader(title: "Spreadsheet")
            HStack(spacing: 14) {
                metaChip(icon: "square.grid.3x3", label: "\(schema.sheets.count) sheet\(schema.sheets.count == 1 ? "" : "s")")
                metaChip(icon: "list.bullet.rectangle", label: "\(schema.totalRows) rows")
                if let first = schema.sheets.first {
                    metaChip(icon: "tablecells", label: "\(first.columnCount) cols")
                }
            }
        }
    }

    private var sheetTabs: some View {
        HStack(spacing: 0) {
            ForEach(Array(schema.sheets.enumerated()), id: \.offset) { idx, sheet in
                Button {
                    selectedSheetIndex = idx
                } label: {
                    VStack(spacing: 3) {
                        Text(sheet.name)
                            .font(LoomTokens.serif(size: 12, weight: selectedSheetIndex == idx ? .medium : .regular))
                            .foregroundStyle(selectedSheetIndex == idx ? LoomTokens.ink : LoomTokens.muted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                        Rectangle()
                            .fill(selectedSheetIndex == idx ? LoomTokens.thread : Color.clear)
                            .frame(height: 1.5)
                    }
                }
                .buttonStyle(.plain)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Table

    @ViewBuilder
    private var tableBlock: some View {
        let sheet = schema.sheets[safe: selectedSheetIndex] ?? schema.sheets.first
        VStack(alignment: .leading, spacing: 8) {
            if let sheet, schema.sheets.count == 1 {
                // Single sheet — show header row with counts inline.
                HStack(spacing: 6) {
                    Text(sheet.name)
                        .font(LoomTokens.serif(size: 13, weight: .medium))
                        .foregroundStyle(LoomTokens.ink)
                    Text("· \(sheet.rowCount) × \(sheet.columnCount)")
                        .font(LoomTokens.sans(size: 10))
                        .foregroundStyle(LoomTokens.muted)
                }
            }

            // Actual table — horizontal scroll for wide previews.
            ScrollView(.horizontal, showsIndicators: true) {
                VStack(alignment: .leading, spacing: 0) {
                    if let columnNames = sheet?.columnNames, !columnNames.isEmpty {
                        tableRow(cells: columnNames, isHeader: true)
                        Rectangle()
                            .fill(LoomTokens.hair)
                            .frame(height: 0.5)
                    }
                    ForEach(Array(schema.preview.enumerated()), id: \.offset) { idx, row in
                        // If we rendered a header from columnNames, skip
                        // the first data row if it duplicates the header
                        // (common when the extractor stored columnNames
                        // but the preview still includes the raw row).
                        if let columnNames = sheet?.columnNames,
                           idx == 0,
                           row == columnNames
                        {
                            EmptyView()
                        } else {
                            tableRow(cells: row, isHeader: false)
                            if idx < schema.preview.count - 1 {
                                Rectangle()
                                    .fill(LoomTokens.hairFaint)
                                    .frame(height: 0.5)
                            }
                        }
                    }
                }
                .padding(8)
                .background(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(LoomTokens.hairFaint.opacity(0.5))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(LoomTokens.hair, lineWidth: 0.5)
                )
            }
        }
    }

    private func tableRow(cells: [String], isHeader: Bool) -> some View {
        HStack(spacing: 0) {
            ForEach(Array(cells.enumerated()), id: \.offset) { _, cell in
                Text(cell.isEmpty ? "—" : cell)
                    .font(isHeader
                          ? LoomTokens.sans(size: 11, weight: .medium)
                          : LoomTokens.serif(size: 12))
                    .foregroundStyle(isHeader ? LoomTokens.ink3 : LoomTokens.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(minWidth: 80, idealWidth: 110, maxWidth: 180, alignment: .leading)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
            }
        }
    }

    // MARK: - Helpers

    private func metaChip(icon: String, label: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 9))
            Text(label)
                .font(LoomTokens.sans(size: 10))
        }
        .foregroundStyle(LoomTokens.ink3)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(Capsule(style: .continuous).fill(LoomTokens.hairFaint))
        .overlay(Capsule(style: .continuous).strokeBorder(LoomTokens.hair, lineWidth: 0.5))
    }
}

// MARK: - Array safe index

fileprivate extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

// MARK: - Previews

#Preview("SpreadsheetSchemaView · single sheet") {
    let schema = SpreadsheetSchema(
        sheets: [
            SheetEntry(
                name: "holdings",
                rowCount: 24,
                columnCount: 4,
                columnNames: ["Ticker", "Weight", "Sector", "Country"]
            )
        ],
        totalRows: 24,
        preview: [
            ["Ticker", "Weight", "Sector", "Country"],
            ["CBA", "7.2%", "Financials", "AU"],
            ["BHP", "6.1%", "Materials", "AU"],
            ["CSL", "4.8%", "Healthcare", "AU"]
        ]
    )
    return ScrollView {
        SpreadsheetSchemaView(schema: schema)
            .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 560, height: 400)
}

#Preview("SpreadsheetSchemaView · multi-sheet") {
    let schema = SpreadsheetSchema(
        sheets: [
            SheetEntry(name: "summary", rowCount: 12, columnCount: 3, columnNames: ["Metric", "Value", "YoY"]),
            SheetEntry(name: "detail", rowCount: 250, columnCount: 8, columnNames: nil)
        ],
        totalRows: 262,
        preview: [
            ["Metric", "Value", "YoY"],
            ["Revenue", "$1.2B", "+8%"],
            ["EBITDA", "$420M", "+12%"]
        ]
    )
    return ScrollView {
        SpreadsheetSchemaView(schema: schema)
            .padding()
    }
    .background(LoomTokens.paper)
    .frame(width: 560, height: 400)
}
