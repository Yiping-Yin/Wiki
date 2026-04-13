/**
 * /about · Loom's self-description.
 *
 * The page itself obeys the principles it describes. No cards, no boxes,
 * no hero buttons, no shadows. Just typography on the same prose-notion
 * canvas every other doc in Loom uses. The form is the argument.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata = { title: 'About · Loom' };

export default function AboutPage() {
  return (
    <article className="prose-notion">
      <h1 style={{ marginBottom: '0.2rem', textAlign: 'left' }}>Loom</h1>
      <p style={{ color: 'var(--fg-secondary)', marginTop: 0, fontSize: '1.05rem' }}>
        Think on the Loom. Live in your <em style={{ color: 'var(--accent)', fontStyle: 'normal' }}>Kesi</em>.
      </p>

      <p>
        Loom is a thinking tool. Not a note app, not a chat app, not an AI
        assistant — a <strong>loom</strong>: a tool that turns loose threads
        of thought into woven fabric.
      </p>

      <h2>Why it&rsquo;s called Loom</h2>
      <p>
        Not because the interface draws warp and weft. Because the product
        <strong> does what a loom does</strong>.
      </p>
      <p>
        A kesi weaver sits before a loom. The loom holds the tension, aligns
        the threads, structures the fabric. The weaver&rsquo;s job is to
        choose where to place color and when to break the weft. The loom
        absorbs the organizational burden; the weaver focuses on intent.
      </p>
      <p>
        A Loom user sits before a document. The AI organizes the answer,
        anchors it to the right passage, connects it to prior thoughts.
        The user&rsquo;s job is to choose what to ask and when to commit.
        Loom absorbs the organizational burden; the thinker focuses on intent.
      </p>
      <p style={{ color: 'var(--fg-secondary)', fontSize: '0.95rem' }}>
        织者即智者 — the weaver is the wise one. In Chinese, <em>zhīzhě</em> means
        both. This is not a metaphor we chose; it is one the language already knew.
      </p>

      <h2>How it works</h2>
      <p>
        <strong>Reading</strong> — open any document. Just the prose, centered,
        nothing else. Immersive.
      </p>
      <p>
        <strong>Asking</strong> — select a passage, click the accent thread
        that appears at its edge. The document focuses on that passage; you
        and the AI discuss it. Fast, multi-turn, like scribbling in a margin
        but faster and cleaner.
      </p>
      <p>
        <strong>Anchoring</strong> — when you&rsquo;re done, commit. A tiny dot
        appears in the margin next to that passage. Your thought is now
        anchored to the source. The document returns to normal — no insertion,
        no disruption, the source is sacred.
      </p>
      <p>
        <strong>Iterating</strong> — select the same passage again later, ask
        another question, commit again. Your thought doesn&rsquo;t fork into a
        second note; it <em>deepens</em>. The anchor becomes a container of
        versions, oldest to newest. The AI sees your prior iterations and
        builds on them instead of restarting. Depth is visible as{' '}
        <code style={{ background: 'var(--code-bg)', padding: '1px 6px', borderRadius: 4, fontSize: '0.85em' }}>v3</code>{' '}
        or <code style={{ background: 'var(--code-bg)', padding: '1px 6px', borderRadius: 4, fontSize: '0.85em' }}>v7</code>{' '}
        next to the anchor — you can expand the history to see how your
        understanding evolved.
      </p>
      <p>
        <strong>Reviewing</strong> — hover any dot to see its note. Press
        <kbd>⌘/</kbd> to enter review mode — the source recedes, a centered
        glass <strong>Live Note</strong> becomes the main object of attention,
        and a companion <strong>thought map</strong> accompanies it on the right.
        The thought map doesn&rsquo;t just show <em>where</em> you thought; it
        shows <em>how deeply</em>. A section with one deeply iterated anchor
        carries more weight than a section with three shallow reactions.
      </p>
      <p>
        <strong>Connecting</strong> — write a markdown link from one anchor to
        another document, and Loom notices. When you open the referenced
        document, its Live Note shows a <strong>Referenced by</strong> section
        listing every anchor in every other document that points here. The
        weft threads from other panels become visible from this panel&rsquo;s
        perspective.
      </p>
      <p>
        <strong>Crystallizing</strong> — two scopes. Lock a single thought
        container with <code style={{ background: 'var(--code-bg)', padding: '1px 6px', borderRadius: 4, fontSize: '0.85em' }}>◈</code>{' '}
        when you feel that one idea has reached its final form — no more
        versions will be appended without unlocking first. Crystallize the{' '}
        <em>whole document</em> when its thought map is complete; the panel
        enters your <Link href="/kesi" style={{ color: 'var(--accent)' }}>kesi</Link>.
        Small locks for individual insights, one big lock for the whole
        weaving.
      </p>

      <h2>How you learn</h2>
      <p>
        Learning is not reading. Reading is input. Learning is the
        moment your brain <strong>reorganizes itself</strong> around
        something new. That moment happens in a specific pattern:
      </p>
      <ol style={{ paddingLeft: '1.4rem' }}>
        <li>
          <strong>Ingest</strong> — new material enters your field of view.
          You don&rsquo;t understand it yet. That&rsquo;s fine.
        </li>
        <li>
          <strong>Chaotic questioning</strong> — you read and questions
          erupt: &ldquo;what is this?&rdquo; &ldquo;why?&rdquo; &ldquo;how
          does this connect to X?&rdquo; The questions are scattered,
          following instinct. This is the most important phase — your brain
          is building its first connections.
        </li>
        <li>
          <strong>Systematic questioning</strong> — the questions gain
          structure: &ldquo;section 2 contradicts section 4&rdquo;,
          &ldquo;if A holds, then B should too, but the author
          doesn&rsquo;t say so.&rdquo; From scattered to structured doubt.
        </li>
        <li>
          <strong>Holistic grasp</strong> — you stop looking at details and
          see the whole: &ldquo;what is this article really saying, in one
          sentence?&rdquo; From trees to forest.
        </li>
        <li>
          <strong>Reconstruction</strong> — close the book. Write what you
          understood from memory. The parts you can&rsquo;t write are the
          parts you haven&rsquo;t learned. This is the most painful and
          most effective action in all of learning.
        </li>
        <li>
          <strong>Verification</strong> — someone (or AI) tests you. Not
          &ldquo;what&rsquo;s the definition&rdquo; (recall) but
          &ldquo;what would happen in a new scenario&rdquo; (transfer).
          If you can answer, you&rsquo;ve truly learned.
        </li>
      </ol>
      <p>
        Then the cycle recurses: your reconstruction becomes new material
        for higher-level learning. Back to step 1.
      </p>

      <h3>The micro ↔ macro oscillation</h3>
      <p>
        These six phases are not linear. Your brain oscillates between
        micro and macro constantly:
      </p>
      <p style={{ color: 'var(--fg-secondary)', fontSize: '0.92rem', lineHeight: 1.7 }}>
        Read a paragraph (micro) → a question arises (micro) → you notice
        a connection to the previous section (macro) → go back and reread
        one sentence (micro) → &ldquo;oh, these two mean the same
        thing&rdquo; (macro) → try to say it in your own words
        (reconstruction) → can&rsquo;t, go back to the source (micro) →
        this time you understand (micro) → place it in the whole picture
        (macro).
      </p>
      <p>
        <strong>Learning is not &ldquo;read first, summarize
        later.&rdquo;</strong> Learning is the continuous oscillation
        between micro and macro. Every jump is a deepening of
        understanding. Loom exists to make these jumps frictionless.
      </p>

      <h3>This oscillation is weaving</h3>
      <p>
        A kesi weaver does not weave one thread from left to right, then
        the next, then the next. The shuttle goes <strong>back and
        forth</strong>. Each pass lays a single weft thread. The weaver
        pauses, steps back, checks the pattern forming, then returns to
        lay the next thread. Back and forth, micro and macro, thousands
        of times.
      </p>
      <p>
        Learning is the same motion:
      </p>
      <ul>
        <li>The <strong>warp</strong> (经) is your source — the document
          you&rsquo;re reading. It runs vertically, continuous, unchanging.</li>
        <li>Each <strong>weft thread</strong> (纬) is one thought — bounded,
          anchored to a specific passage. Broken at the boundary of each
          idea.</li>
        <li>The <strong>shuttle</strong> is your attention — it moves
          across the warp (reading a passage), returns (reviewing your
          captures), moves again (reading the next passage). Back and
          forth.</li>
        <li><strong>Stepping back to see the pattern</strong> = the macro
          view. ⌘/ opens the thought map: all your weft threads visible
          at once. Where is the pattern dense? Where are the gaps?</li>
        <li><strong>Leaning in to lay the next thread</strong> = the micro
          view. Click a gap in the thought map, scroll to the source,
          read, capture. One more weft thread placed.</li>
      </ul>
      <p>
        The kesi emerges from thousands of passes. Understanding emerges
        from thousands of micro ↔ macro oscillations. <strong>The process
        is identical. Loom is not a metaphor for weaving. Learning IS
        weaving.</strong>
      </p>
      <p style={{ color: 'var(--fg-secondary)', fontSize: '0.92rem', fontStyle: 'italic' }}>
        通经断纬 — continuous warp, broken weft. The source is continuous.
        Your thoughts are discrete. The fabric of understanding forms at
        the intersection.
      </p>

      <h3>How Loom supports each transition</h3>
      <dl style={{ margin: '1rem 0' }}>
        <DLRow word="Micro → Meso"    def="Capture a passage with ⌘⇧A or ⌘-click on the warp. A thought-anchor appears beside the source without interrupting reading." />
        <DLRow word="Meso → Macro"    def="⌘/ expands the thought map: see all your captures for the entire document. Identify gaps — sections with no captures." />
        <DLRow word="Macro → Micro"   def="Click any capture in the thought map → the document scrolls to the source passage and highlights it. Zoom back in." />
        <DLRow word="Micro → Rehearsal" def="Open Rehearsal from ⌘P when you want to write from memory. The source falls away; the friction of recall IS the learning." />
        <DLRow word="Micro ↔ Meta"    def="Active Retrieval: while reading document B, a blue dot appears when a passage is semantically similar to a note you made on document A. Cross-document connections surface automatically." />
      </dl>

      <h2>The six principles</h2>
      <ol style={{ paddingLeft: '1.4rem' }}>
        <li>
          <strong>Loom is a loom</strong> — the product does not reference kesi;
          the product IS kesi, performed on thought instead of thread.
        </li>
        <li>
          <strong>Silent spring rain</strong> — the tool exists, the work
          happens, the result is rich — but the user only notices the result,
          never the act.
        </li>
        <li>
          <strong>The source is sacred</strong> — the document is never
          modified. Notes exist as dots in the margin, visible only when you
          look for them.
        </li>
        <li>
          <strong>You are the author, always</strong> — every piece of
          content in Loom is yours to edit. AI summaries, exam answers,
          rehearsal transforms, capture whispers — all are drafts until you
          say otherwise. AI is the second weaver, never the first. You can
          rewrite, override, or discard anything the AI produces. The edit
          is append-only: your version supersedes the AI&rsquo;s, but the
          history is preserved. <em>The weaver chooses where to place color.
          The loom only holds the tension.</em>
        </li>
        <li>
          <strong>Faster and cleaner than handwriting</strong> — not a
          replacement for pen and paper; structurally better output in less
          time. This is what kesi does to painting.
        </li>
        <li>
          <strong>The thought map is the pattern</strong> — a weaver&rsquo;s
          mind holds the entire fabric before the first thread is laid. Your
          thought map is that mental pattern made visible. It shows not only
          where you thought but <em>how deeply</em>: a single idea iterated
          seven times has more weight than seven scattered first reactions.
        </li>
      </ol>

      <h2>通经断纬 · the kesi technique</h2>
      <p>
        The Chinese silk-tapestry craft <em>kesi</em> (缂) has one defining
        technique: <strong>通经断纬</strong> — continuous warp, broken weft.
      </p>
      <ul>
        <li>The <strong>warp</strong> runs through the entire fabric, unbroken —
          your sustained library of sources, your time itself.</li>
        <li>The <strong>weft</strong> moves only within one color block — each
          thought has a clean boundary, never bleeding into the next.</li>
      </ul>
      <p>
        ChatGPT is continuous warp, continuous weft — everything blurs into
        one infinite scroll. Nothing has shape. Loom is continuous warp,
        <em> broken</em> weft — each thought has its own panel, each panel
        keeps its color, the picture emerges only as panels join.
        <strong> It is the discreteness that lets the picture be seen.</strong>
      </p>

      <h2>The mark</h2>
      <p>
        Loom does not have a logo in the usual sense. It has four visual
        forms of one idea — the warp threads of a kesi loom — each at the
        right density for its scene.
      </p>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1.6rem',
        margin: '1.6rem 0 0.8rem',
      }}>
        <IconCell label="Brand · 8 warps" caption="The favicon and dock icon. L+O+O+M = exactly 8 vertical strokes. The 7 wefts are not drawn — they are what you weave by using the product.">
          <BrandIconSpecimen />
        </IconCell>
        <IconCell label="Static · 12 warps" caption="The empty kesi on /kesi. Denser count for visual presence. Each thread has a subtle silk-sheen gradient.">
          <StaticIconSpecimen />
        </IconCell>
        <IconCell label="Active · 3+1 shuttle" caption="Loading indicator when AI takes >600ms. Three warps + one shuttle — the smallest readable loom. 通经断纬 distilled to its minimum.">
          <ActiveIconSpecimen />
        </IconCell>
        <IconCell label="Alive · 8 warps" caption="The home page. Each thread breathes at its own frequency (3.2–5.4s) like silk under different tensions. A shuttle traverses every 10s — barely noticed, but the loom feels alive.">
          <HomeLoomSpecimen />
        </IconCell>
      </div>

      <h2>What this is not</h2>
      <ul>
        <li><strong>Not a note app.</strong> Notes are dead text. Thought-anchors are living structures linked to sources.</li>
        <li><strong>Not a chat app.</strong> Chats are linear and disposable. The thought map is spatial and permanent.</li>
        <li><strong>Not a wiki.</strong> Wikis are read by everyone. Your kesi is woven by you.</li>
        <li><strong>Not an AI assistant.</strong> AI is the second weaver, never the first.</li>
        <li><strong>Not a productivity tool.</strong> Loom doesn&rsquo;t help you do more. It helps you understand more.</li>
      </ul>

      <h2>Vocabulary</h2>
      <dl style={{ margin: '1rem 0' }}>
        <DLRow word="Loom"             def="The product. The tool you think with. A loom for thought." />
        <DLRow word="Kesi · 缂"        def="The lasting personal fabric you build on the Loom — your tapestry of understanding." />
        <DLRow word="Panel"            def="One crystallized thought map — a complete piece of understanding woven from a single source." />
        <DLRow word="Warp · 经"        def="Your sustained source materials: documents, PDFs, videos. The vertical threads that run through everything." />
        <DLRow word="Weft · 纬"        def="Each individual thought, bounded by the passage it anchors to. Broken at the boundary of each color block." />
        <DLRow word="Thought-anchor · ◆" def="A position in the source document holding a chain of versions of your thinking about that passage. Not a single note — a container that deepens each time you iterate. Filled ◆ means woven; hollow ◇ means bare." />
        <DLRow word="Version · v{N}"   def="One iteration of thinking inside a thought-anchor. v1 is your first framing; v2 refines or overturns it; v3 deepens further. The latest is the public face; the history is one click away." />
        <DLRow word="Thought map"      def="The companion structure of your anchored notes for one document — the pattern in the weaver's mind. Shows depth (× N total iterations) as well as presence, visible at the start of reading and beside the Live Note in review." />
        <DLRow word="Backlink · Referenced by" def="An anchor in another document whose note contains a markdown link pointing here. Rendered as a 'Referenced by' block above the Live Note — the weft threads from other panels, visible from this panel's perspective." />
        <DLRow word="Crystallize · ◈"  def="Lock a single thought container as final. No new versions can be appended without unlocking. Signals to yourself: I'm done thinking about this specific idea." />
        <DLRow word="Crystallize (whole doc)" def="Finish the whole document's thought map and settle the panel into your kesi. The big lock." />
        <DLRow word="Trace"            def="The append-only event log for one document. The substrate of everything above." />
        <DLRow word="Chat · ✦"         def="Select a passage → discuss it with AI. Vertical focus. Ephemeral until committed. The AI sees your prior iterations on this exact passage, if any." />
        <DLRow word="Review · ⌘/"      def="Bring the Live Note to the center and review the woven understanding of the current document, with its companion thought map on the right. Version history is expandable per anchor." />
      </dl>

      <p style={{ color: 'var(--fg-secondary)', fontStyle: 'italic', marginTop: '2.4rem' }}>
        Think on the Loom. Live in your Kesi.
      </p>
      <p style={{ marginTop: '1.5rem' }}>
        <Link href="/dev/principles" style={{ color: 'var(--accent)' }}>
          Read the design constitution →
        </Link>
      </p>
    </article>
  );
}

/* ─────────── helpers ─────────── */

function Rule() {
  return (
    <hr style={{
      border: 0,
      borderTop: '0.5px solid var(--mat-border)',
      margin: '1.6rem 0 1.4rem',
    }} />
  );
}

function IconCell({ label, caption, children }: { label: string; caption: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {children}
      </div>
      <div className="t-caption2" style={{
        textTransform: 'uppercase', letterSpacing: '0.10em',
        color: 'var(--accent)', fontWeight: 700, fontSize: '0.66rem', marginTop: 8,
      }}>{label}</div>
      <p style={{ margin: '4px 0 0', color: 'var(--fg-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>{caption}</p>
    </div>
  );
}

function BrandIconSpecimen() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icon.png" alt="" width={80} height={80} style={{ borderRadius: 18 }} aria-hidden />
  );
}

function StaticIconSpecimen() {
  const WARPS = 12;
  const W = 280;
  const H = 96;
  const PAD = 14;
  const gap = (W - PAD * 2) / (WARPS - 1);

  return (
    <svg width="220" height="90" viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ color: 'var(--fg)' }}>
      <defs>
        <linearGradient id="about-static-silk" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0"/>
          <stop offset="25%" stopColor="currentColor" stopOpacity="0.35"/>
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.50"/>
          <stop offset="75%" stopColor="currentColor" stopOpacity="0.35"/>
          <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {Array.from({ length: WARPS }, (_, i) => {
        const x = PAD + i * gap;
        return (
          <line key={i} x1={x} y1="4" x2={x} y2={H - 4}
            stroke="url(#about-static-silk)" strokeWidth="1" strokeLinecap="round" />
        );
      })}
    </svg>
  );
}


function ActiveIconSpecimen() {
  return (
    <svg width="140" height="60" viewBox="0 0 220 80" aria-hidden style={{ color: 'var(--fg)' }}>
      {/* 3 warp threads + 1 ghost thread (destination) */}
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35">
        <line x1="60" y1="16" x2="60" y2="64"/>
        <line x1="90" y1="16" x2="90" y2="64"/>
        <line x1="120" y1="16" x2="120" y2="64"/>
        <line x1="150" y1="16" x2="150" y2="64" opacity="0.2"/>
      </g>
      {/* 1 shuttle — blue accent, weaves toward the 4th thread */}
      <rect x="56" y="36" width="14" height="3" rx="1.5" fill="var(--accent)">
        <animate attributeName="x" values="56;150;150;56;56" keyTimes="0;0.55;0.65;0.97;1" dur="2.4s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.62;0.7;1" dur="2.4s" repeatCount="indefinite"/>
      </rect>
    </svg>
  );
}

function HomeLoomSpecimen() {
  // Shuttle with ease-in-out (human hand rhythm).
  // Thread brightness follows an arc: center brightest, edges dimmer (silk tension).
  // Fade duration also varies: center threads linger, edge threads dissipate faster.
  const WARPS = 8;
  const W = 240;
  const H = 100;
  const PAD = 24;
  const gap = (W - PAD * 2) / (WARPS - 1);
  const DUR = 10;
  const DIM = 0.06;

  // Arc-shaped brightness: center threads peak brighter, edges dimmer.
  // Thread 0,7 (edges) → 0.30; Thread 3,4 (center) → 0.50
  function peakForThread(i: number): number {
    const center = (WARPS - 1) / 2; // 3.5
    const dist = Math.abs(i - center) / center; // 0 at center, 1 at edge
    return 0.50 - dist * 0.20; // 0.50 → 0.30
  }

  // Fade duration: center threads linger longer (high tension, slow decay).
  function fadeForThread(i: number): number {
    const center = (WARPS - 1) / 2;
    const dist = Math.abs(i - center) / center;
    return 0.20 - dist * 0.08; // center 0.20, edge 0.12
  }

  // Ease-in-out: shuttle starts fast, slows in middle, speeds at end.
  // Map linear thread position to eased time using cubic approximation.
  function easeInOut(t: number): number {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function threadKeyframes(i: number) {
    const norm = i / (WARPS - 1);
    // Apply easing to thread peak times — non-linear spacing
    const easedNorm = easeInOut(norm);
    const fwd = easedNorm * 0.36 + 0.08;
    const ret = 1.0 - fwd;
    const rise = 0.03;
    const hold = 0.02;
    const fade = fadeForThread(i);
    const bright = peakForThread(i);

    const fwdEnd = fwd + hold + fade;
    const retStart = ret - rise;
    const overlaps = fwdEnd >= retStart - 0.01;

    const pts: [number, number][] = [];

    if (overlaps) {
      pts.push([0, DIM]);
      pts.push([fwd - rise, DIM]);
      pts.push([fwd, bright]);
      pts.push([ret + hold, bright]);
      pts.push([ret + hold + fade, DIM]);
      pts.push([1, DIM]);
    } else {
      pts.push([0, DIM]);
      pts.push([fwd - rise, DIM]);
      pts.push([fwd, bright]);
      pts.push([fwd + hold, bright]);
      pts.push([fwd + hold + fade, DIM]);
      pts.push([ret - rise, DIM]);
      pts.push([ret, bright]);
      pts.push([ret + hold, bright]);
      pts.push([Math.min(0.98, ret + hold + fade), DIM]);
      pts.push([1, DIM]);
    }

    const clean: [number, number][] = [];
    for (const [t, v] of pts) {
      const tc = Math.max(0, Math.min(1, t));
      if (clean.length > 0 && tc <= clean[clean.length - 1][0] + 0.003) continue;
      clean.push([tc, v]);
    }
    if (clean[clean.length - 1][0] < 0.999) {
      clean.push([1, DIM]);
    } else {
      clean[clean.length - 1][0] = 1;
    }

    // Generate keySplines: ease-out for rise (fast attack), ease-in for fade (slow decay)
    const splines: string[] = [];
    for (let k = 0; k < clean.length - 1; k++) {
      const from = clean[k][1];
      const to = clean[k + 1][1];
      if (to > from) {
        // Rising: fast attack, ease-out
        splines.push('0.1 0.8 0.3 1');
      } else if (to < from) {
        // Fading: slow smooth decay, ease-in
        splines.push('0.4 0 0.8 0.4');
      } else {
        // Hold or dim-to-dim: linear
        splines.push('0 0 1 1');
      }
    }

    return {
      keyTimes: clean.map(([t]) => t.toFixed(3)).join(';'),
      values: clean.map(([, v]) => v.toFixed(2)).join(';'),
      keySplines: splines.join('; '),
    };
  }

  const xStart = PAD - 6;
  const xEnd = W - PAD - 30;

  return (
    <svg width="240" height="100" viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ color: 'var(--fg)' }}>
      {Array.from({ length: WARPS }, (_, i) => {
        const x = PAD + i * gap;
        const { keyTimes, values, keySplines } = threadKeyframes(i);
        return (
          <line key={i} x1={x} y1="4" x2={x} y2={H - 4}
            stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity={DIM}>
            <animate attributeName="opacity"
              values={values}
              keyTimes={keyTimes}
              calcMode="spline"
              keySplines={keySplines}
              dur={`${DUR}s`}
              repeatCount="indefinite" />
          </line>
        );
      })}
      {/* Shuttle — spline ease-in-out */}
      <rect x={xStart} y={H / 2 - 0.75} width={36} height={1.5} rx={0.75} fill="var(--accent)">
        <animate attributeName="x"
          values={`${xStart};${xEnd};${xStart}`}
          keyTimes="0;0.5;1"
          calcMode="spline"
          keySplines="0.42 0 0.58 1; 0.42 0 0.58 1"
          dur={`${DUR}s`} repeatCount="indefinite" />
        <animate attributeName="opacity"
          values="0;0.55;0.55;0.55;0"
          keyTimes="0;0.06;0.45;0.94;1"
          calcMode="spline"
          keySplines="0.25 0.1 0.25 1; 0 0 1 1; 0 0 1 1; 0.75 0 0.75 0.9"
          dur={`${DUR}s`} repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

function DLRow({ word, def }: { word: string; def: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '180px 1fr',
      gap: '1.2rem',
      alignItems: 'baseline',
      padding: '0.45rem 0',
      borderBottom: '0.5px solid var(--mat-border)',
    }}>
      <dt style={{
        color: 'var(--accent)',
        fontWeight: 600,
        fontFamily: 'var(--display)',
        fontSize: '0.92rem',
      }}>
        {word}
      </dt>
      <dd style={{
        margin: 0,
        color: 'var(--fg-secondary)',
        fontSize: '0.94rem',
        lineHeight: 1.55,
      }}>
        {def}
      </dd>
    </div>
  );
}
