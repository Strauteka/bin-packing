// Reference results recorded on 2026-10-30 with bin-packing 0.3.0, before priority groups and
// pallets were added. Same input and seed must keep giving exactly these packings and loading
// steps; if one of these fails, a change altered how existing loads are packed.
import { describe, expect, it } from 'vitest';
import { loadingSteps, pack, rotationsFor, stackingVariations, type PackInput } from '../src/index.js';

const C = { length: 5898, height: 2393, width: 2352 };
const S = { overhangLength: 100, narrowLength: 100, overhangWidth: 100, narrowWidth: 100, heightTolerance: 5, minSpaceSide: 100 };
const sample = [
  { id: 'crate', length: 600, width: 400, height: 400, quantity: 120 },
  { id: 'carton', length: 400, width: 300, height: 300, quantity: 180 },
  { id: 'washer', length: 600, width: 600, height: 850, quantity: 12, rotations: rotationsFor({ height: true }) },
  { id: 'long', length: 1200, width: 300, height: 250, quantity: 30, priority: 2 },
];

const cases: [string, PackInput, object][] = [
  [
    'base',
    { container: C, items: sample, options: { attempts: 20, seed: 1, stacking: S, fitTolerance: 50 } },
    { usedVolume: 24372000000, usedHeight: 2300, bestAttempt: 0, variation: 0, attempts: 20, placements: 14, placementsHash: 'd0e1133fde140347', steps: 23, stepsHash: 'e7eabf278b495915' },
  ],
  [
    'variations',
    { container: C, items: sample, options: { attempts: 40, seed: 7, stacking: S, fitTolerance: 50, variations: stackingVariations(S, 50) } },
    { usedVolume: 24372000000, usedHeight: 2250, bestAttempt: 5, variation: 2, attempts: 40, placements: 19, placementsHash: '0b777729e7f2c54b', steps: 23, stepsHash: '4139616e4b12c794' },
  ],
  [
    'overfull',
    {
      container: C,
      items: sample.map((i) => (i.id === 'crate' ? { ...i, quantity: 400 } : i)),
      options: { attempts: 30, seed: 3, stacking: S, fitTolerance: 50, variations: stackingVariations(S, 50) },
    },
    { usedVolume: 29340000000, usedHeight: 2350, bestAttempt: 14, variation: 7, attempts: 30, placements: 16, placementsHash: '6a4983011acc8af3', steps: 29, stepsHash: '2284c7fa000d1704' },
  ],
  [
    'layers stop',
    { container: C, items: sample, options: { attempts: 50, seed: 2, layers: true, stopWhenAllPacked: true } },
    { usedVolume: 24372000000, usedHeight: 2300, bestAttempt: 1, variation: 0, attempts: 2, placements: 23, placementsHash: '78ce3f9f87716d99', steps: 15, stepsHash: '21e36aff5d8639c3' },
  ],
];

// FNV-1a over the JSON text, as 2 × 32 bits: enough to tell any change in the packing apart.
function hash(v: unknown): string {
  const text = JSON.stringify(v);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ text.charCodeAt(i), 0x811c9dc5) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

describe('regression: existing loads pack exactly as before', () => {
  for (const [name, input, expected] of cases)
    it(name, () => {
      const r = pack(input);
      const steps = loadingSteps(r.placements);
      expect({
        usedVolume: r.usedVolume,
        usedHeight: r.usedHeight,
        bestAttempt: r.bestAttempt,
        variation: r.variation,
        attempts: r.attempts,
        placements: r.placements.length,
        placementsHash: hash(r.placements),
        steps: steps.length,
        stepsHash: hash(steps),
      }).toEqual(expected);
    });
});
