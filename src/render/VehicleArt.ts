import { drawAircraftPortrait } from './AircraftSheets';
import { CRUISE_ALTITUDE } from '../constants';
import { FACTIONS } from '../factions';
import type { FactionId, VehicleKind } from '../types';
import { createCanvas } from './Canvas';
import { shade } from './Color';

export interface VehiclePose {
  /** World position where the vehicle touches the ground. */
  x: number;
  y: number;
  /** Direction of travel in radians (0 = towards the right of the screen). */
  heading: number;
  /** Track / wheel animation phase. */
  phase: number;
  moving: boolean;
  /** Height above the ground (aircraft only; default = cruise height). */
  altitude?: number;
}

/** Isometric ground plane (2:1): shapes drawn in the ground plane are squashed vertically. */
export const SQUASH = 0.5;
const DARK = '#1f2124';

const BODY: Record<FactionId, string> = {
  usa: '#c2a66b', // desert tan
  russia: '#2e3d36', // dark green
  china: '#5b6a3a', // moss green
  europe: '#6a7884', // blue-grey
};

type Ctx = CanvasRenderingContext2D;

/** Runs `draw` in the vehicle's local ground plane (+x forward), `lift` px above the ground. */
function plane(ctx: Ctx, pose: VehiclePose, lift: number, squash: number, draw: () => void): void {
  ctx.save();
  ctx.translate(pose.x, pose.y - lift);
  ctx.scale(1, squash);
  ctx.rotate(pose.heading);
  draw();
  ctx.restore();
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Solid body: stacked copies give the side walls, the last copy is the lit top. */
function extrude(ctx: Ctx, pose: VehiclePose, height: number, color: string, shape: () => void): void {
  for (let l = 0; l < height; l += 0.35) {
    plane(ctx, pose, l, SQUASH, () => {
      ctx.fillStyle = shade(color, 0.55);
      shape();
      ctx.fill();
    });
  }
  plane(ctx, pose, height, SQUASH, () => {
    ctx.fillStyle = color;
    shape();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.18;
    ctx.stroke();
  });
}

function tracks(ctx: Ctx, pose: VehiclePose, length: number, half: number): void {
  for (const side of [-1, 1]) {
    extrude(ctx, pose, 0.9, '#2a2c30', () => rrect(ctx, -length / 2, side * half - 0.5, length, 1, 0.4));
    plane(ctx, pose, 0.9, SQUASH, () => {
      ctx.strokeStyle = '#4b4e54';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      const off = pose.moving ? pose.phase % 0.8 : 0;
      for (let x = -length / 2 + off; x < length / 2; x += 0.8) {
        ctx.moveTo(x, side * half - 0.5);
        ctx.lineTo(x, side * half + 0.5);
      }
      ctx.stroke();
    });
  }
}

function shadow(ctx: Ctx, pose: VehiclePose, rx: number, ry: number, dx = 0.4, dy = 0.5): void {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(pose.x + dx, pose.y + dy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function tank(ctx: Ctx, pose: VehiclePose, body: string, team: string): void {
  shadow(ctx, pose, 4.4, 2.2);
  tracks(ctx, pose, 6.6, 1.95);
  extrude(ctx, pose, 1.5, body, () => rrect(ctx, -3, -1.55, 6, 3.1, 0.5));
  // Turret, team stripe and the long gun.
  plane(ctx, pose, 1.5, SQUASH, () => {
    ctx.fillStyle = shade(body, 0.8);
    ctx.fillRect(1.0, -0.25, 3.6, 0.5);
  });
  extrude(ctx, pose, 2.4, shade(body, 1.08), () => {
    ctx.beginPath();
    ctx.ellipse(-0.3, 0, 1.55, 1.25, 0, 0, Math.PI * 2);
  });
  plane(ctx, pose, 2.4, SQUASH, () => {
    ctx.fillStyle = team;
    ctx.fillRect(-1.2, -0.3, 1.3, 0.6);
    ctx.fillStyle = DARK;
    ctx.fillRect(1.1, -0.28, 3.6, 0.56);
    ctx.fillStyle = shade(body, 0.7);
    ctx.fillRect(-0.9, 0.5, 0.7, 0.5);
  });
}

function ifv(ctx: Ctx, pose: VehiclePose, body: string, team: string): void {
  shadow(ctx, pose, 4.1, 2.1);
  tracks(ctx, pose, 6.0, 1.8);
  extrude(ctx, pose, 1.7, body, () => {
    ctx.beginPath();
    ctx.moveTo(-2.8, -1.45);
    ctx.lineTo(1.9, -1.45);
    ctx.lineTo(2.8, -0.8);
    ctx.lineTo(2.8, 0.8);
    ctx.lineTo(1.9, 1.45);
    ctx.lineTo(-2.8, 1.45);
    ctx.closePath();
  });
  plane(ctx, pose, 1.7, SQUASH, () => {
    ctx.fillStyle = shade(body, 0.75);
    ctx.fillRect(-2.4, -0.55, 1.3, 1.1);
    ctx.fillStyle = DARK;
    ctx.fillRect(0.6, -0.16, 2.6, 0.32);
  });
  extrude(ctx, pose, 2.5, shade(body, 1.1), () => {
    ctx.beginPath();
    ctx.ellipse(0.2, 0, 1.0, 0.95, 0, 0, Math.PI * 2);
  });
  plane(ctx, pose, 2.5, SQUASH, () => {
    ctx.fillStyle = team;
    ctx.fillRect(-0.4, -0.25, 0.8, 0.5);
  });
}

function light(ctx: Ctx, pose: VehiclePose, body: string, team: string): void {
  shadow(ctx, pose, 3.1, 1.7);
  // Wheels first, then a low body, cabin and a small mounted gun.
  for (const x of [-1.5, 1.5]) {
    for (const side of [-1, 1]) {
      extrude(ctx, pose, 0.9, '#1c1d20', () => rrect(ctx, x - 0.55, side * 1.1 - 0.35, 1.1, 0.7, 0.25));
    }
  }
  extrude(ctx, pose, 1.2, body, () => rrect(ctx, -2.2, -1.05, 4.4, 2.1, 0.5));
  extrude(ctx, pose, 2.1, shade(body, 1.12), () => rrect(ctx, -0.7, -0.85, 1.7, 1.7, 0.35));
  plane(ctx, pose, 2.1, SQUASH, () => {
    ctx.fillStyle = '#486b82';
    ctx.fillRect(0.55, -0.7, 0.4, 1.4);
    ctx.fillStyle = team;
    ctx.fillRect(-2.0, -0.2, 1.1, 0.4);
    ctx.fillStyle = DARK;
    ctx.fillRect(-1.6, 0.35, 1.5, 0.22);
  });
}

// ------------------------------------------------------------------ aircraft (3D)

type P3 = readonly [number, number, number];

/** Local aircraft point (x forward, y right wing, z up) → screen, in the same isometric plane as the ground vehicles. */
function proj(pose: VehiclePose, [lx, ly, z]: P3): { x: number; y: number } {
  const c = Math.cos(pose.heading);
  const s = Math.sin(pose.heading);
  return { x: pose.x + lx * c - ly * s, y: pose.y + (lx * s + ly * c) * SQUASH - z };
}

/** A flat 3D polygon (fins, canopies…), lit by how much it faces the viewer. */
function poly3(ctx: Ctx, pose: VehiclePose, pts: readonly P3[], fill: string, stroke = 'rgba(0,0,0,0.4)'): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const q = proj(pose, p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 0.14;
  ctx.stroke();
}

/** Solid body floating at `base` px: dark stacked side walls, lit top, like `extrude` for ground vehicles. */
function slab(ctx: Ctx, pose: VehiclePose, base: number, height: number, color: string, shape: () => void): void {
  for (let l = 0; l < height; l += 0.3) {
    plane(ctx, pose, base + l, SQUASH, () => {
      ctx.fillStyle = shade(color, 0.5 + 0.25 * (l / Math.max(height, 0.01)));
      shape();
      ctx.fill();
    });
  }
  plane(ctx, pose, base + height, SQUASH, () => {
    ctx.fillStyle = color;
    shape();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.15;
    ctx.stroke();
  });
}

/** Vertical fin(s): the one farther from the camera (smaller screen y) is drawn first. */
function fins(ctx: Ctx, pose: VehiclePose, list: readonly (readonly P3[])[], color: string): void {
  const depth = (f: readonly P3[]): number => f.reduce((a, p) => a + proj(pose, [p[0], p[1], 0]).y, 0) / f.length;
  for (const f of [...list].sort((a, b) => depth(a) - depth(b))) {
    // A fin seen edge-on is darker than one seen broadside.
    const side = Math.abs(Math.sin(pose.heading));
    poly3(ctx, pose, f, shade(color, 0.7 + 0.35 * side));
  }
}

/** Ground shadow shaped like the aircraft's silhouette, drifting away from it with height. */
function airShadow(ctx: Ctx, pose: VehiclePose, lift: number, shape: () => void): void {
  const k = lift / 7;
  ctx.save();
  ctx.globalAlpha = Math.max(0.12, 0.34 - 0.1 * k);
  plane(ctx, { ...pose, x: pose.x + 0.6 + 1.0 * k, y: pose.y + 0.6 + 2.0 * k }, 0, SQUASH, () => {
    ctx.fillStyle = '#000';
    shape();
    ctx.fill();
  });
  ctx.restore();
}

type P2 = readonly [number, number];

/** Top-view outline of one national fighter design (local units: +x forward, +y right wing; mirrored). */
interface JetDesign {
  /** Right half of the wing planform (mirrored to the left). */
  wing: readonly P2[];
  /** Right half of the fuselage outline, nose first (mirrored). */
  hull: readonly P2[];
  /** Optional foreplane canards (right half, mirrored). */
  canard?: readonly P2[];
  /** Vertical fins: lateral offset (0 = single centre fin), outward cant, height, root start/end x. */
  fins: readonly { y: number; cant: number; h: number; x0: number; x1: number }[];
  /** Engine nozzle lateral offsets. */
  nozzles: readonly number[];
  /** Canopy centre x and half length. */
  canopy: readonly [number, number];
  /** Darker radome on the nose. */
  radome?: string;
  /** Team marks on the upper wing (x, y, w, h — right side, mirrored). */
  marks: readonly (readonly [number, number, number, number])[];
}

const JETS: Record<FactionId, JetDesign> = {
  // F-16: cropped delta, single fin, single engine, bubble canopy far forward.
  usa: {
    wing: [[1.2, 0.55], [-1.6, 3.5], [-2.3, 3.5], [-2.2, 0.7], [-3.1, 0.6], [-4.0, 1.9], [-4.4, 1.9], [-4.2, 0.35]],
    hull: [[4.8, 0], [3.4, 0.35], [1.8, 0.55], [-3.6, 0.55], [-4.5, 0.32]],
    fins: [{ y: 0, cant: 0, h: 2.0, x0: -2.4, x1: -4.3 }],
    nozzles: [0],
    canopy: [2.6, 1.0],
    marks: [[-2.0, 2.4, 0.7, 0.6], [-4.0, 1.2, 0.6, 0.4]],
  },
  // Su-27: big swept wing with long LERX, twin engines spaced apart, twin fins on tail booms, tail sting.
  russia: {
    wing: [[2.8, 0.45], [0.6, 1.1], [-1.4, 3.9], [-2.2, 3.9], [-2.0, 1.25], [-3.3, 1.2], [-4.3, 2.4], [-4.8, 2.3], [-4.4, 0.25]],
    hull: [[5.0, 0], [3.8, 0.4], [2.6, 0.5], [0.6, 1.2], [-3.9, 1.15], [-4.3, 0.95], [-4.4, 0.25], [-5.1, 0.12]],
    fins: [{ y: 1.05, cant: 0.15, h: 1.9, x0: -2.4, x1: -4.0 }],
    nozzles: [0.75, -0.75],
    canopy: [2.8, 0.9],
    marks: [[-1.9, 3.0, 0.6, 0.6], [-4.1, 1.6, 0.5, 0.4]],
  },
  // J-11: Flanker family, but grey radome, clipped wing tips and fins canted further out.
  china: {
    wing: [[2.6, 0.45], [0.4, 1.1], [-1.5, 3.6], [-2.3, 3.6], [-2.1, 1.2], [-3.3, 1.15], [-4.2, 2.3], [-4.7, 2.2], [-4.3, 0.25]],
    hull: [[5.0, 0], [3.7, 0.42], [2.4, 0.5], [0.4, 1.15], [-3.9, 1.1], [-4.3, 0.9], [-4.4, 0.25], [-4.8, 0.15]],
    fins: [{ y: 1.0, cant: 0.4, h: 1.8, x0: -2.3, x1: -3.9 }],
    nozzles: [0.72, -0.72],
    canopy: [2.7, 0.85],
    radome: '#b9bec4',
    marks: [[-1.8, 2.7, 0.7, 0.6], [-4.0, 1.5, 0.5, 0.4]],
  },
  // Typhoon: delta wing set far back, foreplane canards, single fin, twin engines close together.
  europe: {
    wing: [[0.2, 0.6], [-3.0, 3.7], [-3.7, 3.7], [-4.2, 3.2], [-4.2, 0.6]],
    hull: [[4.9, 0], [3.6, 0.38], [2.2, 0.6], [-3.9, 0.7], [-4.5, 0.45]],
    canard: [[2.4, 0.5], [1.6, 1.6], [1.2, 1.6], [1.3, 0.55]],
    fins: [{ y: 0, cant: 0, h: 2.2, x0: -2.0, x1: -4.2 }],
    nozzles: [0.3, -0.3],
    canopy: [2.9, 0.95],
    marks: [[-3.2, 2.6, 0.6, 0.6], [-3.6, 1.2, 0.5, 0.5]],
  },
};

/** Traces a mirrored outline: the right half as given, then the left half back. */
function mirrored(ctx: Ctx, half: readonly P2[]): void {
  ctx.beginPath();
  half.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  for (let i = half.length - 1; i >= 0; i--) ctx.lineTo(half[i][0], -half[i][1]);
  ctx.closePath();
}

function jet(ctx: Ctx, pose: VehiclePose, body: string, team: string, d: JetDesign): void {
  // Parked, the belly rests on its landing gear instead of sinking into the ground.
  const lift = Math.max(0.7, pose.altitude ?? CRUISE_ALTITUDE);
  const wingShape = (): void => mirrored(ctx, d.wing);
  const hull = (): void => mirrored(ctx, d.hull);
  const canard = d.canard;
  airShadow(ctx, pose, lift, () => {
    wingShape();
    ctx.fill();
    if (canard) {
      mirrored(ctx, canard);
      ctx.fill();
    }
    hull();
  });
  // Belly, wings (+ canards), team marks & wingtip missiles, upper fuselage, radome, canopy, fins, exhaust.
  slab(ctx, pose, lift - 0.5, 0.5, shade(body, 0.85), hull);
  slab(ctx, pose, lift, 0.25, body, wingShape);
  if (canard) slab(ctx, pose, lift + 0.3, 0.15, shade(body, 0.95), () => mirrored(ctx, canard));
  plane(ctx, pose, lift + 0.25, SQUASH, () => {
    ctx.fillStyle = team;
    for (const [x, y, w, h] of d.marks) {
      ctx.fillRect(x, y - h, w, h);
      ctx.fillRect(x, -y, w, h);
    }
    const tip = d.wing.reduce((a, p) => (p[1] > a[1] ? p : a));
    ctx.fillStyle = '#e8e8e2';
    for (const sy of [1, -1]) ctx.fillRect(tip[0] - 1.1, sy * tip[1] - 0.12, 1.6, 0.24);
  });
  slab(ctx, pose, lift + 0.25, 0.55, shade(body, 1.08), hull);
  if (d.radome) {
    const nose = d.hull[0][0];
    slab(ctx, pose, lift + 0.25, 0.5, d.radome, () => {
      ctx.beginPath();
      ctx.moveTo(nose, 0);
      ctx.lineTo(nose - 1.1, 0.36);
      ctx.lineTo(nose - 1.1, -0.36);
      ctx.closePath();
    });
  }
  const [cx, cl] = d.canopy;
  slab(ctx, pose, lift + 0.8, 0.35, '#2c4560', () => {
    ctx.beginPath();
    ctx.ellipse(cx, 0, cl, 0.34, 0, 0, Math.PI * 2);
  });
  plane(ctx, pose, lift + 1.15, SQUASH, () => {
    ctx.fillStyle = 'rgba(200,230,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx + 0.3, -0.1, cl * 0.4, 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const top = lift + 0.8;
  const finList: P3[][] = [];
  for (const f of d.fins) {
    for (const side of f.y === 0 ? [1] : [1, -1]) {
      const y = f.y * side;
      const out = f.cant * side * f.h;
      finList.push([
        [f.x0, y, top],
        [f.x1, y, top],
        [f.x1 - 0.3, y + out, top + f.h],
        [f.x1 + 0.6, y + out, top + f.h],
      ]);
    }
  }
  fins(ctx, pose, finList, body);
  // Afterburners: flicker while flying, one per engine.
  if ((pose.altitude ?? CRUISE_ALTITUDE) > 0.5 || pose.moving) {
    const back = Math.min(...d.hull.map((p) => p[0])) - 0.2;
    const flick = 0.7 + 0.3 * Math.sin(pose.phase * 3.1);
    const r = (d.nozzles.length > 1 ? 0.95 : 1.3) * flick;
    for (const ny of d.nozzles) {
      const tail = proj(pose, [back, ny, lift + 0.15]);
      const g = ctx.createRadialGradient(tail.x, tail.y, 0, tail.x, tail.y, r);
      g.addColorStop(0, 'rgba(255,240,190,0.95)');
      g.addColorStop(0.5, 'rgba(255,150,60,0.7)');
      g.addColorStop(1, 'rgba(255,90,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(tail.x, tail.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function transport(ctx: Ctx, pose: VehiclePose, body: string, team: string): void {
  const lift = pose.altitude ?? CRUISE_ALTITUDE;
  const hull = (): void => {
    ctx.beginPath();
    ctx.moveTo(5.0, 0);
    ctx.quadraticCurveTo(4.8, 1.2, 3.6, 1.2);
    ctx.lineTo(-3.8, 1.2);
    ctx.lineTo(-6.2, 0.45);
    ctx.lineTo(-6.2, -0.45);
    ctx.lineTo(-3.8, -1.2);
    ctx.lineTo(3.6, -1.2);
    ctx.quadraticCurveTo(4.8, -1.2, 5.0, 0);
    ctx.closePath();
  };
  const wing = (): void => {
    ctx.beginPath();
    ctx.moveTo(0.7, 1.0);
    ctx.lineTo(-0.5, 5.6);
    ctx.lineTo(-1.8, 5.6);
    ctx.lineTo(-1.7, 1.0);
    ctx.lineTo(-1.7, -1.0);
    ctx.lineTo(-1.8, -5.6);
    ctx.lineTo(-0.5, -5.6);
    ctx.lineTo(0.7, -1.0);
    ctx.closePath();
  };
  const tailplane = (): void => {
    ctx.beginPath();
    ctx.moveTo(-4.9, 0.4);
    ctx.lineTo(-5.6, 2.6);
    ctx.lineTo(-6.4, 2.6);
    ctx.lineTo(-6.2, 0.4);
    ctx.lineTo(-6.2, -0.4);
    ctx.lineTo(-6.4, -2.6);
    ctx.lineTo(-5.6, -2.6);
    ctx.lineTo(-4.9, -0.4);
    ctx.closePath();
  };
  airShadow(ctx, pose, lift, () => {
    hull();
    ctx.fill();
    wing();
    ctx.fill();
    tailplane();
  });
  // On the ground it rests on its belly: the body starts at the ground, not below it.
  const belly = Math.max(0, lift - 1.0);
  const roof = belly + 2.2;
  slab(ctx, pose, belly, 2.2, body, hull);
  // Cockpit glazing, team band and the cargo ramp seam on the roof.
  plane(ctx, pose, roof, SQUASH, () => {
    ctx.fillStyle = '#2c4560';
    ctx.beginPath();
    ctx.moveTo(4.7, -0.55);
    ctx.lineTo(3.7, -0.85);
    ctx.lineTo(3.7, 0.85);
    ctx.lineTo(4.7, 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = team;
    ctx.fillRect(-3.4, -1.15, 1.6, 2.3);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(-4.2, -1.0);
    ctx.lineTo(-4.2, 1.0);
    ctx.stroke();
  });
  // Four engine nacelles hang under the high wing, with spinning propeller discs in front.
  const engines = [-4.0, -2.3, 2.3, 4.0];
  for (const y of engines) {
    slab(ctx, pose, roof - 0.5, 0.6, '#5a6052', () => {
      ctx.beginPath();
      ctx.ellipse(0.0, y, 1.0, 0.36, 0, 0, Math.PI * 2);
    });
  }
  slab(ctx, pose, roof + 0.1, 0.3, shade(body, 0.95), wing);
  plane(ctx, pose, roof + 0.4, SQUASH, () => {
    ctx.fillStyle = team;
    ctx.fillRect(-1.4, 4.4, 0.9, 0.8);
    ctx.fillRect(-1.4, -5.2, 0.9, 0.8);
  });
  if (lift > 0.5 || pose.moving) {
    for (const y of engines) {
      const c = proj(pose, [1.1, y, roof - 0.2]);
      ctx.fillStyle = 'rgba(30,30,30,0.28)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 0.9, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      const a = pose.phase * 2.5 + y;
      ctx.strokeStyle = 'rgba(20,20,20,0.6)';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.moveTo(c.x - Math.cos(a) * 0.9, c.y - Math.sin(a) * 0.9);
      ctx.lineTo(c.x + Math.cos(a) * 0.9, c.y + Math.sin(a) * 0.9);
      ctx.stroke();
    }
  }
  // T-tail: tall fin with the tailplane on top.
  fins(
    ctx,
    pose,
    [
      [
        [-3.9, 0, roof],
        [-6.2, 0, roof],
        [-6.6, 0, roof + 3.2],
        [-5.4, 0, roof + 3.2],
      ],
    ],
    body,
  );
  slab(ctx, pose, roof + 3.0, 0.25, shade(body, 0.95), tailplane);
}

/** Draws one vehicle or aircraft of `kind` for the given faction. */
export function drawVehicle(ctx: Ctx, pose: VehiclePose, kind: VehicleKind, faction: FactionId): void {
  const body = BODY[faction];
  const team = FACTIONS[faction].colors.primary;
  if (kind === 'tank') tank(ctx, pose, body, team);
  else if (kind === 'ifv') ifv(ctx, pose, body, team);
  else if (kind === 'light') light(ctx, pose, body, team);
  else if (kind === 'transport') transport(ctx, pose, body, team);
  else jet(ctx, pose, body, team, JETS[faction]);
}

const portraits = new Map<string, HTMLCanvasElement>();

/** Sidebar cameo picture of a vehicle (cached). */
export function vehiclePortrait(faction: FactionId, kind: VehicleKind): HTMLCanvasElement {
  const key = `${faction}:${kind}`;
  let c = portraits.get(key);
  if (!c) {
    const { canvas, ctx } = createCanvas(128, 96);
    if (drawAircraftPortrait(ctx, faction, kind, 128, 96, 0.45)) {
      portraits.set(key, canvas);
      return canvas;
    }
    // A jet hovers 7 px above its ground point, so its ground point sits lower in the picture.
    const air = kind === 'jet' || kind === 'transport';
    const scale = kind === 'transport' ? 7.5 : air ? 9 : 13;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawVehicle(ctx, { x: 128 / 2 / scale, y: (air ? 108 : 62) / scale, heading: 0.45, phase: 0, moving: false, altitude: air ? 7 : undefined }, kind, faction);
    portraits.set(key, canvas);
    c = canvas;
  }
  return c;
}
