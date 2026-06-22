<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  rename: [newName: string]
  close: []
}>()

const newUsername = ref('')
const errorMsg = ref('')
const renaming = ref(false)

watch(
  () => props.visible,
  (v) => {
    if (v) {
      newUsername.value = ''
      errorMsg.value = ''
    }
  },
)

async function handleRename() {
  const name = newUsername.value.trim()
  if (!name) {
    errorMsg.value = '用户名不能为空'
    return
  }
  if (name.length > 25) {
    errorMsg.value = '用户名最长 25 个字符'
    return
  }
  renaming.value = true
  emit('rename', name)
  newUsername.value = ''
  renaming.value = false
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-dialog">
        <h3>修改用户名</h3>
        <p class="modal-hint">
          修改后的用户名将作为你的昵称显示。<br />
          最长 <strong>25</strong> 个字符。
        </p>
        <input
          v-model="newUsername"
          type="text"
          placeholder="输入新的用户名"
          maxlength="25"
          class="modal-input"
          @keyup.enter="handleRename"
        />
        <div v-if="errorMsg" class="modal-error">{{ errorMsg }}</div>
        <div class="modal-actions">
          <button class="btn-sm btn-cancel" @click="emit('close')">取消</button>
          <button class="btn-sm" @click="handleRename" :disabled="renaming">
            {{ renaming ? '修改中...' : '确认修改' }}
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
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.modal-input::placeholder {
  color: var(--text-muted);
}

.modal-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--accent-muted);
  background: var(--input-bg-hover);
}

.modal-error {
  color: var(--danger-text);
  font-size: 13px;
  margin-top: 8px;
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
