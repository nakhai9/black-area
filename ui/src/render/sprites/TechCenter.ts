import { activeDesign } from '../../constants';
import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

type Box = { u: number; v: number; w: number; d: number; z: number; h: number };

/** Where each design's facade lights flicker. */
const SHAFT: Record<FactionId, Box> = {
  usa: { u: 1.0, v: 0.9, w: 2.0, d: 1.8, z: 22, h: 70 },
  russia: { u: 1.3, v: 1.2, w: 1.4, d: 1.3, z: 34, h: 56 },
  china: { u: 1.15, v: 1.05, w: 1.7, d: 1.6, z: 22, h: 30 },
  europe: { u: 1.0, v: 0.9, w: 2.0, d: 1.9, z: 22, h: 0 },
  islamic: { u: 1.4, v: 1.3, w: 1.2, d: 1.1, z: 22, h: 80 },
};
/** Where each design's mast beacon blinks. */
const BEACON: Record<FactionId, [number, number, number]> = {
  usa: [2.0, 1.8, 200],
  russia: [2.0, 1.85, 196],
  china: [2.0, 1.85, 196],
  europe: [1.6, 2.1, 158],
  islamic: [2.0, 1.85, 198],
};

/** USA's Apple Park ring (5 × 5, tools/blender/models/techcenter_applepark.py): no shaft lights, no mast. */
const APPLE_PARK: PictureSpec = { file: 'building-techcenter-usa-applepark', originX: 166, originY: 70.8, scale: 3, footprint: { w: 5, d: 5 }, zScale: 1.35 };

/** China's Peking University Library (4 × 5, tools/blender/models/techcenter_pku.py): no shaft lights, no mast. */
const PEKING_UNIVERSITY: PictureSpec = { file: 'building-techcenter-china-pku', originX: 166, originY: 97.8, scale: 3, footprint: { w: 4, d: 5 }, zScale: 1.35 };

/** Rendered in Blender (tools/blender/models/techcenter.py techcenter-<nation>; USA's Art Deco tower and China's pagoda are hidden designs, see BUILDING_DESIGNS). */
const PICTURE = (faction: FactionId): PictureSpec => ({
  file: faction === 'usa' ? 'building-techcenter-usa-artdeco' : faction === 'china' ? 'building-techcenter-china-pagoda' : `building-techcenter-${faction}`,
  originX: 134,
  originY: faction === 'europe' ? 235.5 : 289.5,
  scale: 3,
  footprint: { w: 4, d: 4 },
  zScale: 1.35,
});

/**
 * High-Tech Center (4×4 tiles; USA's Apple Park 5×5): each nation's own design, no two alike.
 *  - USA: Apple Park, a five-storey glass ring round a wooded courtyard (hidden design: Art Deco limestone tower with setbacks and a needle mast, Empire State style);
 *  - Russia: Stalinist "Seven Sisters" high-rise: corner wings, central stepped tower, gilded spire and red star;
 *  - China: Peking University Library, cream stone wings and centre under a great grey-tiled hip roof (4×5; hidden design: tiered pagoda tower (Jin Mao style), tapering glass tiers under curled red eaves, golden finial);
 *  - Europe: Vienna International Centre: a concave curved glass tower between two white pylons, flags in front;
 *  - Islamic: slender clustered tower (Burj style) on an arched podium, green domes, needle spire.
 */
export function createTechCenterArt(faction: FactionId): BuildingArt {
  if (faction === 'usa' && activeDesign('techCenter', 'usa') === 'applePark') return pictureArt(APPLE_PARK);
  if (faction === 'china' && activeDesign('techCenter', 'china') === 'pekingUniversity') return pictureArt(PEKING_UNIVERSITY);
  return pictureArt(PICTURE(faction), {
    drawAnimated(p, time) {
      // Lit windows flickering on the main shaft.
      const b = SHAFT[faction];
      if (b.h > 0) {
        for (let i = 0; i < 9; i++) {
          if (Math.sin(time * 1.7 + i * 2.3) < 0.35) continue;
          const col = ((i * 5) % 6) / 6;
          const row = ((i * 7) % 10) / 10;
          p.faceRect('left', b.u, b.v, b.w, b.d, b.z, b.h, col + 0.03, col + 0.12, row + 0.01, row + 0.06, 'rgba(230,214,150,0.85)');
        }
      }
      // Mast beacon.
      if (Math.sin(time * 2.6) > 0.2) {
        const [u, v, z] = BEACON[faction];
        const [x, y] = p.project(u, v, z);
        p.ctx.fillStyle = '#ff3b30';
        p.ctx.beginPath();
        p.ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        p.ctx.fill();
      }
    },
  });
}
