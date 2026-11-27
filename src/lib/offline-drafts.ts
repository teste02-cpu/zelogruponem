export type OfflineIncidentDraft = {
  id: string;
  photo: Blob;
  reporterName: string;
  reporterEmail: string;
  accountUserId: string | null;
  block: string;
  room: string;
  category: string;
  title: string;
  description: string;
  updatedAt: string;
  submittedAt?: string;
};

export interface OfflineDraftStore {
  list(): Promise<OfflineIncidentDraft[]>;
  put(draft: OfflineIncidentDraft): Promise<void>;
  delete(id: string): Promise<void>;
}

const DATABASE = "zelo-offline-drafts";
const STORE = "incident-drafts";

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open offline draft storage."));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDraftDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not access offline draft storage."));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Offline draft storage transaction failed."));
  }).finally(() => database.close());
}

export const indexedDbDraftStore: OfflineDraftStore = {
  async list() {
    return (await withStore<OfflineIncidentDraft[]>("readonly", (store) => store.getAll())) ?? [];
  },
  async put(draft) {
    await withStore<IDBValidKey>("readwrite", (store) => store.put(draft));
  },
  async delete(id) {
    await withStore<undefined>("readwrite", (store) => store.delete(id));
  },
};

export function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((response) => response.blob());
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read saved incident photo."));
    reader.readAsDataURL(blob);
  });
}

export async function syncSubmittedDrafts<Result>(
  store: OfflineDraftStore,
  submit: (draft: OfflineIncidentDraft) => Promise<Result>,
): Promise<{ sent: Array<{ id: string; result: Result }>; failed: string[] }> {
  const drafts = (await store.list())
    .filter((draft) => !!draft.submittedAt)
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const sent: Array<{ id: string; result: Result }> = [];
  const failed: string[] = [];

  for (const draft of drafts) {
    try {
      const result = await submit(draft);
      await store.delete(draft.id);
      sent.push({ id: draft.id, result });
    } catch {
      failed.push(draft.id);
    }
  }
  return { sent, failed };
}
