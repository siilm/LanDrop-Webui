<script setup lang="ts">
import { ref, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { publishAnnounce } from '@/composables/useApi'
import { useWebSocket } from '@/composables/useWebSocket'
import SvgIcon from '@/components/SvgIcon.vue'

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
      <span><SvgIcon name="announce" :size="16" /> 发布公告</span>
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

.announce-input {
  width: 100%;
  padding: 10px 12px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text);
  background: var(--input-bg);
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.announce-input::placeholder {
  color: var(--text-muted);
}

.announce-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-muted);
  background: var(--input-bg-hover);
}

.announce-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.btn-sm {
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.btn-sm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--accent-glow);
}

.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.publish-msg {
  font-size: 12px;
  color: var(--success-text);
}
</style>
