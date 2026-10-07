import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

const N = 8;
const ASPHALT = '#4a4d52';
const SIDEWALK = '#b9b6ac';
const LAWN = '#6d9f4a';
const LANE = '#f2e6a0';
const PANE = '#a9d6ef';
const LIT = 'rgba(255,238,160,0.95)';
/** Road centre lines (tiles): a ring road inside the edge and a cross through the middle. */
const ROADS = [0.55, 4, 7.45] as const;
const ROAD_W = 0.5;

/** One thing standing in the city, drawn back to front by `key` (u + v of its front corner). */
interface Piece {
  key: number;
  draw: (p: IsoPainter) => void;
}

/** National look of a Happy City. */
interface CityStyle {
  /** Facade colours of ordinary buildings. */
  facades: readonly string[];
  roof: string;
  /** The nation's signature landmark, standing in the back block (u, v in 0.9…3.6). */
  landmark: (p: IsoPainter, team: string) => void;
  /**
   * Ordinary towers: 'glass' skyscrapers, 'panel' blocks, 'pagoda' tops, 'gable' old-town houses or 'russian'
   * pastel classical houses with green roofs and Orthodox churches among them.
   */
  towers: 'glass' | 'panel' | 'pagoda' | 'gable' | 'russian';
  /** Landmark face whose windows light up at night (u, v, w, d, height). */
  lit: readonly [number, number, number, number, number];
}

const tower = (p: IsoPainter, u: number, v: number, w: number, d: number, h: number, color: string, floors: number, z = 2): void => {
  p.box(u, v, w, d, z, h, color);
  const cols = Math.max(2, Math.round(w * 4));
  p.windows('left', u, v, w, d, z, h, cols, floors, PANE, 0.08, 0.4);
  p.windows('right', u, v, w, d, z, h, Math.max(2, Math.round(d * 4)), floors, shade(PANE, 1.1), 0.08, 0.4);
};

const tree = (p: IsoPainter, u: number, v: number, s = 1): void => {
  p.cylinder(u, v, 0.05 * s, 2, 4 * s, '#6b4a2b');
  p.dome(u, v, 0.22 * s, 5 * s, 8 * s, '#3f7a34');
};

/** Onion dome on a drum: the drum, the striped or plain bulb and a small gold cross. */
const domeOnDrum = (p: IsoPainter, u: number, v: number, r: number, z: number, drum: number, bulb: string, stripe?: string): void => {
  p.cylinder(u, v, r * 0.8, z, drum, '#f1ead8', 6);
  p.onion(u, v, r, z + drum, r * 60, bulb, stripe);
  p.pole(u, v, z + drum + r * 60, 5, '#e8c45a');
};

/** Red five-pointed star centred at screen point (x, y). */
const star = (p: IsoPainter, x: number, y: number, r: number, color: string): void => {
  p.ctx.fillStyle = color;
  p.ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const k = i % 2 === 0 ? r : r * 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    p.ctx.lineTo(x + k * Math.cos(a), y + k * Math.sin(a));
  }
  p.ctx.fill();
};

/** Small Orthodox church: white walls, green roof, five onion domes (gold centre, blue around). */
const church = (p: IsoPainter, u: number, v: number, w: number, d: number): void => {
  p.box(u, v, w, d, 2, 14, '#f3eee2');
  p.windows('left', u, v, w, d, 2, 14, 3, 1, '#5a6f8a', 0.2, 0.55);
  p.windows('right', u, v, w, d, 2, 14, 3, 1, '#5a6f8a', 0.2, 0.55);
  p.box(u, v, w, d, 16, 2, '#4f7a5a');
  const cu = u + w / 2;
  const cv = v + d / 2;
  const r = Math.min(w, d) * 0.16;
  for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) domeOnDrum(p, cu + du * w * 0.28, cv + dv * d * 0.28, r * 0.7, 18, 5, '#3f6fb0');
  domeOnDrum(p, cu, cv, r, 18, 9, '#e2b23a');
};

/** Moscow townhouse: pastel classical façade, white cornice and window trim, green hip roof. */
const townhouse = (p: IsoPainter, u: number, v: number, w: number, d: number, h: number, color: string, floors: number): void => {
  tower(p, u, v, w, d, h, color, floors);
  p.box(u - 0.03, v - 0.03, w + 0.06, d + 0.06, 2 + h, 1.5, '#f6f1e4');
  p.faceRect('left', u, v, w, d, 2, h, 0, 1, 0, 0.12, shade(color, 0.85));
  p.hipRoof(u, v, w, d, 3.5 + h, 4, 0.04, '#4f7a5a');
};

const STYLES: Readonly<Record<FactionId, CityStyle>> = {
  // USA: Manhattan — glass skyscrapers and an Empire State style tower with a spire.
  usa: {
    facades: ['#6f8fae', '#8aa3b8', '#5c7893', '#a8b6c2'],
    roof: '#4b5560',
    towers: 'glass',
    lit: [1.2, 1.2, 2.2, 2.2, 40],
    landmark: (p, team) => {
      tower(p, 1.2, 1.2, 2.2, 2.2, 90, '#c9c1a8', 16);
      tower(p, 1.6, 1.6, 1.4, 1.4, 50, '#d4ccb3', 9, 92);
      tower(p, 1.9, 1.9, 0.8, 0.8, 30, '#ddd6bf', 5, 142);
      p.faceRect('left', 1.2, 1.2, 2.2, 2.2, 2, 90, 0, 1, 0.94, 1, team);
      p.pole(2.3, 2.3, 172, 40, '#e8e8e8');
    },
  },
  // Russia: Moscow — a Stalinist "Seven Sisters" skyscraper with its red star behind St Basil's Cathedral and its
  // colourful onion domes, pastel classical townhouses with green roofs and Orthodox churches between them.
  russia: {
    facades: ['#e9c46a', '#e8b4a0', '#a8c8a0', '#f0dfb0', '#c9d6e3'],
    roof: '#4f7a5a',
    towers: 'russian',
    lit: [0.95, 0.95, 1.6, 1.4, 34],
    landmark: (p) => {
      // Seven Sisters (Moscow State University style): wings, stepped tower, golden spire and star.
      const STONE = '#e6dac0';
      tower(p, 0.85, 0.9, 1.9, 1.5, 34, STONE, 6);
      tower(p, 1.25, 1.1, 1.1, 1.1, 40, '#ece1c9', 7, 36);
      tower(p, 1.5, 1.35, 0.6, 0.6, 26, '#f1e7d0', 4, 76);
      p.box(1.45, 1.3, 0.7, 0.7, 102, 3, '#f6efdc');
      p.pyramid(1.55, 1.4, 0.5, 0.5, 105, 22, '#d9b45a');
      p.pole(1.8, 1.65, 127, 14, '#e8c45a');
      const [x, y] = p.project(1.8, 1.65, 143);
      star(p, x, y, 4.5, '#d42a1e');
      // Red Square cobbles in front of the cathedral.
      p.topRect(0.85, 2.55, 3.65, 3.7, 2, '#8d6f62');
      // St Basil's Cathedral: red-brick base, a tall central tent spire and a ring of striped onion domes.
      const BRICK = '#b5462f';
      p.box(1.9, 2.0, 1.55, 1.25, 2, 12, BRICK, { top: '#9c3c28' });
      p.windows('left', 1.9, 2.0, 1.55, 1.25, 2, 12, 6, 1, '#f3eee2', 0.15, 0.6);
      p.windows('right', 1.9, 2.0, 1.55, 1.25, 2, 12, 5, 1, '#f3eee2', 0.15, 0.6);
      p.cylinder(2.68, 2.62, 0.2, 14, 26, '#c9573c', 8);
      p.pyramid(2.5, 2.44, 0.36, 0.36, 40, 30, '#2f7a4f');
      p.onion(2.68, 2.62, 0.08, 70, 6, '#e2b23a');
      const domes: readonly [number, number, number, string, string][] = [
        [2.1, 2.2, 0.17, '#2f7a4f', '#e2b23a'],
        [3.25, 2.2, 0.17, '#3f6fb0', '#f3eee2'],
        [2.1, 3.05, 0.18, '#d23b2b', '#f2d36b'],
        [3.25, 3.05, 0.18, '#e2b23a', '#2f7a4f'],
        [2.68, 2.12, 0.15, '#c94a8a', '#f3eee2'],
        [2.68, 3.12, 0.16, '#2f7a4f', '#f2d36b'],
      ];
      for (const [u, v, r, bulb, stripe] of domes) {
        p.cylinder(u, v, r * 0.85, 14, 12, '#d6a24a', 6);
        p.onion(u, v, r, 26, r * 90, bulb, stripe);
        p.pole(u, v, 26 + r * 90, 5, '#e8c45a');
      }
    },
  },
  // China: an Oriental Pearl style TV tower and towers crowned with pagoda roofs.
  china: {
    facades: ['#b8b2a6', '#9fb3c2', '#c7bfae', '#8ea4b5'],
    roof: '#8a2a1f',
    towers: 'pagoda',
    lit: [1.2, 1.2, 2.2, 2.2, 40],
    landmark: (p, team) => {
      p.box(1.1, 1.1, 2.4, 2.4, 2, 6, '#d9d2c4');
      for (const [du, dv] of [[0.4, 1.8], [1.8, 0.4], [1.8, 1.8]] as const) p.cylinder(1.1 + du, 1.1 + dv, 0.12, 8, 34, '#d8d8d8');
      p.cylinder(2.3, 2.3, 0.14, 8, 150, '#e1e1e1');
      p.dome(2.3, 2.3, 0.62, 44, 26, team);
      p.dome(2.3, 2.3, 0.4, 112, 18, team);
      p.dome(2.3, 2.3, 0.18, 150, 9, team);
      p.pole(2.3, 2.3, 158, 30, '#e8e8e8');
    },
  },
  // Europe: an old town of gabled houses round a cathedral with a clock tower.
  europe: {
    facades: ['#e3d3b4', '#d9b99a', '#e8e0c8', '#c9a98a'],
    roof: '#9a4a32',
    towers: 'gable',
    lit: [1.2, 1.2, 2.2, 2.2, 40],
    landmark: (p, team) => {
      p.box(1.0, 1.3, 2.6, 1.6, 2, 34, '#d8cdb3');
      p.windows('left', 1.0, 1.3, 2.6, 1.6, 2, 34, 6, 2, '#5a6f8a', 0.1, 0.5);
      p.gableRoofV(1.0, 1.3, 2.6, 1.6, 36, 18, '#d8cdb3', '#4d5b66');
      p.box(2.6, 2.4, 0.8, 0.8, 2, 80, '#d2c6aa');
      p.windows('left', 2.6, 2.4, 0.8, 0.8, 2, 80, 2, 6, '#5a6f8a', 0.15, 0.5);
      p.faceTransform('left', 2.6, 3.2, 62, (ctx) => {
        ctx.fillStyle = '#f5f0e0';
        ctx.beginPath();
        ctx.arc(0.4 * 16, 8, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2b2b2b';
        ctx.lineWidth = 0.7;
        ctx.stroke();
      });
      p.pyramid(2.6, 2.4, 0.8, 0.8, 82, 34, '#4d5b66');
      p.pole(3.0, 2.8, 116, 14, team);
    },
  },
};

/** Footprints of the ordinary buildings in a block (tiles), filling it with a little gap to the sidewalks. */
function blockLots(u0: number, v0: number, u1: number, v1: number): { u: number; v: number; w: number; d: number }[] {
  const lots: { u: number; v: number; w: number; d: number }[] = [];
  const nu = 2;
  const nv = 2;
  const lw = (u1 - u0) / nu;
  const ld = (v1 - v0) / nv;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) lots.push({ u: u0 + i * lw + 0.12, v: v0 + j * ld + 0.12, w: lw - 0.24, d: ld - 0.24 });
  return lots;
}

/**
 * Happy City (8×8 tiles): a crowded, lively city block in the nation's own style. A ring road and a cross of
 * avenues split it into four blocks of towers and parks lined with trees; the back block holds the nation's
 * landmark. Cars drive the avenues and windows light up (animated).
 */
export function createHappyCityArt(faction: FactionId): BuildingArt {
  const team = FACTIONS[faction].colors.primary;
  const style = STYLES[faction];
  // Deterministic per-lot variation.
  let seed = faction.length * 97 + faction.charCodeAt(0);
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const pieces: Piece[] = [];
  const blocks: [number, number, number, number][] = [
    [0.8, 0.8, 3.75, 3.75],
    [4.25, 0.8, 7.2, 3.75],
    [0.8, 4.25, 3.75, 7.2],
    [4.25, 4.25, 7.2, 7.2],
  ];
  blocks.forEach(([u0, v0, u1, v1], bi) => {
    if (bi === 0) {
      pieces.push({ key: u1 + v1 - 2, draw: (p) => style.landmark(p, team) });
      return;
    }
    blockLots(u0, v0, u1, v1).forEach((lot, li) => {
      const park = (bi === 3 && li === 0) || (bi === 1 && li === 3);
      if (park) {
        pieces.push({
          key: lot.u + lot.v + lot.w + lot.d,
          draw: (p) => {
            p.topRect(lot.u, lot.v, lot.u + lot.w, lot.v + lot.d, 2, '#5f9a44');
            tree(p, lot.u + 0.3, lot.v + 0.3);
            tree(p, lot.u + lot.w - 0.3, lot.v + 0.35, 0.9);
            tree(p, lot.u + 0.4, lot.v + lot.d - 0.3, 1.1);
            tree(p, lot.u + lot.w - 0.35, lot.v + lot.d - 0.35);
          },
        });
        return;
      }
      const color = style.facades[Math.floor(rnd() * style.facades.length)] ?? '#999';
      if (style.towers === 'russian') {
        if (li === (bi + 1) % 4) {
          pieces.push({ key: lot.u + lot.v + lot.w + lot.d, draw: (p) => church(p, lot.u + 0.1, lot.v + 0.1, lot.w - 0.2, lot.d - 0.2) });
          return;
        }
        const tall = 16 + rnd() * (bi === 3 ? 14 : 26);
        pieces.push({ key: lot.u + lot.v + lot.w + lot.d, draw: (p) => townhouse(p, lot.u, lot.v, lot.w, lot.d, tall, color, Math.max(3, Math.round(tall / 7))) });
        return;
      }
      const tall = style.towers === 'gable' ? 14 + rnd() * 14 : 24 + rnd() * (bi === 3 ? 40 : 70);
      const floors = Math.max(3, Math.round(tall / 7));
      pieces.push({
        key: lot.u + lot.v + lot.w + lot.d,
        draw: (p) => {
          tower(p, lot.u, lot.v, lot.w, lot.d, tall, color, floors);
          const top = 2 + tall;
          if (style.towers === 'gable') p.gableRoofV(lot.u, lot.v, lot.w, lot.d, top, 9, color, style.roof);
          else if (style.towers === 'pagoda') p.hipRoof(lot.u + 0.15, lot.v + 0.15, lot.w - 0.3, lot.d - 0.3, top, 7, 0.12, style.roof, 2);
          else if (style.towers === 'panel') {
            p.box(lot.u + 0.2, lot.v + 0.2, lot.w - 0.4, lot.d - 0.4, top, 4, style.roof);
          } else {
            p.box(lot.u + 0.25, lot.v + 0.25, lot.w - 0.5, lot.d - 0.5, top, 5, shade(color, 0.85));
            p.faceRect('left', lot.u, lot.v, lot.w, lot.d, 2, tall, 0, 1, 0.97, 1, team);
          }
        },
      });
    });
  });
  // Street trees along the avenues.
  for (let t = 1.1; t < N - 0.6; t += 0.9) {
    if (Math.abs(t - 4) < 0.5) continue;
    pieces.push({ key: t + 4.35, draw: (p) => tree(p, t, 4.35, 0.75) });
    pieces.push({ key: 4.35 + t, draw: (p) => tree(p, 4.35, t, 0.75) });
  }
  pieces.sort((a, b) => a.key - b.key);

  return {
    footprint: { w: N, d: N },
    height: 220,

    drawStatic(p) {
      p.box(0, 0, N, N, 0, 2, SIDEWALK);
      p.topRect(0.1, 0.1, N - 0.1, N - 0.1, 2, LAWN);
      // Roads: ring + cross, with lane markings.
      for (const c of ROADS) {
        p.topRect(c - ROAD_W / 2, 0.3, c + ROAD_W / 2, N - 0.3, 2, ASPHALT);
        p.topRect(0.3, c - ROAD_W / 2, N - 0.3, c + ROAD_W / 2, 2, ASPHALT);
      }
      for (const c of ROADS) {
        for (let t = 0.5; t < N - 0.5; t += 0.5) {
          p.topRect(c - 0.02, t, c + 0.02, t + 0.22, 2, LANE);
          p.topRect(t, c - 0.02, t + 0.22, c + 0.02, 2, LANE);
        }
      }
      for (const piece of pieces) piece.draw(p);
    },

    drawAnimated(p, time) {
      // Traffic on the two front ring roads (animated art is drawn over the static towers, so only roads that
      // nothing stands in front of carry cars), team-coloured buses among them.
      const road = ROADS[2];
      for (let i = 0; i < 12; i++) {
        const dir = i % 2 === 0 ? 1 : -1;
        const along = (((time * (0.5 + (i % 4) * 0.12) * dir + i * 1.37) % (N - 1)) + (N - 1)) % (N - 1);
        const pos = 0.5 + along;
        const side = dir * 0.11;
        const color = i % 5 === 0 ? team : ['#e8e8e8', '#d23b2b', '#2b5bd2', '#f2c230', '#2b2b2b'][i % 5] ?? '#ddd';
        const len = i % 5 === 0 ? 0.32 : 0.18;
        if (i % 2 === 0) p.box(pos, road + side - 0.06, len, 0.12, 2, 2.2, color);
        else p.box(road + side - 0.06, pos, 0.12, len, 2, 2.2, color);
      }
      // Crowds on the sidewalks.
      p.ctx.fillStyle = 'rgba(40,40,40,0.8)';
      for (let i = 0; i < 20; i++) {
        const t = 0.5 + ((((time * 0.15 * (i % 2 ? 1 : -1) + i * 0.61) % (N - 1)) + (N - 1)) % (N - 1));
        const [x, y] = i % 2 ? p.project(t, road - 0.32, 2) : p.project(road - 0.32, t, 2);
        p.ctx.fillRect(x - 0.4, y - 1.6, 0.8, 1.6);
      }
      // Lit windows on the landmark block.
      const [lu, lv, lw, ld, lh] = style.lit;
      for (let i = 0; i < 6; i++) {
        if (Math.sin(time * 1.3 + i * 2.1) < 0.4) continue;
        const s = (i * 0.17) % 0.9;
        p.faceRect('left', lu, lv, lw, ld, 2, lh, s, s + 0.06, 0.2 + (i % 3) * 0.25, 0.26 + (i % 3) * 0.25, LIT);
      }
    },
  };
}
