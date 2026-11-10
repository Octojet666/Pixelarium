/** IndexedDB-backed project library. Local-first: no account or network required. */

import type { ProjectDoc } from '../types';
import { deserializeProject, serializeProject } from '../engine/serialize';

export interface ProjectSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  frameCount: number;
  layerCount: number;
  thumbnail?: string;
  description?: string;
}

interface StoredProjectRecord extends ProjectSummary {
  /** Serialized .pxl document */
  json: string;
}

const DB_NAME = 'pixelarium-library';
const DB_VERSION = 1;
const STORE = 'projects';
const META_STORE = 'meta';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('Pixelarium: IndexedDB unavailable, projects will only live in memory.', request.error);
      resolve(null);
    };
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export async function listStoredProjects(): Promise<ProjectSummary[]> {
  const db = await openDatabase();
  if (!db) return [];
  const tx = db.transaction(STORE, 'readonly');
  const records = await requestToPromise(tx.objectStore(STORE).getAll() as IDBRequest<StoredProjectRecord[]>);
  return records
    .map(({ json: _json, ...summary }) => summary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadStoredProject(id: string): Promise<ProjectDoc | null> {
  const db = await openDatabase();
  if (!db) return null;
  const tx = db.transaction(STORE, 'readonly');
  const record = await requestToPromise(tx.objectStore(STORE).get(id) as IDBRequest<StoredProjectRecord | undefined>);
  if (!record) return null;
  return deserializeProject(record.json);
}

export async function saveStoredProject(doc: ProjectDoc, thumbnail?: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  const file = serializeProject(doc);
  const record: StoredProjectRecord = {
    id: doc.id,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    createdAt: doc.meta.createdAt,
    updatedAt: Date.now(),
    frameCount: doc.frames.length,
    layerCount: doc.layers.length,
    thumbnail,
    description: doc.meta.description,
    json: JSON.stringify(file),
  };
  const tx = db.transaction(STORE, 'readwrite');
  await requestToPromise(tx.objectStore(STORE).put(record));
}

export async function deleteStoredProject(id: string): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(STORE, 'readwrite');
  await requestToPromise(tx.objectStore(STORE).delete(id));
}

/** Crash-safe draft kept separately so an interrupted edit can be recovered. */
export async function saveRecoveryDraft(doc: ProjectDoc): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(META_STORE, 'readwrite');
  await requestToPromise(
    tx.objectStore(META_STORE).put({ json: JSON.stringify(serializeProject(doc)), savedAt: Date.now() }, 'recovery'),
  );
}

export async function loadRecoveryDraft(): Promise<{ doc: ProjectDoc; savedAt: number } | null> {
  const db = await openDatabase();
  if (!db) return null;
  const tx = db.transaction(META_STORE, 'readonly');
  const record = await requestToPromise(
    tx.objectStore(META_STORE).get('recovery') as IDBRequest<{ json: string; savedAt: number } | undefined>,
  );
  if (!record) return null;
  try {
    return { doc: deserializeProject(record.json), savedAt: record.savedAt };
  } catch {
    return null;
  }
}

export async function clearRecoveryDraft(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  const tx = db.transaction(META_STORE, 'readwrite');
  await requestToPromise(tx.objectStore(META_STORE).delete('recovery'));
}

export async function isStorageAvailable(): Promise<boolean> {
  return (await openDatabase()) !== null;
}
