<script setup lang="ts">
import { computed } from 'vue'
import { icons } from '@/assets/icons'

const props = defineProps<{
  name: string
  size?: number | string
  /** 与文字同行时设为 true，自动对齐基线 */
  inline?: boolean
}>()

const svg = computed(() => icons[props.name] || '')
const sizePx = computed(() => {
  const s = props.size ?? 24
  return typeof s === 'number' ? `${s}px` : s
})
</script>

<template>
  <span
    v-if="svg"
    class="svg-icon"
    :class="{ 'svg-icon--inline': inline }"
    :style="{ width: sizePx, height: sizePx }"
    v-html="svg"
  />
</template>

<style scoped>
.svg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  flex-shrink: 0;
  line-height: 1;
}

/* 与文字同行时微调对齐 */
.svg-icon--inline {
  vertical-align: middle;
  margin-right: 3px;
}

.svg-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
