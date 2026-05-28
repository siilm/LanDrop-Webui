<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { fetchInvitesToMe, fetchMyJoinRequests } from '@/composables/useApi'
import { useWebSocket } from '@/composables/useWebSocket'
import type { InviteRecord, JoinRequestRecord } from '@/types/chat'

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const myInvites = ref<(InviteRecord & { room_name?: string })[]>([])
const myJoinRequests = ref<(JoinRequestRecord & { room_name?: string })[]>([])
const actionMsg = ref('')

const ws = useWebSocket()

async function loadData() {
  loading.value = true
  actionMsg.value = ''
  try {
    const [invites, requests] = await Promise.all([
      fetchInvitesToMe(),
      fetchMyJoinRequests(),
    ])
    myInvites.value = Array.isArray(invites) ? invites : []
    myJoinRequests.value = Array.isArray(requests) ? requests : []
  } catch (e) {
    console.warn('[MyRequestsPanel] 加载失败:', e)
  } finally {
    loading.value = false
  }
}

async function handleAcceptInvite(inviteId: string, roomId: string) {
  try {
    ws.inviteReply(roomId, inviteId, true)
    actionMsg.value = '✅ 已接受邀请'
    // 从本地列表移除
    myInvites.value = myInvites.value.filter((i) => i.id !== inviteId)
  } catch {
    actionMsg.value = '操作失败'
  }
}

async function handleRejectInvite(inviteId: string, roomId: string) {
  try {
    ws.inviteReply(roomId, inviteId, false)
    actionMsg.value = '✅ 已拒绝邀请'
    myInvites.value = myInvites.value.filter((i) => i.id !== inviteId)
  } catch {
    actionMsg.value = '操作失败'
  }
}

function getStatusLabel(status?: string): string {
  if (!status || status === 'pending') return '⏳ 等待处理'
  if (status === 'approved') return '✅ 已批准'
  if (status === 'rejected') return '❌ 已拒绝'
  return status || '未知'
}

function getStatusClass(status?: string): string {
  if (!status || status === 'pending') return 'status-pending'
  if (status === 'approved') return 'status-approved'
  if (status === 'rejected') return 'status-rejected'
  return ''
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.my-requests-panel') && !target.closest('.btn-my')) {
    emit('close')
  }
}

onMounted(() => {
  loadData()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="my-requests-panel">
    <div class="panel-header">
      <span>我的申请 / 邀请</span>
      <button class="btn-close-sm" @click="emit('close')">✕</button>
    </div>

    <div v-if="loading" class="panel-loading">加载中...</div>

    <div v-else>
      <!-- 操作反馈 -->
      <div v-if="actionMsg" class="action-msg">{{ actionMsg }}</div>

      <!-- 我收到的邀请 -->
      <div class="section">
        <div class="section-title">📩 我收到的邀请</div>
        <div v-if="myInvites.length === 0" class="empty-hint">暂无邀请</div>
        <div
          v-for="inv in myInvites"
          :key="inv.id"
          class="item-row"
        >
          <div class="item-info">
            <span class="item-room">{{ inv.room_name || inv.room_id }}</span>
            <span class="item-from">来自 {{ inv.inviter_id || '未知' }}</span>
          </div>
          <div class="item-right">
            <span :class="['status-badge', getStatusClass(inv.status)]">
              {{ getStatusLabel(inv.status) }}
            </span>
            <!-- 待处理的邀请显示接受/拒绝按钮 -->
            <div v-if="!inv.status || inv.status === 'pending'" class="item-actions">
              <button
                class="btn-xs-accept"
                @click="handleAcceptInvite(inv.id, inv.room_id)"
                title="接受"
              >✓</button>
              <button
                class="btn-xs-reject"
                @click="handleRejectInvite(inv.id, inv.room_id)"
                title="拒绝"
              >✗</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 我发出的加入申请 -->
      <div class="section">
        <div class="section-title">📋 我发出的加入申请</div>
        <div v-if="myJoinRequests.length === 0" class="empty-hint">暂无申请</div>
        <div
          v-for="req in myJoinRequests"
          :key="req.id"
          class="item-row"
        >
          <div class="item-info">
            <span class="item-room">{{ req.room_name || req.room_id }}</span>
            <span v-if="req.message" class="item-msg">{{ req.message }}</span>
          </div>
          <div class="item-right">
            <span :class="['status-badge', getStatusClass(req.status)]">
              {{ getStatusLabel(req.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.my-requests-panel {
  background: #1e1e3a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 10px;
  min-width: 260px;
  max-height: 360px;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
  position: absolute;
  left: 20px;
  right: 20px;
  z-index: 100;
  margin-top: 4px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.btn-close-sm {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
}

.btn-close-sm:hover {
  color: #fff;
}

.panel-loading {
  text-align: center;
  opacity: 0.5;
  padding: 16px 0;
  font-size: 12px;
}

.action-msg {
  font-size: 11px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  margin-bottom: 8px;
  text-align: center;
}

.section {
  margin-bottom: 10px;
}

.section-title {
  font-size: 11px;
  opacity: 0.6;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.empty-hint {
  font-size: 11px;
  opacity: 0.35;
  padding: 6px 0;
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 4px;
  font-size: 11px;
}

.item-row:hover {
  background: rgba(255, 255, 255, 0.08);
}

.item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  margin-right: 6px;
}

.item-room {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-from,
.item-msg {
  font-size: 10px;
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.status-badge {
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 3px;
  white-space: nowrap;
}

.status-pending {
  background: rgba(255, 193, 7, 0.15);
  color: #ffc107;
}

.status-approved {
  background: rgba(39, 174, 96, 0.15);
  color: #27ae60;
}

.status-rejected {
  background: rgba(192, 57, 43, 0.15);
  color: #e74c3c;
}

.item-actions {
  display: flex;
  gap: 3px;
}

.btn-xs-accept,
.btn-xs-reject {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.btn-xs-accept {
  background: #27ae60;
  color: #fff;
}

.btn-xs-accept:hover {
  background: #2ecc71;
}

.btn-xs-reject {
  background: #c0392b;
  color: #fff;
}

.btn-xs-reject:hover {
  background: #e74c3c;
}
</style>
