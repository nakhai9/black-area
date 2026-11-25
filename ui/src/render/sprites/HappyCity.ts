import type { FactionId } from '../../types';
import { drawFlagOnPole } from '../Flags';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/**
 * Happy City (8×8 tiles), one per nation, each laid out the way that part of the world builds its cities:
 *  - USA: a street grid, a glass-and-steel downtown round an Art Deco skyscraper, low suburban houses on lawns round it.
 *  - Russia: a wide avenue and a great paved square with a metro entrance, a Stalinist "Seven Sisters" tower,
 *    Khrushchyovka panel blocks and an Orthodox church with onion domes.
 *  - China: a symmetrical north–south axis through a paifang gate, siheyuan courtyard houses with curved roofs on both
 *    sides, and super-tall towers (Oriental Pearl, Shanghai Tower) behind, with trees along the axis.
 *  - Europe: boulevards meeting at a paved central square with a fountain and café umbrellas, a Gothic cathedral on
 *    it, and stone Haussmann blocks of even height with slate mansard roofs.
 *  - Islamic world: a medina of inward-looking courtyard houses (riads with a garden and fountain, latticed
 *    mashrabiya windows) round a domed mosque with minarets, and one Gulf super-tower rising behind.
 * Rendered in Blender (tools/blender/building_render.py happycity-<nation>); the nation's flag flies from the tallest
 * building and a few windows of the landmark light up.
 */

const N = 8;
/** Street level (px). */
const G = 2;
const LIT = 'rgba(255,238,160,0.95)';

interface CityPlan {
  /** Picture frame height (art px) the render used (tools/blender/models/happycity.py). */
  readonly frame: number;
  /** Pole foot of the flag (u, v, z) and the pole's height (0: the flag flies from the spire itself). */
  readonly flag: readonly [number, number, number, number];
  /** Landmark face whose windows light up at night (u, v, w, d, z, h). */
  readonly lit: readonly [number, number, number, number, number, number];
}

const PLANS: Record<FactionId, CityPlan> = {
  usa: { frame: 210, flag: [2.99, 2.99, G + 192, 14], lit: [2.26, 2.26, 1.5, 1.5, G, 84] },
  russia: { frame: 175, flag: [4.0, 2.0, G + 143, 0], lit: [2.55, 0.9, 2.9, 2.4, G, 34] },
  china: { frame: 205, flag: [6.2, 1.8, G + 6 + 9 * 21 + 8, 16], lit: [0.4, 5.8, 2.9, 0.34, G, 10] },
  europe: { frame: 105, flag: [6.15, 2.9, G + 96, 14], lit: [2.0, 6.29, 1.34, 1.56, G, 28] },
  islamic: { frame: 200, flag: [1.0, 1.8, G + 194, 14], lit: [2.1, 0.4, 3.6, 2.9, G, 20] },
};

const PICTURE = (faction: FactionId): PictureSpec => ({
  file: `building-happycity-${faction}`,
  originX: N * 32 + 6,
  originY: PLANS[faction].frame * 1.35 + 6,
  scale: 3,
  footprint: { w: N, d: N },
  zScale: 1.35,
});

/** Stage 3 (≤20 % HP): the city is a rubble field and the flag flies from a pole on a masonry block 8 px high
 * (tools/blender/models/_damage.py RUIN_POLE_Z). */
const RUIN_FLAG_Z = 8;
const RUIN_POLE = 16;
/** Where stage 2 cuts the city in half (happycity.py cut_u): everything at larger u collapses. */
const CUT_U: Record<FactionId, number> = { usa: 4.0, russia: 4.6, china: 4.0, europe: 4.0, islamic: 4.0 };

/** `flagOf`: the nation whose flag flies (its owner after a capture; the city stays `faction`'s). */
export function createHappyCityArt(faction: FactionId, flagOf: FactionId = faction, stage = 0): BuildingArt {
  const plan = PLANS[faction];
  const [fu, fv] = plan.flag;
  // d1/d2 keep the flag spot (the column under it stands at d2); d3 moves it down onto the ruin block.
  // Stage 2 cuts away the half beyond CUT_U (_damage.py cut_u): a flag spot there falls with it onto a ruin block.
  const fallen = stage >= 3 || (stage === 2 && fu > CUT_U[faction] - 0.3);
  const [fz, pole] = fallen ? [RUIN_FLAG_Z, RUIN_POLE] : [plan.flag[2], plan.flag[3]];
  const spec = PICTURE(faction);
  const art = pictureArt(stage ? { ...spec, file: `${spec.file}-d${stage}` } : spec, {
    recolorWhole: true,
    overlay(p) {
      if (pole > 0) p.pole(fu, fv, fz, pole, '#e8e8e8');
    },
    drawAnimated(p, time) {
      drawFlagOnPole(p, flagOf, fu, fv, fz + pole, time, 0);
      if (stage >= 2) return; // the landmark's lights are out once it is half gone
      // A few windows of the landmark light up and go dark again.
      const [lu, lv, lw, ld, lz, lh] = plan.lit;
      for (let i = 0; i < 6; i++) {
        if (Math.sin(time * 1.3 + i * 2.1) < 0.4) continue;
        const s = (i * 0.17) % 0.9;
        p.faceRect('left', lu, lv, lw, ld, lz, lh, s, s + 0.06, 0.2 + (i % 3) * 0.25, 0.26 + (i % 3) * 0.25, LIT);
      }
    },
  });
  // Tall enough for the flag above the picture (kept for every stage so the cache size never changes).
  // Stage arts made up front so their pictures load with the intact one.
  const stages = stage ? [] : [1, 2, 3].map((n) => createHappyCityArt(faction, flagOf, n));
  return {
    ...art,
    damaged: stage ? undefined : (n) => stages[Math.min(3, Math.max(1, n)) - 1]!,
    height: Math.max(art.height, Math.ceil(plan.flag[2] + plan.flag[3] + 20)),
  };
}
