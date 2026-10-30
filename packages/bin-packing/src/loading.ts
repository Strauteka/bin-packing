import { boxes, type Placement } from './pack.js';

/** One box in loading order. `wall` numbers the distinct distances from the back wall, from 0. */
export interface LoadingBox {
  readonly id: string;
  readonly wall: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

/**
 * One wall of the loading plan: the boxes that start at the same distance from the back wall,
 * in loading order, plus any boxes from later walls that have to go in first because a box of
 * this wall stands on them.
 */
export interface LoadingStep {
  /** Index of the wall (distinct `x`), from 0 at the back. */
  readonly wall: number;
  readonly x: number;
  /** All boxes of this step, in loading order, including `early` ones. */
  readonly boxes: LoadingBox[];
  /** Boxes from later walls loaded during this step, because boxes of this wall stand on them. */
  readonly early: LoadingBox[];
}

type Box = Omit<LoadingBox, 'wall'>;

const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => Math.min(a1, b1) - Math.max(a0, b0) > 0;

/** Whether box `b` stands (at least partly) on box `a`. */
const restsOn = (b: Box, a: Box): boolean =>
  a.y + a.height === b.y && overlaps(a.x, a.x + a.length, b.x, b.x + b.length) && overlaps(a.z, a.z + a.width, b.z, b.z + b.width);

// Wall by wall from the back, and inside a wall across the width first, then upwards.
const byLoadingKey = (a: Box, b: Box): number => a.x - b.x || a.y - b.y || a.z - b.z;

/**
 * Every box in the order people can load it, like building walls: start at the back wall
 * (x = 0), fill across the width and then upwards, and only then move to the next distance
 * from the back. Nobody has to climb onto boxes to reach the back.
 *
 * A box is never loaded before all the boxes it stands on. When the next box rests partly on a
 * box from a later wall (it overhangs it), that box is loaded first.
 */
export function loadingSequence(placements: readonly Placement[]): LoadingBox[] {
  const all = placements.flatMap((p) => boxes(p)).sort(byLoadingKey);
  const below = new Map(all.map((b) => [b, all.filter((a) => a !== b && restsOn(b, a))]));
  const walls = [...new Set(all.map((b) => b.x))].sort((a, b) => a - b);
  const placed = new Set<Box>();
  const order: LoadingBox[] = [];

  // Place a box, after (recursively) the boxes it stands on, in loading order.
  const place = (box: Box) => {
    if (placed.has(box)) return;
    placed.add(box);
    for (const support of below.get(box)!) place(support);
    order.push({ ...box, wall: walls.indexOf(box.x) });
  };
  for (const box of all) place(box);
  return order;
}

/** The loading sequence as one step per wall, with supports from later walls folded into the wall that needs them. */
export function loadingSteps(placements: readonly Placement[]): LoadingStep[] {
  // Runs of consecutive boxes at the same distance from the back.
  const runs: { x: number; boxes: LoadingBox[] }[] = [];
  for (const box of loadingSequence(placements)) {
    const last = runs.at(-1);
    if (last && last.x === box.x) last.boxes.push(box);
    else runs.push({ x: box.x, boxes: [box] });
  }
  // A run further from the back than some later run was pulled forward as support (supports can
  // be nested, so compare with every later run). It belongs to the next wall run that needs it.
  const laterMin: number[] = [];
  for (let i = runs.length - 1, min = Infinity; i >= 0; i--) {
    laterMin[i] = min;
    min = Math.min(min, runs[i]!.x);
  }
  const steps: { wall: number; x: number; boxes: LoadingBox[]; early: LoadingBox[] }[] = [];
  let pending: LoadingBox[] = [];
  runs.forEach((run, i) => {
    if (run.x > laterMin[i]!) {
      pending.push(...run.boxes);
      return;
    }
    const last = steps.at(-1);
    const step = last && last.x === run.x ? last : { wall: run.boxes[0]!.wall, x: run.x, boxes: [], early: [] };
    if (step !== last) steps.push(step);
    step.boxes.push(...pending, ...run.boxes);
    step.early.push(...pending);
    pending = [];
  });
  return steps;
}
