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
  border-top: 1px solid var(--side-border);
  padding-top: 8px;
}

.section-title {
  padding: 0 20px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--side-text-faint);
  margin-bottom: 8px;
}

.room-item {
  position: relative;
  margin: 1px 8px;
  border-radius: var(--radius-sm);
  transition: background 0.18s ease;
}

.room-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 0;
  border-radius: var(--radius-pill);
  background: var(--side-accent);
  transition: height 0.28s var(--ease-out-expo);
}

.room-item:hover {
  background: var(--side-item-hover);
}

.room-item.active {
  background: var(--side-item-active);
}

.room-item.active::before {
  height: 60%;
}

.room-item-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
  padding: 10px 16px 10px 18px;
}

.room-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--side-text);
}

.lock-icon {
  margin-left: 4px;
}

.room-meta {
  font-size: 11px;
  color: var(--side-text-faint);
  margin-top: 2px;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--side-text-faint);
  font-size: 13px;
}

.panel {
  padding: 0 20px 10px;
}

.join-panel {
  padding-top: 0;
}

.create-panel {
  animation: ld-slide-down 0.28s var(--ease-out-expo) both;
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
  transition: background 0.2s ease, transform 0.15s ease;
}

.btn-action:hover {
  background: var(--side-btn-bg-hover);
  transform: translateY(-1px);
}

.btn-action:active {
  transform: translateY(0);
}

.btn-refresh {
  background: transparent;
  border: 1px solid var(--side-border);
  font-size: 13px;
}

.btn-refresh:hover {
  background: var(--side-item-hover);
}

.panel-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--side-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  margin-bottom: 6px;
  background: var(--side-input-bg);
  color: var(--side-text);
  box-sizing: border-box;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.panel-input:focus {
  border-color: var(--side-accent);
  background: var(--side-input-bg-focus);
}

.panel-input::placeholder {
  color: var(--side-text-faint);
}

.panel-actions {
  display: flex;
  gap: 6px;
}

.btn-sm {
  padding: 7px 14px;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.btn-sm:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--accent-glow);
}

.btn-cancel {
  background: transparent;
  border: 1px solid var(--side-border);
  color: var(--side-text-dim);
}

.btn-cancel:hover {
  border-color: var(--side-text-dim);
  color: var(--side-text);
  box-shadow: none;
  transform: none;
}

.panel-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--side-border);
  border-radius: var(--radius-sm);
  font-size: 12px;
  margin-bottom: 6px;
  background: var(--side-input-bg);
  color: var(--side-text);
  box-sizing: border-box;
  resize: none;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.panel-textarea:focus {
  border-color: var(--side-accent);
  background: var(--side-input-bg-focus);
}

.panel-textarea::placeholder {
  color: var(--side-text-faint);
}

.force-join-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--warning-text);
  margin-bottom: 6px;
  cursor: pointer;
  user-select: none;
}

.force-join-checkbox {
  accent-color: var(--warning);
  cursor: pointer;
}
</style>
