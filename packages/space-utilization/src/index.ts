// Empty-space tracking for 3D bin packing (thesis notation: l = length, h = height, w = width).
// Packing strategy is up to you; @strauteka/bin-packing is one built on this core.
export { Bin } from './bin.js';
export { Cargo } from './cargo.js';
export { Space } from './space.js';
export { DEFAULT_STACK_CONFIG } from './stack-config.js';
export type { StackConfig } from './stack-config.js';
export { ROTATIONS, UPRIGHT_ROTATIONS, rotate, volume, fits, subtract } from './dimension.js';
export type { Dim, Rotation } from './dimension.js';
