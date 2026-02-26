import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as adminApi from '../lib/admin-api'

export const useAdminStore = defineStore('admin', () => {
  const users = ref([])
  const stats = ref(null)
  const roleDefaults = ref({ admin: [], user: [] })
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

  return {
    users,
    stats,
    roleDefaults,
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
    updateUserSourceOverrides
  }
})
