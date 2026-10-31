import { describe, expect, it } from 'vitest';
import { boxes, pack, packLayers, type ItemInput, type PreloadedBox } from '../src/index.js';

const CONTAINER = { length: 5898, height: 2393, width: 2352 };
type Box = { x: number; y: number; z: number; length: number; height: number; width: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.length - 1e-6 && b.x < a.x + a.length - 1e-6 && a.y < b.y + b.height - 1e-6 && b.y < a.y + a.height - 1e-6 && a.z < b.z + b.width - 1e-6 && b.z < a.z + a.width - 1e-6;

describe('preloaded boxes', () => {
  // The first part of a load: two rows of crates at the back, two high.
  const preloaded: PreloadedBox[] = [];
  for (let y = 0; y < 800; y += 400) for (let z = 0; z + 400 <= 2352; z += 400) preloaded.push({ id: 'crate', x: 0, y, z, length: 600, height: 400, width: 400 });
  const items: ItemInput[] = [{ id: 'crate', length: 600, height: 400, width: 400, quantity: 200 }];
  const result = pack({ container: CONTAINER, items, preloaded, options: { attempts: 5 } });

  it('packs around them and leaves them out of the result', () => {
    const placed = result.placements.flatMap(boxes);
    for (const b of placed) for (const p of preloaded) expect(overlap(b, p), `${b.x},${b.y},${b.z}`).toBe(false);
    expect(placed).toHaveLength(result.packed[0]!.quantity);
    expect(result.packed[0]!.quantity + (result.unpacked[0]?.quantity ?? 0)).toBe(200);
    expect(result.usedVolume).toBe(placed.length * 600 * 400 * 400);
  });

  it('may stack on them', () => {
    const placed = result.placements.flatMap(boxes);
    expect(placed.some((b) => b.x < 600 && b.y >= 800 - 1e-6)).toBe(true);
  });

  it('keeps nothing on top of a no-stack preloaded box', () => {
    const tall = [{ id: 'machine', x: 0, y: 0, z: 0, length: 1200, height: 1000, width: 1000, noStackOnTop: true }];
    const r = pack({ container: CONTAINER, items, preloaded: tall, options: { attempts: 3 } });
    for (const b of r.placements.flatMap(boxes)) expect(b.x < 1200 && b.z < 1000 && b.y >= 1000 - 1e-6).toBe(false);
  });

  it('rejects boxes outside the container, and layer plans skip preloaded loads', () => {
    expect(() => pack({ container: CONTAINER, items, preloaded: [{ id: 'x', x: 5800, y: 0, z: 0, length: 600, height: 400, width: 400 }] })).toThrow(RangeError);
    expect(packLayers({ container: CONTAINER, items, preloaded })).toBeNull();
  });
});

describe('maxStack', () => {
  /** The most boxes of `id` on top of each other anywhere. */
  function tallest(placed: ReturnType<typeof boxes>, id: string): number {
    const own = placed.filter((b) => b.id === id);
    const depth = (b: (typeof own)[number]): number => {
      const under = own.filter((o) => Math.abs(o.y + o.height - b.y) < 1e-6 && o.x < b.x + b.length && b.x < o.x + o.length && o.z < b.z + b.width && b.z < o.z + o.width);
      return 1 + Math.max(0, ...under.map(depth));
    };
    return Math.max(0, ...own.map(depth));
  }

  it('never stacks more of a type on top of each other than allowed', () => {
    const items: ItemInput[] = [{ id: 'tv', length: 1000, height: 400, width: 600, quantity: 300, rotations: 'upright', maxStack: 2 }];
    const r = pack({ container: CONTAINER, items, options: { attempts: 10 } });
    expect(tallest(r.placements.flatMap(boxes), 'tv')).toBe(2);
  });

  it('lets other types go on top', () => {
    const items: ItemInput[] = [
      // 4.8 + 9.6 m³: everything fits, but only if boxes go on the TVs.
      { id: 'tv', length: 1000, height: 400, width: 600, quantity: 20, rotations: 'upright', maxStack: 1 },
      { id: 'box', length: 500, height: 400, width: 600, quantity: 80, rotations: 'upright' },
    ];
    const r = pack({ container: CONTAINER, items, options: { attempts: 10 } });
    const placed = r.placements.flatMap(boxes);
    expect(tallest(placed, 'tv')).toBe(1);
    expect(r.unpacked).toEqual([]);
    const tvs = placed.filter((b) => b.id === 'tv');
    expect(placed.some((b) => b.id === 'box' && tvs.some((t) => Math.abs(t.y + t.height - b.y) < 1e-6 && t.x < b.x + b.length && b.x < t.x + t.length && t.z < b.z + b.width && b.z < t.z + t.width))).toBe(true);
  });

  it('rejects a limit that is not a positive whole number', () => {
    expect(() => pack({ container: CONTAINER, items: [{ id: 'a', length: 1, height: 1, width: 1, quantity: 1, maxStack: 0 }] })).toThrow(RangeError);
  });
});
