import { SavedTelopStylePreset, SavedThread } from "@/lib/types";

const DB_NAME = "ssgenerator-db";
const THREAD_STORE = "threads";
const TELOP_STYLE_STORE = "telop-styles";

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(THREAD_STORE)) {
        db.createObjectStore(THREAD_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TELOP_STYLE_STORE)) {
        db.createObjectStore(TELOP_STYLE_STORE, { keyPath: "id" });
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
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
