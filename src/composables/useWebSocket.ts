import { onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import type {
  RoomInfo,
  MessageElement,
  WsIncomingMessage,
  WsChatMessage,
  WsChatEditOutbound,
} from '@/types/chat'

// ======================== 模块级共享 WebSocket 状态 ========================
// useWebSocket() 被多个组件调用，但底层连接是全局单例

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let healthTimer: ReturnType<typeof setInterval> | null = null
let lastMessageTime = 0
let manualDisconnect = false

const MAX_RECONNECT_DELAY = 30000
let reconnectAttempts = 0
let lastToken = ''

// 引用计数：跟踪有多少组件正在使用 WebSocket
let refCount = 0

function getWsUrl(): string {
  const store = useAuthStore()
  if (store.wsUrl) {
    let url = store.wsUrl.replace(/\/+$/, '')
    return url
  }
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}`
}

function mapRoom(raw: any): RoomInfo {
  return {
    roomId: raw.room_id || raw.roomId || '',
    roomName: raw.name || raw.roomName || '',
    memberCount: raw.member_count ?? raw.memberCount,
    hasPassword: raw.has_password ?? raw.hasPassword,
  }
}

// ======================== 事件总线（Pinia 事件替代 CustomEvent） ========================

type EventCallback = (data: any) => void
const eventListeners = new Map<string, Set<EventCallback>>()

export function onWsEvent(event: string, callback: EventCallback) {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set())
  }
  eventListeners.get(event)!.add(callback)
  return () => {
    eventListeners.get(event)?.delete(callback)
  }
}

function emitWsEvent(event: string, data: any) {
  const handlers = eventListeners.get(event)
  if (handlers) {
    for (const cb of handlers) {
      cb(data)
    }
  }
}

// ---- 心跳检测 ----

function startHealthCheck() {
  stopHealthCheck()
  healthTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      if (lastMessageTime > 0 && Date.now() - lastMessageTime > 40000) {
        console.warn('[WS] 健康检查超时，重连中...')
        manualDisconnect = false
        ws.close()
      }
    }
  }, 10000)
}

function stopHealthCheck() {
  if (healthTimer) {
    clearInterval(healthTimer)
    healthTimer = null
  }
}

function touch() {
  lastMessageTime = Date.now()
}

// ---- 发送（模块级） ----

function sendJson(obj: any): boolean {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj))
    return true
  }
  return false
}

// ---- 消息处理（模块级） ----

/** 处理类 chat_message 入站帧（chat_message / mention / announce）的公共逻辑 */
function handleChatLikeMessage(data: any, chatStore: ReturnType<typeof useChatStore>) {
  let elements: MessageElement[] = []
  if (data.elements) {
    try {
      elements = typeof data.elements === 'string' ? JSON.parse(data.elements) : data.elements
    } catch {
      elements = []
    }
  }
  // 收信人必须在目标房间内才将消息推入该房间的消息列表
  if (data.room_id && data.room_id === chatStore.currentRoomId) {
    const matched = chatStore.confirmByEcho({
      message_id: data.message_id,
      from: data.from,
      display_name: data.display_name,
      elements,
      content: data.content,
      file: data.file,
      timestamp: data.timestamp,
      room_id: data.room_id,
    })
    if (!matched) {
      chatStore.pushMessage({
        message_id: data.message_id,
        from: data.from,
        display_name: data.display_name,
        elements,
        content: data.content,
        file: data.file,
        timestamp: data.timestamp,
        room_id: data.room_id,
      })
    }
  }
  sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
  return { elements, room_id: data.room_id as string, from: data.from as string, display_name: data.display_name as string, content: data.content as string }
}

function handleMessage(data: any) {
  const chatStore = useChatStore()
  const authStore = useAuthStore()

  if (data.created_at != null && data.timestamp == null) {
    data.timestamp = Number(data.created_at)
  }

  switch (data.type) {
    case 'ping': {
      sendJson({ type: 'pong' })
      break
    }

    case 'ack': {
      if (data.ref_message_id) {
        chatStore.confirmByAck(data.ref_message_id, data.status)
      } else if (data.message_id) {
        chatStore.confirmByImmediateAck(data.message_id, data.status)
      }
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'room_list': {
      const list = (data.rooms || []).map(mapRoom)
      chatStore.setRooms(list)
      break
    }

    case 'room_created':
    case 'room_joined': {
      if (data.room_id) {
        chatStore.upsertRoom(mapRoom(data))
      }
      // 通过事件总线通知组件（如 MyRequestsPanel 需要知道已加入房间）
      emitWsEvent(data.type, data)
      break
    }

    case 'room_left':
    case 'room_destroyed': {
      if (data.room_id) {
        chatStore.removeRoom(data.room_id)
      }
      break
    }

    case 'chat_message': {
      handleChatLikeMessage(data, chatStore)
      break
    }

    /** @提及推送 (v2.2) — 结构与 chat_message 相同，type="mention" */
    case 'mention': {
      const info = handleChatLikeMessage(data, chatStore)
      // 判断当前用户是否真的是 @ 目标（elements 中的 mention 类型）
      const elems: any[] = info?.elements || []
      const isTargeted = elems.some(
        (el: any) => el.type === 'mention' && (el.user_id === authStore.userId || el.user_id === 'ALL'),
      )
      const isSelf = data.from === authStore.userId
      const isOtherRoom = data.room_id !== chatStore.currentRoomId
      // 非当前房间 且 非自己 且 自己确实被@ → 记录未读
      if (data.message_id && data.room_id && !isSelf && isOtherRoom && isTargeted) {
        chatStore.addUnreadMention(data.room_id, data.message_id)
      }
      // 通过事件总线通知 ChatPage（发 message_read）与 MessageList（即时闪烁）
      emitWsEvent('mention', data)
      // 非当前房间 且 非自己 且 自己确实被@ → 侧栏横幅通知
      if (info && isOtherRoom && !isSelf && isTargeted) {
        emitWsEvent('mention_alert', data)
      }
      break
    }

    /** 公告推送 (v2.2) — 结构与 chat_message 相同，type="announce" */
    case 'announce': {
      handleChatLikeMessage(data, chatStore)
      // 通过事件总线通知 ChatPage，使其发送 message_read
      emitWsEvent('announce', data)
      break
    }

    case 'chat_recall': {
      if (data.message_id) {
        chatStore.removeMessageById(data.message_id)
      }
      sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      break
    }

    case 'chat_edit': {
      const editData = data as WsChatEditOutbound
      let elements: MessageElement[] = []
      try {
        elements = typeof editData.elements === 'string' ? JSON.parse(editData.elements) : editData.elements
      } catch {
        elements = []
      }
      chatStore.updateMessageById(editData.message_id, elements)
      sendJson({ type: 'ack', message_id: editData.message_id, status: 'ok' })
      break
    }

    case 'chat_delete': {
      if (data.message_id) {
        chatStore.removeMessageById(data.message_id)
      }
      break
    }

    case 'join_request': {
      emitWsEvent(data.type, data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'invite_notify': {
      emitWsEvent(data.type, data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'join_request_handled': {
      emitWsEvent(data.type, data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'room_member_kicked':
    case 'room_member_muted':
    case 'room_announcement':
    case 'room_member_changed':
    case 'room_promote':
    case 'room_demote': {
      emitWsEvent(data.type, data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'file': {
      emitWsEvent('file', data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'event_confirm': {
      emitWsEvent('event_confirm', data)
      break
    }

    case 'event_reject': {
      emitWsEvent('event_reject', data)
      break
    }

    // ---- 拒绝通知（v1.8+） ----
    case 'invite_rejected': {
      // 管理员拒绝了邀请 → 通知受邀人
      emitWsEvent('invite_rejected', data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'invite_declined': {
      // 受邀人拒绝了邀请 → 通知邀请人
      emitWsEvent('invite_declined', data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    case 'join_rejected': {
      // 管理员拒绝了加入申请 → 通知申请人
      emitWsEvent('join_rejected', data)
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
      break
    }

    default: {
      if (data.message_id) {
        sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
      }
    }
  }
}

// ---- 调度重连 ----

function scheduleReconnect() {
  const chatStore = useChatStore()
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectAttempts++
  const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts - 1), MAX_RECONNECT_DELAY)
  console.log(`[WS] ${delay / 1000}s 后重连 (第 ${reconnectAttempts} 次)`)
  chatStore.wsConnecting = true
  reconnectTimer = setTimeout(() => {
    connect()
  }, delay)
}

// ---- 连接（模块级） ----

function connect() {
  const authStore = useAuthStore()
  const chatStore = useChatStore()

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    if (lastToken && lastToken !== authStore.accessToken) {
      manualDisconnect = false
      ws.close()
    } else {
      return
    }
  }

  manualDisconnect = false
  chatStore.wsConnecting = true
  lastToken = authStore.accessToken

  const wsUrl = `${getWsUrl()}/ws?token=${authStore.accessToken}`
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    console.log('[WS] 已连接')
    chatStore.wsConnected = true
    chatStore.wsConnecting = false
    reconnectAttempts = 0
    touch()
    startHealthCheck()
  }

  ws.onmessage = (event: MessageEvent) => {
    touch()
    chatStore.wsConnected = true
    chatStore.wsConnecting = false
    try {
      const data = JSON.parse(event.data)
      handleMessage(data)
    } catch (e) {
      console.warn('[WS] 消息解析失败:', e)
    }
  }

  ws.onclose = (event) => {
    console.log('[WS] 已断开:', event.code, event.reason)
    chatStore.wsConnected = false
    chatStore.wsConnecting = false
    stopHealthCheck()

    if (!manualDisconnect) {
      scheduleReconnect()
    }
  }

  ws.onerror = () => {
    console.warn('[WS] 连接错误')
  }
}

// ---- 断开（模块级） ----

function disconnect() {
  manualDisconnect = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  stopHealthCheck()
  if (ws) {
    ws.close()
    ws = null
    const chatStore = useChatStore()
    chatStore.wsConnected = false
    chatStore.wsConnecting = false
  }
}

// ======================== WebSocket Composable ========================

export function useWebSocket() {
  const authStore = useAuthStore()
  const chatStore = useChatStore()

  // 引用计数：第一个组件调用时 refCount++，最后一个组件卸载时清理
  refCount++

  // ---- 发送函数（委托给模块级 sendJson） ----

  function sendChatMessage(text: string, roomId: string, elements?: MessageElement[]) {
    const payload: any = { type: 'chat_message', room_id: roomId }
    if (elements && elements.length > 0) {
      payload.elements = elements
    } else {
      payload.content = text
    }
    return sendJson(payload)
  }

  function createRoom(name: string, password?: string) {
    const payload: any = { type: 'room_create', name }
    if (password) payload.password = password
    return sendJson(payload)
  }

  function joinRoom(roomId: string, password?: string) {
    const payload: any = { type: 'room_join', room_id: roomId }
    if (password) payload.password = password
    return sendJson(payload)
  }

  function leaveRoom(roomId: string) {
    return sendJson({ type: 'room_leave', room_id: roomId })
  }

  function recallMessage(roomId: string, msgId: string) {
    return sendJson({ type: 'chat_recall', room_id: roomId, message_id: msgId })
  }

  function editMessage(roomId: string, msgId: string, elements: MessageElement[]) {
    return sendJson({ type: 'chat_edit', room_id: roomId, message_id: msgId, elements })
  }

  function dissolveRoom(roomId: string) {
    return sendJson({ type: 'room_dissolve', room_id: roomId })
  }

  function kickMember(roomId: string, targetUserId: string) {
    return sendJson({ type: 'room_kick', room_id: roomId, target_user_id: targetUserId })
  }

  function muteMember(roomId: string, targetUserId: string) {
    return sendJson({ type: 'room_mute', room_id: roomId, target_user_id: targetUserId })
  }

  function unmuteMember(roomId: string, targetUserId: string) {
    return sendJson({ type: 'room_unmute', room_id: roomId, target_user_id: targetUserId })
  }

  function announceRoom(roomId: string, content: string) {
    return sendJson({ type: 'room_announce', room_id: roomId, content })
  }

  function promoteMember(roomId: string, targetUserId: string) {
    return sendJson({ type: 'room_promote', room_id: roomId, target_user_id: targetUserId })
  }

  function demoteMember(roomId: string, targetUserId: string) {
    return sendJson({ type: 'room_demote', room_id: roomId, target_user_id: targetUserId })
  }

  /** 受邀人回复邀请（接受/拒绝），invite_id 为数字，accept 替代旧字段 approve */
  function inviteReply(roomId: string, inviteId: string, accept: boolean) {
    return sendJson({ type: 'room_invite_reply', room_id: roomId, invite_id: Number(inviteId), accept })
  }

  function deleteMessage(roomId: string, msgId: string) {
    return sendJson({ type: 'chat_delete', room_id: roomId, message_id: msgId })
  }

  /** 发送事件确认（event_ack），用于新事件系统的通知确认 */
  function sendEventAck(eventId: string) {
    return sendJson({ type: 'event_ack', event_id: eventId })
  }

  /** 已读回执 (v2.2)：标记本人对该保证送达消息（公告/@全体/@单个）已读，停止重发 */
  function sendMessageRead(messageId: string, roomId: string) {
    return sendJson({ type: 'message_read', message_id: messageId, room_id: roomId })
  }

  // ---- 清理（仅当最后一个组件卸载时断开） ----
  onUnmounted(() => {
    refCount--
    if (refCount <= 0) {
      refCount = 0
      disconnect()
    }
  })

  return {
    connect,
    disconnect,
    sendJson,
    sendChatMessage,
    createRoom,
    joinRoom,
    leaveRoom,
    recallMessage,
    editMessage,
    dissolveRoom,
    kickMember,
    muteMember,
    unmuteMember,
    announceRoom,
    promoteMember,
    demoteMember,
    inviteReply,
    deleteMessage,
    sendEventAck,
    sendMessageRead,
  }
}
