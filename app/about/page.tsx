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
      <h1 style={{ marginBottom: '0.2rem' }}>Loom</h1>
      <p style={{ color: 'var(--fg-secondary)', marginTop: 0, fontSize: '1.05rem' }}>
        Think on the Loom. Live in your <em style={{ color: 'var(--accent)', fontStyle: 'normal' }}>Kesi</em>.
      </p>

      <Rule />

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
        <strong>Reviewing</strong> — hover any dot to see its note. Press
        <kbd>⌘/</kbd> to enter review mode — the source recedes, a centered
        glass <strong>Live Note</strong> becomes the main object of attention,
        and a companion <strong>thought map</strong> accompanies it on the right.
      </p>
      <p>
        <strong>Crystallizing</strong> — when a document&rsquo;s thought map is
        complete, crystallize it. The panel enters your{' '}
        <Link href="/kesi" style={{ color: 'var(--accent)' }}>kesi</Link>.
      </p>

      <h2>The five principles</h2>
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
          <strong>Faster and cleaner than handwriting</strong> — not a
          replacement for pen and paper; structurally better output in less
          time. This is what kesi does to painting.
        </li>
        <li>
          <strong>The thought map is the pattern</strong> — a weaver&rsquo;s
          mind holds the entire fabric before the first thread is laid. Your
          thought map is that mental pattern made visible.
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
        <DLRow word="Thought-anchor · ◆" def="One note, anchored to one passage. The atomic unit of understanding. Created when you ask AI about a passage and commit." />
        <DLRow word="Thought map"      def="The companion structure of your anchored notes for one document — the pattern in the weaver's mind, visible at the start of reading and beside the Live Note in review." />
        <DLRow word="Crystallize · ✦"  def="To finish a thought map and settle it into your kesi as a permanent panel." />
        <DLRow word="Trace"            def="The append-only event log for one document. The substrate of everything above." />
        <DLRow word="Chat · ✦"         def="Select a passage → discuss it with AI. Vertical focus. Ephemeral until committed." />
        <DLRow word="Review · ⌘/"      def="Bring the Live Note to the center and review the woven understanding of the current document, with its companion thought map on the right." />
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
      margin: '2.4rem 0 2rem',
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
    <svg width="80" height="80" viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="about-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a84ff"/><stop offset="0.55" stopColor="#5e5ce6"/><stop offset="1" stopColor="#bf5af2"/>
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#about-bg)"/>
      <g stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.86">
        {[116,156,196,236,276,316,356,396].map((x) => <line key={x} x1={x} y1={176} x2={x} y2={336}/>)}
      </g>
    </svg>
  );
}

function StaticIconSpecimen() {
  return (
    <svg width="140" height="60" viewBox="0 0 280 96" aria-hidden style={{ color: 'var(--fg)' }}>
      <defs>
        <linearGradient id="about-silk" x1="0" y1="6" x2="0" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.16"/>
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.62"/>
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.16"/>
        </linearGradient>
      </defs>
      <g strokeLinecap="butt">
        {Array.from({length:12},(_,i)=>{const x=14+i*23;return <line key={i} x1={x} y1="6" x2={x} y2="90" stroke="url(#about-silk)" strokeWidth="0.6"/>;})}
      </g>
    </svg>
  );
}


function ActiveIconSpecimen() {
  return (
    <svg width="140" height="60" viewBox="0 0 220 80" aria-hidden style={{ color: 'var(--fg)' }}>
      <g stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.35">
        <line x1="60" y1="16" x2="60" y2="64"/>
        <line x1="90" y1="16" x2="90" y2="64"/>
        <line x1="120" y1="16" x2="120" y2="64"/>
        <line x1="150" y1="16" x2="150" y2="64" opacity="0.2"/>
      </g>
      <rect x="56" y="36" width="14" height="3" rx="1.5" fill="var(--accent)">
        <animate attributeName="x" values="56;150;150;56;56" keyTimes="0;0.55;0.65;0.97;1" dur="2.4s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.05;0.62;0.7;1" dur="2.4s" repeatCount="indefinite"/>
      </rect>
    </svg>
  );
}

function HomeLoomSpecimen() {
  const WARPS = 8;
  const W = 240;
  const H = 100;
  const PAD = 24;
  const gap = (W - PAD * 2) / (WARPS - 1);
  const durs = [4.0, 5.2, 3.6, 4.8, 3.4, 5.6, 4.2, 3.8];
  const dirs = [1, -1, 1, -1, 1, -1, 1, -1];
  const delays = [0, -1.4, -0.6, -3.0, -1.9, -3.8, -0.9, -2.4];

  return (
    <svg width="240" height="100" viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ color: 'var(--fg)' }}>
      <defs>
        <linearGradient id="about-alive-base" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0"/>
          <stop offset="20%" stopColor="currentColor" stopOpacity="0.15"/>
          <stop offset="50%" stopColor="currentColor" stopOpacity="0.20"/>
          <stop offset="80%" stopColor="currentColor" stopOpacity="0.15"/>
          <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
        </linearGradient>
        {Array.from({ length: WARPS }, (_, i) => (
          <linearGradient key={i} id={`about-alive-sh-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0"/>
            <stop offset="20%" stopColor="currentColor" stopOpacity="0.08">
              <animate attributeName="offset"
                values={dirs[i] === 1 ? '0.05;0.40;0.75;0.40;0.05' : '0.75;0.40;0.05;0.40;0.75'}
                dur={`${durs[i]}s`} begin={`${delays[i]}s`} repeatCount="indefinite" />
            </stop>
            <stop offset="35%" stopColor="currentColor" stopOpacity="0.75">
              <animate attributeName="offset"
                values={dirs[i] === 1 ? '0.15;0.48;0.82;0.48;0.15' : '0.82;0.48;0.15;0.48;0.82'}
                dur={`${durs[i]}s`} begin={`${delays[i]}s`} repeatCount="indefinite" />
            </stop>
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.08">
              <animate attributeName="offset"
                values={dirs[i] === 1 ? '0.25;0.58;0.92;0.58;0.25' : '0.92;0.58;0.25;0.58;0.92'}
                dur={`${durs[i]}s`} begin={`${delays[i]}s`} repeatCount="indefinite" />
            </stop>
            <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
          </linearGradient>
        ))}
      </defs>
      <g>
        {Array.from({ length: WARPS }, (_, i) => {
          const x = PAD + i * gap;
          return <line key={`b${i}`} x1={x} y1="0" x2={x} y2={H} stroke="url(#about-alive-base)" strokeWidth="1" />;
        })}
      </g>
      <g>
        {Array.from({ length: WARPS }, (_, i) => {
          const x = PAD + i * gap;
          return <line key={`s${i}`} x1={x} y1="0" x2={x} y2={H} stroke={`url(#about-alive-sh-${i})`} strokeWidth="1" />;
        })}
      </g>
      <rect x={PAD - 6} y={H / 2 - 0.75} width={36} height={1.5} rx={0.75} fill="var(--accent)">
        <animate attributeName="x" values={`${PAD - 6};${W - PAD - 30};${PAD - 6}`} keyTimes="0;0.5;1" dur="10s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.55;0.55;0.55;0" keyTimes="0;0.08;0.45;0.92;1" dur="10s" repeatCount="indefinite" />
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
