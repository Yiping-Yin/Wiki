#!/usr/bin/env python3
"""Deterministic PPTX fixture generator for SlideDeckExtractorTests.

Produces THREE fixtures in the enclosing directory:

  - minimal.pptx                 — 2 slides with predictable text + 1 notes slide
  - numeric-ordering.pptx        — slide2.xml + slide10.xml (out-of-order in
                                   lexical sort) to exercise numeric slide order
  - malformed-slide.pptx         — slide1.xml valid, slide2.xml corrupt; valid
                                   slide text must still be returned

Each file is a standards-compliant enough OOXML zip that ZIPFoundation can read
the entries and XMLParser can pull `<a:t>` text runs. It's NOT a fully valid
PowerPoint document (no presentation.xml relationships, no rels tree beyond
what's needed for zip+xml extraction) — the SlideDeckExtractor does not open
these as PowerPoint, only as a zip with slide XML inside.

Run once from repo root:
    python3 macos-app/Loom/Tests/fixtures/slide-deck/generate_slide_deck_fixtures.py
"""

import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent

SLIDE_TEMPLATE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:bodyPr/>
          <a:p><a:r><a:t>{title}</a:t></a:r></a:p>
          <a:p><a:r><a:t>{body}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>
"""

NOTES_TEMPLATE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>{note}</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:notes>
"""

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
</Types>
"""


def write_pptx(path: Path, entries: dict[str, str]) -> None:
    """Write deterministic zip: sorted entries, epoch timestamp."""
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    # `ZIP_DEFLATED` matches what PowerPoint uses; ZIPFoundation reads both.
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in sorted(entries):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, entries[name])


def build_minimal() -> None:
    slides = {
        "[Content_Types].xml": CONTENT_TYPES,
        "ppt/slides/slide1.xml": SLIDE_TEMPLATE.format(
            title="Slide 1 title", body="Slide 1 body"
        ),
        "ppt/slides/slide2.xml": SLIDE_TEMPLATE.format(
            title="Slide 2 title", body="Slide 2 body"
        ),
        "ppt/notesSlides/notesSlide1.xml": NOTES_TEMPLATE.format(
            note="Speaker note for slide 1"
        ),
    }
    write_pptx(HERE / "minimal.pptx", slides)


def build_numeric_ordering() -> None:
    """slide2.xml + slide10.xml — lexical sort would put slide10 first."""
    slides = {
        "[Content_Types].xml": CONTENT_TYPES,
        "ppt/slides/slide2.xml": SLIDE_TEMPLATE.format(
            title="Early slide", body="Appears at position two"
        ),
        "ppt/slides/slide10.xml": SLIDE_TEMPLATE.format(
            title="Late slide", body="Appears at position ten"
        ),
    }
    write_pptx(HERE / "numeric-ordering.pptx", slides)


def build_malformed_slide() -> None:
    """slide1 valid, slide2 unparseable XML. Good slide text must still return."""
    slides = {
        "[Content_Types].xml": CONTENT_TYPES,
        "ppt/slides/slide1.xml": SLIDE_TEMPLATE.format(
            title="Good slide title", body="Good slide body"
        ),
        # Intentionally broken XML: unclosed tag, missing body.
        "ppt/slides/slide2.xml": "<?xml version=\"1.0\"?><p:sld><broken<<<",
    }
    write_pptx(HERE / "malformed-slide.pptx", slides)


if __name__ == "__main__":
    build_minimal()
    build_numeric_ordering()
    build_malformed_slide()
    for name in ("minimal.pptx", "numeric-ordering.pptx", "malformed-slide.pptx"):
        fp = HERE / name
        print(f"  wrote {fp} ({fp.stat().st_size} bytes)")
