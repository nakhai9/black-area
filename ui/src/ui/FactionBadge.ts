import { getFlagTexture } from '../render/Flags';
import type { FactionId } from '../types';

/** sm: sidebar player panel · md: faction picker card · lg: saved-game confirm screen. */
export type BadgeSize = 'sm' | 'md' | 'lg';

const flagUrls = new Map<FactionId, string>();

/** The faction's flag as a data URL, drawn once per faction. */
function flagUrl(faction: FactionId): string {
  let url = flagUrls.get(faction);
  if (!url) {
    url = getFlagTexture(faction).toDataURL();
    flagUrls.set(faction, url);
  }
  return url;
}

/**
 * The nation's emblem (public/emblems/<id>.png) with its small flag over the lower right corner, as HTML for
 * template strings. Without an emblem image only the flag is left.
 */
export function factionBadgeHtml(faction: FactionId, size: BadgeSize): string {
  return `<span class="flag-badge flag-badge--${size}">
    <img class="fb-emblem" src="${import.meta.env.BASE_URL}emblems/${faction}.png" alt="" onerror="this.remove()">
    <img class="fb-flag" src="${flagUrl(faction)}" alt="">
  </span>`;
}

/** Same badge as an element. */
export function factionBadge(faction: FactionId, size: BadgeSize): HTMLElement {
  const box = document.createElement('template');
  box.innerHTML = factionBadgeHtml(faction, size).trim();
  return box.content.firstElementChild as HTMLElement;
}
