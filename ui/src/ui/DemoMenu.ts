import { GAME_VERSION } from "../constants";
import { t } from "../i18n";
import { ASSETS_REOPEN_KEY, showAssetsPage } from "./AssetsPage";

/**
 * DEMO_MODE start screen (shown only in demo mode; the normal game keeps its faction picker): two buttons —
 * Play demo goes straight into the demo game, Game assets opens the assets page (configuration of every soldier,
 * vehicle and structure, and the Research Lab; see AssetsPage). After a save there the page reopens by itself.
 * Resolves when Play demo is clicked.
 */
export function showDemoMenu(host: HTMLElement): Promise<void> {
  let reopen = false;
  try {
    reopen = sessionStorage.getItem(ASSETS_REOPEN_KEY) === "1";
    sessionStorage.removeItem(ASSETS_REOPEN_KEY);
  } catch {
    reopen = false;
  }
  if (reopen) {
    void showAssetsPage(host);
    return new Promise(() => undefined);
  }
  const root = document.createElement("div");
  root.className = "fp-backdrop";
  root.innerHTML = `
    <div class="fp-modal dm-modal">
      <span class="fp-version">v${GAME_VERSION}</span>
      <header class="fp-header">
        <div class="sb-logo"><img src="${import.meta.env.BASE_URL}logo.png" alt="Black Area" /></div>
      </header>
      <footer class="fp-footer dm-footer">
        <button class="fp-deploy dm-play" type="button">${t("Play demo")}</button>
        <button class="fp-load dm-assets" type="button">${t("Game assets")}</button>
      </footer>
    </div>`;
  host.append(root);
  return new Promise((resolve) => {
    root.querySelector(".dm-assets")?.addEventListener("click", () => {
      root.remove();
      void showAssetsPage(host);
    });
    root.querySelector(".dm-play")?.addEventListener("click", () => {
      root.remove();
      resolve();
    });
  });
}
