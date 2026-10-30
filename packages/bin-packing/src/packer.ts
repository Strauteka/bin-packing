import { Bin, Cargo, fits, rotate, subtract, type Dim, type Rotation, type Space } from '@strauteka/space-utilization';
import type { Random } from './random.js';

/** A box type with everything the packer needs. */
export interface PackItem {
  readonly size: Dim;
  readonly quantity: number;
  readonly rotations: readonly Rotation[];
  /** Lower numbers are packed first. */
  readonly priority: number;
  /** Only placed directly on the floor of the bin (e.g. a loaded pallet). */
  readonly floorOnly?: boolean;
  /** Nothing is ever placed on top of it (e.g. a loaded pallet). */
  readonly noStackOnTop?: boolean;
}

/** A box type and how many of it are already placed. */
export interface Tracked<T extends PackItem> {
  readonly item: T;
  readonly used: number;
}

/**
 * One packing attempt, the thesis' `PackerUnit`: repeatedly pick an empty space, then the
 * block of boxes that fills it best, until nothing fits. Priorities are handled in order;
 * once a priority has nothing left that fits, the packer moves on and doesn't come back.
 *
 * `strategy` alternates which empty space is filled first: even attempts start at the
 * bottom-rear-left, odd attempts at the top-front-right. `fitTolerance` is how close to a
 * space's side counts as a snug fit when choosing blocks (the thesis used 50 mm).
 *
 * `mode` changes how blocks are chosen (see `PackMode`); by default the packer works as in the thesis.
 */
export function packOnce<T extends PackItem>(
  bin: Bin<T>,
  items: readonly Tracked<T>[],
  strategy: number,
  random: Random,
  fitTolerance: number,
  mode: PackMode = {},
): { bin: Bin<T>; items: Tracked<T>[] } {
  const priorities = [...new Set(items.map((t) => t.item.priority))].sort((a, b) => a - b);
  let tracked = [...items];
  let current = bin;
  for (const priority of priorities) {
    for (;;) {
      const candidates = tracked.filter((t) => t.item.priority === priority && t.item.quantity > t.used);
      const cargo = findCargo(current.spaces, candidates, strategy, random, fitTolerance, mode);
      if (!cargo) break;
      current = current.add(cargo, cargo.ref.noStackOnTop === true);
      // The placed type moves to the end of the list, as in the thesis (it affects tie-breaking).
      tracked = [
        ...tracked.filter((t) => t.item !== cargo.ref),
        ...tracked.filter((t) => t.item === cargo.ref).map((t) => ({ item: t.item, used: t.used + cargo.count })),
      ];
    }
  }
  return { bin: current, items: tracked };
}

function findCargo<T extends PackItem>(
  spaces: readonly Space[],
  candidates: readonly Tracked<T>[],
  strategy: number,
  random: Random,
  fitTolerance: number,
  mode: PackMode,
): Cargo<T> | undefined {
  const space = selectSpace(spaces, candidates, strategy);
  return space && bestCargo(space, candidates, random, fitTolerance, mode);
}

/** The empty space to fill next: the lowest (or, for odd strategies, highest) one any box fits. */
function selectSpace<T extends PackItem>(
  spaces: readonly Space[],
  candidates: readonly Tracked<T>[],
  strategy: number,
): Space | undefined {
  const direction = strategy % 2 === 0 ? 1 : -1;
  const key = (s: Space) => [s.h_ * direction, s.l_ * direction, s.w_ * direction];
  if (candidates.some((t) => t.item.floorOnly)) {
    // Floor-only items can use a space only if it starts on the floor.
    const usable = (s: Space, t: Tracked<T>) => (!t.item.floorOnly || s.h_ === 0) && t.item.rotations.some((r) => fits(s, rotate(t.item.size, r)));
    return minBy(
      spaces.filter((s) => candidates.some((t) => usable(s, t))),
      key,
    );
  }
  const shapes = candidates.flatMap((t) => t.item.rotations.map((r) => rotate(t.item.size, r)));
  return minBy(
    spaces.filter((s) => shapes.some((d) => fits(s, d))),
    key,
  );
}

/**
 * The block that leaves the snuggest gaps in `space`: most sides within `fitTolerance`, then
 * smallest gaps. In layers mode only the floor (length and width) counts, since a layer is one
 * box high anyway. With `tallestFirst`, taller boxes win before anything else.
 */
function bestCargo<T extends PackItem>(
  space: Space,
  candidates: readonly Tracked<T>[],
  random: Random,
  fitTolerance: number,
  { layers = false, tallestFirst = false }: PackMode,
): Cargo<T> | undefined {
  const builders = layers ? [buildA, buildB] : [buildA, buildB, buildC];
  const blocks = candidates
    // Floor-only items only go in spaces on the floor.
    .filter((t) => !t.item.floorOnly || space.h_ === 0)
    .flatMap((t) => {
      // Items that must stay on the floor or carry nothing are never stacked in columns.
      const own = t.item.floorOnly || t.item.noStackOnTop ? [buildA, buildB] : builders;
      return t.item.rotations
        .filter((r) => fits(space, rotate(t.item.size, r)))
        .flatMap((r) => {
          const left = t.item.quantity - t.used;
          return own.map((build) => build(space, t.item, left, r, random));
        });
    });
  return minBy(blocks, (c) => {
    const left = subtract(space, c);
    const gaps = (layers ? [left.l, left.w] : [left.l, left.h, left.w]).sort((a, b) => a - b);
    const snug = [-gaps.filter((g) => g <= fitTolerance).length, ...gaps];
    return tallestFirst ? [-c.unit.h, ...snug] : snug;
  });
}

/** How one attempt chooses its blocks. */
export interface PackMode {
  /** Only one-box-high blocks, so the container fills floor by floor (default false). */
  readonly layers?: boolean;
  /**
   * Prefer the tallest box, in its tallest allowed orientation, before the snuggest fit (default
   * false). Puts tall boxes on the floor first, which can lower the load, but it also stands long
   * boxes on end when they're allowed to, so it's best tried as one variation among others.
   */
  readonly tallestFirst?: boolean;
}

type Build = <T extends PackItem>(space: Space, item: T, left: number, r: Rotation, random: Random) => Cargo<T>;

/** One layer, filling the length first. */
const buildA: Build = (space, item, left, r, random) => {
  const max = maxPerAxis(space, rotate(item.size, r));
  const l = maybeOneLess(Math.min(max.l, left), random);
  const w = maybeOneLess(Math.min(Math.floor(left / l), max.w), random);
  return new Cargo(item, item.size, r, space.position, { l, h: 1, w });
};

/** One layer, filling the width first. */
const buildB: Build = (space, item, left, r, random) => {
  const max = maxPerAxis(space, rotate(item.size, r));
  const w = maybeOneLess(Math.min(max.w, left), random);
  const l = maybeOneLess(Math.min(Math.floor(left / w), max.l), random);
  return new Cargo(item, item.size, r, space.position, { l, h: 1, w });
};

/** A column: length, then height, then width. */
const buildC: Build = (space, item, left, r, random) => {
  const max = maxPerAxis(space, rotate(item.size, r));
  const l = maybeOneLess(Math.min(max.l, left), random);
  const h = maybeOneLess(Math.min(Math.floor(left / l), max.h), random);
  const w = Math.min(Math.floor(left / (l * h)), max.w);
  return new Cargo(item, item.size, r, space.position, { l, h, w });
};

function maxPerAxis(space: Dim, box: Dim): Dim {
  return { l: Math.floor(space.l / box.l), h: Math.floor(space.h / box.h), w: Math.floor(space.w / box.w) };
}

/** The thesis' "little bit of magic": one time in three, use one box less, so attempts differ. */
function maybeOneLess(n: number, random: Random): number {
  return n > 1 && Math.floor(random() * 3) === 0 ? n - 1 : n;
}

/** First element with the smallest key (keys compared element by element). */
function minBy<E>(list: readonly E[], key: (e: E) => number[]): E | undefined {
  let best: E | undefined;
  let bestKey: number[] = [];
  for (const e of list) {
    const k = key(e);
    if (best === undefined || compare(k, bestKey) < 0) {
      best = e;
      bestKey = k;
    }
  }
  return best;
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}
