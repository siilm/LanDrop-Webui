<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { fetchRoomFiles, deleteRoomFile, downloadFileViaJwt } from '@/composables/useApi'
import type { RoomFileItem } from '@/types/chat'

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
      <span>📁 房间文件</span>
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
  padding: 12px 24px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.btn-close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #999;
}

.btn-close:hover {
  color: #333;
}

.panel-loading,
.panel-empty {
  font-size: 13px;
  color: #999;
  padding: 8px 0;
  text-align: center;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
}

.file-item:hover {
  background: #f0f2f5;
}

.file-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-link {
  color: #3498db;
  text-decoration: none;
}

.file-link:hover {
  text-decoration: underline;
}

.file-size {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
}

.btn-file-delete {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #e74c3c;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
  flex-shrink: 0;
}

.btn-file-delete:hover {
  background: #fef0ef;
}
</style>
