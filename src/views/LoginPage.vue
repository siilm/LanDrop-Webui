<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { loginChallenge, loginVerify } from '@/composables/useApi'

const router = useRouter()
const authStore = useAuthStore()

// ---- 表单 ----
const userId = ref('')
const privateKeyInput = ref('')
const keyFileName = ref('')

// ---- 服务器配置 ----
const STORAGE_KEY_REMEMBER = 'landrop_remember_server'
const showServerConfig = ref(false)
const httpUrl = ref('')
const wsUrlVal = ref('')
const rememberServer = ref(localStorage.getItem(STORAGE_KEY_REMEMBER) !== 'false')

// ---- 状态 ----
const loading = ref(false)
const errorMsg = ref('')

// 恢复已保存的服务器地址
onMounted(() => {
  if (authStore.serverUrl) {
    httpUrl.value = authStore.serverUrl
    wsUrlVal.value = authStore.wsUrl
  }
})

// ---- Ed25519 签名 ----
async function ed25519SignB64(keyB64: string, data: Uint8Array): Promise<string> {
  // 支持 PEM 和 Base64 DER 格式
  let derBytes: Uint8Array

  if (keyB64.includes('BEGIN')) {
    // PEM 格式
    const pemData = keyB64
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/\s/g, '')
    derBytes = Uint8Array.from(atob(pemData), (c) => c.charCodeAt(0))
  } else {
    // Raw Base64 DER
    derBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0))
  }

  const key = await crypto.subtle.importKey(
    'pkcs8',
    derBytes.buffer as ArrayBuffer,
    { name: 'Ed25519' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    key,
    data as BufferSource,
  )

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

// 从私钥提取公钥（用于 server 端验证）
async function derivePublicKeyFromPrivate(keyB64: string): Promise<string> {
  let pemData = keyB64
  if (pemData.includes('BEGIN')) {
    pemData = pemData
      .replace(/-----BEGIN[^-]+-----/g, '')
      .replace(/-----END[^-]+-----/g, '')
      .replace(/\s/g, '')
  }
  const derBytes = Uint8Array.from(atob(pemData), (c) => c.charCodeAt(0))

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    derBytes.buffer,
    { name: 'Ed25519' },
    true,
    ['sign'],
  )

  const jwk = await crypto.subtle.exportKey('jwk', privateKey)
  // Ed25519 JWK: x is public key (Base64URL)
  const xB64 = jwk.x || ''
  // 转换 Base64URL → Base64
  const stdB64 = xB64.replace(/-/g, '+').replace(/_/g, '/')
  return stdB64
}

// 读取文件
function handleKeyFileUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  keyFileName.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => {
    privateKeyInput.value = e.target?.result as string || ''
  }
  reader.readAsText(file)
}

// 设备信息（JSON 字符串，需与 API 请求中发送的一致）
function getDeviceInfoJson(): string {
  return JSON.stringify({ os: navigator.platform })
}

// ---- 登录 ----
async function handleLogin() {
  if (!userId.value || !privateKeyInput.value) {
    errorMsg.value = '请输入用户 ID 和私钥'
    return
  }
  if (!/^[A-Za-z0-9]{12}$/.test(userId.value.trim())) {
    errorMsg.value = '用户 ID 必须为 12 位字母数字组合'
    return
  }
  loading.value = true
  errorMsg.value = ''

  try {
    // 保存服务器地址
    localStorage.setItem(STORAGE_KEY_REMEMBER, String(rememberServer.value))
    authStore.setServerUrls(httpUrl.value, wsUrlVal.value, rememberServer.value)

    const name = userId.value.trim()
    const devJson = getDeviceInfoJson()

    // Step 1: 请求挑战（需要传入 user_id 和 device_info）
    const challenge = await loginChallenge(name, devJson)

    // Step 2: 构造签名原文 challenge(32字节raw) + device_info(UTF-8) + user_id(UTF-8)
    const challengeRaw = Uint8Array.from(atob(challenge.challenge), c => c.charCodeAt(0))
    const devEncoded = new TextEncoder().encode(devJson)
    const userIdEncoded = new TextEncoder().encode(name)

    const signData = new Uint8Array(
      challengeRaw.length + devEncoded.length + userIdEncoded.length,
    )
    signData.set(challengeRaw, 0)
    signData.set(devEncoded, challengeRaw.length)
    signData.set(userIdEncoded, challengeRaw.length + devEncoded.length)

    // Step 3: 签名
    const signature = await ed25519SignB64(privateKeyInput.value, signData)

    // Step 4: 验证（device_info 必须与步骤1一致）
    const result = await loginVerify(challenge.temp_session_id, signature, devJson)

    authStore.setAuth(result)
    router.push('/chat')
  } catch (e: any) {
    errorMsg.value = e.message || '登录失败'
  } finally {
    loading.value = false
  }
}

// ---- 提交 ----
function handleSubmit() {
  handleLogin()
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo-section">
        <div class="logo-icon">💬</div>
        <h1>LanDrop</h1>
        <p class="subtitle">安全的去中心化即时通讯</p>
      </div>

      <form @submit.prevent="handleSubmit">
        <!-- 用户 ID（登录时必填） -->
        <div class="field">
          <label>用户 ID</label>
          <input
            v-model="userId"
            type="text"
            placeholder="12 位字母数字 ID"
            class="input"
            maxlength="12"
          />
        </div>

        <!-- 用户名（注册时必填） -->
        <!-- 私钥（登录时显示） -->
        <div class="field">
            <label>Ed25519 私钥</label>
            <div class="key-input-row">
              <input
                v-model="privateKeyInput"
                type="password"
                placeholder="粘贴 PEM 私钥或 Base64 DER"
                class="input"
              />
            </div>
            <div class="file-upload">
              <label class="file-btn">
                📄 上传私钥文件
                <input
                  type="file"
                  accept=".pem,.key,.priv,.txt"
                  class="hidden-input"
                  @change="handleKeyFileUpload"
                />
              </label>
              <span v-if="keyFileName" class="file-name">{{ keyFileName }}</span>
            </div>
          </div>

        <!-- 服务器配置（可折叠） -->
        <div class="server-config">
          <button
            type="button"
            class="config-toggle"
            @click="showServerConfig = !showServerConfig"
          >
            {{ showServerConfig ? '▼' : '▶' }} 服务器配置
          </button>
          <div v-if="showServerConfig" class="config-fields">
            <div class="field">
              <label>HTTP 地址</label>
              <input v-model="httpUrl" type="text" class="input" placeholder="留空则使用 Vite 开发代理" />
            </div>
            <div class="field">
              <label>WebSocket 地址</label>
              <input v-model="wsUrlVal" type="text" class="input" placeholder="留空则使用 Vite 开发代理" />
            </div>
            <label class="remember-checkbox">
              <input type="checkbox" v-model="rememberServer" />
              <span>记住服务器地址</span>
            </label>
          </div>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMsg" class="error-msg">
          {{ errorMsg }}
        </div>

        <!-- 提交按钮 -->
        <button
          type="submit"
          class="submit-btn"
          :disabled="loading"
        >
          {{ loading ? '处理中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.login-card {
  width: 420px;
  max-width: 90vw;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 16px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.logo-section {
  text-align: center;
  margin-bottom: 32px;
}

.logo-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.logo-section h1 {
  margin: 0;
  font-size: 28px;
  color: #1a1a2e;
}

.subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: #888;
}

.mode-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #e0e0e0;
}

.mode-tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: #f5f5f5;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s;
}

.mode-tab.active {
  background: #0f3460;
  color: #fff;
}

.field {
  margin-bottom: 16px;
}

.field label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #555;
  margin-bottom: 6px;
}

.input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.input:focus {
  border-color: #0f3460;
}

.key-input-row {
  display: flex;
  gap: 8px;
}

.key-input-row .input {
  flex: 1;
}

.file-upload {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-btn {
  display: inline-block;
  padding: 6px 14px;
  background: #f0f2f5;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.file-btn:hover {
  background: #e4e6ea;
}

.hidden-input {
  display: none;
}

.file-name {
  font-size: 12px;
  color: #666;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.server-config {
  margin-bottom: 16px;
}

.config-toggle {
  background: none;
  border: none;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  padding: 4px 0;
}

.config-toggle:hover {
  color: #333;
}

.config-fields {
  margin-top: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
}

.remember-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
}

.remember-checkbox input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.error-msg {
  padding: 10px 14px;
  background: #fef0ef;
  color: #e74c3c;
  border-radius: 8px;
  font-size: 13px;
  margin-bottom: 16px;
}

.error-msg.success {
  background: #e8f5e9;
  color: #27ae60;
}

.submit-btn {
  width: 100%;
  padding: 12px;
  background: #0f3460;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.submit-btn:hover:not(:disabled) {
  background: #1a5276;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
