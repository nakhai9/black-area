import data from '../data/game-assets.json';
import type { FactionId } from '../types';

/**
 * Game assets configuration (demo menu → Assets game): one shared file, src/data/game-assets.json, applied to the
 * whole game — the player's sidebar and the AI alike.
 *  - `assets`: per soldier / vehicle / structure design (`infantry:<nation>:<tier>`, `vehicle:<nation>:<kind>`,
 *    `building:<nation>:<type>`): `faction`, the nation whose shop sells it (default its own), and `deleted`, a soft
 *    delete (left out of every shop and the sidebar, kept in the file to be restored).
 *  - `research`: Research Lab products added to a nation's shop with their prerequisites. Recorded only: they do
 *    nothing in a game until each is programmed.
 * The file is written by the dev server (vite.config.ts, POST /__game-assets); a build reads it as it was.
 */
export type AssetKind = 'infantry' | 'vehicle' | 'building';

export interface AssetOverride {
  faction?: FactionId;
  deleted?: boolean;
}

export interface ResearchEntry {
  product: string;
  faction: FactionId;
  requires: string[];
  addedAt: string;
}

export interface GameAssetsFile {
  assets: Record<string, AssetOverride>;
  research: ResearchEntry[];
}

const FILE = data as GameAssetsFile;

export function assetId(kind: AssetKind, design: FactionId, base: string): string {
  return `${kind}:${design}:${base}`;
}

/** The current configuration (a copy, to edit and save). */
export function gameAssets(): GameAssetsFile {
  return JSON.parse(JSON.stringify(FILE)) as GameAssetsFile;
}

export function isDeleted(kind: AssetKind, design: FactionId, base: string): boolean {
  return FILE.assets[assetId(kind, design, base)]?.deleted === true;
}

/** The nation whose shop sells a design (its own unless moved). */
export function sellerOf(kind: AssetKind, design: FactionId, base: string): FactionId {
  return FILE.assets[assetId(kind, design, base)]?.faction ?? design;
}

/** Designs of other nations moved into `nation`'s shop (not deleted): `[design, base]` pairs. */
export function movedInto(kind: AssetKind, nation: FactionId): [FactionId, string][] {
  const out: [FactionId, string][] = [];
  for (const [id, o] of Object.entries(FILE.assets)) {
    const [k, design, base] = id.split(':');
    if (k === kind && o.faction === nation && design !== nation && !o.deleted && design && base) out.push([design as FactionId, base]);
  }
  return out;
}

/** Is a nation's own design still sold in its own shop (not deleted, not moved to another nation)? */
export function ownOffered(kind: AssetKind, nation: FactionId, base: string): boolean {
  return !isDeleted(kind, nation, base) && sellerOf(kind, nation, base) === nation;
}

/** Saves the configuration through the dev server; the page reloads with it applied. */
export async function saveGameAssets(next: GameAssetsFile): Promise<void> {
  const res = await fetch('/__game-assets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next, null, 2) });
  if (!res.ok) throw new Error(`Saving failed (${res.status}): only the dev server (npm run dev) can write src/data/game-assets.json.`);
}
