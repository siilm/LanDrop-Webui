<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import SvgIcon from '@/components/SvgIcon.vue'

const emit = defineEmits<{
  toggleFiles: []
  toggleManage: []
  toggleInvite: []
  toggleAnnounce: []
}>()

const chatStore = useChatStore()
const authStore = useAuthStore()

const myRole = computed(() => {
  const member = chatStore.roomMembers.get(authStore.userId)
  return member ? parseInt(member.role) : 0
})

/** 是否是房间管理员/创建者（role >= 1） */
const isAdminOrCreator = computed(() => myRole.value >= 1)

/** 是否是全局管理员（public_admin 或 owner） */
const isPublicAdmin = computed(() => {
  return authStore.globalRole === 'public_admin' || authStore.globalRole === 'owner'
})

/** 是否可管理：房间管理员/创建者 或 全局管理员 */
const canManage = computed(() => isAdminOrCreator.value || isPublicAdmin.value)
</script>

<template>
  <div class="chat-header">
    <h3>{{ chatStore.currentRoomName || '选择房间' }}</h3>
    <span v-if="chatStore.currentRoomId" class="room-id">
      {{ chatStore.currentRoomId }}
    </span>

    <div v-if="chatStore.currentRoomId" class="header-actions">
      <!-- 文件 -->
      <button class="btn-header-icon" @click="emit('toggleFiles')">
        <SvgIcon name="common_files" :size="20" />
        <span class="btn-header-label">文件</span>
      </button>
      <!-- 管理（仅管理员/房间管理员/全局管理员） -->
      <button
        v-if="canManage"
        class="btn-header-icon"
        @click="emit('toggleManage')"
      >
        <SvgIcon name="settings" :size="20" />
        <span class="btn-header-label">管理</span>
      </button>
      <!-- 邀请 -->
      <button class="btn-header-icon" @click="emit('toggleInvite')">
        <SvgIcon name="group_add" :size="20" />
        <span class="btn-header-label">邀请</span>
      </button>
      <!-- 公告（仅管理员/房间管理员/全局管理员） -->
      <button
        v-if="canManage"
        class="btn-header-icon"
        @click="emit('toggleAnnounce')"
      >
        <SvgIcon name="announce" :size="20" />
        <span class="btn-header-label">公告</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-header {
  padding: 15px 24px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--surface);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  position: relative;
  z-index: 2;
  transition: background 0.5s var(--ease-in-out), border-color 0.5s var(--ease-in-out);
}

.chat-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}

.room-id {
  font-size: 12px;
  color: var(--text-muted);
  font-family: var(--font-mono);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  background: var(--surface-2);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
}

.btn-header-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 44px;
  height: 52px;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  line-height: 1;
  transition: background 0.18s ease, transform 0.2s var(--ease-bounce);
}

.btn-header-icon:hover {
  background: var(--accent-soft);
  transform: translateY(-2px);
}

.btn-header-icon:active {
  transform: translateY(0) scale(0.94);
}

.btn-header-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  line-height: 1.2;
}
</style>
