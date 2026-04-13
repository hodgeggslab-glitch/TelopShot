import { SavedTelopStylePreset, SavedThread, ScreenshotCandidate, SnsTemplate } from "@/lib/types";

const DB_NAME = "ssgenerator-db";
const THREAD_STORE = "threads";
const TELOP_STYLE_STORE = "telop-styles";
const SNS_TEMPLATE_STORE = "sns-templates";
const SNS_SHOT_POOL_STORE = "sns-shot-pool";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(THREAD_STORE)) {
        db.createObjectStore(THREAD_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TELOP_STYLE_STORE)) {
        db.createObjectStore(TELOP_STYLE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SNS_TEMPLATE_STORE)) {
        db.createObjectStore(SNS_TEMPLATE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SNS_SHOT_POOL_STORE)) {
        db.createObjectStore(SNS_SHOT_POOL_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveThread(thread: SavedThread) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, "readwrite");
    tx.objectStore(THREAD_STORE).put(thread);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getThreads() {
  const db = await openDb();
  const threads = await new Promise<SavedThread[]>((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, "readonly");
    const request = tx.objectStore(THREAD_STORE).getAll();
    request.onsuccess = () => resolve(request.result as SavedThread[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return threads.sort(
    (a, b) =>
      new Date(b.updatedAt ?? b.createdAt).getTime() -
      new Date(a.updatedAt ?? a.createdAt).getTime()
  );
}

export async function deleteThread(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(THREAD_STORE, "readwrite");
    tx.objectStore(THREAD_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveTelopStylePreset(stylePreset: SavedTelopStylePreset) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TELOP_STYLE_STORE, "readwrite");
    tx.objectStore(TELOP_STYLE_STORE).put(stylePreset);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getTelopStylePresets() {
  const db = await openDb();
  const styles = await new Promise<SavedTelopStylePreset[]>((resolve, reject) => {
    const tx = db.transaction(TELOP_STYLE_STORE, "readonly");
    const request = tx.objectStore(TELOP_STYLE_STORE).getAll();
    request.onsuccess = () => resolve(request.result as SavedTelopStylePreset[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return styles.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function deleteTelopStylePreset(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TELOP_STYLE_STORE, "readwrite");
    tx.objectStore(TELOP_STYLE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveSnsTemplate(template: SnsTemplate) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SNS_TEMPLATE_STORE, "readwrite");
    tx.objectStore(SNS_TEMPLATE_STORE).put(template);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getSnsTemplates() {
  const db = await openDb();
  const templates = await new Promise<SnsTemplate[]>((resolve, reject) => {
    const tx = db.transaction(SNS_TEMPLATE_STORE, "readonly");
    const request = tx.objectStore(SNS_TEMPLATE_STORE).getAll();
    request.onsuccess = () => resolve(request.result as SnsTemplate[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return templates.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteSnsTemplate(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SNS_TEMPLATE_STORE, "readwrite");
    tx.objectStore(SNS_TEMPLATE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function saveSnsShotPoolEntry(shot: ScreenshotCandidate) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SNS_SHOT_POOL_STORE, "readwrite");
    tx.objectStore(SNS_SHOT_POOL_STORE).put(shot);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getSnsShotPool() {
  const db = await openDb();
  const shots = await new Promise<ScreenshotCandidate[]>((resolve, reject) => {
    const tx = db.transaction(SNS_SHOT_POOL_STORE, "readonly");
    const request = tx.objectStore(SNS_SHOT_POOL_STORE).getAll();
    request.onsuccess = () => resolve(request.result as ScreenshotCandidate[]);
    request.onerror = () => reject(request.error);
  });
  db.close();
  const pool: Record<string, ScreenshotCandidate> = {};
  for (const shot of shots) pool[shot.id] = shot;
  return pool;
}
