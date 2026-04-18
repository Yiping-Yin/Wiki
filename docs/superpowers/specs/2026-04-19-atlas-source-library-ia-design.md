# Atlas Source Library IA Design

Status: proposed design direction  
Updated: 2026-04-19

## 1. Decision

Loom will split today's mixed `Atlas` model into two distinct systems:

- **Raw Source Library** — user-owned original materials, grouped by editable metadata
- **LLM Wiki** — Loom's built-in structured reference corpus, kept separate from raw sources

The approved direction is:

- original files remain immutable
- grouping is metadata, not file paths
- AI may suggest organization, but may not silently mutate the real file system
- Loom-uploaded files become Loom-managed immutable sources
- LLM Wiki does not live inside the same editable grouping model as the raw source library

## 2. Problem

The current Atlas behavior conflates two different things:

1. the user's imported or linked source materials
2. Loom's own fixed LLM reference corpus

That produces several failures:

- the sidebar makes local source collections and LLM reference content feel like one system
- grouping is mostly inferred from directory structure, which makes "edit the grouping" feel like "edit the filesystem"
- uploaded source handling is ambiguous: sometimes it looks like new knowledge content, sometimes like a file drop
- future actions like rename, regroup, delete, or archive are under-specified because the product has not clearly separated:
  - original files
  - grouping metadata
  - derived notes

If we do not separate these layers now, later features will either:

- start rewriting user files, or
- keep adding exceptions and ad hoc rules until Atlas becomes incoherent

## 3. Product Goal

Loom should treat source materials the way a careful researcher would:

- preserve the original
- organize it without mutating it
- derive notes from it
- keep the derivation clearly separate from the source

The user should be able to:

1. bring a source into Loom
2. see where it lives in the raw source library
3. adjust its grouping without moving or rewriting the actual file
4. organize it into Loom-owned notes and topic pages
5. keep LLM Wiki separate as a stable knowledge reference

## 4. The Three Core Questions

### 4.1 If a file is uploaded through Loom, what is it?

It becomes a **Loom-managed original source**.

That means:

- Loom stores the original uploaded binary or text file under Loom ownership
- the stored uploaded file is still treated as immutable source material
- extracted text, summaries, embeddings, and organized notes are all derived artifacts
- the source file itself is never converted into a `.txt` replacement and never loses its identity

So there are two source origins:

- **external source**: a file already on disk outside Loom's managed upload area
- **Loom-managed source**: a file imported through Loom and stored by Loom

Both are immutable once present in the library.

### 4.2 Who decides classification?

The answer is:

- **humans own classification**
- **AI may propose classification**
- **paths do not define final classification**

The correct model is:

- the filesystem gives Loom provenance and discovery
- a separate metadata layer gives Loom grouping and presentation

AI may do things like:

- suggest which group a source belongs to
- suggest a new group name
- suggest a topic or tag

But AI should not:

- rename original files
- move original files across folders
- rewrite folder structure in the background

### 4.3 What follows from those two rules?

Everything downstream must operate on three distinct layers:

1. **Immutable Sources**
2. **Organization Metadata**
3. **Derived Artifacts**

That separation is the core architectural decision for Atlas.

## 5. Chosen Model

### 5.1 Immutable Sources

A source record represents the original thing the user brought into Loom.

Each source record may point to:

- an external file path
- a Loom-managed uploaded file

Each source record keeps:

- origin
- original filename
- canonical source URI or path
- extension / mime type
- size
- read-only preview / extraction availability

It does **not** imply:

- current visual grouping
- current topic affiliation
- current display section in Atlas

### 5.2 Organization Metadata

Atlas grouping must become editable metadata.

Examples:

- library group
- subgroup
- topic affiliation
- tags
- pinned / archived state
- ordering

This layer is what powers:

- add group
- rename group
- remove group
- move source between groups

Crucially, this changes metadata only. It does not mutate the original file.

### 5.3 Derived Artifacts

Everything Loom generates from a source belongs here:

- extracted text
- OCR results
- summaries
- embeddings
- organized notes
- topic pages
- patterns

These are writable and replaceable.

They may be rebuilt from the source.

They are not the source.

## 6. IA Split

### 6.1 Raw Source Library

The current user-facing `Atlas` should become the raw source library.

Its job is:

- show user-owned materials
- let the user manage groups
- let the user enter a source and begin organization

This is the editable library.

### 6.2 LLM Wiki

The current `LLM Reference` should become **LLM Wiki**.

Its job is:

- remain a curated Loom-owned knowledge corpus
- serve as stable reference content
- stay outside the editable raw-source grouping system

It should be presented as:

- a separate sidebar section
- a separate search/family in Shuttle
- a separate identity in page labeling

It should not appear as just another Atlas collection.

## 7. Rules

### 7.1 Source Immutability

Hard rule:

- Loom must never rewrite original user source files
- Loom must never replace an original file with a `.txt` derivative
- Loom must never silently move original files to satisfy a grouping change

### 7.2 Upload Immutability

Hard rule:

- files uploaded through Loom are stored as immutable originals
- Loom may attach extracted text alongside them
- Loom may generate topic notes from them
- Loom may not rewrite the uploaded original after import

### 7.3 Grouping Is Metadata

Hard rule:

- changing Atlas grouping must only update Loom-owned metadata
- deleting a group must not delete original files by default
- removing a source from a group must not remove the source from the library

## 8. Atlas Operations

The raw source library should support these operations:

### 8.1 Add Group

Create a new user-defined group in metadata.

No file operations.

### 8.2 Rename Group

Rename the metadata label only.

No file operations.

### 8.3 Remove Group

If a group is deleted:

- contained sources are not deleted
- contained sources move to a fallback group such as `Ungrouped` or `Inbox`

### 8.4 Move Source Between Groups

Move the source's metadata affiliation only.

No file move.

### 8.5 Delete Source

This must distinguish two cases:

- **external source**: remove Loom's reference + metadata only; do not delete the underlying file
- **Loom-managed upload**: deletion may remove the Loom-owned copy, but this is a real destructive action and must be explicit

## 9. Capture Workflow Interaction

The empty-doc capture workflow remains valid, but it must respect the same source rules.

That means:

- AI may write only into Loom-owned topic pages / capture docs
- imported source material may be read and summarized
- original sources remain untouched

So:

- source -> read only
- topic doc -> writable
- grouping -> metadata

## 10. Data Model Direction

The minimum new data model should distinguish:

- `source_record`
- `source_group`
- `source_group_membership`
- `derived_doc_link`

At minimum, each source should have:

- stable id
- origin kind (`external`, `loom-upload`)
- immutable source locator
- title / display label
- file type
- group metadata reference

This can start with a local metadata file or local store. It does not need a full cloud sync design in the first pass.

## 11. Scope

This IA change applies to:

- sidebar source grouping
- `/knowledge` collection presentation
- source import ownership semantics
- future delete / rename / regroup behavior
- naming of `LLM Reference`

## 12. Non-Goals

This change does not:

- redesign the LLM Wiki article pages
- redesign the capture surface itself
- implement full drag-and-drop regrouping in the first pass
- implement cloud sync for group metadata
- implement bulk source lifecycle tooling in the first pass

## 13. Recommended First Implementation Slice

First pass should do only this:

1. rename `LLM Reference` to `LLM Wiki`
2. split sidebar rendering so raw source collections and LLM Wiki are no longer presented as one system
3. add Loom-owned grouping metadata for raw sources
4. support:
   - add group
   - rename group
   - delete group
   - assign source to group
5. keep all source files immutable

## 14. Why This Is The Right Next Move

This design resolves the ambiguity at the root:

- what is source
- what is group
- what is derived note

Without this split, future features like delete, regroup, organize, archive, and source linking will keep colliding.

With this split, Loom gains a clean foundation:

- source library
- reference wiki
- capture workflow
- derived thinking artifacts

Each can now evolve without corrupting the others.
