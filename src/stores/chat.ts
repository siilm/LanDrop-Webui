import { ref, reactive, computed } from 'vue'
import { defineStore } from 'pinia'
import type { RoomInfo, ChatMessage, ClientMessage, UserInfo, RoomMember, MessageElement, JoinRequestRecord } from '@/types/chat'

export const useChatStore = defineStore('chat', () => {
  // ---- 房间 ----
  const currentRoomId = ref('')
  const currentRoomName = ref('')
  const rooms = reactive<RoomInfo[]>([])

  // ---- 消息 ----
  const messages = reactive<ClientMessage[]>([])
  const loadingHistory = ref(false)
  const hasMoreHistory = ref(true)

  // ---- 成员 ----
  const members = reactive<UserInfo[]>([])
  const roomMembers = reactive<Map<string, RoomMember>>(new Map())

  // ---- WebSocket ----
  const wsConnected = ref(false)
  const wsConnecting = ref(false)

  // ---- 加入申请 ----
  const joinRequests = reactive<JoinRequestRecord[]>([])

  // ---- @提及追踪 (v2.3) ----
  /** 存在未读 @提及的房间 ID 集合（用于侧栏 [有人@我] 标签） */
  const unreadMentionRoomIds = ref<Set<string>>(new Set())
  /** 每个房间的未读 @提及 message_id 列表（最新在前） */
  const unreadMentionMessages = ref<Record<string, string[]>>({})
  /** 跳转 @ 的当前索引（0 = 最新），重置时从 0 开始，点击一次递增一次 */
  const mentionJumpIndex = ref<Record<string, number>>({})

  // ---- 待发送消息的确认 ----
  const pendingConfirmations = new Map<string, { timer: ReturnType<typeof setTimeout>; msg: ClientMessage }>()

  // ---- 计算属性 ----
  const currentRoom = computed(() => rooms.find((r) => r.roomId === currentRoomId.value))

  const currentMessages = computed(() => messages)

  const memberList = computed(() => {
    return Array.from(roomMembers.entries()).map(([userId, info]) => ({
      userId,
      ...info,
    }))
  })

  // ---- 房间管理 ----
  function setRooms(list: RoomInfo[]) {
    rooms.length = 0
    rooms.push(...list)
  }

  function upsertRoom(room: RoomInfo) {
    const idx = rooms.findIndex((r) => r.roomId === room.roomId)
    if (idx >= 0) {
      rooms[idx] = { ...rooms[idx], ...room }
    } else {
      rooms.push(room)
    }
  }

  function removeRoom(roomId: string) {
    const idx = rooms.findIndex((r) => r.roomId === roomId)
    if (idx >= 0) rooms.splice(idx, 1)
    if (currentRoomId.value === roomId) {
      currentRoomId.value = ''
      currentRoomName.value = ''
    }
  }

  function switchRoom(roomId: string, roomName: string) {
    currentRoomId.value = roomId
    currentRoomName.value = roomName
    messages.length = 0
    roomMembers.clear()
    members.length = 0
    hasMoreHistory.value = true
    loadingHistory.value = false
    joinRequests.length = 0
    // 进入房间时重置 @跳转索引，准备新一轮跳转
    resetMentionJump(roomId)
  }

  // ---- 消息管理 ----
  function addOutgoingMessage(msg: {
    roomId: string
    content?: string
    elements?: MessageElement[]
    file?: ChatMessage['file']
    from?: string
  }): string {
    const _clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const clientMsg: ClientMessage = {
      message_id: _clientId,
      from: msg.from || '',
      content: msg.content,
      elements: msg.elements,
      file: msg.file,
      timestamp: Date.now(),
      room_id: msg.roomId,
      _status: 'sending',
      _clientId,
    }
    messages.push(clientMsg)

    // 10 秒超时
    const timer = setTimeout(() => {
      const m = messages.find((m) => m._clientId === _clientId)
      if (m && m._status === 'sending') {
        m._status = 'failed'
      }
      pendingConfirmations.delete(_clientId)
    }, 10000)

    pendingConfirmations.set(_clientId, { timer, msg: clientMsg })
    return _clientId
  }

  /**
   * 通过服务端 echo 确认消息发送成功
   * 匹配条件：同一房间 + 同一发送者 + 同一文本内容
   */
  function confirmByEcho(serverMsg: ChatMessage): boolean {
    // 查找第一条匹配的 sending 消息
    for (const [clientId, pending] of pendingConfirmations.entries()) {
      const local = pending.msg
      // 匹配条件：同一房间 +（同一文本内容 或 同一 elements）
      if (local.room_id === serverMsg.room_id) {
        // 文本消息根据 content 匹配
        if (local.content && serverMsg.content && local.content === serverMsg.content) {
          clearTimeout(pending.timer)
          pendingConfirmations.delete(clientId)
          const idx = messages.findIndex((m) => m._clientId === clientId)
          if (idx >= 0) {
            // 若服务端 echo 缺少 elements，保留本地 elements（防止回复等元素丢失）
            const merged: ClientMessage = { ...serverMsg, _status: 'sent', _clientId: undefined }
            if (!serverMsg.elements && local.elements) {
              merged.elements = local.elements
            }
            messages[idx] = merged
          }
          return true
        }
        // 图片/文件/混合消息根据 elements 匹配
        if (
          (!local.content || !serverMsg.content) &&
          local.elements &&
          serverMsg.elements &&
          local.elements.length === serverMsg.elements.length &&
          local.elements[0]?.type === serverMsg.elements[0]?.type &&
          (local.elements[0] as any)?.file_id === (serverMsg.elements[0] as any)?.file_id
        ) {
          clearTimeout(pending.timer)
          pendingConfirmations.delete(clientId)
          const idx = messages.findIndex((m) => m._clientId === clientId)
          if (idx >= 0) {
            messages[idx] = { ...serverMsg, _status: 'sent', _clientId: undefined }
          }
          return true
        }
      }
    }
    return false
  }

  function confirmByAck(refMessageId: string, status: string): boolean {
    for (const [clientId, pending] of pendingConfirmations.entries()) {
      if (pending.msg._clientId === refMessageId || pending.msg.message_id === refMessageId) {
        clearTimeout(pending.timer)
        pendingConfirmations.delete(clientId)
        const idx = messages.findIndex((m) => m._clientId === clientId)
        if (idx >= 0) {
          messages[idx]._status = status === 'ok' ? 'sent' : 'failed'
        }
        return true
      }
    }
    return false
  }

  function confirmByImmediateAck(serverMsgId: string, status: string): boolean {
    // 匹配第一条 sending 消息
    const sending = messages.find((m) => m._status === 'sending')
    if (sending && sending._clientId) {
      const pending = pendingConfirmations.get(sending._clientId)
      if (pending) {
        clearTimeout(pending.timer)
        pendingConfirmations.delete(sending._clientId)
      }
      sending._status = status === 'ok' ? 'sent' : 'failed'
      sending.message_id = serverMsgId
      return true
    }
    return false
  }

  function pushMessage(msg: ChatMessage) {
    // 去重
    const exists = messages.some((m) => m.message_id === msg.message_id)
    if (!exists) {
      messages.push(msg)
    }
  }

  function prependMessages(list: ChatMessage[]) {
    // 去重后插入头部
    const existingIds = new Set(messages.map((m) => m.message_id))
    const newMsgs = list.filter((m) => !existingIds.has(m.message_id))
    if (newMsgs.length > 0) {
      messages.unshift(...newMsgs)
    }
  }

  function setMessages(list: ClientMessage[]) {
    messages.length = 0
    messages.push(...list)
  }

  function removeMessageById(messageId: string): boolean {
    const idx = messages.findIndex((m) => m.message_id === messageId)
    if (idx >= 0) {
      messages.splice(idx, 1)
      return true
    }
    return false
  }

  function updateMessageById(messageId: string, elements: MessageElement[]): boolean {
    const msg = messages.find((m) => m.message_id === messageId)
    if (msg) {
      msg.elements = elements
      return true
    }
    return false
  }

  // ---- 成员管理 ----
  function setMembers(list: UserInfo[]) {
    members.length = 0
    members.push(...list)
  }

  function setRoomMembers(list: RoomMember[]) {
    roomMembers.clear()
    if (!Array.isArray(list)) {
      console.warn('[chat] setRoomMembers: list is not an array', list)
      return
    }
    for (const m of list) {
      if (m && m.user_id) {
        roomMembers.set(m.user_id, m)
      }
    }
  }

  function updateRoomMember(userId: string, updates: Partial<RoomMember>) {
    const existing = roomMembers.get(userId)
    if (existing) {
      Object.assign(existing, updates)
    }
  }

  function removeRoomMember(userId: string) {
    roomMembers.delete(userId)
  }

  // ---- 加入申请管理 ----
  function setJoinRequests(list: JoinRequestRecord[]) {
    joinRequests.length = 0
    joinRequests.push(...list)
  }

  function removeJoinRequest(requestId: string) {
    const idx = joinRequests.findIndex((r) => r.id === requestId)
    if (idx >= 0) joinRequests.splice(idx, 1)
  }

  // ---- @提及追踪 (v2.3) ----
  function addUnreadMention(roomId: string, messageId: string) {
    const ids = new Set(unreadMentionRoomIds.value)
    ids.add(roomId)
    unreadMentionRoomIds.value = ids

    const msgs = { ...unreadMentionMessages.value }
    if (!msgs[roomId]) msgs[roomId] = []
    if (!msgs[roomId].includes(messageId)) {
      msgs[roomId] = [messageId, ...msgs[roomId]]
    }
    unreadMentionMessages.value = msgs
  }

  function clearUnreadMentions(roomId: string) {
    const ids = new Set(unreadMentionRoomIds.value)
    ids.delete(roomId)
    unreadMentionRoomIds.value = ids

    const msgs = { ...unreadMentionMessages.value }
    delete msgs[roomId]
    unreadMentionMessages.value = msgs

    const idx = { ...mentionJumpIndex.value }
    delete idx[roomId]
    mentionJumpIndex.value = idx
  }

  /** 获取下一个要跳转的 @提及 messageId，返回 null 表示已遍历完 */
  function getNextMentionJump(roomId: string): { messageId: string; index: number; total: number } | null {
    const msgs = unreadMentionMessages.value[roomId]
    if (!msgs || msgs.length === 0) return null
    const cur = mentionJumpIndex.value[roomId] ?? 0
    if (cur >= msgs.length) return null
    const result = { messageId: msgs[cur], index: cur, total: msgs.length }
    // 推进索引，到达末尾后下次调用返回 null
    mentionJumpIndex.value = { ...mentionJumpIndex.value, [roomId]: cur + 1 }
    return result
  }

  /** 重置某个房间的 @跳转进度 */
  function resetMentionJump(roomId: string) {
    mentionJumpIndex.value = { ...mentionJumpIndex.value, [roomId]: 0 }
  }

  // ---- 重置 ----
  function reset() {
    // 清除所有待确认
    for (const [, pending] of pendingConfirmations) {
      clearTimeout(pending.timer)
    }
    pendingConfirmations.clear()

    currentRoomId.value = ''
    currentRoomName.value = ''
    rooms.length = 0
    messages.length = 0
    members.length = 0
    roomMembers.clear()
    joinRequests.length = 0
    unreadMentionRoomIds.value = new Set()
    unreadMentionMessages.value = {}
    mentionJumpIndex.value = {}
    wsConnected.value = false
    wsConnecting.value = false
    loadingHistory.value = false
    hasMoreHistory.value = true
  }

  return {
    // 状态
    currentRoomId,
    currentRoomName,
    rooms,
    messages,
    members,
    roomMembers,
    wsConnected,
    wsConnecting,
    loadingHistory,
    hasMoreHistory,
    joinRequests,
    // @提及追踪
    unreadMentionRoomIds,
    unreadMentionMessages,
    mentionJumpIndex,
    // 计算属性
    currentRoom,
    currentMessages,
    memberList,
    // 房间
    setRooms,
    upsertRoom,
    removeRoom,
    switchRoom,
    // 消息
    addOutgoingMessage,
    confirmByEcho,
    confirmByAck,
    confirmByImmediateAck,
    pushMessage,
    prependMessages,
    setMessages,
    removeMessageById,
    updateMessageById,
    // 成员
    setMembers,
    setRoomMembers,
    updateRoomMember,
    removeRoomMember,
    // 加入申请
    setJoinRequests,
    removeJoinRequest,
    // @提及追踪
    addUnreadMention,
    clearUnreadMentions,
    getNextMentionJump,
    resetMentionJump,
    // 重置
    reset,
  }
})
