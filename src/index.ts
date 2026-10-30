// High-level API: pack boxes into a container.
export { pack, boxes } from './pack.js';
export type { PackInput, PackOptions, PackResult, ItemInput, Placement, ItemCount, Size3 } from './pack.js';

// Space-distribution core, for building your own packing strategy (thesis notation: l, h, w).
export { Bin } from './bin.js';
export { Cargo } from './cargo.js';
export { Space } from './space.js';
export { DEFAULT_STACK_CONFIG } from './stack-config.js';
export type { StackConfig } from './stack-config.js';
export { ROTATIONS, UPRIGHT_ROTATIONS, rotate, volume, fits } from './dimension.js';
export type { Dim, Rotation } from './dimension.js';
export { packOnce } from './packer.js';
export type { PackItem, Tracked } from './packer.js';
export { seededRandom } from './random.js';
export type { Random } from './random.js';
