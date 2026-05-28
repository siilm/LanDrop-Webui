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

.edit-textarea {
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
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
