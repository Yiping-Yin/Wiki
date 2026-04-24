import Foundation

// MARK: - SpreadsheetSchema
//
// Plan §3.3 Phase 3 — tabular data (`.csv` / `.tsv` / `.xlsx` / `.xls`).
// Entirely deterministic — no AI call. We surface sheet structure so
// later phases can offer "filter column" or "seed Panel from row" without
// having to parse the file again at read-time.
//
// `.xlsx` / `.xls` support is conditionally compiled on the presence of
// `CoreXLSX`; if the SPM dependency can't resolve at build time the
// extractor still handles CSV / TSV and returns a single-sheet schema
// with `columnNames == nil` when first-row detection fails.

/// Structured view of a spreadsheet file. Multiple sheets for XLSX; one
/// sheet for CSV / TSV (named after the filename stem).
struct SpreadsheetSchema: Codable {
    let sheets: [SheetEntry]
    /// Total row count across all sheets. Small helper for the sidebar
    /// hint ("24 rows") without summing at render time.
    let totalRows: Int
    /// First 10 rows × 10 columns of the first sheet, raw strings. Drives
    /// a quick-look preview in the ingest UI.
    let preview: [[String]]
}

struct SheetEntry: Codable {
    let name: String
    let rowCount: Int
    let columnCount: Int
    /// Present when the first row "looks header-like": every cell is
    /// non-empty and no cell parses cleanly as a number. Otherwise nil
    /// (caller can fall back to "Column 1" / "A" / "B").
    let columnNames: [String]?
}
