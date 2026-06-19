<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { fetchRoomMembers } from '@/composables/useApi'
import { avatarBlobCache, fileBlobCache } from '@/utils/BlobCache'
import { getBaseUrl } from '@/composables/useApi'
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
  openRename: []
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()

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
      <h2>LanDrop</h2>
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
            <button class="btn-icon" title="修改用户名" @click="emit('openRename')">
              ✏️
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
  background: #1a1a2e;
  color: #fff;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.sidebar-header h2 {
  margin: 0 0 12px;
  font-size: 20px;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.username {
  font-size: 13px;
  opacity: 0.8;
  word-break: break-all;
  max-width: 160px;
}

.global-role-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 8px;
  margin-top: 2px;
  line-height: 1.4;
}

.role-owner {
  background: #e67e22;
  color: #fff;
}

.role-public_admin {
  background: #3498db;
  color: #fff;
}

.role-member {
  background: #95a5a6;
  color: #fff;
}

.user-avatar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.avatar-wrapper {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;
}

.avatar-wrapper:hover {
  opacity: 0.85;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  user-select: none;
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
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
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
  color: #fff;
  opacity: 0.7;
}

.btn-icon:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.15);
}

.connection-status {
  padding: 8px 20px;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e67e22;
  background: rgba(230, 126, 34, 0.1);
}

.connection-status.connected {
  color: #27ae60;
  background: rgba(39, 174, 96, 0.1);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.my-section {
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.my-requests-wrapper {
  position: relative;
}

.my-section .section-title {
  font-size: 12px;
  text-transform: uppercase;
  opacity: 0.5;
  margin-bottom: 8px;
}

.btn-my {
  margin-bottom: 6px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 12px;
  padding: 6px 8px;
}

.btn-my:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.btn-my:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 通知徽标 */
.badge {
  display: inline-block;
  background: #e74c3c;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  padding: 0 5px;
  margin-left: 4px;
}

.sidebar-actions {
  padding: 12px 20px;
}

.btn-action {
  width: 100%;
  padding: 8px;
  background: #0f3460;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
}

.btn-action:hover {
  background: #1a5276;
}

.btn-admin {
  margin-top: 6px;
  background: #1a5276;
  border: 1px solid #3498db;
  font-size: 13px;
}

.btn-admin:hover {
  background: #2c6f9c;
}

.logout-area {
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-logout {
  width: 100%;
  background: transparent;
  color: #e74c3c;
  border: 1px solid #e74c3c;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 13px;
  cursor: pointer;
}

.btn-logout:hover {
  background: #e74c3c;
  color: #fff;
}
</style>
