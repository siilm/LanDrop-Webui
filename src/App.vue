<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { avatarBlobCache, fileBlobCache } from '@/utils/BlobCache'

const authStore = useAuthStore()

onMounted(async () => {
  // 尝试恢复登录会话
  authStore.restoreSession()

  // 从 IndexedDB 恢复 blob 缓存
  try {
    await Promise.all([
      avatarBlobCache.hydrateFromIndexedDb(),
      fileBlobCache.hydrateFromIndexedDb(),
    ])
  } catch {
    // 静默降级
  }
})
</script>

<template>
  <router-view />
</template>

<style>
/* 全局基础样式 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  color: #333;
  background: #f0f2f5;
}

/* 自定义滚动条 */
::-webkit-scrollbar {
  width: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.25);
}
</style>
