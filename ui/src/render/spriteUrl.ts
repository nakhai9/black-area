import { SPRITE_FOLDERS } from './spriteManifest';

/**
 * URL of a sprite file (`name.webp`, or a bare name) under public/sprites: each nation's sprites sit in
 * sprites/<nation>/[<group>/] (see tools/organize_sprites.py), shared ones at the root.
 */
export function spriteUrl(file: string): string {
  const dir = SPRITE_FOLDERS[file.replace(/\.(webp|png)$/, '')];
  return `${import.meta.env.BASE_URL}sprites/${dir ? `${dir}/` : ''}${file}`;
}
