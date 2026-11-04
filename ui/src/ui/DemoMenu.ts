import { GAME_VERSION } from "../constants";
import { loadPictureArts } from "../render/sprites/PictureArt";
import { t } from "../i18n";
import { showBuildingGallery } from "./BuildingGallery";
import { showMapView } from "./MapView";
import { showUnitGallery } from "./UnitGallery";

/**
 * DEMO_MODE start screen (shown only in demo mode; the normal game keeps its faction picker): two buttons —
 * Shop opens the galleries (buildings, units, world map), Play demo goes straight into the demo game.
 * Resolves when Play demo is clicked.
 */
export function showDemoMenu(host: HTMLElement): Promise<void> {
  const root = document.createElement("div");
  root.className = "fp-backdrop";
  root.innerHTML = `
    <div class="fp-modal dm-modal">
      <span class="fp-version">v${GAME_VERSION}</span>
      <header class="fp-header">
        <div class="sb-logo"><img src="${import.meta.env.BASE_URL}logo.png" alt="Black Area" /></div>
      </header>
      <footer class="fp-footer dm-footer">
        <button class="fp-load dm-shop" type="button">${t("Shop")}</button>
        <button class="fp-deploy dm-play" type="button">${t("Play demo")}</button>
      </footer>
    </div>`;
  host.append(root);
  return new Promise((resolve) => {
    root.querySelector(".dm-shop")?.addEventListener("click", () => {
      root.remove();
      showShop(host);
    });
    root.querySelector(".dm-play")?.addEventListener("click", () => {
      root.remove();
      resolve();
    });
  });
}

/** Shop: the buildings / units / world-map galleries with a bar to switch between them; Back reloads to the demo menu. */
function showShop(host: HTMLElement): void {
  const style = document.createElement("style");
  style.textContent = `
    .dm-bar { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%); z-index: 10; display: flex; gap: 8px;
      padding: 6px; border-radius: 8px; background: rgba(10, 16, 24, 0.85); }
    .dm-bar button { padding: 6px 14px; border: 1px solid #56626d; border-radius: 6px; background: #1d2731; color: #d8dee4; cursor: pointer; font: 13px system-ui, sans-serif; }
    .dm-bar button.on { background: #3b6ea5; border-color: #3b6ea5; }
  `;
  document.head.append(style);
  const content = document.createElement("div");
  const bar = document.createElement("div");
  bar.className = "dm-bar";
  const tabs: [string, () => unknown][] = [
    [t("Buildings"), () => showBuildingGallery(content)],
    [t("Units"), () => showUnitGallery(content)],
    [t("World map"), () => showMapView(content)],
  ];
  const back = document.createElement("button");
  back.textContent = `← ${t("Back")}`;
  back.addEventListener("click", () => location.reload());
  bar.append(back);
  for (const [label, open] of tabs) {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", () => {
      bar.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      void open();
    });
    bar.append(b);
  }
  // The galleries cache each picture the first time they draw it: wait for the rendered pictures to arrive first.
  content.textContent = t("Loading pictures…");
  content.style.cssText = "padding: 24px; color: #d8dee4";
  host.replaceChildren(content, bar);
  void loadPictureArts().then(() => {
    content.style.cssText = "";
    (bar.children[1] as HTMLButtonElement).click();
  });
}
