/**
 * Sizes and rotations. Axes follow the original thesis notation:
 * `l` = length, `h` = height (vertical), `w` = width. Coordinates start at (0, 0, 0).
 */
export interface Dim {
  readonly l: number;
  readonly h: number;
  readonly w: number;
}

/**
 * The six ways a box can lie. Each name lists which original side ends up on the
 * length, height and width axis: `whl` puts the original width along the length, keeps
 * the height vertical and puts the original length along the width.
 */
export const ROTATIONS = ['lhw', 'whl', 'wlh', 'hlw', 'hwl', 'lwh'] as const;

export type Rotation = (typeof ROTATIONS)[number];

/** Rotations that keep the original height vertical ("this side up"). */
export const UPRIGHT_ROTATIONS: readonly Rotation[] = ['lhw', 'whl'];

const axis = (d: Dim, side: string): number => (side === 'l' ? d.l : side === 'h' ? d.h : d.w);

export function rotate(d: Dim, rotation: Rotation): Dim {
  return { l: axis(d, rotation[0]!), h: axis(d, rotation[1]!), w: axis(d, rotation[2]!) };
}

export function volume(d: Dim): number {
  return d.l * d.h * d.w;
}

/** Whether `inner` fits inside `outer` without rotating. */
export function fits(outer: Dim, inner: Dim): boolean {
  return outer.l >= inner.l && outer.h >= inner.h && outer.w >= inner.w;
}

export function subtract(a: Dim, b: Dim): Dim {
  return { l: a.l - b.l, h: a.h - b.h, w: a.w - b.w };
}
