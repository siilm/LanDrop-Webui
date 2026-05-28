<script setup lang="ts">
import { ref, computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'

const emit = defineEmits<{
  createRoom: [name: string]
  joinRoom: [roomId: string, message?: string, forceJoin?: boolean]
  leaveRoom: [roomId: string]
}>()

const chatStore = useChatStore()
const authStore = useAuthStore()

const newRoomName = ref('')
const joinRoomId = ref('')
const joinMessage = ref('')
const forceJoin = ref(false)
const showCreatePanel = ref(false)
const showJoinPanel = ref(false)

/** Owner 或 PublicAdmin 可强制加入 */
const isPrivileged = computed(() =>
  authStore.globalRole === 'owner' || authStore.globalRole === 'public_admin'
)

function handleCreateRoom() {
  const name = newRoomName.value.trim()
  if (!name) return
  emit('createRoom', name)
  newRoomName.value = ''
  showCreatePanel.value = false
}

function handleJoinRoom() {
  const id = joinRoomId.value.trim()
  if (!id) return
  emit('joinRoom', id, joinMessage.value.trim() || undefined, forceJoin.value)
  joinRoomId.value = ''
  joinMessage.value = ''
  forceJoin.value = false
  showJoinPanel.value = false
}

function selectRoom(roomId: string, roomName: string) {
  chatStore.switchRoom(roomId, roomName)
}
</script>

<template>
  <div class="room-list-wrapper">
    <!-- 房间列表（可滚动） -->
    <div class="room-list-scroll">
      <div class="section-title">房间</div>

      <template v-if="chatStore.rooms.length > 0">
        <div
          v-for="room in chatStore.rooms"
          :key="room.roomId"
          class="room-item"
          :class="{ active: room.roomId === chatStore.currentRoomId }"
        >
          <div class="room-item-main" @click="selectRoom(room.roomId, room.roomName)">
            <div class="room-name">
              {{ room.roomName }}
              <span v-if="room.hasPassword" class="lock-icon">🔒</span>
            </div>
            <div class="room-meta">
              {{ room.memberCount != null ? `${room.memberCount} 人` : '' }}
              <span v-if="room.roomId !== chatStore.currentRoomId"> · 点击进入</span>
            </div>
          </div>
        </div>
      </template>
      <div v-else class="empty-hint">暂无房间</div>
    </div>

    <!-- 操作面板（固定底部，不随列表滚动） -->
    <div class="room-actions">
      <!-- 创建房间 -->
      <div class="panel">
        <button
          v-if="!showCreatePanel"
          class="btn-action"
          @click="showCreatePanel = true"
        >
          ➕ 创建房间
        </button>
        <div v-else class="create-panel">
          <input
            v-model="newRoomName"
            type="text"
            class="panel-input"
            placeholder="房间名称"
            @keyup.enter="handleCreateRoom"
          />
          <div class="panel-actions">
            <button class="btn-sm" @click="handleCreateRoom">创建</button>
            <button class="btn-sm btn-cancel" @click="showCreatePanel = false">取消</button>
          </div>
        </div>
      </div>

      <!-- 加入房间 -->
      <div class="panel join-panel">
        <button
          v-if="!showJoinPanel"
          class="btn-action btn-refresh"
          @click="showJoinPanel = true"
        >
          🔗 加入房间
        </button>
        <div v-else class="create-panel">
          <input
            v-model="joinRoomId"
            type="text"
            class="panel-input"
            placeholder="房间 ID"
            @keyup.enter="handleJoinRoom"
          />
          <textarea
            v-model="joinMessage"
            class="panel-textarea"
            placeholder="申请附言（可选）"
            rows="2"
          ></textarea>
          <label v-if="isPrivileged" class="force-join-label">
            <input
              v-model="forceJoin"
              type="checkbox"
              class="force-join-checkbox"
            />
            <span>⚡ 强制加入（跳过审批）</span>
          </label>
          <div class="panel-actions">
            <button class="btn-sm" @click="handleJoinRoom">
              {{ forceJoin ? '⚡ 强制加入' : '加入' }}
            </button>
            <button class="btn-sm btn-cancel" @click="showJoinPanel = false">取消</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.room-list-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.room-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0 0;
}

.room-actions {
  flex-shrink: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 8px;
}

.section-title {
  padding: 0 20px;
  font-size: 12px;
  text-transform: uppercase;
  opacity: 0.5;
  margin-bottom: 8px;
}

.room-item {
  transition: background 0.15s;
}

.room-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.room-item.active {
  background: rgba(15, 52, 96, 0.6);
  border-left: 3px solid #3498db;
}

.room-item-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  padding: 10px 20px;
  padding-right: 4px;
}

.room-name {
  font-size: 14px;
  font-weight: 500;
}

.lock-icon {
  margin-left: 4px;
}

.room-meta {
  font-size: 11px;
  opacity: 0.5;
  margin-top: 2px;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  opacity: 0.4;
  font-size: 13px;
}

.panel {
  padding: 0 20px 10px;
}

.join-panel {
  padding-top: 0;
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

.btn-refresh {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 13px;
}

.btn-refresh:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.4);
}

.panel-input {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  box-sizing: border-box;
}

.panel-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.panel-actions {
  display: flex;
  gap: 6px;
}

.btn-sm {
  padding: 6px 12px;
  background: #27ae60;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-cancel {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #999;
}

.btn-cancel:hover {
  border-color: rgba(255, 255, 255, 0.6);
  color: #fff;
}

.panel-textarea {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  margin-bottom: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  box-sizing: border-box;
  resize: none;
  font-family: inherit;
}

.panel-textarea::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.force-join-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #f39c12;
  margin-bottom: 6px;
  cursor: pointer;
  user-select: none;
}

.force-join-checkbox {
  accent-color: #f39c12;
  cursor: pointer;
}
</style>
