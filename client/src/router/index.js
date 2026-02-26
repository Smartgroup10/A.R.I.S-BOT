import { createRouter, createWebHistory } from 'vue-router'
import { useChatStore } from '../stores/chat'

const ChatView = () => import('../views/ChatView.vue')
const ProfileView = () => import('../views/ProfileView.vue')
const AdminLayout = () => import('../views/admin/AdminLayout.vue')
const AdminDashboard = () => import('../views/admin/AdminDashboard.vue')
const AdminUsers = () => import('../views/admin/AdminUsers.vue')
const AdminUserEdit = () => import('../views/admin/AdminUserEdit.vue')
const AdminSources = () => import('../views/admin/AdminSources.vue')
const SetupPassword = () => import('../views/SetupPassword.vue')

const routes = [
  {
    path: '/setup',
    name: 'setup-password',
    component: SetupPassword
  },
  {
    path: '/',
    name: 'chat',
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfileView,
    meta: { requiresAuth: true }
  },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requiresAuth: true, requiresAdmin: true },
    children: [
      { path: '', name: 'admin-dashboard', component: AdminDashboard },
      { path: 'users', name: 'admin-users', component: AdminUsers },
      { path: 'users/:id', name: 'admin-user-edit', component: AdminUserEdit, props: true },
      { path: 'sources', name: 'admin-sources', component: AdminSources }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const store = useChatStore()

  // Allow '/' always — App.vue handles auth with UserContext component
  if (to.path === '/') return

  if (to.meta.requiresAuth && !store.isAuthenticated) {
    return '/'
  }

  if (to.meta.requiresAdmin && store.user?.role !== 'admin') {
    return '/'
  }
})

export default router
