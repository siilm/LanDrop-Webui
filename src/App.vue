<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { avatarBlobCache, fileBlobCache } from '@/utils/BlobCache'
import { useTheme } from '@/composables/useTheme'

const authStore = useAuthStore()

// 初始化全局主题（写入 <html data-theme>，登录页与聊天页共享同一偏好）
useTheme()

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
/* 全局基础样式与设计令牌见 src/assets/theme.css */
</style>
