<script setup lang="ts">
import { ref, nextTick } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

const props = defineProps<{
  file: File
}>()

const emit = defineEmits<{
  confirm: [blob: Blob]
  cancel: []
}>()

const imageUrl = ref('')
const imageEl = ref<HTMLImageElement | null>(null)
let cropper: Cropper | null = null
const selectedSize = ref(256)
const sizes = [256, 128, 64]

const reader = new FileReader()
reader.onload = (e) => {
  imageUrl.value = e.target?.result as string
}
reader.readAsDataURL(props.file)

function onImageLoad() {
  nextTick(() => {
    if (!imageEl.value) return
    cropper?.destroy()
    cropper = new Cropper(imageEl.value, {
      aspectRatio: 1,
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      cropBoxMovable: true,
      cropBoxResizable: true,
      background: false,
      minCropBoxWidth: 64,
      minCropBoxHeight: 64,
    })
  })
}

function confirm() {
  if (!cropper) return
  const size = selectedSize.value
  const canvas = cropper.getCroppedCanvas({
    width: size,
    height: size,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  })
  canvas.toBlob((blob: Blob | null) => {
    if (blob) emit('confirm', blob)
  }, props.file.type || 'image/png')
}

function cancel() {
  cropper?.destroy()
  cropper = null
  emit('cancel')
}
</script>

<template>
  <Teleport to="body">
    <div class="cropper-overlay" @click.self="cancel">
      <div class="cropper-modal">
        <div class="cropper-header">
          <span class="cropper-title">裁切头像</span>
          <span class="cropper-hint">1:1 比例</span>
        </div>
        <div class="cropper-stage">
          <img
            v-if="imageUrl"
            ref="imageEl"
            :src="imageUrl"
            @load="onImageLoad"
            alt="裁切预览"
          />
        </div>
        <div class="size-options">
          <span class="size-label">输出尺寸：</span>
          <button
            v-for="s in sizes"
            :key="s"
            class="size-btn"
            :class="{ active: selectedSize === s }"
            @click="selectedSize = s"
          >
            {{ s }}×{{ s }}
          </button>
        </div>
        <div class="cropper-actions">
          <button class="btn-cancel" @click="cancel">取消</button>
          <button class="btn-confirm" @click="confirm">确认上传</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cropper-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--overlay);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: ld-overlay-in 0.25s ease both;
}

.cropper-modal {
  background: var(--surface-solid);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 90vw;
  max-width: 520px;
  padding: 22px;
  box-shadow: var(--shadow-lg);
  animation: ld-pop-in 0.4s var(--ease-out-expo) both;
}

.cropper-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 16px;
}

.cropper-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
}

.cropper-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.cropper-stage {
  position: relative;
  width: 100%;
  max-height: 420px;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: var(--bg);
}

.cropper-stage img {
  display: block;
  max-width: 100%;
}

.size-options {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.size-label {
  font-size: 13px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.size-btn {
  padding: 6px 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.size-btn:hover {
  border-color: var(--accent);
  color: var(--accent-text);
}

.size-btn.active {
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  border-color: transparent;
  color: #fff;
}

.cropper-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 18px;
}

.btn-cancel {
  padding: 9px 22px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.btn-cancel:hover {
  border-color: var(--text-secondary);
  color: var(--text);
}

.btn-confirm {
  padding: 9px 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--brand), var(--brand-light));
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}

.btn-confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 22px var(--accent-glow);
}
</style>
