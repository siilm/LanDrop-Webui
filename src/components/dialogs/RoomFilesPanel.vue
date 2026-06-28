<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { fetchRoomFiles, deleteRoomFile, downloadFileViaJwt } from '@/composables/useApi'
import type { RoomFileItem } from '@/types/chat'
import SvgIcon from '@/components/SvgIcon.vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const chatStore = useChatStore()
const authStore = useAuthStore()

const files = ref<RoomFileItem[]>([])
const loading = ref(false)

/** 当前用户是否可删除文件（房间管理员/创建者 或 全局管理员） */
const canDelete = computed(() => {
  const member = chatStore.roomMembers.get(authStore.userId)
  const role = member ? parseInt(member.role) : 0
  return role >= 1 || authStore.globalRole === 'public_admin' || authStore.globalRole === 'owner'
})

async function loadFiles() {
  if (!chatStore.currentRoomId) return
  loading.value = true
  try {
    const res = await fetchRoomFiles(chatStore.currentRoomId)
    files.value = res.files || []
  } catch {
    files.value = []
  } finally {
    loading.value = false
  }
}

async function handleDelete(fileId: string) {
  try {
    await deleteRoomFile(chatStore.currentRoomId!, fileId)
    files.value = files.value.filter((f) => f.file_id !== fileId)
  } catch (e) {
    console.warn('[RoomFiles] 删除失败:', e)
  }
}

function handleDownload(file: RoomFileItem) {
  const roomId = chatStore.currentRoomId || ''
  downloadFileViaJwt(file.file_id, file.file_name, roomId)
}

function formatSize(sizeStr: string): string {
  const size = parseInt(sizeStr)
  if (isNaN(size)) return sizeStr
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

watch(
  () => props.visible,
  (v) => {
    if (v) loadFiles()
  },
)
</script>

<template>
  <div v-if="visible" class="room-files-panel">
    <div class="panel-header">
      <span><SvgIcon name="download" :size="16" /> 房间文件</span>
      <button class="btn-close" @click="emit('close')">✕</button>
    </div>

    <div v-if="loading" class="panel-loading">加载中...</div>
    <div v-else-if="files.length === 0" class="panel-empty">暂无文件</div>
    <div v-else class="file-list">
      <div
        v-for="file in files"
        :key="file.file_id"
        class="file-item"
      >
        <span class="file-name">
          <a
            href="javascript:void(0)"
            class="file-link"
            @click="handleDownload(file)"
          >
            📎 {{ file.file_name }}
          </a>
        </span>
        <span class="file-size">{{ formatSize(file.file_size) }}</span>
        <button
          v-if="canDelete"
          class="btn-file-delete"
          @click="handleDelete(file.file_id)"
          title="删除"
        >
          🗑️
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.room-files-panel {
  padding: 14px 24px;
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 1;
  animation: ld-slide-down 0.3s var(--ease-out-expo) both;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.btn-close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--text-muted);
  width: 26px;
  height: 26px;
  border-radius: var(--radius-xs);
  transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.btn-close:hover {
  color: var(--text);
  background: var(--surface-2-hover);
  transform: rotate(90deg);
}

.panel-loading,
.panel-empty {
  font-size: 13px;
  color: var(--text-muted);
  padding: 8px 0;
  text-align: center;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 180px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  transition: background 0.18s ease;
}

.file-item:hover {
  background: var(--surface-2-hover);
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-link {
  color: var(--accent-text);
  text-decoration: none;
  transition: opacity 0.15s ease;
}

.file-link:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.file-size {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.btn-file-delete {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--danger-text);
  font-size: 14px;
  padding: 3px 7px;
  border-radius: var(--radius-xs);
  line-height: 1;
  flex-shrink: 0;
  transition: background 0.18s ease, transform 0.18s ease;
}

.btn-file-delete:hover {
  background: var(--danger-bg);
  transform: scale(1.1);
}
</style>
