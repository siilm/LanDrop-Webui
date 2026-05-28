<script setup lang="ts">
import { ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { publishAnnounce } from '@/composables/useApi'
import { useWebSocket } from '@/composables/useWebSocket'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const chatStore = useChatStore()

const announceContent = ref('')
const publishing = ref(false)
const publishMsg = ref('')

async function handlePublish() {
  const content = announceContent.value.trim()
  if (!content || !chatStore.currentRoomId) return

  publishing.value = true
  publishMsg.value = ''
  try {
    // 双通道：HTTP → WS fallback
    try {
      await publishAnnounce(chatStore.currentRoomId, content)
    } catch {
      const ws = useWebSocket()
      ws.announceRoom(chatStore.currentRoomId, content)
    }
    publishMsg.value = '公告已发布'
    announceContent.value = ''
  } catch (e: any) {
    publishMsg.value = e.message || '发布失败'
  } finally {
    publishing.value = false
  }
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      announceContent.value = ''
      publishMsg.value = ''
    }
  },
)
</script>

<template>
  <div v-if="visible" class="announce-panel">
    <div class="panel-header">
      <span>📢 发布公告</span>
      <button class="btn-close" @click="emit('close')">✕</button>
    </div>
    <textarea
      v-model="announceContent"
      class="announce-input"
      rows="3"
      placeholder="输入公告内容..."
    ></textarea>
    <div class="announce-actions">
      <button
        class="btn-sm"
        @click="handlePublish"
        :disabled="publishing || !announceContent.trim()"
      >
        {{ publishing ? '发布中...' : '发布' }}
      </button>
      <span v-if="publishMsg" class="publish-msg">{{ publishMsg }}</span>
    </div>
  </div>
</template>

<style scoped>
.announce-panel {
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

.announce-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
}

.announce-input:focus {
  border-color: #0f3460;
}

.announce-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.btn-sm {
  padding: 6px 12px;
  background: #27ae60;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-sm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.publish-msg {
  font-size: 12px;
  color: #27ae60;
}
</style>
