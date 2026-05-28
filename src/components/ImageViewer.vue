<script setup lang="ts">
import { ref, watch } from 'vue'
import { fileBlobCache } from '@/utils/BlobCache'
import { getBaseUrl, fetchFileBlob } from '@/composables/useApi'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  fileId: string
  roomId: string
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const authStore = useAuthStore()
const imgSrc = ref('')

watch(
  () => props.fileId,
  async (id) => {
    if (!id) return
    const cached = fileBlobCache.get(id)
    if (cached) {
      imgSrc.value = cached
      return
    }
    // 通过 JWT fetch 获取 blob URL
    const blobUrl = await fetchFileBlob(id, props.roomId)
    if (blobUrl) {
      imgSrc.value = blobUrl
    } else {
      // fallback: 带 JWT token 的直接 URL（<img> 标签无法设置 Header）
      const base = getBaseUrl().replace(/\/api\/?$/, '')
      const token = authStore.accessToken
      imgSrc.value = `${base}/api/getfiles/${props.roomId}/${id}?token=${encodeURIComponent(token || '')}`
    }
  },
  { immediate: true },
)

function handleBgClick() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="viewer-overlay" @click.self="handleBgClick">
      <button class="viewer-close" @click="emit('close')">✕</button>
      <img
        v-if="imgSrc"
        :src="imgSrc"
        class="viewer-image"
        alt="预览"
        @click="emit('close')"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: zoom-out;
}

.viewer-close {
  position: fixed;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
}

.viewer-close:hover {
  background: rgba(255, 255, 255, 0.4);
}

.viewer-image {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  cursor: zoom-out;
}
</style>
