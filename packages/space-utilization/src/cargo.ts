import { rotate, type Dim, type Rotation } from './dimension.js';
import { Space } from './space.js';

/**
 * A block of identical boxes placed in a bin: `stack.l × stack.h × stack.w` copies of one
 * box, all in the same rotation. `ref` is whatever you use to identify the box type.
 */
export class Cargo<T = unknown> extends Space {
  /** The box size after rotation. */
  readonly unit: Dim;

  constructor(
    readonly ref: T,
    size: Dim,
    readonly rotation: Rotation,
    position: Dim,
    readonly stack: Dim = { l: 1, h: 1, w: 1 },
  ) {
    const unit = rotate(size, rotation);
    super(unit.l * stack.l, unit.h * stack.h, unit.w * stack.w, position.l, position.h, position.w);
    this.unit = unit;
  }

  /** Number of boxes in this block. */
  get count(): number {
    return this.stack.l * this.stack.h * this.stack.w;
  }
}
