import type { Dim } from './dimension.js';
import type { StackConfig } from './stack-config.js';

/**
 * An axis-aligned box at a position: an empty space in a bin, or the space a cargo takes.
 * `l_`, `h_`, `w_` are the start coordinates and `l__`, `h__`, `w__` the end coordinates.
 */
export class Space implements Dim {
  constructor(
    readonly l: number,
    readonly h: number,
    readonly w: number,
    readonly l_: number,
    readonly h_: number,
    readonly w_: number,
  ) {}

  static at(size: Dim, position: Dim): Space {
    return new Space(size.l, size.h, size.w, position.l, position.h, position.w);
  }

  get l__(): number {
    return this.l_ + this.l;
  }

  get h__(): number {
    return this.h_ + this.h;
  }

  get w__(): number {
    return this.w_ + this.w;
  }

  get position(): Dim {
    return { l: this.l_, h: this.h_, w: this.w_ };
  }

  /** Identity for de-duplication: same size at the same position. */
  get key(): string {
    return `${this.l},${this.h},${this.w}@${this.l_},${this.h_},${this.w_}`;
  }

  equals(s: Space): boolean {
    return this.key === s.key;
  }

  /** Whether this space fully contains `s`. */
  overlay(s: Space): boolean {
    return (
      this.h_ <= s.h_ && this.h__ >= s.h__ && this.w_ <= s.w_ && this.w__ >= s.w__ && this.l_ <= s.l_ && this.l__ >= s.l__
    );
  }

  /** Whether the two share volume (touching faces don't count). */
  overlap(s: Space): boolean {
    return (
      this.h_ < s.h__ && this.h__ > s.h_ && this.w_ < s.w__ && this.w__ > s.w_ && this.l_ < s.l__ && this.l__ > s.l_
    );
  }

  /** Like `overlap`, but touching faces count. */
  overlapIncluded(s: Space): boolean {
    return (
      this.h_ <= s.h__ && this.h__ >= s.h_ && this.w_ <= s.w__ && this.w__ >= s.w_ && this.l_ <= s.l__ && this.l__ >= s.l_
    );
  }

  /** Size of the intersection on each axis; zero or negative means no overlap on that axis. */
  overlapSize(s: Space): Dim {
    return {
      l: Math.min(this.l__, s.l__) - Math.max(this.l_, s.l_),
      h: Math.min(this.h__, s.h__) - Math.max(this.h_, s.h_),
      w: Math.min(this.w__, s.w__) - Math.max(this.w_, s.w_),
    };
  }

  /**
   * The empty spaces left in this space after `cargo` is placed inside it: up to one each
   * on the left, right, front, rear, top and bottom. The spaces overlap each other on
   * purpose (maximal spaces), so a later box can use any of them. With `disableTop`, no
   * space is created on top of the cargo.
   */
  split(cargo: Space, disableTop = false): Space[] {
    const out: Space[] = [];
    const top = this.h__ - cargo.h__;
    const bottom = cargo.h_ - this.h_;
    const right = this.w__ - cargo.w__;
    const left = cargo.w_ - this.w_;
    const front = this.l__ - cargo.l__;
    const rear = cargo.l_ - this.l_;
    if (left > 0) out.push(new Space(this.l, this.h, left, this.l_, this.h_, this.w_));
    if (right > 0) out.push(new Space(this.l, this.h, right, this.l_, this.h_, cargo.w__));
    if (front > 0) out.push(new Space(front, this.h, this.w, cargo.l__, this.h_, this.w_));
    if (rear > 0) out.push(new Space(rear, this.h, this.w, this.l_, this.h_, this.w_));
    if (top > 0 && !disableTop) {
      const o = this.overlapSize(cargo);
      out.push(new Space(o.l, top, o.w, Math.max(this.l_, cargo.l_), cargo.h__, Math.max(this.w_, cargo.w_)));
    }
    if (bottom > 0) out.push(new Space(this.l, bottom, this.w, this.l_, this.h_, this.w_));
    return out;
  }

  /** Whether this space and `s` should be merged into one (thesis: `needToCombineSpace`). */
  canMerge(s: Space, conf: StackConfig): boolean {
    const os = this.overlapSize(s);
    const level = Math.abs(this.h_ - s.h_) <= conf.heightTolerance;
    const lowerIsThis = this.h_ < s.h_;
    return (
      // side by side along the width; the lower one is narrow, or both are level
      (this.w__ === s.w_ && os.l > 0 && os.h > 0 && ((lowerIsThis ? this.w : s.w) <= conf.narrowWidth || level)) ||
      // one behind the other along the length
      (this.l__ === s.l_ && os.w > 0 && os.h > 0 && ((lowerIsThis ? this.l : s.l) <= conf.narrowLength || level)) ||
      // overlapping by a little along the width, on the same level
      (os.w > 0 && os.w <= conf.overhangWidth && os.l > 0 && os.h > 0 && level) ||
      // overlapping by a little along the length, on the same level
      (os.l > 0 && os.l <= conf.overhangLength && os.w > 0 && os.h > 0 && level)
    );
  }

  /** The merged space of this and `s`. Only valid when `canMerge` is true (thesis: `combineSpace`). */
  merge(s: Space, conf: StackConfig): Space {
    const os = this.overlapSize(s);
    const bottom = Math.max(this.h_, s.h_);
    const height = Math.min(this.h__, s.h__) - bottom;
    const dh = this.h_ - s.h_;
    if (os.w === 0 && os.l > 0)
      return new Space(
        os.l,
        height,
        expand(dh, this.w, s.w, conf.overhangWidth),
        Math.max(this.l_, s.l_),
        bottom,
        findPosition(dh, this.w_, s.w_, conf.overhangWidth),
      );
    if (os.l === 0 && os.w > 0)
      return new Space(
        expand(dh, this.l, s.l, conf.overhangLength),
        height,
        os.w,
        findPosition(dh, this.l_, s.l_, conf.overhangLength),
        bottom,
        Math.max(this.w_, s.w_),
      );
    if (os.w > 0 && os.w <= conf.overhangWidth && os.l > 0)
      return new Space(os.l, height, this.w + s.w - os.w, Math.max(this.l_, s.l_), bottom, Math.min(this.w_, s.w_));
    if (os.l > 0 && os.l <= conf.overhangLength && os.w > 0)
      return new Space(this.l + s.l - os.l, height, os.w, Math.min(this.l_, s.l_), bottom, Math.max(this.w_, s.w_));
    throw new Error(`Cannot merge spaces ${this.key} and ${s.key}`);
  }
}

/** Start of a merged space: the lower space may only stick out by `maxExpand`. */
function findPosition(dh: number, pos1: number, pos2: number, maxExpand: number): number {
  if (dh >= 0) return Math.min(pos1, pos2);
  return Math.max(pos1, pos2) - Math.min(Math.abs(pos1 - pos2), maxExpand);
}

/** Size of a merged space: the lower space contributes at most `maxExpand`. */
function expand(dh: number, x1: number, x2: number, maxExpand: number): number {
  if (dh === 0) return x1 + x2;
  if (dh < 0) return Math.min(x1, maxExpand) + x2;
  return Math.min(x2, maxExpand) + x1;
}
