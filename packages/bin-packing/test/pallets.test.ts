import { describe, expect, it } from 'vitest';
import { Space } from '@strauteka/space-utilization';
import { boxes, buildPallets, expandPallets, pack, palletItem, type ItemInput, type Placement } from '../src/index.js';

const EUR = { length: 1200, width: 800, baseHeight: 150, maxHeight: 2120, count: 10 };
const CONTAINER = { length: 5898, height: 2393, width: 2352 };
const crates: ItemInput[] = [{ id: 'crate', length: 600, height: 400, width: 400, quantity: 60 }];
const asSpace = (p: { x: number; y: number; z: number; length: number; height: number; width: number }) =>
  new Space(p.length, p.height, p.width, p.x, p.y, p.z);

describe('floorOnly and noStackOnTop', () => {
  const items: ItemInput[] = [
    // Pallets load first (as the tool does), boxes after them.
    { id: 'pallet', length: 1200, height: 1000, width: 800, quantity: 4, floorOnly: true, noStackOnTop: true, priority: 1 },
    { id: 'box', length: 400, height: 400, width: 400, quantity: 500, priority: 2 }, // more than fits: tempts the packer to use the tops
  ];
  const result = pack({ container: CONTAINER, items, options: { attempts: 10 } });

  it('puts floor-only items only on the floor', () => {
    const pallets = result.placements.filter((p) => p.id === 'pallet');
    expect(pallets.length).toBeGreaterThan(0);
    for (const p of pallets) expect(p.y).toBe(0);
    for (const p of pallets) expect(p.count.height).toBe(1);
  });

  it('never puts anything on top of a noStackOnTop item', () => {
    const pallets = result.placements.filter((p) => p.id === 'pallet').map(asSpace);
    for (const b of result.placements.filter((p) => p.id === 'box').map(asSpace))
      for (const p of pallets) {
        const above = b.h_ >= p.h__;
        const overlapsFootprint = b.l_ < p.l__ && b.l__ > p.l_ && b.w_ < p.w__ && b.w__ > p.w_;
        expect(above && overlapsFootprint, `box ${b.key} stands on a pallet`).toBe(false);
      }
  });
});

describe('buildPallets', () => {
  it('fills pallets one after another within the footprint and height', () => {
    const { pallets, left } = buildPallets(EUR, crates, { attempts: 10 });
    expect(left).toEqual([]);
    expect(pallets.map((p) => p.id)).toEqual(pallets.map((_, i) => `pallet-${i + 1}`));
    expect(pallets.reduce((n, p) => n + p.packed.reduce((m, c) => m + c.quantity, 0), 0)).toBe(60);
    for (const p of pallets) {
      expect(p.height).toBeLessThanOrEqual(2120);
      for (const b of p.placements) {
        expect(b.x + b.length).toBeLessThanOrEqual(1200);
        expect(b.z + b.width).toBeLessThanOrEqual(800);
        expect(b.y + b.height).toBeLessThanOrEqual(2120 - 150);
      }
    }
  });

  it('reports what does not fit when the pallets run out', () => {
    const { pallets, left } = buildPallets({ ...EUR, count: 1 }, crates, { attempts: 5 });
    expect(pallets).toHaveLength(1);
    expect(left[0]!.id).toBe('crate');
    expect(left[0]!.quantity + pallets[0]!.packed[0]!.quantity).toBe(60);
  });

  it('rejects a pallet with no room above its base', () => {
    expect(() => buildPallets({ ...EUR, maxHeight: 150 }, crates)).toThrow(/maxHeight/);
  });
});

describe('palletItem and expandPallets', () => {
  const { pallets } = buildPallets(EUR, [...crates, { id: 'small', length: 300, height: 300, width: 200, quantity: 40 }], { attempts: 10 });
  const loose: ItemInput[] = [{ id: 'loose', length: 500, height: 500, width: 500, quantity: 20 }];
  const result = pack({ container: CONTAINER, items: [...pallets.map((p) => palletItem(p, 1)), ...loose], options: { attempts: 10 } });
  const expanded = expandPallets(result.placements, pallets);

  it('keeps every box of every loaded pallet, plus the bases', () => {
    const loaded = result.placements.filter((p) => p.id.startsWith('pallet-')).map((p) => p.id);
    const onPallets = pallets.filter((p) => loaded.includes(p.id)).reduce((n, p) => n + p.placements.reduce((m, b) => m + b.quantity, 0), 0);
    expect(expanded.filter((p) => p.id.endsWith(':base'))).toHaveLength(loaded.length);
    expect(expanded.filter((p) => p.id === 'crate' || p.id === 'small').reduce((n, p) => n + p.quantity, 0)).toBe(onPallets);
  });

  it('places pallet boxes on their base, inside the footprint, without overlaps, also when turned', () => {
    const all = expanded.flatMap((p: Placement) => boxes(p).map((b) => ({ ...b, of: p.id })));
    const spaces = all.map(asSpace);
    spaces.forEach((a, i) => {
      expect(a.l__ <= CONTAINER.length && a.h__ <= CONTAINER.height && a.w__ <= CONTAINER.width).toBe(true);
      for (const b of spaces.slice(i + 1)) expect(a.overlap(b), `${all[i]!.of} overlaps`).toBe(false);
    });
    for (const base of expanded.filter((p) => p.id.endsWith(':base'))) {
      expect(base.y).toBe(0);
      expect(base.height).toBe(150);
    }
    // At least one pallet turned a quarter round in some packing is covered by the overlap check;
    // make sure turning really swaps the load's sides.
    const turned = expandPallets([{ ...result.placements.find((p) => p.id === 'pallet-1')!, length: 800, width: 1200 }], pallets);
    const box = turned.find((p) => !p.id.endsWith(':base'))!;
    const original = pallets[0]!.placements[0]!;
    expect([box.length, box.width]).toEqual([original.width, original.length]);
  });
});
