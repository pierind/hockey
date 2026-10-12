// Minimal IndexedDB key-value store. Promises resolve only after the transaction completes.
let opened: Promise<IDBDatabase> | undefined

function open() {
  return (opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('hockey-planner', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode)
    const req = op(tx.objectStore('kv'))
    tx.oncomplete = () => resolve(req.result as T)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Speichervorgang abgebrochen'))
  })
}

export const load = <T>(key: string) => run<T | undefined>('readonly', (s) => s.get(key))
export const store = (key: string, value: unknown) => run<void>('readwrite', (s) => s.put(value, key))
export const remove = (key: string) => run<void>('readwrite', (s) => s.delete(key))
