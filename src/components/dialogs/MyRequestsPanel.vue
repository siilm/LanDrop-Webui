<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { fetchInvitesToMe, fetchMyJoinRequests } from '@/composables/useApi'
import { useWebSocket, onWsEvent } from '@/composables/useWebSocket'
import type { InviteRecord, JoinRequestRecord } from '@/types/chat'
import SvgIcon from '@/components/SvgIcon.vue'

const emit = defineEmits<{
  close: []
}>()

const loading = ref(false)
const myInvites = ref<(InviteRecord & { room_name?: string })[]>([])
const myJoinRequests = ref<(JoinRequestRecord & { room_name?: string })[]>([])
const actionMsg = ref('')

// 用户点击了接受但邀请尚未审批通过的集合（invite_id → true）
const pendingAcceptSet = reactive<Set<string>>(new Set())

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
  } catch (e: any) {
    const msg = e?.message || e?.error || '未知错误'
    console.warn('[MyRequestsPanel] 加载失败:', e)
    alert('加载邀请/申请列表失败: ' + msg)
  } finally {
    loading.value = false
  }
}

async function handleAcceptInvite(inviteId: string, roomId: string) {
  const sent = ws.inviteReply(roomId, inviteId, true)
  if (!sent) {
    alert('❌ 未连接到服务器，请检查网络后重试')
    return
  }
  // 乐观标记为等待处理：若邀请已审批则直接加入房间，若未审批服务端会返回 event_reject
  pendingAcceptSet.add(inviteId)
  actionMsg.value = '⏳ 已发送接受请求，等待服务端处理...'
}

async function handleRejectInvite(inviteId: string, roomId: string) {
  const sent = ws.inviteReply(roomId, inviteId, false)
  if (!sent) {
    alert('❌ 未连接到服务器，请检查网络后重试')
    return
  }
  actionMsg.value = '✅ 已拒绝邀请'
  myInvites.value = myInvites.value.filter((i) => i.id !== inviteId)
}

// 判断邀请状态
function isApproved(status?: string): boolean {
  return status === 'approved' || status === '1'
}
function isRejected(status?: string): boolean {
  return status === 'rejected' || status === '2'
}

function getStatusLabel(status?: string): string {
  if (!status || status === 'pending' || status === '0') return '⏳ 等待审批'
  if (isApproved(status)) return '✅ 已批准'
  if (isRejected(status)) return '❌ 已拒绝'
  return status || '未知'
}

function getStatusClass(status?: string): string {
  if (!status || status === 'pending' || status === '0') return 'status-pending'
  if (isApproved(status)) return 'status-approved'
  if (isRejected(status)) return 'status-rejected'
  return ''
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.my-requests-panel') && !target.closest('.btn-my')) {
    emit('close')
  }
}

// ---- WebSocket 事件监听 ----

// 监听服务端拒绝事件（如邀请未审批时用户尝试接受）
const unsubReject = onWsEvent('event_reject', (data: any) => {
  if (data.event_type === 'room_invite_reply') {
    if (data.reason === 'invite_not_approved_yet') {
      actionMsg.value = '⏳ 该邀请尚未通过管理员审批，请等待'
      // 邀请保持在列表中，显示"等待审批"状态
    } else {
      alert(`❌ 邀请操作失败: ${data.reason || '未知原因'}`)
    }
  }
})

// 监听房间加入事件：成功接受邀请后会收到 room_joined
const unsubJoined = onWsEvent('room_joined', (data: any) => {
  if (data.room_id) {
    // 清除对应房间的待处理邀请
    myInvites.value = myInvites.value.filter((i) => {
      if (i.room_id === data.room_id) {
        pendingAcceptSet.delete(i.id)
        return false
      }
      return true
    })
    actionMsg.value = '✅ 已加入房间'
  }
})

onMounted(() => {
  loadData()
  document.addEventListener('click', handleClickOutside)
})

// 管理员拒绝了邀请 → 从列表移除
const unsubInviteRejected = onWsEvent('invite_rejected', (data: any) => {
  myInvites.value = myInvites.value.filter((i) => i.room_id !== data.room_id)
  actionMsg.value = `❌ 房间 ${data.room_id} 的邀请已被管理员拒绝`
})

// 加入申请被拒绝 → 从列表移除
const unsubJoinRejected = onWsEvent('join_rejected', (data: any) => {
  myJoinRequests.value = myJoinRequests.value.filter((r) => r.room_id !== data.room_id)
  actionMsg.value = `❌ 房间 ${data.room_id} 的加入申请已被管理员拒绝`
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
  unsubReject()
  unsubJoined()
  unsubInviteRejected()
  unsubJoinRejected()
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
        <div class="section-title"><SvgIcon name="group_add" :size="12" /> 我收到的邀请</div>
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
            <span v-if="pendingAcceptSet.has(inv.id)" class="status-badge status-pending">
              ⏳ 等待审批
            </span>
            <span v-else :class="['status-badge', getStatusClass(inv.status)]">
              {{ getStatusLabel(inv.status) }}
            </span>
            <!-- 所有非已拒绝的邀请都可操作：接受 / 拒绝 -->
            <div v-if="!isRejected(inv.status)" class="item-actions">
              <button
                v-if="!pendingAcceptSet.has(inv.id)"
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
        <div class="section-title"><SvgIcon name="search" :size="12" /> 我发出的加入申请</div>
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
  background: var(--side-bg);
  color: var(--side-text);
  border: 1px solid var(--side-border);
  border-radius: var(--radius-md);
  padding: 12px;
  min-width: 260px;
  max-height: 360px;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  position: absolute;
  left: 16px;
  right: 16px;
  z-index: 100;
  margin-top: 6px;
  transform-origin: top center;
  animation: ld-pop-in 0.28s var(--ease-out-expo) both;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
}

.btn-close-sm {
  background: none;
  border: none;
  color: var(--side-text-dim);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
  font-size: 14px;
  transition: color 0.18s ease, transform 0.18s ease;
}

.btn-close-sm:hover {
  color: var(--side-text);
  transform: rotate(90deg);
}

.panel-loading {
  text-align: center;
  color: var(--side-text-faint);
  padding: 16px 0;
  font-size: 12px;
}

.action-msg {
  font-size: 11px;
  padding: 6px 8px;
  background: var(--side-item-hover);
  border-radius: var(--radius-xs);
  margin-bottom: 8px;
  text-align: center;
}

.section {
  margin-bottom: 12px;
}

.section-title {
  font-size: 11px;
  color: var(--side-text-faint);
  margin-bottom: 6px;
  padding-bottom: 5px;
  border-bottom: 1px solid var(--side-border-soft);
}

.empty-hint {
  font-size: 11px;
  color: var(--side-text-faint);
  opacity: 0.7;
  padding: 6px 0;
}

.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 9px;
  border-radius: var(--radius-sm);
  background: var(--side-item-hover);
  margin-bottom: 4px;
  font-size: 11px;
  transition: background 0.18s ease;
}

.item-row:hover {
  background: var(--side-btn-bg);
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
  color: var(--side-text-faint);
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
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.status-pending {
  background: var(--warning-bg);
  color: var(--warning-text);
}

.status-approved {
  background: var(--success-bg);
  color: var(--success-text);
}

.status-rejected {
  background: var(--danger-bg);
  color: var(--danger-text);
}

.item-actions {
  display: flex;
  gap: 3px;
}

.btn-xs-accept,
.btn-xs-reject {
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, transform 0.15s ease;
}

.btn-xs-accept {
  background: var(--success);
  color: #fff;
}

.btn-xs-accept:hover {
  transform: scale(1.12);
}

.btn-xs-reject {
  background: var(--danger);
  color: #fff;
}

.btn-xs-reject:hover {
  transform: scale(1.12);
}
</style>
