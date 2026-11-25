import type { IsoPainter } from '../IsoPainter';
import type { BuildingArt } from './BuildingArt';
import { spriteUrl } from '../spriteUrl';
import type { FactionId } from '../../types';
import { recolorPixels } from './index';

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
  /** One picture shared by several nations: drawn with its team line (`from`'s colours) in `to`'s colours. */
  readonly recolor?: { readonly from: FactionId; readonly to: FactionId };
}

const images = new Map<string, HTMLImageElement>();
let loading: Promise<void> | null = null;

function image(file: string): HTMLImageElement {
  let i = images.get(file);
  if (!i) {
    i = new Image();
    i.dataset.src = spriteUrl(`${file}.webp`);
    images.set(file, i);
  }
  return i;
}

/** Registers a picture drawn only later (e.g. animation frames) so loadPictureArts downloads it too. */
export function preloadPicture(file: string): void {
  image(file);
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

const recolored = new Map<string, HTMLCanvasElement>();

/** The picture with its team line recoloured (made once per file and nation, after the download). */
function recoloredImage(img: HTMLImageElement, file: string, from: FactionId, to: FactionId): HTMLCanvasElement {
  const key = `${file}%${from}>${to}`;
  let c = recolored.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, c.width, c.height);
    recolorPixels(data.data, to, from);
    ctx.putImageData(data, 0, 0);
    recolored.set(key, c);
  }
  return c;
}

/** Draws the picture with its art-space origin at the painter's origin. */
export function drawPicture(p: IsoPainter, spec: PictureSpec): void {
  const img = image(spec.file);
  if (!img.complete || img.naturalWidth === 0) return;
  const src = spec.recolor && spec.recolor.from !== spec.recolor.to ? recoloredImage(img, spec.file, spec.recolor.from, spec.recolor.to) : img;
  const [ox, oy] = p.project(0, 0, 0);
  p.ctx.drawImage(src, ox - spec.originX, oy - spec.originY, img.naturalWidth / spec.scale, img.naturalHeight / spec.scale);
}

/** A structure that is just its picture (plus optional extra layers drawn on top, e.g. a flag). */
type PictureExtra = Partial<Pick<BuildingArt, 'drawAnimated' | 'noRim' | 'noShadow' | 'recolorWhole'>> & {
  overlay?: (p: IsoPainter) => void;
  /** Pictures of the damage stages (stage 1 first), rendered from the same script with the same origin. */
  damageFiles?: readonly string[];
};

export function pictureArt(spec: PictureSpec, extra: PictureExtra = {}): BuildingArt {
  image(spec.file);
  const { damageFiles, ...rest } = extra;
  for (const f of damageFiles ?? []) image(f);
  return {
    damaged: damageFiles?.length
      ? (stage) => pictureArt({ ...spec, file: damageFiles[Math.min(damageFiles.length, Math.max(1, stage)) - 1]! }, rest)
      : undefined,
    footprint: spec.footprint,
    // Tall enough for the whole picture above the origin (the cache multiplies this by its height scale).
    height: Math.ceil(spec.originY / spec.zScale) + 4,
    noRim: extra.noRim,
    noShadow: extra.noShadow,
    noFinish: true,
    // A picture has no roof layer to mask by: a taken one recolours every pixel in the old nation's hues (see recolorPixels).
    recolorWhole: extra.recolorWhole ?? true,
    drawStatic(p) {
      drawPicture(p, spec);
      extra.overlay?.(p);
    },
    drawAnimated: extra.drawAnimated,
  };
}
