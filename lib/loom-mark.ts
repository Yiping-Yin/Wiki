export type LoomMarkDensity = 'compact' | 'default';

export const LOOM_MARK = {
  width: 590,
  height: 100,
  axis: { x1: 120, x2: 460, y: 50 },
  centerLineX: 290,
  lPath: 'M 0 0 L 0 100 L 60 100',
  leftEye: { cx: 220, cy: 50, r: 40 },
  rightEye: { cx: 360, cy: 50, r: 40 },
  pupilR: 4,
  mPath: 'M 490 100 L 490 0 L 540 70 L 590 0 L 590 100',
} as const;

export const LOOM_MARK_DENSITY: Record<
  LoomMarkDensity,
  {
    guideOpacity: number;
    glyphOpacity: number;
    pupilOpacity: number;
    guideStrokeWidth: number;
    glyphStrokeWidth: number;
  }
> = {
  compact: {
    guideOpacity: 0.18,
    glyphOpacity: 0.96,
    pupilOpacity: 0.72,
    guideStrokeWidth: 4.4,
    glyphStrokeWidth: 12.3,
  },
  default: {
    guideOpacity: 0.22,
    glyphOpacity: 0.98,
    pupilOpacity: 0.78,
    guideStrokeWidth: 4.8,
    glyphStrokeWidth: 12.8,
  },
};

export function offsetPath(path: string, dx: number, dy: number) {
  let index = 0;
  return path.replace(/-?\d+(?:\.\d+)?/g, (match) => {
    const value = Number(match);
    const next = index % 2 === 0 ? value + dx : value + dy;
    index += 1;
    return Number.isInteger(next) ? String(next) : String(Number(next.toFixed(3)));
  });
}
