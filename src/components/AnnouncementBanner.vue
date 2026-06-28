<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import SvgIcon from '@/components/SvgIcon.vue'

const emit = defineEmits<{
  jump: [messageId: string]
}>()

const chatStore = useChatStore()

const PREVIEW_LIMIT = 100

/** 收起状态（持久化到 localStorage，按用户偏好） */
const LS_COLLAPSED = 'landrop_announce_collapsed'
const collapsed = ref(localStorage.getItem(LS_COLLAPSED) === 'true')

/** 当前展示的公告索引（0 = 最新） */
const index = ref(0)

const list = computed(() => chatStore.announcements)
const total = computed(() => list.value.length)
const current = computed(() => list.value[index.value])

/** 提取公告正文并去除 "[公告] " 前缀 */
function extractText(msg: any): string {
  let text = msg?.content || ''
  if (!text && msg?.elements) {
    const el = (Array.isArray(msg.elements) ? msg.elements : []).find((e: any) => e.type === 'text')
    text = el?.content || ''
  }
  return text.replace(/^\[公告\]\s*/, '')
}

const currentText = computed(() => extractText(current.value))
const isTruncated = computed(() => currentText.value.length > PREVIEW_LIMIT)
const previewText = computed(() =>
  isTruncated.value ? currentText.value.slice(0, PREVIEW_LIMIT) + '…' : currentText.value,
)

const senderName = computed(() => {
  const msg = current.value
  if (!msg) return ''
  const member = chatStore.roomMembers.get(msg.from)
  return member?.display_name || member?.username || msg.display_name || msg.from
})

// 新公告到达时，自动切到最新并（若已收起）保持收起
watch(total, (n, old) => {
  if (n > old) index.value = 0
  if (index.value >= n) index.value = Math.max(0, n - 1)
})

// 切换房间时重置索引
watch(
  () => chatStore.currentRoomId,
  () => { index.value = 0 },
)

function prev() {
  if (total.value === 0) return
  index.value = (index.value - 1 + total.value) % total.value
}
function next() {
  if (total.value === 0) return
  index.value = (index.value + 1) % total.value
}

function onWheel(e: WheelEvent) {
  if (total.value <= 1) return
  e.preventDefault()
  if (e.deltaY > 0) next()
  else prev()
}

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  localStorage.setItem(LS_COLLAPSED, String(collapsed.value))
}

function handleJump() {
  if (current.value) emit('jump', current.value.message_id)
}
</script>

<template>
  <!-- 无公告则不渲染 -->
  <div v-if="total > 0" class="announce-banner-wrap">
    <!-- 收起态：极简悬浮按钮 -->
    <Transition name="banner-fade" mode="out-in">
      <button
        v-if="collapsed"
        key="collapsed"
        class="announce-reopen"
        :title="`展开公告（${total} 条）`"
        @click="toggleCollapsed"
      >
        <span class="announce-reopen-icon"><SvgIcon name="announce" :size="16" /></span>
        <span class="announce-reopen-count">{{ total }}</span>
      </button>

      <!-- 展开态：完整悬浮栏 -->
      <div
        v-else
        key="expanded"
        class="announce-banner"
        @wheel="onWheel"
      >
        <span class="announce-banner-icon"><SvgIcon name="announce" :size="16" /></span>

        <div class="announce-banner-main">
          <div class="announce-banner-meta">
            <span class="announce-banner-label">公告</span>
            <span class="announce-banner-from">{{ senderName }}</span>
            <span v-if="total > 1" class="announce-banner-counter">{{ index + 1 }}/{{ total }}</span>
          </div>
          <Transition name="announce-text" mode="out-in">
            <div :key="current?.message_id" class="announce-banner-text">{{ previewText }}</div>
          </Transition>
        </div>

        <div class="announce-banner-actions">
          <!-- 多公告切换 -->
          <div v-if="total > 1" class="announce-switch">
            <button class="announce-btn" title="上一条" @click="prev">‹</button>
            <button class="announce-btn" title="下一条" @click="next">›</button>
          </div>
          <!-- 跳转到消息 -->
          <button class="announce-btn announce-btn--jump" title="定位到公告消息" @click="handleJump">↧</button>
          <!-- 收起 -->
          <button class="announce-btn" title="收起公告" @click="toggleCollapsed">✕</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
/* 0 高度定位容器：让悬浮栏覆盖在消息列表上方而不挤压布局 */
.announce-banner-wrap {
  position: relative;
  z-index: 3;
  height: 0;
}

/* ============ 展开态悬浮栏 ============ */
.announce-banner {
  position: absolute;
  top: 8px;
  left: 16px;
  right: 16px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 52px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  border: 1px solid var(--warning-border);
  box-shadow: var(--shadow-md);
  /* 左侧公告色条 */
  border-left: 3px solid var(--warning);
}

.announce-banner-icon {
  font-size: 16px;
  line-height: 1.4;
  flex-shrink: 0;
}

.announce-banner-main {
  flex: 1;
  min-width: 0;
}

.announce-banner-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 3px;
  font-size: 11px;
}

.announce-banner-label {
  font-weight: 700;
  color: var(--warning-text);
  letter-spacing: 0.04em;
}

.announce-banner-from {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.announce-banner-counter {
  margin-left: auto;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
}

.announce-banner-text {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  word-break: break-word;
  /* 预览至多三行，超出省略（已在脚本截断 100 字符，这里再兜底） */
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.announce-banner-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.announce-switch {
  display: flex;
  align-items: center;
  gap: 2px;
}

.announce-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, transform 0.2s var(--ease-bounce);
}

.announce-btn:hover {
  background: var(--surface-2-hover);
  color: var(--text);
  transform: translateY(-1px);
}

.announce-btn--jump {
  color: var(--warning-text);
  font-weight: 700;
}

.announce-btn--jump:hover {
  background: var(--warning-bg);
}

/* ============ 收起态按钮 ============ */
.announce-reopen {
  position: absolute;
  top: 8px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid var(--warning-border);
  border-radius: var(--radius-pill);
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  font-size: 13px;
  transition: transform 0.2s var(--ease-bounce), box-shadow 0.2s ease;
}

.announce-reopen:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.announce-reopen-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--warning-text);
  background: var(--warning-bg);
  border-radius: var(--radius-pill);
  padding: 0 6px;
  line-height: 16px;
  min-width: 16px;
  text-align: center;
}

/* ============ 动画 ============ */
.banner-fade-enter-active {
  transition: opacity 0.25s var(--ease-out-expo), transform 0.3s var(--ease-out-expo);
}
.banner-fade-leave-active {
  transition: opacity 0.16s ease, transform 0.2s var(--ease-in-out);
  position: absolute;
}
.banner-fade-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.96);
}
.banner-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

/* 切换公告时文本滚动淡入 */
.announce-text-enter-active {
  transition: opacity 0.22s ease, transform 0.26s var(--ease-out-expo);
}
.announce-text-leave-active {
  transition: opacity 0.14s ease, transform 0.18s var(--ease-in-out);
}
.announce-text-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.announce-text-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
