/** Small seeded PRNG (mulberry32): fast, and the same seed always gives the same sequence. */
export type Random = () => number;

export function seededRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed for attempt `n`, independent of how many attempts ran before it. */
export function attemptSeed(seed: number, n: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(n + 1, 0xc2b2ae35)) >>> 0;
}
