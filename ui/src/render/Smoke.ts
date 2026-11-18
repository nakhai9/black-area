/**
 * How a smoke puff thins out as it ages: `t` = age / lifetime (0 … 1). It stays dense at first, then thins ever more
 * slowly towards nothing (a soft ease-out), so trails and clouds dissolve gradually instead of blinking out together.
 */
export const dissipate = (t: number): number => (t <= 0 ? 1 : t >= 1 ? 0 : (1 - t) * (1 - t) * (1 + 0.6 * t));

/** A puff spreads as it ages: radius = r0 + grow × √age (fast at first, slower later, like real smoke). */
export const spread = (r0: number, grow: number, age: number): number => r0 + grow * Math.sqrt(Math.max(0, age));
