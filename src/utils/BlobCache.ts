/**
 * BlobCache — 轻量级 blob URL 缓存工具
 *
 * 用于缓存小文件、小图片、头像等轻量化内容，优化延迟体验。
 * 特性：
 *  - TTL 自动过期
 *  - 最大条目限制（LRU 驱逐）
 *  - 自动释放 blob URL（URL.revokeObjectURL）
 *  - 可选的 IndexedDB 持久化存储
 */

import type { IndexedDbCache } from './IndexedDbCache'

interface CacheEntry {
  blobUrl: string
  expiresAt: number
}

export interface BlobCacheOptions {
  maxEntries?: number
  defaultTtl?: number
  persistentStore?: IndexedDbCache
  persistentTtl?: number
}

export class BlobCache {
  private store = new Map<string, CacheEntry>()
  private readonly maxEntries: number
  private readonly defaultTtl: number
  private readonly persistentStore?: IndexedDbCache
  private readonly persistentTtl: number
  private hydrated = false

  hits = 0
  misses = 0
  evictions = 0
  restored = 0

  constructor(options: BlobCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 200
    this.defaultTtl = options.defaultTtl ?? 30 * 60 * 1000
    this.persistentStore = options.persistentStore
    this.persistentTtl = options.persistentTtl ?? 24 * 60 * 60 * 1000
  }

  get(key: string): string | null {
    const entry = this.store.get(key)
    if (!entry) {
      this.misses++
      return null
    }
    if (Date.now() > entry.expiresAt) {
      URL.revokeObjectURL(entry.blobUrl)
      this.store.delete(key)
      this.misses++
      return null
    }
    this.hits++
    return entry.blobUrl
  }

  set(key: string, blobUrl: string, ttl?: number): void {
    const existing = this.store.get(key)
    if (existing) URL.revokeObjectURL(existing.blobUrl)

    if (this.store.size >= this.maxEntries) {
      const oldestKey = this.store.keys().next().value
      if (oldestKey !== undefined) {
        const old = this.store.get(oldestKey)
        if (old) URL.revokeObjectURL(old.blobUrl)
        this.store.delete(oldestKey)
        this.evictions++
      }
    }

    this.store.set(key, {
      blobUrl,
      expiresAt: Date.now() + (ttl ?? this.defaultTtl),
    })
  }

  setPersistent(key: string, blobUrl: string, blob: Blob, ttl?: number): void {
    this.set(key, blobUrl, ttl)
    if (this.persistentStore) {
      this.persistentStore.set(key, blob, this.persistentTtl).catch(() => {})
    }
  }

  has(key: string): boolean {
    const entry = this.store.get(key)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      URL.revokeObjectURL(entry.blobUrl)
      this.store.delete(key)
      return false
    }
    return true
  }

  delete(key: string): void {
    const entry = this.store.get(key)
    if (entry) {
      URL.revokeObjectURL(entry.blobUrl)
      this.store.delete(key)
    }
    if (this.persistentStore) {
      this.persistentStore.delete(key).catch(() => {})
    }
  }

  clear(): void {
    for (const entry of this.store.values()) {
      URL.revokeObjectURL(entry.blobUrl)
    }
    this.store.clear()
    if (this.persistentStore) {
      this.persistentStore.clear().catch(() => {})
    }
  }

  purgeExpired(): number {
    const now = Date.now()
    let count = 0
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        URL.revokeObjectURL(entry.blobUrl)
        this.store.delete(key)
        count++
      }
    }
    return count
  }

  async hydrateFromIndexedDb(): Promise<void> {
    if (this.hydrated || !this.persistentStore) return
    this.hydrated = true
    try {
      await this.persistentStore.purgeExpired()
      const keys = await this.persistentStore.keys()
      let restored = 0
      for (const key of keys) {
        const record = await this.persistentStore.get(key)
        if (!record) continue
        if (this.store.has(key)) continue
        try {
          const blobUrl = URL.createObjectURL(record.blob)
          this.store.set(key, {
            blobUrl,
            expiresAt: Date.now() + this.defaultTtl,
          })
          restored++
        } catch {
          // 单个失败跳过
        }
      }
      this.restored = restored
      if (restored > 0) {
        console.log(`[BlobCache] 从 IndexedDB 恢复了 ${restored} 条缓存`)
      }
    } catch {
      // 静默降级
    }
  }

  get size(): number {
    return this.store.size
  }

  printStats(label = 'BlobCache'): void {
    const expired = this.purgeExpired()
    console.log(
      `[${label}] 条目=${this.size} 命中=${this.hits} 未命中=${this.misses} ` +
        `驱逐=${this.evictions} 过期清理=${expired} 持久化恢复=${this.restored}`,
    )
  }
}

import { avatarPersistentCache, filePersistentCache } from './IndexedDbCache'

/** 全局单例：头像缓存 */
export const avatarBlobCache = new BlobCache({
  maxEntries: 500,
  defaultTtl: 60 * 60 * 1000,
  persistentStore: avatarPersistentCache,
  persistentTtl: 24 * 60 * 60 * 1000,
})

/** 全局单例：文件/图片缓存 */
export const fileBlobCache = new BlobCache({
  maxEntries: 200,
  defaultTtl: 30 * 60 * 1000,
  persistentStore: filePersistentCache,
  persistentTtl: 24 * 60 * 60 * 1000,
})
