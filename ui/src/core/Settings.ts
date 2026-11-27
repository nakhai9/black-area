/** Player settings kept in this browser (pause menu → settings). */

const EDGE_LOCK_KEY = 'black-area.edgeLock';
const ZOOM_LOCK_KEY = 'black-area.zoomLock';
const SIDEBAR_SIDE_KEY = 'black-area.sidebarSide';

/** Where the sidebar stands: right edge (default) or along the bottom. */

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Screen lock: when the mouse leaves the browser window, the screen stops scrolling (off: it keeps scrolling). */
export const settings = {
  edgeLock: read(EDGE_LOCK_KEY) === '1',
  /** Zoom lock: the mouse wheel and +/- keys no longer zoom the view. */
  zoomLock: read(ZOOM_LOCK_KEY) !== '0',
};

/** No sidebar any more (no "sidebar position" option): an old 'bottom' choice is dropped. */
export function applySidebarSide(): void {
  document.body.classList.remove('sidebar-bottom');
  try {
    localStorage.removeItem(SIDEBAR_SIDE_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function setZoomLock(on: boolean): void {
  settings.zoomLock = on;
  window.dispatchEvent(new CustomEvent('black-area:zoomlock')); // keep the sidebar button and pause menu in sync
  try {
    localStorage.setItem(ZOOM_LOCK_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable: this page only */
  }
}

export function setEdgeLock(on: boolean): void {
  settings.edgeLock = on;
  try {
    localStorage.setItem(EDGE_LOCK_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable (private mode): the choice lasts this page only */
  }
}
