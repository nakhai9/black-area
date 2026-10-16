import { ISLAMIC_GREEN_DOME } from './IslamicPalette';
import { HALF_TW } from '../../constants';
import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { BuildingArt } from './BuildingArt';
import type { IsoPainter } from '../IsoPainter';
import { roofStar } from './PowerPlant';
import { facade, parapet, RA2 } from './Ra2Kit';



type Box = { u: number; v: number; w: number; d: number; z: number; h: number };

/** Per-nation materials (none shared): stone and glass. */
const LOOK: Record<FactionId, { stone: string; glass: string }> = {
  usa: { stone: '#c8c0a8', glass: '#2c3a4e' },
  russia: { stone: '#d2c4a0', glass: '#3a4048' },
  china: { stone: '#9a948a', glass: '#24485a' },
  europe: { stone: '#d8dce2', glass: '#3a6a8a' },
  islamic: { stone: '#c2a77c', glass: '#3a5a5a' },
};

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
  europe: [2.0, 1.85, 168],
  islamic: [2.0, 1.85, 198],
};

/** Glass box with windows on both visible faces and an optional team band at the top. */
function tower(p: IsoPainter, b: Box, glass: string, frame: string, floors: number, seed: number, band?: string): void {
  p.box(b.u, b.v, b.w, b.d, b.z, b.h, glass);
  facade(p, 'left', b.u, b.v, b.w, b.d, b.z, b.h, { cols: Math.round(b.w * 6), floors, glass, frame, fill: 0.7, band: 0.2, seed });
  facade(p, 'right', b.u, b.v, b.w, b.d, b.z, b.h, { cols: Math.round(b.d * 6), floors, glass, frame, fill: 0.7, band: 0.2, seed: seed + 1 });
  if (band) {
    p.faceRect('left', b.u, b.v, b.w, b.d, b.z, b.h, 0, 1, 0.94, 1, shade(band, 0.8));
    p.faceRect('right', b.u, b.v, b.w, b.d, b.z, b.h, 0, 1, 0.94, 1, shade(band, 0.68));
  }
}

/** Stone setback block with punched windows (Art Deco / Stalinist). */
function piered(p: IsoPainter, b: Box, stone: string, glass: string, floors: number, seed: number): void {
  p.box(b.u, b.v, b.w, b.d, b.z, b.h, stone);
  facade(p, 'left', b.u, b.v, b.w, b.d, b.z, b.h, { cols: Math.round(b.w * 5), floors, glass, frame: null, fill: 0.45, band: 0.3, seed });
  facade(p, 'right', b.u, b.v, b.w, b.d, b.z, b.h, { cols: Math.round(b.d * 5), floors, glass, frame: null, fill: 0.45, band: 0.3, seed: seed + 1 });
  p.topRect(b.u, b.v, b.u + b.w, b.v + b.d, b.z + b.h, shade(stone, 0.85));
}

/** Podium (the whole plot) with the name plate and an entrance canopy in the team colour. */
function podium(p: IsoPainter, stone: string, glass: string, team: string, h = 20, arched = false): void {
  const opts = { cols: arched ? 9 : 20, floors: arched ? 1 : 3, glass, bandColor: shade(stone, 0.8), fill: arched ? 0.5 : 0.62 };
  p.box(0, 0, 4, 4, 0, 2, shade(stone, 0.8));
  p.box(0.05, 0.05, 3.9, 3.9, 2, h, stone);
  facade(p, 'left', 0.05, 0.05, 3.9, 3.9, 2, h, { ...opts, seed: 3 });
  facade(p, 'right', 0.05, 0.05, 3.9, 3.9, 2, h, { ...opts, seed: 4 });
  p.faceRect('left', 0.05, 0.05, 3.9, 3.9, 2, h, 0, 1, 0.9, 1, shade(team, 0.75));
  p.topRect(0.1, 0.1, 3.9, 3.9, 2 + h, RA2.roof);
  parapet(p, 0.05, 0.05, 3.9, 3.9, 2 + h, shade(stone, 1.05), 0.06, 2);
  p.faceRect('left', 0.05, 0.05, 3.9, 3.9, 2, h, 0.38, 0.62, 0, 0.55, RA2.glassLit);
  p.box(1.4, 3.75, 1.2, 0.25, h * 0.6, 1.5, team);
  p.faceTransform('left', 0.25, 3.95, 2, (ctx) => {
    ctx.fillStyle = 'rgba(8,16,24,0.85)';
    ctx.fillRect(0.55 * HALF_TW, h - 6, 2.4 * HALF_TW, 5);
    ctx.fillStyle = '#e8f6ff';
    ctx.font = '700 4.4px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.scale(1, -1); // the face space has y growing up
    ctx.fillText('HIGH-TECH CENTER', 1.75 * HALF_TW, -(h - 3.5));
    ctx.restore();
  });
}

/**
 * High-Tech Center (4×4 tiles): each nation's own skyscraper, no two alike.
 *  - USA: Art Deco limestone tower with setbacks and a needle mast (Empire State style);
 *  - Russia: Stalinist "Seven Sisters" high-rise: corner wings, central stepped tower, gilded spire and red star;
 *  - China: tiered pagoda tower (Jin Mao style): tapering glass tiers under curled red eaves, golden finial;
 *  - Europe: rounded glass tower (Gherkin style): stacked bulging cylinders with team-colour bands and a glass cap;
 *  - Islamic: slender clustered tower (Burj style) on an arched podium, green domes, needle spire.
 */
export function createTechCenterArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors;
  const { stone: STONE, glass: GLASS } = LOOK[faction];
  return {
    footprint: { w: 4, d: 4 },
    height: 205,

    drawStatic(p) {
      switch (faction) {
        case 'usa': {
          podium(p, STONE, GLASS, team.primary);
          piered(p, SHAFT.usa, STONE, GLASS, 12, 5);
          p.faceRect('left', 1.0, 0.9, 2.0, 1.8, 22, 70, 0, 1, 0.97, 1, team.primary);
          piered(p, { u: 1.2, v: 1.1, w: 1.6, d: 1.4, z: 92, h: 36 }, shade(STONE, 1.04), GLASS, 6, 7);
          piered(p, { u: 1.45, v: 1.35, w: 1.1, d: 0.9, z: 128, h: 22 }, shade(STONE, 1.08), GLASS, 4, 9);
          p.box(1.7, 1.55, 0.6, 0.5, 150, 12, shade(STONE, 1.12));
          p.cylinder(2.0, 1.8, 0.18, 162, 10, '#d8d4c8');
          p.pole(2.0, 1.8, 172, 28, '#c8c8c8');
          break;
        }
        case 'russia': {
          podium(p, STONE, GLASS, team.primary, 14);
          // Corner wings with gilded pyramid caps.
          for (const [u, v] of [[0.3, 0.3], [2.7, 0.3], [0.3, 2.7]] as const) {
            piered(p, { u, v, w: 1.0, d: 1.0, z: 16, h: 30 }, STONE, GLASS, 5, 11);
            p.pyramid(u + 0.2, v + 0.2, 0.6, 0.6, 46, 10, '#b89a52');
          }
          piered(p, { u: 1.05, v: 0.95, w: 1.9, d: 1.8, z: 16, h: 18 }, STONE, GLASS, 3, 13);
          piered(p, SHAFT.russia, STONE, GLASS, 9, 15);
          p.faceRect('left', 1.3, 1.2, 1.4, 1.3, 34, 56, 0, 1, 0.95, 1, team.primary);
          piered(p, { u: 1.5, v: 1.4, w: 1.0, d: 0.9, z: 90, h: 26 }, shade(STONE, 1.05), GLASS, 4, 17);
          p.box(1.7, 1.6, 0.6, 0.5, 116, 14, shade(STONE, 1.1));
          p.pyramid(1.75, 1.65, 0.5, 0.4, 130, 52, '#c8a850');
          p.pole(2.0, 1.85, 182, 12, '#c8a850');
          roofStar(p, 2.0, 1.85, 194, 0.28, team.primary);
          // Front corner wing last (nearest the viewer).
          piered(p, { u: 2.7, v: 2.7, w: 1.0, d: 1.0, z: 16, h: 30 }, STONE, GLASS, 5, 11);
          p.pyramid(2.9, 2.9, 0.6, 0.6, 46, 10, '#b89a52');
          break;
        }
        case 'china': {
          podium(p, STONE, GLASS, team.primary);
          const tiers: Box[] = [
            SHAFT.china,
            { u: 1.25, v: 1.15, w: 1.5, d: 1.4, z: 58, h: 26 },
            { u: 1.35, v: 1.25, w: 1.3, d: 1.2, z: 90, h: 22 },
            { u: 1.45, v: 1.35, w: 1.1, d: 1.0, z: 118, h: 18 },
            { u: 1.55, v: 1.45, w: 0.9, d: 0.8, z: 142, h: 14 },
          ];
          tiers.forEach((t, i) => {
            tower(p, t, GLASS, '#c8b894', 4, 21 + i * 2);
            p.hipRoof(t.u, t.v, t.w, t.d, t.z + t.h, 6, 0.14, '#9a2a1e', 2.5);
          });
          p.box(1.8, 1.7, 0.4, 0.3, 168, 6, '#c8a850');
          p.pyramid(1.85, 1.7, 0.3, 0.3, 174, 10, team.primary);
          p.pole(2.0, 1.85, 184, 12, '#c8a850');
          break;
        }
        case 'europe': {
          podium(p, STONE, GLASS, team.primary, 14);
          const rings = 24;
          for (let i = 0; i < rings; i++) {
            const t = i / rings;
            const r = 0.95 * Math.sin(Math.PI * (0.25 + t * 0.62)) + 0.1;
            const c = i % 3 === 0 ? shade(team.primary, 0.9) : shade(GLASS, 1 - t * 0.15);
            p.cylinder(2.0, 1.85, r, 16 + i * 5.6, 5.8, c, 12);
          }
          p.dome(2.0, 1.85, 0.42, 150, 14, shade(RA2.glassLit, 0.9));
          p.pole(2.0, 1.85, 160, 8, '#c8c8c8');
          break;
        }
        default: {
          podium(p, STONE, GLASS, team.primary, 18, true);
          tower(p, { u: 0.9, v: 1.4, w: 0.7, d: 0.9, z: 20, h: 50 }, GLASS, STONE, 8, 31, team.primary);
          tower(p, { u: 1.4, v: 0.9, w: 0.9, d: 0.7, z: 20, h: 66 }, GLASS, STONE, 10, 33, team.primary);
          tower(p, SHAFT.islamic, GLASS, STONE, 12, 35, team.primary);
          tower(p, { u: 1.6, v: 1.5, w: 0.8, d: 0.7, z: 102, h: 30 }, GLASS, STONE, 5, 37);
          p.cylinder(2.0, 1.85, 0.32, 132, 6, STONE);
          p.dome(2.0, 1.85, 0.34, 138, 12, ISLAMIC_GREEN_DOME);
          p.cylinder(2.0, 1.85, 0.06, 150, 40, '#d8d0c0');
          p.pole(2.0, 1.85, 190, 8, '#e8c860');
          for (const [u, v] of [[0.4, 3.6], [3.6, 0.4], [3.6, 3.6]] as const) p.dome(u, v, 0.25, 20, 7, ISLAMIC_GREEN_DOME);
        }
      }
    },

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
  };
}
