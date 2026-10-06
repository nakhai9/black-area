import { FACTIONS } from '../factions';
import type { FactionId, InfantryLook, UnitTier } from '../types';
import { createCanvas } from './Canvas';
import { shade } from './Color';

const SKIN = '#e0b48a';
const GUN = '#26272a';

export interface SoldierPose {
  x: number;
  y: number;
  facing: 1 | -1;
  walkPhase: number;
  moving: boolean;
}

/**
 * Draws one soldier with its feet at (x, y), in world px (≈3.4 px tall —
 * about 0.4 of a grid cell). Team colour shows on the vest stripe; uniform,
 * headgear and weapon come from the faction's infantry look.
 */
export function drawSoldier(
  ctx: CanvasRenderingContext2D,
  pose: SoldierPose,
  look: InfantryLook,
  team: string,
  special: boolean,
): void {
  const { x, y } = pose;
  const f = pose.facing;
  const swing = pose.moving ? Math.sin(pose.walkPhase) * 0.45 : 0;

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x + 0.15, y + 0.05, 0.95, 0.38, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs.
  ctx.lineCap = 'round';
  ctx.strokeStyle = look.trousers;
  ctx.lineWidth = 0.42;
  ctx.beginPath();
  ctx.moveTo(x - 0.18, y - 1.2);
  ctx.lineTo(x - 0.18 + swing, y - 0.05);
  ctx.moveTo(x + 0.18, y - 1.2);
  ctx.lineTo(x + 0.18 - swing, y - 0.05);
  ctx.stroke();

  // Torso with team-colour vest stripe.
  ctx.fillStyle = look.uniform;
  roundRect(ctx, x - 0.55, y - 2.35, 1.1, 1.25, 0.3);
  ctx.fill();
  if (look.camo) drawCamo(ctx, x, y, look.uniform);
  if (look.weapon === 'none') {
    // Head of state in a dark suit: white shirt front and a team-colour tie.
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(x - 0.22, y - 2.3, 0.44, 0.8);
    ctx.fillStyle = team;
    ctx.fillRect(x - 0.07, y - 2.25, 0.14, 0.7);
  } else {
    ctx.fillStyle = team;
    ctx.fillRect(x - 0.55, y - 1.95, 1.1, 0.32);
  }
  ctx.fillStyle = shade(look.uniform, 0.75);
  ctx.fillRect(x - 0.55 * f, y - 2.3, 0.18 * f, 1.15);

  // Arm + weapon (the President carries nothing; engineers carry a wrench).
  ctx.strokeStyle = look.uniform;
  ctx.lineWidth = 0.32;
  ctx.beginPath();
  ctx.moveTo(x + 0.2 * f, y - 2.1);
  ctx.lineTo(x + 0.75 * f, y - 1.75);
  ctx.stroke();
  if (look.weapon === 'wrench') {
    ctx.strokeStyle = '#b8bcc2';
    ctx.lineWidth = 0.2;
    ctx.beginPath();
    ctx.moveTo(x + 0.75 * f, y - 1.75);
    ctx.lineTo(x + 1.05 * f, y - 2.35);
    ctx.stroke();
  } else if (look.weapon !== 'none') {
    const len = look.weapon === 'sniper' ? 1.9 : look.weapon === 'smg' ? 1.0 : 1.4;
    ctx.strokeStyle = GUN;
    ctx.lineWidth = look.weapon === 'smg' ? 0.3 : 0.22;
    ctx.beginPath();
    ctx.moveTo(x - 0.1 * f, y - 1.6);
    ctx.lineTo(x + (len - 0.1) * f, y - 2.05);
    ctx.stroke();
  }

  // Head + headgear.
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(x, y - 2.72, 0.4, 0, Math.PI * 2);
  ctx.fill();
  drawHeadgear(ctx, x, y - 2.72, f, look);

  // Special forces wear a small team-colour shoulder patch.
  if (special) {
    ctx.fillStyle = team;
    ctx.fillRect(x - 0.62 * f - (f < 0 ? 0.24 : 0), y - 2.3, 0.24, 0.24);
  }
}

/** Camouflage pattern: dark and light blotches over the torso and the top of the legs. */
const CAMO_SPOTS: readonly (readonly [number, number, number, number])[] = [
  // dx, dy (from the feet), radius, shade
  [-0.28, -2.12, 0.2, 0.62],
  [0.22, -1.85, 0.22, 1.28],
  [-0.12, -1.42, 0.18, 0.62],
  [0.3, -1.3, 0.14, 0.78],
  [-0.32, -1.68, 0.13, 1.28],
  [0.08, -2.22, 0.12, 0.78],
  [-0.18, -0.85, 0.12, 0.62],
  [0.2, -0.6, 0.11, 1.28],
];

function drawCamo(ctx: CanvasRenderingContext2D, x: number, y: number, base: string): void {
  for (const [dx, dy, r, k] of CAMO_SPOTS) {
    ctx.fillStyle = shade(base, k);
    ctx.beginPath();
    ctx.ellipse(x + dx, y + dy, r, r * 0.7, dx * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHeadgear(ctx: CanvasRenderingContext2D, x: number, y: number, f: number, look: InfantryLook): void {
  ctx.fillStyle = look.headColor;
  switch (look.headgear) {
    case 'helmet':
      ctx.beginPath();
      ctx.arc(x, y - 0.05, 0.47, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - 0.52, y - 0.08, 1.04, 0.12);
      break;
    case 'beret':
      ctx.beginPath();
      ctx.ellipse(x - 0.08 * f, y - 0.3, 0.5, 0.2, -0.25 * f, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cap':
      ctx.fillRect(x - 0.42, y - 0.5, 0.84, 0.32);
      ctx.fillRect(x - 0.1 * f, y - 0.22, 0.55 * f, 0.1);
      ctx.fillStyle = '#d8261b';
      ctx.fillRect(x - 0.08, y - 0.44, 0.16, 0.16);
      break;
    case 'reverseCap':
      // Baseball cap worn backwards: the peak points behind the head.
      ctx.beginPath();
      ctx.arc(x, y - 0.12, 0.43, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - 0.45 * f, y - 0.18, -0.5 * f, 0.11);
      break;
    case 'ushanka':
      ctx.fillRect(x - 0.5, y - 0.55, 1.0, 0.4);
      ctx.fillRect(x - 0.55, y - 0.2, 0.2, 0.42);
      ctx.fillRect(x + 0.35, y - 0.2, 0.2, 0.42);
      ctx.fillStyle = '#d8261b';
      ctx.fillRect(x - 0.08, y - 0.48, 0.16, 0.16);
      break;
    case 'balaclava':
      ctx.beginPath();
      ctx.arc(x, y, 0.43, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SKIN;
      ctx.fillRect(x - 0.05 + 0.08 * f, y - 0.12, 0.3 * f, 0.12);
      break;
    case 'hardhat':
      ctx.beginPath();
      ctx.arc(x, y - 0.05, 0.5, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x - 0.6, y - 0.08, 1.2, 0.14);
      break;
    case 'none':
      break;
    case 'boonie':
      ctx.beginPath();
      ctx.ellipse(x, y - 0.22, 0.68, 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y - 0.25, 0.36, Math.PI, 0);
      ctx.fill();
      break;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const portraits = new Map<string, HTMLCanvasElement>();

/** Sidebar cameo picture of a faction's soldier (cached). */
export function soldierPortrait(faction: FactionId, tier: UnitTier): HTMLCanvasElement {
  const key = `${faction}:${tier}`;
  let c = portraits.get(key);
  if (!c) {
    const f = FACTIONS[faction];
    const { canvas, ctx } = createCanvas(128, 96);
    const scale = 22;
    ctx.setTransform(scale, 0, 0, scale, 64, 88);
    const pose = { x: 0, y: 0, facing: 1 as const, walkPhase: 0, moving: false };
    drawSoldier(ctx, pose, f.infantry[tier].look, f.colors.primary, tier === 'special');
    portraits.set(key, canvas);
    c = canvas;
  }
  return c;
}
