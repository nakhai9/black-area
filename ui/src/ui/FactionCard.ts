import { CAPITAL_LOCATIONS, FACTION_ORDER } from '../constants';
import { FACTIONS } from '../factions';
import { t } from '../i18n';
import type { FactionId, FactionStats } from '../types';
import { factionBadgeHtml, flagUrl } from './FactionBadge';

const SHOWN_STATS: readonly [keyof FactionStats, string][] = [
  ['unitSpeed', 'Mobility'],
  ['armor', 'Armor'],
  ['firepower', 'Firepower'],
  ['range', 'Range'],
  ['buildSpeed', 'Build speed'],
];
const STAT_MAX = 1.5;

/** Cards from west to east, by the longitude of each nation's capital. */
export const CARD_ORDER: readonly FactionId[] = [...FACTION_ORDER].sort((a, b) => CAPITAL_LOCATIONS[a].lon - CAPITAL_LOCATIONS[b].lon);

/** Main menu poster card: big emblem over the nation's colour, its name (without "Union") across the bottom (details in the side panel). */
export function factionPosterHtml(id: FactionId): string {
  const f = FACTIONS[id];
  return `
      <div class="fp-poster-art">${factionBadgeHtml(id, 'md')}</div>
      <h2>${f.name.replace(/\s+Union$/i, '')}</h2>
`;
}

/** Main menu side panel: the nation picked (or hovered) — name, capital and its stats as big bars. */
export function factionDetailHtml(id: FactionId): string {
  const f = FACTIONS[id];
  const stats = SHOWN_STATS.map(
    ([k, label]) =>
      `<li><span>${t(label)}</span><div class="fp-dbar"><i style="width:${Math.min(100, ((f.stats[k] ?? 1) / STAT_MAX) * 100)}%"></i></div></li>`,
  ).join('');
  return `
      <img class="fp-dflag" src="${flagUrl(id)}" alt="">
      <h3>${f.name}</h3>
      <div class="fp-capital">${f.capital.name} · ${CAPITAL_LOCATIONS[id].name}</div>
      <ul class="fp-dstats">${stats}</ul>
`;
}

/** Inside of a nation card (main menu faction picker, multiplayer room): badge, name, capital, stat bars. */
export function factionCardHtml(id: FactionId): string {
  const f = FACTIONS[id];
  const stats = SHOWN_STATS.map(
    ([k, label]) =>
      `<li><span>${t(label)}</span><div class="sb-bar"><i style="width:${((f.stats[k] ?? 1) / STAT_MAX) * 100}%"></i></div></li>`,
  ).join('');
  return `
      <div class="fp-ident">
        ${factionBadgeHtml(id, 'md')}
      </div>
      <h2>${f.name}</h2>
      <div class="fp-capital">${f.capital.name} · ${CAPITAL_LOCATIONS[id].name}</div>

      <ul class="sb-stats fp-stats">${stats}</ul>
`;
}
