import {
  CAPITAL_LOCATIONS,
  DEMO_MODE,
  FACTION_ORDER,
  GAME_VERSION,
} from "../constants";
import { FACTIONS } from "../factions";
import { factionBadgeHtml } from "./FactionBadge";
import type { FactionId, FactionStats } from "../types";
import { pickSaveFile } from "./PauseMenu";
import { getLang, languageSelect, setLang, t } from "../i18n";
// The rules document at the repo root, served (and copied into the build) as a plain file.
import RULE_URL from "../../RULE.html?url";
import RULE_EN_URL from "../../RULE.en.html?url";

const STORAGE_KEY = "black-area:faction";
const SHOWN_STATS: readonly [keyof FactionStats, string][] = [
  ["unitSpeed", "Mobility"],
  ["armor", "Armor"],
  ["firepower", "Firepower"],
  ["range", "Range"],
  ["buildSpeed", "Build speed"],
];
const STAT_MAX = 1.5;
/** Cards from west to east, by the longitude of each nation's capital. */
const CARD_ORDER: readonly FactionId[] = [...FACTION_ORDER].sort((a, b) => CAPITAL_LOCATIONS[a].lon - CAPITAL_LOCATIONS[b].lon);

function remember(id: FactionId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable (private mode) — not critical */
  }
}

/**
 * Pre-game modal: pick one of the four factions. Click a card or use
 * 1–4 / ←→ to highlight; only the "Start as …" button starts the game.
 */
export class FactionPicker {
  private readonly root: HTMLElement;
  private readonly cards = new Map<FactionId, HTMLElement>();
  /** No side is picked when the menu opens: the player clicks one (or uses the arrow keys) before Deploy. */
  private selected: FactionId | null = null;

  constructor(private readonly host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "fp-backdrop";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "fp-title");
    this.root.innerHTML = `
      <div class="fp-modal">
        <span class="fp-version" title="${t("Game version of this build")}">v${GAME_VERSION}</span>
        <header class="fp-header">
          <div class="sb-logo"><img src="${import.meta.env.BASE_URL}logo.png" alt="Black Area" /></div>
          <h1 id="fp-title">${t("Choose your side")}</h1>
        </header>
        <div class="fp-grid"></div>
        <footer class="fp-footer">
          ${DEMO_MODE ? `<button class="fp-demo" type="button" title="${t("Test game: play alone, the other nations do nothing; everything built, finances off")}">${t("Test")}</button>` : ""}
          <button class="fp-desktop" type="button" hidden title="${t("Download the desktop version")}">${t("Download Desktop")}</button>
          <button class="fp-guide" type="button" title="${t("Open the game rules (RULE.html) in a new tab")}">${t("Guide")}</button>
          <button class="fp-load" type="button" title="${t("Continue a game saved to a .json file (pause menu → Save game)")}">${t("Load saved game")}</button>
          <button class="fp-deploy" type="button">${t("Start")}</button>
        </footer>
      </div>`;

    const grid = this.root.querySelector<HTMLElement>(".fp-grid");
    for (const id of CARD_ORDER) {
      const card = this.buildCard(id);
      grid?.append(card);
      this.cards.set(id, card);
    }
    // Main menu language picker: the page reloads in the chosen language.
    this.root.querySelector(".fp-footer")?.prepend(
      languageSelect((lang) => {
        setLang(lang);
        window.location.reload();
      }),
    );
    const deploy = this.root.querySelector<HTMLButtonElement>(".fp-deploy");
    if (deploy) deploy.hidden = true;
    const demo = this.root.querySelector<HTMLButtonElement>(".fp-demo");
    if (demo) demo.hidden = true;
  }

  /** Shows the modal and resolves with the confirmed faction (`demo`: dev-only solo test, no AI opponents). */
  choose(): Promise<{ faction: FactionId; demo: boolean }> {
    this.host.append(this.root);
    const deploy = this.root.querySelector<HTMLButtonElement>(".fp-deploy");

    return new Promise((resolve) => {
      const confirm = (id: FactionId, demo = false): void => {
        window.removeEventListener("keydown", onKey);
        remember(id);
        this.root.classList.add("fp-leaving");
        setTimeout(() => this.root.remove(), 180);
        resolve({ faction: id, demo });
      };
      const onKey = (e: KeyboardEvent): void => {
        const n = CARD_ORDER.length;
        const idx = this.selected ? CARD_ORDER.indexOf(this.selected) : -1;
        let next: FactionId | undefined;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") next = CARD_ORDER[(idx + 1) % n];
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = CARD_ORDER[idx < 0 ? n - 1 : (idx - 1 + n) % n];
        else return;
        if (next) this.highlight(next, true);
        e.preventDefault();
      };
      window.addEventListener("keydown", onKey);
      deploy?.addEventListener("click", () => this.selected && confirm(this.selected));
      this.root
        .querySelector(".fp-load")
        ?.addEventListener("click", () => pickSaveFile());
      this.root
        .querySelector(".fp-desktop")
        ?.addEventListener("click", () =>
          window.alert(t("The desktop version is under development. Coming soon!")),
        );
      this.root
        .querySelector(".fp-guide")
        ?.addEventListener("click", () =>
          window.open(getLang() === "vi" ? RULE_URL : RULE_EN_URL, "_blank", "noopener"),
        );
      this.root
        .querySelector(".fp-demo")
        ?.addEventListener("click", () => this.selected && confirm(this.selected, true));
      for (const [id, card] of this.cards) {
        card.addEventListener("click", () => this.highlight(id));
      }
    });
  }

  private highlight(id: FactionId, focus = false): void {
    this.selected = id;
    for (const [fid, card] of this.cards) {
      const on = fid === id;
      card.classList.toggle("selected", on);
      card.setAttribute("aria-checked", String(on));
    }
    const f = FACTIONS[id];
    this.root.style.setProperty("--team", f.colors.primary);
    this.root.dataset.faction = id;
    const deploy = this.root.querySelector<HTMLButtonElement>(".fp-deploy");
    if (deploy) {
      deploy.textContent = t("Start as {name}", { name: f.shortName });
      deploy.hidden = false;
    }
    const demo = this.root.querySelector<HTMLButtonElement>(".fp-demo");
    if (demo) demo.hidden = false;
    if (focus) this.cards.get(id)?.focus();
  }

  private buildCard(id: FactionId): HTMLElement {
    const f = FACTIONS[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fp-card";
    card.setAttribute("role", "radio");
    card.style.setProperty("--team", f.colors.primary);
    const stats = SHOWN_STATS.map(
      ([k, label]) =>
        `<li><span>${t(label)}</span><div class="sb-bar"><i style="width:${((f.stats[k] ?? 1) / STAT_MAX) * 100}%"></i></div></li>`,
    ).join("");
    card.innerHTML = `
      <div class="fp-ident">
        ${factionBadgeHtml(id, "md")}
      </div>
      <h2>${f.name}</h2>
      <div class="fp-capital">${f.capital.name} · ${CAPITAL_LOCATIONS[id].name}</div>

      <ul class="sb-stats fp-stats">${stats}</ul>
`;
    return card;
  }
}
