'use client';

/**
 * DiagramsClient — five ways to draw a thought.
 *
 * A single page hosting five switchable diagram modes:
 *   · argument      — Toulmin-style claim / supports / counters / warrant
 *   · model         — entity-relationship with literate verb labels
 *   · architecture  — three horizontal layers (UI · logic · data) with flows
 *   · decision      — a vertical tree of branched outcomes
 *   · state         — a small state machine with transition labels
 *
 * Left rail (rem-sized, ~13rem) lists the modes; an active mode is marked
 * with a 2px bronze left border. Main canvas renders the current mode's
 * SVG at full width, vellum-aesthetic, with italic serif labels and a
 * single bronze edge/accent per diagram.
 *
 * Content is a showcase of the *shape* of each mode — not user data.
 * When a real panel/argument/model graph is wired later, the same five
 * render functions take a prop.
 *
 * Design reference:
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-diagrams.jsx → DiagramsSurface
 */

import { useState, type ReactNode } from 'react';

type ModeId = 'argument' | 'model' | 'architecture' | 'decision' | 'state';

type ModeDef = {
  id: ModeId;
  name: string;
  description: string;
  title: string;
  subtitle: string;
};

const MODES: ModeDef[] = [
  {
    id: 'argument',
    name: 'Argument',
    description: 'claim · support · counter',
    title: 'The shape of a claim',
    subtitle: 'what you are willing to defend, and why.',
  },
  {
    id: 'model',
    name: 'Model',
    description: 'entities · relationships',
    title: 'The shape of a system',
    subtitle: 'who talks to whom, and about what.',
  },
  {
    id: 'architecture',
    name: 'Architecture',
    description: 'layers · boundaries',
    title: 'The shape of the house',
    subtitle: 'load-bearing walls and their doors.',
  },
  {
    id: 'decision',
    name: 'Decision',
    description: 'branches · outcomes',
    title: 'The shape of a choice',
    subtitle: 'where the path forks and where it joins.',
  },
  {
    id: 'state',
    name: 'State',
    description: 'moments · transitions',
    title: 'The shape of a life',
    subtitle: 'where it is, where it could be next.',
  },
];

// Single arrow marker definition shared by every diagram. Marker is
// defined once inside the SVG `<defs>` of the render function because
// marker IDs are scoped per-document but sibling SVGs on the same page
// would collide otherwise — each render function scopes its own.
function ArrowDefs({ id = 'arrow' }: { id?: string }) {
  return (
    <defs>
      <marker
        id={id}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" />
      </marker>
      <marker
        id={`${id}-accent`}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
      </marker>
    </defs>
  );
}

// ─────────────────────────────────────────────────────────────
// 1 · ARGUMENT — claim, three supports, two counters, one warrant
// ─────────────────────────────────────────────────────────────
function ArgumentDiagram() {
  return (
    <svg viewBox="0 0 900 500" className="loom-diagrams-svg" xmlns="http://www.w3.org/2000/svg">
      <ArrowDefs id="arg-arrow" />

      {/* Claim — center, top. The anchor of the diagram. */}
      <g>
        <rect
          x="240"
          y="40"
          width="420"
          height="80"
          rx="4"
          className="loom-diagrams-node is-primary"
        />
        <text x="260" y="64" className="loom-diagrams-eyebrow">CLAIM</text>
        <text x="450" y="96" className="loom-diagrams-label" textAnchor="middle">
          A thing must be stood upon before it is believed.
        </text>
      </g>

      {/* Supports — three stacked on the left. Ochre tone, arrows UP to claim. */}
      <g>
        <rect x="40" y="200" width="240" height="48" rx="3" className="loom-diagrams-node is-support" />
        <text x="160" y="230" className="loom-diagrams-label" textAnchor="middle">
          the deck walked before trusted
        </text>
      </g>
      <g>
        <rect x="40" y="270" width="240" height="48" rx="3" className="loom-diagrams-node is-support" />
        <text x="160" y="300" className="loom-diagrams-label" textAnchor="middle">
          marriage as daily rereading
        </text>
      </g>
      <g>
        <rect x="40" y="340" width="240" height="48" rx="3" className="loom-diagrams-node is-support" />
        <text x="160" y="370" className="loom-diagrams-label" textAnchor="middle">
          what I teach must be stood upon
        </text>
      </g>

      {/* Counters — two on the right. Rose tone, dashed, skeptical. */}
      <g>
        <rect x="620" y="220" width="240" height="48" rx="3" className="loom-diagrams-node is-counter" />
        <text x="740" y="250" className="loom-diagrams-label" textAnchor="middle">
          refusal is also a form of knowing
        </text>
      </g>
      <g>
        <rect x="620" y="310" width="240" height="48" rx="3" className="loom-diagrams-node is-counter" />
        <text x="740" y="340" className="loom-diagrams-label" textAnchor="middle">
          is the coward responsible for fear?
        </text>
      </g>

      {/* Supports → claim (accent: these are the load-bearing arrows). */}
      <g fill="none">
        <path d="M 280 224 Q 380 180 410 120" className="loom-diagrams-edge is-strong" markerEnd="url(#arg-arrow-accent)" />
        <path d="M 280 294 Q 380 210 450 120" className="loom-diagrams-edge is-strong" markerEnd="url(#arg-arrow-accent)" />
        <path d="M 280 364 Q 380 240 490 120" className="loom-diagrams-edge is-strong" markerEnd="url(#arg-arrow-accent)" />
      </g>

      {/* Counter → claim (dashed, from right). */}
      <g fill="none">
        <path d="M 620 244 Q 540 180 500 120" className="loom-diagrams-edge is-dashed" markerEnd="url(#arg-arrow)" />
        <path d="M 620 334 Q 540 220 520 120" className="loom-diagrams-edge is-dashed" markerEnd="url(#arg-arrow)" />
      </g>

      {/* Warrant — below, explaining why supports justify the claim. */}
      <g>
        <rect x="240" y="420" width="420" height="56" rx="3" className="loom-diagrams-node is-warrant" />
        <text x="260" y="440" className="loom-diagrams-eyebrow">WARRANT · what makes the step work</text>
        <text x="450" y="462" className="loom-diagrams-label" textAnchor="middle">
          physical commitment precedes intellectual assent.
        </text>
      </g>
      <line x1="450" y1="400" x2="450" y2="420" className="loom-diagrams-edge is-dashed" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 2 · MODEL — four entities in a 2×2 with named verbs between
// ─────────────────────────────────────────────────────────────
function ModelDiagram() {
  // Entity box geometry, reused four times. Hoisted because hand-copying
  // the same coords inline is how typos slip past review.
  const entities: Array<{ x: number; y: number; title: string; fields: string[] }> = [
    { x: 80, y: 60, title: 'Reader', fields: ['name', 'habit of attention'] },
    { x: 560, y: 60, title: 'Source', fields: ['title', 'author', 'held since'] },
    { x: 80, y: 290, title: 'Weft', fields: ['kind', 'loom', 'evidence'] },
    { x: 560, y: 290, title: 'Panel', fields: ['question', 'state'] },
  ];

  return (
    <svg viewBox="0 0 900 500" className="loom-diagrams-svg" xmlns="http://www.w3.org/2000/svg">
      <ArrowDefs id="model-arrow" />

      {entities.map((e) => {
        const h = 36 + e.fields.length * 20;
        return (
          <g key={e.title}>
            <rect x={e.x} y={e.y} width="260" height={h} className="loom-diagrams-node" />
            <rect x={e.x} y={e.y} width="260" height="30" className="loom-diagrams-node-header" />
            <text x={e.x + 14} y={e.y + 20} className="loom-diagrams-label is-entity-title">
              {e.title}
            </text>
            {e.fields.map((f, i) => (
              <text
                key={f}
                x={e.x + 14}
                y={e.y + 48 + i * 20}
                className="loom-diagrams-field"
              >
                · {f}
              </text>
            ))}
          </g>
        );
      })}

      {/* Edges with verb labels — solid arrows, midline label on a paper chip. */}
      <g fill="none">
        <line x1="340" y1="95" x2="560" y2="95" className="loom-diagrams-edge is-strong" markerEnd="url(#model-arrow-accent)" />
        <line x1="210" y1="156" x2="210" y2="290" className="loom-diagrams-edge" markerEnd="url(#model-arrow)" />
        <line x1="690" y1="156" x2="690" y2="290" className="loom-diagrams-edge" markerEnd="url(#model-arrow)" />
        <line x1="340" y1="340" x2="560" y2="340" className="loom-diagrams-edge" markerEnd="url(#model-arrow)" />
      </g>
      {/* Verb chips. Paper backplate prevents edge crossing the label. */}
      <VerbLabel x={450} y={90} text="inscribes" accent />
      <VerbLabel x={210} y={220} text="pulls" />
      <VerbLabel x={690} y={220} text="settles" />
      <VerbLabel x={450} y={338} text="echoes" />
    </svg>
  );
}

function VerbLabel({ x, y, text, accent }: { x: number; y: number; text: string; accent?: boolean }) {
  // Rough character-width estimate — italic serif at 14px averages ~6.4px/glyph.
  const width = text.length * 7 + 16;
  return (
    <g>
      <rect x={x - width / 2} y={y - 10} width={width} height="20" className="loom-diagrams-chip" />
      <text
        x={x}
        y={y + 4}
        textAnchor="middle"
        className={`loom-diagrams-label${accent ? ' is-accent' : ''}`}
      >
        {text}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// 3 · ARCHITECTURE — three horizontal bands, boxes, flow arrows
// ─────────────────────────────────────────────────────────────
function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 900 500" className="loom-diagrams-svg" xmlns="http://www.w3.org/2000/svg">
      <ArrowDefs id="arch-arrow" />

      {/* Band backgrounds — faint paper-deep fills to suggest layers. */}
      <rect x="20" y="30" width="860" height="130" className="loom-diagrams-band" />
      <rect x="20" y="190" width="860" height="130" className="loom-diagrams-band" />
      <rect x="20" y="350" width="860" height="130" className="loom-diagrams-band" />

      <text x="40" y="50" className="loom-diagrams-eyebrow">UI · what opens on the desk</text>
      <text x="40" y="210" className="loom-diagrams-eyebrow">LOGIC · engines beneath</text>
      <text x="40" y="370" className="loom-diagrams-eyebrow">DATA · what never overwrites</text>

      {/* UI row */}
      <ArchBox x={60}  y={78} title="Book Room" sub="reading" />
      <ArchBox x={260} y={78} title="Workbench" sub="drafting" />
      <ArchBox x={460} y={78} title="Sōan" sub="thinking" accent />
      <ArchBox x={660} y={78} title="Shuttle ⌘K" sub="navigation" />

      {/* Logic row */}
      <ArchBox x={60}  y={238} title="Weft engine" sub="finds echoes" />
      <ArchBox x={260} y={238} title="Panel store" sub="what settled" />
      <ArchBox x={460} y={238} title="Diagram graph" sub="five modes" accent />
      <ArchBox x={660} y={238} title="AI bridge" sub="claude" />

      {/* Data row */}
      <ArchBox x={60}  y={398} title="Source vault" sub="PDF · EPUB · txt" />
      <ArchBox x={260} y={398} title="Annotation" sub="your hand" />
      <ArchBox x={460} y={398} title="Weft archive" sub="every echo" />
      <ArchBox x={660} y={398} title="Panel ledger" sub="immutable" />

      {/* Flows — UI↓logic↓data for each column, one accent (the center). */}
      <g fill="none">
        <line x1="135" y1="148" x2="135" y2="238" className="loom-diagrams-edge" markerEnd="url(#arch-arrow)" />
        <line x1="335" y1="148" x2="335" y2="238" className="loom-diagrams-edge" markerEnd="url(#arch-arrow)" />
        <line x1="535" y1="148" x2="535" y2="238" className="loom-diagrams-edge is-strong" markerEnd="url(#arch-arrow-accent)" />
        <line x1="735" y1="148" x2="735" y2="238" className="loom-diagrams-edge" markerEnd="url(#arch-arrow)" />

        <line x1="135" y1="308" x2="135" y2="398" className="loom-diagrams-edge" markerEnd="url(#arch-arrow)" />
        <line x1="335" y1="308" x2="335" y2="398" className="loom-diagrams-edge" markerEnd="url(#arch-arrow)" />
        <line x1="535" y1="308" x2="535" y2="398" className="loom-diagrams-edge is-strong" markerEnd="url(#arch-arrow-accent)" />
        <line x1="735" y1="308" x2="735" y2="398" className="loom-diagrams-edge" markerEnd="url(#arch-arrow)" />
      </g>
    </svg>
  );
}

function ArchBox({
  x,
  y,
  title,
  sub,
  accent,
}: {
  x: number;
  y: number;
  title: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width="150"
        height="70"
        rx="3"
        className={`loom-diagrams-node${accent ? ' is-primary' : ''}`}
      />
      <text x={x + 75} y={y + 32} className="loom-diagrams-label" textAnchor="middle">
        {title}
      </text>
      <text x={x + 75} y={y + 52} className="loom-diagrams-sub" textAnchor="middle">
        {sub}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// 4 · DECISION — a vertical tree, root → 2 branches → 2 leaves each
// ─────────────────────────────────────────────────────────────
function DecisionDiagram() {
  return (
    <svg viewBox="0 0 900 500" className="loom-diagrams-svg" xmlns="http://www.w3.org/2000/svg">
      <ArrowDefs id="dec-arrow" />

      {/* Root question — centered top, bronze. */}
      <g>
        <rect x="320" y="30" width="260" height="56" rx="4" className="loom-diagrams-node is-primary" />
        <text x="450" y="64" className="loom-diagrams-label" textAnchor="middle">
          Is it new?
        </text>
      </g>

      {/* Two branches — mid level. */}
      <g>
        <rect x="120" y="180" width="220" height="50" rx="3" className="loom-diagrams-node" />
        <text x="230" y="210" className="loom-diagrams-label" textAnchor="middle">
          Does it echo?
        </text>
      </g>
      <g>
        <rect x="560" y="180" width="220" height="50" rx="3" className="loom-diagrams-node" />
        <text x="670" y="210" className="loom-diagrams-label" textAnchor="middle">
          Does it contradict?
        </text>
      </g>

      {/* Four leaf outcomes. */}
      <Leaf x={30}  y={340} label="Anchor" hint="the first quiet instance" />
      <Leaf x={240} y={340} label="Weft" hint="a thread across sources" accent />
      <Leaf x={460} y={340} label="Panel" hint="held, named, defended" />
      <Leaf x={680} y={340} label="Fog" hint="not yet seen clearly" />

      {/* Edges — root to branches (accent), branches to leaves (normal). */}
      <g fill="none">
        <path d="M 400 86 Q 340 130 285 180" className="loom-diagrams-edge is-strong" markerEnd="url(#dec-arrow-accent)" />
        <path d="M 500 86 Q 560 130 615 180" className="loom-diagrams-edge is-strong" markerEnd="url(#dec-arrow-accent)" />

        <path d="M 190 230 Q 160 280 110 340" className="loom-diagrams-edge" markerEnd="url(#dec-arrow)" />
        <path d="M 270 230 Q 290 280 320 340" className="loom-diagrams-edge" markerEnd="url(#dec-arrow)" />
        <path d="M 630 230 Q 600 280 540 340" className="loom-diagrams-edge" markerEnd="url(#dec-arrow)" />
        <path d="M 710 230 Q 730 280 760 340" className="loom-diagrams-edge" markerEnd="url(#dec-arrow)" />
      </g>

      {/* Edge labels — yes/no gates. */}
      <EdgeLabel x={300} y={135} text="yes" />
      <EdgeLabel x={600} y={135} text="no" />
    </svg>
  );
}

function Leaf({
  x,
  y,
  label,
  hint,
  accent,
}: {
  x: number;
  y: number;
  label: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width="160"
        height="70"
        rx="3"
        className={`loom-diagrams-node${accent ? ' is-primary' : ''}`}
      />
      <text x={x + 80} y={y + 32} className="loom-diagrams-label" textAnchor="middle">
        {label}
      </text>
      <text x={x + 80} y={y + 52} className="loom-diagrams-sub" textAnchor="middle">
        {hint}
      </text>
    </g>
  );
}

function EdgeLabel({ x, y, text }: { x: number; y: number; text: string }) {
  const width = text.length * 8 + 14;
  return (
    <g>
      <rect x={x - width / 2} y={y - 10} width={width} height="18" className="loom-diagrams-chip" />
      <text x={x} y={y + 4} textAnchor="middle" className="loom-diagrams-label is-accent">
        {text}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// 5 · STATE — a panel's five honest lives, arranged as a machine
// ─────────────────────────────────────────────────────────────
function StateDiagram() {
  return (
    <svg viewBox="0 0 900 500" className="loom-diagrams-svg" xmlns="http://www.w3.org/2000/svg">
      <ArrowDefs id="state-arrow" />

      <SState x={40} y={100} title="Drafting" sub="not yet settled" />
      <SState x={40} y={320} title="Waiting" sub="response pending" />
      <SState x={370} y={210} title="Held" sub="woven into patterns" primary />
      <SState x={700} y={100} title="Retired" sub="answered; searchable" />
      <SState x={700} y={320} title="Contradicted" sub="a later weft supersedes" />

      {/* Transitions. Accent for promotion, dashed for the contradiction. */}
      <g fill="none">
        <path d="M 220 140 Q 300 140 370 230" className="loom-diagrams-edge is-strong" markerEnd="url(#state-arrow-accent)" />
        <path d="M 130 180 L 130 320" className="loom-diagrams-edge" markerEnd="url(#state-arrow)" />
        <path d="M 220 360 Q 300 320 370 270" className="loom-diagrams-edge" markerEnd="url(#state-arrow)" />
        <path d="M 550 230 Q 620 180 700 140" className="loom-diagrams-edge" markerEnd="url(#state-arrow)" />
        <path d="M 550 270 Q 620 320 700 360" className="loom-diagrams-edge is-dashed" markerEnd="url(#state-arrow)" />
      </g>

      {/* Transition labels — italic serif on paper chips at midpoint. */}
      <VerbLabel x={290} y={170} text="third echo" accent />
      <VerbLabel x={130} y={250} text="summon weft" />
      <VerbLabel x={290} y={310} text="retry from draft" />
      <VerbLabel x={620} y={160} text="two weeks idle" />
      <VerbLabel x={620} y={320} text="superseded" />
    </svg>
  );
}

function SState({
  x,
  y,
  title,
  sub,
  primary,
}: {
  x: number;
  y: number;
  title: string;
  sub: string;
  primary?: boolean;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width="180"
        height="80"
        rx="12"
        className={`loom-diagrams-node${primary ? ' is-primary' : ''}`}
      />
      <text x={x + 90} y={y + 34} className="loom-diagrams-label" textAnchor="middle">
        {title}
      </text>
      <text x={x + 90} y={y + 56} className="loom-diagrams-sub" textAnchor="middle">
        {sub}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Dispatch + page scaffold
// ─────────────────────────────────────────────────────────────
function renderMode(mode: ModeId): ReactNode {
  switch (mode) {
    case 'argument':     return <ArgumentDiagram />;
    case 'model':        return <ModelDiagram />;
    case 'architecture': return <ArchitectureDiagram />;
    case 'decision':     return <DecisionDiagram />;
    case 'state':        return <StateDiagram />;
  }
}

export default function DiagramsClient() {
  const [activeMode, setActiveMode] = useState<ModeId>('argument');
  const currentMode = MODES.find((m) => m.id === activeMode) ?? MODES[0];

  return (
    <article className="loom-diagrams">
      <aside className="loom-diagrams-rail">
        <div className="eyebrow">DIAGRAMS</div>
        <h2 className="rail-title">
          Five ways
          <br />
          to draw a thought
        </h2>
        <nav className="modes">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`mode-btn ${activeMode === m.id ? 'is-active' : ''}`}
              onClick={() => setActiveMode(m.id)}
              type="button"
            >
              <span className="mode-name">{m.name}</span>
              <span className="mode-description">{m.description}</span>
            </button>
          ))}
        </nav>
      </aside>

      <section className="loom-diagrams-canvas">
        <div className="canvas-eyebrow">{activeMode.toUpperCase()}</div>
        <h1 className="canvas-title">{currentMode.title}</h1>
        <p className="canvas-subtitle">{currentMode.subtitle}</p>
        <div className="canvas-svg-wrapper">{renderMode(activeMode)}</div>
      </section>
    </article>
  );
}
