import { describe, expect, it } from 'vitest';
import { Bin, Cargo, ROTATIONS, fits, rotate, type Dim } from '../src/index.js';

// The README's "write your own algorithm" example: each box goes into the lowest, rearmost
// empty space it fits in, in the first rotation that fits. Only the core is used.
function greedy(container: Dim, boxes: { id: string; size: Dim }[]): Bin<string> {
  let bin = new Bin<string>(container);
  for (const box of boxes) {
    const spaces = [...bin.spaces].sort((a, b) => a.h_ - b.h_ || a.l_ - b.l_ || a.w_ - b.w_);
    for (const space of spaces) {
      const rotation = ROTATIONS.find((r) => fits(space, rotate(box.size, r)));
      if (rotation) {
        bin = bin.add(new Cargo(box.id, box.size, rotation, space.position));
        break;
      }
    }
  }
  return bin;
}

describe('a custom algorithm built on the core', () => {
  const container = { l: 1000, h: 600, w: 800 };
  const boxes = Array.from({ length: 40 }, (_, i) => ({
    id: `box-${i}`,
    size: { l: 150 + (i % 4) * 50, h: 100 + (i % 3) * 50, w: 120 + (i % 5) * 40 },
  }));
  const bin = greedy(container, boxes);

  it('places boxes without overlaps, inside the container', () => {
    expect(bin.cargo.length).toBeGreaterThan(10);
    bin.cargo.forEach((a, i) => {
      expect(a.l__ <= container.l && a.h__ <= container.h && a.w__ <= container.w).toBe(true);
      for (const b of bin.cargo.slice(i + 1)) expect(a.overlap(b), `${a.ref} overlaps ${b.ref}`).toBe(false);
    });
  });

  it('keeps every empty space clear of the placed cargo', () => {
    for (const space of bin.spaces) for (const c of bin.cargo) expect(space.overlap(c)).toBe(false);
  });
});
