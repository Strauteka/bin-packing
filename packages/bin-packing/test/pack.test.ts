import { describe, expect, it } from 'vitest';
import { Space, rotate } from '@strauteka/space-utilization';
import { boxes, pack, rotationsFor, type ItemInput, type PackResult } from '../src/index.js';

// The thesis demo's container (mm) and stacking settings.
const CONTAINER = { length: 5900, height: 2380, width: 2345 };
const THESIS_STACKING = {
  overhangLength: 100,
  narrowLength: 100,
  overhangWidth: 100,
  narrowWidth: 100,
  heightTolerance: 5,
  minSpaceSide: 100,
};

const MIXED: ItemInput[] = [
  { id: 'a', length: 760, height: 300, width: 450, quantity: 20 },
  { id: 'b', length: 300, height: 300, width: 300, quantity: 40 },
  { id: 'c', length: 400, height: 500, width: 1000, quantity: 8, rotations: 'upright' },
  { id: 'd', length: 567, height: 532, width: 538, quantity: 10 },
  { id: 'e', length: 339, height: 264, width: 175, quantity: 60 },
];

const asSpace = (p: { x: number; y: number; z: number; length: number; height: number; width: number }) =>
  new Space(p.length, p.height, p.width, p.x, p.y, p.z);

function expectValidPacking(result: PackResult, container: typeof CONTAINER, items: ItemInput[]) {
  const spaces = result.placements.map(asSpace);
  spaces.forEach((a, i) => {
    // inside the container
    expect(a.l_).toBeGreaterThanOrEqual(0);
    expect(a.h_).toBeGreaterThanOrEqual(0);
    expect(a.w_).toBeGreaterThanOrEqual(0);
    expect(a.l__).toBeLessThanOrEqual(container.length);
    expect(a.h__).toBeLessThanOrEqual(container.height);
    expect(a.w__).toBeLessThanOrEqual(container.width);
    // no two blocks share volume
    for (const b of spaces.slice(i + 1)) expect(a.overlap(b), `${a.key} overlaps ${b.key}`).toBe(false);
  });
  for (const item of items) {
    const packed = result.packed.find((p) => p.id === item.id)?.quantity ?? 0;
    const unpacked = result.unpacked.find((p) => p.id === item.id)?.quantity ?? 0;
    expect(packed + unpacked).toBe(item.quantity);
  }
  for (const p of result.placements) {
    const item = items.find((i) => i.id === p.id)!;
    // a rotation only swaps the sides around
    expect([p.box.length, p.box.height, p.box.width].sort()).toEqual([item.length, item.height, item.width].sort());
    if (item.rotations === 'upright') expect(p.box.height).toBe(item.height);
  }
  expect(result.utilization).toBeLessThanOrEqual(1);
  expect(result.usedVolume).toBe(result.placements.reduce((s, p) => s + p.length * p.height * p.width, 0));
}

describe('pack', () => {
  it('fills a container exactly when the boxes divide it', () => {
    const result = pack({
      container: { length: 1000, height: 1000, width: 1000 },
      items: [{ id: 'cube', length: 500, height: 500, width: 500, quantity: 8 }],
    });
    expect(result.utilization).toBe(1);
    expect(result.unpacked).toEqual([]);
  });

  it('reports a box that cannot fit in any rotation as unpacked', () => {
    const result = pack({
      container: { length: 100, height: 100, width: 100 },
      items: [{ id: 'long', length: 150, height: 10, width: 10, quantity: 3 }],
    });
    expect(result.placements).toEqual([]);
    expect(result.unpacked).toEqual([{ id: 'long', quantity: 3 }]);
  });

  it('rotates a box to make it fit', () => {
    const result = pack({
      container: { length: 100, height: 300, width: 100 },
      items: [{ id: 'post', length: 300, height: 100, width: 100, quantity: 1 }],
    });
    expect(result.placements[0]?.box).toEqual({ length: 100, height: 300, width: 100 });
  });

  it('keeps upright boxes upright, even when lying down would fit', () => {
    const result = pack({
      container: { length: 300, height: 100, width: 100 },
      items: [{ id: 'fridge', length: 100, height: 300, width: 100, quantity: 1, rotations: 'upright' }],
    });
    expect(result.unpacked).toEqual([{ id: 'fridge', quantity: 1 }]);
  });

  it('packs higher priorities first', () => {
    const container = { length: 100, height: 100, width: 100 };
    const items: ItemInput[] = [
      { id: 'big', length: 100, height: 100, width: 100, quantity: 1, priority: 2 },
      { id: 'small', length: 50, height: 50, width: 50, quantity: 1, priority: 1 },
    ];
    const result = pack({ container, items });
    expect(result.packed).toEqual([{ id: 'small', quantity: 1 }]);
    expect(result.unpacked).toEqual([{ id: 'big', quantity: 1 }]);
  });

  it('produces a valid packing for a mixed load with over-stacking', () => {
    const result = pack({
      container: CONTAINER,
      items: MIXED,
      options: { attempts: 5, stacking: THESIS_STACKING, fitTolerance: 50 },
    });
    expectValidPacking(result, CONTAINER, MIXED);
    // The whole load is ~22% of the container, so all of it fits.
    expect(result.unpacked).toEqual([]);
  });

  it('packs a dense load well', () => {
    const items: ItemInput[] = [
      { id: 'a', length: 600, height: 400, width: 400, quantity: 300 },
      { id: 'b', length: 400, height: 300, width: 300, quantity: 300 },
    ];
    const result = pack({ container: CONTAINER, items, options: { attempts: 30, stacking: THESIS_STACKING, fitTolerance: 50 } });
    expectValidPacking(result, CONTAINER, items);
    expect(result.unpacked.length).toBeGreaterThan(0); // more than fits (~45 m³ of boxes)
    expect(result.utilization).toBeGreaterThan(0.75);
  });

  it('produces a valid packing without merging', () => {
    const options = { attempts: 3, stacking: { disableMerge: true, minSpaceSide: 100 } };
    expectValidPacking(pack({ container: CONTAINER, items: MIXED, options }), CONTAINER, MIXED);
  });

  it('gives the same result for the same seed', () => {
    const input = { container: CONTAINER, items: MIXED, options: { attempts: 4, seed: 42, stacking: THESIS_STACKING } };
    const { elapsedMs: _a, ...first } = pack(input);
    const { elapsedMs: _b, ...second } = pack(input);
    expect(second).toEqual(first);
  });

  it('never does worse with more attempts on the same seed', () => {
    const input = { container: CONTAINER, items: MIXED, options: { seed: 7, stacking: THESIS_STACKING } };
    const few = pack({ ...input, options: { ...input.options, attempts: 1 } });
    const many = pack({ ...input, options: { ...input.options, attempts: 6 } });
    expect(many.usedVolume).toBeGreaterThanOrEqual(few.usedVolume);
  });

  it('stops after the time limit but always makes one attempt', () => {
    const result = pack({ container: CONTAINER, items: MIXED, options: { attempts: 1000, timeLimitMs: 0 } });
    expect(result.attempts).toBe(1);
  });

  it('rejects bad input', () => {
    const container = { length: 10, height: 10, width: 10 };
    const box = { length: 1, height: 1, width: 1, quantity: 1 };
    expect(() => pack({ container: { ...container, height: 0 }, items: [] })).toThrow(/container.height/);
    expect(() => pack({ container, items: [{ ...box, id: 'a', quantity: 1.5 }] })).toThrow(/quantity/);
    expect(() => pack({ container, items: [{ ...box, id: '' }] })).toThrow(/id/);
    expect(() => pack({ container, items: [{ ...box, id: 'a' }, { ...box, id: 'a' }] })).toThrow(/Duplicate/);
  });
});

describe('boxes', () => {
  it('expands a block into its individual boxes', () => {
    const result = pack({
      container: { length: 1000, height: 1000, width: 1000 },
      items: [{ id: 'cube', length: 500, height: 500, width: 500, quantity: 8 }],
    });
    const all = result.placements.flatMap(boxes);
    expect(all).toHaveLength(8);
    const spaces = all.map(asSpace);
    spaces.forEach((a, i) => spaces.slice(i + 1).forEach((b) => expect(a.overlap(b)).toBe(false)));
  });
});

describe('rotationsFor', () => {
  it('matches the thesis allowL / allowH / allowW rule', () => {
    expect(rotationsFor({ length: true })).toEqual(['wlh', 'hlw']);
    expect(rotationsFor({ height: true })).toEqual(['lhw', 'whl']);
    expect(rotationsFor({ width: true })).toEqual(['hwl', 'lwh']);
    expect(rotationsFor({ length: true, height: true, width: true })).toEqual(['lhw', 'whl', 'wlh', 'hlw', 'hwl', 'lwh']);
    expect(rotationsFor({})).toEqual([]);
  });

  it('every rotation keeps the chosen side vertical', () => {
    const item = { length: 300, height: 200, width: 100 };
    for (const [side, size] of [['length', 300], ['height', 200], ['width', 100]] as const)
      for (const r of rotationsFor({ [side]: true }))
        expect(rotate({ l: item.length, h: item.height, w: item.width }, r).h).toBe(size);
  });
});

describe('pack with explicit rotations', () => {
  it('only uses the allowed orientations', () => {
    const items: ItemInput[] = [
      { id: 'lying', length: 600, height: 200, width: 400, quantity: 30, rotations: rotationsFor({ length: true }) },
      { id: 'side', length: 500, height: 300, width: 250, quantity: 30, rotations: rotationsFor({ width: true, height: true }) },
    ];
    const result = pack({ container: CONTAINER, items, options: { attempts: 5 } });
    expectValidPacking(result, CONTAINER, items);
    for (const p of result.placements) {
      if (p.id === 'lying') expect(p.box.height).toBe(600);
      else expect([250, 300]).toContain(p.box.height);
    }
    expect(result.packed.length).toBe(2);
  });

  it('rejects an empty or unknown rotation list', () => {
    const container = { length: 10, height: 10, width: 10 };
    const box = { id: 'a', length: 1, height: 1, width: 1, quantity: 1 };
    expect(() => pack({ container, items: [{ ...box, rotations: [] }] })).toThrow(/at least one orientation/);
    expect(() => pack({ container, items: [{ ...box, rotations: ['xyz' as never] }] })).toThrow(/unknown rotation/);
  });
});
