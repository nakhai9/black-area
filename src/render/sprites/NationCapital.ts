import type { ContestedNationId } from '../../constants';
import type { Allegiance } from '../../types';
import { createCanvas, starPath } from '../Canvas';
import { drawFlagOnPole, drawTextureFlagOnPole } from '../Flags';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2, facade, parapet } from './Ra2Kit';

const FLAG_W = 60;
const FLAG_H = 36;

/** National flags of the contested nations (simplified). */
const FLAG_PAINTERS: Record<ContestedNationId, (ctx: CanvasRenderingContext2D, w: number, h: number) => void> = {
  northKorea(ctx, w, h) {
    ctx.fillStyle = '#024fa2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, h * 0.17, w, h * 0.66);
    ctx.fillStyle = '#ed1c27';
    ctx.fillRect(0, h * 0.22, w, h * 0.56);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w * 0.36, h / 2, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ed1c27';
    ctx.beginPath();
    starPath(ctx, w * 0.36, h / 2, h * 0.18);
    ctx.fill();
  },
  southKorea(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const r = h * 0.25;
    ctx.fillStyle = '#cd2e3a';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#0047a0';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#111111';
    for (const [x, y] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]] as const) ctx.fillRect(w * x - 3, h * y - 3, 6, 6);
  },
  japan(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#bc002d';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.3, 0, Math.PI * 2);
    ctx.fill();
  },
  australia(ctx, w, h) {
    ctx.fillStyle = '#012169';
    ctx.fillRect(0, 0, w, h);
    // Union Jack canton (simplified).
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w / 2, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(0, h / 2);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 4 - 3, 0, 6, h / 2);
    ctx.fillRect(0, h / 4 - 3, w / 2, 6);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(w / 4 - 1.5, 0, 3, h / 2);
    ctx.fillRect(0, h / 4 - 1.5, w / 2, 3);
    ctx.fillStyle = '#ffffff';
    for (const [x, y, r] of [[0.25, 0.75, 0.09], [0.75, 0.2, 0.05], [0.65, 0.5, 0.05], [0.88, 0.42, 0.05], [0.75, 0.82, 0.05]] as const) {
      ctx.beginPath();
      starPath(ctx, w * x, h * y, h * r, h * r * 0.45, 7);
      ctx.fill();
    }
  },
  brazil(ctx, w, h) {
    ctx.fillStyle = '#009739';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#fedd00';
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h / 2);
    ctx.lineTo(w / 2, h * 0.1);
    ctx.lineTo(w * 0.92, h / 2);
    ctx.lineTo(w / 2, h * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#012169';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, h * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2 + h * 0.1, h * 0.95, h * 0.5, Math.PI * 1.15, Math.PI * 1.72);
    ctx.stroke();
  },
  unitedKingdom(ctx, w, h) {
    // Union Jack (simplified).
    ctx.fillStyle = '#012169';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, h);
    ctx.moveTo(w, 0);
    ctx.lineTo(0, h);
    ctx.stroke();
    ctx.strokeStyle = '#c8102e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(w / 2 - 6, 0, 12, h);
    ctx.fillRect(0, h / 2 - 6, w, 12);
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(w / 2 - 3.5, 0, 7, h);
    ctx.fillRect(0, h / 2 - 3.5, w, 7);
  },
  canada(ctx, w, h) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d52b1e';
    ctx.fillRect(0, 0, w / 4, h);
    ctx.fillRect((w * 3) / 4, 0, w / 4, h);
    // Maple leaf (simplified): a spiky star on a short stem.
    ctx.beginPath();
    starPath(ctx, w / 2, h * 0.46, h * 0.3, h * 0.14, 11);
    ctx.fill();
    ctx.fillRect(w / 2 - 1, h * 0.6, 2, h * 0.25);
  },
  cuba(ctx, w, h) {
    // Five blue and white stripes, a red triangle at the hoist with a white star.
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#002a8f' : '#ffffff';
      ctx.fillRect(0, (i * h) / 5, w, h / 5 + 1);
    }
    ctx.fillStyle = '#cf142b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w * 0.43, h / 2);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    starPath(ctx, w * 0.15, h / 2, h * 0.16);
    ctx.fill();
  },
};

const flagTextures = new Map<ContestedNationId, HTMLCanvasElement>();

export function nationFlag(nation: ContestedNationId): HTMLCanvasElement {
  let tex = flagTextures.get(nation);
  if (!tex) {
    const { canvas, ctx } = createCanvas(FLAG_W, FLAG_H);
    FLAG_PAINTERS[nation](ctx, FLAG_W, FLAG_H);
    tex = canvas;
    flagTextures.set(nation, tex);
  }
  return tex;
}

const PLAZA = '#a8a294';
/** Depth of the art in art units: the 5 × 3 plot (FOOTPRINT_NATION_CAPITAL) drawn 1.25× from 4 × 2.4 units. */
const ART_D = 2.4;

/** Each nation's seat of government, authored in 4 × 2.4 art units; the building fills the plot. */
const PALACES: Record<ContestedNationId, { height: number; draw: (p: IsoPainter) => void }> = {
  // Kumsusan-style palace: long grey-white hall with a central portal, red banners.
  northKorea: {
    height: 64,
    draw: (p) => {
      const W = '#d6d2c6';
      p.box(0.3, 0.15, 3.4, 1.95, 3, 4, '#9c978a');
      p.box(0.4, 0.25, 3.2, 1.75, 7, 22, W, { top: RA2.roof });
      facade(p, 'left', 0.4, 0.25, 3.2, 1.75, 7, 22, { cols: 18, floors: 3, frame: '#efece4', bandColor: '#b9b4a6', seed: 71 });
      facade(p, 'right', 0.4, 0.25, 3.2, 1.75, 7, 22, { cols: 10, floors: 3, frame: '#efece4', bandColor: '#a9a496', seed: 72 });
      parapet(p, 0.4, 0.25, 3.2, 1.75, 29, '#c9c5b8', 0.06, 2);
      p.box(1.4, 0.65, 1.2, 1.0, 29, 10, W);
      p.faceRect('left', 1.4, 0.65, 1.2, 1.0, 29, 10, 0.2, 0.8, 0.2, 0.9, '#c8302a');
      p.box(1.5, 2.0, 1.0, 0.35, 7, 14, '#b9b4a6');
      p.faceRect('left', 1.5, 2.0, 1.0, 0.35, 7, 14, 0.2, 0.8, 0, 0.8, '#3a3630');
    },
  },
  // Blue House: a traditional hall under a blue-tiled sweeping roof on a stone terrace.
  southKorea: {
    height: 62,
    draw: (p) => {
      p.box(0.3, 0.1, 3.4, 2.15, 3, 5, '#cfc8b6');
      p.box(0.6, 0.4, 2.8, 1.45, 8, 14, '#efe9da');
      p.colonnade('left', 0.6, 0.4, 2.8, 1.45, 8, 14, 10, '#7a2a20', '#efe9da');
      p.colonnade('right', 0.6, 0.4, 2.8, 1.45, 8, 14, 6, '#6a241c', '#e3ddcd');
      p.hipRoof(0.6, 0.4, 2.8, 1.45, 22, 14, 0.22, '#2f5fa8', 3);
    },
  },
  // Kantei (Prime Minister's Office, Tokyo): a glass-and-steel block on a granite podium under a deep, razor-thin
  // overhanging roof, fine vertical louvres over the glass and a glazed entrance hall.
  japan: {
    height: 64,
    draw: (p) => {
      const GRANITE = '#9c988e';
      const GLASS = '#4b6878';
      const LOUVRE = '#d9dcd8';
      p.box(0.3, 0.1, 3.4, 2.2, 3, 4, GRANITE, { top: '#b4b0a5' });
      // Lower floors: recessed glass behind a colonnade of slim steel posts.
      p.box(0.6, 0.35, 2.8, 1.55, 7, 12, GLASS);
      p.colonnade('left', 0.5, 0.25, 3.0, 1.75, 7, 12, 14, '#e6e8e4', GLASS);
      p.colonnade('right', 0.5, 0.25, 3.0, 1.75, 7, 12, 8, '#dadcd8', GLASS);
      // Upper floors: glass box screened by vertical louvres.
      p.box(0.5, 0.25, 3.0, 1.75, 19, 18, GLASS, { top: '#7b8288' });
      for (let i = 0; i < 24; i++) p.faceRect('left', 0.5, 0.25, 3.0, 1.75, 19, 18, i / 24 + 0.012, i / 24 + 0.026, 0, 1, LOUVRE);
      for (let i = 0; i < 14; i++) p.faceRect('right', 0.5, 0.25, 3.0, 1.75, 19, 18, i / 14 + 0.02, i / 14 + 0.042, 0, 1, '#c9ccc8');
      for (const t of [0.33, 0.66]) {
        p.faceRect('left', 0.5, 0.25, 3.0, 1.75, 19, 18, 0, 1, t, t + 0.04, '#eef0ec');
        p.faceRect('right', 0.5, 0.25, 3.0, 1.75, 19, 18, 0, 1, t, t + 0.04, '#dfe1dd');
      }
      // The deep, thin roof slab overhanging all round.
      p.box(0.25, 0.05, 3.5, 2.1, 37, 1.6, '#e9ebe7', { top: '#5a6066' });
      p.box(1.2, 0.7, 1.4, 0.8, 38.6, 3, '#8d9398');
      // Glazed entrance hall with its canopy.
      p.box(1.4, 2.0, 1.0, 0.3, 7, 8, '#6f8c9a');
      p.box(1.3, 1.95, 1.2, 0.4, 15, 1, '#eef0ec');
    },
  },
  // Office of the Prime Minister (The Lodge, Canberra): a white-rendered two-storey Georgian Revival house under
  // a terracotta hipped roof with tall chimneys, a columned front porch and green shutters.
  australia: {
    height: 70,
    draw: (p) => {
      const RENDER = '#f3efe6';
      const TILE = '#b5603e';
      p.box(0.5, 0.25, 3.0, 1.55, 3, 22, RENDER);
      facade(p, 'left', 0.5, 0.25, 3.0, 1.55, 3, 22, { cols: 9, floors: 2, glass: '#3d4a52', frame: '#ffffff', bandColor: '#e1dccf', seed: 151 });
      facade(p, 'right', 0.5, 0.25, 3.0, 1.55, 3, 22, { cols: 5, floors: 2, glass: '#3d4a52', frame: '#ffffff', bandColor: '#d4cfc2', seed: 152 });
      for (let i = 0; i < 9; i++) {
        const s0 = (i + 0.5) / 9;
        p.faceRect('left', 0.5, 0.25, 3.0, 1.55, 3, 22, s0 - 0.055, s0 - 0.035, 0.12, 0.9, '#3f6a43');
        p.faceRect('left', 0.5, 0.25, 3.0, 1.55, 3, 22, s0 + 0.035, s0 + 0.055, 0.12, 0.9, '#3f6a43');
      }
      p.hipRoof(0.5, 0.25, 3.0, 1.55, 25, 12, 0.12, TILE);
      for (const u of [1.0, 3.0]) {
        p.box(u - 0.1, 0.75, 0.2, 0.3, 30, 12, RENDER);
        p.box(u - 0.12, 0.73, 0.24, 0.34, 42, 1.5, '#d8d2c4');
      }
      // Columned front porch with a small gable.
      p.box(1.6, 1.8, 0.8, 0.45, 3, 1.5, '#e4ded2');
      p.colonnade('left', 1.6, 1.8, 0.8, 0.45, 4.5, 14, 4, '#ffffff', '#3d4a52');
      p.box(1.55, 1.78, 0.9, 0.5, 18.5, 2, '#ffffff');
      p.gableRoofV(1.55, 1.78, 0.9, 0.5, 20.5, 6, '#f6f2ea', TILE);
    },
  },
  // Palácio do Planalto, Brasília: Niemeyer's long glass box between two thin white slabs, ringed by his
  // sail-like marble columns that barely touch the ground, and the ramp up to the entrance.
  brazil: {
    height: 52,
    draw: (p) => {
      const WHITE = '#f4f2ec';
      const GLASS = '#2e4656';
      p.box(0.3, 0.2, 3.4, 1.9, 6, 2, WHITE);
      p.box(0.55, 0.45, 2.9, 1.4, 8, 14, GLASS, { top: '#3a4a56' });
      facade(p, 'left', 0.55, 0.45, 2.9, 1.4, 8, 14, { cols: 20, floors: 2, glass: GLASS, frame: '#9aa8b2', bandColor: '#53646f', seed: 131 });
      facade(p, 'right', 0.55, 0.45, 2.9, 1.4, 8, 14, { cols: 10, floors: 2, glass: GLASS, frame: '#9aa8b2', bandColor: '#46565f', seed: 132 });
      p.box(0.25, 0.15, 3.5, 2.0, 22, 2.5, WHITE, { top: '#e2e0d8' });
      // Sail columns along the two visible sides: wide under the roof, tapering to a point just above the ground.
      const sail = (u: number, v: number, along: 'u' | 'v'): void => {
        const pt = (o: number, z: number): [number, number, number] => (along === 'u' ? [u + o, v, z] : [u, v + o, z]);
        p.polygon([pt(-0.13, 22), pt(0.13, 22), pt(0.04, 12), pt(0, 4), pt(-0.02, 12)], '#ffffff', '#b9b6ad');
      };
      for (let i = 0; i < 7; i++) sail(0.55 + i * 0.48, 2.12, 'u');
      for (let i = 0; i < 4; i++) sail(3.72, 0.35 + i * 0.5, 'v');
      // The ceremonial ramp up to the entrance.
      p.polygon([[1.6, 2.1, 6], [2.4, 2.1, 6], [2.4, 2.4, 3], [1.6, 2.4, 3]], '#e8e6e0');
    },
  },
  // 10 Downing Street: a plain Georgian terrace of soot-black brick, white sash windows, the famous black door
  // with its white "10" under a fanlight, black railings and a row of chimney stacks on a slate roof.
  unitedKingdom: {
    height: 66,
    draw: (p) => {
      const BRICK = '#2b2a28';
      // Pavement in front.
      p.topRect(0.1, 2.05, 3.9, 2.4, 3.5, '#8d8a82');
      // The terrace: Nos 10, 11 and 12 joined in one row.
      p.box(0.3, 0.3, 3.4, 1.75, 3, 26, BRICK);
      facade(p, 'left', 0.3, 0.3, 3.4, 1.75, 3, 26, { cols: 9, floors: 3, glass: '#3b4650', frame: '#f2f0ea', bandColor: '#1e1d1b', seed: 111 });
      facade(p, 'right', 0.3, 0.3, 3.4, 1.75, 3, 26, { cols: 5, floors: 3, glass: '#3b4650', frame: '#f2f0ea', bandColor: '#181715', seed: 112 });
      // White cornice and the grey slate mansard roof.
      p.box(0.25, 0.25, 3.5, 1.85, 29, 1.5, '#e8e5dc');
      p.hipRoof(0.3, 0.3, 3.4, 1.75, 30.5, 9, 0.02, '#4a4f55');
      // Chimney stacks with terracotta pots.
      for (const u of [0.7, 1.6, 2.5, 3.3]) {
        p.box(u, 0.95, 0.22, 0.4, 30, 16, BRICK);
        p.cylinder(u + 0.11, 1.05, 0.04, 46, 3, '#a4553a');
        p.cylinder(u + 0.11, 1.25, 0.04, 46, 3, '#a4553a');
      }
      // The black front door of No 10: white "10", fanlight above, white door case and step.
      p.box(1.55, 2.03, 0.5, 0.06, 3, 1.5, '#d8d5cc');
      p.faceRect('left', 0.3, 0.3, 3.4, 1.75, 3, 26, 0.37, 0.445, 0, 0.42, '#f2f0ea');
      p.faceRect('left', 0.3, 0.3, 3.4, 1.75, 3, 26, 0.38, 0.435, 0.02, 0.33, '#0d0d0f');
      p.faceRect('left', 0.3, 0.3, 3.4, 1.75, 3, 26, 0.38, 0.435, 0.34, 0.41, '#e9d27a');
      p.faceRect('left', 0.3, 0.3, 3.4, 1.75, 3, 26, 0.4, 0.415, 0.2, 0.25, '#ffffff');
      // Black iron railings along the front, a lamp over the door.
      for (let i = 0; i <= 14; i++) p.pole(0.4 + i * 0.22, 2.15, 3.5, 5, '#111111');
      p.pole(1.8, 2.12, 3, 15, '#111111');
      p.box(1.76, 2.08, 0.08, 0.08, 18, 3, '#f4e7b0');
    },
  },
  // Parliament Hill, Ottawa: the Gothic Revival Centre Block in pale sandstone under steep green copper roofs, a row
  // of pinnacles along its eaves, the slender Peace Tower rising from the front with its clock stage and tall
  // copper spire, and behind it the round Library of Parliament with its conical roof.
  canada: {
    height: 128,
    draw: (p) => {
      const STONE = '#d6c9a8';
      const COPPER = '#5fa287';
      const DARK = '#467d68';
      p.box(0.1, 0.05, 3.8, 2.3, 3, 3, '#7e7462', { top: '#7aa04c' });
      // Library of Parliament: sixteen-sided hall, flying buttresses, conical copper roof and lantern.
      p.cylinder(2.0, 0.5, 0.38, 6, 16, STONE, 16);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.box(2.0 + Math.cos(a) * 0.43 - 0.04, 0.5 + Math.sin(a) * 0.43 - 0.04, 0.08, 0.08, 6, 14, '#c7b995');
      }
      p.dome(2.0, 0.5, 0.38, 22, 20, COPPER);
      p.cylinder(2.0, 0.5, 0.08, 40, 6, '#e8e0c8');
      p.pyramid(1.92, 0.42, 0.16, 0.16, 46, 8, DARK);
      // Centre Block: long sandstone hall, steep copper roof.
      p.box(0.45, 0.85, 3.1, 1.1, 6, 20, STONE);
      facade(p, 'left', 0.45, 0.85, 3.1, 1.1, 6, 20, { cols: 22, floors: 3, glass: '#36404c', frame: '#ece3cb', bandColor: '#b7aa88', seed: 121 });
      facade(p, 'right', 0.45, 0.85, 3.1, 1.1, 6, 20, { cols: 8, floors: 3, glass: '#36404c', frame: '#ece3cb', bandColor: '#a79a78', seed: 122 });
      p.hipRoof(0.45, 0.85, 3.1, 1.1, 26, 12, 0.03, COPPER);
      // Pinnacles along the front eaves.
      for (let i = 0; i <= 12; i++) {
        const u = 0.5 + i * 0.25;
        p.box(u - 0.03, 1.91, 0.06, 0.06, 26, 4, '#e2d7bb');
        p.pyramid(u - 0.03, 1.91, 0.06, 0.06, 30, 4, DARK);
      }
      // Corner pavilions: taller, with steep pyramid roofs.
      for (const u of [0.35, 3.15]) {
        p.box(u, 0.8, 0.5, 0.5, 6, 25, STONE);
        p.pyramid(u, 0.8, 0.5, 0.5, 31, 14, COPPER);
      }
      for (const u of [0.35, 3.15]) {
        p.box(u, 1.5, 0.5, 0.5, 6, 23, STONE);
        p.pyramid(u, 1.5, 0.5, 0.5, 29, 12, COPPER);
      }
      // Peace Tower: slender shaft, Gothic entrance arch, clock stage with corner turrets, tall copper spire.
      p.box(1.78, 1.85, 0.44, 0.44, 6, 70, STONE);
      p.faceRect('left', 1.78, 1.85, 0.44, 0.44, 6, 70, 0.28, 0.72, 0, 0.2, '#3a332c');
      p.faceRect('left', 1.78, 1.85, 0.44, 0.44, 6, 70, 0.38, 0.62, 0.3, 0.68, '#4a4f58');
      p.faceRect('right', 1.78, 1.85, 0.44, 0.44, 6, 70, 0.38, 0.62, 0.3, 0.68, '#3f444c');
      p.box(1.74, 1.81, 0.52, 0.52, 76, 10, '#e2d7bb');
      p.faceRect('left', 1.74, 1.81, 0.52, 0.52, 76, 10, 0.18, 0.82, 0.1, 0.9, '#f6f1e2');
      p.faceRect('right', 1.74, 1.81, 0.52, 0.52, 76, 10, 0.18, 0.82, 0.1, 0.9, '#eae4d2');
      for (const [u, v] of [[1.74, 1.81], [2.2, 1.81], [1.74, 2.27], [2.2, 2.27]] as const) {
        p.box(u, v, 0.06, 0.06, 86, 4, STONE);
        p.pyramid(u, v, 0.06, 0.06, 90, 5, DARK);
      }
      p.pyramid(1.78, 1.85, 0.44, 0.44, 86, 30, COPPER);
      p.pole(2.0, 2.07, 116, 8, '#d8d8d8');
    },
  },
  // El Capitolio, Havana: a long white-limestone neoclassical hall on a raised terrace, a columned portico up a wide
  // stair in the middle, and the tall drum and dome over it, lantern on top.
  cuba: {
    height: 96,
    draw: (p) => {
      const STONE = '#ece6d6';
      const DOME = '#d9d2bf';
      p.box(0.2, 0.15, 3.6, 1.9, 3, 5, '#cfc8b4');
      // The two wings and the central block.
      p.box(0.3, 0.3, 3.4, 1.5, 8, 16, STONE, { top: '#d9d3c2' });
      facade(p, 'left', 0.3, 0.3, 3.4, 1.5, 8, 16, { cols: 24, floors: 2, glass: '#3a3f46', frame: '#f6f2e8', bandColor: '#c4bca6', seed: 151 });
      facade(p, 'right', 0.3, 0.3, 3.4, 1.5, 8, 16, { cols: 10, floors: 2, glass: '#3a3f46', frame: '#f6f2e8', bandColor: '#b5ad97', seed: 152 });
      // Portico: columns over the stair, a pediment on top.
      p.colonnade('left', 1.45, 1.8, 1.1, 0.3, 8, 16, 6, STONE, '#f4efe2');
      p.box(1.45, 1.8, 1.1, 0.3, 24, 3, STONE);
      p.gableRoofV(1.45, 1.8, 1.1, 0.3, 27, 5, '#f4efe2', '#cfc8b4');
      p.polygon([[1.5, 2.1, 8], [2.5, 2.1, 8], [2.5, 2.4, 3], [1.5, 2.4, 3]], '#e3ddcc');
      // Drum, dome and lantern.
      p.cylinder(2.0, 1.05, 0.55, 24, 22, STONE, 16);
      p.cylinder(2.0, 1.05, 0.5, 46, 4, '#e2dccb');
      p.dome(2.0, 1.05, 0.5, 50, 26, DOME);
      p.cylinder(2.0, 1.05, 0.1, 76, 8, STONE, 6);
      p.dome(2.0, 1.05, 0.1, 84, 4, DOME);
      p.pole(2.0, 1.05, 88, 6, '#c9b46a');
    },
  },
};

/**
 * Capital of a contested nation: its palace filling a 5 × 3 plot (FOOTPRINT_NATION_CAPITAL), with two flagpoles on
 * the front edge — the nation's own flag and the flag of whoever holds it (the neutral globe while nobody does).
 */
export function createNationCapitalArt(nation: ContestedNationId, holder: Allegiance = 'neutral'): BuildingArt {
  const palace = PALACES[nation];
  return {
    footprint: { w: 4, d: ART_D },
    // Authored in 4 × 2.4 units and drawn 1.25× to fill the 5 × 3 plot.
    scale: 5 / 4,
    height: palace.height,
    drawStatic(p) {
      p.box(0, 0, 4, ART_D, 0, 3, PLAZA);
      palace.draw(p);
      p.pole(0.15, 2.25, 3, 34);
      p.pole(3.85, 2.25, 3, 34);
    },
    drawAnimated(p, time) {
      drawTextureFlagOnPole(p, nationFlag(nation), 0.15, 2.25, 37, time, 0.3, 18, 11);
      drawFlagOnPole(p, holder, 3.85, 2.25, 37, time, 1.4, 18, 11);
    },
  };
}
