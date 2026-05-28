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
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cropper-modal {
  background: #1a1a2e;
  border-radius: 12px;
  width: 90vw;
  max-width: 520px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
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
  color: #e0e0e0;
}

.cropper-hint {
  font-size: 12px;
  color: #888;
}

.cropper-stage {
  position: relative;
  width: 100%;
  max-height: 420px;
  overflow: hidden;
  border-radius: 8px;
  background: #0f0f1e;
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
  color: #aaa;
  white-space: nowrap;
}

.size-btn {
  padding: 6px 14px;
  border: 1px solid #444;
  border-radius: 6px;
  background: transparent;
  color: #ccc;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.size-btn:hover {
  border-color: #4a9eff;
  color: #4a9eff;
}

.size-btn.active {
  background: #4a9eff;
  border-color: #4a9eff;
  color: #fff;
}

.cropper-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 18px;
}

.btn-cancel {
  padding: 8px 20px;
  border: 1px solid #555;
  border-radius: 6px;
  background: transparent;
  color: #aaa;
  font-size: 14px;
  cursor: pointer;
}

.btn-cancel:hover {
  border-color: #888;
  color: #ddd;
}

.btn-confirm {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  background: #4a9eff;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-confirm:hover {
  background: #3a8eef;
}
</style>
