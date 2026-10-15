import './styles.css';
import { t } from './i18n';
import { DEMO_FACTION, DEMO_MODE,EARTH_TEXTURE_URL, FACTION_ORDER } from './constants';
import { SoundSystem } from './audio/SoundSystem';
import { Game } from './core/Game';
import { loadEarthData } from './map/EarthData';
import { loadAircraftSprites } from './render/AircraftSheets';
import { loadBombSprites } from './render/BombSheets';
import { loadExplosionSprites } from './render/ExplosionSheet';
import { loadMissileSprites } from './render/MissileSheet';
import { loadShellSprites } from './render/ShellSheet';
import { loadBulletSprites } from './render/BulletSheet';
import { loadRepairSprites } from './render/RepairSheets';
import { loadMantisSprites } from './render/MantisSheet';
import { loadTruckSprites } from './render/TruckSheets';
import { loadTankSprites } from './render/TankSheets';
import { loadBunkerSprites } from './render/BunkerSheet';
import { loadSoldierSprites } from './render/InfantryArt';
import type { FactionId } from './types';
import { FactionPicker } from './ui/FactionPicker';
import { showBuildingGallery } from './ui/BuildingGallery';
import { showUnitGallery } from './ui/UnitGallery';
import type { SaveFile } from './core/SaveCodec';
import { LANGUAGE_RELOAD_KEY, PENDING_SAVE_KEY } from './ui/PauseMenu';
import { confirmLoadedGame } from './ui/LoadConfirm';
import type { MultiplayerStart } from './ui/MultiplayerLobby';
import { FACTIONS } from './factions';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found in index.html`);
  return el as T;
}

/** Alt+F: full screen on / off (works on every screen: faction picker, game, gallery). */
window.addEventListener('keydown', (e) => {
  if (!e.altKey || e.code !== 'KeyF' || e.repeat) return;
  e.preventDefault();
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  else void document.documentElement.requestFullscreen().catch(() => undefined);
});

/** Multiplayer: every change of the loading bar is also sent to the room, so the others see how far this machine is. */
let reportProgress: ((pct: number) => void) | null = null;

/** Loading screen progress bar (0–100) under "Generating Earth…". */
function setProgress(pct: number): void {
  const p = Math.round(Math.max(0, Math.min(100, pct)));
  reportProgress?.(p);
  const fill = document.getElementById('loading-fill');
  const label = document.getElementById('loading-pct');
  if (fill) fill.style.width = `${p}%`;
  if (label) label.textContent = `${p}%`;
}

/**
 * Multiplayer: this machine has loaded the match; wait on the loading screen, showing everyone's progress, until the
 * server says every machine in the room has loaded (`go`), so the match begins on all of them at the same moment.
 */
function waitForPlayers(mp: MultiplayerStart, onLeft: (faction: FactionId) => void): Promise<void> {
  const box = document.querySelector('#loading .ld-box');
  const list = document.createElement('ul');
  list.className = 'ld-players';
  box?.append(list);
  byId('loading-text').textContent = t('Waiting for the other players…');
  const names = new Map(mp.room.players.map((p) => [p.id, p]));
  return new Promise((resolve, reject) => {
    mp.net.onMessage = (msg) => {
      if (msg.t === 'loading') {
        list.innerHTML = msg.players
          .map((p) => {
            const who = names.get(p.id);
            const label = who ? `${who.name.replace(/[&<>"']/g, '')} · ${FACTIONS[who.faction].shortName}` : '?';
            return `<li class="${p.loaded ? 'done' : ''}"><span>${label}</span><b>${p.loaded ? t('Ready') : `${p.pct}%`}</b></li>`;
          })
          .join('');
      } else if (msg.t === 'left') onLeft(msg.faction);
      else if (msg.t === 'go') {
        list.remove();
        resolve();
      }
    };
    mp.net.onClose = () => reject(new Error(t('Disconnected from the multiplayer server')));
    mp.net.send({ t: 'loaded' });
  });
}

const nextPaint = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function boot(): Promise<void> {
  const loading = byId('loading');
  const params = new URLSearchParams(location.search);

  // Start downloading the Earth texture while the player picks a side.
  const earth = loadEarthData(EARTH_TEXTURE_URL);
  earth.catch(() => undefined); // surfaced below once awaited
  const soldiers = loadSoldierSprites();
  soldiers.catch(() => undefined);
  const aircraft = loadAircraftSprites();
  aircraft.catch(() => undefined);
  const tanks = loadTankSprites();
  tanks.catch(() => undefined);
  loadMantisSprites().catch(() => undefined);
  const repairs = loadRepairSprites();
  repairs.catch(() => undefined);
  loadBunkerSprites().catch(() => undefined);
  const trucks = loadTruckSprites();
  trucks.catch(() => undefined);
  loadBombSprites().catch(() => undefined);
  loadExplosionSprites().catch(() => undefined);
  loadMissileSprites().catch(() => undefined);
  loadShellSprites().catch(() => undefined);
  loadBulletSprites().catch(() => undefined);

  // Music starts on the faction picker: browsers only allow audio after the first click or key press.
  const sound = new SoundSystem();
  const unlock = (): void => sound.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  try {
    // `?faction=usa|russia|china|europe|islamic` skips the picker (demos/tests).
    const preset = params.get('faction');
    // A save picked with "Load game" (start screen or pause menu) boots straight into it.
    let pending: SaveFile | null = null;
    try {
      const text = sessionStorage.getItem(PENDING_SAVE_KEY);
      sessionStorage.removeItem(PENDING_SAVE_KEY);
      if (text) pending = JSON.parse(text) as SaveFile;
    } catch {
      pending = null;
    }
    const { faction, demo, mp } = pending
      ? { faction: pending.faction, demo: false }
      : (FACTION_ORDER as readonly string[]).includes(preset ?? '')
      ? { faction: preset as FactionId, demo: false }
      : DEMO_MODE
        ? { faction: FACTION_ORDER[DEMO_FACTION - 1] ?? 'russia', demo: true } // DEMO_MODE: straight into a demo game as DEMO_FACTION
        : await new FactionPicker(document.body).choose();

    // A picked save is confirmed first; only then is the world generated and the game loaded into it.
    // A reload only to switch the language goes straight back into the game, without asking.
    let languageReload = false;
    try {
      languageReload = sessionStorage.getItem(LANGUAGE_RELOAD_KEY) === '1';
      sessionStorage.removeItem(LANGUAGE_RELOAD_KEY);
    } catch {
      languageReload = false;
    }
    if (pending && !languageReload) {
      loading.hidden = true;
      await confirmLoadedGame({ faction: pending.faction, savedAt: pending.savedAt });
    }
    // Players who leave before this machine has built the match are taken off the map once it exists.
    const leftEarly: FactionId[] = [];
    if (mp) {
      mp.net.onMessage = (msg) => {
        if (msg.t === 'left') leftEarly.push(msg.faction);
      };
      let sent = -1;
      reportProgress = (pct) => {
        if (pct !== sent) mp.net.send({ t: 'progress', pct: (sent = pct) });
      };
    }
    byId('loading-text').textContent = t('Generating Earth…');
    loading.hidden = false;
    // Downloads fill the bar to 80%; the terrain bake (synchronous) takes it to 100%.
    const steps = [earth, soldiers, aircraft, tanks, repairs, trucks]; // sidebar cameos and units draw from the GI sheet
    let done = 0;
    setProgress(0);
    await Promise.all(steps.map((p) => p.then(() => setProgress((++done / steps.length) * 80))));
    setProgress(90);
    await nextPaint(); // let the loading screen paint before the heavy terrain bake

    const game = await Game.create(
      { canvas: byId<HTMLCanvasElement>('game'), sidebar: byId('sidebar'), status: byId('status') },
      faction,
      earth,
      sound,
      demo,
      // Multiplayer: only the room's nations play; the others' capitals stand as occupiable ones.
      mp?.room.players.map((p) => p.faction),
    );
    if (pending) game.importSave(pending);
    setProgress(100);
    await nextPaint();
    if (mp) {
      reportProgress = null;
      // A player who leaves (while loading or in the match) loses: their nation is taken off the map.
      const onLeft = (f: FactionId): void => game.nationLeft(f);
      leftEarly.forEach(onLeft);
      await waitForPlayers(mp, onLeft);
      mp.net.onMessage = (msg) => {
        if (msg.t === 'left') onLeft(msg.faction);
      };
    }
    loading.remove();
    document.body.classList.remove('pregame');
    game.start();

    // `?landmark=1..5&zoom=2` opens the game focused somewhere.
    const zoom = Number(params.get('zoom'));
    if (zoom > 0) game.camera.setZoom(zoom);
    const landmark = Number(params.get('landmark'));
    if (landmark >= 1) game.focusLandmark(landmark - 1);

    if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game;
  } catch (err) {
    loading.hidden = false;
    loading.textContent = err instanceof Error ? err.message : String(err);
    loading.classList.add('error');
    throw err;
  }
}

// `?view=buildings`: gallery of every structure of every nation instead of the game.
// `?view=units`: gallery of every soldier, vehicle and aircraft of every nation.
const view = new URLSearchParams(location.search).get('view');
if (view === 'buildings') showBuildingGallery(document.body);
else if (view === 'units') void showUnitGallery(document.body);
else void boot();
