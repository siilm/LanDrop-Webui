<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { loginChallenge, loginVerify } from '@/composables/useApi'

const router = useRouter()
const authStore = useAuthStore()

// ---- 表单状态 ----
const userId = ref('')
const privateKeyInput = ref('')
const keyFileName = ref('')
const showKey = ref(false)
const dragOver = ref(false)
const loading = ref(false)
const errorMsg = ref('')

const UID_RE = /^[A-Za-z0-9]{12}$/
const userIdValid = computed(() => UID_RE.test(userId.value))

// ---- 服务器配置 ----
const STORAGE_KEY_REMEMBER = 'landrop_remember_server'
const showServerConfig = ref(true)
const httpUrl = ref('')
const wsUrlVal = ref('')
const rememberServer = ref(localStorage.getItem(STORAGE_KEY_REMEMBER) !== 'false')

// 输入 HTTP 地址时自动推导 WS 地址
watch(httpUrl, (val) => {
  if (!val) {
    wsUrlVal.value = ''
    return
  }
  try {
    const url = new URL(val)
    wsUrlVal.value = `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`
  } catch {
    // URL 不合法时不自动填充
  }
})

// ---- 记住用户 ID ----
const STORAGE_REMEMBER_UID = 'landrop_login_remember_uid'
const STORAGE_SAVED_UID = 'landrop_login_uid'
const rememberUserId = ref(false)

// ---- 主题模式 ----
const THEME_STORAGE_KEY = 'landrop_theme_mode'
type ThemeMode = 'auto' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

const themeMode = ref<ThemeMode>(
  (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'auto',
)

// auto：按时段解析（6:00–18:00 浅色，其余深色）
const resolvedTheme = computed<ResolvedTheme>(() => {
  if (themeMode.value !== 'auto') return themeMode.value
  const hour = new Date().getHours()
  return hour >= 6 && hour < 18 ? 'light' : 'dark'
})

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

// ---- 切换按钮展开宽度 ----
// 文字内容撑出的宽度无法做 CSS 过渡（会瞬间跳变），故用隐藏量尺测出当前标签
// 的像素宽，作为展开态目标 width 并对其过渡，使长↔短切换平滑。
const textSizer = ref<HTMLElement | null>(null)
const textWidth = ref(0)
function measureTextWidth() {
  if (textSizer.value) textWidth.value = Math.ceil(textSizer.value.getBoundingClientRect().width)
}

// 标签切换时平滑过渡宽度。
// 关键：长→短切换时，旧（长）文字仍在向下滚出（roll-text 过渡 ~0.44s），若立即把
// 容器宽度收到短宽度，旧文字会被 overflow:hidden 裁掉并出现"挤出后闪现归位"。
// 故收窄时先维持较宽的旧宽度让旧文字平滑滚完，待切换动画结束后再收窄；
// 加宽时直接用新宽度，新文字不会被裁切。
const ROLL_DURATION_MS = 460
let shrinkTimer: ReturnType<typeof setTimeout> | undefined
watch(themeLabel, () => {
  const prevWidth = textWidth.value
  nextTick(() => {
    measureTextWidth()
    const newWidth = textWidth.value
    clearTimeout(shrinkTimer)
    if (newWidth < prevWidth) {
      textWidth.value = prevWidth // 先保持旧宽度
      shrinkTimer = setTimeout(() => {
        textWidth.value = newWidth // 旧文字滚出后再收窄
      }, ROLL_DURATION_MS)
    }
    // newWidth >= prevWidth：已是新宽度，加宽不会裁切
  })
})

// ---- Ed25519 签名 ----
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

async function ed25519Sign(privateKey: string, data: Uint8Array): Promise<string> {
  // PEM 去掉头尾与空白；纯 Base64 DER 直接使用
  const b64 = privateKey.includes('BEGIN')
    ? privateKey.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s/g, '')
    : privateKey
  const key = await crypto.subtle.importKey(
    'pkcs8',
    b64ToBytes(b64).buffer as ArrayBuffer,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, data as BufferSource)
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

// PEM 头或纯 Base64 都视为合法
function looksLikeEd25519Key(key: string): boolean {
  return key.includes('BEGIN') || /^[A-Za-z0-9+/=]+$/.test(key.trim())
}

// ---- 密钥文件读取（上传 / 拖放共用）----
function loadKeyFile(file: File) {
  keyFileName.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => {
    privateKeyInput.value = (e.target?.result as string) || ''
  }
  reader.readAsText(file)
}

function handleKeyFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) loadKeyFile(file)
}

function onDrop(e: DragEvent) {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) loadKeyFile(file)
}

// ---- 登录 ----
async function handleLogin() {
  if (!userId.value || !privateKeyInput.value) {
    errorMsg.value = '请输入用户 ID 和私钥'
    return
  }
  if (!UID_RE.test(userId.value.trim())) {
    errorMsg.value = '用户 ID 必须为 12 位字母数字组合'
    return
  }
  if (!looksLikeEd25519Key(privateKeyInput.value.trim())) {
    errorMsg.value = '私钥格式不正确，需为 PEM 或 Base64 DER 格式'
    return
  }

  loading.value = true
  errorMsg.value = ''
  try {
    // 持久化服务器地址与用户 ID 偏好
    localStorage.setItem(STORAGE_KEY_REMEMBER, String(rememberServer.value))
    authStore.setServerUrls(httpUrl.value, wsUrlVal.value, rememberServer.value)
    if (rememberUserId.value) {
      localStorage.setItem(STORAGE_REMEMBER_UID, 'true')
      localStorage.setItem(STORAGE_SAVED_UID, userId.value.trim())
    } else {
      localStorage.removeItem(STORAGE_REMEMBER_UID)
      localStorage.removeItem(STORAGE_SAVED_UID)
    }

    const name = userId.value.trim()
    const devJson = JSON.stringify({ os: navigator.platform })
    const enc = new TextEncoder()

    // 挑战 → 签名（挑战原文 + 设备信息 + 用户 ID）→ 验证
    const challenge = await loginChallenge(name, devJson)
    const signData = concatBytes(
      b64ToBytes(challenge.challenge),
      enc.encode(devJson),
      enc.encode(name),
    )
    const signature = await ed25519Sign(privateKeyInput.value, signData)
    const result = await loginVerify(challenge.temp_session_id, signature, devJson)

    authStore.setAuth(result)
    router.push('/chat')
  } catch (e: any) {
    errorMsg.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}

// ---- 初始化：恢复已保存配置 + 量取标签宽度 ----
onMounted(() => {
  if (localStorage.getItem(STORAGE_REMEMBER_UID) === 'true') {
    rememberUserId.value = true
    userId.value = localStorage.getItem(STORAGE_SAVED_UID) || ''
  }

  if (authStore.serverUrl) {
    httpUrl.value = authStore.serverUrl
    wsUrlVal.value = authStore.wsUrl
    showServerConfig.value = !rememberServer.value
  } else {
    httpUrl.value = 'http://'
  }

  // 字体异步加载完成后再量一次，避免度量偏差
  measureTextWidth()
  document.fonts?.ready.then(measureTextWidth).catch(() => {})
})
</script>

<template>
  <div class="neo-login" :data-theme="resolvedTheme">
    <!-- 主题切换按钮 -->
    <button
      class="theme-toggle"
      :title="themeLabel"
      @click="cycleTheme"
      :aria-label="themeLabel"
    >
      <span class="roll-cell">
        <Transition name="roll-icon">
          <span class="theme-toggle-icon" :key="themeIcon">{{ themeIcon }}</span>
        </Transition>
      </span>
      <span class="roll-cell roll-cell--text" :style="{ '--text-w': textWidth + 'px' }">
        <Transition name="roll-text">
          <span class="theme-toggle-text" :key="themeLabel">{{ themeLabel }}</span>
        </Transition>
        <span ref="textSizer" class="theme-toggle-text theme-toggle-sizer" aria-hidden="true">{{ themeLabel }}</span>
      </span>
    </button>

    <!-- 背景装饰：极光 + 网格 + 光晕 + 暗角，深浅两色各自调和 -->
    <div class="bg-layer bg-aurora" aria-hidden="true"></div>
    <div class="bg-layer bg-grid" aria-hidden="true"></div>
    <div class="bg-orb bg-orb--1" aria-hidden="true"></div>
    <div class="bg-orb bg-orb--2" aria-hidden="true"></div>
    <div class="bg-orb bg-orb--3" aria-hidden="true"></div>
    <div class="bg-orb bg-orb--4" aria-hidden="true"></div>
    <div class="bg-layer bg-vignette" aria-hidden="true"></div>

    <div class="login-card">
      <!-- Logo 区域 -->
      <div class="card-header">
        <div class="logo-mark">
          <span class="logo-emoji">💬</span>
        </div>
        <h1 class="logo-title">LanDrop</h1>
        <p class="logo-subtitle">安全 &middot; 去中心化 &middot; 即时通讯</p>
      </div>

      <form class="login-form" @submit.prevent="handleLogin">
        <!-- 用户 ID -->
        <div class="field">
          <label class="field-label">用户 ID</label>
          <div class="input-wrap">
            <input
              v-model="userId"
              type="text"
              placeholder="12 位字母数字 ID"
              class="input"
              maxlength="12"
              autocomplete="off"
            />
            <span v-if="userIdValid" class="input-check">✓</span>
          </div>
        </div>

        <!-- Ed25519 私钥 -->
        <div class="field">
          <label class="field-label">Ed25519 私钥</label>
          <div class="input-wrap">
            <input
              v-model="privateKeyInput"
              :type="showKey ? 'text' : 'password'"
              placeholder="粘贴 PEM 私钥或 Base64 DER"
              class="input input--key"
              autocomplete="off"
            />
            <button
              type="button"
              class="toggle-vis"
              :title="showKey ? '隐藏私钥' : '显示私钥'"
              @click="showKey = !showKey"
            >
              <span v-if="showKey">◉</span>
              <span v-else>○</span>
            </button>
          </div>
          <!-- 上传 / 拖放区域 -->
          <div
            class="key-upload"
            :class="{ 'key-upload--dragover': dragOver }"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="onDrop"
          >
            <label class="upload-trigger">
              <span class="upload-icon">📄</span>
              <span>{{ keyFileName ? '更换文件' : '上传密钥文件 (.key / .pem)' }}</span>
              <input
                type="file"
                accept=".pem,.key,.priv,.txt"
                class="hidden-input"
                @change="handleKeyFileUpload"
              />
            </label>
            <span v-if="keyFileName" class="uploaded-name">
              <span class="uploaded-check">✓</span> {{ keyFileName }}
            </span>
          </div>
        </div>

        <!-- 服务器配置（可折叠） -->
        <div class="server-section">
          <button
            type="button"
            class="server-toggle"
            @click="showServerConfig = !showServerConfig"
          >
            <span class="toggle-arrow" :class="{ 'toggle-arrow--open': showServerConfig }">▸</span>
            <span class="label-icon">⚙</span> 服务器配置
            <span v-if="!showServerConfig && httpUrl" class="server-preview">{{ httpUrl }}</span>
          </button>
          <Transition name="collapse">
            <div v-if="showServerConfig" class="server-collapse">
              <div class="server-collapse-inner">
            <div class="server-content">
              <div class="field">
                <label class="field-label">HTTP 地址</label>
                <input
                  v-model="httpUrl"
                  type="text"
                  class="input"
                  placeholder="http://"
                />
              </div>
              <div class="field">
                <label class="field-label">WebSocket 地址</label>
                <input
                  v-model="wsUrlVal"
                  type="text"
                  class="input"
                  placeholder="ws://"
                />
                <p class="field-hint">由 HTTP 地址自动填充，也可手动修改</p>
              </div>
              <!-- 记住服务器（在折叠区域内） -->
              <label class="checkbox-row">
                <input
                  type="checkbox"
                  v-model="rememberServer"
                  class="custom-checkbox"
                />
                <span class="checkbox-text">记住服务器地址</span>
              </label>
            </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- 记住用户 ID -->
        <label class="checkbox-row">
          <input
            type="checkbox"
            v-model="rememberUserId"
            class="custom-checkbox"
          />
          <span class="checkbox-text">记住用户 ID（不保存私钥）</span>
        </label>

        <!-- 错误提示 -->
        <Transition name="fade">
          <div v-if="errorMsg" class="error-banner">
            <span class="error-icon">!</span>
            <span>{{ errorMsg }}</span>
          </div>
        </Transition>

        <!-- 提交按钮 -->
        <button
          type="submit"
          class="submit-btn"
          :disabled="loading"
        >
          <template v-if="loading">
            <span class="spinner"></span>
            处理中...
          </template>
          <template v-else>
            <span class="submit-icon">→</span> 登 录
          </template>
        </button>
      </form>
    </div><!-- /login-card -->
  </div>
</template>

<style scoped>
/* ================================================================
   CSS Custom Properties — Monet-inspired palette from #403577
   DARK theme (default)
   ================================================================ */
.neo-login {
  --primary: #403577;
  --primary-light: #5b4d9e;
  --primary-soft: #7b6fc0;
  --primary-muted: rgba(64, 53, 119, 0.18);
  --primary-glow: rgba(64, 53, 119, 0.35);
  --bg: #0d0d14;
  --surface: rgba(22, 18, 34, 0.82);
  --text: #e8e2f0;
  --text-secondary: #a098b8;
  --text-muted: #6b6580;
  --border: rgba(255, 255, 255, 0.07);
  --border-focus: rgba(64, 53, 119, 0.5);
  --input-bg: rgba(255, 255, 255, 0.045);
  --input-bg-hover: rgba(255, 255, 255, 0.065);
  --error: #ff6b6b;
  --error-bg: rgba(255, 107, 107, 0.08);
  --error-border: rgba(255, 107, 107, 0.2);
  --success: #51cf66;
  --card-shadow: 0 8px 48px rgba(0, 0, 0, 0.45);
  --card-inset: 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  --upload-border: rgba(255, 255, 255, 0.1);
  --upload-border-hover: rgba(64, 53, 119, 0.4);
  --upload-bg-hover: rgba(64, 53, 119, 0.06);
  --toggle-hover-bg: rgba(255, 255, 255, 0.06);
  --section-bg: rgba(255, 255, 255, 0.025);
  --section-border: rgba(255, 255, 255, 0.04);
  --checkbox-border: rgba(255, 255, 255, 0.18);
  --checkbox-border-hover: rgba(255, 255, 255, 0.3);
  --spinner-track: rgba(255, 255, 255, 0.3);
  --btn-shine: rgba(255, 255, 255, 0.12);
  --orb-1: rgba(64, 53, 119, 0.3);
  --orb-2: rgba(45, 74, 122, 0.25);
  --orb-3: rgba(91, 45, 90, 0.2);
  --orb-4: rgba(60, 90, 130, 0.18);
  /* 背景装饰（深色） */
  --aurora-1: rgba(91, 77, 158, 0.45);
  --aurora-2: rgba(45, 74, 122, 0.42);
  --aurora-3: rgba(118, 60, 116, 0.38);
  --aurora-opacity: 0.6;
  --grid-line: rgba(255, 255, 255, 0.035);
  --grid-opacity: 1;
  --vignette: rgba(0, 0, 0, 0.55);
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
}

/* ================================================================
   LIGHT theme overrides
   ================================================================ */
.neo-login[data-theme="light"] {
  --primary-muted: rgba(64, 53, 119, 0.1);
  --primary-glow: rgba(64, 53, 119, 0.2);
  --bg: #f5f3f9;
  --surface: rgba(255, 255, 255, 0.78);
  --text: #1c1828;
  --text-secondary: #5b5570;
  --text-muted: #8c86a0;
  --border: rgba(0, 0, 0, 0.1);
  --border-focus: rgba(64, 53, 119, 0.45);
  --input-bg: rgba(0, 0, 0, 0.03);
  --input-bg-hover: rgba(0, 0, 0, 0.05);
  --error: #c0392b;
  --error-bg: rgba(192, 57, 43, 0.06);
  --error-border: rgba(192, 57, 43, 0.18);
  --success: #27ae60;
  --card-shadow: 0 8px 40px rgba(0, 0, 0, 0.08);
  --card-inset: 0 0 0 1px rgba(0, 0, 0, 0.04) inset;
  --upload-border: rgba(0, 0, 0, 0.12);
  --upload-border-hover: rgba(64, 53, 119, 0.3);
  --upload-bg-hover: rgba(64, 53, 119, 0.04);
  --toggle-hover-bg: rgba(0, 0, 0, 0.05);
  --section-bg: rgba(0, 0, 0, 0.02);
  --section-border: rgba(0, 0, 0, 0.06);
  --checkbox-border: rgba(0, 0, 0, 0.25);
  --checkbox-border-hover: rgba(0, 0, 0, 0.4);
  --spinner-track: rgba(0, 0, 0, 0.15);
  --btn-shine: rgba(255, 255, 255, 0.18);
  --orb-1: rgba(64, 53, 119, 0.12);
  --orb-2: rgba(45, 74, 122, 0.1);
  --orb-3: rgba(91, 45, 90, 0.08);
  --orb-4: rgba(70, 120, 160, 0.08);
  /* 背景装饰（浅色） */
  --aurora-1: rgba(124, 111, 196, 0.32);
  --aurora-2: rgba(140, 170, 225, 0.28);
  --aurora-3: rgba(200, 150, 210, 0.26);
  --aurora-opacity: 0.75;
  --grid-line: rgba(64, 53, 119, 0.05);
  --grid-opacity: 1;
  --vignette: rgba(64, 53, 119, 0.05);
}

/* ================================================================
   Background & Layout
   ================================================================ */
.neo-login {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  position: relative;
  overflow: hidden;
  font-family: 'Inter', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  transition: background-color 0.5s ease;
}

/* ---- 通用装饰层 ---- */
.bg-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: opacity 0.5s ease;
}

/* 极光：多个柔色径向斑块缓慢漂移、缩放，营造流动感 */
.bg-aurora {
  background:
    radial-gradient(60% 50% at 22% 18%, var(--aurora-1), transparent 70%),
    radial-gradient(52% 46% at 82% 28%, var(--aurora-2), transparent 72%),
    radial-gradient(58% 52% at 68% 88%, var(--aurora-3), transparent 72%);
  filter: blur(48px);
  opacity: var(--aurora-opacity);
  transform-origin: center;
  animation: aurora-drift 30s cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
  will-change: transform, opacity;
}
@keyframes aurora-drift {
  0% { transform: translate3d(-2%, -1.5%, 0) scale(1.05) rotate(-1deg); }
  50% { transform: translate3d(1.5%, 1%, 0) scale(1.12) rotate(1deg); }
  100% { transform: translate3d(2.5%, 2.5%, 0) scale(1.08) rotate(0deg); }
}

/* 网格：极淡的方格纹理，向中心径向淡出，提供精致的层次而不抢眼 */
.bg-grid {
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
  background-size: 46px 46px;
  opacity: var(--grid-opacity);
  -webkit-mask-image: radial-gradient(ellipse 72% 64% at 50% 42%, #000 0%, transparent 78%);
  mask-image: radial-gradient(ellipse 72% 64% at 50% 42%, #000 0%, transparent 78%);
  animation: grid-pan 40s linear infinite;
}
@keyframes grid-pan {
  to { background-position: 46px 46px; }
}

/* 暗角：聚焦卡片、压暗边缘 */
.bg-vignette {
  background: radial-gradient(125% 125% at 50% 0%, transparent 55%, var(--vignette) 100%);
}

/* ---- 装饰光晕 ---- */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(100px);
  pointer-events: none;
  animation: orb-float 22s cubic-bezier(0.42, 0, 0.58, 1) infinite;
  transition: background 0.5s ease;
  will-change: transform;
}
.bg-orb--1 {
  width: 500px;
  height: 500px;
  top: -15%;
  right: -10%;
  background: radial-gradient(circle, var(--orb-1), transparent 70%);
  animation-delay: 0s;
}
.bg-orb--2 {
  width: 400px;
  height: 400px;
  bottom: -12%;
  left: -8%;
  background: radial-gradient(circle, var(--orb-2), transparent 70%);
  animation-delay: -7s;
}
.bg-orb--3 {
  width: 300px;
  height: 300px;
  top: 40%;
  right: 25%;
  background: radial-gradient(circle, var(--orb-3), transparent 70%);
  animation-delay: -13s;
}
.bg-orb--4 {
  width: 360px;
  height: 360px;
  bottom: 10%;
  right: -6%;
  background: radial-gradient(circle, var(--orb-4), transparent 70%);
  animation: orb-float 28s cubic-bezier(0.42, 0, 0.58, 1) infinite reverse;
  animation-delay: -4s;
}

@keyframes orb-float {
  0%, 100% { transform: translate(0, 0) scale(1); }
  25% { transform: translate(30px, -25px) scale(1.08); }
  50% { transform: translate(-15px, 20px) scale(0.94); }
  75% { transform: translate(-25px, -15px) scale(1.04); }
}

/* ================================================================
   Card
   ================================================================ */
.login-card {
  position: relative;
  z-index: 1;
  width: 440px;
  max-width: 92vw;
  background: var(--surface);
  backdrop-filter: blur(28px) saturate(1.4);
  -webkit-backdrop-filter: blur(28px) saturate(1.4);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 44px 40px 36px;
  box-shadow: var(--card-shadow), var(--card-inset);
  /* 入场：自下浮入并消除模糊，easeOutExpo 落位优雅减速 */
  animation: card-in 0.85s cubic-bezier(0.16, 1, 0.3, 1) both;
  transition: background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease;
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.97);
    filter: blur(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
    filter: blur(0);
  }
}

/* 卡片内部分区依次浮入，形成自然的层叠节奏 */
@keyframes rise-in {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}
.card-header,
.login-form > .field,
.server-section,
.login-form > .checkbox-row,
.submit-btn {
  /* backwards（非 both）：延迟期间维持起始态，结束后回归基样式，
     不会以 forwards 覆盖 hover/active 的 transform */
  animation: rise-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) backwards;
}
.card-header { animation-delay: 0.08s; }
.login-form > .field:nth-of-type(1) { animation-delay: 0.16s; }
.login-form > .field:nth-of-type(2) { animation-delay: 0.23s; }
.server-section { animation-delay: 0.30s; }
.login-form > .checkbox-row { animation-delay: 0.37s; }
.submit-btn { animation-delay: 0.44s; }

@media (prefers-reduced-motion: reduce) {
  .neo-login *,
  .neo-login *::before,
  .neo-login *::after {
    animation-duration: 0.001s !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001s !important;
  }
}

/* ================================================================
   Logo Header
   ================================================================ */
.card-header {
  text-align: center;
  margin-bottom: 36px;
}

.logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--primary), var(--primary-light));
  box-shadow: 0 8px 28px var(--primary-glow);
  margin-bottom: 16px;
}

.logo-emoji {
  font-size: 36px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

.logo-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  transition: color 0.5s ease;
}

.logo-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 400;
  letter-spacing: 0.01em;
  transition: color 0.5s ease;
}

/* ================================================================
   Form Fields
   ================================================================ */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field {
  margin-bottom: 16px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 7px;
  letter-spacing: 0.01em;
  transition: color 0.5s ease;
}

.label-icon {
  font-size: 15px;
  opacity: 0.7;
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input {
  width: 100%;
  padding: 11px 14px;
  background: var(--input-bg);
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, color 0.5s ease;
  font-family: 'SF Mono', 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
}

.input::placeholder {
  color: var(--text-muted);
  font-family: 'Inter', 'SF Pro Display', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

.input:hover {
  background: var(--input-bg-hover);
}

.input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--primary-muted);
  background: var(--input-bg-hover);
}

.input--key {
  padding-right: 42px;
}

.input-check {
  position: absolute;
  right: 14px;
  color: var(--success);
  font-size: 14px;
  font-weight: 700;
  pointer-events: none;
}

/* ---- 显示/隐藏私钥按钮 ---- */
.toggle-vis {
  position: absolute;
  right: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 8px;
  font-size: 16px;
  transition: color 0.15s, background 0.15s;
}

.toggle-vis:hover {
  color: var(--text-secondary);
  background: var(--toggle-hover-bg);
}

/* ================================================================
   Key Upload
   ================================================================ */
.key-upload {
  margin-top: 10px;
  padding: 12px 16px;
  border: 1.5px dashed var(--upload-border);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  transition: border-color 0.2s, background 0.2s;
}

.key-upload:hover,
.key-upload--dragover {
  border-color: var(--upload-border-hover);
  background: var(--upload-bg-hover);
}

.upload-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s;
  user-select: none;
}

.upload-trigger:hover {
  color: var(--primary-soft);
}

.upload-icon {
  font-size: 16px;
}

.hidden-input {
  display: none;
}

.uploaded-name {
  font-size: 12px;
  color: var(--success);
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.uploaded-check {
  flex-shrink: 0;
  font-weight: 700;
}

/* ================================================================
   Server Config Section
   ================================================================ */
.server-section {
  margin-bottom: 8px;
}

.server-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  background: none;
  border: none;
  padding: 8px 0;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  letter-spacing: 0.01em;
  transition: color 0.15s;
}

.server-toggle:hover {
  color: var(--text);
}

.toggle-arrow {
  font-size: 12px;
  transition: transform 0.25s ease;
  display: inline-block;
}

.toggle-arrow--open {
  transform: rotate(90deg);
}

.server-preview {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 400;
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
  transition: color 0.5s ease;
}

.server-content {
  padding: 12px 14px;
  background: var(--section-bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--section-border);
  margin-top: 4px;
  transition: background 0.5s ease, border-color 0.5s ease;
}

.server-content .field {
  margin-bottom: 10px;
}

.server-content .field:last-of-type {
  margin-bottom: 12px;
}

.server-content .field-label {
  font-size: 12px;
}

.field-hint {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--text-muted);
  transition: color 0.5s ease;
}

/* ---- 折叠动画 ----
   用 grid 行高 1fr↔0fr 按内容真实高度伸缩，避免固定 max-height
   收起时先卡顿再补完的问题 */
.server-collapse {
  display: grid;
  grid-template-rows: 1fr;
}
.server-collapse-inner {
  min-height: 0;
  overflow: hidden;
}
.collapse-enter-active,
.collapse-leave-active {
  transition:
    grid-template-rows 0.34s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.28s ease;
}
.collapse-enter-from,
.collapse-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

/* ================================================================
   Checkboxes
   ================================================================ */
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--text-secondary);
  transition: color 0.5s ease;
}

.custom-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--checkbox-border);
  border-radius: 5px;
  background: transparent;
  cursor: pointer;
  position: relative;
  transition: all 0.2s ease;
  flex-shrink: 0;
  margin: 0;
}

.custom-checkbox:hover {
  border-color: var(--checkbox-border-hover);
}

.custom-checkbox:checked {
  background: var(--primary);
  border-color: var(--primary);
}

.custom-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 2px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox-text {
  line-height: 1.4;
}

/* ================================================================
   Error Banner
   ================================================================ */
.error-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 14px;
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--error);
  line-height: 1.5;
  margin-bottom: 4px;
}

.error-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--error-border);
  font-size: 11px;
  font-weight: 700;
  margin-top: 1px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ================================================================
   Submit Button
   ================================================================ */
.submit-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
  letter-spacing: 0.04em;
  margin-top: 12px;
  position: relative;
  overflow: hidden;
}

.submit-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--btn-shine), transparent 60%);
  pointer-events: none;
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 28px var(--primary-glow);
}

.submit-btn:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 12px var(--primary-glow);
}

.submit-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.submit-icon {
  font-size: 17px;
}

/* ---- 加载动画 ---- */
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--spinner-track);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ================================================================
   Theme Toggle Button
   ================================================================ */
.theme-toggle {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 10;
  height: 42px;
  /* width follows content — collapsed ≈42px via padding + icon */
  padding: 0 11px;
  border-radius: 21px;
  border: 1px solid var(--border);
  background: var(--surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  color: var(--text-secondary);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 0;
  white-space: nowrap;
  overflow: hidden;
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  transition:
    background 0.5s ease,
    border-color 0.5s ease,
    color 0.5s ease,
    padding 0.28s ease-out,
    box-shadow 0.28s ease-out;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
}

.theme-toggle:hover {
  padding: 0 16px 0 11px;
  color: var(--text);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.theme-toggle:active {
  transform: translateZ(0) scale(0.96);
}

/* ---- grid cell — stacks children, absorbs width diff during swap ---- */
.roll-cell {
  display: grid;
  grid-template: 1fr / 1fr;
  flex-shrink: 0;
}
.roll-cell > * {
  grid-area: 1 / 1;
}

/* icon cell — bouncy rotation on hover (separate from swap transform) */
.theme-toggle:hover .roll-cell:first-child {
  transform: rotate(-15deg) scale(1.1);
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* icon — pure layout, transforms come from Transition or hover wrapper */
.theme-toggle-icon {
  display: inline-block;
  line-height: 1;
}

/* 文字单元：承载 hover 展开。展开收纳在外层 wrapper 上，内层 <Transition>
   才能独立控制自身 opacity（否则 hover 的 opacity 会盖过 leave/enter，旧文字不淡出）。
   宽度由 --text-w（脚本测得的标签像素宽）驱动并过渡，使展开与长↔短切换都平滑。 */
.roll-cell--text {
  position: relative;
  width: 0;
  margin-left: 0;
  opacity: 0;
  overflow: hidden;
  transition:
    width 0.32s cubic-bezier(0.33, 1, 0.68, 1),
    margin-left 0.28s ease-out,
    opacity 0.2s ease-out 0.04s;
}

.theme-toggle:hover .roll-cell--text {
  width: var(--text-w, 120px);
  margin-left: 7px;
  opacity: 1;
}

/* text — pure layout/typography; swap opacity & transform come from the Transition */
.theme-toggle-text {
  display: inline-block;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* 隐藏量尺：用于测量当前标签像素宽（见脚本），绝对定位且隐藏，不占布局、不绘制 */
.theme-toggle-sizer {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

/* ---- 图标 / 文字切换：旧的向下淡出，新的从上方向下淡入 ---- */
/* 新旧元素共用同一条位移曲线，因而像一条整体的"卷帘"一起向下滚动；
   缓动采用 easeOutExpo，落位时优雅减速，整体时长拉长以摆脱"过快"的观感。 */
.roll-icon-enter-active,
.roll-icon-leave-active,
.roll-text-enter-active,
.roll-text-leave-active {
  transition:
    opacity 0.32s ease,
    transform 0.44s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform, opacity;
}

/* 位移量用 em，使图标(大)与文字(小)的行程各自与字号成比例 */
.roll-icon-enter-from { opacity: 0; transform: translateY(-1em); }
.roll-icon-leave-to   { opacity: 0; transform: translateY(1em); }
.roll-text-enter-from { opacity: 0; transform: translateY(-1em); }
.roll-text-leave-to   { opacity: 0; transform: translateY(1em); }

/* ================================================================
   Responsive
   ================================================================ */
@media (max-width: 480px) {
  .login-card {
    padding: 32px 24px 28px;
  }
  .logo-mark {
    width: 60px;
    height: 60px;
    border-radius: 16px;
  }
  .logo-emoji {
    font-size: 30px;
  }
  .logo-title {
    font-size: 24px;
  }
  .key-upload {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
