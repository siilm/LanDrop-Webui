<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ClientMessage, MessageElement, ReplyElement } from '@/types/chat'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { fileBlobCache } from '@/utils/BlobCache'
import { getBaseUrl, fetchFileBlob } from '@/composables/useApi'

const props = defineProps<{
  message: ClientMessage
  isSelf: boolean
  currentRoomId?: string
}>()

const emit = defineEmits<{
  recall: [msg: ClientMessage]
  edit: [msg: ClientMessage]
  contextMenu: [event: MouseEvent, msg: ClientMessage]
  imageClick: [element: MessageElement]
  fileClick: [element: MessageElement]
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()

// ---- 公告消息 (v2.5) ----
const isAnnouncement = computed(() => props.message.msg_type === 'announce')

/** 公告正文：从 content / 文本元素提取并去除 "[公告] " 前缀 */
const announcementText = computed(() => {
  let text = props.message.content || ''
  if (!text && props.message.elements) {
    const textEl = props.message.elements.find((e) => e.type === 'text') as { content?: string } | undefined
    text = textEl?.content || ''
  }
  return text.replace(/^\[公告\]\s*/, '')
})

// ---- 上传进度 (v3.0) ----
const isUploading = computed(() =>
  props.message.status === 'uploading' ||
  props.message.elements?.some((el: any) => el.uploading === true) ||
  false
)
/** 从 uploadProgress store 中匹配当前消息的上传进度（按文件名关联） */
const uploadProgressPct = computed(() => {
  if (!isUploading.value) return 0
  const fileName = (props.message.elements?.[0] as any)?.file_name || ''
  if (!fileName) return 0
  for (const [, p] of Object.entries(chatStore.uploadProgress)) {
    if (p.fileName === fileName && p.total > 0) return Math.min(100, Math.round((p.sent / p.total) * 100))
  }
  return 0
})

// 消息发送者的房间成员信息（用于显示头衔和头像）
// 显式依赖 memberList.length 确保 roomMembers 发生变化时重新计算
const senderMember = computed(() => {
  if (!props.currentRoomId) return undefined
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _trigger = chatStore.memberList.length
  const member = chatStore.roomMembers.get(props.message.from)
  if (member) {
    console.log(`[MessageBubble] from=${props.message.from} username=${member.username} display_name=${member.display_name}`)
  }
  return member
})

// 发送者显示名称（圆角矩形badge）：优先 display_name(头衔)，其次 username，最后 userId
const senderDisplayName = computed(() => {
  const member = senderMember.value
  if (member?.display_name) {
    return member.display_name
  }
  if (member?.username) {
    return member.username
  }
  if (props.message.display_name) {
    return props.message.display_name
  }
  return props.message.from
})

// 发送者用户名（括号内显示）
const senderUsername = computed(() => {
  if (props.isSelf) return authStore.username
  const member = senderMember.value
  if (member?.username) return member.username
  return ''
})

/** 根据角色返回颜色 CSS 类名 */
const senderRoleColorClass = computed(() => {
  const member = senderMember.value
  if (!member) {
    return 'role-member'
  }
  const role = parseInt(member.role)
  if (role >= 2) return 'role-creator'    // 群主
  if (role >= 1) return 'role-admin'      // 管理员
  return 'role-member'                     // 普通成员
})

// 发送者头像 URL（通过 JWT fetch 获取 blob URL）
const avatarBlobUrl = ref('')

watch(
  () => props.message.from,
  (userId) => {
    if (!userId) return
    loadAvatarBlob(userId)
  },
  { immediate: true },
)

async function loadAvatarBlob(userId: string) {
  try {
    const base = getBaseUrl().replace(/\/api\/?$/, '')
    const url = `${base}/api/getfiles/avatar/${userId}`
    const cached = avatarBlobCache.get(userId)
    if (cached) {
      avatarBlobUrl.value = cached
      return
    }
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    })
    if (!res.ok) {
      avatarBlobUrl.value = ''
      return
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    avatarBlobCache.setPersistent(userId, blobUrl, blob)
    avatarBlobUrl.value = blobUrl
  } catch {
    avatarBlobUrl.value = ''
  }
}

// ===== 头像 blob 缓存 =====
import { avatarBlobCache } from '@/utils/BlobCache'

const formattedTime = computed(() => {
  const d = new Date(props.message.timestamp || Date.now())
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const statusIcon = computed(() => {
  switch (props.message._status) {
    case 'sending':
      return '⏳'
    case 'failed':
      return '❌'
    case 'sent':
      return '✓'
    default:
      return ''
  }
})

// 反应式图片 blob URL 映射（用于 JWT 鉴权图片加载）
const imageBlobSrcMap = ref<Record<string, string>>({})
const loadingImages = ref<Set<string>>(new Set())
const failedImages = ref<Set<string>>(new Set())

/** 获取图片的 blob URL，优先缓存，未命中时异步加载 */
function getImageSrc(fileId: string): string | undefined {
  // 已有 blob URL
  if (imageBlobSrcMap.value[fileId]) return imageBlobSrcMap.value[fileId]
  // 检查 BlobCache
  const cached = fileBlobCache.get(fileId)
  if (cached) {
    imageBlobSrcMap.value[fileId] = cached
    return cached
  }
  // 未缓存 → 异步触发 JWT fetch
  loadImageBlob(fileId)
  return undefined
}

async function loadImageBlob(fileId: string) {
  if (loadingImages.value.has(fileId) || failedImages.value.has(fileId)) return
  loadingImages.value.add(fileId)
  const roomId = props.message.room_id || props.currentRoomId || ''
  const blobUrl = await fetchFileBlob(fileId, roomId)
  loadingImages.value.delete(fileId)
  if (blobUrl) {
    imageBlobSrcMap.value = { ...imageBlobSrcMap.value, [fileId]: blobUrl }
  } else {
    failedImages.value.add(fileId)
  }
}

/** 图片加载失败时的 fallback：尝试 JWT fetch */
function handleImageError(e: Event, fileId: string) {
  if (failedImages.value.has(fileId)) return
  loadImageBlob(fileId)
}

function getFileUrl(fileId: string): string {
  const cached = fileBlobCache.get(fileId)
  if (cached) return cached
  const base = getBaseUrl().replace(/\/api\/?$/, '')
  const roomId = props.message.room_id || props.currentRoomId || ''
  // 添加 JWT token 作为查询参数（<img> 标签无法设置 Authorization Header）
  const token = authStore.accessToken
  return `${base}/api/getfiles/${roomId}/${fileId}?token=${encodeURIComponent(token || '')}`
}

function handleContextMenu(e: MouseEvent) {
  emit('contextMenu', e, props.message)
}

function handleFileDownload(el: MessageElement) {
  // 由父组件（ChatPage）统一处理下载，避免 emit 回调中重复下载
  emit('fileClick', el)
}

/** 解析预览对象，提取发送者名和预览文本 */
function parseReplyPreview(preview: string | { from?: string; text?: string } | undefined): { from: string; text: string } {
  if (typeof preview === 'object' && preview !== null) {
    return { from: preview.from || '', text: preview.text || '' }
  }
  if (typeof preview === 'string') {
    // 尝试解析 JSON 字符串（服务端可能将 preview 序列化为字符串）
    try {
      const parsed = JSON.parse(preview)
      if (parsed && typeof parsed === 'object') {
        return { from: parsed.from || '', text: parsed.text || '' }
      }
    } catch { /* not JSON */ }
    return { from: '', text: preview }
  }
  return { from: '', text: '' }
}

/** 格式化回复元素的预览信息 */
function getReplyInfo(el: ReplyElement): { senderName: string; previewText: string } {
  const { from, text } = parseReplyPreview(el.preview)
  const member = from ? chatStore.roomMembers.get(from) : undefined
  // 服务端现已返回 username 字段，优先使用 username，其次 display_name，最后回退到 from
  const senderName = member?.username || member?.display_name || from
  return { senderName, previewText: text }
}

/** 通过 user_id 查找成员显示名 (v2.2)，用于渲染 @提及标签 */
function getMemberNameById(userId: string): string {
  const member = chatStore.roomMembers.get(userId)
  return member?.username || member?.display_name || ''
}

/** 跳转到回复引用的原消息 (v2.4) */
function jumpToReplySource(messageId: string) {
  if (!messageId) return
  const el = document.getElementById('msg-' + messageId)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('msg-flash')
    setTimeout(() => el.classList.remove('msg-flash'), 1600)
  }
}
</script>

<template>
  <!-- ============ 公告卡片 (v2.5) ============ -->
  <div
    v-if="isAnnouncement"
    :id="'msg-' + message.message_id"
    class="message-item is-announce"
    @contextmenu.prevent="handleContextMenu"
  >
    <div class="announce-card">
      <div class="announce-card-head">
        <span class="announce-card-icon">📢</span>
        <span class="announce-card-label">公告</span>
        <span class="announce-card-from">{{ senderDisplayName }}</span>
        <span class="announce-card-time">{{ formattedTime }}</span>
      </div>
      <div class="announce-card-body">{{ announcementText }}</div>
    </div>
  </div>

  <!-- ============ 普通消息 ============ -->
  <div
    v-else
    :id="'msg-' + message.message_id"
    class="message-item"
    :class="{ self: isSelf }"
    @contextmenu.prevent="handleContextMenu"
  >
    <!-- 发送者信息 -->
    <!-- 他人格式：头像 display_name (username) -->
    <!-- 自己格式：(username) display_name 头像（flex-direction: row-reverse） -->
    <div class="message-header" :class="{ 'self-header': isSelf }">
      <!-- 头像 -->
      <img
        v-if="avatarBlobUrl"
        :src="avatarBlobUrl"
        class="sender-avatar"
        alt="avatar"
      />
      <div v-else class="sender-avatar placeholder-avatar">
        {{ (message.display_name || message.from || '?').charAt(0).toUpperCase() }}
      </div>
      <!-- display_name（角色配色圆角矩形容器，黑色文字） -->
      <span class="sender-name-badge" :class="senderRoleColorClass">{{ senderDisplayName }}</span>
      <!-- username（括号内） -->
      <span v-if="senderUsername" class="sender-username">{{ senderUsername }}</span>
    </div>

    <div class="message-bubble">
      <!-- 消息元素渲染 -->
      <template v-if="message.elements && message.elements.length > 0">
        <template v-for="(el, ei) in message.elements" :key="ei">
          <!-- 文本 -->
          <span v-if="el.type === 'text'" class="text-content">{{ el.content }}</span>

          <!-- 图片 -->
          <div v-else-if="el.type === 'image'" class="image-wrapper">
            <img
              v-if="getImageSrc(el.file_id)"
              :src="getImageSrc(el.file_id)!"
              :alt="el.file_name || '图片'"
              class="msg-image"
              @click="emit('imageClick', el)"
              @error="(e) => handleImageError(e, el.file_id)"
              loading="lazy"
            />
            <img
              v-else
              :src="getFileUrl(el.file_id)"
              :alt="el.file_name || '图片'"
              class="msg-image"
              @click="emit('imageClick', el)"
              @error="(e) => handleImageError(e, el.file_id)"
              loading="lazy"
            />
            <div v-if="el.file_name" class="image-name">{{ el.file_name }}</div>
          </div>

          <!-- 文件 -->
          <div v-else-if="el.type === 'file'" class="file-wrapper">
            <!-- 上传中占位消息 (v3.0) -->
            <div v-if="(el as any).uploading || message.status === 'uploading'" class="file-uploading">
              <span class="file-uploading-icon">⏳</span>
              <div class="file-uploading-info">
                <span class="file-uploading-name">{{ el.file_name }}</span>
                <div class="file-progress-track">
                  <div
                    class="file-progress-fill"
                    :style="{ width: uploadProgressPct + '%' }"
                  ></div>
                </div>
                <span class="file-uploading-pct">{{ uploadProgressPct }}%</span>
              </div>
            </div>
            <!-- 正常文件 -->
            <a
              v-else
              href="javascript:void(0)"
              class="file-link"
              @click="handleFileDownload(el)"
            >
              📎 {{ el.file_name }}
              <span class="file-size">({{ (el.file_size / 1024).toFixed(1) }} KB)</span>
            </a>
          </div>

          <!-- 回复 -->
          <div v-else-if="el.type === 'reply'" class="reply-ref">
            <button
              class="reply-jump-btn"
              title="跳转到原消息"
              @click.stop="jumpToReplySource(el.message_id)"
            >↑</button>
            <div class="reply-sender-line">回复 <strong>@{{ getReplyInfo(el).senderName || el.message_id }}</strong></div>
            <div class="reply-text-line">{{ getReplyInfo(el).previewText || '[回复的消息]' }}</div>
          </div>

          <!-- @提及 (v2.2) -->
          <span
            v-else-if="el.type === 'mention'"
            class="mention-tag"
            :class="{ 'mention-all': el.user_id === 'ALL' }"
          >{{ el.user_id === 'ALL' ? '@全体成员' : '@' + (getMemberNameById(el.user_id) || el.user_id) }}</span>

          <!-- 图片（picture 类型） -->
          <div v-else-if="el.type === 'picture'" class="image-wrapper">
            <img
              v-if="getImageSrc(el.file_id)"
              :src="getImageSrc(el.file_id)!"
              :alt="el.file_name || '图片'"
              class="msg-image"
              @click="emit('imageClick', el)"
              @error="(e) => handleImageError(e, el.file_id)"
              loading="lazy"
            />
            <img
              v-else
              :src="getFileUrl(el.file_id)"
              :alt="el.file_name || '图片'"
              class="msg-image"
              @click="emit('imageClick', el)"
              @error="(e) => handleImageError(e, el.file_id)"
              loading="lazy"
            />
          </div>
        </template>
      </template>

      <!-- 纯文本降级 -->
      <span v-else-if="message.content" class="text-content">{{ message.content }}</span>
    </div>

    <!-- 底部信息 -->
    <div class="message-footer">
      <span class="message-time">{{ formattedTime }}</span>
      <span v-if="isSelf && statusIcon" class="msg-status" :class="message._status">
        {{ statusIcon }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.message-item {
  display: flex;
  flex-direction: column;
  max-width: 72%;
  animation: ld-bubble-in 0.4s var(--ease-out-expo) both;
}

.message-item.self {
  align-self: flex-end;
  align-items: flex-end;
}

.message-item:not(.self) {
  align-items: flex-start;
}

/* ===== 公告卡片 (v2.5) ===== */
.message-item.is-announce {
  align-self: center;
  align-items: stretch;
  max-width: 86%;
  width: 100%;
}

.announce-card {
  border: 1px solid var(--warning-border);
  background:
    linear-gradient(0deg, var(--warning-bg), var(--warning-bg)),
    var(--surface-solid);
  border-radius: var(--radius-md);
  padding: 12px 16px;
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}

.announce-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--warning);
}

.announce-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  font-size: 12px;
}

.announce-card-icon {
  font-size: 15px;
}

.announce-card-label {
  font-weight: 700;
  color: var(--warning-text);
  letter-spacing: 0.04em;
}

.announce-card-from {
  color: var(--text-secondary);
}

.announce-card-time {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 11px;
}

.announce-card-body {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.message-header {
  display: flex;
  align-items: center;
  align-self: stretch;
  gap: 8px;
  margin-bottom: 5px;
}

/* 自己消息的消息头：从右到左排列（username display_name 头像） */
.message-header.self-header {
  flex-direction: row-reverse;
}

.sender-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 0 0 1px var(--border);
}

.placeholder-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

/* ===== DisplayName 圆角徽章 ===== */
.sender-name-badge {
  display: inline-block;
  padding: 1px 10px;
  border-radius: var(--radius-pill);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.6;
}

.sender-name-badge.role-creator {
  background: var(--role-creator-bg);
  color: var(--role-creator-text);
}
.sender-name-badge.role-admin {
  background: var(--role-admin-bg);
  color: var(--role-admin-text);
}
.sender-name-badge.role-member {
  background: var(--role-member-bg);
  color: var(--role-member-text);
}

.sender-username {
  font-size: 11px;
  color: var(--text-muted);
}

.message-bubble {
  width: fit-content;
  max-width: 100%;
  min-width: 70px;
  padding: 8px 12px;
  background: var(--bubble-other);
  color: var(--bubble-other-text);
  border-radius: var(--radius-md);
  border-bottom-left-radius: 4px;
  font-size: 14px;
  line-height: 1.55;
  word-break: break-word;
  box-shadow: var(--shadow-sm);
  transition: background 0.5s var(--ease-in-out);
}

.message-item.self .message-bubble {
  background: var(--bubble-self);
  color: var(--bubble-self-text);
  border-radius: var(--radius-md);
  border-bottom-right-radius: 4px;
  border-bottom-left-radius: var(--radius-md);
}

.text-content {
  white-space: pre-wrap;
}

.message-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
}

.message-item.self .message-footer {
  justify-content: flex-end;
}

.message-time {
  font-size: 11px;
  color: var(--text-muted);
}

.msg-status {
  font-size: 12px;
}

.msg-status.sending {
  animation: ld-pulse 1s var(--ease-in-out) infinite;
}

.msg-status.sent {
  color: var(--success);
}

.msg-status.failed {
  color: var(--danger);
}

.image-wrapper {
  max-width: 280px;
}

.msg-image {
  max-width: 100%;
  max-height: 300px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: block;
  transition: opacity 0.2s ease, transform 0.25s var(--ease-out-expo);
}

.msg-image:hover {
  opacity: 0.92;
  transform: scale(1.01);
}

.image-name {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-item.self .image-name {
  color: rgba(255, 255, 255, 0.65);
}

/* @提及标签 (v2.2) */
.mention-tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 600;
  background: var(--accent-soft);
  color: var(--accent-text);
  margin-right: 2px;
  vertical-align: baseline;
  transition: background 0.2s ease;
}

.mention-tag.mention-all {
  background: var(--warning-bg);
  color: var(--warning-text);
}

.message-item.self .mention-tag {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.message-item.self .mention-tag.mention-all {
  background: rgba(247, 185, 85, 0.25);
  color: #ffe5b0;
}

.file-uploading {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 4px 0;
}

.file-uploading-icon {
  font-size: 16px;
  animation: ld-spin 1.5s linear infinite;
  flex-shrink: 0;
  margin-top: 1px;
}

.file-uploading-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-uploading-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 220px;
  color: var(--text);
}

/* 进度条轨道 */
.file-progress-track {
  width: 100%;
  height: 5px;
  border-radius: 3px;
  background: var(--surface-2);
  overflow: hidden;
  position: relative;
}

/* 进度条填充（非线性宽度过渡，easeOutExpo 平滑跟随） */
.file-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--brand), var(--brand-light));
  transition: width 0.35s var(--ease-out-expo);
  min-width: 2px;
}

/* 上传中时进度条添加微光扫过动画 */
.file-progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.3) 40%,
    rgba(255, 255, 255, 0.45) 60%,
    transparent 100%
  );
  animation: ld-progress-shimmer 1.8s var(--ease-in-out) infinite;
}

@keyframes ld-progress-shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.file-uploading-pct {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.file-link {
  color: var(--accent-text);
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.message-item.self .file-link {
  color: #fff;
}

.file-link:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.file-size {
  font-size: 11px;
  opacity: 0.7;
}

.reply-ref {
  position: relative;
  display: block;
  min-width: 220px;
  padding: 7px 44px 7px 11px;
  margin-bottom: 6px;
  background: var(--surface-2);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-xs);
  font-size: 12px;
  line-height: 1.4;
}

.reply-jump-btn {
  position: absolute;
  top: 50%;
  right: 6px;
  transform: translateY(-50%);
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px var(--accent-glow);
  transition: transform 0.22s var(--ease-bounce), box-shadow 0.2s ease;
}

.reply-jump-btn:hover {
  transform: translateY(-50%) scale(1.18);
  box-shadow: 0 4px 14px var(--accent-glow);
}

.reply-jump-btn:active {
  transform: translateY(-50%) scale(0.95);
}

/* 自己消息（紫色气泡）中的跳转按钮改用浅底，保证对比 */
.message-item.self .reply-jump-btn {
  background: rgba(255, 255, 255, 0.9);
  color: var(--brand);
  box-shadow: none;
}

.reply-sender-line {
  color: var(--accent-text);
  font-size: 12px;
  margin-bottom: 2px;
}

.reply-text-line {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-item.self .reply-ref {
  background: rgba(255, 255, 255, 0.12);
  border-left-color: rgba(255, 255, 255, 0.5);
}

.message-item.self .reply-sender-line {
  color: rgba(255, 255, 255, 0.9);
}

.message-item.self .reply-text-line {
  color: rgba(255, 255, 255, 0.7);
}
</style>
