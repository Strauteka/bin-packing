import { ROTATIONS, type Rotation } from '@strauteka/space-utilization';

/** Which of a box's original sides may point up (be vertical). */
export interface VerticalSides {
  readonly length?: boolean;
  readonly height?: boolean;
  readonly width?: boolean;
}

/**
 * The rotations that keep one of the allowed sides vertical, in `ROTATIONS` order.
 * Each side allows two rotations (the box can still turn around the vertical axis):
 * length up → `wlh`, `hlw`; height up → `lhw`, `whl`; width up → `hwl`, `lwh`.
 * Ported from the thesis demo's `ItemImpl` (`allowL`, `allowH`, `allowW`).
 */
export function rotationsFor(sides: VerticalSides): Rotation[] {
  return ROTATIONS.filter(
    (r) => (sides.length && r[1] === 'l') || (sides.height && r[1] === 'h') || (sides.width && r[1] === 'w'),
  );
}
