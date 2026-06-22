<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { fetchRoomMembers } from '@/composables/useApi'
import { avatarBlobCache, fileBlobCache } from '@/utils/BlobCache'
import { getBaseUrl } from '@/composables/useApi'
import { useTheme } from '@/composables/useTheme'
import { onWsEvent } from '@/composables/useWebSocket'
import RoomList from './RoomList.vue'
import MyRequestsPanel from './dialogs/MyRequestsPanel.vue'

const emit = defineEmits<{
  createRoom: [name: string]
  joinRoom: [roomId: string, message?: string, forceJoin?: boolean]
  leaveRoom: [roomId: string]
  logout: []
  refreshRooms: []
  uploadAvatar: []
  openAdmin: []
  openSettings: []
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()
const { themeIcon, themeLabel, cycleTheme } = useTheme()

// 角色徽章样式
const globalRoleClass = computed(() => {
  const role = authStore.globalRole
  if (role === 'owner') return 'role-owner'
  if (role === 'public_admin') return 'role-public_admin'
  return 'role-member'
})

const globalRoleLabel = computed(() => {
  const role = authStore.globalRole
  if (role === 'owner') return '拥有者'
  if (role === 'public_admin') return '公共管理员'
  return '成员'
})

const avatarError = ref(false)

function getInitial(name: string): string {
  return (name || '?')[0].toUpperCase()
}

async function handleUploadAvatar() {
  avatarError.value = false
  emit('uploadAvatar')
}

const showMyRequests = ref(false)

// 跨房间 @提及通知 (v2.3)
const mentionAlert = ref<{ roomId: string; roomName: string; from: string; preview: string } | null>(null)
let mentionAlertTimer: ReturnType<typeof setTimeout> | undefined

function dismissMentionAlert() {
  mentionAlert.value = null
  if (mentionAlertTimer) { clearTimeout(mentionAlertTimer); mentionAlertTimer = undefined }
}

function goToMentionRoom(roomId: string) {
  const room = chatStore.rooms.find(r => r.roomId === roomId)
  // 标记待跳转：MessageList 加载完消息后自动跳到 @消息
  chatStore.requestMentionJump(roomId)
  chatStore.switchRoom(roomId, room?.roomName || roomId)
  dismissMentionAlert()
}

const unsubMentionAlert = onWsEvent('mention_alert', (data: any) => {
  // 提取发送者与被 @ 的成员名（从 elements 中找 mention 条目）
  const senderName = data.display_name || data.from
  let previewText = data.content || ''
  if (!previewText && data.elements) {
    const textEl = (Array.isArray(data.elements) ? data.elements : []).find(
      (e: any) => e.type === 'text'
    ) as { content?: string } | undefined
    if (textEl?.content) previewText = textEl.content
  }
  const roomName = chatStore.rooms.find(r => r.roomId === data.room_id)?.roomName || data.room_id
  mentionAlert.value = {
    roomId: data.room_id,
    roomName,
    from: senderName,
    preview: previewText.length > 40 ? previewText.slice(0, 40) + '…' : previewText,
  }
  // 8 秒后自动消退
  if (mentionAlertTimer) clearTimeout(mentionAlertTimer)
  mentionAlertTimer = setTimeout(() => { mentionAlert.value = null }, 8000)
})

onUnmounted(() => {
  unsubMentionAlert()
})

function handleToggleMyRequests() {
  showMyRequests.value = !showMyRequests.value
}

function handleLeaveCurrentRoom() {
  if (!chatStore.currentRoomId) {
    alert('请先选择一个房间')
    return
  }
  if (confirm(`确定离开房间「${chatStore.currentRoomName}」？`)) {
    emit('leaveRoom', chatStore.currentRoomId)
  }
}
</script>

<template>
  <aside class="sidebar">
    <!-- 用户信息 -->
    <div class="sidebar-header">
      <div class="brand-row">
        <span class="brand-logo">💬</span>
        <h2>LanDrop</h2>
        <button
          class="theme-toggle-btn"
          :title="themeLabel"
          :aria-label="themeLabel"
          @click="cycleTheme"
        >
          <Transition name="theme-roll" mode="out-in">
            <span :key="themeIcon" class="theme-toggle-glyph">{{ themeIcon }}</span>
          </Transition>
        </button>
      </div>
      <div class="user-info">
        <div class="user-avatar-row">
          <div class="avatar-wrapper" @click="handleUploadAvatar" title="点击更换头像">
            <img
              v-if="authStore.avatarDisplaySrc && !avatarError"
              :src="authStore.avatarDisplaySrc"
              class="avatar-img"
              alt="头像"
              @error="avatarError = true"
            />
            <span v-else class="avatar-placeholder">
              {{ getInitial(authStore.username) }}
            </span>
            <div class="avatar-overlay">更换</div>
          </div>
          <div class="user-text">
            <div class="username">{{ authStore.username || '未登录' }}</div>
            <span class="global-role-badge" :class="globalRoleClass">
              {{ globalRoleLabel }}
            </span>
          </div>
          <div class="user-actions">
            <button class="btn-icon" title="设置" @click="emit('openSettings')">
              ⚙️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 连接状态 -->
    <div
      class="connection-status"
      :class="{ connected: chatStore.wsConnected }"
    >
      <span class="dot"></span>
      {{ chatStore.wsConnected ? '已连接' : chatStore.wsConnecting ? '连接中...' : '未连接' }}
    </div>

    <!-- 跨房间 @提及通知 (v2.3) -->
    <Transition name="alert-slide">
      <div
        v-if="mentionAlert"
        class="mention-alert"
        @click="goToMentionRoom(mentionAlert.roomId)"
      >
        <span class="mention-alert-icon">@</span>
        <span class="mention-alert-body">
          <span class="mention-alert-title">有人@我</span>
          <span class="mention-alert-sender">{{ mentionAlert.from }}：@{{ mentionAlert.preview }}</span>
        </span>
        <button class="mention-alert-close" @click.stop="dismissMentionAlert">×</button>
      </div>
    </Transition>

    <!-- 侧边栏操作 -->
    <div class="sidebar-actions">
      <button class="btn-action" @click="emit('refreshRooms')">
        🔄 刷新房间列表
      </button>
      <button
        v-if="authStore.globalRole === 'owner' || authStore.globalRole === 'public_admin'"
        class="btn-action btn-admin"
        @click="emit('openAdmin')"
      >
        ⚙️ 系统管理
      </button>
    </div>

    <!-- 我的 -->
    <div class="my-section">
      <div class="section-title">我的</div>
      <div class="my-requests-wrapper">
        <button
          class="btn-action btn-my"
          @click="handleToggleMyRequests"
        >
          📋 我的申请 / 邀请
        </button>
        <MyRequestsPanel
          v-if="showMyRequests"
          @close="showMyRequests = false"
        />
      </div>
      <button
        v-if="chatStore.currentRoomId && chatStore.currentRoomId !== 'PUBLIC'"
        class="btn-action btn-my"
        @click="handleLeaveCurrentRoom"
        :disabled="!chatStore.currentRoomId"
      >
        🚪 离开房间
      </button>
    </div>

    <!-- 房间列表 -->
    <RoomList
      @create-room="(name: string) => emit('createRoom', name)"
      @join-room="(id: string, msg?: string, force?: boolean) => emit('joinRoom', id, msg, force)"
      @leave-room="(id: string) => emit('leaveRoom', id)"
    />

    <!-- 退出 -->
    <div class="logout-area">
      <button class="btn-logout" @click="emit('logout')">
        退出登录
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  width: 280px;
  background: var(--side-bg);
  color: var(--side-text);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  box-shadow: inset -1px 0 0 var(--side-border-soft);
}

.sidebar-header {
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--side-border);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 14px;
}

.brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  font-size: 16px;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  box-shadow: 0 4px 14px var(--accent-glow);
  flex-shrink: 0;
}

.sidebar-header h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  flex: 1;
}

/* 主题切换按钮 */
.theme-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--side-border);
  background: var(--side-input-bg);
  color: var(--side-text-dim);
  font-size: 16px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s ease, color 0.2s ease, transform 0.25s var(--ease-bounce);
}

.theme-toggle-btn:hover {
  color: var(--side-text);
  background: var(--side-btn-bg-hover);
  transform: rotate(-18deg) scale(1.08);
}

.theme-toggle-glyph {
  display: inline-block;
  line-height: 1;
}

.theme-roll-enter-active,
.theme-roll-leave-active {
  transition: opacity 0.22s ease, transform 0.3s var(--ease-out-expo);
}
.theme-roll-enter-from { opacity: 0; transform: translateY(-0.7em); }
.theme-roll-leave-to { opacity: 0; transform: translateY(0.7em); }

.user-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.username {
  font-size: 13px;
  color: var(--side-text);
  word-break: break-all;
  max-width: 160px;
}

.global-role-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  margin-top: 2px;
  line-height: 1.5;
}

.role-owner {
  background: var(--role-owner-bg);
  color: var(--role-owner-text);
}

.role-public_admin {
  background: var(--role-admin-bg);
  color: var(--role-admin-text);
}

.role-member {
  background: var(--role-member-bg);
  color: var(--role-member-text);
}

.user-avatar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.avatar-wrapper {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  background: var(--side-input-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 1px var(--side-border);
  transition: box-shadow 0.25s ease, transform 0.25s var(--ease-bounce);
}

.avatar-wrapper:hover {
  transform: scale(1.05);
  box-shadow: 0 0 0 2px var(--side-accent);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 15px;
  font-weight: 700;
  color: var(--side-text);
  user-select: none;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(8, 6, 16, 0.62);
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.avatar-wrapper:hover .avatar-overlay {
  opacity: 1;
}

.user-text {
  flex: 1;
  min-width: 0;
}

.user-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 6px;
  border-radius: var(--radius-xs);
  line-height: 1;
  color: var(--side-text-dim);
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.btn-icon:hover {
  color: var(--side-text);
  background: var(--side-item-hover);
  transform: translateY(-1px);
}

.connection-status {
  padding: 8px 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--warning-text);
  background: var(--warning-bg);
  transition: color 0.3s ease, background 0.3s ease;
}

.connection-status.connected {
  color: var(--success-text);
  background: var(--success-bg);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 0 currentColor;
  animation: ld-dot-pulse 2.4s var(--ease-in-out) infinite;
}

.connection-status.connected .dot {
  animation: ld-dot-pulse-on 2.4s var(--ease-in-out) infinite;
}

@keyframes ld-dot-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes ld-dot-pulse-on {
  0% { box-shadow: 0 0 0 0 var(--success-border); }
  70% { box-shadow: 0 0 0 5px transparent; }
  100% { box-shadow: 0 0 0 0 transparent; }
}

/* 跨房间 @提及通知横幅 */
.mention-alert {
  margin: 4px 12px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--accent-soft);
  border: 1px solid var(--accent-soft-hover);
  color: var(--side-text);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  transition: background 0.18s ease, transform 0.15s ease;
}

.mention-alert:hover {
  background: var(--accent-soft-hover);
  transform: translateX(3px);
}

.mention-alert-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}

.mention-alert-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.mention-alert-title {
  font-weight: 600;
  font-size: 11px;
  color: var(--accent-text);
}

.mention-alert-sender {
  font-size: 11px;
  color: var(--side-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mention-alert-close {
  background: none;
  border: none;
  color: var(--side-text-dim);
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  padding: 2px 4px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
  transition: color 0.15s ease, transform 0.15s ease;
}

.mention-alert-close:hover {
  color: var(--side-text);
  transform: scale(1.2);
}

/* 通知出入动画 */
.alert-slide-enter-active {
  transition: opacity 0.28s var(--ease-out-expo), transform 0.3s var(--ease-out-expo);
}
.alert-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.22s var(--ease-in-out);
}
.alert-slide-enter-from {
  opacity: 0;
  transform: translateX(-16px);
}
.alert-slide-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.my-section {
  padding: 12px 20px;
  border-top: 1px solid var(--side-border);
  border-bottom: 1px solid var(--side-border);
}

.my-requests-wrapper {
  position: relative;
}

.my-section .section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--side-text-faint);
  margin-bottom: 8px;
}

.btn-my {
  margin-bottom: 6px;
  background: transparent;
  border: 1px solid var(--side-border);
  font-size: 12px;
  padding: 7px 10px;
}

.btn-my:hover:not(:disabled) {
  background: var(--side-item-hover);
  border-color: var(--side-border);
}

.btn-my:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 通知徽标 */
.badge {
  display: inline-block;
  background: var(--danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: var(--radius-pill);
  padding: 0 5px;
  margin-left: 4px;
}

.sidebar-actions {
  padding: 12px 20px;
}

.btn-action {
  width: 100%;
  padding: 9px 12px;
  background: var(--side-btn-bg);
  color: var(--side-text);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.btn-action:hover {
  background: var(--side-btn-bg-hover);
  transform: translateY(-1px);
}

.btn-action:active {
  transform: translateY(0);
}

.btn-admin {
  margin-top: 6px;
  background: transparent;
  border: 1px solid var(--side-accent);
  color: var(--side-accent);
  font-size: 13px;
}

.btn-admin:hover {
  background: var(--side-btn-bg-hover);
}

.logout-area {
  padding: 12px 20px;
  border-top: 1px solid var(--side-border);
}

.btn-logout {
  width: 100%;
  background: transparent;
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
  border-radius: var(--radius-sm);
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.15s ease;
}

.btn-logout:hover {
  background: var(--danger);
  color: #fff;
  transform: translateY(-1px);
}
</style>
