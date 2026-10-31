import { describe, expect, it } from 'vitest';
import { bestPattern, boxes, pack, packLayers, type ItemInput, type PackResult, type Pattern } from '../src/index.js';

const CONTAINER = { length: 5898, height: 2393, width: 2352 };

/** Every box of a pattern inside P × Q and none overlapping; the count adds up. */
function checkPattern(pattern: Pattern, P: number, Q: number, a: number, b: number): void {
  const rects = pattern.blocks.flatMap((blk) => {
    const [da, db] = blk.turned ? [b, a] : [a, b];
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < blk.np; i++) for (let j = 0; j < blk.nq; j++) out.push([blk.p + i * da, blk.q + j * db, da, db]);
    return out;
  });
  expect(rects).toHaveLength(pattern.count);
  for (const [p, q, da, db] of rects) {
    expect(p >= 0 && q >= 0 && p + da <= P + 1e-6 && q + db <= Q + 1e-6).toBe(true);
  }
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const [p1, q1, a1, b1] = rects[i]!;
      const [p2, q2, a2, b2] = rects[j]!;
      expect(p1 < p2 + a2 - 1e-6 && p2 < p1 + a1 - 1e-6 && q1 < q2 + b2 - 1e-6 && q2 < q1 + b1 - 1e-6).toBe(false);
    }
}

/** Exact maximum for small integer cases, by trying every free cell in order (slow, tiny cases only). */
function exact(P: number, Q: number, a: number, b: number): number {
  const grid = Array.from({ length: P }, () => new Array<boolean>(Q).fill(false));
  let best = 0;
  const fits = (p: number, q: number, da: number, db: number) => {
    if (p + da > P || q + db > Q) return false;
    for (let i = p; i < p + da; i++) for (let j = q; j < q + db; j++) if (grid[i]![j]) return false;
    return true;
  };
  const set = (p: number, q: number, da: number, db: number, v: boolean) => {
    for (let i = p; i < p + da; i++) for (let j = q; j < q + db; j++) grid[i]![j] = v;
  };
  const go = (cell: number, n: number) => {
    if (n + Math.floor((P * Q - cell) / (a * b)) <= best) return;
    if (cell === P * Q) return void (best = Math.max(best, n));
    const [p, q] = [Math.floor(cell / Q), cell % Q];
    if (grid[p]![q]) return go(cell + 1, n);
    for (const [da, db] of [
      [a, b],
      [b, a],
    ] as const)
      if (fits(p, q, da, db)) {
        set(p, q, da, db, true);
        go(cell + 1, n + 1);
        set(p, q, da, db, false);
      }
    go(cell + 1, n); // leave this cell empty
  };
  go(0, 0);
  return best;
}

describe('bestPattern', () => {
  it('turns boxes where that fits more', () => {
    const pattern = bestPattern(1200, 800, 400, 300);
    expect(pattern.count).toBe(8); // 4 × 2 turned, not 3 × 2 straight
    checkPattern(pattern, 1200, 800, 400, 300);
  });

  it('finds the pinwheel that straight cuts miss', () => {
    // 3 × 2 boxes in a 5 × 5 square: four around a 1 × 1 hole.
    expect(bestPattern(5, 5, 3, 2, true, false).count).toBe(3);
    const pinwheel = bestPattern(5, 5, 3, 2);
    expect(pinwheel.count).toBe(4);
    checkPattern(pinwheel, 5, 5, 3, 2);
  });

  it('matches the exact maximum on small cases', () => {
    for (const [P, Q, a, b] of [
      [7, 5, 3, 2],
      [8, 7, 3, 2],
      [9, 7, 4, 3],
      [10, 9, 4, 3],
      [11, 8, 5, 2],
    ] as const) {
      const pattern = bestPattern(P, Q, a, b);
      checkPattern(pattern, P, Q, a, b);
      expect(pattern.count, `${P}×${Q} with ${a}×${b}`).toBe(exact(P, Q, a, b));
    }
  });

  it('keeps boxes straight when they may not turn', () => {
    const pattern = bestPattern(1200, 800, 400, 300, false);
    expect(pattern.count).toBe(6);
    expect(pattern.blocks.every((b) => !b.turned)).toBe(true);
  });

  it('is quick on a container floor with small odd boxes', () => {
    const started = Date.now();
    const pattern = bestPattern(5898, 2352, 137, 211);
    checkPattern(pattern, 5898, 2352, 137, 211);
    expect(pattern.count).toBeGreaterThanOrEqual(Math.floor((5898 * 2352) / (137 * 211)) - 12);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

/** No overlaps, all inside, quantities kept, boxes standing on something. */
function checkResult(result: PackResult, items: readonly ItemInput[], container = CONTAINER): void {
  const all = result.placements.flatMap(boxes);
  for (const b of all)
    expect(b.x >= -1e-6 && b.y >= -1e-6 && b.z >= -1e-6 && b.x + b.length <= container.length + 1e-6 && b.y + b.height <= container.height + 1e-6 && b.z + b.width <= container.width + 1e-6).toBe(true);
  const sorted = [...all].sort((a, b) => a.x - b.x);
  for (let i = 0; i < sorted.length; i++)
    for (let j = i + 1; j < sorted.length && sorted[j]!.x < sorted[i]!.x + sorted[i]!.length - 1e-6; j++) {
      const [p, q] = [sorted[i]!, sorted[j]!];
      const overlap = p.y < q.y + q.height - 1e-6 && q.y < p.y + p.height - 1e-6 && p.z < q.z + q.width - 1e-6 && q.z < p.z + p.width - 1e-6;
      expect(overlap, `${p.id} at ${p.x},${p.y},${p.z} and ${q.id} at ${q.x},${q.y},${q.z}`).toBe(false);
    }
  for (const item of items) {
    const packed = result.packed.find((c) => c.id === item.id)?.quantity ?? 0;
    const unpacked = result.unpacked.find((c) => c.id === item.id)?.quantity ?? 0;
    expect(packed + unpacked).toBe(item.quantity);
    expect(all.filter((b) => b.id === item.id)).toHaveLength(packed);
  }
  for (const b of all) {
    if (b.y < 1e-6) continue;
    const under = all.some((o) => Math.abs(o.y + o.height - b.y) < 1e-6 && o.x < b.x + b.length && b.x < o.x + o.length && o.z < b.z + b.width && b.z < o.z + o.width);
    expect(under, `${b.id} at ${b.x},${b.y},${b.z} stands on nothing`).toBe(true);
  }
}

describe('packLayers', () => {
  it('fills a container with one box type at least as well as the randomised packer', () => {
    const items: ItemInput[] = [{ id: 'carton', length: 600, height: 400, width: 500, quantity: 2000 }];
    const layers = packLayers({ container: CONTAINER, items })!;
    checkResult(layers, items);
    const random = pack({ container: CONTAINER, items, options: { attempts: 20 } });
    expect(layers.usedVolume).toBeGreaterThanOrEqual(random.usedVolume);
    expect(layers.bestAttempt).toBe(-1);
  });

  it('packs exactly the boxes there are, the last layer part-filled', () => {
    const items: ItemInput[] = [{ id: 'carton', length: 600, height: 400, width: 400, quantity: 101 }];
    const result = packLayers({ container: CONTAINER, items })!;
    checkResult(result, items);
    expect(result.packed).toEqual([{ id: 'carton', quantity: 101 }]);
  });

  it('keeps upright boxes upright', () => {
    const items: ItemInput[] = [{ id: 'tv', length: 1000, height: 700, width: 200, quantity: 300, rotations: 'upright' }];
    const result = packLayers({ container: CONTAINER, items })!;
    checkResult(result, items);
    expect(result.placements.every((p) => p.box.height === 700)).toBe(true);
  });

  it('lays a few types in their own layers, with the rest packed after them', () => {
    const items: ItemInput[] = [
      { id: 'a', length: 600, height: 400, width: 400, quantity: 120 },
      { id: 'b', length: 500, height: 300, width: 300, quantity: 150 },
      { id: 'c', length: 300, height: 200, width: 250, quantity: 37 },
    ];
    const result = packLayers({ container: CONTAINER, items, options: { attempts: 5 } })!;
    checkResult(result, items);
    expect(result.unpacked).toEqual([]);
  });

  it('leaves no-stack and floor-only boxes to the packer, standing right', () => {
    const items: ItemInput[] = [
      { id: 'carton', length: 600, height: 400, width: 400, quantity: 150 },
      { id: 'pallet', length: 1200, height: 1000, width: 800, quantity: 2, floorOnly: true, noStackOnTop: true },
    ];
    const result = packLayers({ container: CONTAINER, items, options: { attempts: 5 } })!;
    checkResult(result, items);
    for (const p of result.placements.filter((x) => x.id === 'pallet')) expect(p.y).toBe(0);
  });

  it("doesn't apply to many types or priority ranking", () => {
    const many = Array.from({ length: 7 }, (_, i): ItemInput => ({ id: `t${i}`, length: 300, height: 300, width: 300, quantity: 10 }));
    expect(packLayers({ container: CONTAINER, items: many })).toBeNull();
    expect(packLayers({ container: CONTAINER, items: many.slice(0, 1), options: { rankByPriority: true } })).toBeNull();
    // A box that fits nowhere makes no layer.
    expect(packLayers({ container: CONTAINER, items: [{ id: 'big', length: 7000, height: 100, width: 100, quantity: 1 }] })).toBeNull();
  });
});
