<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ClientMessage, MessageElement, ReplyElement } from '@/types/chat'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { fileBlobCache } from '@/utils/BlobCache'
import { getBaseUrl, fetchFileBlob, downloadFileViaJwt } from '@/composables/useApi'

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
  const roomId = props.message.room_id || props.currentRoomId || ''
  if ('file_id' in el && el.file_id) {
    downloadFileViaJwt(el.file_id, 'file_name' in el ? el.file_name : undefined, roomId)
  }
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
</script>

<template>
  <div
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
            <a
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
            <div class="reply-sender-line">回复 <strong>@{{ getReplyInfo(el).senderName }}</strong></div>
            <div class="reply-text-line">{{ getReplyInfo(el).previewText || '(图片/文件)' }}</div>
          </div>

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
  max-width: 72%;
  animation: ld-bubble-in 0.4s var(--ease-out-expo) both;
}

.message-item.self {
  align-self: flex-end;
}

.message-header {
  display: flex;
  align-items: center;
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
  padding: 10px 14px;
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
  display: block;
  padding: 6px 10px;
  margin-bottom: 6px;
  background: var(--surface-2);
  border-left: 3px solid var(--accent);
  border-radius: var(--radius-xs);
  font-size: 12px;
  line-height: 1.4;
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
