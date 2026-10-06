import { FACTIONS } from '../../factions';
import type { FactionId } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import { type BuildingArt, groundShadow } from './BuildingArt';

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
  /** Ordinary towers: 'glass' skyscrapers, 'panel' blocks, 'pagoda' tops or 'gable' old-town houses. */
  towers: 'glass' | 'panel' | 'pagoda' | 'gable';
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

const STYLES: Readonly<Record<FactionId, CityStyle>> = {
  // USA: Manhattan — glass skyscrapers and an Empire State style tower with a spire.
  usa: {
    facades: ['#6f8fae', '#8aa3b8', '#5c7893', '#a8b6c2'],
    roof: '#4b5560',
    towers: 'glass',
    landmark: (p, team) => {
      tower(p, 1.2, 1.2, 2.2, 2.2, 90, '#c9c1a8', 16);
      tower(p, 1.6, 1.6, 1.4, 1.4, 50, '#d4ccb3', 9, 92);
      tower(p, 1.9, 1.9, 0.8, 0.8, 30, '#ddd6bf', 5, 142);
      p.faceRect('left', 1.2, 1.2, 2.2, 2.2, 2, 90, 0, 1, 0.94, 1, team);
      p.pole(2.3, 2.3, 172, 40, '#e8e8e8');
    },
  },
  // Russia: a Stalinist "Seven Sisters" tower with a red star, and onion domes.
  russia: {
    facades: ['#c9b89a', '#b7a888', '#d8cdb5', '#a89b80'],
    roof: '#6a5a48',
    towers: 'panel',
    landmark: (p, team) => {
      tower(p, 1.0, 1.0, 2.6, 2.6, 50, '#e2d6bd', 9);
      tower(p, 1.5, 1.5, 1.6, 1.6, 45, '#e8dcc4', 8, 52);
      tower(p, 1.85, 1.85, 0.9, 0.9, 35, '#efe4cc', 6, 97);
      p.pyramid(1.85, 1.85, 0.9, 0.9, 132, 26, '#c7b98f');
      p.pole(2.3, 2.3, 158, 22, '#e8c45a');
      const [x, y] = p.project(2.3, 2.3, 182);
      p.ctx.fillStyle = team;
      p.ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 4 : 1.7;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        p.ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      }
      p.ctx.fill();
      p.cylinder(0.75, 3.25, 0.22, 2, 14, '#efe7d6');
      p.onion(0.75, 3.25, 0.26, 16, 14, '#3f8a5a', '#f2d36b');
    },
  },
  // China: an Oriental Pearl style TV tower and towers crowned with pagoda roofs.
  china: {
    facades: ['#b8b2a6', '#9fb3c2', '#c7bfae', '#8ea4b5'],
    roof: '#8a2a1f',
    towers: 'pagoda',
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
      groundShadow(p, N, N);
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
      for (let i = 0; i < 6; i++) {
        if (Math.sin(time * 1.3 + i * 2.1) < 0.4) continue;
        const s = (i * 0.17) % 0.9;
        p.faceRect('left', 1.2, 1.2, 2.2, 2.2, 2, 40, s, s + 0.06, 0.2 + (i % 3) * 0.25, 0.26 + (i % 3) * 0.25, LIT);
      }
    },
  };
}
