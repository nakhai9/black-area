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

/** The map is seen at an angle: shapes drawn in the ground plane are squashed vertically. */
const SQUASH = 0.62;
const DARK = '#1f2124';

const BODY: Record<FactionId, string> = {
  usa: '#6b7046',
  russia: '#5f6b4a',
  china: '#6e7a4a',
  europe: '#586548',
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

function jet(ctx: Ctx, pose: VehiclePose, team: string): void {
  // The shadow stays on the ground while the aircraft hovers above it (it drifts away with height).
  const lift = pose.altitude ?? 7;
  const k = lift / 7;
  shadow(ctx, pose, 4.6, 2.2, 0.4 + 1.0 * k, 0.5 + 2.1 * k);
  plane(ctx, pose, lift, 0.8, () => {
    const body = '#8d949c';
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(4.2, 0);
    ctx.lineTo(1.2, 0.55);
    ctx.lineTo(-0.2, 3.7);
    ctx.lineTo(-1.3, 3.6);
    ctx.lineTo(-0.9, 0.7);
    ctx.lineTo(-2.8, 0.6);
    ctx.lineTo(-3.4, 1.9);
    ctx.lineTo(-4.0, 1.8);
    ctx.lineTo(-3.7, 0);
    ctx.lineTo(-4.0, -1.8);
    ctx.lineTo(-3.4, -1.9);
    ctx.lineTo(-2.8, -0.6);
    ctx.lineTo(-0.9, -0.7);
    ctx.lineTo(-1.3, -3.6);
    ctx.lineTo(-0.2, -3.7);
    ctx.lineTo(1.2, -0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,20,0.55)';
    ctx.lineWidth = 0.16;
    ctx.stroke();
    ctx.fillStyle = '#2c3f55';
    ctx.beginPath();
    ctx.ellipse(1.5, 0, 1.0, 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = team;
    ctx.fillRect(-3.4, -0.5, 1.4, 0.3);
    ctx.fillRect(-3.4, 0.2, 1.4, 0.3);
    // Afterburner glow.
    ctx.fillStyle = 'rgba(255,180,90,0.8)';
    ctx.fillRect(-4.6, -0.3, 0.7, 0.6);
  });
}

function transport(ctx: Ctx, pose: VehiclePose, team: string): void {
  const lift = pose.altitude ?? 7;
  const k = lift / 7;
  shadow(ctx, pose, 6.2, 2.6, 0.5 + 1.1 * k, 0.6 + 2.3 * k);
  plane(ctx, pose, lift, 0.8, () => {
    // High wing across the middle, tailplane, four engines and a thick cargo fuselage.
    ctx.fillStyle = '#9aa28c';
    ctx.beginPath();
    ctx.moveTo(0.6, 0.9);
    ctx.lineTo(-0.6, 5.2);
    ctx.lineTo(-1.8, 5.2);
    ctx.lineTo(-1.6, 0.9);
    ctx.lineTo(-1.6, -0.9);
    ctx.lineTo(-1.8, -5.2);
    ctx.lineTo(-0.6, -5.2);
    ctx.lineTo(0.6, -0.9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8a927c';
    ctx.beginPath();
    ctx.moveTo(-4.6, 0.8);
    ctx.lineTo(-5.3, 2.4);
    ctx.lineTo(-6.0, 2.4);
    ctx.lineTo(-5.8, 0.8);
    ctx.lineTo(-5.8, -0.8);
    ctx.lineTo(-6.0, -2.4);
    ctx.lineTo(-5.3, -2.4);
    ctx.lineTo(-4.6, -0.8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b7bfa8';
    ctx.beginPath();
    ctx.ellipse(-0.4, 0, 5.6, 1.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,20,20,0.55)';
    ctx.lineWidth = 0.16;
    ctx.stroke();
    ctx.fillStyle = '#2c3f55';
    ctx.beginPath();
    ctx.ellipse(4.2, 0, 0.9, 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a4f46';
    for (const y of [-3.9, -2.2, 2.2, 3.9]) ctx.fillRect(-0.2, y - 0.3, 1.4, 0.6);
    ctx.fillStyle = team;
    ctx.fillRect(-3.6, -0.35, 2.4, 0.7);
  });
}

/** Draws one vehicle or aircraft of `kind` for the given faction. */
export function drawVehicle(ctx: Ctx, pose: VehiclePose, kind: VehicleKind, faction: FactionId): void {
  const body = BODY[faction];
  const team = FACTIONS[faction].colors.primary;
  if (kind === 'tank') tank(ctx, pose, body, team);
  else if (kind === 'ifv') ifv(ctx, pose, body, team);
  else if (kind === 'light') light(ctx, pose, body, team);
  else if (kind === 'transport') transport(ctx, pose, team);
  else jet(ctx, pose, team);
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
