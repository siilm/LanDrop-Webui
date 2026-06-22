<script setup lang="ts">
import { ref, watch, nextTick, computed } from 'vue'
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
/** 用户翻阅历史期间到达的新消息数 */
const newMessageCount = ref(0)
/** 保存滚动位置的防抖定时器 */
let savePosTimer: ReturnType<typeof setTimeout> | undefined

// ---- 滚动到底部 ----

function scrollToBottom(smooth = false) {
  nextTick(() => {
    if (!messagesContainer.value) return
    if (smooth) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: 'smooth',
      })
    } else {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
    shouldAutoScroll.value = true
    newMessageCount.value = 0
  })
}

// ---- 滚动位置记忆 (v2.4) ----

function restoreScrollPosition() {
  if (!messagesContainer.value || !chatStore.currentRoomId) return

  // 侧栏 @通知跳转 (v2.4)：检测到 pending 标记，优先跳到 @消息
  const pendingJump = chatStore.consumeMentionJump()
  if (pendingJump && pendingJump === chatStore.currentRoomId) {
    // 消息已加载，直接跳到第一个 @消息
    nextTick(() => {
      // 先滚到底部确保 DOM 完全就绪
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
      nextTick(() => {
        jumpToNextMention()
      })
    })
    return
  }

  if (chatStore.scrollBehavior === 'lastPosition') {
    const saved = chatStore.roomScrollPositions[chatStore.currentRoomId]
    if (saved != null && saved > 0) {
      nextTick(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = saved
          shouldAutoScroll.value = saved >= messagesContainer.value.scrollHeight - messagesContainer.value.clientHeight - 100
        }
      })
      return
    }
  }
  // 默认回到底部
  scrollToBottom()
}

// ---- 跳转到指定消息 ----

function scrollToMessage(messageId: string) {
  nextTick(() => {
    const el = document.getElementById('msg-' + messageId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 高亮闪烁
      el.classList.add('msg-flash')
      setTimeout(() => el.classList.remove('msg-flash'), 1600)
    }
  })
}

// ---- @提及跳转 (v2.3) ----

/** 当前房间是否有可跳转的 @提及 */
const hasMentionJumps = computed(() => {
  if (!chatStore.currentRoomId) return false
  const msgs = chatStore.unreadMentionMessages[chatStore.currentRoomId]
  return msgs && msgs.length > 0
})

/** 剩余未跳转的 @提及数 */
const remainingMentionCount = computed(() => {
  if (!chatStore.currentRoomId) return 0
  const msgs = chatStore.unreadMentionMessages[chatStore.currentRoomId]
  if (!msgs) return 0
  const cur = chatStore.mentionJumpIndex[chatStore.currentRoomId] ?? 0
  return Math.max(0, msgs.length - cur)
})

function jumpToNextMention() {
  if (!chatStore.currentRoomId) return
  const result = chatStore.getNextMentionJump(chatStore.currentRoomId)
  if (result) {
    scrollToMessage(result.messageId)
  }
  // 如果已经遍历完所有 @，getNextMentionJump 返回 null，按钮会自动隐藏
}

// ---- 消息监听 ----

watch(
  () => chatStore.messages.length,
  () => {
    if (shouldAutoScroll.value) {
      scrollToBottom()
    } else {
      newMessageCount.value++
    }
  },
)

watch(
  () => chatStore.currentRoomId,
  (newId, oldId) => {
    // 离开旧房间时保存滚动位置
    if (oldId && messagesContainer.value) {
      chatStore.saveRoomScrollPosition(oldId, messagesContainer.value.scrollTop)
    }
    newMessageCount.value = 0
    shouldAutoScroll.value = true
  },
)

// ---- 滚动检测 ----

function handleScroll() {
  if (!messagesContainer.value) return
  const el = messagesContainer.value
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
  if (nearBottom && !shouldAutoScroll.value) {
    // 用户滚回底部 → 清除计数
    shouldAutoScroll.value = true
    newMessageCount.value = 0
  } else if (!nearBottom) {
    shouldAutoScroll.value = false
  }

  // 防抖保存滚动位置
  if (chatStore.currentRoomId) {
    clearTimeout(savePosTimer)
    savePosTimer = setTimeout(() => {
      chatStore.saveRoomScrollPosition(chatStore.currentRoomId, el.scrollTop)
    }, 500)
  }

  // 加载历史消息
  if (el.scrollTop < 50 && chatStore.hasMoreHistory && !chatStore.loadingHistory) {
    loadHistory()
  }
}

// ---- 历史加载 ----

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

async function loadInitialMessages() {
  if (!chatStore.currentRoomId) return
  chatStore.loadingHistory = true
  try {
    const res = await fetchRoomMessages(chatStore.currentRoomId, undefined, 50)
    // 禁止 messages.length watcher 在首屏加载时自动滚底，
    // 由 restoreScrollPosition() 统一决策
    shouldAutoScroll.value = false
    chatStore.setMessages(res.messages)
    await nextTick()
    restoreScrollPosition()
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
  <div class="messages-wrapper">
    <div
      ref="messagesContainer"
      class="messages-area"
      :data-density="chatStore.messageDensity"
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

    <!-- ================ 悬浮按钮 (FABs) ================ -->
    <div class="fab-stack">
      <!-- 新消息通知 -->
      <Transition name="fab-pop">
        <button
          v-if="newMessageCount > 0"
          class="fab fab--new-msgs"
          @click="scrollToBottom(true)"
        >
          <span class="fab-icon">↓</span>
          <span class="fab-label">{{ newMessageCount }} 条新消息</span>
        </button>
      </Transition>

      <!-- 回到底部（翻阅历史时始终可见，有新消息时被上面的替代） -->
      <Transition name="fab-pop">
        <button
          v-if="!shouldAutoScroll && newMessageCount === 0"
          class="fab fab--back-bottom"
          @click="scrollToBottom(true)"
        >
          <span class="fab-icon">↓</span>
        </button>
      </Transition>

      <!-- 跳转到 @提及 -->
      <Transition name="fab-pop">
        <button
          v-if="hasMentionJumps && remainingMentionCount > 0"
          class="fab fab--jump-mention"
          @click="jumpToNextMention"
        >
          <span class="fab-icon">@</span>
          <span class="fab-label">{{ remainingMentionCount }}</span>
        </button>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.messages-wrapper {
  flex: 1;
  position: relative;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scroll-behavior: smooth;
}

/* 消息密度 */
.messages-area[data-density="compact"] { gap: 6px; padding: 14px 20px; }
.messages-area[data-density="comfortable"] { gap: 22px; padding: 28px 32px; }

.load-more-hint {
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  padding: 8px;
}

.load-more-hint.end {
  color: var(--text-muted);
  opacity: 0.7;
}

.empty-msg-hint {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: var(--text-muted);
  animation: ld-fade-in 0.6s var(--ease-out-expo) both;
}

.empty-msg-hint p {
  margin: 4px 0;
  font-size: 16px;
  color: var(--text-secondary);
}

.empty-msg-hint .hint {
  font-size: 13px;
  color: var(--text-muted);
}

/* ================================================================
   悬浮按钮堆叠 (FAB stack)
   ================================================================ */
.fab-stack {
  position: absolute;
  bottom: 16px;
  right: 20px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  z-index: 50;
  pointer-events: none;
}

.fab {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-family: var(--font-sans);
  box-shadow: var(--shadow-md), 0 0 0 1px var(--border) inset;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: transform 0.2s var(--ease-bounce), box-shadow 0.2s ease, background 0.2s ease;
}

.fab:hover {
  transform: translateY(-2px) scale(1.03);
  box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-strong) inset;
}

.fab:active {
  transform: translateY(0) scale(0.97);
}

.fab-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.fab-label {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

/* ― 新消息通知 ― */
.fab--new-msgs {
  padding: 8px 16px;
  background: var(--surface-solid);
  color: var(--accent-text);
}

.fab--new-msgs .fab-icon {
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
}

/* ― 回到底部 ― */
.fab--back-bottom {
  width: 42px;
  height: 42px;
  padding: 0;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-solid);
  color: var(--text-secondary);
}

.fab--back-bottom .fab-icon {
  background: transparent;
  color: var(--text-secondary);
  font-size: 18px;
}

/* ― 跳转到 @ ― */
.fab--jump-mention {
  padding: 8px 14px;
  background: var(--surface-solid);
  color: var(--warning-text);
}

.fab--jump-mention .fab-icon {
  background: var(--warning-bg);
  color: var(--warning-text);
  font-size: 13px;
}

.fab--jump-mention .fab-label {
  min-width: 18px;
  text-align: center;
}

/* ― 共用出入动画 ― */
.fab-pop-enter-active {
  transition: opacity 0.28s var(--ease-out-expo), transform 0.32s var(--ease-out-expo);
}
.fab-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.22s var(--ease-in-out);
}
.fab-pop-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.85);
}
.fab-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.9);
}
</style>

<!-- 全局：@消息高亮闪烁 (不受 scoped 限制) -->
<style>
.msg-flash {
  animation: msg-flash-anim 1.6s var(--ease-in-out);
}

@keyframes msg-flash-anim {
  0% { box-shadow: 0 0 0 4px var(--warning-border); background: var(--warning-bg); border-radius: var(--radius-sm); }
  100% { box-shadow: 0 0 0 0 transparent; background: transparent; }
}
</style>
