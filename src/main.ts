import './styles.css';
import { EARTH_TEXTURE_URL, FACTION_ORDER } from './constants';
import { Game } from './core/Game';
import { loadEarthData } from './map/EarthData';
import { loadAircraftSprites } from './render/AircraftSheets';
import { loadSoldierSprites } from './render/InfantryArt';
import type { FactionId } from './types';
import { FactionPicker } from './ui/FactionPicker';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found in index.html`);
  return el as T;
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

  try {
    // `?faction=usa|russia|china|europe` skips the picker (demos/tests).
    const preset = params.get('faction');
    const faction: FactionId = (FACTION_ORDER as readonly string[]).includes(preset ?? '')
      ? (preset as FactionId)
      : await new FactionPicker(document.body).choose();

    loading.textContent = 'Generating Earth…';
    loading.hidden = false;
    await soldiers; // sidebar cameos and units draw from the GI sheet
    await aircraft;
    await nextPaint(); // let the loading screen paint before the heavy terrain bake

    const game = await Game.create(
      { canvas: byId<HTMLCanvasElement>('game'), sidebar: byId('sidebar'), status: byId('status') },
      faction,
      earth,
    );
    game.start();
    loading.remove();

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

void boot();
