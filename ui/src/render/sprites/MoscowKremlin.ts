import { drawFlagOnPole } from '../Flags';
import type { Allegiance } from '../../types';
import type { BuildingArt } from './BuildingArt';
import { type PictureSpec, pictureArt } from './PictureArt';

/** Plot coordinates (5 × 4) = the 4 × 3.2-unit art × 1.25. */
const S = 1.25;
/** The one flag flies from the top of the palace's gilded dome. */
const TOP_FLAG: readonly [number, number, number] = [2.5, 1.5, 69.5 * S];
const TOP_POLE_H = 12;

/** Rendered in Blender (tools/blender/building_render.py capital-russia). */
const PICTURE: PictureSpec = { file: 'building-capital-russia', originX: 134, originY: 161.25, scale: 3, footprint: { w: 5, d: 4 }, zScale: 1.35 };

/**
 * Moscow — the Grand Kremlin Palace as seen from the Moskva: a long yellow-and-white palace, arched windows in white
 * surrounds, green roofs; the raised centre with its kokoshnik arches, the green dome with a clock and gilded lantern
 * (the flag flies above it); trees and the red crenellated Kremlin wall in front.
 */
export function createMoscowKremlinArt(flag: Allegiance = 'russia'): BuildingArt {
  return pictureArt(PICTURE, {
    overlay(p) {
      p.pole(TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2], TOP_POLE_H, '#e6b43c');
    },
    drawAnimated(p, time) {
      drawFlagOnPole(p, flag, TOP_FLAG[0], TOP_FLAG[1], TOP_FLAG[2] + TOP_POLE_H, time, 1.5);
    },
  });
}
