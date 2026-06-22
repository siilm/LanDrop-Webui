<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  content?: string
}>()

const emit = defineEmits<{
  save: [content: string]
  close: []
}>()

const editContent = ref('')

watch(
  () => props.visible,
  (v) => {
    if (v) editContent.value = props.content || ''
  },
)
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-dialog">
        <h3>✏️ 编辑消息</h3>
        <textarea
          v-model="editContent"
          class="modal-input edit-textarea"
          rows="4"
          placeholder="输入新内容..."
        ></textarea>
        <div class="modal-actions">
          <button class="btn-sm btn-cancel" @click="emit('close')">取消</button>
          <button
            class="btn-sm"
            @click="emit('save', editContent)"
            :disabled="!editContent.trim()"
          >
            保存
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

.edit-textarea {
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
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
