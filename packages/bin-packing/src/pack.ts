import {
  Bin,
  Cargo,
  DEFAULT_STACK_CONFIG,
  ROTATIONS,
  UPRIGHT_ROTATIONS,
  type Rotation,
  type StackConfig,
} from '@strauteka/space-utilization';
import { packOnce, type PackItem } from './packer.js';
import { attemptSeed, seededRandom } from './random.js';

/** Length runs along x, height is vertical (y), width runs along z. */
export interface Size3 {
  readonly length: number;
  readonly height: number;
  readonly width: number;
}

export interface ItemInput extends Size3 {
  /** Your identifier for this box type; must be unique. */
  readonly id: string;
  readonly quantity: number;
  /**
   * Allowed orientations: `'all'` (default, all six), `'upright'` (height stays vertical), or an
   * explicit list, e.g. from `rotationsFor({ length: true, height: true })`.
   */
  readonly rotations?: 'all' | 'upright' | readonly Rotation[];
  /** Lower numbers are packed first (default 1). */
  readonly priority?: number;
  /** Only place it directly on the container floor (default false). */
  readonly floorOnly?: boolean;
  /** Never place anything on top of it (default false). */
  readonly noStackOnTop?: boolean;
  /**
   * At most this many boxes of this type directly on top of each other (default: no limit).
   * Other box types may still go in between or on top.
   */
  readonly maxStack?: number;
}

/**
 * A box (or block) already in the container, kept where it is: e.g. the first part of a load
 * that's been loaded. The packer fills around it and may stack on it. Container coordinates.
 */
export interface PreloadedBox extends Size3 {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Nothing may be placed on it. */
  readonly noStackOnTop?: boolean;
}

export interface PackOptions {
  /** How many randomised attempts to make; the best one wins (default 50). */
  readonly attempts?: number;
  /** Stop starting new attempts after this many milliseconds (default: no limit). */
  readonly timeLimitMs?: number;
  /** Same seed and input always give the same result (default 1). */
  readonly seed?: number;
  /** Gaps up to this size count as a snug fit when choosing blocks (default 0; the thesis used 50 mm). */
  readonly fitTolerance?: number;
  /** Space merging and over-stacking settings. */
  readonly stacking?: Partial<StackConfig>;
  /**
   * Build only one-box-high blocks, so the container fills floor by floor and the load stays
   * low (default false: blocks may also be columns, as in the thesis).
   */
  readonly layers?: boolean;
  /**
   * Prefer the tallest box, in its tallest allowed orientation, before the snuggest fit
   * (default false). Can lower the load, but stands long boxes on end when they may point up.
   */
  readonly tallestFirst?: boolean;
  /** Stop as soon as an attempt packs every box (default false: run all attempts). */
  readonly stopWhenAllPacked?: boolean;
  /**
   * Rank attempts by priority first (default false): an attempt that packs more volume of
   * priority 1 wins, then of priority 2, and so on; total volume and load height only break ties.
   * Without it, the most total volume wins, even if a higher priority is left partly unpacked.
   * The result then has `packedByPriority`, which `compareResults` uses too.
   */
  readonly rankByPriority?: boolean;
  /**
   * Different stacking principles to try. Attempts take turns: each variation's `stacking` and
   * `fitTolerance` replace the base ones above for its attempts. `stackingVariations()` builds a
   * sensible set. Without variations, every attempt uses the base settings.
   */
  readonly variations?: readonly Variation[];
  /**
   * Number of the first attempt (default 0) and the step between attempts (default 1). Attempt
   * `n` always packs the same way for the same input and seed, so workers can split the search:
   * with 4 workers, worker `k` uses `firstAttempt: k, attemptStep: 4`, and combining their
   * results with `betterResult` gives the same answer as one long run.
   */
  readonly firstAttempt?: number;
  readonly attemptStep?: number;
}

/** One stacking principle for `PackOptions.variations`. */
export interface Variation {
  readonly stacking?: Partial<StackConfig>;
  readonly fitTolerance?: number;
  /** Build only one-box-high blocks, filling floor by floor (see `PackOptions.layers`). */
  readonly layers?: boolean;
  /** Prefer the tallest box first (see `PackOptions.tallestFirst`). */
  readonly tallestFirst?: boolean;
}

export interface PackInput {
  readonly container: Size3;
  readonly items: readonly ItemInput[];
  readonly options?: PackOptions;
  /**
   * Boxes already in the container (see `PreloadedBox`). They are not in the result: its
   * placements, counts and volume are for the boxes packed now.
   */
  readonly preloaded?: readonly PreloadedBox[];
}

/** A block of identical boxes: `count.length × count.height × count.width` copies of `box`, starting at (x, y, z). */
export interface Placement extends Size3 {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotation: Rotation;
  /** One box, as rotated. */
  readonly box: Size3;
  readonly count: Size3;
  readonly quantity: number;
}

export interface ItemCount {
  readonly id: string;
  readonly quantity: number;
}

export interface PackResult {
  readonly placements: Placement[];
  readonly packed: ItemCount[];
  readonly unpacked: ItemCount[];
  /** Used volume divided by container volume, 0–1. */
  readonly utilization: number;
  readonly usedVolume: number;
  readonly containerVolume: number;
  /** Top of the highest placed box. */
  readonly usedHeight: number;
  readonly attempts: number;
  readonly elapsedMs: number;
  /** The attempt that produced this result, and the index of its variation (0 without variations). */
  readonly bestAttempt: number;
  readonly variation: number;
  /** With `rankByPriority`: packed volume per priority, highest priority (lowest number) first. */
  readonly packedByPriority?: number[];
}

interface Item extends PackItem {
  readonly id: string;
}

// `performance` exists in browsers, workers and Node, but isn't in the ES lib types.
const clock = (globalThis as { performance?: { now(): number } }).performance;
const now = (): number => clock?.now() ?? Date.now();

/**
 * Packs boxes into one container. Runs several randomised attempts and keeps the one with
 * the most volume packed, then the lowest load. Input and output are plain objects, so the
 * call can run in a Web Worker.
 */
export function pack(input: PackInput): PackResult {
  const { container, options = {} } = input;
  checkSize('container', container);
  const items = input.items.map(toItem);
  checkUnique(items);

  const attempts = options.attempts ?? 50;
  const firstAttempt = options.firstAttempt ?? 0;
  const attemptStep = options.attemptStep ?? 1;
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('options.attempts must be a positive integer');
  if (!Number.isInteger(firstAttempt) || firstAttempt < 0)
    throw new RangeError('options.firstAttempt must be a non-negative integer');
  if (!Number.isInteger(attemptStep) || attemptStep < 1) throw new RangeError('options.attemptStep must be a positive integer');
  const seed = options.seed ?? 1;
  const deadline = options.timeLimitMs === undefined ? Infinity : now() + options.timeLimitMs;

  // One empty bin and fit tolerance per variation (just the base settings without variations).
  const size = { l: container.length, h: container.height, w: container.width };
  const preloaded = input.preloaded ?? [];
  preloaded.forEach((b, i) => checkPreloaded(`preloaded[${i}]`, b, container));
  // Preloaded boxes go in first, bottom up, as cargo the packer can't move (and may stack on).
  const withPreloaded = (bin: Bin<Item>) =>
    [...preloaded]
      .sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z)
      .reduce(
        (b, p) =>
          b.add(
            new Cargo<Item>(
              { id: p.id, size: { l: p.length, h: p.height, w: p.width }, quantity: 0, rotations: ['lhw'], priority: 0 },
              { l: p.length, h: p.height, w: p.width },
              'lhw',
              { l: p.x, h: p.y, w: p.z },
            ),
            p.noStackOnTop === true,
          ),
        bin,
      );
  // Built when an attempt first uses the variation: placing the preloaded boxes takes time, and a
  // call often runs a single attempt (one variation) of many.
  const variations = options.variations?.length ? options.variations : [{}];
  const built = new Map<number, { empty: Bin<Item>; fitTolerance: number; mode: { layers: boolean; tallestFirst: boolean } }>();
  const variant = (index: number) => {
    let found = built.get(index);
    if (!found) {
      const v = variations[index]!;
      found = {
        empty: withPreloaded(new Bin<Item>(size, { ...DEFAULT_STACK_CONFIG, ...options.stacking, ...v.stacking })),
        fitTolerance: v.fitTolerance ?? options.fitTolerance ?? 0,
        mode: { layers: v.layers ?? options.layers ?? false, tallestFirst: v.tallestFirst ?? options.tallestFirst ?? false },
      };
      built.set(index, found);
    }
    return found;
  };
  const total = items.reduce((sum, i) => sum + i.quantity, 0);
  const packedCount = (bin: Bin<Item>) => bin.cargo.reduce((sum, c) => sum + c.count, 0);
  // Packed volume per priority level, highest priority first (only with rankByPriority).
  const levels = [...new Set(items.map((i) => i.priority))].sort((x, y) => x - y);
  const rank = options.rankByPriority
    ? (bin: Bin<Item>) => levels.map((level) => bin.cargo.reduce((sum, c) => sum + (c.ref.priority === level ? c.l * c.h * c.w : 0), 0))
    : undefined;

  const started = now();
  const start = items.map((item) => ({ item, used: 0 }));
  let best: { bin: Bin<Item>; attempt: number; variation: number } | undefined;
  let made = 0;
  while (made < attempts && (made === 0 || now() < deadline)) {
    const attempt = firstAttempt + made * attemptStep;
    // Consecutive attempt pairs share a variation, so each variation runs both fill strategies.
    const variation = Math.floor(attempt / 2) % variations.length;
    const { empty, fitTolerance, mode } = variant(variation);
    const { bin } = packOnce(empty, start, attempt, seededRandom(attemptSeed(seed, attempt)), fitTolerance, mode);
    if (!best || better(bin, best.bin, rank)) best = { bin, attempt, variation };
    made++;
    if (options.stopWhenAllPacked && packedCount(best.bin) === total) break;
  }
  return {
    ...toResult(best!.bin, items, made, now() - started, preloaded.length),
    bestAttempt: best!.attempt,
    variation: best!.variation,
    ...(rank && { packedByPriority: rank(best!.bin) }),
  };
}

/**
 * Compares two results of the same input: negative when `a` is better. More volume packed wins,
 * then the lower load. Ties keep the earlier attempt, so combining is deterministic.
 */
export function compareResults(a: PackResult, b: PackResult): number {
  if (a.packedByPriority && b.packedByPriority) {
    const byPriority = compareVolumes(a.packedByPriority, b.packedByPriority);
    if (byPriority !== 0) return byPriority;
  }
  if (a.usedVolume !== b.usedVolume) return b.usedVolume - a.usedVolume;
  if (a.usedHeight !== b.usedHeight) return a.usedHeight - b.usedHeight;
  return a.bestAttempt - b.bestAttempt;
}

/** The better of two results (see `compareResults`), with the attempt counts added up. */
export function betterResult(a: PackResult, b: PackResult): PackResult {
  const winner = compareResults(a, b) <= 0 ? a : b;
  return { ...winner, attempts: a.attempts + b.attempts, elapsedMs: Math.max(a.elapsedMs, b.elapsedMs) };
}

/**
 * A set of stacking principles around `base`, for `PackOptions.variations`: the base itself
 * first, then no over-stacking and double over-stacking, each with no, normal and double fit
 * tolerance, and merging switched off. All of these come three times, layers first: in layers
 * mode, in layers mode with tallest boxes first, and with column blocks as in the thesis. `minSpaceSide` and `heightTolerance` stay as
 * given, since they mostly affect speed. Duplicates (e.g. from a base of zeros) are left out.
 */
export function stackingVariations(base: Partial<StackConfig> = {}, fitTolerance = 0): Variation[] {
  const b = { ...DEFAULT_STACK_CONFIG, ...base };
  const scaled = (k: number): Partial<StackConfig> => ({
    ...b,
    overhangLength: b.overhangLength * k,
    overhangWidth: b.overhangWidth * k,
    narrowLength: b.narrowLength * k,
    narrowWidth: b.narrowWidth * k,
  });
  const out: Variation[] = [];
  const modes = [
    { layers: true, tallestFirst: false },
    { layers: true, tallestFirst: true },
    { layers: false, tallestFirst: false },
  ];
  for (const mode of modes) {
    for (const k of [1, 0, 2])
      for (const f of [1, 0, 2]) out.push({ stacking: scaled(k), fitTolerance: fitTolerance * f, ...mode });
    out.push({ stacking: { ...b, disableMerge: true }, fitTolerance, ...mode });
  }
  const seen = new Set<string>();
  return out.filter((v) => {
    const key = JSON.stringify(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Expands a placement into its individual boxes, e.g. for drawing. */
export function boxes(placement: Placement): Array<Size3 & { id: string; x: number; y: number; z: number }> {
  const out: Array<Size3 & { id: string; x: number; y: number; z: number }> = [];
  const { box } = placement;
  for (let i = 0; i < placement.count.length; i++)
    for (let j = 0; j < placement.count.height; j++)
      for (let k = 0; k < placement.count.width; k++)
        out.push({
          id: placement.id,
          x: placement.x + i * box.length,
          y: placement.y + j * box.height,
          z: placement.z + k * box.width,
          length: box.length,
          height: box.height,
          width: box.width,
        });
  return out;
}

function better(a: Bin<Item>, b: Bin<Item>, rank?: (bin: Bin<Item>) => number[]): boolean {
  if (rank) {
    const byPriority = compareVolumes(rank(a), rank(b));
    if (byPriority !== 0) return byPriority < 0;
  }
  if (a.usedVolume !== b.usedVolume) return a.usedVolume > b.usedVolume;
  return a.usedHeight < b.usedHeight;
}

/** Negative when `a` packs more of the first priority where they differ. */
function compareVolumes(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

function toItem(input: ItemInput, index: number): Item {
  const where = `items[${index}]`;
  if (typeof input.id !== 'string' || input.id === '') throw new TypeError(`${where}.id must be a non-empty string`);
  checkSize(where, input);
  if (!Number.isInteger(input.quantity) || input.quantity < 1)
    throw new RangeError(`${where}.quantity must be a positive integer`);
  return {
    id: input.id,
    size: { l: input.length, h: input.height, w: input.width },
    quantity: input.quantity,
    rotations: toRotations(input.rotations, where),
    priority: input.priority ?? 1,
    ...(input.floorOnly && { floorOnly: true }),
    ...(input.noStackOnTop && { noStackOnTop: true }),
    ...(input.maxStack !== undefined && { maxStack: checkMaxStack(where, input.maxStack) }),
  };
}

export function toRotations(rotations: ItemInput['rotations'], where: string): readonly Rotation[] {
  if (rotations === undefined || rotations === 'all') return ROTATIONS;
  if (rotations === 'upright') return UPRIGHT_ROTATIONS;
  if (!Array.isArray(rotations) || rotations.length === 0)
    throw new RangeError(`${where}.rotations must allow at least one orientation`);
  for (const r of rotations)
    if (!ROTATIONS.includes(r)) throw new RangeError(`${where}.rotations: unknown rotation "${String(r)}"`);
  return ROTATIONS.filter((r) => rotations.includes(r)); // canonical order, no duplicates
}

function checkMaxStack(where: string, n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`${where}.maxStack must be a positive integer`);
  return n;
}

function checkPreloaded(where: string, b: PreloadedBox, container: Size3): void {
  if (typeof b.id !== 'string') throw new TypeError(`${where}.id must be a string`);
  checkSize(where, b);
  for (const [pos, side] of [['x', 'length'], ['y', 'height'], ['z', 'width']] as const)
    if (!Number.isFinite(b[pos]) || b[pos] < -1e-6 || b[pos] + b[side] > container[side] + 1e-6)
      throw new RangeError(`${where} must be inside the container`);
}

function checkSize(where: string, s: Size3): void {
  for (const side of ['length', 'height', 'width'] as const)
    if (!Number.isFinite(s[side]) || s[side] <= 0) throw new RangeError(`${where}.${side} must be a positive number`);
}

function checkUnique(items: readonly Item[]): void {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (seen.has(id)) throw new Error(`Duplicate item id "${id}"`);
    seen.add(id);
  }
}

function toResult(
  bin: Bin<Item>,
  items: readonly Item[],
  attempts: number,
  elapsedMs: number,
  /** How many cargo blocks at the start are preloaded boxes, left out of the result. */
  preloaded = 0,
): Omit<PackResult, 'bestAttempt' | 'variation'> {
  const cargo = bin.cargo.slice(preloaded);
  const placements = cargo.map((c): Placement => ({
    id: c.ref.id,
    x: c.l_,
    y: c.h_,
    z: c.w_,
    length: c.l,
    height: c.h,
    width: c.w,
    rotation: c.rotation,
    box: { length: c.unit.l, height: c.unit.h, width: c.unit.w },
    count: { length: c.stack.l, height: c.stack.h, width: c.stack.w },
    quantity: c.count,
  }));
  const packedById = new Map<string, number>();
  for (const p of placements) packedById.set(p.id, (packedById.get(p.id) ?? 0) + p.quantity);
  const containerVolume = bin.l * bin.h * bin.w;
  const usedVolume = cargo.reduce((sum, c) => sum + c.l * c.h * c.w, 0);
  return {
    placements,
    packed: items.map((i) => ({ id: i.id, quantity: packedById.get(i.id) ?? 0 })).filter((c) => c.quantity > 0),
    unpacked: items
      .map((i) => ({ id: i.id, quantity: i.quantity - (packedById.get(i.id) ?? 0) }))
      .filter((c) => c.quantity > 0),
    utilization: usedVolume / containerVolume,
    usedVolume,
    containerVolume,
    usedHeight: cargo.reduce((max, c) => Math.max(max, c.h__), 0),
    attempts,
    elapsedMs,
  };
}
