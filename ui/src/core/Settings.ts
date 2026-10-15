/** Player settings kept in this browser (pause menu → settings). */

const EDGE_LOCK_KEY = 'black-area.edgeLock';

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
};

export function setEdgeLock(on: boolean): void {
  settings.edgeLock = on;
  try {
    localStorage.setItem(EDGE_LOCK_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable (private mode): the choice lasts this page only */
  }
}
