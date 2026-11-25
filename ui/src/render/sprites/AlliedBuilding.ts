import type { FactionId } from '../../types';
import { drawEmblemFlagOnPole, drawFlagOnPole, drawNationalPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Height of the office wing that fills the whole plot; the main hall and the flags stand on it. */
export const WING_H = 6;

/**
 * Two flags side by side along the front edge (on the wing roof), facing each other: the owner's national flag on
 * the left waving right, the ally flag (black, emblem) on the right waving left (mirrored).
 */
const FLAGS: readonly [number, number][] = [
  [0.45, 3.7],
  [3.55, 3.7],
];

/**
 * Rendered in Blender (tools/blender/models/allied.py, allied-<nation>): a low office wing over the whole plot with
 * the seat of an allied government on it in the leading nation's architecture —
 *  - USA: a white neoclassical hall with a columned portico and a low dome;
 *  - Russia: a Stalinist tower in red-brown stone with a spire and red star;
 *  - China: a hall of the people behind a tall colonnade with a two-tier red-and-gold pavilion on its roof;
 *  - Europe: a glass office tower with a band in the nation's colour and a ring of gold stars;
 *  - Islamic: a grand mosque with a dome, an iwan and two minarets.
 */
const PICTURE: Record<FactionId, PictureSpec> = {
  usa: { file: 'building-allied-usa', originX: 134, originY: 111.3, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 },
  russia: { file: 'building-allied-russia', originX: 134, originY: 178.8, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 },
  china: { file: 'building-allied-china', originX: 134, originY: 141, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 },
  europe: { file: 'building-allied-europe', originX: 134, originY: 141, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 },
  islamic: { file: 'building-allied-islamic', originX: 134, originY: 146.4, scale: 3, footprint: { w: 4, d: 4 }, zScale: 1.35 },
};

/** Draws `draw` mirrored left-right about the pole at (u, v, z): the flag then flies to the pole's left. */
export function mirrored(p: IsoPainter, u: number, v: number, z: number, draw: () => void): void {
  const [x] = p.project(u, v, z);
  p.ctx.save();
  p.ctx.translate(x, 0);
  p.ctx.scale(-1, 1);
  p.ctx.translate(-x, 0);
  draw();
  p.ctx.restore();
}

/** Embassy-style seat (4×4 tiles) in the given nation's architecture, used by the Parallel Government: the owner's national flag (`flag`) and its second flag side by side at the front, facing each other. */
/** `second`: a national flag for the right pole instead of the black ally flag (Parallel Government: the host nation's flag). */
export function createAlliedBuildingArt(faction: FactionId, flag: FactionId = faction, second?: FactionId): BuildingArt {
  return pictureArt(PICTURE[faction], {
    // Damage stages (≤80 %, ≤50 %, ≤20 % HP), same script/camera/origin; the flag poles keep a masonry block under them (z = 2 + WING_H).
    damageFiles: [1, 2, 3].map((n) => `${PICTURE[faction].file}-d${n}`),
    overlay(p) {
      FLAGS.forEach(([u, v], i) => drawNationalPole(p, i === 1 && second ? second : flag, u, v, 2 + WING_H, 30));
    },
    drawAnimated(p, time) {
      FLAGS.forEach(([u, v], i) =>
        i === 0
          ? drawFlagOnPole(p, flag, u, v, 32 + WING_H, time, 0)
          : mirrored(p, u, v, 32 + WING_H, () =>
              second ? drawFlagOnPole(p, second, u, v, 32 + WING_H, time, 1.1) : drawEmblemFlagOnPole(p, flag, u, v, 32 + WING_H, time, 1.1),
            ),
      );
    },
  });
}
