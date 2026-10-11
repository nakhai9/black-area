import type { ContestedNationId } from '../../constants';
import type { Allegiance } from '../../types';
import { createCanvas, starPath } from '../Canvas';
import { shade } from '../Color';
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
};

const flagTextures = new Map<ContestedNationId, HTMLCanvasElement>();

function nationFlag(nation: ContestedNationId): HTMLCanvasElement {
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

/** Each nation's seat of government, in a 4 × 4 plot. */
const PALACES: Record<ContestedNationId, { height: number; draw: (p: IsoPainter) => void }> = {
  // Kumsusan-style palace: long grey-white hall with a central portal, red banners.
  northKorea: {
    height: 64,
    draw: (p) => {
      const W = '#d6d2c6';
      p.box(0.4, 0.6, 3.2, 2.2, 3, 4, '#9c978a');
      p.box(0.5, 0.7, 3.0, 2.0, 7, 22, W, { top: RA2.roof });
      facade(p, 'left', 0.5, 0.7, 3.0, 2.0, 7, 22, { cols: 18, floors: 3, frame: '#efece4', bandColor: '#b9b4a6', seed: 71 });
      facade(p, 'right', 0.5, 0.7, 3.0, 2.0, 7, 22, { cols: 12, floors: 3, frame: '#efece4', bandColor: '#a9a496', seed: 72 });
      parapet(p, 0.5, 0.7, 3.0, 2.0, 29, '#c9c5b8', 0.06, 2);
      p.box(1.4, 1.2, 1.2, 1.2, 29, 10, W);
      p.faceRect('left', 1.4, 1.2, 1.2, 1.2, 29, 10, 0.2, 0.8, 0.2, 0.9, '#c8302a');
      p.box(1.5, 2.6, 1.0, 0.4, 7, 14, '#b9b4a6');
      p.faceRect('left', 1.5, 2.6, 1.0, 0.4, 7, 14, 0.2, 0.8, 0, 0.8, '#3a3630');
    },
  },
  // Blue House: a traditional hall under a blue-tiled sweeping roof on a stone terrace.
  southKorea: {
    height: 62,
    draw: (p) => {
      p.box(0.4, 0.6, 3.2, 2.3, 3, 5, '#cfc8b6');
      p.box(0.7, 0.9, 2.6, 1.7, 8, 14, '#efe9da');
      p.colonnade('left', 0.7, 0.9, 2.6, 1.7, 8, 14, 10, '#7a2a20', '#efe9da');
      p.colonnade('right', 0.7, 0.9, 2.6, 1.7, 8, 14, 7, '#6a241c', '#e3ddcd');
      p.hipRoof(0.7, 0.9, 2.6, 1.7, 22, 14, 0.22, '#2f5fa8', 3);
      p.topRect(1.5, 2.9, 2.5, 3.9, 3, '#5f8a3a');
    },
  },
  // Kantei (Prime Minister's Office, Tokyo): a glass-and-steel block on a granite podium under a deep, razor-thin
  // overhanging roof, fine vertical louvres over the glass, a glazed entrance hall and stone garden.
  japan: {
    height: 64,
    draw: (p) => {
      const GRANITE = '#9c988e';
      const GLASS = '#4b6878';
      const LOUVRE = '#d9dcd8';
      // Granite podium and forecourt with the stone garden.
      p.box(0.3, 0.5, 3.4, 2.6, 3, 4, GRANITE, { top: '#b4b0a5' });
      p.topRect(0.3, 3.1, 3.7, 3.8, 3, '#c9c5ba');
      for (const [u, v] of [[0.7, 3.4], [1.1, 3.55], [3.2, 3.45]] as const) p.dome(u, v, 0.1, 3, 3, '#7d7a72');
      // Lower floors: recessed glass behind a colonnade of slim steel posts.
      p.box(0.6, 0.8, 2.8, 2.0, 7, 12, GLASS);
      p.colonnade('left', 0.5, 0.7, 3.0, 2.2, 7, 12, 14, '#e6e8e4', GLASS);
      p.colonnade('right', 0.5, 0.7, 3.0, 2.2, 7, 12, 10, '#dadcd8', GLASS);
      // Upper floors: glass box screened by vertical louvres.
      p.box(0.5, 0.7, 3.0, 2.2, 19, 18, GLASS, { top: '#7b8288' });
      for (let i = 0; i < 24; i++) p.faceRect('left', 0.5, 0.7, 3.0, 2.2, 19, 18, i / 24 + 0.012, i / 24 + 0.026, 0, 1, LOUVRE);
      for (let i = 0; i < 18; i++) p.faceRect('right', 0.5, 0.7, 3.0, 2.2, 19, 18, i / 18 + 0.016, i / 18 + 0.034, 0, 1, '#c9ccc8');
      // Floor bands.
      for (const t of [0.33, 0.66]) {
        p.faceRect('left', 0.5, 0.7, 3.0, 2.2, 19, 18, 0, 1, t, t + 0.04, '#eef0ec');
        p.faceRect('right', 0.5, 0.7, 3.0, 2.2, 19, 18, 0, 1, t, t + 0.04, '#dfe1dd');
      }
      // The deep, thin roof slab overhanging all round.
      p.box(0.25, 0.45, 3.5, 2.7, 37, 1.6, '#e9ebe7', { top: '#5a6066' });
      p.box(1.2, 1.2, 1.4, 1.0, 38.6, 3, '#8d9398');
      // Glazed entrance hall with its canopy.
      p.box(1.4, 2.9, 1.0, 0.4, 7, 8, '#6f8c9a');
      p.box(1.3, 2.85, 1.2, 0.6, 15, 1, '#eef0ec');
    },
  },
  // Office of the Prime Minister (The Lodge, Canberra): a white-rendered two-storey Georgian Revival house under
  // a terracotta hipped roof with tall chimneys, a columned front porch, green shutters, a circular drive round a
  // lawn.
  australia: {
    height: 70,
    draw: (p) => {
      const RENDER = '#f3efe6';
      const TILE = '#b5603e';
      p.topRect(0.05, 0.05, 3.95, 3.95, 3, '#7fae52');
      // Circular gravel drive round a lawn in front.
      p.cylinder(2.0, 3.2, 0.7, 3, 0.5, '#d8cfb8');
      p.cylinder(2.0, 3.2, 0.42, 3.5, 0.5, '#6f9f45');
      // The house.
      p.box(0.6, 0.8, 2.8, 1.6, 3, 22, RENDER);
      facade(p, 'left', 0.6, 0.8, 2.8, 1.6, 3, 22, { cols: 9, floors: 2, glass: '#3d4a52', frame: '#ffffff', bandColor: '#e1dccf', seed: 151 });
      facade(p, 'right', 0.6, 0.8, 2.8, 1.6, 3, 22, { cols: 5, floors: 2, glass: '#3d4a52', frame: '#ffffff', bandColor: '#d4cfc2', seed: 152 });
      for (let i = 0; i < 9; i++) {
        const s0 = (i + 0.5) / 9;
        p.faceRect('left', 0.6, 0.8, 2.8, 1.6, 3, 22, s0 - 0.055, s0 - 0.035, 0.12, 0.9, '#3f6a43');
        p.faceRect('left', 0.6, 0.8, 2.8, 1.6, 3, 22, s0 + 0.035, s0 + 0.055, 0.12, 0.9, '#3f6a43');
      }
      p.hipRoof(0.6, 0.8, 2.8, 1.6, 25, 12, 0.12, TILE);
      for (const u of [1.0, 3.0]) {
        p.box(u - 0.1, 1.3, 0.2, 0.3, 30, 12, RENDER);
        p.box(u - 0.12, 1.28, 0.24, 0.34, 42, 1.5, '#d8d2c4');
      }
      // Columned front porch with a small gable.
      p.box(1.6, 2.4, 0.8, 0.45, 3, 1.5, '#e4ded2');
      p.colonnade('left', 1.6, 2.4, 0.8, 0.45, 4.5, 14, 4, '#ffffff', '#3d4a52');
      p.box(1.55, 2.38, 0.9, 0.5, 18.5, 2, '#ffffff');
      p.gableRoofV(1.55, 2.38, 0.9, 0.5, 20.5, 6, '#f6f2ea', TILE);
    },
  },
  // Palácio do Planalto, Brasília: Niemeyer's long glass box between two thin white slabs, ringed by his
  // sail-like marble columns that barely touch the ground, the ramp up to the entrance and the reflecting pool.
  brazil: {
    height: 52,
    draw: (p) => {
      const WHITE = '#f4f2ec';
      const GLASS = '#2e4656';
      // Reflecting pool in front, lawn behind.
      p.topRect(0.1, 0.1, 3.9, 0.6, 3, '#6f9a45');
      p.topRect(0.1, 3.05, 3.9, 3.85, 3, '#3f6f8f');
      // Base slab, glass box, roof slab.
      p.box(0.4, 0.7, 3.2, 2.2, 6, 2, WHITE);
      p.box(0.65, 0.95, 2.7, 1.7, 8, 14, GLASS, { top: '#3a4a56' });
      facade(p, 'left', 0.65, 0.95, 2.7, 1.7, 8, 14, { cols: 20, floors: 2, glass: GLASS, frame: '#9aa8b2', bandColor: '#53646f', seed: 131 });
      facade(p, 'right', 0.65, 0.95, 2.7, 1.7, 8, 14, { cols: 12, floors: 2, glass: GLASS, frame: '#9aa8b2', bandColor: '#46565f', seed: 132 });
      p.box(0.35, 0.65, 3.3, 2.3, 22, 2.5, WHITE, { top: '#e2e0d8' });
      // Sail columns along the two visible sides: wide under the roof, tapering to a point just above the ground.
      const sail = (u: number, v: number, along: 'u' | 'v'): void => {
        const pt = (o: number, z: number): [number, number, number] => (along === 'u' ? [u + o, v, z] : [u, v + o, z]);
        p.polygon([pt(-0.13, 22), pt(0.13, 22), pt(0.04, 12), pt(0, 4), pt(-0.02, 12)], '#ffffff', '#b9b6ad');
      };
      for (let i = 0; i < 7; i++) sail(0.55 + i * 0.48, 2.95, 'u');
      for (let i = 0; i < 5; i++) sail(3.65, 0.8 + i * 0.5, 'v');
      // The ceremonial ramp up to the entrance.
      p.polygon([[1.6, 2.95, 6], [2.4, 2.95, 6], [2.4, 3.8, 3], [1.6, 3.8, 3]], '#e8e6e0');
      p.box(1.6, 2.95, 0.04, 0.85, 6, 1.5, '#d6d3ca');
      p.box(2.36, 2.95, 0.04, 0.85, 6, 1.5, '#d6d3ca');
    },
  },
  // 10 Downing Street: a plain Georgian terrace of soot-black brick, white sash windows, the famous black door
  // with its white "10" under a fanlight, black railings and a row of chimney stacks on a slate roof.
  unitedKingdom: {
    height: 66,
    draw: (p) => {
      const BRICK = '#2b2a28';
      // Street paving and pavement in front.
      p.topRect(0.2, 2.75, 3.8, 3.8, 3, '#55585a');
      p.topRect(0.2, 2.6, 3.8, 2.85, 3.5, '#8d8a82');
      // The terrace: Nos 10, 11 and 12 joined in one row.
      p.box(0.4, 0.8, 3.2, 1.8, 3, 26, BRICK);
      facade(p, 'left', 0.4, 0.8, 3.2, 1.8, 3, 26, { cols: 9, floors: 3, glass: '#3b4650', frame: '#f2f0ea', bandColor: '#1e1d1b', seed: 111 });
      facade(p, 'right', 0.4, 0.8, 3.2, 1.8, 3, 26, { cols: 5, floors: 3, glass: '#3b4650', frame: '#f2f0ea', bandColor: '#181715', seed: 112 });
      // White cornice and the grey slate mansard roof.
      p.box(0.35, 0.75, 3.3, 1.9, 29, 1.5, '#e8e5dc');
      p.hipRoof(0.4, 0.8, 3.2, 1.8, 30.5, 9, 0.02, '#4a4f55');
      // Chimney stacks with terracotta pots.
      for (const u of [0.7, 1.6, 2.5, 3.3]) {
        p.box(u, 1.5, 0.22, 0.4, 30, 16, BRICK);
        p.cylinder(u + 0.11, 1.6, 0.04, 46, 3, '#a4553a');
        p.cylinder(u + 0.11, 1.8, 0.04, 46, 3, '#a4553a');
      }
      // The black front door of No 10: white "10", fanlight above, white door case and step.
      p.box(1.55, 2.58, 0.5, 0.06, 3, 1.5, '#d8d5cc');
      p.faceRect('left', 0.4, 0.8, 3.2, 1.8, 3, 26, 0.36, 0.44, 0, 0.42, '#f2f0ea');
      p.faceRect('left', 0.4, 0.8, 3.2, 1.8, 3, 26, 0.37, 0.43, 0.02, 0.33, '#0d0d0f');
      p.faceRect('left', 0.4, 0.8, 3.2, 1.8, 3, 26, 0.37, 0.43, 0.34, 0.41, '#e9d27a');
      p.faceRect('left', 0.4, 0.8, 3.2, 1.8, 3, 26, 0.392, 0.408, 0.2, 0.25, '#ffffff');
      // Black iron railings along the front, a lamp over the door.
      for (let i = 0; i <= 14; i++) p.pole(0.45 + i * 0.22, 2.68, 3.5, 5, '#111111');
      p.pole(1.8, 2.66, 3, 15, '#111111');
      p.box(1.76, 2.62, 0.08, 0.08, 18, 3, '#f4e7b0');
    },
  },
  // Parliament Hill, Ottawa: the Gothic Revival Centre Block in pale sandstone under steep green copper roofs, a row
  // of pinnacles along its eaves, the slender Peace Tower rising from the front with its clock stage and tall
  // copper spire, and behind it the round Library of Parliament with its conical roof, above the Ottawa River.
  canada: {
    height: 128,
    draw: (p) => {
      const STONE = '#d6c9a8';
      const COPPER = '#5fa287';
      const DARK = '#467d68';
      // The hill above the river: lawn, with the paved walk to the tower.
      p.topRect(0.1, 0.1, 3.9, 0.55, 3, '#4d6a78');
      p.box(0.25, 0.55, 3.5, 3.2, 3, 3, '#7e7462', { top: '#7aa04c' });
      p.topRect(1.8, 2.6, 2.2, 3.75, 6, '#c9c1ad');
      // Library of Parliament: sixteen-sided hall, flying buttresses, conical copper roof and lantern.
      p.cylinder(2.0, 0.95, 0.42, 6, 16, STONE, 16);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        p.box(2.0 + Math.cos(a) * 0.48 - 0.04, 0.95 + Math.sin(a) * 0.48 - 0.04, 0.08, 0.08, 6, 14, '#c7b995');
      }
      p.dome(2.0, 0.95, 0.42, 22, 20, COPPER);
      p.cylinder(2.0, 0.95, 0.08, 40, 6, '#e8e0c8');
      p.pyramid(1.92, 0.87, 0.16, 0.16, 46, 8, DARK);
      // Centre Block: long sandstone hall, steep copper roof.
      p.box(0.45, 1.35, 3.1, 1.25, 6, 20, STONE);
      facade(p, 'left', 0.45, 1.35, 3.1, 1.25, 6, 20, { cols: 22, floors: 3, glass: '#36404c', frame: '#ece3cb', bandColor: '#b7aa88', seed: 121 });
      facade(p, 'right', 0.45, 1.35, 3.1, 1.25, 6, 20, { cols: 9, floors: 3, glass: '#36404c', frame: '#ece3cb', bandColor: '#a79a78', seed: 122 });
      p.hipRoof(0.45, 1.35, 3.1, 1.25, 26, 12, 0.03, COPPER);
      // Pinnacles along the front eaves.
      for (let i = 0; i <= 12; i++) {
        const u = 0.5 + i * 0.25;
        p.box(u - 0.03, 2.56, 0.06, 0.06, 26, 4, '#e2d7bb');
        p.pyramid(u - 0.03, 2.56, 0.06, 0.06, 30, 4, DARK);
      }
      // Corner pavilions: taller, with steep pyramid roofs.
      for (const u of [0.35, 3.15]) {
        p.box(u, 1.3, 0.5, 0.5, 6, 25, STONE);
        p.pyramid(u, 1.3, 0.5, 0.5, 31, 14, COPPER);
      }
      for (const u of [0.35, 3.15]) {
        p.box(u, 2.15, 0.5, 0.5, 6, 23, STONE);
        p.pyramid(u, 2.15, 0.5, 0.5, 29, 12, COPPER);
      }
      // Peace Tower: slender shaft, Gothic entrance arch, clock stage with corner turrets, tall copper spire.
      p.box(1.78, 2.35, 0.44, 0.44, 6, 70, STONE);
      p.faceRect('left', 1.78, 2.35, 0.44, 0.44, 6, 70, 0.28, 0.72, 0, 0.2, '#3a332c');
      p.faceRect('left', 1.78, 2.35, 0.44, 0.44, 6, 70, 0.38, 0.62, 0.3, 0.68, '#4a4f58');
      p.faceRect('right', 1.78, 2.35, 0.44, 0.44, 6, 70, 0.38, 0.62, 0.3, 0.68, '#3f444c');
      p.box(1.74, 2.31, 0.52, 0.52, 76, 10, '#e2d7bb');
      p.faceRect('left', 1.74, 2.31, 0.52, 0.52, 76, 10, 0.18, 0.82, 0.1, 0.9, '#f6f1e2');
      p.faceRect('right', 1.74, 2.31, 0.52, 0.52, 76, 10, 0.18, 0.82, 0.1, 0.9, '#eae4d2');
      for (const [u, v] of [[1.74, 2.31], [2.2, 2.31], [1.74, 2.77], [2.2, 2.77]] as const) {
        p.box(u, v, 0.06, 0.06, 86, 4, STONE);
        p.pyramid(u, v, 0.06, 0.06, 90, 5, DARK);
      }
      p.pyramid(1.78, 2.35, 0.44, 0.44, 86, 30, COPPER);
      p.pole(2.0, 2.57, 116, 8, '#d8d8d8');
    },
  },
};

/**
 * Capital of a contested nation: its palace on a paved plaza, with two flagpoles in front — the nation's own flag
 * and the flag of whoever holds it (the neutral globe while nobody does).
 */
export function createNationCapitalArt(nation: ContestedNationId, holder: Allegiance = 'neutral'): BuildingArt {
  const palace = PALACES[nation];
  return {
    footprint: { w: 4, d: 4 },
    height: palace.height,
    drawStatic(p) {
      p.box(0, 0, 4, 4, 0, 3, PLAZA);
      p.topRect(0.15, 3.1, 3.85, 3.9, 3, shade(PLAZA, 1.08));
      palace.draw(p);
      p.pole(0.35, 3.6, 3, 34);
      p.pole(3.65, 3.6, 3, 34);
    },
    drawAnimated(p, time) {
      drawTextureFlagOnPole(p, nationFlag(nation), 0.35, 3.6, 37, time, 0.3, 18, 11);
      drawFlagOnPole(p, holder, 3.65, 3.6, 37, time, 1.4, 18, 11);
    },
  };
}
