import { boxes, type Placement } from './pack.js';

/** One box in loading order: `step` is the index of its block in `loadingOrder`. */
export interface LoadingBox {
  readonly id: string;
  readonly step: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

const overlaps = (a0: number, a1: number, b0: number, b1: number): boolean => Math.min(a1, b1) - Math.max(a0, b0) > 0;

/** Whether block `b` stands (at least partly) on top of block `a`. */
function restsOn(b: Placement, a: Placement): boolean {
  return a.y + a.height === b.y && overlaps(a.x, a.x + a.length, b.x, b.x + b.length) && overlaps(a.z, a.z + a.width, b.z, b.z + b.width);
}

const loadingKey = (p: Placement): number[] => [p.x, p.y, p.z];

function compareKeys(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

/**
 * The blocks in an order you can actually load them: from the back of the container
 * (x = 0) towards the doors, and never before the blocks they stand on. Among the blocks
 * that can go next, the one furthest back, then lowest, then leftmost is chosen.
 */
export function loadingOrder(placements: readonly Placement[]): Placement[] {
  const below = new Map(placements.map((b) => [b, placements.filter((a) => a !== b && restsOn(b, a))]));
  const placed = new Set<Placement>();
  const order: Placement[] = [];
  while (order.length < placements.length) {
    const remaining = placements.filter((p) => !placed.has(p));
    const ready = remaining.filter((p) => below.get(p)!.every((a) => placed.has(a)));
    // A block always rests on blocks below it, so something is ready; the fallback only guards
    // against a block that somehow floats.
    const pool = ready.length > 0 ? ready : remaining;
    const next = pool.reduce((best, p) => (compareKeys(loadingKey(p), loadingKey(best)) < 0 ? p : best));
    placed.add(next);
    order.push(next);
  }
  return order;
}

/** Every box in loading order: block by block, and inside a block back to front, bottom up. */
export function loadingSequence(placements: readonly Placement[]): LoadingBox[] {
  return loadingOrder(placements).flatMap((block, step) =>
    boxes(block)
      .sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z)
      .map((b) => ({ ...b, step })),
  );
}
