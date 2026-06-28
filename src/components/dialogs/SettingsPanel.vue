<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useChatStore } from '@/stores/chat'
import { avatarBlobCache, fileBlobCache } from '@/utils/BlobCache'
import SvgIcon from '@/components/SvgIcon.vue'

defineProps<{ visible: boolean }>()

const emit = defineEmits<{
  close: []
  rename: []
  uploadAvatar: []
}>()

const authStore = useAuthStore()
const chatStore = useChatStore()

// ---- 个人信息 (computed from stores) ----
const globalRoleLabel = computed(() => {
  const r = authStore.globalRole
  if (r === 'owner') return '拥有者'
  if (r === 'public_admin') return '公共管理员'
  return '成员'
})

const joinedRoomCount = computed(() => chatStore.rooms.length)

// ---- 滚动行为 ----
type ScrollOpt = 'bottom' | 'lastPosition'
function onScrollChange(e: Event) {
  chatStore.setScrollBehavior((e.target as HTMLSelectElement).value as ScrollOpt)
}

// ---- 消息密度 ----
type DensityOpt = 'compact' | 'normal' | 'comfortable'
const densityOptions: { value: DensityOpt; label: string }[] = [
  { value: 'compact', label: '紧凑' },
  { value: 'normal', label: '标准' },
  { value: 'comfortable', label: '舒适' },
]

// ---- 清除数据 ----
const clearMsg = ref('')
const clearing = ref(false)

async function handleClearCache() {
  clearing.value = true
  try {
    await Promise.all([
      avatarBlobCache.clear(),
      fileBlobCache.clear(),
    ])
    clearMsg.value = '✅ 缓存已清除'
  } catch {
    clearMsg.value = '❌ 清除失败'
  } finally {
    clearing.value = false
    setTimeout(() => { clearMsg.value = '' }, 2500)
  }
}

function handleClearAllData() {
  if (confirm('⚠️ 将清除所有本地存储数据（登录会话、缓存、设置），确定？')) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('landrop_'))
    for (const k of keys) localStorage.removeItem(k)
    clearMsg.value = '✅ 已清除，刷新后生效'
    setTimeout(() => { clearMsg.value = '' }, 2500)
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="panel-slide">
      <div v-if="visible" class="settings-overlay" @click.self="emit('close')">
        <div class="settings-panel">
          <!-- 头部 -->
          <div class="panel-header">
            <span><SvgIcon name="self_settings" :size="22" inline /> 设置</span>
            <button class="btn-close" @click="emit('close')" title="关闭">×</button>
          </div>

          <div class="panel-body">
            <!-- ── 个人信息 ── -->
            <section class="settings-section">
              <div class="section-title">👤 个人信息</div>
              <div class="info-grid">
                <div class="info-row">
                  <span class="info-label">用户 ID</span>
                  <span class="info-value mono">{{ authStore.userId }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">用户名</span>
                  <span class="info-value">{{ authStore.username }}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">全局角色</span>
                  <span class="info-value role-badge" :class="'role-' + authStore.globalRole">
                    {{ globalRoleLabel }}
                  </span>
                </div>
                <div class="info-row">
                  <span class="info-label">加入的房间</span>
                  <span class="info-value">{{ joinedRoomCount }} 个</span>
                </div>
              </div>
              <div class="info-actions">
                <button class="btn-sm" @click="emit('rename')"><SvgIcon name="edit" :size="18" inline /> 更改用户名</button>
                <button class="btn-sm" @click="emit('uploadAvatar')"><SvgIcon name="image_arrow_up" :size="18" inline /> 更改头像</button>
              </div>
            </section>

            <!-- ── 浏览 ── -->
            <section class="settings-section">
              <div class="section-title">📜 浏览</div>
              <div class="setting-row">
                <span class="setting-label">进入房间时</span>
                <select
                  class="setting-select"
                  :value="chatStore.scrollBehavior"
                  @change="onScrollChange"
                >
                  <option value="bottom">回到底部</option>
                  <option value="lastPosition">从离开的位置继续</option>
                </select>
              </div>
              <div class="setting-row">
                <span class="setting-label">消息密度</span>
                <div class="density-group">
                  <button
                    v-for="d in densityOptions"
                    :key="d.value"
                    class="density-btn"
                    :class="{ active: chatStore.messageDensity === d.value }"
                    @click="chatStore.setMessageDensity(d.value)"
                  >{{ d.label }}</button>
                </div>
              </div>
            </section>

            <!-- ── 数据 ── -->
            <section class="settings-section">
              <div class="section-title">💾 数据</div>
              <div class="info-actions">
                <button class="btn-sm btn-sm--danger" @click="handleClearCache" :disabled="clearing">
                  <template v-if="clearing">清除中...</template>
                  <template v-else><SvgIcon name="delete" :size="18" inline /> 清除本地缓存</template>
                </button>
                <button class="btn-sm btn-sm--danger" @click="handleClearAllData">
                  <SvgIcon name="dangerous" :size="18" inline /> 清除所有本地数据
                </button>
              </div>
              <div v-if="clearMsg" class="clear-msg">{{ clearMsg }}</div>
            </section>

            <!-- ── 关于 ── -->
            <section class="settings-section">
              <div class="section-title">ℹ️ 关于</div>
              <p class="about-text">
                LanDrop WebUI — 安全 &middot; 去中心化即时通讯<br />
                基于 Vue 3 + TypeScript + Vite 构建。
              </p>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ================================================================
   Overlay + Panel Layout
   ================================================================ */
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 9990;
  background: var(--overlay);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
}

.settings-panel {
  width: 320px;
  max-width: 85vw;
  height: 100vh;
  background: var(--side-bg);
  color: var(--side-text);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg), 4px 0 24px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--side-border);
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

.btn-close {
  background: transparent;
  border: none;
  color: var(--side-text-dim);
  font-size: 22px;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-xs);
  transition: color 0.18s ease, background 0.18s ease, transform 0.2s var(--ease-bounce);
}

.btn-close:hover {
  color: var(--side-text);
  background: var(--side-item-hover);
  transform: rotate(90deg);
}

/* ================================================================
   Body
   ================================================================ */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 24px;
}

.settings-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--side-text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--side-border-soft);
}

/* info grid */
.info-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
}

.info-label {
  color: var(--side-text-dim);
  flex-shrink: 0;
}

.info-value {
  color: var(--side-text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-value.mono {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--side-text-faint);
}

.role-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
}

.role-owner { background: var(--role-owner-bg); color: var(--role-owner-text); }
.role-public_admin { background: var(--role-admin-bg); color: var(--role-admin-text); }
.role-member { background: var(--role-member-bg); color: var(--role-member-text); }

.info-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* buttons */
.btn-sm {
  padding: 6px 12px;
  border: 1px solid var(--side-border);
  border-radius: var(--radius-sm);
  background: var(--side-item-hover);
  color: var(--side-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.15s ease, border-color 0.18s ease;
}

.btn-sm:hover {
  background: var(--side-btn-bg-hover);
  transform: translateY(-1px);
}

.btn-sm--danger {
  color: var(--danger-text);
  border-color: var(--danger-border);
}

.btn-sm--danger:hover {
  background: var(--danger-bg);
}

/* setting rows */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 13px;
}

.setting-label {
  color: var(--side-text);
  flex-shrink: 0;
}

.setting-select {
  padding: 5px 10px;
  border: 1px solid var(--side-border);
  border-radius: var(--radius-sm);
  background: var(--side-input-bg);
  color: var(--side-text);
  font-size: 12px;
  font-family: var(--font-sans);
  outline: none;
  cursor: pointer;
  transition: border-color 0.18s ease;
}

.setting-select:focus {
  border-color: var(--side-accent);
}

/* density group */
.density-group {
  display: flex;
  gap: 2px;
}

.density-btn {
  padding: 4px 10px;
  border: 1px solid var(--side-border);
  background: transparent;
  color: var(--side-text-dim);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.density-btn:first-child { border-radius: var(--radius-xs) 0 0 var(--radius-xs); }
.density-btn:last-child { border-radius: 0 var(--radius-xs) var(--radius-xs) 0; }

.density-btn.active {
  background: var(--side-btn-bg);
  color: var(--side-text);
  border-color: var(--side-accent);
}

.density-btn:hover:not(.active) {
  background: var(--side-item-hover);
  color: var(--side-text);
}

/* clear msg */
.clear-msg {
  font-size: 12px;
  color: var(--success-text);
  margin-top: 8px;
}

/* about */
.about-text {
  font-size: 12px;
  color: var(--side-text-faint);
  line-height: 1.6;
  margin: 0;
}

/* ================================================================
   Slide Animation
   ================================================================ */
.panel-slide-enter-active {
  transition: opacity 0.28s var(--ease-out-expo);
}
.panel-slide-enter-active .settings-panel {
  transition: transform 0.34s var(--ease-out-expo);
}
.panel-slide-leave-active {
  transition: opacity 0.2s ease;
}
.panel-slide-leave-active .settings-panel {
  transition: transform 0.24s var(--ease-in-out);
}

.panel-slide-enter-from { opacity: 0; }
.panel-slide-enter-from .settings-panel { transform: translateX(-100%); }
.panel-slide-leave-to { opacity: 0; }
.panel-slide-leave-to .settings-panel { transform: translateX(-40%); }
</style>
