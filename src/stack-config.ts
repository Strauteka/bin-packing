/**
 * How empty spaces are merged after each placement. Merging lets the packer stack a box
 * across two neighbouring spaces (over-stacking), which matters most when narrow, unusable
 * gaps are left between boxes. All values are in the same unit as your box sizes.
 *
 * Changing these values changes how spaces are generated, so the same packing strategy
 * gives different results.
 */
export interface StackConfig {
  /** Max overhang along the length when merging over a narrow space below (thesis: `l`). */
  readonly overhangLength: number;
  /** A space below counts as narrow when its length is at most this (thesis: `l_`). */
  readonly narrowLength: number;
  /** Max overhang along the width when merging over a narrow space below (thesis: `w`). */
  readonly overhangWidth: number;
  /** A space below counts as narrow when its width is at most this (thesis: `w_`). */
  readonly narrowWidth: number;
  /**
   * Floors whose heights differ by at most this are treated as level when merging
   * (thesis: `equalizeH`). Leave at 0 unless your strategy checks neighbouring heights.
   */
  readonly heightTolerance: number;
  /**
   * Spaces with any side at or below this are dropped after merging. Merging is O(n²) in the
   * number of spaces, so a sensible value (e.g. your smallest box side) keeps packing fast.
   */
  readonly minSpaceSide: number;
  /** Turn off merging, including over-stacking. */
  readonly disableMerge: boolean;
}

/** No over-stacking and no minimum space side: exact, but slower on large loads. */
export const DEFAULT_STACK_CONFIG: StackConfig = {
  overhangLength: 0,
  narrowLength: 0,
  overhangWidth: 0,
  narrowWidth: 0,
  heightTolerance: 0,
  minSpaceSide: 0,
  disableMerge: false,
};
