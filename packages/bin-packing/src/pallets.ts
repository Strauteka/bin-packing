import { UPRIGHT_ROTATIONS } from '@strauteka/space-utilization';
import { pack, type ItemCount, type ItemInput, type PackOptions, type Placement, type Size3 } from './pack.js';

/** A pallet type: its footprint, the height of the pallet itself, and the most a loaded pallet may be tall. */
export interface PalletSpec {
  readonly length: number;
  readonly width: number;
  /** Height of the empty pallet (the base). */
  readonly baseHeight: number;
  /** Highest a loaded pallet may be, base included. */
  readonly maxHeight: number;
  /** How many pallets are available. */
  readonly count: number;
}

/** One loaded pallet. Its placements are relative to the top of the base. */
export interface PalletLoad extends Size3 {
  readonly id: string;
  readonly baseHeight: number;
  readonly placements: Placement[];
  readonly packed: ItemCount[];
}

export interface PalletsResult {
  readonly pallets: PalletLoad[];
  /** Boxes that didn't fit on any pallet. */
  readonly left: ItemCount[];
}

/**
 * Loads the items onto pallets, one pallet after another (each packed with `pack()` and the given
 * options), until everything is on a pallet, the pallets run out, or a pallet would stay empty.
 * Pallets are named `pallet-1`, `pallet-2`, …; a pallet's height is its base plus its load.
 */
export function buildPallets(spec: PalletSpec, items: readonly ItemInput[], options: PackOptions = {}): PalletsResult {
  if (!(spec.maxHeight > spec.baseHeight)) throw new RangeError('The pallet maxHeight must be more than its baseHeight');
  const remaining = new Map(items.map((i) => [i.id, i.quantity]));
  const pallets: PalletLoad[] = [];
  for (let n = 1; n <= spec.count; n++) {
    const left = items.filter((i) => (remaining.get(i.id) ?? 0) > 0).map((i) => ({ ...i, quantity: remaining.get(i.id)! }));
    if (left.length === 0) break;
    const result = pack({
      container: { length: spec.length, width: spec.width, height: spec.maxHeight - spec.baseHeight },
      items: left,
      options,
    });
    if (result.placements.length === 0) break;
    for (const p of result.packed) remaining.set(p.id, remaining.get(p.id)! - p.quantity);
    pallets.push({
      id: `pallet-${n}`,
      length: spec.length,
      width: spec.width,
      height: spec.baseHeight + result.usedHeight,
      baseHeight: spec.baseHeight,
      placements: result.placements,
      packed: result.packed,
    });
  }
  const left = items.map((i) => ({ id: i.id, quantity: remaining.get(i.id) ?? 0 })).filter((c) => c.quantity > 0);
  return { pallets, left };
}

/**
 * A loaded pallet as one container item: upright (it may turn a quarter round), only on the floor,
 * and with nothing on top. Give it a priority to decide when it's loaded.
 */
export function palletItem(pallet: PalletLoad, priority?: number): ItemInput {
  return {
    id: pallet.id,
    length: pallet.length,
    width: pallet.width,
    height: pallet.height,
    quantity: 1,
    rotations: UPRIGHT_ROTATIONS,
    floorOnly: true,
    noStackOnTop: true,
    ...(priority !== undefined && { priority }),
  };
}

/**
 * Turns packed pallets back into what's really in the container: each pallet's base (id
 * `pallet-n:base`) and every box on it, in container coordinates. Other placements are kept as
 * they are. A pallet turned a quarter round has its load turned with it.
 */
export function expandPallets(placements: readonly Placement[], pallets: readonly PalletLoad[]): Placement[] {
  const byId = new Map(pallets.map((p) => [p.id, p]));
  return placements.flatMap((placed) => {
    const pallet = byId.get(placed.id);
    if (!pallet) return [placed];
    // Placed with length along the container's length, or turned (its width along the length).
    const turned = placed.length !== pallet.length || placed.width !== pallet.width;
    const base: Placement = {
      ...placed,
      id: `${pallet.id}:base`,
      height: pallet.baseHeight,
      box: { length: placed.length, height: pallet.baseHeight, width: placed.width },
    };
    const load = pallet.placements.map(
      (p): Placement => ({
        ...p,
        x: placed.x + (turned ? p.z : p.x),
        y: placed.y + pallet.baseHeight + p.y,
        z: placed.z + (turned ? p.x : p.z),
        length: turned ? p.width : p.length,
        width: turned ? p.length : p.width,
        box: turned ? { length: p.box.width, height: p.box.height, width: p.box.length } : p.box,
        count: turned ? { length: p.count.width, height: p.count.height, width: p.count.length } : p.count,
      }),
    );
    return [base, ...load];
  });
}
