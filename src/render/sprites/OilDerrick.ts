import { HALF_TW } from '../../constants';
import type { FactionColors } from '../../types';
import { shade } from '../Color';
import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { RA2, crate } from './Ra2Kit';

const CONCRETE = RA2.concrete;
const RUST = '#8b5a2b';
const DARK = '#3a3631';

/** Walking-beam geometry in local art space (beam runs along +u at v = 1). */
const V = 1.0;
const PIVOT = { u: 1.05, z: 42 } as const;
const CRANK = { u: 0.62, z: 17 } as const;
const WELL = { u: 1.88, z: 13 } as const;
const REAR = 0.55; // tiles behind the pivot
const FRONT = 0.78; // tiles in front of the pivot
const CRANK_R = 7; // px

/** Treat 1 tile along u as HALF_TW px so the beam rotates in a square plane. */
const beamEnd = (len: number, angle: number): { u: number; z: number } => ({
  u: PIVOT.u + len * Math.cos(angle),
  z: PIVOT.z + len * HALF_TW * Math.sin(angle),
});

function line(p: IsoPainter, a: [number, number, number], b: [number, number, number], color: string, width: number): void {
  const [ax, ay] = p.project(a[0], a[1], a[2]);
  const [bx, by] = p.project(b[0], b[1], b[2]);
  const { ctx } = p;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

/** Samson post: an A-frame of four legs with cross bracing and a ladder. */
function samsonPost(p: IsoPainter, v: number, steel: string): void {
  const top: [number, number, number] = [PIVOT.u, V, PIVOT.z - 2];
  line(p, [0.82, v, 6], top, steel, 1.8);
  line(p, [1.3, v, 6], top, steel, 1.8);
  line(p, [0.88, v, 18], [1.24, v, 18], steel, 1);
  line(p, [0.94, v, 30], [1.17, v, 30], steel, 1);
  line(p, [0.88, v, 18], [1.17, v, 30], steel, 0.8);
}

/**
 * Oil derrick (pumpjack) — the nation's source of TB, painted in its team
 * colour (A-frame, walking beam, railings, pad stripe). The static sprite holds
 * the pad, motor, tank and A-frame; the walking beam, horsehead, pitman arms
 * and counterweighted crank are animated every frame.
 */
export function createOilDerrickArt(team: FactionColors): BuildingArt {
  const STEEL = shade(team.primary, 0.75);
  const BEAM = team.primary;
  const RAIL = team.light;
  return {
  footprint: { w: 2, d: 2 },
  // Authored in 2 × 2 units, drawn 2× to fill its 4 × 4 plot (FOOTPRINT_SMALL) edge to edge.
  scale: 2,
  height: 70,

  drawStatic(p) {
    p.box(0, 0, 2, 2, 0, 3, CONCRETE);
    p.topRect(0.08, 0.08, 1.92, 1.92, 3, 'rgba(60,50,30,0.18)');
    // Oil spill round the wellhead and a steel grating deck under the pumpjack.
    p.topRect(1.65, 0.8, 2.0, 1.25, 3.05, 'rgba(20,16,10,0.45)');
    p.topRect(0.7, 0.68, 1.45, 1.32, 3.05, RA2.steelDark);
    for (let k = 0; k < 6; k++) p.topRect(0.7 + k * 0.125, 0.68, 0.72 + k * 0.125, 1.32, 3.1, '#3a3e44');

    // Storage tank (back-left) and motor/gearbox (rear).
    for (const u of [0.42, 1.58]) {
      p.cylinder(u, 0.42, 0.2, 3, 16, '#a8a294', 6);
      p.cylinder(u, 0.42, 0.205, 7, 1, shade(team.primary, 0.8));
      p.cylinder(u, 0.42, 0.205, 15, 1.2, '#5a5850');
    }
    p.box(0.42, 0.4, 1.16, 0.05, 9, 1, '#5a5d60'); // pipe between the tanks
    crate(p, 0.12, 1.5, 0.2, 3);
    crate(p, 0.35, 1.62, 0.16, 3);
    p.box(0.22, 0.72, 0.3, 0.56, 3, 9, '#6b6f73');
    p.box(0.5, 0.8, 0.26, 0.4, 3, 13, '#7f6a4f');
    p.box(0.3, 0.9, 1.55, 0.2, 3, 3, '#5d5a52');

    // Team-colour hazard stripe along the front of the pad.
    p.faceRect('left', 0, 0, 2, 2, 0, 3, 0, 1, 0.15, 0.85, shade(team.primary, 0.8));
    p.faceRect('right', 0, 0, 2, 2, 0, 3, 0, 1, 0.15, 0.85, team.primary);
    for (let k = 0; k < 10; k += 2) {
      p.faceRect('left', 0, 0, 2, 2, 0, 3, k / 10, (k + 1) / 10, 0.15, 0.85, RA2.hazard);
      p.faceRect('right', 0, 0, 2, 2, 0, 3, (k + 1) / 10, (k + 2) / 10, 0.15, 0.85, shade(RA2.hazard, 0.85));
    }

    samsonPost(p, 0.78, shade(STEEL, 0.85));
    samsonPost(p, 1.22, STEEL);
    // Ladder up the front.
    line(p, [1.32, 1.24, 4], [1.12, 1.06, 38], RAIL, 0.6);
    for (let z = 8; z < 38; z += 5) line(p, [1.32 - (z / 38) * 0.18, 1.24 - (z / 38) * 0.17, z], [1.36 - (z / 38) * 0.18, 1.28 - (z / 38) * 0.17, z], RAIL, 0.5);

    // Wellhead with valves.
    p.cylinder(WELL.u, V, 0.045, 3, WELL.z - 3, '#55585c');
    p.box(WELL.u - 0.12, V - 0.04, 0.24, 0.08, 7, 2, '#c43d2d');

    // Safety railing posts.
    for (const [u, v] of [
      [0.15, 1.85],
      [0.85, 1.85],
      [1.85, 1.85],
      [1.85, 0.15],
    ] as const) {
      line(p, [u, v, 3], [u, v, 11], RAIL, 0.8);
    }
    line(p, [0.15, 1.85, 10], [1.85, 1.85, 10], RAIL, 0.7);
    line(p, [1.85, 1.85, 10], [1.85, 0.15, 10], RAIL, 0.7);
  },

  drawAnimated(p, time, active) {
    // Resting field: the beam stops and a red lamp lights up on the motor housing.
    const [lx, ly] = p.project(0.62, 1.05, 16);
    p.ctx.fillStyle = active ? '#5cff6a' : '#ff4a3a';
    p.ctx.beginPath();
    p.ctx.arc(lx, ly, 1.1, 0, Math.PI * 2);
    p.ctx.fill();
    const theta = active ? time * 2.2 : 0.9;
    const tilt = Math.sin(theta) * 0.22;
    const rear = beamEnd(-REAR, tilt);
    const front = beamEnd(FRONT, tilt);
    const pin = { u: CRANK.u + (Math.cos(theta) * CRANK_R) / HALF_TW, z: CRANK.z + Math.sin(theta) * CRANK_R };

    // Counterweighted crank.
    const { ctx } = p;
    const [cx, cy] = p.project(CRANK.u, V + 0.25, CRANK.z);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-theta);
    ctx.fillStyle = RUST;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-2, -2.5);
    ctx.lineTo(9, -5);
    ctx.quadraticCurveTo(11, 0, 9, 5);
    ctx.lineTo(-2, 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = DARK;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Pitman arms (crank pin → beam tail), beam, horsehead, bridle.
    line(p, [pin.u, V + 0.25, pin.z], [rear.u, V, rear.z], '#6d6a62', 1.1);
    line(p, [rear.u, V, rear.z], [front.u, V, front.z], DARK, 3.6);
    line(p, [rear.u, V, rear.z], [front.u, V, front.z], BEAM, 2.4);
    line(p, [rear.u, V, rear.z], [rear.u, V, rear.z - 4], RUST, 3);

    const [hx, hy] = p.project(front.u, V, front.z);
    ctx.fillStyle = BEAM;
    ctx.strokeStyle = DARK;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy - 4);
    ctx.quadraticCurveTo(hx + 7, hy - 2, hx + 4, hy + 8);
    ctx.lineTo(hx + 1, hy + 8);
    ctx.quadraticCurveTo(hx + 3, hy, hx - 2, hy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const [wx, wy] = p.project(WELL.u, V, WELL.z);
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(hx + 3, hy + 8);
    ctx.lineTo(wx, wy);
    ctx.stroke();
  },
  };
}
