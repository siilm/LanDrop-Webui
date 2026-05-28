<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  invite: [userIds: string[]]
  close: []
}>()

const inviteUserId = ref('')
const inviting = ref(false)

async function handleInvite() {
  const ids = inviteUserId.value
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ids.length === 0) return

  inviting.value = true
  emit('invite', ids)
  inviteUserId.value = ''
  inviting.value = false
}
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
          @keyup.enter="handleInvite"
        />
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
  font-family: monospace;
  letter-spacing: 1px;
}

.modal-input:focus {
  border-color: #0f3460;
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
