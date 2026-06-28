<script setup lang="ts">
import { ref, watch, nextTick, computed, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { fetchRoomMessages } from '@/composables/useApi'
import { onWsEvent } from '@/composables/useWebSocket'
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

// ---- @提及会话状态 (v2.4) ----
// 进房时从 store 快照一次，并立即清空 store，使「读过即清」——
// 再次进入房间不再重复出现 FAB；本次会话内仍可用快照跳转。
/** 本次会话可跳转的 @消息 id（最新在前） */
const mentionJumpList = ref<string[]>([])
/** 已跳转到的索引 */
const mentionJumpIdx = ref(0)
/** 等待「进入视口时闪烁」的 @消息 id 集合 */
const flashQueue = ref<Set<string>>(new Set())
/** 视口可见性观察器，用于在 @气泡进入屏幕时触发闪烁 */
let viewObserver: IntersectionObserver | null = null

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

// ---- 气泡闪烁 ----

function flashEl(el: HTMLElement) {
  el.classList.remove('msg-flash')
  // requestAnimationFrame 确保 DOM 在移除 class 后完成一次绘制，
  // 再添加 class 重新触发 CSS 动画；比 void offsetWidth 更可靠
  requestAnimationFrame(() => {
    el.classList.add('msg-flash')
    setTimeout(() => el.classList.remove('msg-flash'), 1700)
  })
}

function flashMessage(messageId: string) {
  const el = document.getElementById('msg-' + messageId)
  if (el) flashEl(el)
}

// ---- 视口可见性观察：@气泡进入屏幕时闪烁 (v2.4) ----

function setupObserver() {
  if (!messagesContainer.value) return
  viewObserver?.disconnect()
  viewObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const mid = (e.target as HTMLElement).id.replace(/^msg-/, '')
        if (flashQueue.value.has(mid)) {
          flashEl(e.target as HTMLElement)
          flashQueue.value.delete(mid)
        }
      }
    },
    { root: messagesContainer.value, threshold: 0.55 },
  )
  observeBubbles()
}

function observeBubbles() {
  if (!viewObserver || !messagesContainer.value) return
  messagesContainer.value.querySelectorAll('.message-item').forEach((el) => {
    viewObserver!.observe(el)
  })
}

// ---- 进房时快照 @提及（读过即清，避免重进重复出现）----

function captureMentionsForRoom() {
  const rid = chatStore.currentRoomId
  if (!rid) return
  const stored = chatStore.unreadMentionMessages[rid] || []
  mentionJumpList.value = [...stored]
  mentionJumpIdx.value = 0
  flashQueue.value = new Set(stored)
  // 立即清空 store 未读，使下次进入该房间不再重复展示
  if (stored.length > 0) chatStore.clearUnreadMentions(rid)
}

// ---- 滚动位置记忆 (v2.4) ----

function restoreScrollPosition() {
  if (!messagesContainer.value || !chatStore.currentRoomId) return

  // 侧栏 @通知跳转：检测到 pending 标记，优先跳到第一条 @消息
  const pendingJump = chatStore.consumeMentionJump()
  if (pendingJump && pendingJump === chatStore.currentRoomId) {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
      nextTick(() => jumpToNextMention())
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
        pruneVisibleMentions()
      })
      return
    }
  }
  // 默认回到底部（@气泡可见时由 IntersectionObserver 触发闪烁）
  scrollToBottom()
  // 若所有 @消息已在视口内，无需 FAB 跳转提示
  nextTick(() => pruneVisibleMentions())
}

// ---- 跳转到指定消息 ----

function scrollToMessage(messageId: string) {
  nextTick(() => {
    const el = document.getElementById('msg-' + messageId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      flashEl(el)
      flashQueue.value.delete(messageId)
    }
  })
}

// ---- @提及跳转 (会话快照) ----

const hasMentionJumps = computed(() => mentionJumpList.value.length > 0)

const remainingMentionCount = computed(() =>
  Math.max(0, mentionJumpList.value.length - mentionJumpIdx.value),
)

function jumpToNextMention() {
  if (mentionJumpIdx.value >= mentionJumpList.value.length) return
  const mid = mentionJumpList.value[mentionJumpIdx.value]
  mentionJumpIdx.value++
  scrollToMessage(mid)
}

/** 移除已在视口内可见的 @消息，避免为已读内容显示 FAB */
function pruneVisibleMentions() {
  if (!messagesContainer.value || mentionJumpList.value.length === 0) return
  const containerRect = messagesContainer.value.getBoundingClientRect()
  const remaining = mentionJumpList.value.filter((mid, i) => {
    // 保留已跳转过的（索引已推进）和不可见的
    if (i < mentionJumpIdx.value) return false // 已跳转，移除
    const el = document.getElementById('msg-' + mid)
    if (!el) return false // DOM 不存在，移除
    const r = el.getBoundingClientRect()
    const fullyVisible = r.top >= containerRect.top && r.bottom <= containerRect.bottom
    return !fullyVisible // 不可见 → 保留
  })
  mentionJumpList.value = remaining
  if (remaining.length === 0) mentionJumpIdx.value = 0
}

// ---- 消息监听 ----

watch(
  () => chatStore.messages.length,
  () => {
    if (shouldAutoScroll.value) {
      scrollToBottom()
    } else if (chatStore.loadingHistory) {
      // 正在加载历史/首屏：不计新消息数（避免首次进入 lastPosition 模式时误显示「1 条新消息」）
    } else {
      newMessageCount.value++
    }
    // 新气泡渲染后重新挂观察，使新到达的 @消息可被闪烁
    nextTick(() => observeBubbles())
  },
)

// 当前房间收到 @提及 → 即时闪烁（消息进入视口时由观察器触发）
const unsubMention = onWsEvent('mention', (data: any) => {
  if (!data || data.room_id !== chatStore.currentRoomId) return
  if (data.from === authStore.userId || !data.message_id) return
  // 仅当当前用户真正被 @ 时才闪烁 / 入跳转列表
  let elems: any[] = data.elements
  if (typeof elems === 'string') {
    try { elems = JSON.parse(elems) } catch { elems = [] }
  }
  if (!Array.isArray(elems)) elems = []
  const isTargeted = elems.some(
    (el: any) => el.type === 'mention' && (el.user_id === authStore.userId || el.user_id === 'ALL'),
  )
  if (!isTargeted) return
  flashQueue.value = new Set([...flashQueue.value, data.message_id])
  // 同时纳入本次会话的跳转列表
  if (!mentionJumpList.value.includes(data.message_id)) {
    mentionJumpList.value = [data.message_id, ...mentionJumpList.value]
  }
  nextTick(() => observeBubbles())
})

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
    // 先快照 @提及（并清空 store），再挂观察器与定位
    captureMentionsForRoom()
    setupObserver()
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

onMounted(() => {
  // 首屏可能已通过 immediate watch 加载，确保观察器挂载
  nextTick(() => setupObserver())
})

onUnmounted(() => {
  viewObserver?.disconnect()
  unsubMention()
  clearTimeout(savePosTimer)
})

// 暴露给父组件：跳转到指定消息（滚动 + 高亮闪烁），供公告栏定位使用
defineExpose({ jumpToMessage: scrollToMessage })
</script>

<template>
  <div class="messages-wrapper" :data-scroll-behavior="chatStore.scrollBehavior">
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

/* 从离开位置继续：去掉气泡入场动画 */
.messages-wrapper[data-scroll-behavior="lastPosition"] :deep(.message-item) {
  animation: none !important;
}

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
