/**
 * Load-on-first-use images: the download starts the first time the game asks whether the image is ready (`complete`,
 * `naturalWidth` or `naturalHeight` — every draw call checks one before drawing), so sheets of machines that never
 * show up in a match (another nation's aircraft, the contested nations' vehicles…) are never downloaded or decoded.
 * Setting `src` directly still works as usual.
 */
const proto = HTMLImageElement.prototype;
const native = (name: 'complete' | 'naturalWidth' | 'naturalHeight') => Object.getOwnPropertyDescriptor(proto, name)!.get!;
const GETTERS = { complete: native('complete'), naturalWidth: native('naturalWidth'), naturalHeight: native('naturalHeight') };

const ALL: { img: HTMLImageElement; url: string; start: () => void }[] = [];

export function onDemand(img: HTMLImageElement, url: string): HTMLImageElement {
  const start = (): void => {
    if (!img.getAttribute('src')) img.src = url;
  };
  ALL.push({ img, url, start });
  for (const [name, get] of Object.entries(GETTERS)) {
    Object.defineProperty(img, name, {
      configurable: true,
      get(this: HTMLImageElement) {
        start();
        return get.call(this);
      },
    });
  }
  return img;
}

/** A new image that downloads on first use (see onDemand). */
export const lazyImage = (url: string): HTMLImageElement => onDemand(new Image(), url);

const settled = (img: HTMLImageElement): Promise<void> =>
  img.complete ? Promise.resolve() : new Promise((r) => { img.addEventListener('load', () => r(), { once: true }); img.addEventListener('error', () => r(), { once: true }); });

/** Resolves once every on-demand image asked for so far has arrived (or failed): nothing on screen is left blank. */
export function startedLoaded(): Promise<void> {
  return Promise.all(ALL.filter((e) => e.img.getAttribute('src')).map((e) => settled(e.img))).then(() => undefined);
}

/**
 * Fetches every on-demand image not asked for yet, a few at a time at low priority, after the match has started:
 * by the time a new kind of machine is first built or seen its sheet is already in the browser cache.
 */
export function prefetchRest(first: string, parallel = 3): void {
  // The player's own nation first (`first` in the file name), then the rest.
  const queue = ALL.filter((e) => !e.img.getAttribute('src')).sort((a, b) => Number(b.url.includes(first)) - Number(a.url.includes(first)));
  const next = (): void => {
    const e = queue.shift();
    if (!e) return;
    if (e.img.getAttribute('src')) return next();
    (e.img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
    e.start();
    void settled(e.img).then(next);
  };
  for (let i = 0; i < parallel; i++) next();
}
