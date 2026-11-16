/**
 * Save folder on the player's computer: Downloads/BlackArea (File System Access API, Chrome / Edge / Opera desktop).
 * A web page may not write to a folder on its own: the first time the player saves, the browser asks them to pick a
 * folder (it opens on Downloads); the game then makes a "BlackArea" folder inside it (unless they picked one called
 * BlackArea) and remembers it (IndexedDB), so later saves go straight there and "Load saved game" can open the newest.
 * Browsers without the API (Firefox, Safari) keep the plain download.
 */
const FOLDER = 'BlackArea';
const DB = 'black-area-files';
const STORE = 'handles';
const KEY = 'saveDir';
/** localStorage flag: a save folder has been chosen in this browser (lets the menu show Continue without an async check). */
const FLAG = 'black-area.saveFolder';
export const hasSaveFolder = (): boolean => {
  try {
    return saveFolderSupported() && localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
};

type Perm = 'granted' | 'denied' | 'prompt';
interface DirHandle {
  name: string;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }>; getFile(): Promise<File> }>;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string; getFile?: () => Promise<File> }>;
  queryPermission(o: { mode: 'readwrite' }): Promise<Perm>;
  requestPermission(o: { mode: 'readwrite' }): Promise<Perm>;
}
type PickerWindow = Window & { showDirectoryPicker?: (o: { id?: string; mode?: 'readwrite'; startIn?: string }) => Promise<DirHandle> };

/** Can this browser write saves into a folder? */
export const saveFolderSupported = (): boolean => typeof (window as PickerWindow).showDirectoryPicker === 'function' && typeof indexedDB !== 'undefined';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function stored(): Promise<DirHandle | null> {
  try {
    const d = await db();
    return await new Promise((resolve) => {
      const req = d.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DirHandle | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function remember(h: DirHandle): Promise<void> {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(h, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * The BlackArea folder with write access, or null. `ask`: may show the browser's folder picker / permission prompt
 * (only from a click). Throws AbortError when the player cancels the picker.
 */
async function folder(ask: boolean): Promise<DirHandle | null> {
  if (!saveFolderSupported()) return null;
  const h = await stored();
  if (h) {
    let p = await h.queryPermission({ mode: 'readwrite' });
    if (p === 'prompt' && ask) p = await h.requestPermission({ mode: 'readwrite' });
    if (p === 'granted') return h;
    if (!ask) return null;
  }
  if (!ask) return null;
  const picked = await (window as PickerWindow).showDirectoryPicker!({ id: 'black-area-saves', mode: 'readwrite', startIn: 'downloads' });
  const dir = picked.name === FOLDER ? picked : await picked.getDirectoryHandle(FOLDER, { create: true });
  await remember(dir);
  try {
    localStorage.setItem(FLAG, '1');
  } catch {
    /* private mode: Continue simply stays hidden */
  }
  return dir;
}

/** Writes `text` as `name` into Downloads/BlackArea; resolves with the folder's name, or null when it could not (no API / cancelled). */
export async function writeToSaveFolder(name: string, text: string): Promise<string | null> {
  let dir: DirHandle | null;
  try {
    dir = await folder(true);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  if (!dir) return null;
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  await w.write(text);
  await w.close();
  return dir.name;
}

/** The newest .json save in the BlackArea folder (name, time, text), or null (no folder yet, no access, no save). */
export async function newestSave(): Promise<{ name: string; time: number; text: string } | null> {
  let dir: DirHandle | null;
  try {
    dir = await folder(false);
    if (!dir && (await stored())) dir = await folder(true); // remembered but this session has no access yet: ask once
  } catch {
    return null;
  }
  if (!dir) return null;
  let best: File | null = null;
  for await (const e of dir.values()) {
    if (e.kind !== 'file' || !e.name.toLowerCase().endsWith('.json') || !e.getFile) continue;
    const f = await e.getFile();
    if (!best || f.lastModified > best.lastModified) best = f;
  }
  return best ? { name: best.name, time: best.lastModified, text: await best.text() } : null;
}
