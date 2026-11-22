/** Player settings kept in this browser (pause menu → settings). */

const EDGE_LOCK_KEY = 'black-area.edgeLock';
const ZOOM_LOCK_KEY = 'black-area.zoomLock';
const SIDEBAR_SIDE_KEY = 'black-area.sidebarSide';

/** Where the sidebar stands: right edge (default) or along the bottom. */
export type SidebarSide = 'right' | 'bottom';

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
  sidebarSide: (read(SIDEBAR_SIDE_KEY) === 'bottom' ? 'bottom' : 'right') as SidebarSide,
};

/** Puts the layout class on <body> (CSS moves the sidebar, the corner bar and the air tools). */
export function applySidebarSide(): void {
  document.body.classList.toggle('sidebar-bottom', settings.sidebarSide === 'bottom');
}

export function setSidebarSide(side: SidebarSide): void {
  settings.sidebarSide = side;
  applySidebarSide();
  window.dispatchEvent(new Event('resize')); // canvas / minimap re-measure
  try {
    localStorage.setItem(SIDEBAR_SIDE_KEY, side);
  } catch {
    /* storage unavailable: this page only */
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
