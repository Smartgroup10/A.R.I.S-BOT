import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as adminApi from '../lib/admin-api'

export const useAdminStore = defineStore('admin', () => {
  const users = ref([])
  const stats = ref(null)
  const roleDefaults = ref({ admin: [], user: [] })
  const userMetrics = ref([])
  const knowledgeArticles = ref([])
  const knowledgeStats = ref({ total: 0, totalUses: 0 })
  const loading = ref(false)

  async function loadStats() {
    loading.value = true
    try {
      stats.value = await adminApi.fetchAdminStats()
    } finally {
      loading.value = false
    }
  }

  async function loadUsers() {
    loading.value = true
    try {
      users.value = await adminApi.fetchAdminUsers()
    } finally {
      loading.value = false
    }
  }

  async function createUser(data) {
    const user = await adminApi.createAdminUser(data)
    users.value.push(user)
    return user
  }

  async function updateUser(id, data) {
    const updated = await adminApi.updateAdminUser(id, data)
    const idx = users.value.findIndex(u => u.id === id)
    if (idx >= 0) users.value[idx] = { ...users.value[idx], ...updated }
    return updated
  }

  async function deleteUser(id) {
    await adminApi.deleteAdminUser(id)
    users.value = users.value.filter(u => u.id !== id)
  }

  async function resetPassword(id, password) {
    return adminApi.resetAdminUserPassword(id, password)
  }

  async function loadRoleDefaults() {
    roleDefaults.value = await adminApi.fetchRoleDefaults()
  }

  async function updateRoleDefaults(role, sources) {
    await adminApi.updateRoleDefaults(role, sources)
    await loadRoleDefaults()
  }

  async function loadUserSourceAccess(userId) {
    return adminApi.fetchUserSourceAccess(userId)
  }

  async function updateUserSourceOverrides(userId, sources) {
    return adminApi.updateUserSourceOverrides(userId, sources)
  }

  async function loadUserMetrics() {
    try {
      userMetrics.value = await adminApi.fetchUserMetrics()
    } catch (err) {
      console.error('Error loading user metrics:', err)
    }
  }

  async function loadKnowledgeArticles() {
    try {
      const data = await adminApi.fetchKnowledgeArticles()
      knowledgeArticles.value = data.articles || []
      knowledgeStats.value = data.stats || { total: 0, totalUses: 0 }
    } catch (err) {
      console.error('Error loading KB articles:', err)
    }
  }

  async function updateKnowledgeArticle(id, data) {
    const updated = await adminApi.updateKnowledgeArticle(id, data)
    const idx = knowledgeArticles.value.findIndex(a => a.id === id)
    if (idx >= 0) knowledgeArticles.value[idx] = { ...knowledgeArticles.value[idx], ...updated }
    return updated
  }

  async function deleteKnowledgeArticle(id) {
    await adminApi.deleteKnowledgeArticle(id)
    knowledgeArticles.value = knowledgeArticles.value.filter(a => a.id !== id)
    knowledgeStats.value.total = Math.max(0, knowledgeStats.value.total - 1)
  }

  return {
    users,
    stats,
    roleDefaults,
    userMetrics,
    knowledgeArticles,
    knowledgeStats,
    loading,
    loadStats,
    loadUsers,
    createUser,
    updateUser,
    deleteUser,
    resetPassword,
    loadRoleDefaults,
    updateRoleDefaults,
    loadUserSourceAccess,
    updateUserSourceOverrides,
    loadUserMetrics,
    loadKnowledgeArticles,
    updateKnowledgeArticle,
    deleteKnowledgeArticle
  }
})
