import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';

/**
 * Structures rendered in Blender / from 3D models (tools/blender/building_render.py, tools/monument_model_sheet.py)
 * into public/sprites/<file>.png in the building projection. The tool prints where the art-space origin
 * (u = v = z = 0) lies in the picture (art px) and the picture's px per art px. The pictures are downloaded before the
 * game starts (loadPictureArts), so the sprite cache draws them straight into the static sprite — shadow, click mask,
 * build-up animation and cameo all work as for the procedural art.
 */
export interface PictureSpec {
  readonly file: string;
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
  readonly footprint: { readonly w: number; readonly d: number };
  /** Height scale the sprite cache applies to this kind of structure (1.35 for main structures, 1 for flat pieces). */
  readonly zScale: number;
}

const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | null = null;

function image(file: string): HTMLImageElement {
  let i = images.get(file);
  if (!i) {
    i = new Image();
    i.dataset.src = `${import.meta.env.BASE_URL}sprites/${file}.png`;
    images.set(file, i);
  }
  return i;
}

/** Starts (once) and returns the downloads of every picture registered so far (failures are skipped). */
export function loadPictureArts(): Promise<void> {
  loading ??= Promise.all(
    [...images.values()].map(
      (i) =>
        new Promise<void>((resolve) => {
          i.onload = () => resolve();
          i.onerror = () => resolve();
          i.src = i.dataset.src ?? '';
        }),
    ),
  ).then(() => undefined);
  return loading;
}

/** Draws the picture with its art-space origin at the painter's origin. */
export function drawPicture(p: IsoPainter, spec: PictureSpec): void {
  const img = image(spec.file);
  if (!img.complete || img.naturalWidth === 0) return;
  const [ox, oy] = p.project(0, 0, 0);
  p.ctx.drawImage(img, ox - spec.originX, oy - spec.originY, img.naturalWidth / spec.scale, img.naturalHeight / spec.scale);
}

/** A structure that is just its picture (plus optional extra layers drawn on top, e.g. a flag). */
export function pictureArt(spec: PictureSpec, extra: Partial<Pick<BuildingArt, 'drawAnimated' | 'noRim' | 'noShadow'>> & { overlay?: (p: IsoPainter) => void } = {}): BuildingArt {
  image(spec.file);
  return {
    footprint: spec.footprint,
    // Tall enough for the whole picture above the origin (the cache multiplies this by its height scale).
    height: Math.ceil(spec.originY / spec.zScale) + 4,
    noRim: extra.noRim,
    noShadow: extra.noShadow,
    drawStatic(p) {
      drawPicture(p, spec);
      extra.overlay?.(p);
    },
    drawAnimated: extra.drawAnimated,
  };
}
