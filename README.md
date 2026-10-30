# @strauteka/bin-packing

3D bin packing for container loading, in TypeScript with no dependencies. It runs in the browser, in a Web Worker or in Node.

It has two parts:

- **`pack()`**: give it a container and a list of box types, get back where each box goes.
- **The space-distribution core** (`Bin`, `Space`, `Cargo`): tracks the empty space left in a container as boxes are added, so you can write your own packing strategy on top.

This is a TypeScript port of the algorithm from my master's thesis on 3D container packing. The original Java version is [3d-bin-space-utilization](https://github.com/Strauteka/3d-bin-space-utilization).

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
| `stacking` | all `0` | Space merging and over-stacking, see below |

Per item, `rotations: 'upright'` keeps the height vertical ("this side up"), and `priority` (default 1) packs lower numbers first.

### Stacking settings

After each box, neighbouring empty spaces on the same level are merged, so a later box can span both. With over-stacking, a box may also overhang a **narrow** gap below it, which would otherwise be wasted.

| Setting | Meaning |
|---|---|
| `narrowLength` / `narrowWidth` | A space below counts as narrow when it's at most this long or wide |
| `overhangLength` / `overhangWidth` | How far a merged space may stick out over a narrow gap |
| `heightTolerance` | Floors whose heights differ by at most this count as level |
| `minSpaceSide` | Drop spaces with any side at or below this. Merging is O(n²) in the number of spaces, so set this to about your smallest box side for speed |
| `disableMerge` | Turn merging and over-stacking off |

## How it works

1. The container starts as one empty space.
2. The packer picks an empty space: the lowest, rearmost one that some box fits in. Alternate attempts start from the top-front instead.
3. It tries blocks of each box type in each allowed rotation (one layer filled by length, one layer filled by width, or a column) and keeps the block that leaves the snuggest gaps.
4. Placing the block splits every empty space it touches into up to six **maximal spaces** (left, right, front, rear, top, bottom). These may overlap each other, so no usable space is lost. Spaces fully inside another are dropped, and neighbouring spaces are merged as described above.
5. Repeat until nothing fits. Block sizes are sometimes reduced by one at random, so attempts differ, and the best attempt wins.

## Using the core directly

```ts
import { Bin, Cargo } from '@strauteka/bin-packing';

let bin = new Bin({ l: 1000, h: 1000, w: 1000 });
bin = bin.add(new Cargo('box-1', { l: 200, h: 200, w: 200 }, 'lhw', { l: 0, h: 0, w: 0 }));
bin.spaces; // the empty spaces left: right, front and top of the box
```

The core uses the thesis notation (`l`, `h`, `w`, and `l_` / `l__` for the start and end of a space). `Bin` is immutable: `add` returns a new bin. It doesn't check for collisions, so place cargo inside one of `bin.spaces`, at that space's position, as `pack()` does.

## Development

```sh
npm install
npm run verify # typecheck, tests, build
```

## License

Apache-2.0, the same as the original Java project. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
