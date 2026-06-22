<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import { getBaseUrl } from '@/composables/useApi'
import type { RoomMember, ClientMessage } from '@/types/chat'

const props = defineProps<{
  replyTarget?: { messageId: string; preview: string } | null
}>()

const emit = defineEmits<{
  send: [text: string, replyTo?: string, mentionUserIds?: string[]]
  clearReply: []
  sendImage: [files: FileList | File[]]
  sendFile: [files: FileList | File[]]
}>()

const chatStore = useChatStore()
const authStore = useAuthStore()

// 检测当前用户是否被禁言
// 依赖 memberList.length 确保 roomMembers Map 变化时重新计算
const _mutedTrigger = computed(() => chatStore.memberList.length)
const isMuted = computed(() => {
  void _mutedTrigger.value
  if (!chatStore.currentRoomId || !authStore.userId) {
    return false
  }
  const self = chatStore.roomMembers.get(authStore.userId)
  // 服务端可能返回 true/false(boolean) 或 0/1(number)
  const mv = (self as any)?.muted
  const muted = mv === true || mv === 1
  return muted
})

const messageText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const imageInput = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

// @mention
const showMention = ref(false)
const mentionQuery = ref('')
const mentionCursorPos = ref(0)
const activeMentionIndex = ref(0)
/** 当前消息中通过下拉菜单选中的 @提及 user_id 集合 (v2.2) */
const activeMentionUserIds = ref<Set<string>>(new Set())

/** 当前用户是否可 @全体（需房间 role ≥ 1） */
const canMentionAll = computed(() => {
  if (!chatStore.currentRoomId || !authStore.userId) return false
  const self = chatStore.roomMembers.get(authStore.userId)
  const role = self ? parseInt(self.role) : 0
  return role >= 1
})

const filteredMembers = computed(() => {
  const members = Array.from(chatStore.roomMembers.values())
  let filtered = members
  if (mentionQuery.value) {
    const q = mentionQuery.value.toLowerCase()
    filtered = members.filter(
      (m) =>
        m.display_name?.toLowerCase().includes(q) ||
        m.user_id.toLowerCase().includes(q),
    )
  }
  // 按角色降序排列：Creator(2) > Admin(1) > Member(0)
  return [...filtered].sort((a, b) => parseInt(b.role) - parseInt(a.role))
})

/** 获取成员头像 URL（带 JWT token 的直链，<img> fallback 方案） */
function getMemberAvatarUrl(userId: string): string {
  const base = getBaseUrl().replace(/\/api\/?$/, '')
  return `${base}/api/getfiles/avatar/${userId}?token=${encodeURIComponent(authStore.accessToken || '')}`
}

/** 成员头像加载失败 → 显示首字母占位 */
const avatarErrors = ref<Set<string>>(new Set())
function onAvatarError(userId: string) {
  avatarErrors.value = new Set([...avatarErrors.value, userId])
}

/** 关闭 mention 下拉（点击外部、ESC 等不做@提及，纯文本发送） */
function closeMention() {
  showMention.value = false
}

function onDocumentClick(e: MouseEvent) {
  if (!showMention.value) return
  const target = e.target as HTMLElement
  if (!target.closest('.mention-dropdown') && !target.closest('.msg-input')) {
    closeMention()
  }
}

// 检测 @ 触发
function handleInput(e: Event) {
  const target = e.target as HTMLTextAreaElement
  const cursorPos = target.selectionStart || 0
  const textBefore = messageText.value.slice(0, cursorPos)

  // 查找最后一个 @
  const atIndex = textBefore.lastIndexOf('@')
  if (atIndex >= 0 && (atIndex === 0 || textBefore[atIndex - 1] === ' ' || textBefore[atIndex - 1] === '\n')) {
    const query = textBefore.slice(atIndex + 1)
    // 如果查询包含空格则关闭
    if (query.includes(' ') || query.includes('\n')) {
      showMention.value = false
    } else {
      mentionQuery.value = query
      mentionCursorPos.value = cursorPos
      showMention.value = true
      activeMentionIndex.value = 0
    }
  } else {
    showMention.value = false
  }
}

function selectMention(member: RoomMember) {
  const textBefore = messageText.value.slice(0, mentionCursorPos.value - mentionQuery.value.length - 1)
  const textAfter = messageText.value.slice(mentionCursorPos.value)
  const mentionText = member.display_name || member.user_id
  messageText.value = `${textBefore}@${mentionText} ${textAfter}`
  showMention.value = false
  // 记录该 @提及 (v2.2)
  activeMentionUserIds.value = new Set([...activeMentionUserIds.value, member.user_id])

  nextTick(() => {
    if (textareaRef.value) {
      const newPos = textBefore.length + mentionText.length + 2
      textareaRef.value.setSelectionRange(newPos, newPos)
      textareaRef.value.focus()
    }
  })
}

/** 选择 @全体成员 (v2.2) */
function selectMentionAll() {
  const textBefore = messageText.value.slice(0, mentionCursorPos.value - mentionQuery.value.length - 1)
  const textAfter = messageText.value.slice(mentionCursorPos.value)
  messageText.value = `${textBefore}@全体成员 ${textAfter}`
  showMention.value = false
  activeMentionUserIds.value = new Set([...activeMentionUserIds.value, 'ALL'])

  nextTick(() => {
    if (textareaRef.value) {
      const newPos = textBefore.length + 6 // '@全体成员 '
      textareaRef.value.setSelectionRange(newPos, newPos)
      textareaRef.value.focus()
    }
  })
}

function onMentionKeydown(e: KeyboardEvent) {
  if (!showMention.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeMentionIndex.value = Math.min(activeMentionIndex.value + 1, filteredMembers.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeMentionIndex.value = Math.max(activeMentionIndex.value - 1, 0)
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault()
    if (filteredMembers.value[activeMentionIndex.value]) {
      selectMention(filteredMembers.value[activeMentionIndex.value])
    }
  } else if (e.key === 'Escape') {
    showMention.value = false
  }
}

// 被回复的原消息（用于回复栏显示发送者）
const replyMessage = computed<ClientMessage | undefined>(() => {
  const target = props.replyTarget
  if (!target || !target.messageId) return undefined
  return chatStore.messages.find(m => m.message_id === target.messageId)
})

const replySenderName = computed(() => {
  if (!replyMessage.value) return ''
  const from = replyMessage.value.from
  const member = chatStore.roomMembers.get(from)
  // 服务端现已返回 username 字段，优先使用 username，其次 display_name，最后回退到 from
  return member?.username || member?.display_name || from
})

// 发送
function handleSend() {
  const text = messageText.value.trim()
  if (!text) return
  const replyTo = props.replyTarget?.messageId
  const mentionIds = activeMentionUserIds.value.size > 0
    ? [...activeMentionUserIds.value]
    : undefined
  emit('send', text, replyTo, mentionIds)
  emit('clearReply')
  messageText.value = ''
  activeMentionUserIds.value = new Set()
  // 重置 textarea 高度
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (showMention.value) {
    onMentionKeydown(e)
    return
  }
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function triggerFileUpload() {
  fileInput.value?.click()
}

function triggerImageUpload() {
  imageInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    emit('sendFile', input.files)
    input.value = ''
  }
}

function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    emit('sendImage', input.files)
    input.value = ''
  }
}

// 自动调整 textarea 高度
function autoResize() {
  if (textareaRef.value) {
    textareaRef.value.style.height = 'auto'
    textareaRef.value.style.height = `${Math.min(textareaRef.value.scrollHeight, 120)}px`
  }
}

// —— 生命周期 ——
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <div class="input-area">
    <!-- @mention 下拉 (v2.3) -->
    <Teleport to="body">
      <Transition name="mention-pop">
        <div
          v-if="showMention && (filteredMembers.length > 0 || canMentionAll)"
          class="mention-dropdown"
        >
          <!-- @全体成员 (v2.2)：需 role≥1，查询匹配 "all"/"全体" 或无查询时显示 -->
          <div
            v-if="canMentionAll && (mentionQuery === '' || 'all'.startsWith(mentionQuery.toLowerCase()) || '全体成员'.includes(mentionQuery))"
            class="mention-item mention-item--all"
            :class="{ active: activeMentionIndex === -1 }"
            @click="selectMentionAll"
            @mouseenter="activeMentionIndex = -1"
          >
            <span class="mention-avatar mention-avatar--all">📢</span>
            <span class="mention-body">
              <span class="mention-name">全体成员</span>
              <span class="mention-uid">all</span>
            </span>
          </div>
          <div class="mention-scroll">
            <div
              v-for="(member, i) in filteredMembers"
              :key="member.user_id"
              class="mention-item"
              :class="{ active: i === activeMentionIndex }"
              @click="selectMention(member)"
              @mouseenter="activeMentionIndex = i"
            >
              <img
                v-if="!avatarErrors.has(member.user_id)"
                :src="getMemberAvatarUrl(member.user_id)"
                class="mention-avatar"
                :alt="member.user_id"
                @error="onAvatarError(member.user_id)"
                loading="lazy"
              />
              <span v-else class="mention-avatar mention-avatar--fallback">
                {{ (member.display_name || member.user_id || '?')[0].toUpperCase() }}
              </span>
              <span class="mention-body">
                <span class="mention-name">{{ member.display_name || member.username || member.user_id }}</span>
                <span class="mention-uid">{{ member.user_id }}</span>
              </span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 图片按钮 -->
    <button
      type="button"
      class="btn-icon-input"
      title="发送图片"
      :disabled="!chatStore.currentRoomId || isMuted"
      @click="triggerImageUpload"
    >
      🖼️
    </button>

    <!-- 文件按钮 -->
    <button
      type="button"
      class="btn-icon-input"
      title="发送文件"
      :disabled="!chatStore.currentRoomId || isMuted"
      @click="triggerFileUpload"
    >
      📎
    </button>

    <!-- 隐藏的 file input -->
    <input
      ref="fileInput"
      type="file"
      class="hidden-input"
      multiple
      @change="onFileSelected"
    />
    <input
      ref="imageInput"
      type="file"
      accept="image/*"
      class="hidden-input"
      multiple
      @change="onImageSelected"
    />

    <!-- 回复提示栏 -->
    <div v-if="replyTarget" class="reply-bar">
      <div class="reply-info">
        <span class="reply-label">回复</span>
        <span class="reply-sender">{{ replySenderName }}</span>
        <span class="reply-preview">{{ replyTarget.preview || '(图片/文件)' }}</span>
      </div>
      <button class="reply-close" @click="emit('clearReply')">✕</button>
    </div>

    <!-- 禁言提示 -->
    <div v-if="isMuted" class="muted-bar">
      🔇 你已被禁言
    </div>

    <!-- 文本输入 -->
    <textarea
      ref="textareaRef"
      v-model="messageText"
      class="msg-input"
      :placeholder="isMuted ? '你已被禁言，无法发送消息' : '输入消息... @ 提及成员'"
      rows="1"
      :disabled="!chatStore.currentRoomId || isMuted"
      @input="handleInput; autoResize()"
      @keydown="handleKeydown"
    ></textarea>

    <!-- 发送按钮 -->
    <button
      type="button"
      class="btn-send"
      :disabled="!messageText.trim() || !chatStore.currentRoomId || isMuted"
      @click="handleSend"
    >
      发送
    </button>
  </div>
</template>

<style scoped>
.input-area {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 8px;
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  position: relative;
  align-items: flex-end;
  transition: background 0.5s var(--ease-in-out), border-color 0.5s var(--ease-in-out);
}

.btn-icon-input {
  width: 40px;
  height: 40px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  line-height: 1;
  transition: background 0.18s ease, border-color 0.18s ease, transform 0.2s var(--ease-bounce);
}

.btn-icon-input:hover:not(:disabled) {
  background: var(--accent-soft);
  border-color: var(--border-focus);
  transform: translateY(-2px);
}

.btn-icon-input:active:not(:disabled) {
  transform: translateY(0) scale(0.94);
}

.btn-icon-input:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.hidden-input {
  display: none;
}

.msg-input {
  flex: 1;
  padding: 10px 16px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text);
  background: var(--input-bg);
  outline: none;
  resize: none;
  font-family: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  max-height: 120px;
  min-height: 40px;
  line-height: 1.5;
  box-sizing: border-box;
}

.msg-input::placeholder {
  color: var(--text-muted);
}

.msg-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-muted);
  background: var(--input-bg-hover);
}

.btn-send {
  padding: 10px 24px;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  height: 40px;
  letter-spacing: 0.02em;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.btn-send:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px var(--accent-glow);
}

.btn-send:active:not(:disabled) {
  transform: translateY(0);
}

.btn-send:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 回复提示栏 */
.reply-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  padding: 7px 14px;
  background: var(--accent-soft);
  border-bottom: 1px solid var(--border);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transform: translateY(-100%);
  gap: 8px;
  animation: ld-slide-up-bar 0.25s var(--ease-out-expo) both;
}

@keyframes ld-slide-up-bar {
  from { opacity: 0; transform: translateY(-80%); }
  to { opacity: 1; transform: translateY(-100%); }
}

.reply-info {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}

.reply-label {
  color: var(--accent-text);
  font-weight: 600;
  white-space: nowrap;
}

.reply-sender {
  color: var(--text);
  font-weight: 500;
  white-space: nowrap;
}

.reply-preview {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reply-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  transition: color 0.15s ease, background 0.15s ease;
}

.reply-close:hover {
  color: var(--text);
  background: var(--surface-2-hover);
}

/* 禁言提示栏 */
.muted-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 7px 16px;
  background: var(--danger-bg);
  color: var(--danger-text);
  font-size: 13px;
  text-align: center;
  border-bottom: 1px solid var(--danger-border);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transform: translateY(-100%);
}

/* mention 下拉 - 全局样式 (v2.3 重构) */
:global(.mention-dropdown) {
  position: fixed;
  bottom: 90px;
  left: 24px;
  right: 24px;
  max-width: 340px;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg), 0 0 0 1px var(--border-soft, transparent) inset;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  z-index: 200;
  overflow: hidden;
}

/* 滚动容器：最多展示 ~5 项，超出可滚动 */
:global(.mention-scroll) {
  max-height: 260px;
  overflow-y: auto;
  padding: 4px;
}

:global(.mention-item) {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease, transform 0.15s ease;
}

:global(.mention-item:hover),
:global(.mention-item.active) {
  background: var(--accent-soft);
  transform: translateX(3px);
}

:global(.mention-item--all) {
  background: var(--warning-bg);
  border-radius: 0;
  margin: 0;
  padding: 9px 12px;
  border-bottom: 1px solid var(--warning-border);
}

:global(.mention-item--all:hover),
:global(.mention-item--all.active) {
  background: var(--warning-border);
  transform: none;
}

/* 头像 */
:global(.mention-avatar) {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px var(--border);
}

:global(.mention-avatar--all) {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: var(--warning-bg);
  box-shadow: 0 0 0 1px var(--warning-border);
}

:global(.mention-avatar--fallback) {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  background: var(--accent-soft);
}

/* 名字 + uid 列 */
:global(.mention-body) {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

:global(.mention-name) {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.mention-uid) {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  font-family: var(--font-mono);
}

:global(.mention-uid)::before {
  content: '(';
}

:global(.mention-uid)::after {
  content: ')';
}

/* —— 弹出/收起动画 —— */
:global(.mention-pop-enter-active) {
  transition: opacity 0.22s var(--ease-out-expo),
    transform 0.28s var(--ease-out-expo);
}
:global(.mention-pop-leave-active) {
  transition: opacity 0.16s ease,
    transform 0.2s var(--ease-in-out);
}
:global(.mention-pop-enter-from) {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
:global(.mention-pop-leave-to) {
  opacity: 0;
  transform: translateY(6px) scale(0.97);
}
</style>
