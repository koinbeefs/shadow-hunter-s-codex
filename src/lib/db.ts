// Simple IndexedDB wrapper for storing chapter images as blobs.
const DB_NAME = "sl_reader";
const DB_VERSION = 3; // Incremented to force complete database deletion
const PAGES_STORE = "pages"; // { id, chapterId, order, blob }
const CHAPTERS_STORE = "chapters"; // { id, title, volume, order, pageCount, createdAt, isPreloaded, preloadedPages }

export type Chapter = {
  id: string;
  title: string;
  volume: number;
  order: number;
  pageCount: number;
  createdAt: number;
  isPreloaded?: boolean;
  preloadedPages?: string[];
};

export type PageRecord = {
  id: string;
  chapterId: string;
  order: number;
  blob: Blob;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

      // Delete old stores when upgrading from version < 3 to clear sample chapters
      if (oldVersion < 3) {
        if (db.objectStoreNames.contains(CHAPTERS_STORE)) {
          db.deleteObjectStore(CHAPTERS_STORE);
        }
        if (db.objectStoreNames.contains(PAGES_STORE)) {
          db.deleteObjectStore(PAGES_STORE);
        }
      }

      if (!db.objectStoreNames.contains(CHAPTERS_STORE)) {
        db.createObjectStore(CHAPTERS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PAGES_STORE)) {
        const s = db.createObjectStore(PAGES_STORE, { keyPath: "id" });
        s.createIndex("chapterId", "chapterId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listChapters(): Promise<Chapter[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAPTERS_STORE, "readonly");
    const req = tx.objectStore(CHAPTERS_STORE).getAll();
    req.onsuccess = () => {
      const list = (req.result as Chapter[]).sort(
        (a, b) => a.volume - b.volume || a.order - b.order,
      );
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveChapter(chapter: Chapter, pages: Blob[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CHAPTERS_STORE, PAGES_STORE], "readwrite");
    tx.objectStore(CHAPTERS_STORE).put({ ...chapter, pageCount: pages.length });
    const pageStore = tx.objectStore(PAGES_STORE);
    pages.forEach((blob, i) => {
      pageStore.put({
        id: `${chapter.id}_${i}`,
        chapterId: chapter.id,
        order: i,
        blob,
      });
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePreloadedChapter(chapter: Chapter): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAPTERS_STORE, "readwrite");
    tx.objectStore(CHAPTERS_STORE).put(chapter);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPages(chapterId: string): Promise<PageRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PAGES_STORE, "readonly");
    const idx = tx.objectStore(PAGES_STORE).index("chapterId");
    const req = idx.getAll(chapterId);
    req.onsuccess = () => {
      const list = (req.result as PageRecord[]).sort((a, b) => a.order - b.order);
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CHAPTERS_STORE, PAGES_STORE], "readwrite");
    tx.objectStore(CHAPTERS_STORE).delete(chapterId);
    const idx = tx.objectStore(PAGES_STORE).index("chapterId");
    const req = idx.openCursor(IDBKeyRange.only(chapterId));
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateChapterMeta(
  id: string,
  patch: Partial<Chapter>,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHAPTERS_STORE, "readwrite");
    const store = tx.objectStore(CHAPTERS_STORE);
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) return resolve();
      store.put({ ...req.result, ...patch });
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Parse "Vol 01 Ch 003" / "v1c003" / "Chapter 45" from filename.
export function parseFilename(name: string): { volume: number; order: number; title: string } {
  const clean = name.replace(/\.[^.]+$/, "");
  const vol = clean.match(/v(?:ol)?[\s._-]*(\d{1,3})/i);
  const ch = clean.match(/(?:ch(?:apter)?|c|ep)[\s._-]*(\d{1,4})/i);
  const anyNum = clean.match(/(\d{1,4})/);
  const volume = vol ? parseInt(vol[1], 10) : 1;
  const order = ch ? parseInt(ch[1], 10) : anyNum ? parseInt(anyNum[1], 10) : 0;
  return {
    volume,
    order,
    title: clean.replace(/[_-]+/g, " ").trim(),
  };
}

export async function clearAllData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([CHAPTERS_STORE, PAGES_STORE], "readwrite");
    tx.objectStore(CHAPTERS_STORE).clear();
    tx.objectStore(PAGES_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Migration: Clear sample chapters on first load after version upgrade
export async function migrateToVersion3(): Promise<void> {
  const migrationKey = "sl_reader_migration_v3";
  if (typeof window === "undefined") return;
  if (localStorage.getItem(migrationKey) === "done") return;

  const chapters = await listChapters();
  const sampleChapters = chapters.filter(c =>
    c.title.includes("Sample Chapter") ||
    c.title.includes("The Weakest Hunter") ||
    c.title.includes("Double Dungeon") ||
    c.title.includes("The System")
  );

  if (sampleChapters.length > 0) {
    console.log("[migration] Clearing sample chapters:", sampleChapters.length);
    for (const ch of sampleChapters) {
      await deleteChapter(ch.id);
    }
  }

  localStorage.setItem(migrationKey, "done");
}
