import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/** GAME_VERSION from src/constants.ts: the one source of the version number. */
const GAME_VERSION = /GAME_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(new URL('./src/constants.ts', import.meta.url), 'utf8'))![1];

export default defineConfig({
  plugins: [
    {
      // index.html's <title> always shows GAME_VERSION (dev and build), whatever number is written in the file.
      name: 'game-version-title',
      transformIndexHtml: (html) => html.replace(/(<title>[^<]*?v)\d+\.\d+\.\d+/, `$1${GAME_VERSION}`),
    },
  ],
});
