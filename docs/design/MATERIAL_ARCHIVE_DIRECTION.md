# Loom Material Archive Direction

Status: operative product direction
Scope: Sources, category detail, source detail, panels, weaves, and the macOS shell
Private research archive: `/Users/yinyiping/Desktop/LOOM-Design-Resources`

This document is the product-safe distillation of Loom's material archive
research. It belongs in the product repository because it describes executable
design rules. Raw references, moodboards, screenshots, case studies, and
unlicensed external imagery belong in the private design resources archive, not
in this repository.

## North Star

Loom should make knowledge feel precious through material discipline,
provenance, craft, and restraint.

It should not look like a luxury brand skin. It should feel like a private
archive for thought:

- every source has provenance
- every judgment has craft
- every relation has structure
- every surface has material discipline
- nothing decorative is louder than the knowledge itself

## Core Translation

Use material language only when it carries product meaning.

| Product fact | Material expression |
| --- | --- |
| Source category | Shelf, drawer, or stored material |
| Source object | Face, spine, edge, and provenance label |
| Collection row | Material sample strip |
| Panel | Swatch of judgment |
| Citation / quote | Registration mark, pin, or slip |
| Relation | Stitch, woven join, or lineage path |
| Reading progress | Edge warmth, stitch density, or quiet return marker |
| AI synthesis | Atelier note or transformation slip |

If a visual element cannot answer "what product truth does this carry?", remove
it.

## Surface Contracts

### Sources

Target: textile archive cabinet.

- Groups render as shelves or drawers, not generic management sections.
- Source categories render as material sample strips, not flat list rows.
- Provenance comes before counts.
- Counts move to trailing, quiet text.
- Controls stay inline and recede until hover, focus, or active confirmation.
- Drag/drop and re-shelving remain available; the archive metaphor must not
  reduce utility.

Current pilot: `/sources` and `/knowledge` top-level source library.

### Category Detail

Target: sample cabinet plus reading return path.

- Top-level folders become drawers.
- Files become mounted source slips.
- Opened, woven, and settled states become edge treatments.
- Rehearse and open actions should sit as marginal tools, not list chrome.
- Scan speed must remain better than the current file-browser surface.

### Reading

Target: sacred source paper.

- Preserve reading clarity above all material richness.
- Do not add textile backgrounds inside the prose column.
- Provenance may appear as a small slip at the top or margin.
- Quote anchors may appear as small knots or pins only on interaction.

### Source Detail

Target: source as valuable material object.

- One main source object should lead the page.
- Show face, spine, edge, provenance, and reading state.
- Use chapter swatches, quote slips, and related panels below.
- Avoid grids of decorative cards.

### Panels And Weaves

Target: judgment as swatch, relation as join.

- Panels should feel like settled material samples, not generic cards.
- Relations should read as stitched or woven joins.
- Show source-to-panel-to-relation lineage as provenance.
- Relation density should feel structured, not graph clutter.

### macOS Shell

Target: native cabinet, not museum poster.

- Native chrome stays Apple-native and restrained.
- Sidebar rows can gain hairline shelf structure and archive-label spacing.
- Heavy texture belongs in web content, not native chrome.
- SF Symbols remain the icon language.

## Material Tokens

Use these as a layer above Vellum, not as a replacement.

```css
--material-linen: #D8CEB8;
--material-bookcloth: #B9A98C;
--material-walnut: #6C432A;
--material-oak: #A7794E;
--material-brass: #B08A45;
--material-parchment-edge: #D2C39F;
--material-wool-shadow: rgba(58, 43, 31, 0.18);
--material-thread-red: #7D2F2B;
--material-horsehair: #2F2923;
```

Usage discipline:

- Linen / bookcloth: object faces and sample strips.
- Walnut / oak: narrow shelf, drawer, or cabinet hints only.
- Brass: pins, accession marks, active edges, and thin rules.
- Parchment edge: source edge, deckle, and page stack.
- Thread red: rare binding string or warning relation, not global accent.
- Horsehair: deep linework or dark material edge.

## Texture Rules

- Texture must remain low-contrast and tied to product meaning.
- Paper tooth can live globally because Vellum already supports it.
- Bookcloth weave belongs on source objects and sample strips.
- Wood grain should appear only as narrow shelf/spine hints.
- Brass should appear as small rules, pins, or active edges.
- Stitched edges can mark citations, relations, or finished states.
- Flatten texture when it risks readability or accessibility.

## Language Rules

Use archive language when it improves comprehension:

- Open collection -> Open shelf
- Add group -> New shelf
- Rename -> Relabel
- Delete group -> Remove shelf
- Move -> Re-shelve
- Metadata -> Provenance
- Related -> Woven with / cited by / points to
- AI summary -> Reading note / atelier note / synthesis slip

Do not overdo the metaphor. If a word slows use, prefer direct product language.

## Repository Boundary

Keep this repository clean:

- Product repo: design principles, UI contracts, tokens, implementation plans,
  and original or licensed product assets.
- Private resource archive: screenshots, moodboards, raw external references,
  case-study notes, exploratory assets, and unlicensed imagery.

No product implementation should require direct access to the private resource
archive. Product code should depend only on the contracts in this repository.
