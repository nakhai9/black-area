import {
  CAPITAL_LOCATIONS,
  DEMO_MODE,
  FACTION_ORDER,
} from "../constants";
import { FACTIONS } from "../factions";
import { getFlagTexture } from "../render/Flags";
import type { FactionId, FactionStats } from "../types";
import { pickSaveFile } from "./PauseMenu";
// The rules document at the repo root, served (and copied into the build) as a plain file.
import RULE_URL from "../../RULE.html?url";

/** Factions with an emblem image at `public/emblems/<id>.png`, shown before the flag on the card. */
const FACTION_EMBLEMS: ReadonlySet<FactionId> = new Set<FactionId>(["usa", "europe", "russia", "china", "islamic"]);
const STORAGE_KEY = "black-area:faction";
const SHOWN_STATS: readonly [keyof FactionStats, string][] = [
  ["unitSpeed", "Mobility"],
  ["armor", "Armor"],
  ["firepower", "Firepower"],
  ["range", "Range"],
  ["buildSpeed", "Build speed"],
];
const STAT_MAX = 1.5;

/** Last faction the player chose (per browser), if any. */
function rememberedFaction(): FactionId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && (FACTION_ORDER as readonly string[]).includes(v)
      ? (v as FactionId)
      : null;
  } catch {
    return null;
  }
}

function remember(id: FactionId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable (private mode) — not critical */
  }
}

/**
 * Pre-game modal: pick one of the four factions. Click a card or use
 * 1–4 / ←→ to highlight; only the "Deploy as …" button starts the game.
 */
export class FactionPicker {
  private readonly root: HTMLElement;
  private readonly cards = new Map<FactionId, HTMLElement>();
  private selected: FactionId;

  constructor(
    private readonly host: HTMLElement,
    initial: FactionId = rememberedFaction() ?? FACTION_ORDER[0] ?? "usa",
  ) {
    this.selected = initial;
    this.root = document.createElement("div");
    this.root.className = "fp-backdrop";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "fp-title");
    this.root.innerHTML = `
      <div class="fp-modal">
        <header class="fp-header">
          <div class="sb-logo"><img src="${import.meta.env.BASE_URL}logo.png" alt="Black Area" /></div>
          <h1 id="fp-title">Choose your side</h1>
        </header>
        <div class="fp-grid"></div>
        <footer class="fp-footer">
          <span class="fp-hint"><kbd>1</kbd>–<kbd>${FACTION_ORDER.length}</kbd> select</span>
          ${DEMO_MODE ? '<button class="fp-demo" type="button" title="Test game: play alone, the other nations do nothing; everything built, finances off">Test</button>' : ""}
          <button class="fp-desktop" type="button" title="Download the desktop version">Download Desktop</button>
          <button class="fp-guide" type="button" title="Open the game rules (RULE.html) in a new tab">Guide</button>
          <button class="fp-load" type="button" title="Continue a game saved to a .json file (pause menu → Save game)">Load game</button>
          <button class="fp-deploy" type="button">Deploy</button>
        </footer>
      </div>`;

    const grid = this.root.querySelector<HTMLElement>(".fp-grid");
    for (const [i, id] of FACTION_ORDER.entries()) {
      const card = this.buildCard(id, i + 1);
      grid?.append(card);
      this.cards.set(id, card);
    }
    this.highlight(initial);
  }

  /** Shows the modal and resolves with the confirmed faction (`demo`: dev-only solo test, no AI opponents). */
  choose(): Promise<{ faction: FactionId; demo: boolean }> {
    this.host.append(this.root);
    const deploy = this.root.querySelector<HTMLButtonElement>(".fp-deploy");
    this.cards.get(this.selected)?.focus();

    return new Promise((resolve) => {
      const confirm = (id: FactionId, demo = false): void => {
        window.removeEventListener("keydown", onKey);
        remember(id);
        this.root.classList.add("fp-leaving");
        setTimeout(() => this.root.remove(), 180);
        resolve({ faction: id, demo });
      };
      const onKey = (e: KeyboardEvent): void => {
        const n = Number(e.key);
        const idx = FACTION_ORDER.indexOf(this.selected);
        if (n >= 1 && n <= FACTION_ORDER.length)
          this.highlight(FACTION_ORDER[n - 1] ?? this.selected, true);
        else if (e.key === "ArrowRight" || e.key === "ArrowDown")
          this.highlight(
            FACTION_ORDER[(idx + 1) % FACTION_ORDER.length] ?? this.selected,
            true,
          );
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
          this.highlight(
            FACTION_ORDER[
              (idx - 1 + FACTION_ORDER.length) % FACTION_ORDER.length
            ] ?? this.selected,
            true,
          );
        else return;
        e.preventDefault();
      };
      window.addEventListener("keydown", onKey);
      deploy?.addEventListener("click", () => confirm(this.selected));
      this.root
        .querySelector(".fp-load")
        ?.addEventListener("click", () => pickSaveFile());
      this.root
        .querySelector(".fp-desktop")
        ?.addEventListener("click", () =>
          window.alert("The desktop version is under development. Coming soon!"),
        );
      this.root
        .querySelector(".fp-guide")
        ?.addEventListener("click", () =>
          window.open(RULE_URL, "_blank", "noopener"),
        );
      this.root
        .querySelector(".fp-demo")
        ?.addEventListener("click", () => confirm(this.selected, true));
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
    if (deploy) deploy.textContent = `Deploy as ${f.shortName}`;
    if (focus) this.cards.get(id)?.focus();
  }

  private buildCard(id: FactionId, hotkey: number): HTMLElement {
    const f = FACTIONS[id];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "fp-card";
    card.setAttribute("role", "radio");
    card.style.setProperty("--team", f.colors.primary);
    const stats = SHOWN_STATS.map(
      ([k, label]) =>
        `<li><span>${label}</span><div class="sb-bar"><i style="width:${(f.stats[k] / STAT_MAX) * 100}%"></i></div></li>`,
    ).join("");
    card.innerHTML = `
      <kbd class="fp-key">${hotkey}</kbd>
      <div class="fp-ident">
        <span class="flag-badge">
          ${FACTION_EMBLEMS.has(id) ? `<img class="fp-emblem" src="${import.meta.env.BASE_URL}emblems/${id}.png" alt="">` : ""}
          <img class="fp-flag" src="${getFlagTexture(id).toDataURL()}" alt="">
        </span>
      </div>
      <h2>${f.name}</h2>
      <div class="fp-capital">${f.capital.name} · ${CAPITAL_LOCATIONS[id].name}</div>

      <ul class="sb-stats fp-stats">${stats}</ul>
`;
    return card;
  }
}
