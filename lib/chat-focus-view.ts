export type ClarificationViewMode = 'synthesis' | 'source';

export function resolveClarificationViewMode(
  requested: ClarificationViewMode | null | undefined,
  hasEditorialBody: boolean,
): ClarificationViewMode {
  if (!hasEditorialBody) return 'source';
  return requested === 'source' ? 'source' : 'synthesis';
}
