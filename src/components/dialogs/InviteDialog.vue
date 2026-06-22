<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  invite: [userIds: string[]]
  close: []
}>()

const USER_ID_RE = /^[A-Za-z0-9]{12}$/
const inviteUserId = ref('')
const inviting = ref(false)
const validationError = ref('')

// 解析已输入的 userId 列表（尚未验证）
const parsedIds = computed(() =>
  inviteUserId.value
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
)

// 检查是否有格式不合法的 userId
const invalidIds = computed(() =>
  parsedIds.value.filter((id) => !USER_ID_RE.test(id))
)

function handleInvite() {
  validationError.value = ''
  const ids = parsedIds.value
  if (ids.length === 0) return

  // 客户端格式校验
  const bad = invalidIds.value
  if (bad.length > 0) {
    validationError.value = `⚠️ userId 格式不合法（需 12 位字母数字）：${bad.join(', ')}`
    return
  }

  inviting.value = true
  emit('invite', ids)
  inviteUserId.value = ''
  inviting.value = false
}

// 弹窗关闭时清除错误
import { watch } from 'vue'
watch(() => props.visible, (v) => {
  if (!v) validationError.value = ''
})
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-dialog">
        <h3>✉️ 邀请用户</h3>
        <p class="modal-hint">输入要邀请的用户 ID（多个用逗号分隔）</p>
        <input
          v-model="inviteUserId"
          type="text"
          placeholder="用户ID1, 用户ID2, ..."
          class="modal-input"
          :class="{ 'input-error': invalidIds.length > 0 }"
          @keyup.enter="handleInvite"
        />
        <div v-if="validationError" class="validation-error">{{ validationError }}</div>
        <div v-else-if="invalidIds.length > 0" class="validation-hint">
          ⚠️ 格式不正确（需 12 位字母数字）：{{ invalidIds.join(', ') }}
        </div>
        <div class="modal-actions">
          <button class="btn-sm btn-cancel" @click="emit('close')">取消</button>
          <button
            class="btn-sm"
            @click="handleInvite"
            :disabled="inviting || !inviteUserId.trim()"
          >
            {{ inviting ? '邀请中...' : '发送邀请' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
  animation: ld-overlay-in 0.25s ease both;
}

.modal-dialog {
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 28px 32px;
  width: 380px;
  max-width: 90vw;
  box-shadow: var(--shadow-lg);
  animation: ld-pop-in 0.4s var(--ease-out-expo) both;
}

.modal-dialog h3 {
  margin: 0 0 12px;
  font-size: 18px;
  color: var(--text);
}

.modal-hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0 0 16px;
  line-height: 1.6;
}

.modal-input {
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text);
  background: var(--input-bg);
  outline: none;
  box-sizing: border-box;
  font-family: var(--font-mono);
  letter-spacing: 1px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.modal-input::placeholder {
  color: var(--text-muted);
  letter-spacing: normal;
}

.modal-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-muted);
  background: var(--input-bg-hover);
}

.modal-input.input-error {
  border-color: var(--danger);
}

.validation-error,
.validation-hint {
  font-size: 12px;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-xs);
  line-height: 1.5;
  word-break: break-all;
}

.validation-error {
  background: var(--danger-bg);
  color: var(--danger-text);
  border: 1px solid var(--danger-border);
}

.validation-hint {
  background: var(--warning-bg);
  color: var(--warning-text);
  border: 1px solid var(--warning-border);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 22px;
}

.btn-sm {
  padding: 8px 16px;
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
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

.btn-cancel {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
}

.btn-cancel:hover {
  border-color: var(--text-secondary);
  color: var(--text);
  box-shadow: none;
  transform: none;
}
</style>
