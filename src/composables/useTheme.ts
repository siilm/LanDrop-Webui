import { ref, computed, watchEffect } from 'vue'

/**
 * 全局主题（深 / 浅 / 自动）。
 *
 * 与登录页 NeoLoginPage 复用同一 localStorage 键（landrop_theme_mode），
 * 因此登录时选择的主题会延续到聊天页。
 *
 * 模块级单例状态：所有组件共享同一份 themeMode，
 * 切换后整个应用（通过 documentElement[data-theme]）一致响应。
 */

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const THEME_STORAGE_KEY = 'landrop_theme_mode'

// 模块级单例
const themeMode = ref<ThemeMode>(
  (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'auto',
)

// auto：按时段解析（6:00–18:00 浅色，其余深色），与登录页一致
const resolvedTheme = computed<ResolvedTheme>(() => {
  if (themeMode.value !== 'auto') return themeMode.value
  const hour = new Date().getHours()
  return hour >= 6 && hour < 18 ? 'light' : 'dark'
})

// 把解析后的主题写到 <html data-theme>，供全局令牌切换
let applied = false
function ensureApplied() {
  if (applied) return
  applied = true
  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme.value)
  })
}

const themeIcon = computed(() =>
  themeMode.value === 'auto' ? '◐' : resolvedTheme.value === 'dark' ? '☾' : '☀',
)

const themeLabel = computed(() =>
  themeMode.value === 'auto'
    ? '自动（按时段）'
    : resolvedTheme.value === 'dark'
      ? '深色模式'
      : '浅色模式',
)

function cycleTheme() {
  const order: ThemeMode[] = ['dark', 'light', 'auto']
  themeMode.value = order[(order.indexOf(themeMode.value) + 1) % order.length]
  localStorage.setItem(THEME_STORAGE_KEY, themeMode.value)
}

/**
 * 从 localStorage 重新同步偏好。
 * 登录页（NeoLoginPage）独立管理自己的 themeMode 并写入同一个键；
 * SPA 切换到聊天页时不会重新加载模块，故进入聊天页时调用此函数，
 * 把登录页可能做过的切换同步到全局单例。
 */
function syncFromStorage() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
  if (stored && stored !== themeMode.value) {
    themeMode.value = stored
  }
}

export function useTheme() {
  ensureApplied()
  return {
    themeMode,
    resolvedTheme,
    themeIcon,
    themeLabel,
    cycleTheme,
    syncFromStorage,
  }
}
