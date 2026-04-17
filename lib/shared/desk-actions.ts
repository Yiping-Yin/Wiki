export type DeskFocusTargetActionDraft =
  | { kind: 'focus-primary'; label: string; primary: true }
  | { kind: 'focus-secondary'; label: string }
  | { kind: 'pin-toggle'; label: string }
  | { kind: 'not-now'; label: 'Not now' }
  | { kind: 'hide-today'; label: 'Hide today' }
  | { kind: 'done'; label: 'Done' };

export function buildDeskFocusTargetActions({
  primaryLabel,
  secondaryLabel,
  includeManagementActions = false,
  pinLabel = 'Pin',
}: {
  primaryLabel: string;
  secondaryLabel: string;
  includeManagementActions?: boolean;
  pinLabel?: string;
}): DeskFocusTargetActionDraft[] {
  const actions: DeskFocusTargetActionDraft[] = [
    { kind: 'focus-primary', label: primaryLabel, primary: true },
    { kind: 'focus-secondary', label: secondaryLabel },
  ];

  if (includeManagementActions) {
    actions.push(
      { kind: 'pin-toggle', label: pinLabel },
      { kind: 'not-now', label: 'Not now' },
      { kind: 'hide-today', label: 'Hide today' },
      { kind: 'done', label: 'Done' },
    );
  }

  return actions;
}
