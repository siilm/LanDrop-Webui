/**
 * IndexedDbCache — 基于 IndexedDB 的持久化 blob 缓存
 *
 * 用于在本地持久化存储头像、聊天图片等静态资源，避免页面刷新后重复网络请求。
 * TTL 自动过期，静默降级（IndexedDB 不可用时返回 null 但不报错）。
 */

const DB_NAME = 'LanDropCacheNew'
const DB_VERSION = 1
const STORE_NAME = 'blobs'

interface CacheRecord {
  key: string
  blob: Blob
  contentType: string
  storedAt: number
  expiresAt: number
}

export class IndexedDbCache {
  private db: IDBDatabase | null = null
  private ready: Promise<void>

  constructor() {
    this.ready = this.open()
  }

  private open(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION)
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
            store.createIndex('expiresAt', 'expiresAt', { unique: false })
          }
        }
        request.onsuccess = (event) => {
          this.db = (event.target as IDBOpenDBRequest).result
          resolve()
        }
        request.onerror = () => {
          console.warn('[IndexedDbCache] 打开数据库失败，使用内存缓存')
          resolve()
        }
      } catch {
        console.warn('[IndexedDbCache] IndexedDB 不可用，使用内存缓存')
        resolve()
      }
    })
  }

  async waitReady(): Promise<void> {
    await this.ready
  }

  async get(key: string): Promise<CacheRecord | null> {
    await this.ready
    if (!this.db) return null
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(key)
        request.onsuccess = () => {
          const record = request.result as CacheRecord | undefined
          if (!record) {
            resolve(null)
            return
          }
          if (Date.now() > record.expiresAt) {
            this.delete(key)
            resolve(null)
            return
          }
          resolve(record)
        }
        request.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }

  async getBlob(key: string): Promise<Blob | null> {
    const record = await this.get(key)
    return record?.blob ?? null
  }

  async set(key: string, blob: Blob, ttl: number): Promise<void> {
    await this.ready
    if (!this.db) return
    const record: CacheRecord = {
      key,
      blob,
      contentType: blob.type,
      storedAt: Date.now(),
      expiresAt: Date.now() + ttl,
    }
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.put(record)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  async delete(key: string): Promise<void> {
    await this.ready
    if (!this.db) return
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }

  async keys(): Promise<string[]> {
    await this.ready
    if (!this.db) return []
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.getAllKeys()
        request.onsuccess = () => resolve(request.result as string[])
        request.onerror = () => resolve([])
      } catch {
        resolve([])
      }
    })
  }

  async purgeExpired(): Promise<number> {
    await this.ready
    if (!this.db) return 0
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const index = store.index('expiresAt')
        const range = IDBKeyRange.upperBound(Date.now())
        const request = index.openCursor(range)
        let count = 0
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            store.delete(cursor.primaryKey)
            count++
            cursor.continue()
          } else {
            resolve(count)
          }
        }
        request.onerror = () => resolve(count)
      } catch {
        resolve(0)
      }
    })
  }

  async clear(): Promise<void> {
    await this.ready
    if (!this.db) return
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        store.clear()
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
      } catch {
        resolve()
      }
    })
  }
}

// ======================== 全局单例 ========================

export const avatarPersistentCache = new IndexedDbCache()
export const filePersistentCache = new IndexedDbCache()
