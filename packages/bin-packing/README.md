# @strauteka/bin-packing

[![npm](https://img.shields.io/npm/v/@strauteka/bin-packing)](https://www.npmjs.com/package/@strauteka/bin-packing) [![ci](https://github.com/Strauteka/bin-packing/actions/workflows/ci.yml/badge.svg)](https://github.com/Strauteka/bin-packing/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@strauteka/bin-packing)](LICENSE)

A ready-made 3D bin packing algorithm for container loading, in TypeScript. Give it a container and a list of box types, and it tells you where each box goes. It runs in the browser, in a Web Worker or in Node.

It's built on [@strauteka/space-utilization](https://www.npmjs.com/package/@strauteka/space-utilization), which tracks the empty space in the container. If you want to write your own algorithm, use that package directly.

This is a TypeScript port of the packing algorithm from my master's thesis on 3D container packing. The original Java version is [3d-bin-space-utilization](https://github.com/Strauteka/3d-bin-space-utilization).

## Install

```sh
npm install @strauteka/bin-packing
```

## Quick start

```ts
import { pack } from '@strauteka/bin-packing';

const result = pack({
  container: { length: 5900, height: 2380, width: 2345 }, // a 20 ft container, in mm
  items: [
    { id: 'crate', length: 760, height: 300, width: 450, quantity: 20 },
    { id: 'fridge', length: 600, height: 1800, width: 650, quantity: 4, rotations: 'upright' },
  ],
  options: {
    attempts: 50,
    fitTolerance: 50,
    stacking: { overhangLength: 100, narrowLength: 100, overhangWidth: 100, narrowWidth: 100, heightTolerance: 5, minSpaceSide: 100 },
  },
});

result.utilization; // 0–1, share of the container volume used
result.placements; // blocks of identical boxes with position, size and rotation
result.unpacked; // [{ id, quantity }] that didn't fit
```

Axes: **length** runs along x, **height** is vertical (y), **width** runs along z. The origin is the bottom-rear-left corner. Use any unit, as long as it's the same everywhere.

Each placement is a block of `count.length × count.height × count.width` identical boxes. `boxes(placement)` expands a block into its individual boxes, for example to draw them.

## Options

| Option | Default | What it does |
|---|---|---|
| `attempts` | `50` | Randomised attempts; the one packing the most volume (then the lowest load) wins |
| `timeLimitMs` | none | Stop starting new attempts after this time; at least one attempt always runs |
| `seed` | `1` | The same seed and input always give the same result |
| `fitTolerance` | `0` | Gaps up to this size count as a snug fit when choosing blocks (the thesis used 50 mm) |
| `stacking` | all `0` | Space merging and over-stacking, passed to the core. See [stacking settings](https://github.com/Strauteka/bin-packing/tree/main/packages/space-utilization#stacking-settings) |
| `layers` | `false` | Build only one-box-high blocks, so the container fills floor by floor and the load stays low |
| `tallestFirst` | `false` | Prefer the tallest box in its tallest allowed orientation (stands long boxes on end when allowed); best as one variation |
| `stopWhenAllPacked` | `false` | Stop at the first attempt that packs every box |
| `rankByPriority` | `false` | Rank attempts by priority first: more volume of priority 1 wins, then priority 2…; total volume only breaks ties. The result gets `packedByPriority`, and `compareResults` respects it |
| `variations` | none | Stacking principles that attempts take turns with, see below |
| `firstAttempt`, `attemptStep` | `0`, `1` | Which attempts to run, for splitting the search across workers |

Per item:

- `rotations` sets the allowed orientations: `'all'` (default, all six), `'upright'` (height stays vertical, "this side up"), or a list. `rotationsFor()` builds the list from which sides may point up, as in the thesis (`allowL`, `allowH`, `allowW`):

  ```ts
  import { rotationsFor } from '@strauteka/bin-packing';

  rotationsFor({ height: true }); // ['lhw', 'whl']: upright, may turn around
  rotationsFor({ length: true, width: true }); // may lie on its side, not stand upright
  ```

- `priority` (default 1): lower numbers are packed first.

## Variations: try several stacking principles

The same strategy packs differently with different stacking settings, so the search can vary them too. `stackingVariations(base, fitTolerance)` builds 30 principles around your settings:
- no, normal and double over-stacking,
- each with no, normal and double fit tolerance,
- plus merging switched off,
- all in three block modes, layers first: layers, layers with the tallest boxes first, and columns (as in the thesis).

Attempts take turns with them, and the result's `variation` says which one won.

When everything fits, the volume is the same for every attempt, so the lowest load wins. Layers usually pack everything within the first one or two attempts. Use `stopWhenAllPacked` to stop there, or keep searching for a lower load: on random thesis-style loads, the full search came out 150–530 mm lower than the first full load.

```ts
import { pack, stackingVariations } from '@strauteka/bin-packing';

const stacking = { overhangLength: 100, narrowLength: 100, overhangWidth: 100, narrowWidth: 100, heightTolerance: 5, minSpaceSide: 100 };
pack({ container, items, options: { attempts: 500, stacking, fitTolerance: 50, variations: stackingVariations(stacking, 50) } });
```

On a 20 ft container with the thesis' 15-type load, 500 attempts reach 92.2% volume used, and 93.8% with variations (30 attempts: 89.6%).

## Search on all cores

Attempt `n` always packs the same way for the same input and seed. So workers can split the attempts and combine their results, and the answer is the same as one long run:

```ts
// in worker k of N, repeatedly, with c = 0, 1, 2, …
const part = pack({ container, items, options: { ...options, attempts: 20, firstAttempt: k + c * 20 * N, attemptStep: N } });
// on the main thread
best = best ? betterResult(best, part) : part;
```

`compareResults(a, b)` gives the order: more volume packed first, then the lower load.

## Loading order

`loadingSequence(result.placements)` lists every single box in the order people can load it, like building walls:
- Start at the back wall (x = 0) and fill **across the width, then upwards**.
- Only then move to the next distance from the back, so nobody has to climb onto boxes.
- A box is never loaded before every box it stands on. If the next box overhangs a box from a later wall, that box is loaded first (nested supports too).

`loadingSteps(result.placements)` gives one step per wall: the boxes at the same distance from the back, plus `early`, the boxes from walls further forward that have to go in during this step because boxes of this wall stand on them. This is useful for printed loading plans.

## How it works

1. The container starts as one empty space.
2. The packer picks an empty space: the lowest, rearmost one that some box fits in. Alternate attempts start from the top-front instead.
3. It tries blocks of each box type in each allowed rotation (one layer filled by length, one layer filled by width, or a column) and keeps the block that leaves the snuggest gaps.
4. The core places the block and recalculates the empty spaces around it.
5. Repeat until nothing fits. Block sizes are sometimes reduced by one at random, so attempts differ, and the best attempt wins.

`packOnce(bin, items, strategy, random, fitTolerance)` runs a single attempt on a `Bin`, if you want to drive attempts yourself.

## Upgrading from 0.1

In 0.1 this package also contained the core. The core is now [@strauteka/space-utilization](https://www.npmjs.com/package/@strauteka/space-utilization). `Bin`, `Cargo`, `Space` and the other core exports are still re-exported here, so 0.1 code keeps working, but import them from `@strauteka/space-utilization` instead.

## License

Apache-2.0, the same as the original Java project. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
