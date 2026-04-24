import Foundation
#if canImport(CoreXLSX)
import CoreXLSX
#endif

// MARK: - SpreadsheetExtractor
//
// Plan §3.3 Phase 3 — tabular data. Deterministic, no AI.
//
// Supported formats:
//   • `.csv` — RFC 4180 lite (quoted fields + escaped quotes, comma separator).
//   • `.tsv` — same shape, tab separator.
//   • `.xlsx` — (optional) via `CoreXLSX` SPM dependency. When the
//     dependency isn't available at build time, `.xlsx` falls through
//     to the fallback branch which produces a single-sheet schema with
//     empty rows and `columnNames: nil`. Phase 3 ships with conditional
//     compilation guard `#if canImport(CoreXLSX)`.
//   • `.xls` — legacy binary format; always falls through to the fallback
//     (CoreXLSX only speaks OOXML). Documented non-goal per plan §8.
//
// Each call reads the file from disk because the IngestionView passes
// already-extracted plaintext for text-shaped files — tabular data needs
// the raw bytes, so we re-read via `docId` / `filename`. Caller passes
// the absolute path as `docId` when routing through this extractor.

struct SpreadsheetExtractor: IngestExtractor {
    typealias Schema = SpreadsheetSchema

    static let extractorId = "spreadsheet"

    /// Row cap — we scan the whole file for `rowCount`, but only keep
    /// the first N rows × N cols in `preview`. Matches the "first 10"
    /// shape in the plan.
    static let previewRowLimit = 10
    static let previewColLimit = 10

    static func match(
        filename: String,
        parentPath: String,
        sample: String
    ) -> Double {
        let ext = (filename as NSString).pathExtension.lowercased()
        switch ext {
        case "csv", "tsv", "xlsx", "xls":
            return 0.9
        default:
            return 0.0
        }
    }

    /// `text` is the already-extracted plaintext from IngestionView. For
    /// CSV / TSV that's the raw file content (they're plaintext), so
    /// we parse it directly. For XLSX / XLS we can't — IngestionView
    /// extracts spreadsheets into a best-effort text dump if at all —
    /// so we treat the incoming `text` as the CSV/TSV parse source and
    /// synthesize a degraded schema for binary formats when CoreXLSX is
    /// unavailable.
    func extract(
        text: String,
        filename: String,
        docId: String
    ) async throws -> SpreadsheetSchema {
        let ext = (filename as NSString).pathExtension.lowercased()
        let stem = (filename as NSString).deletingPathExtension

        switch ext {
        case "csv":
            return Self.parseDelimited(text: text, separator: ",", sheetName: stem)
        case "tsv":
            return Self.parseDelimited(text: text, separator: "\t", sheetName: stem)
        case "xlsx":
            // Conditional XLSX path via CoreXLSX. When the dependency
            // isn't available (fallback build), the call returns nil
            // and we degrade gracefully.
            if let schema = Self.parseXLSX(text: text, docId: docId, filename: filename) {
                return schema
            }
            return Self.degraded(filename: filename, reason: "xlsx_unsupported")
        case "xls":
            // Legacy binary never supported in Phase 3.
            return Self.degraded(filename: filename, reason: "xls_not_supported")
        default:
            return Self.degraded(filename: filename, reason: "unknown_extension")
        }
    }

    // MARK: - Degraded path

    /// Single-sheet schema with no rows when we can't parse the file.
    /// Keeps the schema-aware UI rendering cleanly ("0 rows") rather
    /// than throwing.
    static func degraded(filename: String, reason: String) -> SpreadsheetSchema {
        let stem = (filename as NSString).deletingPathExtension
        return SpreadsheetSchema(
            sheets: [
                SheetEntry(
                    name: stem,
                    rowCount: 0,
                    columnCount: 0,
                    columnNames: nil
                ),
            ],
            totalRows: 0,
            preview: []
        )
    }

    // MARK: - CSV / TSV parser
    //
    // Quoted-field handling: `"..."` cells can contain commas, newlines,
    // and escaped quotes (`""` inside a quoted field). Simple state
    // machine, sufficient for UNSW timetable / grade-book exports.
    //
    // NOT RFC 4180 complete — we don't handle BOM stripping or
    // mixed-width newline combos beyond `\r\n` → `\n`. Good enough for
    // "what shipped from UNSW data-export".

    static func parseDelimited(
        text: String,
        separator: Character,
        sheetName: String
    ) -> SpreadsheetSchema {
        // Normalize line endings so the parser only has to think about \n.
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n")
        let rows = parseRows(text: normalized, separator: separator)

        // Decide whether the first row is a header (every cell non-empty,
        // no cell parses as a pure number).
        let columnNames = detectHeaderRow(rows: rows)

        let colCount = rows.map { $0.count }.max() ?? 0
        let preview = Array(rows.prefix(previewRowLimit)).map { row in
            Array(row.prefix(previewColLimit))
        }

        let sheet = SheetEntry(
            name: sheetName,
            rowCount: rows.count,
            columnCount: colCount,
            columnNames: columnNames
        )
        return SpreadsheetSchema(
            sheets: [sheet],
            totalRows: rows.count,
            preview: preview
        )
    }

    /// Quoted-CSV state machine. Returns `[[String]]` — each inner array
    /// is a row, each entry a cell (unwrapped from quotes, with `""`
    /// escapes resolved).
    static func parseRows(text: String, separator: Character) -> [[String]] {
        var rows: [[String]] = []
        var current: [String] = []
        var field = ""
        var inQuotes = false
        var i = text.startIndex

        while i < text.endIndex {
            let c = text[i]

            if inQuotes {
                if c == "\"" {
                    // Peek for escaped `""`.
                    let next = text.index(after: i)
                    if next < text.endIndex, text[next] == "\"" {
                        field.append("\"")
                        i = text.index(after: next)
                        continue
                    }
                    inQuotes = false
                    i = text.index(after: i)
                    continue
                }
                field.append(c)
                i = text.index(after: i)
                continue
            }

            if c == "\"" {
                inQuotes = true
                i = text.index(after: i)
                continue
            }

            if c == separator {
                current.append(field)
                field = ""
                i = text.index(after: i)
                continue
            }

            if c == "\n" {
                current.append(field)
                field = ""
                rows.append(current)
                current = []
                i = text.index(after: i)
                continue
            }

            field.append(c)
            i = text.index(after: i)
        }

        // Flush trailing partial row (no final newline).
        if !field.isEmpty || !current.isEmpty {
            current.append(field)
            rows.append(current)
        }

        return rows
    }

    /// Heuristic: first row is a header iff it's non-empty AND every
    /// cell is non-empty AND no cell is "pure numeric". Purely numeric
    /// cells are a strong signal the first row is data, not header.
    static func detectHeaderRow(rows: [[String]]) -> [String]? {
        guard let first = rows.first, !first.isEmpty else { return nil }
        for cell in first {
            let trimmed = cell.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { return nil }
            if Double(trimmed) != nil { return nil }
        }
        return first
    }

    // MARK: - XLSX parse (CoreXLSX-gated)
    //
    // Only compiled when CoreXLSX resolves; falls through to nil when
    // not available. We keep the extractor otherwise functional for
    // CSV/TSV under either build configuration.

    static func parseXLSX(text: String, docId: String, filename: String) -> SpreadsheetSchema? {
        #if canImport(CoreXLSX)
        // Caller passes the absolute file path as `docId` so we can
        // re-open the binary file. IngestionView's text extractor
        // produces a text dump for xlsx but the structured extractor
        // needs the raw workbook.
        guard FileManager.default.fileExists(atPath: docId) else { return nil }
        guard let file = XLSXFile(filepath: docId) else { return nil }
        do {
            var sheets: [SheetEntry] = []
            var firstSheetPreview: [[String]] = []
            var totalRows = 0

            let workbooks = try file.parseWorkbooks()
            let sharedStrings = try file.parseSharedStrings()

            for workbook in workbooks {
                let paths = try file.parseWorksheetPathsAndNames(workbook: workbook)
                for (name, path) in paths {
                    let sheetName = name ?? (path as NSString).lastPathComponent
                    let worksheet = try file.parseWorksheet(at: path)
                    let rows = worksheet.data?.rows ?? []
                    var rowStrings: [[String]] = []
                    var maxCols = 0
                    for row in rows {
                        var cells: [String] = []
                        for cell in row.cells {
                            let raw: String
                            if let shared = sharedStrings, let str = cell.stringValue(shared) {
                                raw = str
                            } else if let v = cell.value {
                                raw = v
                            } else {
                                raw = ""
                            }
                            cells.append(raw)
                        }
                        maxCols = max(maxCols, cells.count)
                        rowStrings.append(cells)
                    }
                    let columnNames = detectHeaderRow(rows: rowStrings)
                    sheets.append(SheetEntry(
                        name: sheetName,
                        rowCount: rowStrings.count,
                        columnCount: maxCols,
                        columnNames: columnNames
                    ))
                    totalRows += rowStrings.count
                    if firstSheetPreview.isEmpty {
                        firstSheetPreview = Array(rowStrings.prefix(previewRowLimit)).map { row in
                            Array(row.prefix(previewColLimit))
                        }
                    }
                }
            }

            if sheets.isEmpty { return nil }
            return SpreadsheetSchema(
                sheets: sheets,
                totalRows: totalRows,
                preview: firstSheetPreview
            )
        } catch {
            // Any CoreXLSX failure → nil → fall through to degraded path.
            return nil
        }
        #else
        // Dependency unavailable — caller gets a degraded schema.
        _ = text; _ = docId; _ = filename
        return nil
        #endif
    }
}
