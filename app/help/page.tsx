/* eslint-disable react/no-unescaped-entities */
/**
 * /help · Loom's usage guide.
 *
 * Complete walkthrough of how to use Loom's unified architecture.
 *
 * Access paths:
 *   - /help (direct URL)
 *   - Sidebar: "Help" link
 *   - CommandPalette: search "help" or "guide"
 *   - KeyboardHelpOverlay footer: "/help" link
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = { title: 'Help · Loom' };

export default function HelpPage() {
  return (
    <article className="prose-notion">
      <h1 style={{ marginBottom: '0.2rem', textAlign: 'left' }}>Usage Guide</h1>
      <p
        style={{
          color: 'var(--fg-secondary)',
          marginTop: 0,
          fontSize: '1.05rem',
        }}
      >
        Loom is a screen that helps you learn until you truly understand.{' '}
        <Link href="/about" style={{ color: 'var(--accent)' }}>
          /about
        </Link>
      </p>

      <Callout>
        <strong>Quick start:</strong> Open any doc → start reading → select
        text → click the warp to ask AI or press <Kbd>⌘⇧A</Kbd> to capture it.
        That's it. Everything else you can learn as you go.
      </Callout>

      <h2>What is this</h2>
      <p>
        Loom is not a notebook, not a PKM, not an AI chat. Loom is a{' '}
        <strong>screen that replaces paper</strong>: you read, ask, capture,
        reconstruct, get examined by AI, and recurse — until a concept truly
        enters your brain.
      </p>
      <p>
        Loom&rsquo;s primary reading loop stays local to the source: select a
        passage, then ask, capture, or highlight it in place. Deeper tools
        remain available through <Kbd>⌘P</Kbd>.
      </p>

      <h2>3-minute quick start</h2>
      <ol>
        <li>
          <strong>Open a doc</strong> from the sidebar or press <Kbd>⌘P</Kbd> to search.
          Loom auto-resumes your last-read doc when you open the app.
        </li>
        <li>
          <strong>Select a passage</strong> you want to think about.
        </li>
        <li>
          <strong>Click the warp thread</strong> to ask AI, or press <Kbd>⌘⇧A</Kbd>
          to capture the passage and elaborate it later in the thought map.
        </li>
      </ol>
      <p>
        That's the core loop: <strong>read → select → think → write</strong>.
        Every other tool builds on this.
      </p>

      <h2>Learning tools</h2>

      <StateRow k="⌘⇧A" name="Capture">
        Select a passage, then press <Kbd>⌘⇧A</Kbd> to capture it as a
        thought-anchor. No dialog appears. The thought is hung in the
        gutter first; elaboration happens later in the wide thought map.
      </StateRow>

      <StateRow k="⌘P" name="All tools">
        Press <Kbd>⌘P</Kbd> and search for any deeper tool:
        <ul style={{ marginTop: 4, marginBottom: 4 }}>
          <li><strong>Rehearsal</strong> — write from memory, ⌘K AI transform, ⌘S save</li>
          <li><strong>Examiner</strong> — AI tests your understanding, ⌘↩ submit</li>
          <li><strong>Import</strong> — drag-drop .md/.txt files</li>
          <li><strong>Export</strong> — download notes as JSON or Markdown</li>
          <li><strong>Thought Map</strong> — review all captures (also ⌘/)</li>
        </ul>
      </StateRow>

      <StateRow k="⌘/" name="Thought Map">
        Near the top of a document, your captures remain visible on the right
        as a quiet reading rail. Press <Kbd>⌘/</Kbd> to bring the thought map
        forward for editing and deep review. Press again to narrow it back.
      </StateRow>

      <h2>Every Note is editable and deletable</h2>
      <p>
        Any focal note (the main note displayed in a panel) can be edited
        in-place by double-clicking:
      </p>
      <ul>
        <li>Edit content (full Markdown + LaTeX support)</li>
        <li>
          <Kbd>⌘↩</Kbd> to save → creates a superseding Note (the original is
          preserved in the trace, just no longer rendered)
        </li>
        <li>
          <Kbd>Esc</Kbd> to cancel
        </li>
        <li>
          The <strong>× Delete</strong> button in the bottom-right → two-step
          confirmation (first click turns red "Delete?", second click actually
          deletes) → soft delete
        </li>
      </ul>
      <p>
        All edits and deletions are <strong>append-only</strong> — history is
        never destroyed, only hidden from view. You can always see everything
        via JSON export.
      </p>

      <h2>Keyboard shortcuts</h2>

      <h3>Capture-first reading</h3>
      <p>
        While reading a document, the fast path is selection-bound:
      </p>
      <Kbds>
        <KbdRow k="✦ click" label="Ask AI about the selection" />
        <KbdRow k="⌘ click" label="Capture directly from the warp thread" />
        <KbdRow k="⌘⇧A" label="Capture selected text without using the mouse" />
        <KbdRow k="⌥ click" label="Highlight the selection" />
        <KbdRow k="⌘/" label="Expand the thought map to elaborate captures" />
      </Kbds>

      <h3>Tools and global shortcuts</h3>
      <Kbds>
        <KbdRow k="⌘P" label="Search everything" />
        <KbdRow k="?" label="This help" />
        <KbdRow k="Esc" label="Close any panel" />
      </Kbds>

      <h2>Command palette · ⌘P</h2>
      <p>
        If you can't remember a shortcut, press <Kbd>⌘P</Kbd> to open the
        command palette. It's Loom's universal action entry point: search a
        keyword and see all matching presets, docs, and actions.
      </p>
      <ul>
        <li>Search "<strong>rehearsal</strong>" → memory writing surface</li>
        <li>Search "<strong>examiner</strong>" → AI testing flow</li>
        <li>Search "<strong>export</strong>" → three export options</li>
        <li>Search a <strong>doc name</strong> → jump to that doc</li>
        <li>Search "<strong>help</strong>" → this page or keyboard help</li>
      </ul>
      <p>
        <Kbd>↑</Kbd><Kbd>↓</Kbd> to navigate, <Kbd>↩</Kbd> to execute,{' '}
        <Kbd>Esc</Kbd> to close. Clicking outside also closes it.
      </p>

      <h2>Search · ⌘F</h2>
      <p>
        The search box in any reading page's toolbar filters your entire Personal
        Layer of Notes in real time. Cross-doc, cross-state. Multi-token AND
        semantics — searching "<code>dpo math</code>" returns only Notes
        containing both words.
      </p>

      <h2>Data export</h2>
      <p>
        Your Notes are always yours. In the <Kbd>⌘P</Kbd> command palette,
        search "export" to see three options:
      </p>
      <ul>
        <li>
          <strong>Export all notes as Markdown</strong> — all notes written to a
          single <code>.md</code> file, organized by source doc, with quotes
          and timestamps
        </li>
        <li>
          <strong>Export all notes as JSON</strong> — full-fidelity JSON backup
          that can be re-imported or migrated
        </li>
        <li>
          <strong>Export current doc's notes as Markdown</strong> — export only
          the notes for the current focal doc, useful for sharing a single
          topic's work
        </li>
      </ul>

      <h2>Where your data lives</h2>
      <ul>
        <li>
          <strong>All notes are stored in the browser's IndexedDB</strong> —
          local, never uploaded
        </li>
        <li>
          <strong>AI calls go through a local CLI</strong> (Codex CLI or Claude
          CLI), not directly to OpenAI/Anthropic APIs
        </li>
        <li>
          <strong>No cloud sync</strong> — the single-machine experience is
          intentional (target device: MBP 16")
        </li>
        <li>
          <strong>Source documents are never modified</strong> — all your
          annotations are an independent Personal Layer overlaid on top of
          sources
        </li>
      </ul>

      <h2>Troubleshooting</h2>

      <Trouble
        symptom="Build error referencing a deleted file"
        fix="A stale next dev server process is running in the background. Kill it and restart Loom.app."
      />
      <Trouble
        symptom="Search returns no results, but the text is clearly there"
        fix="Search is case-insensitive, but all tokens must match. Clear the search and try again."
      />
      <Trouble
        symptom="AI call fails"
        fix="Check that Codex CLI or Claude CLI is working. Run 'codex --version' in the terminal to verify."
      />
      <Trouble
        symptom="Can't find a feature"
        fix="Press ⌘P to open the command palette and search by keyword. Or press ? to see the full keyboard shortcuts list."
      />
      <Trouble
        symptom="Doc loads slowly in the iframe"
        fix="First load shows a loading indicator. If it takes more than 3 seconds, check if 'npm run build' has been run (production mode is much faster than dev)."
      />
      <Trouble
        symptom="Accidentally deleted a Note and want it back"
        fix="Soft delete only hides the Note from view — the original is still in the trace. JSON export will show everything. A restore UI is planned."
      />

      <h2>Further reading</h2>
      <ul>
        <li>
          <Link href="/about">/about</Link> — Loom's design principles and the
          kesi metaphor
        </li>
        <li>
          any reading page — unified architecture main entry (or press <Kbd>⌘P</Kbd>)
        </li>
        <li>
          <Link href="/">/</Link> — Loom home
        </li>
      </ul>

      <h2>North star</h2>
      <p style={{ fontStyle: 'italic', color: 'var(--fg-secondary)' }}>
        Notes are a byproduct of learning, not the object of learning. Time
        spent organizing notes = time not spent learning.
      </p>
      <p>
        Every design decision in Loom passes through this sentence. If a
        feature makes you think "where should I put this / what category does
        it belong to", that feature is wrong. Location, grouping, and ordering
        in Loom are all <strong>automatic</strong>, determined by your actions,
        not by your decisions.
      </p>
      <p>
        Your only job is to <strong>read, ask, and produce</strong>. Leave the
        rest to Loom.
      </p>
    </article>
  );
}

// ── components ───────────────────────────────────────────────────────────

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      style={{
        padding: '1px 6px',
        fontSize: '0.82em',
        fontFamily: 'var(--mono)',
        background: 'var(--code-bg)',
        border: 'var(--hairline)',
        borderRadius: 4,
        color: 'var(--fg)',
      }}
    >
      {children}
    </kbd>
  );
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: '14px 18px',
        borderLeft: '3px solid var(--accent)',
        background: 'color-mix(in srgb, var(--accent) 6%, var(--bg))',
        borderRadius: '0 8px 8px 0',
        margin: '1.2rem 0',
        fontSize: '0.92rem',
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

function StateRow({
  k,
  name,
  children,
}: {
  k: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        padding: '14px 0',
        borderBottom: '0.5px solid var(--mat-border)',
        display: 'flex',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          flex: '0 0 auto',
          width: 90,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 4,
        }}
      >
        <Kbd>{k}</Kbd>
        <strong style={{ fontSize: '0.82rem', color: 'var(--accent)' }}>
          {name}
        </strong>
      </div>
      <div
        style={{
          flex: 1,
          fontSize: '0.92rem',
          lineHeight: 1.6,
          color: 'var(--fg)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Kbds({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 0',
        margin: '0.6rem 0 1rem',
      }}
    >
      {children}
    </div>
  );
}

function KbdRow({ k, label }: { k: string; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 14,
        padding: '3px 0',
        fontSize: '0.88rem',
      }}
    >
      <div style={{ flex: '0 0 auto', minWidth: 130 }}>
        <Kbd>{k}</Kbd>
      </div>
      <div style={{ flex: 1, color: 'var(--fg-secondary)' }}>{label}</div>
    </div>
  );
}

function Trouble({ symptom, fix }: { symptom: string; fix: string }) {
  return (
    <div
      style={{
        padding: '10px 14px',
        marginBottom: 8,
        borderLeft: '2px solid var(--muted)',
        background: 'color-mix(in srgb, var(--fg) 3%, var(--bg))',
        borderRadius: '0 6px 6px 0',
        fontSize: '0.86rem',
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          fontSize: '0.74rem',
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 700,
          marginBottom: 3,
        }}
      >
        {symptom}
      </div>
      <div style={{ color: 'var(--fg)' }}>{fix}</div>
    </div>
  );
}
