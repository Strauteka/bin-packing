// Layer plans: whole layers of one box type, the classic way to load identical boxes.
//
// 1. One layer: as many boxes as fit on a rectangle, each turned one of two ways (the manufacturer's
//    pallet loading problem). Guillotine cuts on raster points (sums of box sides), plus, on the
//    floor, the 4-block "pinwheel" patterns of Smith & De Cani / Bischoff & Dowsland around them.
// 2. Layers on layers: per box type, an unbounded knapsack of layer types (one per side that may
//    point along the stacking axis) on the axis length; across types, a group knapsack by volume.
// 3. Boxes that don't make whole layers, and types left out, go to `pack()` in the space left.
//
// Two plans are built and the better one kept: floor layers stacked up (as on a pallet), and walls
// across the width lined up from the back wall to the doors.
import { rotate, type Rotation } from '@strauteka/space-utilization';
import { boxes, compareResults, pack, toRotations, type ItemInput, type PackInput, type PackResult, type Placement, type Size3 } from './pack.js';

/** Layer plans are tried for up to this many box types; with more, each type rarely fills a layer. */
export const LAYER_PLAN_MAX_TYPES = 6;
/** The 4-block patterns are tried when there are at most this many raster point pairs (they cost the square). */
const FOUR_BLOCK_LIMIT = 2500;
/** Above this many raster rectangles, cuts go only at whole rows (see `bestPattern`). */
const STATE_LIMIT = 40_000;
const EPS = 1e-6;
// `performance` exists in browsers, workers and Node, but isn't in the ES lib types.
const clock = (globalThis as { performance?: { now(): number } }).performance;
const now = (): number => clock?.now() ?? Date.now();

/** A block of boxes in a 2D pattern: `np` along the first side, `nq` along the second, from (p, q). */
export interface PatternBlock {
  readonly p: number;
  readonly q: number;
  readonly np: number;
  readonly nq: number;
  /** Turned: the box's second side runs along the first side of the rectangle. */
  readonly turned: boolean;
}

export interface Pattern {
  readonly count: number;
  readonly blocks: PatternBlock[];
}

/** Sums `i·a + j·b` up to `max` (only multiples of `a` when `b` is undefined), ascending. */
function raster(max: number, a: number, b: number | undefined): number[] {
  const out = new Set<number>();
  for (let i = 0; i * a <= max + EPS; i++)
    if (b === undefined) out.add(round(i * a));
    else for (let j = 0; i * a + j * b <= max + EPS; j++) out.add(round(i * a + j * b));
  return [...out].sort((x, y) => x - y);
}
const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** Index of the largest value ≤ v in an ascending list (0 if none, the list starts with 0). */
function below(list: readonly number[], v: number): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (list[mid]! <= v + EPS) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The most boxes of base `a × b` (a along the first side) on a `P × Q` rectangle, and where they go.
 * `turn` allows the box turned (b along the first side); `fourBlock` also tries pinwheel patterns,
 * which may leave a hole in the middle (fine on a floor, not in a wall).
 */
export function bestPattern(P: number, Q: number, a: number, b: number, turn = true, fourBlock = true): Pattern {
  let X = raster(P, a, turn ? b : undefined);
  let Y = raster(Q, turn ? a : b, turn ? b : undefined);
  // Small boxes with odd sides make very many raster points; then cut only at whole rows of one
  // box side (still exact for straight rows, and fast).
  if (X.length * Y.length > STATE_LIMIT) {
    const rows = (max: number, sides: number[]) =>
      [...new Set(sides.flatMap((d) => Array.from({ length: Math.floor((max + EPS) / d) + 1 }, (_, i) => round(i * d))))].sort((x, y) => x - y);
    X = rows(P, turn ? [a, b] : [a]);
    Y = rows(Q, turn ? [a, b] : [b]);
  }
  const nx = X.length;
  const ny = Y.length;
  // Best count for each raster rectangle X[i] × Y[j], and how: 0/1 one block (straight/turned),
  // 2 a cut across the first side at X[arg], 3 a cut across the second side at Y[arg].
  const best = new Int32Array(nx * ny);
  const how = new Int8Array(nx * ny);
  const arg = new Int32Array(nx * ny);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const l = X[i]!;
      const w = Y[j]!;
      const at = i * ny + j;
      let n = Math.floor((l + EPS) / a) * Math.floor((w + EPS) / b);
      let h = 0;
      let g = 0;
      if (turn) {
        const t = Math.floor((l + EPS) / b) * Math.floor((w + EPS) / a);
        if (t > n) [n, h] = [t, 1];
      }
      // Cuts: the part after the cut is the largest raster rectangle that fits; as the cut moves
      // on, that one only gets smaller, so its index just walks down.
      for (let k = 1, r = i; k < i && X[k]! <= l / 2 + EPS; k++) {
        while (r > 0 && X[r]! > l - X[k]! + EPS) r--;
        const v = best[k * ny + j]! + best[r * ny + j]!;
        if (v > n) [n, h, g] = [v, 2, k];
      }
      for (let k = 1, r = j; k < j && Y[k]! <= w / 2 + EPS; k++) {
        while (r > 0 && Y[r]! > w - Y[k]! + EPS) r--;
        const v = best[i * ny + k]! + best[i * ny + r]!;
        if (v > n) [n, h, g] = [v, 3, k];
      }
      best[at] = n;
      how[at] = h;
      arg[at] = g;
    }

  const blocks = (i: number, j: number, p: number, q: number, out: PatternBlock[]): void => {
    const at = i * ny + j;
    const [l, w] = [X[i]!, Y[j]!];
    if (best[at] === 0) return;
    if (how[at] === 0) out.push({ p, q, np: Math.floor((l + EPS) / a), nq: Math.floor((w + EPS) / b), turned: false });
    else if (how[at] === 1) out.push({ p, q, np: Math.floor((l + EPS) / b), nq: Math.floor((w + EPS) / a), turned: true });
    else if (how[at] === 2) {
      const k = arg[at]!;
      blocks(k, j, p, q, out);
      blocks(below(X, l - X[k]!), j, p + X[k]!, q, out);
    } else {
      const k = arg[at]!;
      blocks(i, k, p, q, out);
      blocks(i, below(Y, w - Y[k]!), p, q + Y[k]!, out);
    }
  };

  const [I, J] = [nx - 1, ny - 1];
  const L = X[I]!;
  const W = Y[J]!;
  let count = best[I * ny + J]!;
  let pinwheel: [number, number, number, number] | null = null;
  // Nothing beats the area bound; the pinwheels only matter below it.
  const bound = Math.floor((L * W + EPS) / (a * b));
  if (fourBlock && count < bound && nx * ny <= FOUR_BLOCK_LIMIT) {
    // Four blocks around the corners: R1 [0,x1]×[0,y1], R2 [x1,L]×[0,y2], R3 [x2,L]×[y2,W],
    // R4 [0,x2]×[y1,W]; they don't overlap when x1 ≤ x2 and y1 ≥ y2, or the other way round.
    const restX = X.map((x) => below(X, L - x));
    const restY = Y.map((y) => below(Y, W - y));
    search: for (let i1 = 0; i1 < nx; i1++)
      for (let i2 = 0; i2 < nx; i2++)
        for (let j1 = 0; j1 < ny; j1++)
          for (let j2 = 0; j2 < ny; j2++) {
            if (!((i1 <= i2 && j1 >= j2) || (i1 >= i2 && j1 <= j2))) continue;
            const v =
              best[i1 * ny + j1]! + best[restX[i1]! * ny + j2]! + best[restX[i2]! * ny + restY[j2]!]! + best[i2 * ny + restY[j1]!]!;
            if (v <= count) continue;
            [count, pinwheel] = [v, [X[i1]!, X[i2]!, Y[j1]!, Y[j2]!]];
            if (count >= bound) break search;
          }
  }
  const out: PatternBlock[] = [];
  if (!pinwheel) blocks(I, J, 0, 0, out);
  else {
    const [x1, x2, y1, y2] = pinwheel;
    blocks(below(X, x1), below(Y, y1), 0, 0, out);
    blocks(below(X, L - x1), below(Y, y2), x1, 0, out);
    blocks(below(X, L - x2), below(Y, W - y2), x2, y2, out);
    blocks(below(X, x2), below(Y, W - y1), 0, y1, out);
  }
  return { count, blocks: out };
}

/** How layers are laid: floor layers stacked up (y), or walls across the width lined up along x. */
type Direction = 'floors' | 'walls';

/** One way to lay a box type in a layer: its thickness along the stacking axis and its pattern. */
interface LayerKind {
  thickness: number;
  pattern: Pattern;
  /** The rotation for a straight and for a turned box, and their sizes. */
  straight: { rotation: Rotation; size: Size3 };
  turned?: { rotation: Rotation; size: Size3 };
}

/** The layer kinds of an item: one per box side that may lie along the stacking axis. */
function layerKinds(item: ItemInput, container: Size3, direction: Direction): LayerKind[] {
  const sized = toRotations(item.rotations, 'item').map((rotation) => {
    const d = rotate({ l: item.length, h: item.height, w: item.width }, rotation);
    return { rotation, size: { length: d.l, height: d.h, width: d.w } };
  });
  // The pattern's first side: the container length on a floor, the height in a wall; the second: the width.
  const [axis, first] = direction === 'floors' ? (['height', 'length'] as const) : (['length', 'height'] as const);
  const [P, Q] = [container[first], container.width];
  const kinds: LayerKind[] = [];
  const seen = new Set<string>();
  for (const s of sized) {
    const t = s.size[axis];
    const [a, b] = [s.size[first], s.size.width];
    const key = `${t}:${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // The same box lying turned in the layer: the two other sides swapped.
    const other = sized.find((o) => o.size[axis] === t && o.size[first] === b && o.size.width === a && a !== b);
    const pattern = bestPattern(P, Q, a, b, !!other, direction === 'floors');
    if (t > container[axis] + EPS || pattern.count === 0) continue;
    kinds.push({ thickness: t, pattern, straight: s, ...(other && { turned: other }) });
  }
  return kinds;
}

/** Plain-object placement of a pattern block, `m` boxes at most, at `t` along the stacking axis. */
function blockPlacements(id: string, kind: LayerKind, blk: PatternBlock, t: number, m: number, direction: Direction): Placement[] {
  const { rotation, size } = blk.turned ? kind.turned! : kind.straight;
  const first = direction === 'floors' ? 'length' : 'height';
  const step = size[first];
  const full = blk.np * blk.nq;
  // A part-filled block: whole lines across the second side first (from the back, or from below), then the rest.
  const parts =
    m >= full
      ? [{ at: 0, np: blk.np, nq: blk.nq }]
      : [
          { at: 0, np: Math.floor(m / blk.nq), nq: blk.nq },
          { at: Math.floor(m / blk.nq), np: 1, nq: m % blk.nq },
        ].filter((x) => x.np > 0 && x.nq > 0);
  return parts.map(({ at, np, nq }) => {
    const p = blk.p + at * step;
    const count = direction === 'floors' ? { length: np, height: 1, width: nq } : { length: 1, height: np, width: nq };
    return {
      id,
      x: direction === 'floors' ? p : t,
      y: direction === 'floors' ? t : p,
      z: blk.q,
      length: size.length * count.length,
      height: size.height * count.height,
      width: size.width * count.width,
      rotation,
      box: size,
      count,
      quantity: np * nq,
    };
  });
}

/** Area a layer's boxes cover on the floor or face. */
const covered = (k: LayerKind) => k.pattern.count * (k.straight.size.length * k.straight.size.width * k.straight.size.height) / k.thickness;

/** One type's best layers in thickness `s` (1 mm steps): `most[s]` boxes, `last[s]` the last layer kind. */
function typeKnapsack(kinds: readonly LayerKind[], cap: number): { most: Int32Array; last: Int16Array } {
  const most = new Int32Array(cap + 1);
  const last = new Int16Array(cap + 1).fill(-1);
  for (let s = 1; s <= cap; s++) {
    most[s] = most[s - 1]!;
    last[s] = -2; // same as s - 1
    kinds.forEach((k, n) => {
      const d = Math.ceil(k.thickness - EPS);
      if (d <= s && most[s - d]! + k.pattern.count > most[s]!) {
        most[s] = most[s - d]! + k.pattern.count;
        last[s] = n;
      }
    });
  }
  return { most, last };
}

/** The layer kinds, bottom or back first, that hold `most[s]` boxes in thickness `s`. */
function layersOf(kinds: readonly LayerKind[], last: Int16Array, s: number): LayerKind[] {
  const out: LayerKind[] = [];
  while (s > 0) {
    if (last[s] === -2) s--;
    else {
      const k = kinds[last[s]!]!;
      out.push(k);
      s -= Math.ceil(k.thickness - EPS);
    }
  }
  // Layers that cover more first: on a floor they carry the ones that cover less, which then stand
  // on whole boxes (a wider layer on a narrower one would hang over its edges).
  return out.sort((x, y) => covered(y) - covered(x) || y.thickness - x.thickness);
}

/** One layer plan, or null when no type makes a single whole layer. */
function plan(input: PackInput, direction: Direction): PackResult | null {
  const { container, items } = input;
  const axis = direction === 'floors' ? 'height' : 'length';
  const cap = Math.floor(container[axis] + EPS);
  // Boxes that may not carry others or must stay on the floor are left to the packer.
  const layered = items.filter((i) => !i.noStackOnTop && !i.floorOnly);
  const types = layered
    .map((item) => {
      const kinds = layerKinds(item, container, direction);
      return { item, kinds, ...typeKnapsack(kinds, cap) };
    })
    .filter((t) => t.kinds.length > 0)
    // Higher priority first (lower, or further back); then the type covering more, to carry the rest.
    .sort((a, b) => (a.item.priority ?? 1) - (b.item.priority ?? 1) || Math.max(...b.kinds.map(covered)) - Math.max(...a.kinds.map(covered)));
  if (types.length === 0) return null;

  // Across types: the most volume in layers, each type taking a share of the axis. Only the
  // thicknesses where a type's count grows matter (and none past all its boxes).
  const volume = (i: ItemInput) => i.length * i.height * i.width;
  let F = new Float64Array(cap + 1);
  const shares: Int32Array[] = [];
  for (const t of types) {
    const steps = [0];
    for (let s = 1; s <= cap && t.most[s - 1]! < t.item.quantity; s++) if (t.most[s]! > t.most[s - 1]!) steps.push(s);
    const next = new Float64Array(cap + 1);
    const share = new Int32Array(cap + 1);
    for (let s = 0; s <= cap; s++) {
      next[s] = F[s]!;
      for (const d of steps) {
        if (d > s) break;
        const v = F[s - d]! + volume(t.item) * Math.min(t.item.quantity, t.most[d]!);
        if (v > next[s]! + EPS) [next[s], share[s]] = [v, d];
      }
    }
    F = next;
    shares.push(share);
  }
  // Each type's share, from the last type back.
  const take = new Array<number>(types.length);
  for (let n = types.length - 1, s = cap; n >= 0; n--) {
    take[n] = shares[n]![s]!;
    s -= take[n]!;
  }

  const placements: Placement[] = [];
  const left = new Map(items.map((i) => [i.id, i.quantity]));
  let at = 0;
  types.forEach((t, n) => {
    if (take[n] === 0) return;
    let boxes = Math.min(t.item.quantity, t.most[take[n]!]!);
    left.set(t.item.id, t.item.quantity - boxes);
    for (const kind of layersOf(t.kinds, t.last, take[n]!)) {
      if (boxes === 0) break;
      // Back first on a floor, bottom first in a wall: a part-filled layer stands on what's there.
      const order = [...kind.pattern.blocks].sort((x, y) => x.p - y.p || x.q - y.q);
      for (const blk of order) {
        if (boxes === 0) break;
        const put = blockPlacements(t.item.id, kind, blk, at, boxes, direction);
        boxes -= put.reduce((sum, p) => sum + p.quantity, 0);
        placements.push(...put);
      }
      at += kind.thickness;
    }
  });
  const firm = standing(placements);
  if (firm.length === 0) return null;
  for (const p of placements) left.set(p.id, left.get(p.id)! + p.quantity);
  for (const p of firm) left.set(p.id, left.get(p.id)! - p.quantity);
  placements.length = 0;
  placements.push(...firm);

  // The rest goes to the packer, in the space after the layers (on top, or towards the doors).
  // Floor-only boxes can't go on top of floor layers.
  const rest = items
    .filter((i) => left.get(i.id)! > 0 && !(i.floorOnly && direction === 'floors' && at > 0))
    .map((i) => ({ ...i, quantity: left.get(i.id)! }));
  const room: Size3 = { ...container, [axis]: container[axis] - at };
  if (rest.length > 0 && room[axis] > EPS) {
    const more = pack({
      container: room,
      items: rest,
      options: { ...input.options, attempts: Math.min(input.options?.attempts ?? 50, 40), firstAttempt: 0, attemptStep: 1 },
    });
    for (const p of more.placements) placements.push(direction === 'floors' ? { ...p, y: p.y + at } : { ...p, x: p.x + at });
  }
  // The packer takes its floor as solid; on a part-filled top layer it isn't everywhere.
  return result(standing(placements), items, container);
}

/** Share of a box's base that must stand on the boxes below it. */
const SUPPORT = 0.75;

/**
 * The placements without boxes that stand badly: where layers of different patterns meet, a box
 * may lie over a gap below. Bottom up, so a box over one taken out goes too. Blocks with every box
 * standing stay whole; the others are split into the boxes that stand.
 */
function standing(placements: readonly Placement[]): Placement[] {
  const all = placements.flatMap((p, n) => boxes(p).map((b) => ({ ...b, n })));
  all.sort((a, b) => a.y - b.y);
  const kept: typeof all = [];
  for (const b of all) {
    let area = b.y < EPS ? Infinity : 0;
    for (const o of kept) {
      if (area >= SUPPORT * b.length * b.width - EPS) break;
      if (Math.abs(o.y + o.height - b.y) >= EPS) continue;
      const l = Math.min(o.x + o.length, b.x + b.length) - Math.max(o.x, b.x);
      const w = Math.min(o.z + o.width, b.z + b.width) - Math.max(o.z, b.z);
      if (l > EPS && w > EPS) area += l * w;
    }
    if (area >= SUPPORT * b.length * b.width - EPS) kept.push(b);
  }
  const keptOf = new Map<number, typeof all>();
  for (const b of kept) keptOf.set(b.n, [...(keptOf.get(b.n) ?? []), b]);
  return placements.flatMap((p, n) => {
    const ok = keptOf.get(n) ?? [];
    if (ok.length === p.quantity) return [p];
    return ok.map(({ n: _, ...b }) => ({ ...p, ...b, count: { length: 1, height: 1, width: 1 }, quantity: 1 }));
  });
}

function result(placements: Placement[], items: readonly ItemInput[], container: Size3): PackResult {
  const packed = new Map<string, number>();
  for (const p of placements) packed.set(p.id, (packed.get(p.id) ?? 0) + p.quantity);
  const usedVolume = placements.reduce((v, p) => v + p.length * p.height * p.width, 0);
  const containerVolume = container.length * container.height * container.width;
  return {
    placements,
    packed: items.map((i) => ({ id: i.id, quantity: packed.get(i.id) ?? 0 })).filter((c) => c.quantity > 0),
    unpacked: items.map((i) => ({ id: i.id, quantity: i.quantity - (packed.get(i.id) ?? 0) })).filter((c) => c.quantity > 0),
    utilization: usedVolume / containerVolume,
    usedVolume,
    containerVolume,
    usedHeight: placements.reduce((h, p) => Math.max(h, p.y + p.height), 0),
    attempts: 1,
    elapsedMs: 0,
    // Not one of the randomised attempts: attempt numbers start at 0.
    bestAttempt: -1,
    variation: -1,
  };
}

/**
 * Packs whole layers of each box type (see the top of this file): floor layers stacked up, and
 * walls lined up from the back wall, and returns the better plan. For one or a few box types
 * (up to `LAYER_PLAN_MAX_TYPES`) with many boxes each, this is often better than `pack()`, and
 * regular. Null when it doesn't apply: more types, `rankByPriority`, or no type making a layer.
 * The result has `bestAttempt` and `variation` -1, as it isn't one of `pack()`'s attempts.
 */
export function packLayers(input: PackInput): PackResult | null {
  if (input.items.length === 0 || input.items.length > LAYER_PLAN_MAX_TYPES || input.options?.rankByPriority) return null;
  const started = now();
  const plans = (['walls', 'floors'] as const).map((d) => plan(input, d)).filter((p): p is PackResult => p !== null);
  if (plans.length === 0) return null;
  const best = plans.reduce((a, b) => (compareResults(b, a) < 0 ? b : a));
  return { ...best, elapsedMs: now() - started };
}
