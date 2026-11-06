// Save files: gzip-compressed JSON (.fnsave) for download/upload, plus a local "continue" slot in IndexedDB.
import type { SaveData } from '../sim/serialize';

export async function encodeSave(d: SaveData): Promise<Blob> {
  const json = new Blob([JSON.stringify(d)], { type: 'application/json' });
  if (typeof CompressionStream === 'undefined') return json;
  return new Response(json.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

export async function decodeSave(blob: Blob): Promise<SaveData> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  const text = gz ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text() : await blob.text();
  return JSON.parse(text) as SaveData;
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const DB = 'fortnight', STORE = 'saves', KEY = 'continue';

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

/** Store the latest save locally (best effort: private windows may block storage). */
export async function putContinue(blob: Blob, label: string): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob, label, at: Date.now() }, KEY);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    return true;
  } catch { return false; }
}

export async function getContinue(): Promise<{ blob: Blob; label: string; at: number } | null> {
  try {
    const db = await openDb();
    return await new Promise((res, rej) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result ?? null); r.onerror = () => rej(r.error);
    });
  } catch { return null; }
}
