import { describe, expect, it } from 'vitest';
import { Bin, Cargo, DEFAULT_STACK_CONFIG, ROTATIONS, Space, rotate } from '../src/index.js';

const keys = (spaces: readonly Space[]) => spaces.map((s) => s.key).sort();

describe('rotate', () => {
  it('matches the thesis rotation table', () => {
    const d = { l: 1, h: 2, w: 3 };
    expect(ROTATIONS.map((r) => rotate(d, r))).toEqual([
      { l: 1, h: 2, w: 3 }, // lhw
      { l: 3, h: 2, w: 1 }, // whl
      { l: 3, h: 1, w: 2 }, // wlh
      { l: 2, h: 1, w: 3 }, // hlw
      { l: 2, h: 3, w: 1 }, // hwl
      { l: 1, h: 3, w: 2 }, // lwh
    ]);
  });
});

describe('Space.split', () => {
  it('leaves right, front and top spaces around a box in the corner', () => {
    const container = new Space(1000, 1000, 1000, 0, 0, 0);
    const box = new Space(200, 200, 200, 0, 0, 0);
    expect(keys(container.split(box))).toEqual(
      keys([
        new Space(1000, 1000, 800, 0, 0, 200), // right
        new Space(800, 1000, 1000, 200, 0, 0), // front
        new Space(200, 800, 200, 0, 200, 0), // top
      ]),
    );
  });

  it('leaves all six spaces around a box in the middle', () => {
    const container = new Space(30, 30, 30, 0, 0, 0);
    expect(container.split(new Space(10, 10, 10, 10, 10, 10))).toHaveLength(6);
  });

  it('skips the top space when asked', () => {
    const container = new Space(10, 10, 10, 0, 0, 0);
    expect(container.split(new Space(5, 5, 5, 0, 0, 0), true).some((s) => s.h_ > 0)).toBe(false);
  });
});

describe('Space.merge', () => {
  it('joins two level spaces side by side', () => {
    const a = new Space(100, 100, 100, 0, 0, 0);
    const b = new Space(100, 100, 100, 0, 0, 100);
    expect(a.canMerge(b, DEFAULT_STACK_CONFIG)).toBe(true);
    expect(a.merge(b, DEFAULT_STACK_CONFIG).key).toBe(new Space(100, 100, 200, 0, 0, 0).key);
  });

  it('over-stacks a higher space across a narrow gap below it', () => {
    const conf = { ...DEFAULT_STACK_CONFIG, narrowWidth: 50, overhangWidth: 50 };
    const gap = new Space(100, 200, 40, 0, 0, 0); // narrow, starts on the floor
    const shelf = new Space(100, 100, 300, 0, 100, 40); // starts 100 up, next to the gap
    expect(gap.canMerge(shelf, conf)).toBe(true);
    // The shelf grows over the 40-wide gap (within the 50 overhang limit).
    expect(gap.merge(shelf, conf).key).toBe(new Space(100, 100, 340, 0, 100, 0).key);
  });

  it("doesn't over-stack when the gap below is wider than the narrow limit", () => {
    const conf = { ...DEFAULT_STACK_CONFIG, narrowWidth: 30, overhangWidth: 50 };
    expect(new Space(100, 200, 40, 0, 0, 0).canMerge(new Space(100, 100, 300, 0, 100, 40), conf)).toBe(false);
  });
});

describe('Bin.add', () => {
  it('is immutable and recalculates the empty spaces', () => {
    const empty = new Bin({ l: 1000, h: 1000, w: 1000 });
    const bin = empty.add(new Cargo('a', { l: 200, h: 200, w: 200 }, 'lhw', { l: 0, h: 0, w: 0 }));
    expect(empty.spaces).toHaveLength(1);
    expect(empty.cargo).toHaveLength(0);
    expect(keys(bin.spaces)).toEqual(
      keys([new Space(1000, 1000, 800, 0, 0, 200), new Space(800, 1000, 1000, 200, 0, 0), new Space(200, 800, 200, 0, 200, 0)]),
    );
    expect(bin.usedVolume).toBe(200 ** 3);
  });

  it('places a stacked block of boxes as one cargo', () => {
    const cargo = new Cargo('a', { l: 100, h: 50, w: 50 }, 'whl', { l: 0, h: 0, w: 0 }, { l: 2, h: 3, w: 4 });
    expect([cargo.l, cargo.h, cargo.w]).toEqual([100, 150, 400]); // unit after whl: 50 × 50 × 100
    expect(cargo.count).toBe(24);
  });

  it('drops spaces smaller than minSpaceSide', () => {
    const bin = new Bin({ l: 1000, h: 1000, w: 1000 }, { ...DEFAULT_STACK_CONFIG, minSpaceSide: 100 });
    const next = bin.add(new Cargo('a', { l: 950, h: 1000, w: 1000 }, 'lhw', { l: 0, h: 0, w: 0 }));
    expect(next.spaces).toHaveLength(0); // the 50-long leftover is too small to keep
  });
});
