/**
 * Nuclear fallout look (visual only; the damage rules live in CombatSystem). A fallout zone is the 'fallout' effect:
 * centre (x, y) and blast ellipse rx × ry in iso px, `age` s into its `ttl`.
 *
 * Scene 1 — spreading (first SPREAD_SECONDS): a glowing fluorescent-green front races out from the crater over the
 * ground into the full circle, a blotchy green stain behind it; pale-green toxic smoke wisps rise over it.
 * Scene 2 — aftermath: the whole circle stays imprinted on the ground as a slowly pulsing radioactive halo with a
 * thin mist over it, fading out at the end. Units and structures inside take a green wash (Renderer), soldiers stagger
 * and glow before they fall, and bodies lie on until the radiation is gone (EffectsLayer).
 *
 * Everything is drawn from a few cached offscreen sprites (no gradient built per zone per frame), so many zones cost
 * little.
 */

export interface FalloutZone {
  readonly x: number;
  readonly y: number;
  readonly rx: number;
  readonly ry: number;
  readonly age: number;
  readonly ttl: number;
}

/** Seconds the front takes to reach the full circle. */
export const SPREAD_SECONDS = 2.4;
/** Seconds the halo takes to fade out at the end of the zone's life. */
const FADE_OUT_SECONDS = 8;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Share of the full circle the front has reached. */
export function falloutReach(z: FalloutZone): number {
  return 0.06 + 0.94 * easeOut(clamp01(z.age / SPREAD_SECONDS));
}

/** Overall strength of the zone's glow: fades in fast, out over the last FADE_OUT_SECONDS. */
function strength(z: FalloutZone): number {
  return clamp01(z.age / 0.4) * clamp01((z.ttl - z.age) / FADE_OUT_SECONDS);
}

/**
 * Green light at iso point (px, py) from the zones (0 = none, 1 = full): inside the reached circle, a little stronger
 * towards the centre and right on the spreading front.
 */
export function radiationAt(zones: readonly FalloutZone[], px: number, py: number): number {
  let best = 0;
  for (const z of zones) {
    const reach = falloutReach(z);
    const dx = (px - z.x) / (z.rx * reach);
    const dy = (py - z.y) / (z.ry * reach);
    const d = dx * dx + dy * dy;
    if (d > 1) continue;
    const r = Math.sqrt(d);
    const front = z.age < SPREAD_SECONDS ? Math.max(0, 1 - Math.abs(1 - r) * 6) * (1 - z.age / SPREAD_SECONDS) : 0;
    const v = strength(z) * Math.min(1, 0.65 + 0.35 * (1 - r) + front * 0.6);
    if (v > best) best = v;
  }
  return best;
}

// ---------------------------------------------------------------- cached sprites

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Deterministic pseudo-random numbers (the stain and the wisps look the same every frame). */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

let stainSprite: HTMLCanvasElement | null = null;
/**
 * The ground stain, drawn once on a 512² disc: a soft fluorescent-green fill, darker irregular blotches breaking it
 * (the glow soaking unevenly into grass, earth and road), brighter specks, and a feathered edge.
 */
function stain(): HTMLCanvasElement {
  if (stainSprite) return stainSprite;
  const S = 512;
  const [c, g] = canvas(S, S);
  const h = S / 2;
  const base = g.createRadialGradient(h, h, 0, h, h, h);
  base.addColorStop(0, 'rgba(150,255,120,0.95)');
  base.addColorStop(0.55, 'rgba(95,235,85,0.75)');
  base.addColorStop(0.86, 'rgba(70,210,70,0.55)');
  base.addColorStop(1, 'rgba(60,200,60,0)');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const r = rng(91);
  // Blotches: the glow soaks in unevenly (destination-out thins the fill in patches).
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * h * 0.92;
    const x = h + Math.cos(a) * d;
    const y = h + Math.sin(a) * d;
    const rad = 10 + r() * 38;
    const b = g.createRadialGradient(x, y, 0, x, y, rad);
    b.addColorStop(0, `rgba(0,0,0,${0.25 + r() * 0.35})`);
    b.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = b;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Brighter specks and streaks along the ground.
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 160; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * h * 0.9;
    const x = h + Math.cos(a) * d;
    const y = h + Math.sin(a) * d;
    const rad = 1.5 + r() * 6;
    const b = g.createRadialGradient(x, y, 0, x, y, rad);
    b.addColorStop(0, `rgba(190,255,150,${0.25 + r() * 0.3})`);
    b.addColorStop(1, 'rgba(190,255,150,0)');
    g.fillStyle = b;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  stainSprite = c;
  return c;
}

let ringSprite: HTMLCanvasElement | null = null;
/** The spreading front: a bright thin ring inside a wide soft glow, on a 512² disc. */
function ring(): HTMLCanvasElement {
  if (ringSprite) return ringSprite;
  const S = 512;
  const [c, g] = canvas(S, S);
  const h = S / 2;
  const grad = g.createRadialGradient(h, h, h * 0.6, h, h, h);
  grad.addColorStop(0, 'rgba(120,255,110,0)');
  grad.addColorStop(0.62, 'rgba(120,255,110,0.18)');
  grad.addColorStop(0.86, 'rgba(170,255,140,0.75)');
  grad.addColorStop(0.92, 'rgba(235,255,210,1)');
  grad.addColorStop(0.96, 'rgba(150,255,120,0.5)');
  grad.addColorStop(1, 'rgba(120,255,110,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  ringSprite = c;
  return c;
}

let puffSprite: HTMLCanvasElement | null = null;
/** One pale-green toxic smoke puff (soft, low contrast). */
function puff(): HTMLCanvasElement {
  if (puffSprite) return puffSprite;
  const S = 128;
  const [c, g] = canvas(S, S);
  const h = S / 2;
  const r = rng(7);
  for (let i = 0; i < 9; i++) {
    const x = h + (r() - 0.5) * h * 0.7;
    const y = h + (r() - 0.5) * h * 0.4;
    const rad = h * (0.35 + r() * 0.3);
    const b = g.createRadialGradient(x, y, 0, x, y, rad);
    b.addColorStop(0, 'rgba(200,245,180,0.32)');
    b.addColorStop(0.6, 'rgba(180,235,160,0.14)');
    b.addColorStop(1, 'rgba(170,230,150,0)');
    g.fillStyle = b;
    g.fillRect(0, 0, S, S);
  }
  puffSprite = c;
  return c;
}

let glowSprite: HTMLCanvasElement | null = null;
/** Soft green light pool (under a vehicle's belly, round a glowing soldier). */
export function radiationGlow(): HTMLCanvasElement {
  if (glowSprite) return glowSprite;
  const S = 64;
  const [c, g] = canvas(S, S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(170,255,140,0.9)');
  grad.addColorStop(0.5, 'rgba(110,255,100,0.35)');
  grad.addColorStop(1, 'rgba(90,255,90,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  glowSprite = c;
  return c;
}

/** CSS filter that turns a sprite into its green-lit version (drawn over it at a low alpha). */
export const RADIATION_FILTER = 'grayscale(1) sepia(1) hue-rotate(55deg) saturate(4.5) brightness(1.15)';

// ---------------------------------------------------------------- drawing

/** The ground layer (under units and structures): the stain, the spreading front, the pulsing halo rim. */
export function drawRadiationGround(ctx: CanvasRenderingContext2D, z: FalloutZone): void {
  const a = strength(z);
  if (a <= 0) return;
  const reach = falloutReach(z);
  const rx = z.rx * reach;
  const ry = z.ry * reach;
  const spreading = z.age < SPREAD_SECONDS;
  const pulse = 0.82 + 0.18 * Math.sin(z.age * 1.6);
  ctx.save();
  // The stain soaks in strongest while the front passes, then settles into the halo.
  ctx.globalAlpha = a * (spreading ? 0.62 : 0.46 * pulse);
  ctx.drawImage(stain(), z.x - rx, z.y - ry, rx * 2, ry * 2);
  ctx.globalCompositeOperation = 'lighter';
  if (spreading) {
    // The racing front: a bright glowing ring at the edge of the reached circle.
    const k = 1 - z.age / SPREAD_SECONDS;
    ctx.globalAlpha = a * (0.55 + 0.45 * k);
    ctx.drawImage(ring(), z.x - rx * 1.06, z.y - ry * 1.06, rx * 2.12, ry * 2.12);
  } else {
    // Aftermath: the imprinted halo rim, slowly pulsing.
    ctx.globalAlpha = a * 0.32 * pulse;
    ctx.drawImage(ring(), z.x - rx * 1.04, z.y - ry * 1.04, rx * 2.08, ry * 2.08);
  }
  // A soft bloom of light over the ground at the centre.
  ctx.globalAlpha = a * (spreading ? 0.35 : 0.16 * pulse);
  ctx.drawImage(radiationGlow(), z.x - rx * 0.7, z.y - ry * 0.7, rx * 1.4, ry * 1.4);
  ctx.restore();
}

/** The air layer (over units and structures): drifting pale-green toxic wisps, dense while spreading, then a thin mist. */
export function drawRadiationMist(ctx: CanvasRenderingContext2D, z: FalloutZone): void {
  const a = strength(z);
  if (a <= 0) return;
  const reach = falloutReach(z);
  const spreading = z.age < SPREAD_SECONDS;
  const r = rng(((z.x * 73856093) ^ (z.y * 19349663)) | 0);
  const n = 16;
  const img = puff();
  ctx.save();
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2;
    const dist = Math.sqrt(r()) * 0.85;
    const speed = 0.25 + r() * 0.5;
    const size = (0.18 + r() * 0.22) * z.rx;
    const phase = r() * 10;
    // Each wisp drifts slowly round and rises a little, cycling its life so the mist never vanishes at once.
    const life = ((z.age * 0.08 * speed + phase) % 1 + 1) % 1;
    const px = z.x + Math.cos(ang + z.age * 0.03 * speed) * z.rx * dist * reach;
    const py = z.y + Math.sin(ang + z.age * 0.03 * speed) * z.ry * dist * reach - life * size * 0.25;
    const fade = Math.sin(life * Math.PI);
    ctx.globalAlpha = a * fade * (spreading ? 0.7 : 0.38);
    ctx.drawImage(img, px - size / 2, py - size * 0.32, size, size * 0.64);
  }
  ctx.restore();
}
