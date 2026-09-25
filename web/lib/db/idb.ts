/**
 * Minimal promise wrapper around IndexedDB. No dependency: the app only needs
 * key/value lookups and index range reads.
 */
export interface IndexSpec {
  name: string
  keyPath: string | string[]
  unique?: boolean
  multiEntry?: boolean
}

export interface StoreSpec {
  name: string
  keyPath?: string | string[]
  autoIncrement?: boolean
  indexes?: IndexSpec[]
}

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

export function openDatabase(
  name: string,
  version: number,
  stores: StoreSpec[],
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment'))
      return
    }
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const spec of stores) {
        const store = db.objectStoreNames.contains(spec.name)
          ? request.transaction!.objectStore(spec.name)
          : db.createObjectStore(spec.name, {
              keyPath: spec.keyPath,
              autoIncrement: spec.autoIncrement,
            })
        for (const index of spec.indexes ?? []) {
          if (!store.indexNames.contains(index.name)) {
            store.createIndex(index.name, index.keyPath, {
              unique: index.unique ?? false,
              multiEntry: index.multiEntry ?? false,
            })
          }
        }
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error(`Could not open ${name}`))
    request.onblocked = () => reject(new Error(`${name} is blocked by another tab`))
  })
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
  })
}

type Operation<T> = (stores: Record<string, IDBObjectStore>) => Promise<T> | T

/**
 * Runs `operation` inside one transaction and resolves after the transaction
 * commits, so callers can rely on the write being durable when the promise
 * resolves.
 */
export async function runTransaction<T>(
  db: IDBDatabase,
  storeNames: string[],
  mode: IDBTransactionMode,
  operation: Operation<T>,
): Promise<T> {
  const tx = db.transaction(storeNames, mode)
  const stores: Record<string, IDBObjectStore> = {}
  for (const name of storeNames) stores[name] = tx.objectStore(name)
  const result = await operation(stores)
  await transactionDone(tx)
  return result
}

export async function getRecord<T>(
  db: IDBDatabase,
  store: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  return runTransaction(db, [store], 'readonly', (stores) =>
    requestResult<T | undefined>(stores[store].get(key)),
  )
}

export async function getAllRecords<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return runTransaction(db, [store], 'readonly', (stores) =>
    requestResult<T[]>(stores[store].getAll()),
  )
}

export async function countRecords(db: IDBDatabase, store: string): Promise<number> {
  return runTransaction(db, [store], 'readonly', (stores) =>
    requestResult<number>(stores[store].count()),
  )
}

export async function putRecord<T>(db: IDBDatabase, store: string, value: T): Promise<void> {
  await runTransaction(db, [store], 'readwrite', (stores) => {
    stores[store].put(value)
  })
}

export async function putRecords<T>(db: IDBDatabase, store: string, values: T[]): Promise<void> {
  if (values.length === 0) return
  await runTransaction(db, [store], 'readwrite', (stores) => {
    const target = stores[store]
    for (const value of values) target.put(value)
  })
}

export async function deleteRecord(
  db: IDBDatabase,
  store: string,
  key: IDBValidKey,
): Promise<void> {
  await runTransaction(db, [store], 'readwrite', (stores) => {
    stores[store].delete(key)
  })
}

export async function clearStore(db: IDBDatabase, store: string): Promise<void> {
  await runTransaction(db, [store], 'readwrite', (stores) => {
    stores[store].clear()
  })
}

export async function getAllByIndex<T>(
  db: IDBDatabase,
  store: string,
  index: string,
  query: IDBValidKey | IDBKeyRange,
): Promise<T[]> {
  return runTransaction(db, [store], 'readonly', (stores) =>
    requestResult<T[]>(stores[store].index(index).getAll(query)),
  )
}

export async function getFirstByIndex<T>(
  db: IDBDatabase,
  store: string,
  index: string,
  query: IDBValidKey | IDBKeyRange,
): Promise<T | undefined> {
  return runTransaction(db, [store], 'readonly', (stores) =>
    requestResult<T | undefined>(stores[store].index(index).get(query)),
  )
}

export async function countByIndex(
  db: IDBDatabase,
  store: string,
  index: string,
  query?: IDBValidKey | IDBKeyRange,
): Promise<number> {
  return runTransaction(db, [store], 'readonly', (stores) =>
    requestResult<number>(stores[store].index(index).count(query)),
  )
}

export async function deleteDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}`))
    request.onblocked = () => resolve()
  })
}
