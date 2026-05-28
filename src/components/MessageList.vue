<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { fetchRoomMessages } from '@/composables/useApi'
import MessageBubble from './MessageBubble.vue'
import type { ClientMessage, MessageElement } from '@/types/chat'

const emit = defineEmits<{
  recall: [msg: ClientMessage]
  edit: [msg: ClientMessage]
  contextMenu: [event: MouseEvent, msg: ClientMessage]
  imageClick: [element: MessageElement]
  fileClick: [element: MessageElement]
}>()

const chatStore = useChatStore()
const authStore = useAuthStore()
const messagesContainer = ref<HTMLDivElement | null>(null)
const shouldAutoScroll = ref(true)

// 自动滚动到底部
function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value && shouldAutoScroll.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

// 监听消息变化
watch(
  () => chatStore.messages.length,
  () => scrollToBottom(),
)

watch(
  () => chatStore.currentRoomId,
  () => {
    shouldAutoScroll.value = true
    scrollToBottom()
  },
)

// 滚动检测
function handleScroll() {
  if (!messagesContainer.value) return
  const el = messagesContainer.value
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
  shouldAutoScroll.value = nearBottom

  // 加载历史消息
  if (el.scrollTop < 50 && chatStore.hasMoreHistory && !chatStore.loadingHistory) {
    loadHistory()
  }
}

async function loadHistory() {
  if (!chatStore.currentRoomId || chatStore.loadingHistory || !chatStore.hasMoreHistory) return
  chatStore.loadingHistory = true

  try {
    const oldest = chatStore.messages[0]
    const before = oldest?.timestamp ? Math.floor(oldest.timestamp) : undefined
    const res = await fetchRoomMessages(chatStore.currentRoomId, before, 50)

    if (res.messages.length === 0) {
      chatStore.hasMoreHistory = false
    } else {
      chatStore.prependMessages(res.messages)
    }
  } catch (e) {
    console.warn('[MessageList] 加载历史消息失败:', e)
  } finally {
    chatStore.loadingHistory = false
  }
}

// 首次加载
async function loadInitialMessages() {
  if (!chatStore.currentRoomId) return
  chatStore.loadingHistory = true
  try {
    const res = await fetchRoomMessages(chatStore.currentRoomId, undefined, 50)
    chatStore.setMessages(res.messages)
    if (res.messages.length < 50) {
      chatStore.hasMoreHistory = false
    }
  } catch (e) {
    console.warn('[MessageList] 加载消息失败:', e)
  } finally {
    chatStore.loadingHistory = false
  }
}

watch(
  () => chatStore.currentRoomId,
  (newId) => {
    if (newId) {
      loadInitialMessages()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    ref="messagesContainer"
    class="messages-area"
    @scroll="handleScroll"
  >
    <!-- 加载更多 -->
    <div v-if="chatStore.loadingHistory" class="load-more-hint">
      加载中...
    </div>
    <div v-else-if="!chatStore.hasMoreHistory && chatStore.messages.length > 0" class="load-more-hint end">
      — 没有更多消息了 —
    </div>

    <!-- 消息列表 -->
    <template v-for="msg in chatStore.messages" :key="msg.message_id">
      <MessageBubble
        :message="msg"
        :is-self="msg.from === authStore.userId"
        :current-room-id="chatStore.currentRoomId"
        @context-menu="(e: MouseEvent) => emit('contextMenu', e, msg)"
        @image-click="(el: MessageElement) => emit('imageClick', el)"
        @file-click="(el: MessageElement) => emit('fileClick', el)"
      />
    </template>

    <!-- 空状态 -->
    <div v-if="chatStore.messages.length === 0 && !chatStore.loadingHistory" class="empty-msg-hint">
      <p>暂无消息</p>
      <p class="hint">发送第一条消息吧</p>
    </div>
  </div>
</template>

<style scoped>
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.load-more-hint {
  text-align: center;
  font-size: 12px;
  color: #999;
  padding: 8px;
}

.load-more-hint.end {
  color: #bbb;
}

.empty-msg-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #bbb;
}

.empty-msg-hint p {
  margin: 4px 0;
  font-size: 16px;
}

.empty-msg-hint .hint {
  font-size: 13px;
  opacity: 0.6;
}
</style>
