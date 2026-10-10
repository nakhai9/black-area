import type { FactionId } from '../types';

const emblems = new Map<FactionId, HTMLImageElement>();

/** The nation's emblem (public/emblems/<id>.png), or null until it has loaded. Starts the download on first ask. */
export function emblemImage(faction: FactionId): HTMLImageElement | null {
  let img = emblems.get(faction);
  if (!img) {
    img = new Image();
    img.src = `${import.meta.env.BASE_URL}emblems/${faction}.png`;
    emblems.set(faction, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}
