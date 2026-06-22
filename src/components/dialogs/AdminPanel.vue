<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchPublicAdmins, appointPublicAdmin, removePublicAdmin, adminRegister } from '@/composables/useApi'

const emit = defineEmits<{
  close: []
}>()

const authStore = useAuthStore()

const adminList = ref<{ user_id: string; username: string }[]>([])
const newAdminId = ref('')
const adminMsg = ref('')
const adminMsgError = ref(false)
const loadingAdmins = ref(false)

async function loadAdmins() {
  loadingAdmins.value = true
  try {
    const list = await fetchPublicAdmins()
    adminList.value = Array.isArray(list) ? list : []
  } catch {
    adminList.value = []
  } finally {
    loadingAdmins.value = false
  }
}

async function handleAppoint() {
  const id = newAdminId.value.trim()
  if (!id) return
  adminMsgError.value = false
  try {
    await appointPublicAdmin(id)
    adminMsg.value = `已任命 ${id} 为公共管理员`
    newAdminId.value = ''
    loadAdmins()
  } catch (e: any) {
    adminMsg.value = e.message || '任命失败'
    adminMsgError.value = true
  }
}

async function handleRemove(userId: string) {
  adminMsgError.value = false
  try {
    await removePublicAdmin(userId)
    adminMsg.value = `已移除 ${userId}`
    loadAdmins()
  } catch (e: any) {
    adminMsg.value = e.message || '移除失败'
    adminMsgError.value = true
  }
}

// ---- 添加用户 ----
const newUsername = ref('')
const newUserId = ref('')
const regMsg = ref('')
const regMsgError = ref(false)
const regLoading = ref(false)
const newUserKey = ref('')

async function handleAddUser() {
  if (!newUsername.value.trim()) {
    regMsg.value = '请输入用户名'
    regMsgError.value = true
    return
  }
  const id = newUserId.value.trim()
  if (id && !/^[A-Za-z0-9]{12}$/.test(id)) {
    regMsg.value = '用户 ID 必须为 12 位字母数字组合'
    regMsgError.value = true
    return
  }
  regLoading.value = true
  regMsg.value = ''
  regMsgError.value = false
  newUserKey.value = ''
  try {
    const result = await adminRegister(newUsername.value, newUserId.value.trim() || undefined)
    newUserKey.value = result.private_key_pem
    regMsg.value = `注册成功！用户 ID: ${result.user_id}`
    newUsername.value = ''
    newUserId.value = ''
  } catch (e: any) {
    regMsg.value = e.message || '注册失败'
    regMsgError.value = true
  } finally {
    regLoading.value = false
  }
}

onMounted(() => {
  loadAdmins()
})
</script>

<template>
  <div class="admin-panel">
    <div class="panel-header">
      <span>⚙️ 系统管理</span>
      <button class="btn-close" @click="emit('close')">✕</button>
    </div>

    <!-- 添加用户 -->
    <div class="admin-section">
      <div class="admin-section-title">添加用户</div>
      <div class="admin-form-row">
        <input
          v-model="newUsername"
          type="text"
          class="admin-input"
          placeholder="用户名"
          @keyup.enter="handleAddUser"
        />
      </div>
      <div class="admin-form-row" style="margin-top: 6px;">
        <input
          v-model="newUserId"
          type="text"
          class="admin-input"
          placeholder="用户 ID（可选，留空自动生成）"
          maxlength="12"
          @keyup.enter="handleAddUser"
        />
        <button class="btn-sm" @click="handleAddUser" :disabled="regLoading || !newUsername.trim()">
          {{ regLoading ? '注册中...' : '注册' }}
        </button>
      </div>
      <div v-if="regMsg" class="admin-msg" :class="{ error: regMsgError }">
        {{ regMsg }}
      </div>
      <div v-if="newUserKey" class="key-display">
        <div class="key-label">⚠️ 私钥已生成（请立即保存并安全地发送给用户）</div>
        <textarea class="key-textarea" readonly rows="4">{{ newUserKey }}</textarea>
      </div>
    </div>

    <!-- 公共管理员管理 -->
    <div class="admin-section">
      <div class="admin-section-title">公共管理员</div>
      <div class="admin-form-row">
        <input
          v-model="newAdminId"
          type="text"
          class="admin-input"
          placeholder="输入用户 ID"
          @keyup.enter="handleAppoint"
        />
        <button class="btn-sm" @click="handleAppoint" :disabled="!newAdminId.trim()">
          任命
        </button>
      </div>
      <div v-if="adminMsg" class="admin-msg" :class="{ error: adminMsgError }">
        {{ adminMsg }}
      </div>
    </div>

    <!-- 管理员列表 -->
    <div class="admin-list">
      <div class="admin-list-label">当前管理员</div>
      <div v-if="loadingAdmins" class="panel-loading">加载中...</div>
      <div v-else-if="adminList.length === 0" class="panel-empty">暂无管理员</div>
      <div
        v-for="admin in adminList"
        :key="admin.user_id"
        class="admin-list-item"
      >
        <span>{{ admin.username || admin.user_id }}</span>
        <button
          class="btn-danger-sm"
          @click="handleRemove(admin.user_id)"
        >
          移除
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-panel {
  padding: 14px 20px;
  background: var(--side-bg);
  color: var(--side-text);
  border-left: 1px solid var(--side-border);
  width: 270px;
  flex-shrink: 0;
  overflow-y: auto;
  animation: ld-slide-in-left 0.32s var(--ease-out-expo) both;
}

@keyframes ld-slide-in-left {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--side-text-dim);
  cursor: pointer;
  font-size: 16px;
  border-radius: var(--radius-xs);
  width: 26px;
  height: 26px;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.btn-close:hover {
  color: var(--side-text);
  background: var(--side-item-hover);
  transform: rotate(90deg);
}

.admin-section {
  margin-top: 14px;
}

.admin-section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--side-text-dim);
  margin-bottom: 7px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.admin-form-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.admin-input {
  flex: 1;
  min-width: 0;
  padding: 7px 10px;
  border: 1px solid var(--side-border);
  border-radius: var(--radius-sm);
  background: var(--side-input-bg);
  color: var(--side-text);
  font-size: 12px;
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.admin-input::placeholder {
  color: var(--side-text-faint);
}

.admin-input:focus {
  border-color: var(--side-accent);
  background: var(--side-input-bg-focus);
}

.btn-sm {
  padding: 7px 14px;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.15s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.btn-sm:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--accent-glow);
}

.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.admin-msg {
  margin-top: 6px;
  font-size: 12px;
  color: var(--success-text);
  word-break: break-all;
}

.admin-msg.error {
  color: var(--danger-text);
}

.admin-list {
  margin-top: 10px;
}

.admin-list-label {
  font-size: 11px;
  color: var(--side-text-faint);
  margin-bottom: 5px;
}

.admin-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  font-size: 12px;
  color: var(--side-text);
  background: var(--side-item-hover);
  border-radius: var(--radius-sm);
  margin-bottom: 4px;
  transition: background 0.18s ease;
}

.admin-list-item:hover {
  background: var(--side-btn-bg);
}

.btn-danger-sm {
  background: transparent;
  border: 1px solid var(--danger-border);
  color: var(--danger-text);
  padding: 3px 9px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-size: 11px;
  transition: background 0.18s ease, color 0.18s ease;
}

.btn-danger-sm:hover {
  background: var(--danger);
  color: #fff;
}

.key-display {
  margin-top: 8px;
  padding: 10px;
  background: var(--side-item-hover);
  border: 1px solid var(--side-border);
  border-radius: var(--radius-sm);
}

.key-label {
  font-size: 11px;
  color: var(--warning-text);
  margin-bottom: 5px;
  font-weight: 600;
}

.key-textarea {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--side-border);
  border-radius: var(--radius-xs);
  background: rgba(0, 0, 0, 0.28);
  color: var(--success-text);
  font-size: 11px;
  font-family: var(--font-mono);
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  word-break: break-all;
}

.panel-loading,
.panel-empty {
  font-size: 13px;
  color: var(--side-text-faint);
  padding: 8px 0;
  text-align: center;
}
</style>
