import type { DraftMeta, IntegratedStudy } from "../types";

const DB_NAME = "personalab-setup";
const STORE_NAME = "drafts";
const DRAFT_KEY = "current";
const META_KEY = "personalab-setup-draft-meta";
const VERSION = 1;

let databasePromise: Promise<IDBDatabase> | undefined;
let pendingWrite = Promise.resolve();

function database() {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = pendingWrite.then(operation);
  pendingWrite = result.then(() => undefined, () => undefined);
  return result;
}

export function getSetupDraftMeta(): DraftMeta | null {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) || "null") as DraftMeta | null;
    return meta?.version === VERSION ? meta : null;
  } catch { return null; }
}

export async function loadSetupDraft(): Promise<{ version: number; draft: IntegratedStudy; step: number } | null> {
  await pendingWrite;
  const record = await transact<{ version: number; draft: IntegratedStudy; step: number } | undefined>("readonly", store => store.get(DRAFT_KEY));
  if (record?.version === VERSION && record.draft) return record;
  try { localStorage.removeItem(META_KEY); } catch { /* 저장소 접근 제한 */ }
  return null;
}

export function saveSetupDraft(draft: IntegratedStudy, step: number): Promise<DraftMeta> {
  return enqueue(async () => {
    const meta = { version: VERSION, name: draft.product.name || "이름 없는 테스트", step, updatedAt: Date.now() };
    await transact("readwrite", store => store.put({ version: VERSION, draft, step }, DRAFT_KEY));
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* 초안 자체는 IndexedDB에 저장됨 */ }
    return meta;
  });
}

export function clearSetupDraft(): Promise<void> {
  return enqueue(async () => {
    await transact("readwrite", store => store.delete(DRAFT_KEY));
    try { localStorage.removeItem(META_KEY); } catch { /* 저장소 접근 제한 */ }
  });
}
