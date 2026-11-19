import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, drawPicture, pictureArt, preloadPicture } from './PictureArt';
import { FOOTPRINT_SILO } from '../../constants';

/** Lid steps rendered by tools/blender/models/silo.py (LID_FRAMES): 00 closed ... 07 fully open. */
const FRAMES = 8;
/** Nations whose silo has the round domed cap; the others (USA, Europe) the two rectangular clamshell leaves. */
const ROUND: readonly FactionId[] = ['russia', 'china', 'islamic'];

/** Every silo picture is framed alike (3 × 3 plot, 64 art px tall): originX / originY as printed by the render. */
const spec = (file: string): PictureSpec => ({ file, originX: 102, originY: 92.4, scale: 3, footprint: FOOTPRINT_SILO, zScale: 1.35 });

/** Lid opening (0..1) of the silo being drawn now: set by the Renderer from MissileSilo.lid just before drawing it. */
let lidNow = 0;
export function setSiloLid(v: number): void {
  lidNow = v;
}

/**
 * Underground missile silo (3 × 3 plot), rendered in Blender (tools/blender/building_render.py silo): the apron and
 * collar (moss green #18392b, faction line round the apron) are the cached sprite; the lid is drawn on top from 8
 * pre-rendered steps, opened by the launch sequence (MissileSilo.lid). USA / Europe: two rectangular leaves; Russia /
 * China / Islamic: one round cap with a raised dome.
 */
export function createMissileSiloArt(faction: FactionId): BuildingArt {
  const lid = ROUND.includes(faction) ? 'building-silo-lid-round' : 'building-silo-lid';
  const frames = Array.from({ length: FRAMES }, (_, k) => spec(`${lid}${String(k).padStart(2, '0')}`));
  for (const f of frames) preloadPicture(f.file);
  const art = pictureArt(spec(`building-silo-${faction}`), {
    recolorWhole: true,
    drawAnimated(p) {
      const k = Math.round(Math.min(1, Math.max(0, lidNow)) * (FRAMES - 1));
      drawPicture(p, frames[k]!);
      lidNow = 0;
    },
  });
  return { ...art, fitHeight: true };
}
