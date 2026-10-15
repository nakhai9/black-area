/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" starts straight into a demo game (see DEMO_MODE in constants.ts). */
  readonly VITE_DEMO_MODE?: string;
  /** Demo nation number 1–5 (see DEMO_FACTION in constants.ts). */
  readonly VITE_DEMO_FACTION?: string;
  /** Multiplayer server address, http(s):// or ws(s):// (see src/net/NetClient.ts). */
  readonly VITE_GAME_SERVER_API?: string;
}
