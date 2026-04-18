export type DeskFocusTargetActionDraft =
  | { kind: 'focus-primary'; label: string; primary: true }
  | { kind: 'focus-secondary'; label: string }
  | { kind: 'pin-toggle'; label: string }
  | { kind: 'not-now'; label: 'Not now' }
  | { kind: 'hide-today'; label: 'Hide today' }
  | { kind: 'done'; label: 'Done' };

export type DeskAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
};

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

export function assembleDeskFocusTargetActions({
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  includeManagementActions = false,
  pinLabel = 'Pin',
  onPinToggle,
  onNotNow,
  onHideToday,
  onDone,
}: {
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel: string;
  onSecondary: () => void;
  includeManagementActions?: boolean;
  pinLabel?: string;
  onPinToggle?: () => void;
  onNotNow?: () => void;
  onHideToday?: () => void;
  onDone?: () => void;
}): DeskAction[] {
  return buildDeskFocusTargetActions({
    primaryLabel,
    secondaryLabel,
    includeManagementActions,
    pinLabel,
  }).map((action) => {
    switch (action.kind) {
      case 'focus-primary':
        return {
          label: action.label,
          onClick: onPrimary,
          primary: true,
        };
      case 'focus-secondary':
        return {
          label: action.label,
          onClick: onSecondary,
        };
      case 'pin-toggle':
        return {
          label: action.label,
          onClick: onPinToggle,
        };
      case 'not-now':
        return {
          label: action.label,
          onClick: onNotNow,
        };
      case 'hide-today':
        return {
          label: action.label,
          onClick: onHideToday,
        };
      case 'done':
      default:
        return {
          label: action.label,
          onClick: onDone,
        };
    }
  });
}
