/// <reference lib="webworker" />
import { ChunkPainter, type ChunkData } from './ChunkPainter';

/**
 * Terrain chunk painter running off the main thread (see TileTerrain): `init` once with the seed and map height, then
 * one `paint` message per chunk; each answer carries the chunk's RGBA pixels (transferred, not copied).
 */
let painter: ChunkPainter | null = null;

self.onmessage = (e: MessageEvent<{ t: 'init'; seed: number; mapHeight: number } | { t: 'paint'; key: string; data: ChunkData }>): void => {
  const m = e.data;
  if (m.t === 'init') {
    painter = new ChunkPainter(m.seed, m.mapHeight);
    return;
  }
  if (!painter) return;
  const pixels = painter.paint(m.data);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ key: m.key, pixels }, [pixels.buffer]);
};
