// Movement check: every unit kind (vehicles, ship, aircraft, soldiers, engineers) on every route shape.
// Run from ui/: bash tools/movement-check.sh
// Fails when a unit slides across its body axis, moves tail first, jumps, gets inside a structure, stands still over 3 s or re-routes over 3 times.
import { Vehicle } from '../src/entities/Vehicle';
import { Infantry } from '../src/entities/Infantry';
import { Unit } from '../src/entities/Unit';
import { CELL_SIZE } from '../src/constants';

const C = CELL_SIZE;
const cc = (x: number, y: number) => ({ x: (x + 0.5) * C, y: (y + 0.5) * C });
// A structure: cells x 13..15, y 7..13 (start 10,10 -> goal 18,10 runs straight through it).
const solid = (cx: number, cy: number) => cx >= 13 && cx <= 15 && cy >= 7 && cy <= 13;
const blocks = (_u: Unit, x0: number, y0: number, x1: number, y1: number): boolean => {
  const ax = Math.floor(x0 / C), ay = Math.floor(y0 / C), bx = Math.floor(x1 / C), by = Math.floor(y1 / C);
  if (ax === bx && ay === by) return false;
  if (solid(ax, ay)) return false;
  if (solid(bx, by)) return true;
  return ax !== bx && ay !== by && solid(bx, ay) && solid(ax, by);
};
// Route round the structure as the pathfinder gives it (cell centres, smoothed).
const detour = [cc(12, 6), cc(16, 6), cc(18, 10)];

const scenarios: Record<string, { pts: { x: number; y: number }[]; obstacle?: boolean }> = {
  straight: { pts: [cc(20, 10)] },
  turn90: { pts: [cc(15, 10), cc(15, 15)] },
  zigzag45: { pts: [cc(12, 10), cc(13, 11), cc(14, 11), cc(15, 12), cc(16, 12)] },
  sidePoint: { pts: [{ x: 10.5 * C, y: 10.9 * C }] },
  uTurn: { pts: [cc(5, 10)] },
  aroundBuilding: { pts: detour, obstacle: true },
  throughBuilding: { pts: [cc(18, 10)], obstacle: true }, // must notice the block, re-route and get round
};

type Make = () => Unit;
const kinds: Record<string, Make> = {
  tank: () => new Vehicle(1, 'usa', 'tank', cc(10, 10)),
  truck: () => new Vehicle(1, 'usa', 'truck', cc(10, 10)),
  light: () => new Vehicle(1, 'usa', 'light', cc(10, 10)),
  bm21: () => new Vehicle(1, 'russia', 'bm21', cc(10, 10)),
  carrier: () => new Vehicle(1, 'usa', 'carrier', cc(10, 10)),
  heli: () => { const v = new Vehicle(1, 'usa', 'heli', cc(10, 10)); (v as any).flight = 'airborne'; return v; },
  jet: () => { const v = new Vehicle(1, 'usa', 'jet', cc(10, 10)); (v as any).flight = 'airborne'; return v; },
  soldier: () => new Infantry(1, 'usa', 'regular', cc(10, 10)),
  engineer: () => new Infantry(1, 'usa', 'engineer', cc(10, 10)),
};

let fails = 0;
const rows: string[] = [];
for (const [kn, make] of Object.entries(kinds)) {
  for (const [sn, sc] of Object.entries(scenarios)) {
    const u = make();
    const ground = !u.flies && !u.naval;
    if (sc.obstacle && !ground) continue;
    Unit.blocks = sc.obstacle ? blocks : null;
    u.heading = 0;
    u.follow(sc.pts);
    const end = sc.pts[sc.pts.length - 1]!;
    let side = 0, back = 0, jump = 0, repaths = 0, inside = false, still = 0, longestStill = 0, t = 0;
    const top = (u as any).speed * 1.6 / 30; // max px a tick may cover (rank / terrain margin)
    for (; t < 30 * 60 && (u.waypoints().length > 0 || (u as any).speedRatio > 0); t++) {
      const x = u.px, y = u.py, h0 = u.heading;
      u.update(1 / 30);
      if (u.needsRepath) { repaths++; u.follow(detour); }
      const dx = u.px - x, dy = u.py - y, m = Math.hypot(dx, dy);
      if (sc.obstacle && solid(Math.floor(u.px / C), Math.floor(u.py / C))) inside = true;
      jump = Math.max(jump, m / Math.max(1e-9, top));
      if (m < 1e-6) { if (u.waypoints().length > 0) { still++; longestStill = Math.max(longestStill, still); } continue; }
      still = 0;
      const lat = (h: number) => Math.abs(-Math.sin(h) * dx + Math.cos(h) * dy) / m;
      side = Math.max(side, Math.min(lat(h0), lat(u.heading)));
      const fwd = (h: number) => (Math.cos(h) * dx + Math.sin(h) * dy) / m;
      if (Math.max(fwd(h0), fwd(u.heading)) < 0.5) back++; // not moving along its nose (tail first or across)
    }
    const err = Math.hypot(u.px - end.x, u.py - end.y);
    const done = u.waypoints().length === 0;
    // Pass rules: arrived (within a cell), never across its body axis (>5% of a step), no jumps, never in the structure,
    // never stood still more than 3 s, at most 3 re-routes.
    const ok = done && err < Math.max(C, u.radius) && side < 0.05 && back === 0 && jump <= 1.0 && !inside && longestStill < 90 && repaths <= 3;
    if (!ok) fails++;
    rows.push(`${ok ? 'OK  ' : 'FAIL'} ${kn.padEnd(9)} ${sn.padEnd(16)} t=${(t / 30).toFixed(1).padStart(5)}s endErr=${err.toFixed(2).padStart(5)} side=${side.toFixed(3)} back=${back} jump=${jump.toFixed(2)} stillMax=${(longestStill / 30).toFixed(1)}s repath=${repaths} inside=${inside}`);
  }
}
console.log(rows.join('\n'));
console.log(`\n${fails} failing of ${rows.length}`);
process.exitCode = fails > 0 ? 1 : 0;
