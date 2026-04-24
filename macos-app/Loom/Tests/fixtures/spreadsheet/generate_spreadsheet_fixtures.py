#!/usr/bin/env python3
"""Deterministic XLSX fixture generator for SpreadsheetExtractorTests.

Produces `minimal.xlsx` in the enclosing directory: a 1-sheet workbook,
3 rows, 3 columns, shape:

    name    | weight | grade
    Alice   | 40     | 85
    Bob     | 60     | 72

Structure follows the minimum OOXML layout CoreXLSX accepts (matches the
upstream HelloWorld.xlsx test fixture shape). String cells are interned
via xl/sharedStrings.xml using `t="s"` indices; numeric cells are raw.

Run once from repo root:
    python3 macos-app/Loom/Tests/fixtures/spreadsheet/generate_spreadsheet_fixtures.py
"""

import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default ContentType="application/xml" Extension="xml"/>
  <Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml" PartName="/xl/worksheets/sheet1.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml" PartName="/xl/sharedStrings.xml"/>
  <Override ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml" PartName="/xl/workbook.xml"/>
</Types>
"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>
"""

WORKBOOK = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet state="visible" name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>
"""

WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>
"""

# Shared strings are interned by index. Order matters — cell `t="s"` values
# reference 0, 1, 2, 3, 4 below.
SHARED_STRINGS_ITEMS = ["name", "weight", "grade", "Alice", "Bob"]


def build_shared_strings() -> str:
    items = "".join(f"<si><t>{s}</t></si>" for s in SHARED_STRINGS_ITEMS)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        f'count="{len(SHARED_STRINGS_ITEMS)}" uniqueCount="{len(SHARED_STRINGS_ITEMS)}">'
        f"{items}"
        "</sst>"
    )


SHEET_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
           xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>3</v></c>
      <c r="B2"><v>40</v></c>
      <c r="C2"><v>85</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>4</v></c>
      <c r="B3"><v>60</v></c>
      <c r="C3"><v>72</v></c>
    </row>
  </sheetData>
</worksheet>
"""


def build_minimal() -> None:
    entries = {
        "[Content_Types].xml": CONTENT_TYPES,
        "_rels/.rels": ROOT_RELS,
        "xl/workbook.xml": WORKBOOK,
        "xl/_rels/workbook.xml.rels": WORKBOOK_RELS,
        "xl/sharedStrings.xml": build_shared_strings(),
        "xl/worksheets/sheet1.xml": SHEET_XML,
    }
    path = HERE / "minimal.xlsx"
    if path.exists():
        path.unlink()
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, entries[name])
    print(f"  wrote {path} ({path.stat().st_size} bytes)")


if __name__ == "__main__":
    build_minimal()
