# Empty Doc Capture Surface Design

Status: proposed design direction  
Updated: 2026-04-18

## 1. Decision

Loom will add an **empty-doc capture surface**.

When a user creates a new topic or opens a knowledge document that is still only a placeholder, Loom should stop showing a nearly blank reading page and instead show a single source-bound capture workspace.

The approved direction is:

- the document page remains the primary surface
- empty documents become a capture workspace, not a dead page
- writing, pasting, and importing become one flow
- AI organizes material back into the same document
- the result stays source-bound inside Atlas, not split into a separate Today-only thread

This is not a generic Notion clone. It is Loom's way of making the first source legible and writable.

## 2. Problem

Current first-use behavior is structurally fragmented.

Observed during manual Loom.app testing:

- `New topic` previously had a broken route handoff and could land on a dead collection path
- after fixing that route, a new topic still opens a mostly blank markdown page with only a title placeholder
- file import exists, but the discoverable path is `⌘K -> Import -> Ingest one source`, which is too hidden for first-use capture
- freeform paste exists, but only through the `/today` bottom prompt
- the `/today` prompt creates a new Today thread and Live Note instead of organizing material back into the source document

The result is three different mental models:

1. Atlas for documents
2. Import for source intake
3. Today for freeform AI organization

That is the opposite of what the user asked for. It also weakens Loom's own core idea that the source should remain the primary object.

## 3. Product Goal

An empty topic should feel like opening a clean sheet that is already attached to the right place.

The user should be able to:

- type directly
- paste a large block of rough notes
- drop or pick a source file
- ask AI to organize what was given

The output should:

- land in the same document
- remain editable as source content
- keep related assets attached to the same topic
- avoid creating a separate temporary thinking surface unless the user explicitly wants Today-mode work

The first-use answer should become:

1. create or open a topic
2. put material in
3. let Loom organize it
4. continue editing the same document

## 4. Loom Constraints

This feature must stay aligned with Loom's actual product logic.

### 4.1 Source Is Sacred

The capture surface lives inside the document route, not above it.

The user is not filling an inbox card or an AI chat box. They are establishing the first source page for a topic.

### 4.2 AI Is Second Weaver

AI may structure, summarize, and normalize draft material, but it should not replace the document.

The AI result is a draft rewrite of the document body, not a detached assistant response.

### 4.3 Patterns Over Dashboards

Do not add another permanent product surface.

This should not become a fourth core route beside Home, Today, and Atlas. It is a document-state behavior: the empty state of a document page.

### 4.4 One Surface, One Intent

When the document is empty, the intent is capture and first structuring.

When the document becomes real, the capture surface disappears and Loom returns to normal reading / study behavior.

## 5. Scope

This change applies to:

- empty knowledge document pages under `/knowledge/[category]/[slug]`
- new topic creation handoff
- source ingestion handoff for empty topics
- one AI-assisted document organization path

This change may introduce a small document-write API if needed.

## 6. Non-Goals

This change does not:

- redesign Today into a general-purpose document editor
- make all document pages fully editable
- implement complete Notion-style block editing
- solve every file type in one pass
- auto-classify into Patterns as a first step

Patterns remain a later settled output, not the immediate destination of raw capture.

## 7. Chosen Model

### 7.1 Empty Document Becomes Capture Surface

When a document body is effectively still a placeholder, the route renders a dedicated capture state instead of the normal reader.

The page should show:

- the topic title
- a short explanation that this is the first source page for the topic
- one large primary input area
- one intake strip for file drop / pick
- one AI action that organizes the current draft into document structure

The user should read it as:

"This is the page. Start here."

### 7.2 Capture Inputs

The empty-doc capture surface accepts three inputs:

1. direct writing in a large text area
2. paste of rough notes or copied source material
3. file import into the same topic

The large text area is the foreground object.

File import is attached to that same document state, not delegated to a separate hidden workflow.

### 7.3 AI Organize Action

The primary AI action is not "chat" and not "recompile today's weave".

Working label:

- `Organize into note`

The action should:

- read the current draft text
- include imported text-extractable source content when present
- produce a structured markdown rewrite
- write the result back into the document body

The user stays on the same document route before and after the action.

## 8. Routing Behavior

### 8.1 New Topic Handoff

`New topic` should land directly on the first document page, not on the collection landing page.

This is already the desired behavior after the route fix and should remain the contract.

### 8.2 Import Handoff

If the current topic is still empty and the user imports a source into it, Loom should prefer staying within that topic's first document flow.

It should not feel like:

- import somewhere else
- then go hunt for the resulting note

### 8.3 Today Remains Separate

The `/today` prompt remains valid for free-mode weaving, but it is no longer the recommended first step for turning raw topic material into a source note.

## 9. Document-State Detection

The capture surface should appear only when the document is still effectively empty.

Recommended rule:

- treat a document as empty if its body is only a title heading or near-title placeholder
- once meaningful body content exists, render the normal document reader

This avoids adding a new route or manual mode toggle.

## 10. File Intake Contract

### 10.1 First Pass Support

First implementation should support:

- `.md`
- `.txt`
- `.mdx`

Optionally keep existing upload support for richer file types, but only claim full empty-doc integration for text-extractable inputs that can actually feed the AI organization step.

### 10.2 Deferred Rich Assets

PDF, PPT, DOCX, video, and other richer assets are still part of the long-term target, but they should be explicitly treated as follow-up work unless there is already a clean extraction path.

Do not pretend they are fully integrated into the same editable doc flow if the current behavior still treats them as plain uploaded assets.

## 11. UI Contract

### 11.1 Composition

The page should feel like a source sheet, not a settings form.

Recommended vertical order:

1. topic breadcrumb / route context
2. document title
3. one-sentence prompt explaining the purpose
4. large draft text area
5. source intake row
6. AI organize action row
7. optional attached-source list

### 11.2 Primary Focus

The text area is the page.

It should not be visually subordinate to buttons, helper cards, or side panels.

### 11.3 After AI Organization

Once the document has meaningful content:

- the capture surface disappears
- the page becomes a normal document page
- study tools such as selection chat, rehearsal, and examiner work as they already do

## 12. Write Path

This feature needs a real source write path.

Current note storage writes to trace events, not the document body. That is correct for annotations, but not for first-source capture.

The new capture flow therefore needs:

- a safe document write API for empty-topic markdown bodies
- rewrite semantics that replace the placeholder content with organized markdown
- a refresh path so Atlas and the active page immediately see the new body

This is the architectural difference between "generate a Today note" and "establish the actual source".

## 13. Error Handling

If AI organization fails:

- keep the user draft in place
- show a direct inline error
- do not discard typed or pasted content

If file extraction is unsupported:

- keep the asset attached if upload succeeded
- say clearly that the file is attached but was not auto-organized into document text

## 14. Testing

Minimum verification should cover:

- `New topic` lands on the first document route
- an empty document renders the capture surface
- a non-empty document does not render the capture surface
- organize action writes structured markdown back into the document body
- failed organization preserves the draft

Manual desktop validation should cover:

- create topic -> immediately type / paste
- organize into note
- refresh / reopen app
- confirm the same document now opens in normal reader mode

## 15. Recommended Implementation Order

1. detect empty-doc state on knowledge doc routes
2. add source-body write API for the document
3. build the empty-doc capture component
4. connect AI organize action to write-back
5. connect import handoff for empty topics
6. verify in Loom.app by real first-use testing

## 16. Why This Is The Right Next Move

This is the smallest change that actually converges the product toward the requested behavior.

It does not attempt to make Loom a full Notion clone.

It does:

- make the first topic page usable
- make raw capture source-bound
- stop forcing users into Today for first-pass organization
- preserve Loom's model that understanding begins from a source, not from a detached assistant thread
