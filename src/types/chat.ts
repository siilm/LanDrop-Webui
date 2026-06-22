// ======================== 消息元素 ========================

export interface TextElement {
  type: 'text'
  content: string
}

export interface ImageElement {
  type: 'image'
  file_id: string
  file_name?: string
  file_size?: number
}

export interface FileElement {
  type: 'file'
  file_id: string
  file_name: string
  file_size: number
  mime_type?: string
}

export interface ReplyElement {
  type: 'reply'
  message_id: string
  preview?: string | { from: string; text: string }
}

/** @提及元素 (v2.2)：user_id="ALL" 为@全体（需 role≥1），否则为@单个成员 */
export interface MentionElement {
  type: 'mention'
  user_id: string
}

export interface PictureElement {
  type: 'picture'
  file_id: string
  file_name?: string
  file_size?: number
}

export type MessageElement = TextElement | ImageElement | FileElement | ReplyElement | PictureElement | MentionElement

// ======================== 消息 ========================

export interface ChatMessage {
  message_id: string
  from: string
  display_name?: string
  elements?: MessageElement[]
  content?: string
  file?: {
    file_id: string
    file_name: string
    file_size: string
    mime_type?: string
  }
  timestamp: number
  created_at?: number
  status?: string
  room_id?: string
  /** 消息类型：'announce' 为公告（特殊卡片渲染 + 顶栏悬浮展示）；其余为普通消息 (v2.5) */
  msg_type?: string
}

/** 客户端本地扩展的消息状态 */
export interface ClientMessage extends ChatMessage {
  _status?: 'sending' | 'sent' | 'failed'
  _clientId?: string
}

// ======================== 房间 & 成员 ========================

export interface RoomInfo {
  roomId: string
  roomName: string
  memberCount?: number
  hasPassword?: boolean
}

export interface RoomMember {
  user_id: string
  username?: string
  display_name?: string
  role: string
  muted?: boolean
  avatar_url?: string
}

export interface UserInfo {
  userId: string
  username?: string
  displayName?: string
  isOnline?: boolean
}

export interface JoinRequestRecord {
  id: string
  room_id: string
  applicant_id: string
  message?: string
  status?: string       // pending | approved | rejected
  applied_at?: string
  expires_at?: string
}

export interface RoomFileItem {
  file_id: string
  file_name: string
  file_size: string
  mime_type?: string
  uploaded_by?: string
  uploaded_at?: string
}

export interface InviteRecord {
  id: string
  room_id: string
  inviter_id?: string
  invitee_id: string
  status?: string       // pending | approved | rejected
  requested_at?: string
  expires_at?: string
}

// ======================== 认证 ========================

export interface LoginChallenge {
  temp_session_id: string
  challenge: string
}

export interface VerifyRequest {
  temp_session_id: string
  user_id: string
  signature: string
}

export interface LoginVerifyResponse {
  access_token: string
  refresh_token: string
  expires_in: string
  refresh_expires_in: string
  user_id: string
  username: string
  global_role: string
}

export interface RegisterResponse {
  user_id: string
  private_key_pem: string
  public_key_der_b64: string
  status: string
}

// ======================== WebSocket 帧 ========================

export interface WsIncomingBase {
  type: string
  message_id?: string
}

export interface WsAck extends WsIncomingBase {
  type: 'ack'
  status: string
  ref_message_id?: string
}

export interface WsPing extends WsIncomingBase {
  type: 'ping'
}

export interface WsRoomList extends WsIncomingBase {
  type: 'room_list'
  rooms: RoomInfo[]
}

export interface WsRoomCreated extends WsIncomingBase {
  type: 'room_created'
  room_id: string
  name: string
  room_type?: number
}

export interface WsRoomJoined extends WsIncomingBase {
  type: 'room_joined'
  room_id: string
  name: string
}

export interface WsRoomLeft extends WsIncomingBase {
  type: 'room_left'
  room_id: string
}

export interface WsRoomDestroyed extends WsIncomingBase {
  type: 'room_destroyed'
  room_id: string
}

/** @提及推送 (v2.2) — 服务端下行，结构和 chat_message 一致，type="mention" */
export interface WsMention extends WsIncomingBase {
  type: 'mention'
  message_id: string
  from: string
  display_name?: string
  elements?: MessageElement[]
  content?: string
  timestamp: number
  room_id: string
}

/** 公告推送 (v2.2) — 服务端下行，结构和 chat_message 一致，type="announce" */
export interface WsAnnounce extends WsIncomingBase {
  type: 'announce'
  message_id: string
  from: string
  display_name?: string
  elements?: MessageElement[]
  content?: string
  timestamp: number
  room_id: string
}

/** 已读回执入站帧 (v2.2) — 客户端→服务端 */
export interface WsMessageRead {
  type: 'message_read'
  message_id: string
  room_id: string
}

export interface WsChatMessage extends WsIncomingBase {
  type: 'chat_message'
  message_id: string
  from: string
  display_name?: string
  elements?: MessageElement[]
  content?: string
  file?: {
    file_id: string
    file_name: string
    file_size: string
    mime_type?: string
  }
  timestamp: number
  room_id: string
}

export interface WsChatRecall extends WsIncomingBase {
  type: 'chat_recall'
  message_id: string
  room_id: string
}

export interface WsChatEditOutbound extends WsIncomingBase {
  type: 'chat_edit'
  message_id: string
  elements: string // JSON 字符串，需 parse
  room_id: string
}

export interface WsChatDelete extends WsIncomingBase {
  type: 'chat_delete'
  message_id: string
  room_id: string
}

export interface WsRoomDissolve extends WsIncomingBase {
  type: 'room_dissolve'
  room_id: string
}

export interface WsRoomKick extends WsIncomingBase {
  type: 'room_kick'
  room_id: string
  target_user_id: string
}

export interface WsRoomMute extends WsIncomingBase {
  type: 'room_mute'
  room_id: string
  target_user_id: string
}

export interface WsRoomUnmute extends WsIncomingBase {
  type: 'room_unmute'
  room_id: string
  target_user_id: string
}

export interface WsRoomAnnounce extends WsIncomingBase {
  type: 'room_announce'
  room_id: string
  content: string
}

export interface WsJoinRequest extends WsIncomingBase {
  type: 'join_request'
  event_id: string
  room_id: string
  applicant_id: string
}

export interface WsInviteNotify extends WsIncomingBase {
  type: 'invite_notify'
  event_id: string
  room_id: string
  inviter_id: string
}

export interface WsInviteResult extends WsIncomingBase {
  type: 'invite_result'
  room_id: string
  action: 'approved' | 'rejected'
  by: string
}

export interface WsJoinRequestHandled extends WsIncomingBase {
  type: 'join_request_handled'
  room_id: string
  action: 'approved' | 'rejected'
  by: string
}

export interface WsRoomInvite extends WsIncomingBase {
  type: 'room_invite'
  room_id: string
  invitee_ids: string[]
}

export interface WsRoomInviteReply extends WsIncomingBase {
  type: 'room_invite_reply'
  room_id: string
  invite_id: string
  approve: boolean
}

// ---- 服务端推送事件 ----

export interface WsMemberKicked extends WsIncomingBase {
  type: 'room_member_kicked'
  room_id: string
  target_user_id: string
  by_user_id: string
}

export interface WsMemberMuted extends WsIncomingBase {
  type: 'room_member_muted'
  room_id: string
  target_user_id: string
  muted: boolean
}

export interface WsAnnouncement extends WsIncomingBase {
  type: 'room_announcement'
  room_id: string
  content: string
  by_user_id?: string
}

export interface WsInviteNotification extends WsIncomingBase {
  type: 'room_invited'
  room_id: string
  invite_id: string
  inviter_id: string
  expires_at: string
}

/** 兼容别名：invite_notify 也可使用，推荐统一使用 invite_notify */
export interface WsInviteNotifyEvent extends WsIncomingBase {
  type: 'invite_notify'
  event_id: string
  room_id: string
  inviter_id: string
  invite_id?: string
}

export interface WsInvitePending extends WsIncomingBase {
  type: 'room_invite_pending'
  room_id: string
  invite_id: string
  inviter_id: string
  invitee_id: string
}

/** @deprecated 旧版邀请结果通知，使用 WsInviteResult (type: 'invite_result') 替代 */
export interface WsRoomInviteResult extends WsIncomingBase {
  type: 'room_invite_result'
  room_id: string
  invite_id: string
  invitee_id: string
  approved: boolean
}

export interface WsMemberChanged extends WsIncomingBase {
  type: 'room_member_changed'
  room_id: string
  user_id: string
  role?: string
  display_name?: string
  avatar_url?: string
}

export interface WsPromote extends WsIncomingBase {
  type: 'room_promote'
  room_id: string
  target_user_id: string
  new_role: string
}

export interface WsDemote extends WsIncomingBase {
  type: 'room_demote'
  room_id: string
  target_user_id: string
  new_role: string
}

export interface WsEventConfirm extends WsIncomingBase {
  type: 'event_confirm'
  event_type: string
  status: string
}

export interface WsEventReject extends WsIncomingBase {
  type: 'event_reject'
  event_type: string
  reason: string
}

export interface WsFileRef extends WsIncomingBase {
  type: 'file'
  file_id: string
  room_id: string
  message_id: string
}

export type WsIncomingMessage =
  | WsAck
  | WsPing
  | WsRoomList
  | WsRoomCreated
  | WsRoomJoined
  | WsRoomLeft
  | WsRoomDestroyed
  | WsChatMessage
  | WsChatRecall
  | WsChatEditOutbound
  | WsChatDelete
  | WsMention
  | WsAnnounce
  | WsMemberKicked
  | WsMemberMuted
  | WsAnnouncement
  | WsInviteNotification
  | WsInvitePending
  | WsRoomInviteResult
  | WsMemberChanged
  | WsPromote
  | WsDemote
  | WsEventConfirm
  | WsEventReject
  | WsFileRef
  | WsJoinRequest
  | WsInviteNotify
  | WsInviteResult
  | WsJoinRequestHandled
  | (WsIncomingBase & Record<string, unknown>)

// ======================== 角色枚举 ========================

export const RoleValue = {
  Muted: -1,
  Member: 0,
  Admin: 1,
  Creator: 2,
} as const

export type RoleType = (typeof RoleValue)[keyof typeof RoleValue]
