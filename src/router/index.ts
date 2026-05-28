import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import LoginPage from '@/views/LoginPage.vue'
import ChatPage from '@/views/ChatPage.vue'

const routes = [
  {
    path: '/',
    redirect: '/chat',
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
  },
  {
    path: '/chat',
    name: 'Chat',
    component: ChatPage,
    meta: { requiresAuth: true },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, _from) => {
  const authStore = useAuthStore()
  const isLoggedIn = authStore.isLoggedIn

  if (to.meta.requiresAuth && !isLoggedIn) {
    return '/login'
  }

  if (to.path === '/login' && isLoggedIn) {
    return '/chat'
  }
})

export default router
