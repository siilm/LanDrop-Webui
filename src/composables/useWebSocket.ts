import { ref, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import type {
  RoomInfo,
  MessageElement,
  WsIncomingMessage,
  WsChatMessage,
  WsChatEditOutbound,
} from '@/types/chat'

function getWsUrl(): string {
  const store = useAuthStore()
  if (store.wsUrl) {
    // 用户自定义 WebSocket 地址（生产环境）
    let url = store.wsUrl.replace(/\/+$/, '')
    return url
  }
  // 开发模式：通过 Vite 代理连接，自动适配当前主机
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
// 提供 reactive 事件发射/监听机制

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

// ======================== WebSocket Composable ========================

export function useWebSocket() {
  const authStore = useAuthStore()
  const chatStore = useChatStore()

  let ws: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let healthTimer: ReturnType<typeof setInterval> | null = null
  let lastMessageTime = 0
  let manualDisconnect = false

  const MAX_RECONNECT_DELAY = 30000
  let reconnectAttempts = 0

  // ---- 心跳检测 ----
  function startHealthCheck() {
    stopHealthCheck()
    healthTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        // 40 秒无消息标记断开
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

  // ---- 发送 ----
  function sendJson(obj: any) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj))
      return true
    }
    return false
  }

  // ---- token 变化时重连 ----
  let lastToken = ''

  // ---- 连接 ----
  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      // token 已刷新，主动重连
      if (lastToken && lastToken !== authStore.accessToken) {
        manualDisconnect = false
        ws.close()
        // 继续执行下方创建新连接
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
      // 能收到消息说明 WebSocket 已连接，确保状态准确
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

  function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectAttempts++
    const delay = Math.min(5000 * Math.pow(1.5, reconnectAttempts - 1), MAX_RECONNECT_DELAY)
    console.log(`[WS] ${delay / 1000}s 后重连 (第 ${reconnectAttempts} 次)`)
    // 重连等待期间显示"连接中..."而非"未连接"
    chatStore.wsConnecting = true
    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  // ---- 消息处理 ----
  function handleMessage(data: any) {
    // 统一时间戳
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
        // 回复 ack 确认
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
        const msg = data as WsChatMessage
        // 先尝试匹配本地乐观消息
        const matched = chatStore.confirmByEcho({
          message_id: msg.message_id,
          from: msg.from,
          display_name: msg.display_name,
          elements: msg.elements,
          content: msg.content,
          file: msg.file,
          timestamp: msg.timestamp,
          room_id: msg.room_id,
        })
        if (!matched) {
          chatStore.pushMessage({
            message_id: msg.message_id,
            from: msg.from,
            display_name: msg.display_name,
            elements: msg.elements,
            content: msg.content,
            file: msg.file,
            timestamp: msg.timestamp,
            room_id: msg.room_id,
          })
        }
        // 回复 ack
        sendJson({ type: 'ack', message_id: msg.message_id, status: 'ok' })
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
          // 出站帧 elements 是 JSON 字符串
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

      // ---- 新事件系统通知（v1.5+）— 通过事件总线通知组件 ----
      case 'join_request': {
        emitWsEvent(data.type, data)
        if (data.message_id) {
          sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
        }
        break
      }

      case 'invite_notify': {
        // 通知组件（仅 member 邀请时触发，admin 邀请直接加入）
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

      // ---- 房间事件 → 通过事件总线通知组件 ----
      case 'room_member_kicked':
      case 'room_member_muted':
      case 'room_announcement':
      case 'room_member_changed':
      case 'room_promote':
      case 'room_demote': {
        emitWsEvent(data.type, data)
        // 回复 ack
        if (data.message_id) {
          sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
        }
        break
      }

      case 'file': {
        // 文件引用事件
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

      default: {
        // 未知帧类型，回复 ack
        if (data.message_id) {
          sendJson({ type: 'ack', message_id: data.message_id, status: 'ok' })
        }
      }
    }
  }

  // ---- 发送函数 ----

  function sendChatMessage(text: string, roomId: string, elements?: MessageElement[]) {
    const payload: any = { type: 'chat_message', room_id: roomId }
    if (elements && elements.length > 0) {
      // 有 elements 时不再单独发送 content，强制服务端广播 elements 给全部客户端
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

  /** 受邀人回复邀请（接受/拒绝） */
  function inviteReply(roomId: string, inviteId: string, approve: boolean) {
    return sendJson({ type: 'room_invite_reply', room_id: roomId, invite_id: inviteId, approve })
  }

  function deleteMessage(roomId: string, msgId: string) {
    return sendJson({ type: 'chat_delete', room_id: roomId, message_id: msgId })
  }

  /** 发送事件确认（event_ack），用于新事件系统的通知确认 */
  function sendEventAck(eventId: string) {
    return sendJson({ type: 'event_ack', event_id: eventId })
  }

  // ---- 断开 ----
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
      // 只有确实持有连接的实例才能清除连接状态
      chatStore.wsConnected = false
      chatStore.wsConnecting = false
    }
    // 如果 ws 为 null 则不清除 store 状态
    // 避免未调用 connect() 的实例（如 ManagePanel）在 unmount 时误重置连接状态
  }

  // ---- 清理（组件卸载时） ----
  onUnmounted(() => {
    disconnect()
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
  }
}
