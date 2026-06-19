<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useAuthStore } from '@/stores/auth'
import {
  fetchRoomMembers,
  kickMember,
  muteMember,
  unmuteMember,
  promoteMember,
  demoteMember,
  fetchJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  setMemberDisplayName,
  fetchPendingInvites,
  approveInvite,
  rejectInvite,
} from '@/composables/useApi'
import type { RoomMember, InviteRecord } from '@/types/chat'
import { RoleValue } from '@/types/chat'
import { onWsEvent, useWebSocket } from '@/composables/useWebSocket'

const emit = defineEmits<{
  dissolve: []
  close: []
}>()

const props = defineProps<{
  visible: boolean
}>()

const chatStore = useChatStore()
const authStore = useAuthStore()

const members = ref<RoomMember[]>([])
const loading = ref(false)
const loadingRequests = ref(false)
const actionMsg = ref('')

// ---- 待审批邀请 ----
const pendingInvites = ref<InviteRecord[]>([])
const loadingInvites = ref(false)
const ws = useWebSocket()

const myRole = computed(() => {
  const m = members.value.find((m) => m.user_id === authStore.userId)
  return m ? parseInt(m.role) : 0
})

const isCreator = computed(() => myRole.value >= RoleValue.Creator)
const isAdminOrCreator = computed(() => myRole.value >= RoleValue.Admin)

function getRoleLabel(role: string, muted?: boolean): string {
  if (muted) return '禁言'
  const r = parseInt(role)
  if (r >= RoleValue.Creator) return '创建者'
  if (r >= RoleValue.Admin) return '管理员'
  return '成员'
}

function getRoleClass(role: string, muted?: boolean): string {
  if (muted) return 'badge-muted'
  const r = parseInt(role)
  if (r >= RoleValue.Creator) return 'badge-creator'
  if (r >= RoleValue.Admin) return 'badge-admin'
  return 'badge-member'
}

async function loadMembers() {
  if (!chatStore.currentRoomId) return
  loading.value = true
  try {
    const result = await fetchRoomMembers(chatStore.currentRoomId)
    members.value = result || []
    // 同步到 chatStore，确保 MessageInput 等组件能检测到禁言状态变化
    chatStore.setRoomMembers(result || [])
  } catch {
    members.value = []
  } finally {
    loading.value = false
  }
}

async function loadJoinRequests() {
  if (!chatStore.currentRoomId) return
  loadingRequests.value = true
  try {
    const list = await fetchJoinRequests(chatStore.currentRoomId)
    chatStore.setJoinRequests(Array.isArray(list) ? list : [])
  } catch {
    // join-requests API 可能不被低版本服务端支持，静默失败
  } finally {
    loadingRequests.value = false
  }
}

async function handleApproveJoin(requestId: string) {
  if (!chatStore.currentRoomId) return
  actionMsg.value = ''
  try {
    await approveJoinRequest(chatStore.currentRoomId, requestId)
    actionMsg.value = '已通过加入申请'
    chatStore.removeJoinRequest(requestId)
    loadMembers()
  } catch {
    actionMsg.value = '操作失败（可能已被处理）'
    loadJoinRequests()
  }
}

async function handleRejectJoin(requestId: string) {
  if (!chatStore.currentRoomId) return
  actionMsg.value = ''
  try {
    await rejectJoinRequest(chatStore.currentRoomId, requestId)
    actionMsg.value = '已拒绝加入申请'
    chatStore.removeJoinRequest(requestId)
    loadMembers()
  } catch {
    actionMsg.value = '操作失败（可能已被处理）'
    loadJoinRequests()
  }
}

// 管理操作（双通道：HTTP → WS fallback）
async function handleKick(userId: string) {
  actionMsg.value = ''
  // PUBLIC 房间踢出 = 注销账号（不可恢复），需要二次确认
  const targetMember = members.value.find(m => m.user_id === userId)
  const targetName = targetMember?.username || targetMember?.display_name || userId
  if (chatStore.currentRoomId === 'PUBLIC') {
    if (!confirm(`⚠️ 在 PUBLIC 房间踢出用户「${targetName}」将导致其账号被注销（不可恢复）！\n\n确定继续？`)) {
      return
    }
  }
  try {
    await kickMember(chatStore.currentRoomId, userId)
    actionMsg.value = '已踢出'
    loadMembers()
  } catch {
    ws.kickMember(chatStore.currentRoomId, userId)
    actionMsg.value = '已发送踢出请求'
    setTimeout(() => loadMembers(), 1000)
  }
}

async function handleMute(userId: string, muted: boolean) {
  actionMsg.value = ''
  try {
    if (muted) {
      await muteMember(chatStore.currentRoomId, userId)
    } else {
      await unmuteMember(chatStore.currentRoomId, userId)
    }
    actionMsg.value = muted ? '已禁言' : '已解除禁言'
    // API 不返回 muted 字段，直接更新本地和 store 中的状态
    const target = members.value.find(m => m.user_id === userId)
    if (target) {
      target.muted = muted
    }
    chatStore.updateRoomMember(userId, { muted })
    // 不调用 loadMembers() — API 返回的数据不含 muted 字段，会覆盖我们刚设置的值
  } catch {
    if (muted) {
      ws.muteMember(chatStore.currentRoomId, userId)
    } else {
      ws.unmuteMember(chatStore.currentRoomId, userId)
    }
    actionMsg.value = '已发送操作请求'
    // 乐观更新：直接设置 muted 状态
    const target = members.value.find(m => m.user_id === userId)
    if (target) {
      target.muted = muted
    }
    chatStore.updateRoomMember(userId, { muted })
    // WS fallback 不调用 loadMembers，等待 room_member_muted 事件
  }
}

async function handlePromote(userId: string) {
  actionMsg.value = ''
  try {
    await promoteMember(chatStore.currentRoomId, userId)
    actionMsg.value = '已晋升为管理员'
    loadMembers()
  } catch {
    ws.promoteMember(chatStore.currentRoomId, userId)
    actionMsg.value = '已发送晋升请求'
    setTimeout(() => loadMembers(), 1000)
  }
}

async function handleDemote(userId: string) {
  actionMsg.value = ''
  try {
    await demoteMember(chatStore.currentRoomId, userId)
    actionMsg.value = '已降级为成员'
    loadMembers()
  } catch {
    ws.demoteMember(chatStore.currentRoomId, userId)
    actionMsg.value = '已发送降级请求'
    setTimeout(() => loadMembers(), 1000)
  }
}

// ----- 头衔（display_name）设置 — 仅创建者 -----
const editingDisplayNameFor = ref<string | null>(null)
const displayNameInput = ref('')

function handleStartEditDisplayName(member: RoomMember) {
  editingDisplayNameFor.value = member.user_id
  displayNameInput.value = member.display_name || ''
}

function handleCancelEditDisplayName() {
  editingDisplayNameFor.value = null
  displayNameInput.value = ''
}

async function handleSaveDisplayName(userId: string) {
  if (!chatStore.currentRoomId) return
  const name = displayNameInput.value.trim()
  if (!name) {
    actionMsg.value = '头衔不能为空'
    return
  }
  actionMsg.value = ''
  try {
    await setMemberDisplayName(chatStore.currentRoomId, userId, name)
    actionMsg.value = '✅ 已更新头衔'
    // 更新本地列表
    const target = members.value.find(m => m.user_id === userId)
    if (target) {
      target.display_name = name
    }
    chatStore.updateRoomMember(userId, { display_name: name })
    editingDisplayNameFor.value = null
    displayNameInput.value = ''
  } catch {
    actionMsg.value = '设置头衔失败'
  }
}

// ---- 待审批邀请操作 ----
async function loadPendingInvites() {
  if (!chatStore.currentRoomId) return
  loadingInvites.value = true
  try {
    const list = await fetchPendingInvites(chatStore.currentRoomId)
    pendingInvites.value = Array.isArray(list) ? list : []
  } catch {
    pendingInvites.value = []
  } finally {
    loadingInvites.value = false
  }
}

async function handleApproveInvite(inviteId: string) {
  if (!chatStore.currentRoomId) return
  actionMsg.value = ''
  try {
    await approveInvite(chatStore.currentRoomId, inviteId)
    actionMsg.value = '✅ 已通过邀请'
    pendingInvites.value = pendingInvites.value.filter(i => i.id !== inviteId)
    loadMembers()
  } catch {
    actionMsg.value = '审批失败（可能已被处理）'
    loadPendingInvites()
  }
}

async function handleRejectInvite(inviteId: string) {
  if (!chatStore.currentRoomId) return
  actionMsg.value = ''
  try {
    await rejectInvite(chatStore.currentRoomId, inviteId)
    actionMsg.value = '✅ 已拒绝邀请'
    pendingInvites.value = pendingInvites.value.filter(i => i.id !== inviteId)
  } catch {
    actionMsg.value = '拒绝失败（可能已被处理）'
    loadPendingInvites()
  }
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await loadMembers()
      loadJoinRequests()
      if (isAdminOrCreator.value) {
        loadPendingInvites()
      }
    }
  },
)

// 监听成员变化和加入申请变化
onMounted(() => {
  const cleanups: (() => void)[] = []
  cleanups.push(onWsEvent('room_member_changed', () => {
    if (props.visible) loadMembers()
  }))
  cleanups.push(onWsEvent('room_member_muted', (data: any) => {
    if (data.target_user_id && props.visible) {
      // 服务端可能返回 true/false 或 0/1，统一转为 boolean
      const muted = data.muted === true || data.muted === 1
      // 直接更新本地列表中对应成员的 muted 状态
      const target = members.value.find(m => m.user_id === data.target_user_id)
      if (target) {
        target.muted = muted
      }
      chatStore.updateRoomMember(data.target_user_id, { muted })
    }
  }))
  // 有新的加入申请时刷新列表
  cleanups.push(onWsEvent('join_request', () => {
    if (props.visible) loadJoinRequests()
  }))
  // 加入申请被其他管理员处理后刷新
  cleanups.push(onWsEvent('join_request_handled', () => {
    if (props.visible) loadJoinRequests()
  }))
  // 有新的邀请通知时刷新待审批邀请列表
  cleanups.push(onWsEvent('invite_notify', () => {
    if (props.visible && isAdminOrCreator.value) {
      loadPendingInvites()
    }
  }))
  onUnmounted(() => {
    for (const fn of cleanups) {
      if (fn) fn()
    }
  })
})
</script>

<template>
  <div v-if="visible" class="manage-panel">
    <div class="panel-header">
      <span>⚙️ 房间管理</span>
      <div class="panel-header-actions">
        <button
          v-if="isCreator && chatStore.currentRoomId !== 'PUBLIC'"
          class="btn-danger-sm"
          @click="emit('dissolve')"
        >
          解散房间
        </button>
        <button class="btn-close" @click="emit('close')">✕</button>
      </div>
    </div>

    <div v-if="actionMsg" class="action-msg">{{ actionMsg }}</div>

    <!-- 待审批的加入申请 -->
    <div v-if="chatStore.joinRequests.length > 0" class="join-requests-section">
      <div class="section-title">📋 待审批的加入申请</div>
      <div
        v-for="req in chatStore.joinRequests"
        :key="req.id"
        class="join-request-item"
      >
        <span class="join-applicant">{{ req.applicant_id }}</span>
        <span v-if="req.message" class="join-message">{{ req.message }}</span>
        <div class="join-request-actions">
          <button
            class="btn-sm-approve"
            @click="handleApproveJoin(req.id)"
            title="通过"
          >
            ✅ 通过
          </button>
          <button
            class="btn-sm-reject"
            @click="handleRejectJoin(req.id)"
            title="拒绝"
          >
            ❌ 拒绝
          </button>
        </div>
      </div>
    </div>

    <!-- 待审批的邀请 -->
    <div v-if="pendingInvites.length > 0" class="join-requests-section">
      <div class="section-title">📨 待审批的邀请</div>
      <div
        v-for="inv in pendingInvites"
        :key="inv.id"
        class="join-request-item"
      >
        <span class="join-applicant">
          {{ inv.invitee_id || '未知' }}
        </span>
        <span class="invite-status-badge">等待审批</span>
        <div class="join-request-actions">
          <button
            class="btn-sm-approve"
            @click="handleApproveInvite(inv.id)"
            title="同意"
          >
            ✅ 同意
          </button>
          <button
            class="btn-sm-reject"
            @click="handleRejectInvite(inv.id)"
            title="拒绝"
          >
            ❌ 拒绝
          </button>
        </div>
      </div>
    </div>

    <div v-if="loading" class="panel-loading">加载中...</div>
    <div v-else-if="members.length === 0" class="panel-empty">暂无成员</div>
    <div v-else class="member-manage-list">
      <div
        v-for="m in members"
        :key="m.user_id"
        class="member-manage-item"
      >
        <!-- 头衔编辑模式 -->
        <template v-if="editingDisplayNameFor === m.user_id">
          <input
            v-model="displayNameInput"
            type="text"
            class="dn-input-inline"
            placeholder="输入新头衔"
            @keyup.enter="handleSaveDisplayName(m.user_id)"
            @keyup.escape="handleCancelEditDisplayName"
          />
          <div class="member-actions">
            <button class="btn-sm-icon btn-save" @click="handleSaveDisplayName(m.user_id)" title="保存">💾</button>
            <button class="btn-sm-icon btn-cancel-icon" @click="handleCancelEditDisplayName" title="取消">✕</button>
          </div>
        </template>
        <!-- 普通显示模式 -->
        <template v-else>
          <span class="member-name">{{ m.username || m.user_id }}</span>
          <span :class="['member-role-badge', getRoleClass(m.role, m.muted)]">
            {{ getRoleLabel(m.role, m.muted) }}
          </span>
          <span class="member-userid">@{{ m.user_id }}</span>

          <div class="member-actions" v-if="m.user_id !== authStore.userId">
            <!-- 设置头衔（仅创建者） -->
            <button
              v-if="isCreator"
              class="btn-sm-action"
              @click="handleStartEditDisplayName(m)"
              title="设置头衔"
            >
              🏷️
            </button>
            <!-- 踢出（管理员可踢成员） -->
            <button
              v-if="isAdminOrCreator && parseInt(m.role) < myRole"
              class="btn-sm-danger"
              @click="handleKick(m.user_id)"
              title="踢出"
            >
              🚫
            </button>
            <!-- 禁言/解除 -->
            <button
              v-if="isAdminOrCreator && parseInt(m.role) < myRole"
              class="btn-sm-action"
              :class="{ 'btn-muted': m.muted }"
              @click="handleMute(m.user_id, !m.muted)"
              :title="m.muted ? '解除禁言' : '禁言'"
            >
              {{ m.muted ? '🔊' : '🔇' }}
            </button>
            <!-- 晋升（仅创建者） -->
            <button
              v-if="isCreator && parseInt(m.role) < RoleValue.Admin"
              class="btn-sm-action"
              @click="handlePromote(m.user_id)"
              title="晋升为管理员"
            >
              ⬆️
            </button>
            <!-- 降级（仅创建者） -->
            <button
              v-if="isCreator && parseInt(m.role) >= RoleValue.Admin && parseInt(m.role) < RoleValue.Creator"
              class="btn-sm-action"
              @click="handleDemote(m.user_id)"
              title="降级为成员"
            >
              ⬇️
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manage-panel {
  padding: 12px 24px;
  background: #fafafa;
  border-bottom: 1px solid #e8e8e8;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.panel-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-close {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: #999;
}

.btn-close:hover {
  color: #333;
}

.btn-danger-sm {
  background: transparent;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.btn-danger-sm:hover {
  background: #e74c3c;
  color: #fff;
}

.action-msg {
  font-size: 12px;
  color: #27ae60;
  margin-bottom: 8px;
}

.panel-loading,
.panel-empty {
  font-size: 13px;
  color: #999;
  padding: 8px 0;
  text-align: center;
}

.member-manage-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.member-manage-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 13px;
}

.member-manage-item:hover {
  background: #f0f2f5;
}

.member-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-userid {
  font-size: 11px;
  color: #999;
  margin-left: 4px;
}

.member-role-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
}

.badge-creator {
  background: #ffe5b4;
  color: #b85c00;
}

.badge-admin {
  background: #d4e6ff;
  color: #0050b3;
}

.badge-member {
  background: #f2f2f2;
  color: #666;
}

.badge-muted {
  background: #ffe0e0;
  color: #cc4444;
}

.member-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn-sm-action {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}

.btn-sm-action:hover {
  background: rgba(0, 0, 0, 0.05);
}

.btn-sm-danger {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}

.btn-sm-danger:hover {
  background: #fef0ef;
}

/* 加入申请审批 UI */
.join-requests-section {
  background: #fffbe6;
  border: 1px solid #ffe58f;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #ad8b00;
  margin-bottom: 8px;
}

.join-request-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #fff1b8;
  font-size: 13px;
}

.join-request-item:last-child {
  border-bottom: none;
}

.join-applicant {
  font-weight: 500;
  color: #333;
  flex-shrink: 0;
}

.join-message {
  color: #888;
  font-size: 12px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.join-request-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.btn-sm-approve {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  color: #52c41a;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  transition: all 0.2s;
}

.btn-sm-approve:hover {
  background: #52c41a;
  color: #fff;
  border-color: #52c41a;
}

.btn-sm-reject {
  background: #fff2f0;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.4;
  transition: all 0.2s;
}

.btn-sm-reject:hover {
  background: #ff4d4f;
  color: #fff;
  border-color: #ff4d4f;
}

/* 头衔设置 - 内联编辑 */
.dn-input-inline {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  min-width: 0;
}

.dn-input-inline:focus {
  border-color: #4096ff;
  box-shadow: 0 0 0 2px rgba(64, 150, 255, 0.15);
}

.btn-sm-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}

.btn-sm-icon:hover {
  background: rgba(0, 0, 0, 0.05);
}

.btn-save:hover {
  background: #f6ffed;
}

.btn-cancel-icon:hover {
  background: #fff2f0;
}
</style>
