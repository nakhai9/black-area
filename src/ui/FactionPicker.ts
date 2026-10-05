import {
  CAPITAL_LOCATIONS,
  CURRENCY,
  FACTION_ORDER,
  OIL_DERRICK_COUNT,
  OIL_DERRICK_INCOME,
  OIL_MINE_SECONDS,
  OIL_REST_SECONDS,
} from '../constants';
import { FACTIONS } from '../factions';
import { getFlagTexture } from '../render/Flags';
import type { FactionId, FactionStats } from '../types';

const STORAGE_KEY = 'black-area:faction';
const SHOWN_STATS: readonly [keyof FactionStats, string][] = [
  ['unitSpeed', 'Mobility'],
  ['armor', 'Armor'],
  ['firepower', 'Firepower'],
  ['range', 'Range'],
  ['buildSpeed', 'Build speed'],
];
const STAT_MAX = 1.5;

/** Last faction the player chose (per browser), if any. */
export function rememberedFaction(): FactionId | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && (FACTION_ORDER as readonly string[]).includes(v) ? (v as FactionId) : null;
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
 * 1–4 / ←→ to highlight, Enter or "Deploy" to confirm.
 */
export class FactionPicker {
  private readonly root: HTMLElement;
  private readonly cards = new Map<FactionId, HTMLElement>();
  private selected: FactionId;

  constructor(
    private readonly host: HTMLElement,
    initial: FactionId = rememberedFaction() ?? FACTION_ORDER[0] ?? 'usa',
  ) {
    this.selected = initial;
    this.root = document.createElement('div');
    this.root.className = 'fp-backdrop';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'fp-title');
    this.root.innerHTML = `
      <div class="fp-modal">
        <header class="fp-header">
          <div class="sb-logo">BLACK<span>AREA</span></div>
          <h1 id="fp-title">Choose your side</h1>
          <p>Every nation starts with 0 ${CURRENCY}. Oil derricks are the only source of money (+${OIL_DERRICK_INCOME} ${CURRENCY}/s each while pumping): they pump ${OIL_MINE_SECONDS} s, then rest ${OIL_REST_SECONDS} s. Three per nation, four for Europe, which manages the World Bank.</p>
        </header>
        <div class="fp-grid"></div>
        <footer class="fp-footer">
          <span class="fp-hint"><kbd>1</kbd>–<kbd>4</kbd> select · <kbd>Enter</kbd> deploy</span>
          <button class="fp-deploy" type="button">Deploy</button>
        </footer>
      </div>`;

    const grid = this.root.querySelector<HTMLElement>('.fp-grid');
    for (const [i, id] of FACTION_ORDER.entries()) {
      const card = this.buildCard(id, i + 1);
      grid?.append(card);
      this.cards.set(id, card);
    }
    this.highlight(initial);
  }

  /** Shows the modal and resolves with the confirmed faction. */
  choose(): Promise<FactionId> {
    this.host.append(this.root);
    const deploy = this.root.querySelector<HTMLButtonElement>('.fp-deploy');
    this.cards.get(this.selected)?.focus();

    return new Promise((resolve) => {
      const confirm = (id: FactionId): void => {
        window.removeEventListener('keydown', onKey);
        remember(id);
        this.root.classList.add('fp-leaving');
        setTimeout(() => this.root.remove(), 180);
        resolve(id);
      };
      const onKey = (e: KeyboardEvent): void => {
        const n = Number(e.key);
        const idx = FACTION_ORDER.indexOf(this.selected);
        if (n >= 1 && n <= FACTION_ORDER.length) this.highlight(FACTION_ORDER[n - 1] ?? this.selected, true);
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown')
          this.highlight(FACTION_ORDER[(idx + 1) % FACTION_ORDER.length] ?? this.selected, true);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
          this.highlight(FACTION_ORDER[(idx - 1 + FACTION_ORDER.length) % FACTION_ORDER.length] ?? this.selected, true);
        else if (e.key === 'Enter') confirm(this.selected);
        else return;
        e.preventDefault();
      };
      window.addEventListener('keydown', onKey);
      deploy?.addEventListener('click', () => confirm(this.selected));
      for (const [id, card] of this.cards) {
        card.addEventListener('click', () => this.highlight(id));
        card.addEventListener('dblclick', () => confirm(id));
      }
    });
  }

  private highlight(id: FactionId, focus = false): void {
    this.selected = id;
    for (const [fid, card] of this.cards) {
      const on = fid === id;
      card.classList.toggle('selected', on);
      card.setAttribute('aria-checked', String(on));
    }
    const f = FACTIONS[id];
    this.root.style.setProperty('--team', f.colors.primary);
    const deploy = this.root.querySelector<HTMLButtonElement>('.fp-deploy');
    if (deploy) deploy.textContent = `Deploy as ${f.shortName}`;
    if (focus) this.cards.get(id)?.focus();
  }

  private buildCard(id: FactionId, hotkey: number): HTMLElement {
    const f = FACTIONS[id];
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'fp-card';
    card.setAttribute('role', 'radio');
    card.style.setProperty('--team', f.colors.primary);
    const stats = SHOWN_STATS.map(
      ([k, label]) =>
        `<li><span>${label}</span><div class="sb-bar"><i style="width:${(f.stats[k] / STAT_MAX) * 100}%"></i></div></li>`,
    ).join('');
    const oil = ['Straight row, safest inland ground', `Pump ${OIL_MINE_SECONDS} s · rest ${OIL_REST_SECONDS} s`].map((t) => `<li>${t}</li>`).join('');
    card.innerHTML = `
      <kbd class="fp-key">${hotkey}</kbd>
      <img class="fp-flag" src="${getFlagTexture(id).toDataURL()}" alt="">
      <h2>${f.name}</h2>
      <div class="fp-capital">${f.capital.name} · ${CAPITAL_LOCATIONS[id].name}</div>
      <p class="fp-doctrine">${f.doctrine}</p>
      <ul class="sb-stats fp-stats">${stats}</ul>
      <div class="fp-oil-title">Oil derricks · ${OIL_DERRICK_COUNT[id]} × +${OIL_DERRICK_INCOME} ${CURRENCY}/s</div>
      <ul class="fp-oil">${oil}</ul>`;
    return card;
  }
}
