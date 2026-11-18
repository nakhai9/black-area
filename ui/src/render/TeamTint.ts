/**
 * Faction colour for sheets rendered once in neutral grey: the "-team" mask cell (grey shading, alpha = coverage) is
 * multiplied by the owner's hex colour and drawn over the neutral cell. Cached per sheet, cell and colour.
 */
const CACHE = new Map<string, HTMLCanvasElement>();

export function tintedCell(mask: HTMLImageElement, key: string, col: number, cells: number, hex: string): HTMLCanvasElement {
  const id = `${key}:${col}:${hex}`;
  let c = CACHE.get(id);
  if (c) return c;
  const src = mask.naturalWidth / cells;
  c = document.createElement('canvas');
  c.width = c.height = src;
  const g = c.getContext('2d')!;
  g.drawImage(mask, col * src, 0, src, src, 0, 0, src, src);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = hex;
  g.fillRect(0, 0, src, src);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(mask, col * src, 0, src, src, 0, 0, src, src);
  CACHE.set(id, c);
  return c;
}
