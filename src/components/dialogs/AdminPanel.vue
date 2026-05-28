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
  padding: 12px 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: #1a1a2e;
  color: #fff;
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
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 16px;
}

.btn-close:hover {
  color: #fff;
}

.admin-section {
  margin-top: 12px;
}

.admin-section-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.admin-form-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.admin-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 12px;
  outline: none;
}

.admin-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.admin-input:focus {
  border-color: #3498db;
}

.btn-sm {
  padding: 6px 12px;
  background: #27ae60;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-sm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.admin-msg {
  margin-top: 6px;
  font-size: 12px;
  color: #2ecc71;
  word-break: break-all;
}

.admin-msg.error {
  color: #e74c3c;
}

.admin-list {
  margin-top: 8px;
}

.admin-list-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.admin-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  margin-bottom: 4px;
}

.btn-danger-sm {
  background: transparent;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.btn-danger-sm:hover {
  background: #e74c3c;
  color: #fff;
}

.key-display {
  margin-top: 8px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}

.key-label {
  font-size: 11px;
  color: #f39c12;
  margin-bottom: 4px;
  font-weight: 600;
}

.key-textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  color: #2ecc71;
  font-size: 11px;
  font-family: monospace;
  outline: none;
  resize: vertical;
  box-sizing: border-box;
  word-break: break-all;
}

.panel-loading,
.panel-empty {
  font-size: 13px;
  color: #999;
  padding: 8px 0;
  text-align: center;
}
</style>
