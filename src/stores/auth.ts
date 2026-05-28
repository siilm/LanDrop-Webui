import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { LoginVerifyResponse } from '@/types/chat'
import { avatarBlobCache } from '@/utils/BlobCache'
import { getBaseUrl, refreshTokenApi } from '@/composables/useApi'

const STORAGE_KEY_TOKEN = 'landrop_access_token'
const STORAGE_KEY_REFRESH = 'landrop_refresh_token'
const STORAGE_KEY_USER_ID = 'landrop_user_id'
const STORAGE_KEY_USERNAME = 'landrop_username'
const STORAGE_KEY_GLOBAL_ROLE = 'landrop_global_role'
const STORAGE_KEY_AVATAR_URL = 'landrop_avatar_url'
const STORAGE_KEY_SERVER_URL = 'landrop_server_url'
const STORAGE_KEY_WS_URL = 'landrop_ws_url'

function isHttpUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://')
}

export const useAuthStore = defineStore('auth', () => {
  // ---- 持久化状态 ----
  const accessToken = ref(localStorage.getItem(STORAGE_KEY_TOKEN) || '')
  const refreshToken = ref(localStorage.getItem(STORAGE_KEY_REFRESH) || '')
  const userId = ref(localStorage.getItem(STORAGE_KEY_USER_ID) || '')
  const username = ref(localStorage.getItem(STORAGE_KEY_USERNAME) || '')
  const globalRole = ref(localStorage.getItem(STORAGE_KEY_GLOBAL_ROLE) || 'member')
  const avatarUrl = ref(localStorage.getItem(STORAGE_KEY_AVATAR_URL) || '')
  const serverUrl = ref(localStorage.getItem(STORAGE_KEY_SERVER_URL) || '')
  const wsUrl = ref(localStorage.getItem(STORAGE_KEY_WS_URL) || '')

  // ---- 运行时状态 ----
  const avatarSrc = ref('')
  let refreshTimer: ReturnType<typeof setInterval> | null = null

  // ---- 计算属性 ----
  const isLoggedIn = computed(() => !!accessToken.value)

  const avatarDisplaySrc = computed(() => {
    if (avatarSrc.value) return avatarSrc.value
    if (avatarUrl.value && isHttpUrl(avatarUrl.value)) return avatarUrl.value
    return ''
  })

  // ---- Token 刷新定时器 ----
  async function scheduleTokenRefresh() {
    stopTokenRefresh()
    refreshTimer = setInterval(async () => {
      try {
        const res = await refreshTokenApi(refreshToken.value)
        accessToken.value = res.access_token
        localStorage.setItem(STORAGE_KEY_TOKEN, res.access_token)
      } catch {
        console.warn('[Auth] Token 刷新失败')
      }
    }, 10 * 60 * 1000) // 10 分钟
  }

  function stopTokenRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  // ---- 核心方法 ----
  function setAuth(data: LoginVerifyResponse) {
    accessToken.value = data.access_token
    refreshToken.value = data.refresh_token
    userId.value = data.user_id
    username.value = data.username
    globalRole.value = data.global_role

    localStorage.setItem(STORAGE_KEY_TOKEN, data.access_token)
    localStorage.setItem(STORAGE_KEY_REFRESH, data.refresh_token)
    localStorage.setItem(STORAGE_KEY_USER_ID, data.user_id)
    localStorage.setItem(STORAGE_KEY_USERNAME, data.username)
    localStorage.setItem(STORAGE_KEY_GLOBAL_ROLE, data.global_role)

    scheduleTokenRefresh()
    tryFetchOwnAvatar()
  }

  function updateUsername(newUsername: string) {
    username.value = newUsername
    localStorage.setItem(STORAGE_KEY_USERNAME, newUsername)
  }

  function resolveAvatarUrl(path: string): string {
    if (!path) return ''
    if (path.startsWith('http://') || path.startsWith('https://')) return path
    const base = getBaseUrl().replace(/\/api\/?$/, '')
    return `${base}${path.startsWith('/') ? '' : '/'}${path}`
  }

  async function fetchAvatar() {
    if (!avatarUrl.value) return
    const url = resolveAvatarUrl(avatarUrl.value)
    if (isHttpUrl(avatarUrl.value)) {
      avatarSrc.value = avatarUrl.value
      return
    }
    // 从缓存获取
    const cached = avatarBlobCache.get(userId.value)
    if (cached) {
      avatarSrc.value = cached
      return
    }
    try {
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken.value}` },
      })
      if (!resp.ok) return
      const blob = await resp.blob()
      const blobUrl = URL.createObjectURL(blob)
      avatarBlobCache.setPersistent(userId.value, blobUrl, blob)
      avatarSrc.value = blobUrl
    } catch {
      console.warn('[Auth] 获取头像失败')
    }
  }

  async function tryFetchOwnAvatar() {
    const testUrl = `/api/getfiles/avatar/${userId.value}`
    const fullUrl = resolveAvatarUrl(testUrl)
    try {
      const resp = await fetch(fullUrl, {
        headers: { Authorization: `Bearer ${accessToken.value}` },
      })
      if (resp.ok) {
        avatarUrl.value = testUrl
        localStorage.setItem(STORAGE_KEY_AVATAR_URL, testUrl)
        const blob = await resp.blob()
        const blobUrl = URL.createObjectURL(blob)
        avatarBlobCache.setPersistent(userId.value, blobUrl, blob)
        avatarSrc.value = blobUrl
      }
    } catch {
      // 没有头像，使用默认
    }
  }

  function updateAvatarUrl(path: string) {
    avatarUrl.value = path
    localStorage.setItem(STORAGE_KEY_AVATAR_URL, path)
    fetchAvatar()
  }

  function setServerUrls(httpUrl: string, wsUrlVal: string, persist = true) {
    serverUrl.value = httpUrl
    wsUrl.value = wsUrlVal
    if (persist) {
      localStorage.setItem(STORAGE_KEY_SERVER_URL, httpUrl)
      localStorage.setItem(STORAGE_KEY_WS_URL, wsUrlVal)
    }
  }

  function restoreSession() {
    if (accessToken.value) {
      scheduleTokenRefresh()
      fetchAvatar()
    }
  }

  function logout() {
    stopTokenRefresh()
    accessToken.value = ''
    refreshToken.value = ''
    userId.value = ''
    username.value = ''
    globalRole.value = 'member'
    avatarUrl.value = ''
    avatarSrc.value = ''

    localStorage.removeItem(STORAGE_KEY_TOKEN)
    localStorage.removeItem(STORAGE_KEY_REFRESH)
    localStorage.removeItem(STORAGE_KEY_USER_ID)
    localStorage.removeItem(STORAGE_KEY_USERNAME)
    localStorage.removeItem(STORAGE_KEY_GLOBAL_ROLE)
    localStorage.removeItem(STORAGE_KEY_AVATAR_URL)
  }

  function fullReset() {
    logout()
    localStorage.removeItem(STORAGE_KEY_SERVER_URL)
    localStorage.removeItem(STORAGE_KEY_WS_URL)
    avatarBlobCache.clear()
  }

  return {
    accessToken,
    refreshToken,
    userId,
    username,
    globalRole,
    avatarUrl,
    avatarSrc,
    serverUrl,
    wsUrl,
    isLoggedIn,
    avatarDisplaySrc,
    setAuth,
    updateUsername,
    resolveAvatarUrl,
    fetchAvatar,
    tryFetchOwnAvatar,
    updateAvatarUrl,
    setServerUrls,
    restoreSession,
    logout,
    fullReset,
    scheduleTokenRefresh,
    stopTokenRefresh,
  }
})
