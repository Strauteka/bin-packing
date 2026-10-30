import {
  Bin,
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
  /** `'all'` (default) allows all six orientations; `'upright'` keeps the height vertical. */
  readonly rotations?: 'all' | 'upright';
  /** Lower numbers are packed first (default 1). */
  readonly priority?: number;
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
}

export interface PackInput {
  readonly container: Size3;
  readonly items: readonly ItemInput[];
  readonly options?: PackOptions;
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
  if (!Number.isInteger(attempts) || attempts < 1) throw new RangeError('options.attempts must be a positive integer');
  const seed = options.seed ?? 1;
  const fitTolerance = options.fitTolerance ?? 0;
  const config: StackConfig = { ...DEFAULT_STACK_CONFIG, ...options.stacking };
  const deadline = options.timeLimitMs === undefined ? Infinity : now() + options.timeLimitMs;

  const started = now();
  const empty = new Bin<Item>({ l: container.length, h: container.height, w: container.width }, config);
  const start = items.map((item) => ({ item, used: 0 }));
  let best: Bin<Item> | undefined;
  let made = 0;
  while (made < attempts && (made === 0 || now() < deadline)) {
    const { bin } = packOnce(empty, start, made, seededRandom(attemptSeed(seed, made)), fitTolerance);
    if (!best || better(bin, best)) best = bin;
    made++;
  }
  return toResult(best!, items, made, now() - started);
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

function better(a: Bin, b: Bin): boolean {
  if (a.usedVolume !== b.usedVolume) return a.usedVolume > b.usedVolume;
  return a.usedHeight < b.usedHeight;
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
    rotations: input.rotations === 'upright' ? UPRIGHT_ROTATIONS : ROTATIONS,
    priority: input.priority ?? 1,
  };
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

function toResult(bin: Bin<Item>, items: readonly Item[], attempts: number, elapsedMs: number): PackResult {
  const placements = bin.cargo.map((c): Placement => ({
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
  return {
    placements,
    packed: items.map((i) => ({ id: i.id, quantity: packedById.get(i.id) ?? 0 })).filter((c) => c.quantity > 0),
    unpacked: items
      .map((i) => ({ id: i.id, quantity: i.quantity - (packedById.get(i.id) ?? 0) }))
      .filter((c) => c.quantity > 0),
    utilization: bin.usedVolume / containerVolume,
    usedVolume: bin.usedVolume,
    containerVolume,
    usedHeight: bin.usedHeight,
    attempts,
    elapsedMs,
  };
}
