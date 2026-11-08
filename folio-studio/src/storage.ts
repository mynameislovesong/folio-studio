import type {Project} from './model';

export interface SavedProject {id: string; updated: number; project: Project}
export interface SavedTemplate {id: string; name: string; updated: number; project: Project}
type Bucket = 'projects' | 'templates';

let opening: Promise<IDBDatabase> | undefined;
function database() {
  if (!opening) opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('folio-studio', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', {keyPath: 'id'});
      request.result.createObjectStore('templates', {keyPath: 'id'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {opening = undefined; reject(request.error);};
    request.onblocked = () => {opening = undefined; reject(new Error('다른 탭에서 데이터베이스를 사용하고 있습니다.'));};
  });
  return opening;
}

async function transact<T>(bucket: Bucket, mode: IDBTransactionMode, request: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(bucket, mode);
    const pending = request(transaction.objectStore(bucket));
    transaction.oncomplete = () => resolve(pending.result);
    transaction.onabort = () => reject(transaction.error ?? new Error('저장이 취소되었습니다.'));
    transaction.onerror = () => reject(transaction.error);
  });
}
export const listProjects = () => transact<SavedProject[]>('projects', 'readonly', store => store.getAll());
export const listTemplates = () => transact<SavedTemplate[]>('templates', 'readonly', store => store.getAll());
export const saveProject = (project: Project) => transact('projects', 'readwrite', store => store.put({id: project.id, updated: Date.now(), project}));
export const saveTemplate = (template: SavedTemplate) => transact('templates', 'readwrite', store => store.put(template));
export const removeProject = (id: string) => transact('projects', 'readwrite', store => store.delete(id));
export const removeTemplate = (id: string) => transact('templates', 'readwrite', store => store.delete(id));

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
