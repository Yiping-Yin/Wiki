type Turn = { q: string; a: string };

export type ClarificationPass = {
  index: number;
  question: string;
  answer: string;
  label: string;
};

const QUESTION_PREFIXES = [
  'what does this',
  'what does',
  'what is this',
  'what is',
  'why is the',
  'why is',
  'how does this',
  'how does',
  'how is this',
  'how is',
];

function compactQuestionLabel(question: string): string {
  const normalized = question
    .trim()
    .replace(/[?!.]+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  for (const prefix of QUESTION_PREFIXES) {
    if (normalized.startsWith(prefix + ' ')) {
      return normalized.slice(prefix.length + 1);
    }
  }

  return normalized;
}

function summarizeQuestion(question: string): string {
  const compact = compactQuestionLabel(question);
  const keywordMap: Array<[RegExp, string]> = [
    [/\bprobability table\b/, 'probability table'],
    [/\bdenominator\b/, 'denominator'],
    [/\bbigram counts?\b/, 'bigram counts'],
    [/\bcontext\b/, 'context'],
    [/\bintuition\b/, 'intuition'],
  ];

  for (const [pattern, label] of keywordMap) {
    if (pattern.test(compact)) return label;
  }

  const truncated = compact.replace(/^(the|a|an)\s+/, '').trim();
  return truncated.length > 28 ? `${truncated.slice(0, 28).trimEnd()}…` : truncated;
}

export function buildClarificationPasses(turns: Turn[]): ClarificationPass[] {
  return turns.slice(0, -1).map((turn, index) => ({
    index,
    question: turn.q,
    answer: turn.a,
    label: `${index + 1} · ${summarizeQuestion(turn.q)}`,
  }));
}

export function getCurrentSynthesis(turns: Turn[], streamBuf: string): string {
  if (streamBuf.trim()) return streamBuf;
  return turns[turns.length - 1]?.a ?? '';
}

export function shouldShowClarificationHistory(turnCount: number): boolean {
  return turnCount >= 3;
}
