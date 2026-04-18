/* eslint-disable react/no-unescaped-entities */
/**
 * /help · Loom's usage guide.
 *
 * Complete walkthrough of how to use Loom's unified architecture.
 *
 * Access paths:
 *   - /help (direct URL)
 *   - Sidebar: "Help" link
 *   - Shuttle: ⌘K
 *   - KeyboardHelpOverlay footer: "/help" link
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = { title: 'Help · Loom' };

export default function HelpPage() {
  return (
    <article className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '4rem' }}>
      <h1 style={{ marginBottom: '0.2rem', textAlign: 'left' }}>Usage Guide</h1>
      <p
        style={{
          color: 'var(--fg-secondary)',
          marginTop: 0,
          fontSize: '1.05rem',
        }}
      >
        Loom is a reading-and-thinking environment where source-bound understanding is woven into memory.{' '}
        <Link href="/about" style={{ color: 'var(--accent)' }}>
          /about
        </Link>
      </p>

      <p>
        <strong>织者即智者。</strong> The loom holds the tension; the weaver
        makes the judgment. The system can organize and reflect, but the
        understanding is still woven by the person doing the work.
      </p>

      <Callout>
        <strong>Quick start:</strong> Open any doc → start reading → select
        text → click the warp to ask AI or press <Kbd>⌘⇧A</Kbd> to interlace it.
        That's it. Everything else you can learn as you go.
      </Callout>

      <h2>Getting around Loom</h2>
      <p>
        Loom now has a clear desktop entry hierarchy:
      </p>
      <ul>
        <li>
          <strong>Sidebar</strong> is the primary navigation layer. Use it to move
          between <em>Today</em>, <em>Atlas</em>, <em>Patterns</em>, and document collections.
        </li>
        <li>
          <strong>Shuttle</strong> is the fast path. Press <Kbd>⌘K</Kbd> to jump anywhere quickly.
          In the macOS app, it stays an in-window fast path rather than a second navigation layer.
        </li>
        <li>
          <strong>Home</strong> is the quiet start surface. It shows current work,
          recent resolved changes, and recent threads. It is not a second navigation page.
        </li>
      </ul>

      <h2>What is this</h2>
      <p>
        Loom is not a notebook, not a PKM, not an AI chat. It is a screen for
        reading, asking, interlacing, reconstructing, verifying, and returning
        until a concept is stable enough to keep.
      </p>
      <p>
        Loom&rsquo;s primary reading loop stays local to the source: select a
        passage, then ask, interlace, or highlight it in place. Deeper tools
        remain available through the <Kbd>⌘K</Kbd> Shuttle.
      </p>

      <h2>3-minute quick start</h2>
      <ol>
        <li>
          <strong>Start from Home or Today</strong> if you want the next recommended thread,
          or open a doc directly from the sidebar if you already know where you want to go.
        </li>
        <li>
          <strong>Select a passage</strong> you want to think about.
        </li>
        <li>
          <strong>Click the warp thread</strong> to ask AI, or press <Kbd>⌘⇧A</Kbd>
          to interlace the passage and elaborate it later in the thought map.
        </li>
      </ol>
      <p>
        That's the core loop: <strong>read → select → think → write</strong>.
        Every other tool builds on this.
      </p>

      <h2>Learning tools</h2>

      <StateRow k="⌘⇧A" name="Interlace">
        Select a passage, then press <Kbd>⌘⇧A</Kbd> to interlace it as a
        thought-anchor. No dialog appears. The thought is hung in the
        gutter first; elaboration happens later in the wide thought map.
      </StateRow>

      <StateRow k="⌘K" name="Shuttle">
        Press <Kbd>⌘K</Kbd> to shuttle anywhere in Loom:
        <ul style={{ marginTop: 4, marginBottom: 4 }}>
          <li><strong>Rehearsal</strong> — write from memory, ⌘K AI transform, ⌘S save</li>
          <li><strong>Examiner</strong> — AI tests your understanding, ⌘↩ submit</li>
          <li><strong>Import</strong> — drag-drop .md/.txt files</li>
          <li><strong>Export</strong> — download patterns as JSON or Markdown</li>
          <li><strong>Thought Map</strong> — review all interlaced thoughts (also ⌘/)</li>
        </ul>
      </StateRow>

      <StateRow k="⌘/" name="Thought Map">
        Near the top of a document, your interlaced thoughts remain visible on the right
        as a quiet reading rail. Press <Kbd>⌘/</Kbd> to bring the thought map
        forward for editing and deep review. Press again to narrow it back.
      </StateRow>

      <h2>Every Pattern is editable and deletable</h2>
      <p>
        Any focal thought-anchor can be edited in-place by double-clicking:
      </p>
      <ul>
        <li>Edit content (full Markdown + LaTeX support)</li>
        <li>
          <Kbd>⌘↩</Kbd> to save → creates a superseding version (the original is
          preserved in the trace, just no longer rendered)
        </li>
        <li>
          <Kbd>Esc</Kbd> to cancel
        </li>
        <li>
          The <strong>× Remove</strong> button in the bottom-right → two-step
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

      <h3>Interlace-first reading</h3>
      <p>
        While reading a document, the fast path is selection-bound:
      </p>
      <Kbds>
        <KbdRow k="✦ click" label="Ask AI about the selection" />
        <KbdRow k="⌘ click" label="Interlace directly from the warp thread" />
        <KbdRow k="⌘⇧A" label="Interlace selected text without using the mouse" />
        <KbdRow k="⌥ click" label="Highlight the selection" />
        <KbdRow k="⌘/" label="Settle the current weave in the thought map" />
      </Kbds>

      <h3>Tools and global shortcuts</h3>
      <Kbds>
        <KbdRow k="⌘K" label="Shuttle through everything" />
        <KbdRow k="Relations" label="Open the active pattern’s relation layer from the Atlas" />
        <KbdRow k="?" label="This help" />
        <KbdRow k="Esc" label="Close any panel" />
      </Kbds>

      <h2>The Shuttle · ⌘K</h2>
      <p>
        If you can't remember where something lives, press <Kbd>⌘K</Kbd>.
        The shuttle is the fast path, not the main navigation layer.
      </p>
      <ul>
        <li>Search "<strong>rehearsal</strong>" → deepen a pattern from memory</li>
        <li>Search "<strong>examiner</strong>" → verify a woven understanding</li>
        <li>Search "<strong>thought map</strong>" → settle the current weave</li>
        <li>Search "<strong>export</strong>" → three export options</li>
        <li>Search a <strong>doc name</strong> → shuttle to that doc</li>
        <li>Search "<strong>help</strong>" → this page or keyboard help</li>
      </ul>
      <p>
        <Kbd>↑</Kbd><Kbd>↓</Kbd> to navigate, <Kbd>↩</Kbd> to execute,{' '}
        <Kbd>Esc</Kbd> to close. Clicking outside also closes it.
      </p>

      <h2>Atlas Filtering · ⌘F</h2>
      <p>
        The filter box in the Atlas filters your entire personal
        Layer of thoughts in real time. Cross-doc, cross-state. Multi-token AND
        semantics — searching "<code>dpo math</code>" returns only thoughts
        containing both words.
      </p>

      <h2>Data export</h2>
      <p>
        Your woven patterns are always yours. In the <Kbd>⌘K</Kbd> Shuttle,
        search "export" to see three options:
      </p>
      <ul>
        <li>
          <strong>Export all patterns as Markdown</strong> — all patterns written to a
          single <code>.md</code> file, organized by source doc, with quotes
          and timestamps
        </li>
        <li>
          <strong>Export all patterns as JSON</strong> — full-fidelity JSON backup
          that can be re-imported or migrated
        </li>
        <li>
          <strong>Export current doc's patterns as Markdown</strong> — export only
          the patterns for the current focal doc, useful for sharing a single
          topic's work
        </li>
      </ul>

      <h2>Where your data lives</h2>
      <ul>
        <li>
          <strong>All thoughts are stored in the browser's IndexedDB</strong> —
          local, never uploaded
        </li>
        <li>
          <strong>AI calls go through local machine runtimes</strong> —
          Codex CLI first, Claude CLI as fallback. Choose the preferred runtime
          in Settings.
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
        symptom="Shuttle returns no results, but the text is clearly there"
        fix="Shuttle is case-insensitive, but all tokens must match. Clear the shuttle and try again."
      />
      <Trouble
        symptom="AI is unavailable"
        fix="Loom runs through local AI runtimes on this machine. Open Settings and check Preferred AI runtime. Loom tries Codex CLI first and falls back to Claude CLI when possible."
      />
      <Trouble
        symptom="Can't find a feature"
        fix="Press ⌘K to open the Shuttle and search by keyword. Or press ? to see the full keyboard shortcuts list."
      />
      <Trouble
        symptom="Doc loads slowly in the iframe"
        fix="First load shows a loading indicator. If it takes more than 3 seconds, check if 'npm run build' has been run (production mode is much faster than dev)."
      />
      <Trouble
        symptom="Accidentally removed a thought and want it back"
        fix="Removal only hides the thought from view — the original is still in the trace. JSON export will show everything."
      />

      <h2>Further reading</h2>
      <ul>
        <li>
          <Link href="/about">/about</Link> — Loom's design principles and the
          weaving metaphor
        </li>
        <li>
          <Link href="/">/</Link> — the quiet desktop start surface
        </li>
        <li>
          any reading page — the primary learning surface
        </li>
      </ul>

      <h2>North star</h2>
      <p style={{ fontStyle: 'italic', color: 'var(--fg-secondary)' }}>
        Patterns are a byproduct of learning, not the object of learning. Time
        spent organizing thoughts = time not spent learning.
      </p>
      <p>
        Every design decision in Loom passes through this sentence. If a
        feature makes you think "where should I put this / what category does
        it belong to", that feature is wrong. Location, grouping, and ordering
        in Loom are all <strong>automatic</strong>, determined by your actions,
        not by your decisions.
      </p>
      <p>
        Your only job is to <strong>read, shuttle, and produce</strong>. Leave the
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
