// 3D bin packing: the thesis' randomised packer, built on @strauteka/space-utilization.
export { pack, boxes } from './pack.js';
export type { PackInput, PackOptions, PackResult, ItemInput, Placement, ItemCount, Size3 } from './pack.js';

// Lower level: one packing attempt on a Bin, to combine with your own strategy.
export { packOnce } from './packer.js';
export type { PackItem, Tracked } from './packer.js';
export { seededRandom } from './random.js';
export type { Random } from './random.js';

// The core moved to @strauteka/space-utilization in 0.2.0. These re-exports keep 0.1.x imports
// working; import them from @strauteka/space-utilization instead.
export {
  Bin,
  Cargo,
  Space,
  DEFAULT_STACK_CONFIG,
  ROTATIONS,
  UPRIGHT_ROTATIONS,
  rotate,
  volume,
  fits,
} from '@strauteka/space-utilization';
export type { StackConfig, Dim, Rotation } from '@strauteka/space-utilization';
