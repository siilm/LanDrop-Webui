<script setup lang="ts">
import { computed } from 'vue'
import { icons } from '@/assets/icons'

const props = defineProps<{
  name: string
  size?: number | string
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

.svg-icon :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
