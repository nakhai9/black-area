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

function jet(ctx: Ctx, pose: VehiclePose, body: string, team: string): void {
  // Parked, the belly rests on its landing gear instead of sinking into the ground.
  const lift = Math.max(0.7, pose.altitude ?? 7);
  const wingShape = (): void => {
    ctx.beginPath();
    ctx.moveTo(1.4, 0.6);
    ctx.lineTo(-0.4, 3.8);
    ctx.lineTo(-1.5, 3.7);
    ctx.lineTo(-1.1, 0.7);
    ctx.lineTo(-2.9, 0.6);
    ctx.lineTo(-3.6, 1.9);
    ctx.lineTo(-4.2, 1.8);
    ctx.lineTo(-3.9, 0);
    ctx.lineTo(-4.2, -1.8);
    ctx.lineTo(-3.6, -1.9);
    ctx.lineTo(-2.9, -0.6);
    ctx.lineTo(-1.1, -0.7);
    ctx.lineTo(-1.5, -3.7);
    ctx.lineTo(-0.4, -3.8);
    ctx.lineTo(1.4, -0.6);
    ctx.closePath();
  };
  const hull = (): void => {
    ctx.beginPath();
    ctx.moveTo(4.6, 0);
    ctx.lineTo(2.6, 0.5);
    ctx.lineTo(-3.4, 0.7);
    ctx.lineTo(-4.1, 0.45);
    ctx.lineTo(-4.1, -0.45);
    ctx.lineTo(-3.4, -0.7);
    ctx.lineTo(2.6, -0.5);
    ctx.closePath();
  };
  airShadow(ctx, pose, lift, () => {
    wingShape();
    ctx.fill();
    hull();
  });
  // Belly, wings, upper fuselage, canopy, twin fins, exhaust.
  slab(ctx, pose, lift - 0.5, 0.5, shade(body, 0.85), hull);
  slab(ctx, pose, lift, 0.25, body, wingShape);
  plane(ctx, pose, lift + 0.25, SQUASH, () => {
    ctx.fillStyle = team;
    ctx.fillRect(-3.7, 1.0, 0.9, 0.5);
    ctx.fillRect(-3.7, -1.5, 0.9, 0.5);
    ctx.fillRect(-0.9, 2.6, 0.7, 0.6);
    ctx.fillRect(-0.9, -3.2, 0.7, 0.6);
  });
  slab(ctx, pose, lift + 0.25, 0.55, shade(body, 1.08), hull);
  slab(ctx, pose, lift + 0.8, 0.35, '#2c4560', () => {
    ctx.beginPath();
    ctx.ellipse(1.7, 0, 1.1, 0.34, 0, 0, Math.PI * 2);
  });
  plane(ctx, pose, lift + 1.15, SQUASH, () => {
    ctx.fillStyle = 'rgba(200,230,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(2.0, -0.1, 0.45, 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  const top = lift + 0.8;
  fins(
    ctx,
    pose,
    [0.5, -0.5].map((y) => [
      [-2.5, y, top],
      [-3.9, y, top],
      [-4.1, y * 1.5, top + 1.7],
      [-3.4, y * 1.5, top + 1.7],
    ] as P3[]),
    body,
  );
  // Afterburner: flickers while flying.
  if ((pose.altitude ?? 7) > 0.5 || pose.moving) {
    const tail = proj(pose, [-4.5, 0, lift + 0.15]);
    const flick = 0.7 + 0.3 * Math.sin(pose.phase * 3.1);
    const g = ctx.createRadialGradient(tail.x, tail.y, 0, tail.x, tail.y, 1.3 * flick);
    g.addColorStop(0, 'rgba(255,240,190,0.95)');
    g.addColorStop(0.5, 'rgba(255,150,60,0.7)');
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tail.x, tail.y, 1.3 * flick, 0, Math.PI * 2);
    ctx.fill();
  }
}

function transport(ctx: Ctx, pose: VehiclePose, body: string, team: string): void {
  const lift = pose.altitude ?? 7;
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
  else jet(ctx, pose, body, team);
}

const portraits = new Map<string, HTMLCanvasElement>();

/** Sidebar cameo picture of a vehicle (cached). */
export function vehiclePortrait(faction: FactionId, kind: VehicleKind): HTMLCanvasElement {
  const key = `${faction}:${kind}`;
  let c = portraits.get(key);
  if (!c) {
    const { canvas, ctx } = createCanvas(128, 96);
    // A jet hovers 7 px above its ground point, so its ground point sits lower in the picture.
    const air = kind === 'jet' || kind === 'transport';
    const scale = kind === 'transport' ? 7.5 : air ? 9 : 13;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawVehicle(ctx, { x: 128 / 2 / scale, y: (air ? 108 : 62) / scale, heading: 0.45, phase: 0, moving: false }, kind, faction);
    portraits.set(key, canvas);
    c = canvas;
  }
  return c;
}
