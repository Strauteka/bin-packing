# @strauteka/space-utilization

[![npm](https://img.shields.io/npm/v/@strauteka/space-utilization)](https://www.npmjs.com/package/@strauteka/space-utilization) [![ci](https://github.com/Strauteka/bin-packing/actions/workflows/ci.yml/badge.svg)](https://github.com/Strauteka/bin-packing/actions/workflows/ci.yml) [![license](https://img.shields.io/npm/l/@strauteka/space-utilization)](LICENSE)

The hard part of a 3D bin packing algorithm is keeping track of the empty space left in a container as boxes go in. This package does that, so you can write your own packing algorithm on top. TypeScript, no dependencies, runs anywhere.

It's the space-utilization core from my master's thesis on 3D container packing, ported from the Java original, [3d-bin-space-utilization](https://github.com/Strauteka/3d-bin-space-utilization). For a ready-made algorithm built on it, see [@strauteka/bin-packing](https://www.npmjs.com/package/@strauteka/bin-packing).

## Install

```sh
npm install @strauteka/space-utilization
```

## The idea

- A `Bin` is a container with the cargo placed so far and a list of empty `spaces`.
- When you `add` a `Cargo` (a box, or a block of identical boxes) inside one of those spaces, every space it touches is split into up to six **maximal spaces**: left, right, front, rear, top and bottom of the cargo.
- Maximal spaces may overlap each other, so no usable space is lost.
- Spaces fully inside another are dropped, and neighbouring spaces are merged (see stacking settings).

Your algorithm only has to decide **which space** and **which box, in which rotation**. The core keeps the spaces correct.

Notation follows the thesis:
- `l` = length, `h` = height (vertical), `w` = width.
- A space starts at `l_`, `h_`, `w_` and ends at `l__`, `h__`, `w__`.
- Coordinates start at (0, 0, 0), the bottom-rear-left corner.
- Use any unit, as long as it's the same everywhere.

## Write your own algorithm

A complete greedy packer, in about 15 lines: each box goes into the lowest, rearmost space it fits in.

```ts
import { Bin, Cargo, ROTATIONS, fits, rotate, type Dim } from '@strauteka/space-utilization';

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

const bin = greedy({ l: 1000, h: 600, w: 800 }, [{ id: 'a', size: { l: 300, h: 200, w: 400 } }]);
bin.cargo; // placed cargo: position (l_, h_, w_), size, rotation, ref
bin.spaces; // empty spaces left
```

`Bin` is immutable: `add` returns a new bin, so you can try several moves and keep the best (backtracking, random restarts and so on). The core doesn't check for collisions: place cargo **at the position of one of `bin.spaces`**, and only where it fits.

## API

| Export | What it is |
|---|---|
| `Bin` | Container with `cargo`, `spaces`, `usedVolume`, `usedHeight`; `add(cargo, disableTop?)` returns a new bin |
| `Cargo` | A box, or a block of `stack.l × stack.h × stack.w` identical boxes, in one rotation at a position; `ref` is your identifier |
| `Space` | An empty space: `split`, `canMerge`, `merge`, `overlap`, `overlay`, `overlapSize` |
| `ROTATIONS`, `UPRIGHT_ROTATIONS`, `rotate` | The six orientations; upright ones keep the height vertical |
| `fits`, `volume`, `subtract` | Size helpers |
| `DEFAULT_STACK_CONFIG`, `StackConfig` | Merging settings, below |

## Stacking settings

Pass a `StackConfig` to `new Bin(size, config)`. Neighbouring empty spaces on the same level are merged, so a later box can span both. With over-stacking, a box may also overhang a **narrow** gap below it, which would otherwise be wasted.

| Setting | Meaning |
|---|---|
| `narrowLength` / `narrowWidth` | A space below counts as narrow when it's at most this long or wide |
| `overhangLength` / `overhangWidth` | How far a merged space may stick out over a narrow gap |
| `heightTolerance` | Floors whose heights differ by at most this count as level |
| `minSpaceSide` | Drop spaces with any side at or below this. Merging is O(n²) in the number of spaces, so set this to about your smallest box side for speed |
| `disableMerge` | Turn merging and over-stacking off |

The defaults are all `0` (exact, no over-stacking). For a shipping container in mm, the thesis used 100 for the four length/width settings, 5 for `heightTolerance` and 100 for `minSpaceSide`.

## License

Apache-2.0, the same as the original Java project. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
