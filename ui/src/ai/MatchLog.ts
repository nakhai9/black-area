import { Building } from '../entities/Building';
import type { EntityManager } from '../entities/EntityManager';
import { Infantry } from '../entities/Infantry';
import { Unit } from '../entities/Unit';
import { Vehicle } from '../entities/Vehicle';
import { BUILD_OPTIONS, buildCost } from '../systems/ConstructionSystem';
import type { FactionId, PlayerState, WorldPoint } from '../types';

/**
 * Match log of every nation (AI and human): spending, structures and units bought, attack waves, losses and kills.
 * Recorded by polling (every POLL_SECONDS: what appeared / disappeared since the last look), so no game system needs a
 * hook. Saved with the match (a continued save keeps logging) and sent to the game server, which learns from it
 * (server/src/ai.js). Only counts and ids: nothing about the person playing.
 */
export interface FactionLog {
  owner: number;
  faction: FactionId;
  isHuman: boolean;
  /** Every ECONOMY_SECONDS: credits in hand, structures standing, army size. */
  economy: { t: number; credits: number; buildings: number; army: number }[];
  /** Structures and units as they appear, with the game time and (structures) their price. */
  buys: { t: number; kind: 'building' | 'unit'; id: string; cost: number }[];
  /** Attack waves (an attack order for MIN_WAVE units or more). */
  attacks: { t: number; size: number; mix: Record<string, number>; bearing: number }[];
  lost: Record<string, number>;
  killed: Record<string, number>;
  buildingsLost: number;
}

export interface MatchLogState {
  matchId: string;
  started: string;
  logs: FactionLog[];
  /** Game time of the last checkpoint sent to the server (only the part after it is new). */
  checkpointAt: number;
  /** The end-of-match report was sent (or queued). */
  reported: boolean;
}

const POLL_SECONDS = 2;
const ECONOMY_SECONDS = 60;
/** Attack orders for fewer units than this are not a wave (a single unit sent off is not a style). */
const MIN_WAVE = 3;
/** One wave per nation per this many seconds at most (the AI repeats its orders). */
const WAVE_GAP = 30;
/** Caps so a very long match never grows the save / the report without bound. */
const MAX_BUYS = 1500;
const MAX_ATTACKS = 300;
const MAX_ECONOMY = 300;

/** Kind key of a unit for the log: vehicle type, or `inf:<tier>` / engineer. */
export function unitKind(u: Unit): string {
  if (u instanceof Vehicle) return u.type;
  if (u instanceof Infantry) return u.isEngineer ? 'engineer' : `inf:${u.tier}`;
  return 'unit';
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export class MatchLog {
  state: MatchLogState;
  private timer = 0;
  /** Whatever stands at the first look (start of the match) is the starting force, not a purchase. */
  private primed = false;
  private time = 0;
  private nextEconomy = 0;
  /** Every structure / combat unit seen: owner, kind, and the owner of whoever hit it last (the killer if it dies). */
  private readonly seen = new Map<number, { owner: number; kind: string; building: boolean; hitBy: number | null }>();
  private readonly lastWave = new Map<number, number>();

  constructor(
    private readonly players: readonly PlayerState[],
    private readonly entities: EntityManager,
  ) {
    this.state = {
      matchId: newId(),
      started: new Date().toISOString(),
      logs: players.map((p) => ({ owner: p.id, faction: p.faction, isHuman: p.isHuman, economy: [], buys: [], attacks: [], lost: {}, killed: {}, buildingsLost: 0 })),
      checkpointAt: 0,
      reported: false,
    };
  }

  private log(owner: number): FactionLog | undefined {
    return this.state.logs.find((l) => l.owner === owner);
  }

  /** A saved match: keep logging into its log (the entities already standing are not counted as new buys). */
  restore(raw: unknown): void {
    const o = raw as Partial<MatchLogState> | null;
    if (!o || typeof o.matchId !== 'string' || !Array.isArray(o.logs)) return;
    this.state = {
      matchId: o.matchId,
      started: typeof o.started === 'string' ? o.started : new Date().toISOString(),
      logs: this.state.logs.map((fresh) => {
        const old = (o.logs as FactionLog[]).find((l) => l && l.owner === fresh.owner);
        return old ? { ...fresh, ...old, faction: fresh.faction, isHuman: fresh.isHuman } : fresh;
      }),
      checkpointAt: typeof o.checkpointAt === 'number' ? o.checkpointAt : 0,
      reported: o.reported === true,
    };
    this.seen.clear();
    this.prime();
    this.primed = true;
  }

  /** Marks everything standing now as already seen (start of a match / a loaded save). */
  prime(): void {
    for (const e of this.entities.all()) {
      if (!e.alive) continue;
      if (e instanceof Building) this.seen.set(e.id, { owner: e.owner, kind: e.spec.type, building: true, hitBy: null });
      else if (e instanceof Unit && e.weapon !== null) this.seen.set(e.id, { owner: e.owner, kind: unitKind(e), building: false, hitBy: null });
    }
  }

  update(dt: number, time: number): void {
    this.time = time;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = POLL_SECONDS;
    if (!this.primed) {
      this.primed = true;
      this.prime();
    }
    const now = new Set<number>();
    for (const e of this.entities.all()) {
      if (!e.alive) continue;
      const building = e instanceof Building;
      if (!building && !(e instanceof Unit && e.weapon !== null)) continue;
      now.add(e.id);
      const prev = this.seen.get(e.id);
      const kind = building ? (e as Building).spec.type : unitKind(e as Unit);
      const hitter = e.lastAttackerId !== null ? this.entities.get(e.lastAttackerId) : undefined;
      const hitBy = hitter ? hitter.owner : (prev?.hitBy ?? null);
      if (prev && prev.owner === e.owner) {
        prev.hitBy = hitBy;
        continue;
      }
      this.seen.set(e.id, { owner: e.owner, kind, building, hitBy });
      // Captured / bought from another nation: a change of owner, not a purchase.
      if (prev) continue;
      const l = this.log(e.owner);
      if (!l || l.buys.length >= MAX_BUYS) continue;
      let cost = 0;
      const p = this.players.find((q) => q.id === e.owner);
      if (building && p) {
        const opt = BUILD_OPTIONS.find((o) => o.id === kind);
        if (opt) cost = buildCost(opt, p.faction);
      }
      l.buys.push({ t: Math.round(time), kind: building ? 'building' : 'unit', id: kind, cost });
    }
    // Gone since the last look: lost (and a kill for whoever hit it last).
    for (const [id, s] of this.seen) {
      if (now.has(id)) continue;
      this.seen.delete(id);
      const e = this.entities.get(id);
      if (e && e.alive) continue; // only hidden (inside a building / transport), not dead
      const l = this.log(s.owner);
      if (l) {
        if (s.building) l.buildingsLost++;
        else l.lost[s.kind] = (l.lost[s.kind] ?? 0) + 1;
      }
      const kl = s.hitBy !== null ? this.log(s.hitBy) : undefined;
      if (kl && s.hitBy !== s.owner && !s.building) kl.killed[s.kind] = (kl.killed[s.kind] ?? 0) + 1;
    }
    if (time >= this.nextEconomy) {
      this.nextEconomy = time + ECONOMY_SECONDS;
      for (const p of this.players) {
        const l = this.log(p.id);
        if (!l || l.economy.length >= MAX_ECONOMY) continue;
        let buildings = 0;
        let army = 0;
        for (const s of this.seen.values()) if (s.owner === p.id) s.building ? buildings++ : army++;
        l.economy.push({ t: Math.round(time), credits: Math.round(p.credits), buildings, army });
      }
    }
  }

  /** An attack order (Game.orderAttackMove / orderAttackTarget): a wave if it is big enough. */
  noteAttack(units: readonly Unit[], target: WorldPoint, home: WorldPoint | null): void {
    if (units.length < MIN_WAVE) return;
    const owner = units[0]!.owner;
    if (this.time - (this.lastWave.get(owner) ?? -Infinity) < WAVE_GAP) return;
    const l = this.log(owner);
    if (!l || l.attacks.length >= MAX_ATTACKS) return;
    this.lastWave.set(owner, this.time);
    const mix: Record<string, number> = {};
    for (const u of units) mix[unitKind(u)] = (mix[unitKind(u)] ?? 0) + 1;
    const bearing = home ? Math.round(Math.atan2(target.y - home.y, target.x - home.x) * 100) / 100 : 0;
    l.attacks.push({ t: Math.round(this.time), size: units.length, mix, bearing });
  }
}
