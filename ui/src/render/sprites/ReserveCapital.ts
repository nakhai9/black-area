import type { FactionId } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';
import { FOOTPRINT_RESERVE_CAPITAL } from '../../constants';

/**
 * Reserve Capital (3 × 4 plot), rendered in Blender (tools/blender/building_render.py reservecapital-<nation>): an ordinary
 * government building in the nation's own style (Paxamerica: a domed capitol; Nordursia: a Stalinist high-rise with a steeple
 * tower; Longoria: a double-eaved hall; Conquistalia: a palace quadrangle with a pedimented front; Lunastron: an arcaded palace
 * with a ribbed dome). A captured one keeps its builder's design.
 */
const RENDERS: Record<FactionId, { originX: number; originY: number; scale?: number }> = {
  usa: { originX: 134, originY: 103.2 },
  russia: { originX: 134, originY: 52.57, scale: 5 }, // Winter Palace (models/reservecapital_russia.py)
  china: { originX: 134, originY: 103.2 },
  europe: { originX: 134, originY: 62.7 },
  islamic: { originX: 134, originY: 108.6 },
};
const PICTURE = (faction: FactionId): PictureSpec => {
  const design = faction;
  const o = RENDERS[design];
  return { file: `building-reservecapital-${design}`, originX: o.originX, originY: o.originY, scale: o.scale ?? 3, footprint: FOOTPRINT_RESERVE_CAPITAL, zScale: 1 };
};

export function createReserveCapitalArt(faction: FactionId): BuildingArt {
  const spec = PICTURE(faction);
  // Damage pictures (d1 ≤80 %, d2 ≤50 %, d3 ≤20 % HP), same script, camera and origin.
  return pictureArt(spec, { damageFiles: [1, 2, 3].map((n) => `${spec.file}-d${n}`) });
}
