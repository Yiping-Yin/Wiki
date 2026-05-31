export type PersonalPlatformSectionId = 'about' | 'unsw' | 'quantnet' | 'wqu' | 'claude';

export type PersonalPlatformModelLabel = 'Overview' | 'Path' | 'Sources' | 'Process' | 'Outputs';

export type PersonalPlatformSourceGroup = {
  title: string;
  items: string[];
};

export type PersonalPlatformSectionOutput = {
  title: string;
  text: string;
  href?: string;
};

export type PersonalPlatformSection = {
  id: PersonalPlatformSectionId;
  label: string;
  href: string;
  summary: string;
  status: string;
  nextAction: string;
  pathSteps: string[];
  sourceGroups: PersonalPlatformSourceGroup[];
  processItems: string[];
  outputs: PersonalPlatformSectionOutput[];
};

export type PersonalPlatformProgressItem = {
  title: string;
  text: string;
  status: string;
};

export type PersonalPlatformProcessItem = {
  title: string;
  text: string;
};

export type PersonalPlatformOutputItem = {
  title: string;
  text: string;
  href?: string;
};

export type PersonalPlatformStackItem = {
  title: string;
  text: string;
};

export type PersonalPlatformNarrativeLayer = {
  title: string;
  text: string;
};

export type PersonalPlatformReferenceInstance = {
  title: string;
  text: string;
};

export type PersonalPlatformHistoryItem = {
  date: '2026-04-13' | '2026-04-15' | '2026-05-02' | '2026-06-01';
  text: string;
};

export type PersonalPlatformPitchCopy = {
  oneLine: string;
  applicationSummary500: string;
  problem: string;
  solution: string;
  customer: string;
};

export const PERSONAL_PLATFORM_MODEL: PersonalPlatformModelLabel[] = [
  'Overview',
  'Path',
  'Sources',
  'Process',
  'Outputs',
];

export const PERSONAL_PLATFORM_SECTIONS: PersonalPlatformSection[] = [
  {
    id: 'about',
    label: 'About',
    href: '/about',
    summary: 'The identity shelf that explains who Yiping is, what he is building, and why the work matters.',
    status: 'Reference shelf is active as the first inspectable profile layer.',
    nextAction: 'Keep the profile tied to proof, active projects, and source-backed decisions.',
    pathSteps: ['Personal context', 'Work direction', 'Credible public identity'],
    sourceGroups: [
      { title: 'Profile context', items: ['Biography notes', 'Current goals', 'Role framing'] },
      { title: 'Proof context', items: ['Projects', 'Coursework', 'Public writing'] },
    ],
    processItems: [
      'Turn scattered self-description into an inspectable profile.',
      'Connect claims about direction to the sources and outputs behind them.',
    ],
    outputs: [
      {
        title: 'Identity overview',
        text: 'A readable profile that can point into proof instead of standing alone.',
        href: '/about',
      },
    ],
  },
  {
    id: 'unsw',
    label: 'UNSW',
    href: '/knowledge/unsw',
    summary: 'The academic shelf where course materials, notes, and study outputs become a traceable learning path.',
    status: 'Reference shelf anchors formal coursework and source-backed study progress.',
    nextAction: 'Keep weekly sources, notes, and draft outputs connected to assessment goals.',
    pathSteps: ['Course sources', 'Weekly study path', 'Assessment-ready outputs'],
    sourceGroups: [
      { title: 'Official sources', items: ['Handbook pages', 'Moodle pages', 'Course outlines'] },
      { title: 'Study sources', items: ['Lecture slides', 'Week notes', 'Problem sets'] },
    ],
    processItems: [
      'Collect official source truth before summarizing.',
      'Turn each week into a path from source material to reusable study output.',
    ],
    outputs: [
      {
        title: 'Course study shelf',
        text: 'A course-by-course portfolio of learning evidence, notes, and next actions.',
        href: '/knowledge/unsw',
      },
    ],
  },
  {
    id: 'quantnet',
    label: 'Quantnet',
    href: '/knowledge/quantnet',
    summary: 'The market-skills shelf where trading, math, and programming practice are organized into visible capability.',
    status: 'Reference shelf tracks finance and quantitative learning as inspectable practice.',
    nextAction: 'Tie practice outputs to source material and career-facing evidence.',
    pathSteps: ['Skill map', 'Practice loop', 'Career proof'],
    sourceGroups: [
      { title: 'Learning sources', items: ['Quantnet modules', 'Trading notes', 'Python practice'] },
      { title: 'Market context', items: ['Order book examples', 'Execution concepts', 'Research prompts'] },
    ],
    processItems: [
      'Translate finance concepts into repeatable exercises.',
      'Keep drafts and examples close to the source material that produced them.',
    ],
    outputs: [
      {
        title: 'Quant learning proof',
        text: 'A visible trail from study inputs to practiced analysis and market reasoning.',
        href: '/knowledge/quantnet',
      },
    ],
  },
  {
    id: 'wqu',
    label: 'WQU',
    href: '/knowledge/wqu',
    summary: 'The professional learning shelf for structured finance credentials and source-backed progress.',
    status: 'Reference shelf frames credential work as process, evidence, and output.',
    nextAction: 'Separate official requirements, learning notes, and portfolio-ready artifacts.',
    pathSteps: ['Credential plan', 'Source-backed study', 'Reusable artifacts'],
    sourceGroups: [
      { title: 'Credential sources', items: ['Program pages', 'Course requirements', 'Assessment guidance'] },
      { title: 'Work products', items: ['Draft answers', 'Model notes', 'Review checklists'] },
    ],
    processItems: [
      'Track credential work as a sequence of source-bound decisions.',
      'Convert completed work into artifacts that explain both result and method.',
    ],
    outputs: [
      {
        title: 'Credential evidence shelf',
        text: 'A structured record of progress that can be inspected beyond the certificate line.',
        href: '/knowledge/wqu',
      },
    ],
  },
  {
    id: 'claude',
    label: 'Claude',
    href: '/knowledge/claude',
    summary: 'The AI collaboration shelf where prompts, conversations, certificates, and drafts become grounded persona memory.',
    status: 'Reference shelf keeps AI work traceable to sources, decisions, and outputs.',
    nextAction: 'Keep useful AI conversations connected to the materials and drafts they shaped.',
    pathSteps: ['AI source trail', 'Conversation memory', 'Grounded persona'],
    sourceGroups: [
      { title: 'AI sources', items: ['Course pages', 'Certificate notes', 'Prompt records'] },
      { title: 'Conversation sources', items: ['Claude chats', 'Codex work logs', 'Draft revisions'] },
    ],
    processItems: [
      'Treat AI output as part of the source-bound process, not as detached polish.',
      'Use source-backed conversations to shape a personal AI that can answer with provenance.',
    ],
    outputs: [
      {
        title: 'Grounded AI persona trail',
        text: 'A shelf of AI-assisted thinking that remains inspectable and source-bound.',
        href: '/knowledge/claude',
      },
    ],
  },
];

export const PERSONAL_PLATFORM_PROGRESS: PersonalPlatformProgressItem[] = [
  {
    title: 'Five reference shelves',
    text: 'About, UNSW, Quantnet, WQU, and Claude show the first complete personal platform shape.',
    status: 'Active',
  },
  {
    title: 'Sources and Draft',
    text: 'The app primitives stay simple: Sources hold evidence, Draft turns evidence into working output.',
    status: 'Canonical',
  },
  {
    title: 'Anyone-shaped thesis',
    text: 'Yiping is the first instance, while the model is designed for any knowledge worker.',
    status: 'Maturing',
  },
];

export const PERSONAL_PLATFORM_PROCESS: PersonalPlatformProcessItem[] = [
  {
    title: 'Collect sources',
    text: 'Bring in official material, local notes, project traces, and AI conversations without losing provenance.',
  },
  {
    title: 'Shape identity',
    text: 'Turn those sources into an inspectable path that explains learning, decisions, and capability.',
  },
  {
    title: 'Publish grounded outputs',
    text: 'Produce portfolio pages, knowledge-base entries, and AI answers that can point back to evidence.',
  },
];

export const PERSONAL_PLATFORM_OUTPUTS: PersonalPlatformOutputItem[] = [
  {
    title: 'Inspectable portfolio',
    text: 'A profile and shelf system where claims about work can be checked against proof.',
    href: '/about',
  },
  {
    title: 'Trusted knowledge base',
    text: 'A source-backed personal library organized around real paths, decisions, and projects.',
    href: '/sources',
  },
  {
    title: 'Grounded personal AI',
    text: 'A conversational layer that answers from the person\'s actual sources and process.',
  },
];

export const PERSONAL_PLATFORM_PRODUCT_THESIS =
  'Loom helps anyone turn scattered sources, learning paths, projects, drafts, and AI conversations into a living knowledge identity: a portfolio people can inspect, a knowledge base people can trust, and a personal AI people can talk to.';

export const PERSONAL_PLATFORM_REFERENCE_INSTANCE: PersonalPlatformReferenceInstance = {
  title: 'Yiping is the first reference instance',
  text: 'About, UNSW, Quantnet, WQU, and Claude are the first real shelves in one user\'s Loom. They prove the product model, but they are not the product boundary.',
};

export const PERSONAL_PLATFORM_NARRATIVE_LAYERS: PersonalPlatformNarrativeLayer[] = [
  {
    title: 'Portfolio with proof',
    text: 'The public surface is not only a claim about identity; it lets people inspect the supporting evidence.',
  },
  {
    title: 'Source to identity',
    text: 'Sources, notes, decisions, and drafts are organized into a living identity that explains how the person thinks.',
  },
  {
    title: 'AI persona',
    text: 'The same source-bound structure can ground a personal AI people can talk to with trust.',
  },
];

export const PERSONAL_PLATFORM_STACK: PersonalPlatformStackItem[] = [
  {
    title: 'Personal knowledge postcard',
    text: 'A compact summary of the person, their shelves, and the proof behind their direction.',
  },
  {
    title: 'Portfolio site',
    text: 'A public surface where work, learning, and projects are presented with inspectable backing.',
  },
  {
    title: 'Knowledge base',
    text: 'A private and public source layer that keeps context, provenance, and decisions connected.',
  },
  {
    title: 'Virtual personal AI',
    text: 'A conversational expression of the same source-backed identity.',
  },
];

export const PERSONAL_PLATFORM_HISTORY: PersonalPlatformHistoryItem[] = [
  {
    date: '2026-04-13',
    text: 'Loom began as a personal thinking tool for turning scattered material into a readable working surface.',
  },
  {
    date: '2026-04-15',
    text: 'The product moved toward source-bound shelves so learning, projects, and drafts could share one structure.',
  },
  {
    date: '2026-05-02',
    text: 'The first real shelves made the portfolio-with-proof model concrete across study, work, and AI collaboration.',
  },
  {
    date: '2026-06-01',
    text: 'The mature narrative names Loom as a future path toward a platform for everyone, not only one user\'s archive.',
  },
];

export const PERSONAL_PLATFORM_PITCH_COPY: PersonalPlatformPitchCopy = {
  oneLine: 'Loom is a personal knowledge identity platform: a portfolio people can inspect, a knowledge base people can trust, and a personal AI people can talk to.',
  applicationSummary500: 'Modern personal knowledge is scattered across sources, notes, projects, drafts, and AI chats. Loom turns them into a living knowledge identity: portfolio with proof, source-backed knowledge base, and grounded personal AI. Yiping\'s Loom is the first reference instance; the product is for anyone who wants their learning, work, and thinking to be inspectable, traceable, and conversational.',
  problem: 'Existing tools split personal identity, source material, notes, AI conversations, drafts, and portfolio outputs, so people can show results but not the evidence and process behind them.',
  solution: 'Loom keeps profile context, sources, provenance, decisions, drafts, outputs, and AI conversations in one source-bound structure that can become a portfolio, knowledge base, and grounded personal AI.',
  customer: 'The first users are students, researchers, builders, creators, and knowledge workers who need a credible knowledge identity, not only a static portfolio.',
};
