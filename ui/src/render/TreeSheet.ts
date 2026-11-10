/**
 * Tree sprite sheet (public/sprites/trees.webp): TREE_COLS columns of CW × CH px, one fir tree variety per column
 * (side views cut from a real-time billboard pack), the trunk base BASE_PAD px above the bottom edge, centred.
 * Drawn as upright billboards on the iso ground (TerrainRenderer.drawTrees); before the sheet loads the trees are
 * painted as simple canopies.
 */
export const TREE_COLS = 14;
const CW = 64;
const CH = 96;
const BASE_PAD = 2;

const image = new Image();
const url = `${import.meta.env.BASE_URL}sprites/trees.webp`;
let loaded: Promise<void> | null = null;

/** Starts (once) and returns the tree sheet download. */
export function loadTreeSprites(): Promise<void> {
  loaded ??= new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(`Could not load tree sprites '${url}'.`));
    image.src = url;
  });
  return loaded;
}

export function hasTreeSheet(): boolean {
  return image.complete && image.naturalWidth > 0;
}

/** Draws tree variety `col` with its trunk base at (x, y) iso px, `height` iso px tall (base to top). */
export function drawTree(ctx: CanvasRenderingContext2D, col: number, x: number, y: number, height: number): void {
  const scale = height / (CH - BASE_PAD);
  const w = CW * scale;
  const h = CH * scale;
  ctx.drawImage(image, (col % TREE_COLS) * CW, 0, CW, CH, x - w / 2, y - h + BASE_PAD * scale, w, h);
}
