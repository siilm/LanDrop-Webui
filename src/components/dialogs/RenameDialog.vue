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
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9998;
}

.modal-dialog {
  background: #fff;
  border-radius: 12px;
  padding: 28px 32px;
  width: 380px;
  max-width: 90vw;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-dialog h3 {
  margin: 0 0 12px;
  font-size: 18px;
}

.modal-hint {
  font-size: 13px;
  color: #666;
  margin: 0 0 16px;
  line-height: 1.6;
}

.modal-input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.modal-input:focus {
  border-color: #0f3460;
}

.modal-error {
  color: #e74c3c;
  font-size: 13px;
  margin-top: 8px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.btn-sm {
  padding: 6px 12px;
  background: #27ae60;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.btn-sm:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-cancel {
  background: transparent;
  border: 1px solid #ddd;
  color: #999;
}

.btn-cancel:hover {
  border-color: #999;
  color: #333;
}
</style>
