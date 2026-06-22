import { useAuthStore } from '@/stores/auth'
import { fileBlobCache } from '@/utils/BlobCache'
import type {
  LoginChallenge,
  LoginVerifyResponse,
  RegisterResponse,
  RoomInfo,
  RoomMember,
  ChatMessage,
  RoomFileItem,
  InviteRecord,
  JoinRequestRecord,
  MessageElement,
} from '@/types/chat'

// ======================== 基础 ========================

export function getBaseUrl(): string {
  const store = useAuthStore()
  if (store.serverUrl) {
    // 用户自定义服务器地址：直接请求（生产环境）
    let url = store.serverUrl.replace(/\/+$/, '')
    if (!url.endsWith('/api')) url += '/api'
    return url
  }
  // 使用 Vite 开发代理，/api 路径由 Vite proxy 转发到后端
  return '/api'
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const store = useAuthStore()
  const baseUrl = getBaseUrl()
  const url = `${baseUrl}${path}`
  const bodyPreview = typeof options.body === 'string' ? options.body.substring(0, 120) : ''
  console.log('[API]', options.method || 'GET', url, bodyPreview || '')

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  // 自动添加 JWT，除非 headers 中有 noAuth
  if (!headers['Authorization'] && !(options.headers as any)?.noAuth) {
    if (store.accessToken) {
      headers['Authorization'] = `Bearer ${store.accessToken}`
    }
  }

  // 非 FormData 时自动添加 Content-Type
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const resp = await fetch(url, {
    ...options,
    headers,
  })

  if (!resp.ok) {
    let errorText = ''
    try {
      const err = await resp.json()
      errorText = err.detail || err.message || err.error || JSON.stringify(err)
    } catch {
      errorText = resp.statusText || `HTTP ${resp.status}`
    }
    throw new Error(errorText)
  }

  // 204 No Content
  if (resp.status === 204) return {} as T

  return resp.json()
}

// ======================== 认证 ========================

export async function register(username: string, userId?: string): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, user_id: userId }),
    headers: { noAuth: 'true' } as any,
  })
}

/** 管理员添加用户（携带 JWT 认证，用于系统管理面板） */
export async function adminRegister(username: string, userId?: string): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, user_id: userId }),
  })
}

export async function loginChallenge(userId: string, deviceInfo?: string): Promise<LoginChallenge> {
  return apiFetch<LoginChallenge>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, device_info: deviceInfo || '' }),
    headers: { noAuth: 'true' } as any,
  })
}

export async function loginVerify(tempSessionId: string, signature: string, deviceInfo?: string): Promise<LoginVerifyResponse> {
  return apiFetch<LoginVerifyResponse>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ temp_session_id: tempSessionId, signature, device_info: deviceInfo || '' }),
    headers: { noAuth: 'true' } as any,
  })
}

export async function refreshTokenApi(refreshToken: string): Promise<{ access_token: string; expires_in: string }> {
  return apiFetch<{ access_token: string; expires_in: string }>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: { noAuth: 'true' } as any,
  })
}

export async function logout(sessionId?: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export async function renameUsername(newUsername: string): Promise<{ username: string }> {
  return apiFetch<{ username: string }>('/auth/rename_username', {
    method: 'PUT',
    body: JSON.stringify({ new_username: newUsername }),
  })
}

export async function whoami(): Promise<{
  user_id: string
  username: string
  global_role: string
  avatar_url?: string
}> {
  return apiFetch('/auth/whoami')
}

export async function uploadAvatar(file: File): Promise<{ success: boolean; avatar_url: string }> {
  const formData = new FormData()
  formData.append('file', file)
  return apiFetch<{ success: boolean; avatar_url: string }>('/auth/avatar', {
    method: 'PUT',
    body: formData,
  })
}

// ======================== 房间 ========================

export async function fetchMyRooms(): Promise<{ rooms: RoomInfo[] }> {
  const raw = await apiFetch<{ rooms: any[] }>('/rooms/mine')
  return {
    rooms: (raw.rooms || []).map((r: any) => ({
      roomId: r.room_id || r.roomId || '',
      roomName: r.name || r.roomName || '',
      memberCount: r.member_count ?? r.memberCount,
      hasPassword: r.has_password ?? r.hasPassword,
    })),
  }
}

export async function fetchAllRooms(): Promise<{ rooms: RoomInfo[] }> {
  const raw = await apiFetch<{ rooms: any[] }>('/rooms/all')
  return {
    rooms: (raw.rooms || []).map((r: any) => ({
      roomId: r.room_id || r.roomId || '',
      roomName: r.name || r.roomName || '',
      memberCount: r.member_count ?? r.memberCount,
      hasPassword: r.has_password ?? r.hasPassword,
    })),
  }
}

export async function createRoom(name: string, room_type?: number): Promise<{ room_id: string; name: string }> {
  return apiFetch<{ room_id: string; name: string }>('/rooms/create', {
    method: 'POST',
    body: JSON.stringify({ name, room_type }),
  })
}

export async function joinRoom(roomId: string, message?: string): Promise<{ status: string; room_id: string }> {
  return apiFetch<{ status: string; room_id: string }>(`/rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export async function updateRoomDisplayName(
  roomId: string,
  displayName: string,
): Promise<{ success: boolean; display_name: string }> {
  return apiFetch<{ success: boolean; display_name: string }>(`/rooms/${roomId}/display_name`, {
    method: 'PUT',
    body: JSON.stringify({ display_name: displayName }),
  })
}

export async function setMemberDisplayName(
  roomId: string,
  userId: string,
  displayName: string,
): Promise<{ success: boolean; display_name: string }> {
  return apiFetch<{ success: boolean; display_name: string }>(`/rooms/${roomId}/members/${userId}/display_name`, {
    method: 'PUT',
    body: JSON.stringify({ display_name: displayName }),
  })
}

// ======================== 房间 · 成员 ========================

export async function fetchRoomMembers(roomId: string): Promise<RoomMember[]> {
  // API 返回 { room_id, count, members: RoomMember[] }
  const res = await apiFetch<{ room_id: string; count: number; members: RoomMember[] }>(`/rooms/${roomId}/members`)
  return res.members || []
}

export async function kickMember(roomId: string, userId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/members/${userId}`, {
    method: 'DELETE',
  })
}

export async function muteMember(roomId: string, userId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/members/${userId}/mute`, {
    method: 'PUT',
  })
}

export async function unmuteMember(roomId: string, userId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/members/${userId}/mute`, {
    method: 'DELETE',
  })
}

// ======================== 房间 · 加入申请 ========================

export async function fetchJoinRequests(roomId: string): Promise<JoinRequestRecord[]> {
  return apiFetch<JoinRequestRecord[]>(`/rooms/${roomId}/join-requests`)
}

export async function fetchMyJoinRequests(): Promise<JoinRequestRecord[]> {
  return apiFetch<JoinRequestRecord[]>('/rooms/join-requests/mine')
}

export async function approveJoinRequest(roomId: string, requestId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/join-requests/${requestId}/approve`, {
    method: 'PUT',
  })
}

export async function rejectJoinRequest(roomId: string, requestId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/join-requests/${requestId}/reject`, {
    method: 'PUT',
  })
}

/**
 * 晋升 room 管理员（HTTP，非 public_admin）
 * PUT /api/rooms/{roomId}/members/{userId}/promote
 */
export async function promoteMember(roomId: string, userId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/members/${userId}/promote`, {
    method: 'PUT',
  })
}

/**
 * 降级 room 管理员
 * PUT /api/rooms/{roomId}/members/{userId}/demote
 */
export async function demoteMember(roomId: string, userId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/members/${userId}/demote`, {
    method: 'PUT',
  })
}

// ======================== 房间 · 消息 ========================

export async function fetchRoomMessages(
  roomId: string,
  before?: number,
  limit?: number,
): Promise<{ messages: ChatMessage[] }> {
  const params = new URLSearchParams()
  if (before != null) params.set('before', String(before))
  if (limit != null) params.set('limit', String(limit))
  const qs = params.toString()
  const path = qs ? `/rooms/${roomId}/messages?${qs}` : `/rooms/${roomId}/messages`
  const res = await apiFetch<{ messages: ChatMessage[] }>(path)
  // 归一化：历史项的 type=announce → msg_type；created_at → timestamp
  const messages = (res.messages || []).map((m: any) => ({
    ...m,
    msg_type: m.msg_type || (m.type === 'announce' ? 'announce' : undefined),
    timestamp: m.timestamp != null ? Number(m.timestamp) : (m.created_at != null ? Number(m.created_at) : Date.now()),
  }))
  return { messages }
}

export async function deleteMessage(messageId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/messages/${messageId}`, {
    method: 'DELETE',
  })
}

export async function editMessageApi(
  messageId: string,
  elements: MessageElement[],
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/messages/${messageId}`, {
    method: 'PUT',
    body: JSON.stringify({ elements }),
  })
}

// ======================== 房间 · 管理 ========================

export async function dissolveRoom(roomId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}`, {
    method: 'DELETE',
  })
}

export async function forceJoinRoom(roomId: string): Promise<{ room_id: string }> {
  return apiFetch<{ room_id: string }>(`/rooms/${roomId}/force-join`, {
    method: 'POST',
  })
}

export async function publishAnnounce(roomId: string, content: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/announce`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

// ======================== 房间 · 邀请 ========================

export async function inviteUsers(roomId: string, userIds: string[]): Promise<{ invites: { user_id: string; status: string }[] }> {
  return apiFetch<{ invites: { user_id: string; status: string }[] }>(`/rooms/${roomId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  })
}

/** 待审批邀请列表（管理员视图）— 新 API 返回直接数组 */
export async function fetchPendingInvites(roomId: string): Promise<InviteRecord[]> {
  return apiFetch<InviteRecord[]>(`/rooms/${roomId}/invites`)
}

/** 查看我发出的邀请（邀请人主动查询） */
export async function fetchInvitesMine(): Promise<InviteRecord[]> {
  return apiFetch<InviteRecord[]>('/rooms/invites/mine')
}

export async function approveInvite(
  roomId: string,
  inviteId: string,
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/invites/${inviteId}/approve`, {
    method: 'PUT',
  })
}

export async function rejectInvite(
  roomId: string,
  inviteId: string,
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/invites/${inviteId}/reject`, {
    method: 'PUT',
  })
}

/**
 * 获取当前用户收到的待处理邀请列表
 * GET /api/rooms/invites/to-me
 * 自动携带 Bearer access_token
 */
export async function fetchInvitesToMe(): Promise<InviteRecord[]> {
  return apiFetch<InviteRecord[]>('/rooms/invites/to-me')
}

// ======================== 文件 ========================

export async function uploadFile(
  file: File,
  roomId?: string,
): Promise<{ file_id: string; file_name: string; file_size: string; status: string }> {
  const formData = new FormData()
  formData.append('file', file)
  if (roomId) formData.append('room_id', roomId)
  return apiFetch('/files/upload', {
    method: 'POST',
    body: formData,
  })
}

export async function checkFileExists(params: {
  file_name: string
  file_size: number
  sha256: string
}): Promise<{ exists: boolean; file_id?: string }> {
  return apiFetch<{ exists: boolean; file_id?: string }>('/files/check', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function verifyFileChunks(params: {
  file_id: string
  sha256: string
  file_name: string
  file_size: number
  head_chunk_sha256: string
  tail_chunk_sha256: string
}): Promise<{ verified: boolean; file_id?: string }> {
  return apiFetch<{ verified: boolean; file_id?: string }>('/files/verify', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export async function fetchRoomFiles(roomId: string): Promise<{ files: RoomFileItem[] }> {
  return apiFetch<{ files: RoomFileItem[] }>(`/rooms/${roomId}/files`)
}

export async function deleteRoomFile(roomId: string, fileId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/rooms/${roomId}/files/${fileId}`, {
    method: 'DELETE',
  })
}

export async function uploadRoomImage(
  roomId: string,
  file: File,
): Promise<{ success: boolean; avatar_url: string }> {
  const formData = new FormData()
  formData.append('file', file, file.name)
  return apiFetch<{ success: boolean; avatar_url: string }>(`/rooms/${roomId}/images`, {
    method: 'PUT',
    body: formData,
  })
}

// ======================== 管理员 ========================

export async function fetchPublicAdmins(): Promise<{ user_id: string; username: string }[]> {
  return apiFetch<{ user_id: string; username: string }[]>('/public_admins')
}

export async function appointPublicAdmin(userId: string): Promise<{ status: string; user_id: string }> {
  return apiFetch<{ status: string; user_id: string }>('/public_admins', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}

export async function removePublicAdmin(userId: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(`/public_admins/${userId}`, {
    method: 'DELETE',
  })
}

// ======================== 文件下载（带 JWT 鉴权） ========================

/**
 * 通过 JWT fetch 获取文件/图片的 blob URL（绕过 <img> 无法携带 Authorization header 的限制）
 * 优先读取 BlobCache，未命中时发起认证请求并缓存结果
 */
export async function fetchFileBlob(fileId: string, roomId?: string): Promise<string | null> {
  const cached = fileBlobCache.get(fileId)
  if (cached) return cached

  const authStore = useAuthStore()
  const base = getBaseUrl().replace(/\/api\/?$/, '')
  const rid = roomId || ''
  const url = `${base}/api/getfiles/${rid}/${fileId}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    })
    if (!res.ok) {
      console.warn(`[fetchFileBlob] 获取失败 (${fileId}):`, res.status)
      return null
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    fileBlobCache.setPersistent(fileId, blobUrl, blob)
    return blobUrl
  } catch (err) {
    console.warn(`[fetchFileBlob] 异常 (${fileId}):`, err)
    return null
  }
}

/**
 * 通过 JWT 下载文件到本地（触发浏览器下载）
 */
export async function downloadFileViaJwt(fileId: string, fileName?: string, roomId?: string) {
  const authStore = useAuthStore()
  const base = getBaseUrl().replace(/\/api\/?$/, '')
  const rid = roomId || ''
  const url = `${base}/api/getfiles/${rid}/${fileId}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${authStore.accessToken}` },
    })
    if (!res.ok) {
      console.warn(`[downloadFileViaJwt] 下载失败 (${fileId}):`, res.status)
      return
    }
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = fileName || fileId
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (err) {
    console.warn(`[downloadFileViaJwt] 异常 (${fileId}):`, err)
  }
}

// ======================== 工具 ========================

export async function computeFileSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function computeChunkSha256(file: File, start: number, end: number): Promise<string> {
  const blob = file.slice(start, end)
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
