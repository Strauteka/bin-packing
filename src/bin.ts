import type { Dim } from './dimension.js';
import { Cargo } from './cargo.js';
import { Space } from './space.js';
import { DEFAULT_STACK_CONFIG, type StackConfig } from './stack-config.js';

// Merging always converges in practice; this only guards against a bug turning into a hang.
const MAX_MERGE_ROUNDS = 10_000;

/**
 * A container (or pallet) with the cargo placed so far and the empty spaces left.
 * Immutable: `add` returns a new bin. The bin doesn't check for collisions; place cargo
 * only inside one of `spaces`, as the packer does.
 */
export class Bin<T = unknown> implements Dim {
  readonly l: number;
  readonly h: number;
  readonly w: number;
  readonly spaces: readonly Space[];
  readonly cargo: readonly Cargo<T>[];

  constructor(
    size: Dim,
    readonly config: StackConfig = DEFAULT_STACK_CONFIG,
    spaces?: readonly Space[],
    cargo?: readonly Cargo<T>[],
  ) {
    this.l = size.l;
    this.h = size.h;
    this.w = size.w;
    this.spaces = spaces ?? [new Space(size.l, size.h, size.w, 0, 0, 0)];
    this.cargo = cargo ?? [];
  }

  /** A new bin with `cargo` placed and the empty spaces around it recalculated. */
  add(cargo: Cargo<T>, disableTop = false): Bin<T> {
    const c = this.config;
    // Only spaces near the new cargo can change; the rest are kept as they are.
    const affected = new Space(
      cargo.l + c.overhangLength * 2,
      cargo.h + c.heightTolerance,
      cargo.w + c.overhangWidth * 2,
      cargo.l_ - c.overhangLength,
      cargo.h_,
      cargo.w_ - c.overhangWidth,
    );
    const near: Space[] = [];
    const far: Space[] = [];
    for (const s of this.spaces) (affected.overlapIncluded(s) ? near : far).push(s);

    const split = distinct(near.filter((s) => s.overlap(cargo)).flatMap((s) => s.split(cargo, disableTop)));
    const untouched = near.filter((s) => !s.overlap(cargo));
    const merged = mergeAll([...split, ...untouched], c);
    const kept = dropContained(merged).filter((s) => Math.min(s.l, s.h, s.w) > c.minSpaceSide);

    return new Bin(this, c, [...far, ...kept], [...this.cargo, cargo]);
  }

  /** Total volume of the placed cargo. */
  get usedVolume(): number {
    return this.cargo.reduce((sum, c) => sum + c.l * c.h * c.w, 0);
  }

  /** Top of the highest placed cargo. */
  get usedHeight(): number {
    return this.cargo.reduce((max, c) => Math.max(max, c.h__), 0);
  }
}

function distinct(spaces: Space[]): Space[] {
  const seen = new Map<string, Space>();
  for (const s of spaces) if (!seen.has(s.key)) seen.set(s.key, s);
  return [...seen.values()];
}

/** Drops spaces fully inside another (different) space. */
function dropContained(spaces: Space[]): Space[] {
  return spaces.filter((e) => !spaces.some((x) => !e.equals(x) && x.overlay(e)));
}

function mergeAll(spaces: Space[], conf: StackConfig): Space[] {
  if (conf.disableMerge) return spaces;
  let current = spaces;
  for (let round = 0; round < MAX_MERGE_ROUNDS; round++) {
    const merged = mergeOnce(current, conf);
    if (merged.length === 0) return current;
    current = [...merged, ...current.filter((e) => !merged.some((m) => m.overlay(e)))];
  }
  throw new Error('Space merging did not converge');
}

function mergeOnce(spaces: Space[], conf: StackConfig): Space[] {
  const out: Space[] = [];
  for (const outer of spaces)
    for (const inner of spaces) if (!outer.equals(inner) && outer.canMerge(inner, conf)) out.push(outer.merge(inner, conf));
  // Only merges that add something new: not already covered by an existing space.
  return distinct(out).filter((m) => !spaces.some((x) => x.overlay(m)));
}
