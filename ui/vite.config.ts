import { readFileSync, writeFileSync } from 'node:fs';
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
    {
      // Demo menu → Assets game saves its configuration (src/data/game-assets.json) through the dev server.
      name: 'game-assets-writer',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__game-assets', (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end();
            return;
          }
          let body = '';
          req.on('data', (c) => (body += c));
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body) as { assets?: unknown; research?: unknown };
              if (typeof parsed.assets !== 'object' || !Array.isArray(parsed.research)) throw new Error('bad shape');
              writeFileSync(new URL('./src/data/game-assets.json', import.meta.url), `${JSON.stringify(parsed, null, 2)}\n`);
              res.statusCode = 204;
            } catch {
              res.statusCode = 400;
            }
            res.end();
          });
        });
      },
    },
  ],
});
