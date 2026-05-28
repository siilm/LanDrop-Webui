<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'

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
      <button class="btn-header-icon" title="房间文件" @click="emit('toggleFiles')">
        📁
      </button>
      <!-- 管理（仅管理员/房间管理员/全局管理员） -->
      <button
        v-if="canManage"
        class="btn-header-icon"
        title="管理"
        @click="emit('toggleManage')"
      >
        ⚙️
      </button>
      <!-- 邀请 -->
      <button class="btn-header-icon" title="邀请用户" @click="emit('toggleInvite')">
        ✉️
      </button>
      <!-- 公告（仅管理员/房间管理员/全局管理员） -->
      <button
        v-if="canManage"
        class="btn-header-icon"
        title="发布公告"
        @click="emit('toggleAnnounce')"
      >
        📢
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e8e8e8;
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-header h3 {
  margin: 0;
  font-size: 16px;
}

.room-id {
  font-size: 12px;
  color: #999;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.btn-header-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: 6px;
  line-height: 1;
  transition: background 0.15s;
}

.btn-header-icon:hover {
  background: #f0f2f5;
}

</style>
