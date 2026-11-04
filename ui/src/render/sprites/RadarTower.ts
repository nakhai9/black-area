import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, drawPicture, pictureArt, preloadPicture } from './PictureArt';

/** Headings the antenna was rendered at (tools/blender/models/radar.py N_FRAMES), from +u towards +v. */
const FRAMES = 32;

/** Pivot height (art px) of each nation's antenna and its turning speed (turns per second). */
const STYLES: Record<FactionId, { pivot: number; rpm: number; phase: number }> = {
  usa: { pivot: 96, rpm: 0.07, phase: 0.4 },
  russia: { pivot: 88, rpm: 0.18, phase: 2.1 },
  china: { pivot: 94, rpm: 0.09, phase: 3.3 },
  europe: { pivot: 90, rpm: 0.2, phase: 4.6 },
  islamic: { pivot: 92, rpm: 0.11, phase: 5.5 },
};

/** Every radar picture is framed the same way (2 × 2 footprint, pivot + 62 art px tall), so the frames stack on the pedestal. */
const spec = (file: string, pivot: number): PictureSpec => ({ file, originX: 70, originY: (pivot + 62) * 1.35 + 6, scale: 3, footprint: { w: 2, d: 2 }, zScale: 1.35 });

/**
 * Radar Tower (2 × 2 plot), rendered in Blender (tools/blender/building_render.py radar-<nation>): the pedestal is the
 * cached sprite, the antenna turns a full 360° on top, drawn from 32 pre-rendered headings.
 * USA parabolic dish on a white cone · Russia phased-array panel on a lattice mast · China Cassegrain dish on an
 * octagon · Europe orange-peel surveillance reflector on a round tower · Islamic world mesh dish on an arched octagon.
 */
export function createRadarTowerArt(faction: FactionId): BuildingArt {
  const st = STYLES[faction];
  const frames = Array.from({ length: FRAMES }, (_, k) => spec(`building-radar-${faction}-ant${String(k).padStart(2, '0')}`, st.pivot));
  for (const f of frames) preloadPicture(f.file);
  const art = pictureArt(spec(`building-radar-${faction}`, st.pivot), {
    recolorWhole: true,
    drawAnimated(p, time) {
      const turns = st.phase / (Math.PI * 2) + time * st.rpm;
      const k = Math.round((((turns % 1) + 1) % 1) * FRAMES) % FRAMES;
      drawPicture(p, frames[k]!);
    },
  });
  return { ...art, fitHeight: true };
}
