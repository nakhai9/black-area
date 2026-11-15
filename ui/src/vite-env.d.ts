/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" starts straight into a demo game (see DEMO_MODE in constants.ts). */
  readonly VITE_DEMO_MODE?: string;
  /** "victory" | "defeat": open the end-of-war letter as soon as the game starts (to test its look). */
  readonly VITE_TEST_END_MODAL?: string;
  /** Demo nation code: us, ru, cn, eu, ui (see DEMO_FACTION in constants.ts). */
  readonly VITE_DEMO_FACTION?: string;
  /** "true" (with VITE_DEMO_MODE): every nation set up in the demo, and the player can command any of them. */
  readonly VITE_DEMO_ALL_FACTIONS?: string;
  /** Multiplayer server address, http(s):// or ws(s):// (see src/net/NetClient.ts). */
  readonly VITE_GAME_SERVER_API?: string;
}
