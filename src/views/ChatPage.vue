<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { useWebSocket, onWsEvent } from '@/composables/useWebSocket'
import {
  fetchMyRooms,
  fetchRoomMembers,
  uploadFile as uploadFileApi,
  uploadRoomImage,
  uploadAvatar as uploadAvatarApi,
  computeFileSha256,
  computeChunkSha256,
  checkFileExists,
  verifyFileChunks,
  dissolveRoom,
  downloadFileViaJwt,
  forceJoinRoom,
  joinRoom,
  promoteMember as promoteMemberApi,
  demoteMember as demoteMemberApi,
  inviteUsers as inviteUsersApi,
  fetchJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  renameUsername,
} from '@/composables/useApi'
import { fileBlobCache } from '@/utils/BlobCache'
import { getBaseUrl } from '@/composables/useApi'
import { useTheme } from '@/composables/useTheme'
import type { ClientMessage, MessageElement, RoomMember } from '@/types/chat'
import { RoleValue } from '@/types/chat'

// ---- 组件 ----
import Sidebar from '@/components/Sidebar.vue'
import ChatHeader from '@/components/ChatHeader.vue'
import MessageList from '@/components/MessageList.vue'
import MessageInput from '@/components/MessageInput.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import AvatarCropper from '@/components/AvatarCropper.vue'
import EditMessageDialog from '@/components/dialogs/EditMessageDialog.vue'
import InviteDialog from '@/components/dialogs/InviteDialog.vue'
import AdminPanel from '@/components/dialogs/AdminPanel.vue'
import ManagePanel from '@/components/dialogs/ManagePanel.vue'
import RoomFilesPanel from '@/components/dialogs/RoomFilesPanel.vue'
import AnnouncePanel from '@/components/dialogs/AnnouncePanel.vue'
import SettingsPanel from '@/components/dialogs/SettingsPanel.vue'
import RenameDialog from '@/components/dialogs/RenameDialog.vue'

const router = useRouter()
const authStore = useAuthStore()
const chatStore = useChatStore()
const ws = useWebSocket()
const { syncFromStorage } = useTheme()

// ---- 面板可见性 ----
const showFilesPanel = ref(false)
const showManagePanel = ref(false)
const showInviteDialog = ref(false)
const showAnnouncePanel = ref(false)
const showAdminPanel = ref(false)
// ---- 右键菜单 ----
const contextMenu = ref<{ visible: boolean; x: number; y: number; message: ClientMessage | null }>({
  visible: false,
  x: 0,
  y: 0,
  message: null,
})

// ---- 回复目标 ----
const replyTarget = ref<{ messageId: string; preview: string } | null>(null)

// ---- 编辑消息 ----
const editDialog = ref<{ visible: boolean; message: ClientMessage | null }>({
  visible: false,
  message: null,
})

// ---- 图片预览 ----
const previewImageId = ref('')
const showPreview = ref(false)

// ---- 头像裁切 ----
const avatarFile = ref<File | null>(null)
const showCropper = ref(false)

// ---- 加载状态 ----
const loadingRooms = ref(false)

// ======================== 初始化 ========================

onMounted(() => {
  // 同步登录页可能做过的主题切换
  syncFromStorage()
  // 连接 WebSocket
  ws.connect()
  // 加载房间列表
  refreshRooms()
  // 全局点击关闭上下文菜单
  document.addEventListener('click', closeContextMenu)
})

// ======================== WebSocket 事件监听 ========================

// 房间公告
onWsEvent('room_announcement', (data: any) => {
  if (data.room_id === chatStore.currentRoomId) {
    alert(`📢 公告：${data.content}`)
  }
})

// ---- 新事件系统 (v1.5+) ----

/** 加入申请通知 → 管理员收到 */
onWsEvent('join_request', (data: any) => {
  const { event_id, room_id, applicant_id } = data
  // 发送 event_ack 确认收到
  ws.sendEventAck(event_id)
  // 通知管理员
  if (confirm(`🔔 用户 ${applicant_id} 申请加入房间 ${room_id}，是否前往审批？`)) {
    showManagePanel.value = true
    // 切换到对应房间（如果当前不在该房间）
    if (room_id !== chatStore.currentRoomId) {
      chatStore.switchRoom(room_id, room_id)
    }
  }
})

/** 邀请通知 → 受邀人收到（admin+ 邀请自动审批，member 邀请待审批） */
onWsEvent('invite_notify', (data: any) => {
  const { event_id, room_id, inviter_id } = data
  // 发送 event_ack 确认收到
  ws.sendEventAck(event_id)
  // v1.7: 受邀人可在侧边栏「我的申请 / 邀请」中查看并接受/拒绝
  alert(`🔔 你被 ${inviter_id} 邀请加入房间 ${room_id}，请在侧边栏「我的申请 / 邀请」中处理`)
})

/** 加入申请已被处理 → 其他管理员收到 */
onWsEvent('join_request_handled', (data: any) => {
  const { room_id, action, by } = data
  const actionText = action === 'approved' ? '通过' : '拒绝'
  console.log(`[ChatPage] 管理员 ${by} 已${actionText}了 ${room_id} 的加入申请`)
  // 刷新加入申请列表
  if (room_id === chatStore.currentRoomId) {
    loadJoinRequests()
  }
})

/** 邀请被管理员拒绝 → 受邀人收到 */
onWsEvent('invite_rejected', (data: any) => {
  const { room_id, reviewed_by } = data
  alert(`❌ 你对房间 ${room_id} 的邀请已被管理员 ${reviewed_by || '未知'} 拒绝`)
})

/** 受邀人拒绝了邀请 → 邀请人收到 */
onWsEvent('invite_declined', (data: any) => {
  const { room_id, invitee_id } = data
  alert(`❌ 用户 ${invitee_id || '未知'} 拒绝了加入房间 ${room_id} 的邀请`)
})

/** 加入申请被管理员拒绝 → 申请人收到 */
onWsEvent('join_rejected', (data: any) => {
  const { room_id, reviewed_by } = data
  alert(`❌ 你对房间 ${room_id} 的加入申请已被管理员 ${reviewed_by || '未知'} 拒绝`)
})

// ---- 保证送达消息已读回执 (v2.2) ----

/** @提及推送 → 回发 message_read 停止服务端对该用户的重发 */
onWsEvent('mention', (data: any) => {
  if (data.message_id && data.room_id) {
    ws.sendMessageRead(data.message_id, data.room_id)
  }
})

/** 公告推送 → 回发 message_read 停止服务端对该用户的重发 */
onWsEvent('announce', (data: any) => {
  if (data.message_id && data.room_id) {
    ws.sendMessageRead(data.message_id, data.room_id)
  }
})

// 切换房间时加载成员列表
watch(
  () => chatStore.currentRoomId,
  (newId) => {
    if (newId) {
      loadRoomMembers()
    }
  },
  { immediate: false },
)

// 成员变更 → 刷新成员列表
onWsEvent('room_member_changed', () => {
  if (chatStore.currentRoomId) {
    loadRoomMembers()
  }
})

onWsEvent('room_member_muted', (data: any) => {
  if (data.target_user_id) {
    // 直接更新 store 中的 muted 状态（因为 HTTP API 不返回 muted 字段）
    chatStore.updateRoomMember(data.target_user_id, { muted: data.muted })
  }
  if (chatStore.currentRoomId) {
    loadRoomMembers()
  }
})

onWsEvent('room_member_kicked', (data: any) => {
  if (data.target_user_id === authStore.userId) {
    alert('你已被移出房间')
    chatStore.removeRoom(data.room_id)
  }
})

onWsEvent('room_promote', () => {
  if (chatStore.currentRoomId) {
    loadRoomMembers()
  }
})

onWsEvent('room_demote', () => {
  if (chatStore.currentRoomId) {
    loadRoomMembers()
  }
})

// 创建 / 加入房间后立即刷新房间列表
onWsEvent('room_created', () => { refreshRooms() })
onWsEvent('room_joined', () => { refreshRooms() })

// ======================== 房间操作 ========================

async function refreshRooms() {
  loadingRooms.value = true
  try {
    const res = await fetchMyRooms()
    chatStore.setRooms(res.rooms || [])
  } catch (e) {
    console.warn('[ChatPage] 刷新房间列表失败:', e)
  } finally {
    loadingRooms.value = false
  }
}

async function handleCreateRoom(name: string) {
  try {
    const res = await ws.createRoom ? ws.createRoom(name) : null
    if (!res) {
      // WS 发送不返回结果，需等待 WS 推送 room_created
      console.log('[ChatPage] 创建房间请求已发送')
    }
  } catch (e) {
    console.warn('[ChatPage] 创建房间失败:', e)
  }
}

async function handleJoinRoom(roomId: string, message?: string, forceJoin?: boolean) {
  if (forceJoin) {
    // 特权人员（owner/public_admin）强制加入，跳过审批
    try {
      await forceJoinRoom(roomId)
      refreshRooms()
      return
    } catch (e: any) {
      const errMsg = e?.message || e?.error || ''
      console.warn('[ChatPage] 强制加入失败:', e)
      alert('强制加入失败: ' + (errMsg || '未知错误'))
      return
    }
  }
  // 普通加入（可能需审批）
  try {
    const res = await joinRoom(roomId, message || '')
    if (res.status === 'joined') {
      refreshRooms()
    } else if (res.status === 'pending') {
      alert('📋 加入申请已提交，等待管理员审批')
    }
  } catch (e: any) {
    const errMsg = e?.message || e?.error || ''
    if (errMsg.includes('already_member')) {
      alert('你已经是该房间的成员')
    } else if (errMsg.includes('already_processed')) {
      alert('该申请已被处理')
    } else {
      console.warn('[ChatPage] 加入房间失败:', e)
      alert('加入房间失败: ' + (errMsg || '未知错误'))
    }
  }
}

function handleLeaveRoom(roomId: string) {
  if (confirm('确定离开该房间？')) {
    ws.leaveRoom(roomId)
  }
}

async function loadRoomMembers() {
  if (!chatStore.currentRoomId) return
  try {
    const members = await fetchRoomMembers(chatStore.currentRoomId)
    chatStore.setRoomMembers(Array.isArray(members) ? members : [])
    console.log('[ChatPage] 已拉取到', members.length, '条成员记录')
  } catch (e) {
    console.warn('[ChatPage] 加载成员失败:', e)
  }
}

// ======================== 消息操作 ========================

function handleSendMessage(text: string, replyTo?: string, mentionUserIds?: string[]) {
  if (!chatStore.currentRoomId || !text.trim()) return

  const elements: MessageElement[] = []
  // @提及元素 (v2.2) — 排在文本元素之前
  if (mentionUserIds && mentionUserIds.length > 0) {
    for (const uid of mentionUserIds) {
      elements.push({ type: 'mention', user_id: uid })
    }
  }
  if (replyTo) {
    const originalMsg = chatStore.messages.find(m => m.message_id === replyTo)
    // 尝试从 content 或 elements 中提取预览文本
    let previewText = originalMsg?.content || ''
    if (!previewText && originalMsg?.elements) {
      const textEl = originalMsg.elements.find(e => e.type === 'text') as { content?: string } | undefined
      if (textEl?.content) previewText = textEl.content
    }
    elements.push({
      type: 'reply',
      message_id: replyTo,
      preview: {
        from: originalMsg?.from || '',
        text: previewText,
      },
    })
  }
  elements.push({ type: 'text', content: text })

  chatStore.addOutgoingMessage({
    roomId: chatStore.currentRoomId,
    content: text,
    elements,
    from: authStore.userId,
  })

  ws.sendChatMessage(text, chatStore.currentRoomId, elements)
}

async function handleSendImage(files: FileList | File[]) {
  if (!chatStore.currentRoomId) return

  const fileList = Array.from(files)
  for (const file of fileList) {
    if (file.type.startsWith('image/')) {
      try {
        const res = await uploadRoomImage(chatStore.currentRoomId, file)
        // 上传成功后发送图片消息
        if (res.success) {
          const elements: MessageElement[] = [{ type: 'image', file_id: res.avatar_url }]
          chatStore.addOutgoingMessage({
            roomId: chatStore.currentRoomId,
            elements,
            from: authStore.userId,
          })
          ws.sendChatMessage('', chatStore.currentRoomId, elements)
        }
      } catch (e) {
        console.warn('[ChatPage] 图片上传失败:', e)
      }
    }
  }
}

async function handleSendFile(files: FileList | File[]) {
  if (!chatStore.currentRoomId) return

  const fileList = Array.from(files)
  for (const file of fileList) {
    try {
      // 尝试秒传（instant upload）
      const sha256 = await computeFileSha256(file)
      const checkRes = await checkFileExists({
        file_name: file.name,
        file_size: file.size,
        sha256,
      })

      let fileId: string
      if (checkRes.exists && checkRes.file_id) {
        fileId = checkRes.file_id

        // 大文件需要头尾验证
        if (file.size >= 10 * 1024 * 1024) {
          const headEnd = Math.min(256 * 1024, file.size)
          const tailStart = Math.max(0, file.size - 256 * 1024)
          const headSha256 = await computeChunkSha256(file, 0, headEnd)
          const tailSha256 = await computeChunkSha256(file, tailStart, file.size)

          const verifyRes = await verifyFileChunks({
            file_id: fileId,
            sha256,
            file_name: file.name,
            file_size: file.size,
            head_chunk_sha256: headSha256,
            tail_chunk_sha256: tailSha256,
          })

          if (!verifyRes.verified) {
            // 验证失败，回退到普通上传
            const uploadRes = await uploadFileApi(file, chatStore.currentRoomId)
            fileId = uploadRes.file_id
          }
        }
      } else {
        // 普通上传
        const uploadRes = await uploadFileApi(file, chatStore.currentRoomId)
        fileId = uploadRes.file_id
      }

      // 发送文件消息
      const elements: MessageElement[] = [
        {
          type: 'file',
          file_id: fileId,
          file_name: file.name,
          file_size: file.size,
          mime_type: file.type,
        },
      ]
      chatStore.addOutgoingMessage({
        roomId: chatStore.currentRoomId,
        elements,
        from: authStore.userId,
      })
      ws.sendChatMessage('', chatStore.currentRoomId, elements)
    } catch (e) {
      console.warn('[ChatPage] 文件发送失败:', e)
    }
  }
}

// ======================== 右键菜单 ========================

function handleContextMenu(event: MouseEvent, msg: ClientMessage) {
  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    message: msg,
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function handleRecallMessage() {
  const msg = contextMenu.value.message
  if (!msg || !chatStore.currentRoomId) return
  // 发送 WebSocket 撤回指令
  ws.recallMessage(chatStore.currentRoomId, msg.message_id)
  // 同时立即从本地列表移除（确保服务端撤回后 UI 立即反应）
  chatStore.removeMessageById(msg.message_id)
  closeContextMenu()
}

function handleEditContextMenu() {
  const msg = contextMenu.value.message
  if (!msg) return
  editDialog.value = {
    visible: true,
    message: msg,
  }
  closeContextMenu()
}

function handleReplyMessage() {
  const msg = contextMenu.value.message
  if (!msg) return
  // 从 content 或 elements 中提取预览文本
  let previewText = msg.content || ''
  if (!previewText && msg.elements) {
    const textEl = msg.elements.find(e => e.type === 'text') as { content?: string } | undefined
    if (textEl?.content) previewText = textEl.content
  }
  replyTarget.value = { messageId: msg.message_id, preview: previewText }
  closeContextMenu()
}

function clearReplyTarget() {
  replyTarget.value = null
}

function handleDeleteLocal() {
  const msg = contextMenu.value.message
  if (!msg) return
  chatStore.removeMessageById(msg.message_id)
  closeContextMenu()
}

const isOwnerOrAdmin = computed(() => {
  return authStore.globalRole === 'owner' || authStore.globalRole === 'public_admin'
})

const contextMsgIsSelf = computed(() => {
  const msg = contextMenu.value.message
  return msg ? msg.from === authStore.userId : false
})

/** 当前用户对上下文菜单消息是否有撤回权限 */
const canRecallContextMsg = computed(() => {
  const msg = contextMenu.value.message
  if (!msg) return false
  // 自己的消息始终可撤回
  if (msg.from === authStore.userId) return true
  // 查找当前用户在房间中的角色
  const myMember = chatStore.roomMembers.get(authStore.userId)
  const myRole = myMember ? parseInt(myMember.role) : 0
  // member（role=0）不能撤回他人任何消息
  if (myRole < RoleValue.Admin) return false
  // admin/creator：检查角色是否 >= 发送者角色（admin可互撤，但不能撤creator）
  const senderMember = chatStore.roomMembers.get(msg.from)
  const senderRole = senderMember ? parseInt(senderMember.role) : 0
  return myRole >= senderRole
})

// ======================== 编辑消息 ========================

function handleEditMessage(content: string) {
  const msg = editDialog.value.message
  if (!msg || !chatStore.currentRoomId) return

  const elements: MessageElement[] = [{ type: 'text', content }]
  editDialog.value.visible = false

  // 使用 WS 编辑（服务端有 Ack 机制确保送达）
  ws.editMessage(chatStore.currentRoomId, msg.message_id, elements)
  chatStore.updateMessageById(msg.message_id, elements)
}

// ======================== 头像 ========================

function handleUploadAvatar(file: File) {
  avatarFile.value = file
  showCropper.value = true
}

async function handleCropConfirm(blob: Blob) {
  showCropper.value = false
  const file = new File([blob], 'avatar.png', { type: 'image/png' })
  try {
    const res = await uploadAvatarApi(file)
    authStore.updateAvatarUrl(res.avatar_url)
  } catch (e: any) {
    console.warn('[ChatPage] 头像上传失败:', e)
  }
}

function handleCropCancel() {
  showCropper.value = false
  avatarFile.value = null
}

// ======================== 其他操作 ========================

function handleDissolveRoom() {
  if (!chatStore.currentRoomId) return
  if (confirm('确定解散该房间？此操作不可撤销！')) {
    dissolveRoom(chatStore.currentRoomId).catch(() => {
      ws.dissolveRoom(chatStore.currentRoomId)
    })
    showManagePanel.value = false
  }
}

function triggerFileUpload() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (ev: any) => {
    if (ev.target?.files?.[0]) handleUploadAvatar(ev.target.files[0])
  }
  input.click()
}

async function handlePromote(userId: string) {
  if (!chatStore.currentRoomId) return
  try {
    await promoteMemberApi(chatStore.currentRoomId, userId)
    loadRoomMembers()
  } catch (e) {
    console.warn('[ChatPage] HTTP promote 失败，尝试 WS fallback:', e)
    ws.promoteMember(chatStore.currentRoomId, userId)
  }
}

async function handleDemote(userId: string) {
  if (!chatStore.currentRoomId) return
  try {
    await demoteMemberApi(chatStore.currentRoomId, userId)
    loadRoomMembers()
  } catch (e) {
    console.warn('[ChatPage] HTTP demote 失败，尝试 WS fallback:', e)
    ws.demoteMember(chatStore.currentRoomId, userId)
  }
}

async function handleInvite(userIds: string[]) {
  try {
    const result = await inviteUsersApi(chatStore.currentRoomId, userIds)

    const okList: string[] = []
    const errList: string[] = []
    const STATUS_LABELS: Record<string, string> = {
      ok: '✅ 已邀请',
      room_not_found: '❌ 房间不存在',
      inviter_not_member: '❌ 你不在该房间',
      already_member: '⚠️ 已是成员',
      already_invited: '⚠️ 已有待审批邀请',
      invalid_user_id: '❌ userId 格式不合法（需 12 位字母数字）',
    }

    for (const item of result.invites) {
      const label = STATUS_LABELS[item.status] || `❓ ${item.status}`
      if (item.status === 'ok') {
        okList.push(`${item.user_id}: ${label}`)
      } else {
        errList.push(`${item.user_id}: ${label}`)
      }
    }

    let msg = ''
    if (okList.length > 0) msg += `已成功邀请 ${okList.length} 人`
    if (errList.length > 0) {
      msg += (msg ? '\n\n' : '') + `以下邀请未成功：\n${errList.join('\n')}`
    }
    alert(msg || '未发送任何邀请')
  } catch (e: any) {
    alert(`邀请失败：${e?.message || e}`)
  }
  showInviteDialog.value = false
}

/** 加载待审批的加入申请列表 */
async function loadJoinRequests() {
  if (!chatStore.currentRoomId) return
  try {
    const list = await fetchJoinRequests(chatStore.currentRoomId)
    chatStore.setJoinRequests(Array.isArray(list) ? list : [])
  } catch (e) {
    console.warn('[ChatPage] 加载加入申请失败:', e)
  }
}

/** 审批加入申请 */
async function handleApproveJoinRequest(requestId: string) {
  if (!chatStore.currentRoomId) return
  try {
    await approveJoinRequest(chatStore.currentRoomId, requestId)
    chatStore.removeJoinRequest(requestId)
    loadRoomMembers()
  } catch (e) {
    console.warn('[ChatPage] 审批加入申请失败:', e)
    alert('审批失败，可能已被其他管理员处理')
    loadJoinRequests()
  }
}

/** 拒绝加入申请 */
async function handleRejectJoinRequest(requestId: string) {
  if (!chatStore.currentRoomId) return
  try {
    await rejectJoinRequest(chatStore.currentRoomId, requestId)
    chatStore.removeJoinRequest(requestId)
  } catch (e) {
    console.warn('[ChatPage] 拒绝加入申请失败:', e)
    alert('操作失败，可能已被其他管理员处理')
    loadJoinRequests()
  }
}

// ======================== 设置面板 ========================
const showSettingsPanel = ref(false)

// ======================== 修改用户名 ========================
const showRenameDialog = ref(false)

async function handleRename(newName: string) {
  try {
    await renameUsername(newName)
    authStore.updateUsername(newName)
    showRenameDialog.value = false
    alert('✅ 用户名已修改')
  } catch (e: any) {
    alert('修改失败: ' + (e?.message || e?.error || '未知错误'))
  }
}

function handleLogout() {
  authStore.logout()
  chatStore.reset()
  ws.disconnect()
  router.push('/login')
}

function handleImageClick(el: any) {
  previewImageId.value = el.file_id
  showPreview.value = true
}

function handleFileClick(el: any) {
  if (!chatStore.currentRoomId) return
  if (el.file_id) {
    downloadFileViaJwt(el.file_id, el.file_name, chatStore.currentRoomId)
  }
}

// 监听房间切换后加载成员
watch(
  () => chatStore.currentRoomId,
  (newId) => {
    if (newId) {
      showFilesPanel.value = false
      showManagePanel.value = false
      showAnnouncePanel.value = false
      loadRoomMembers()
    }
  },
)
</script>

<template>
  <div class="chat-layout">
    <!-- 侧边栏 -->
    <Sidebar
      @create-room="handleCreateRoom"
      @join-room="handleJoinRoom"
      @leave-room="handleLeaveRoom"
      @logout="handleLogout"
      @refresh-rooms="refreshRooms"
      @upload-avatar="triggerFileUpload"
      @open-admin="showAdminPanel = !showAdminPanel"
      @open-settings="showSettingsPanel = true"
    />

    <!-- 系统管理面板（侧边栏内） -->
    <AdminPanel
      v-if="showAdminPanel"
      @close="showAdminPanel = false"
    />

    <!-- 主聊天区 -->
    <main class="main-area">
      <template v-if="chatStore.currentRoomId">
        <!-- 聊天头部 -->
        <ChatHeader
          @toggle-files="showFilesPanel = !showFilesPanel"
          @toggle-manage="showManagePanel = !showManagePanel"
          @toggle-invite="showInviteDialog = true"
          @toggle-announce="showAnnouncePanel = !showAnnouncePanel"
        />

        <!-- 文件面板 -->
        <RoomFilesPanel
          :visible="showFilesPanel"
          @close="showFilesPanel = false"
        />

        <!-- 管理面板 -->
        <ManagePanel
          :visible="showManagePanel"
          @dissolve="handleDissolveRoom"
          @close="showManagePanel = false"
        />

        <!-- 公告面板 -->
        <AnnouncePanel
          :visible="showAnnouncePanel"
          @close="showAnnouncePanel = false"
        />

        <!-- 消息列表 -->
        <MessageList
          @context-menu="handleContextMenu"
          @image-click="handleImageClick"
          @file-click="handleFileClick"
        />

        <!-- 输入区域 -->
        <MessageInput
          :reply-target="replyTarget"
          @send="handleSendMessage"
          @send-image="handleSendImage"
          @send-file="handleSendFile"
          @clear-reply="clearReplyTarget"
        />
      </template>

      <!-- 未选择房间 -->
      <template v-else>
        <div class="no-room-selected">
          <div class="placeholder-icon">💬</div>
          <p>选择一个房间开始聊天</p>
          <p class="hint">或创建一个新房间</p>
        </div>
      </template>

      <!-- 主区域柔光装饰 -->
      <div class="main-glow" aria-hidden="true"></div>
    </main>

    <!-- ==================== 右键菜单 ==================== -->
    <Teleport to="body">
      <div
        v-if="contextMenu.visible"
        class="context-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
      >
        <!-- 回复 — 所有消息可用 -->
        <div
          class="context-menu-item"
          @click="handleReplyMessage"
        >
          ↩️ 回复
        </div>
        <!-- 编辑 — 仅自己的消息 -->
        <div
          v-if="contextMsgIsSelf"
          class="context-menu-item"
          @click="handleEditContextMenu"
        >
          ✏️ 编辑消息
        </div>
        <!-- 撤回 — 有权限时显示（自己消息 或 角色 >= 发送者） -->
        <div
          v-if="canRecallContextMsg"
          class="context-menu-item danger"
          @click="handleRecallMessage"
        >
          🗑️ 撤回
        </div>
        <!-- 本地删除 — 始终可用 -->
        <div
          class="context-menu-item danger"
          @click="handleDeleteLocal"
        >
          🗑️ 本地删除
        </div>
      </div>
    </Teleport>

    <!-- ==================== 编辑消息对话框 ==================== -->
    <EditMessageDialog
      :visible="editDialog.visible"
      :content="(editDialog.message?.elements?.find(e => e.type === 'text') as any)?.content || editDialog.message?.content || ''"
      @save="handleEditMessage"
      @close="editDialog.visible = false"
    />

    <!-- ==================== 邀请对话框 ==================== -->
    <InviteDialog
      :visible="showInviteDialog"
      @invite="handleInvite"
      @close="showInviteDialog = false"
    />

    <!-- ==================== 图片预览 ==================== -->
    <ImageViewer
      :file-id="previewImageId"
      :room-id="chatStore.currentRoomId"
      :visible="showPreview"
      @close="showPreview = false"
    />

    <!-- ==================== 头像裁切 ==================== -->
    <AvatarCropper
      v-if="showCropper && avatarFile"
      :file="avatarFile"
      @confirm="handleCropConfirm"
      @cancel="handleCropCancel"
    />

    <!-- ==================== 设置面板 ==================== -->
    <SettingsPanel
      :visible="showSettingsPanel"
      @rename="showRenameDialog = true"
      @upload-avatar="triggerFileUpload"
      @close="showSettingsPanel = false"
    />

    <!-- ==================== 修改用户名 ==================== -->
    <RenameDialog
      :visible="showRenameDialog"
      @rename="handleRename"
      @close="showRenameDialog = false"
    />
  </div>
</template>

<style scoped>
.chat-layout {
  display: flex;
  height: 100vh;
  background: var(--bg);
  transition: background-color 0.5s var(--ease-in-out);
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-chat);
  min-width: 0;
  position: relative;
  overflow: hidden;
  isolation: isolate;
  transition: background-color 0.5s var(--ease-in-out);
}

/* 主区域顶部柔光：极淡的品牌色径向晕染，营造层次而不抢眼 */
.main-glow {
  position: absolute;
  z-index: -1;
  top: -180px;
  right: -120px;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow), transparent 68%);
  opacity: 0.5;
  filter: blur(40px);
  pointer-events: none;
  animation: ld-orb-float 26s var(--ease-in-out) infinite alternate;
}

@keyframes ld-orb-float {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-40px, 50px) scale(1.12); }
}

.no-room-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: var(--text-muted);
  animation: ld-fade-in 0.6s var(--ease-out-expo) both;
}

.placeholder-icon {
  font-size: 64px;
  margin-bottom: 16px;
  filter: drop-shadow(0 8px 20px var(--accent-glow));
  animation: ld-float-soft 4s var(--ease-in-out) infinite;
}

@keyframes ld-float-soft {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

.no-room-selected p {
  margin: 4px 0;
  font-size: 16px;
  color: var(--text-secondary);
}

.no-room-selected .hint {
  font-size: 13px;
  color: var(--text-muted);
}
</style>

<!-- 全局样式 -->
<style>
/* ---- 右键菜单 ---- */
.context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
  min-width: 132px;
  padding: 4px;
  overflow: hidden;
  transform-origin: top left;
  animation: ld-menu-pop 0.18s var(--ease-out-expo) both;
}

@keyframes ld-menu-pop {
  from { opacity: 0; transform: scale(0.9) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.context-menu-item {
  padding: 9px 14px;
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  border-radius: var(--radius-xs);
  transition: background 0.15s ease, color 0.15s ease, transform 0.12s ease;
  user-select: none;
}

.context-menu-item:hover {
  background: var(--accent-soft);
  transform: translateX(2px);
}

.context-menu-item.danger {
  color: var(--danger-text);
}

.context-menu-item.danger:hover {
  background: var(--danger-bg);
}
</style>
