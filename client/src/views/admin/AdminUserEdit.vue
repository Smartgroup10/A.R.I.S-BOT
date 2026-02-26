<script setup>
import { onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAdminStore } from '../../stores/admin'
import { fetchAdminUser } from '../../lib/admin-api'

const props = defineProps({ id: [String, Number] })
const router = useRouter()
const route = useRoute()
const admin = useAdminStore()

const userData = ref(null)
const prefs = ref(null)
const sourceAccess = ref(null)
const overrides = ref([])
const saving = ref(false)
const error = ref('')
const success = ref('')
const newPassword = ref('')
const passwordMsg = ref('')

const sourceLabels = {
  bookstack: 'BookStack (Wiki)',
  rag: 'RAG (Docs Locales)',
  fibras: 'Fibras (Conectividad)',
  crm: 'CRM (Tickets)'
}

onMounted(async () => {
  await loadUser()
})

async function loadUser() {
  try {
    const data = await fetchAdminUser(props.id || route.params.id)
    userData.value = data.user
    prefs.value = data.preferences
    sourceAccess.value = data.sourceAccess
    overrides.value = data.overrides || []
  } catch (e) {
    error.value = e.message
  }
}

async function saveUser() {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    await admin.updateUser(userData.value.id, {
      name: userData.value.name,
      email: userData.value.email,
      department: userData.value.department,
      sede: userData.value.sede,
      role: userData.value.role,
      active: userData.value.active
    })
    success.value = 'Usuario actualizado'
    setTimeout(() => success.value = '', 3000)
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function handleResetPassword() {
  passwordMsg.value = ''
  if (!newPassword.value || newPassword.value.length < 6) {
    passwordMsg.value = 'Mínimo 6 caracteres'
    return
  }
  try {
    await admin.resetPassword(userData.value.id, newPassword.value)
    passwordMsg.value = 'Contraseña actualizada'
    newPassword.value = ''
  } catch (e) {
    passwordMsg.value = e.message
  }
}

function hasOverride(key) {
  return overrides.value.some(o => o.source_key === key)
}

async function toggleSource(key) {
  const current = sourceAccess.value[key]
  const newSources = { [key]: !current }
  try {
    const result = await admin.updateUserSourceOverrides(userData.value.id, newSources)
    sourceAccess.value = result
    await loadUser()
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto">
    <button @click="router.push({ name: 'admin-users' })" class="text-sm text-gray-400 hover:text-gray-200 mb-4 inline-flex items-center gap-1">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
      Volver a Usuarios
    </button>

    <div v-if="error && !userData" class="text-red-400">{{ error }}</div>

    <template v-if="userData">
      <h1 class="text-2xl font-bold text-white mb-6">Editar: {{ userData.name }}</h1>

      <!-- Messages -->
      <div v-if="error" class="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-4 p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-400 text-sm">{{ success }}</div>

      <!-- User info -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Información</h2>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Nombre</label>
            <input v-model="userData.name" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Email</label>
            <input v-model="userData.email" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Departamento</label>
            <input v-model="userData.department" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Sede</label>
            <input v-model="userData.sede" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Rol</label>
            <select v-model="userData.role" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500">
              <option value="user">Usuario</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Estado</label>
            <select v-model="userData.active" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500">
              <option :value="1">Activo</option>
              <option :value="0">Inactivo</option>
            </select>
          </div>
        </div>
        <div class="mt-4">
          <button @click="saveUser" :disabled="saving" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50">
            {{ saving ? 'Guardando...' : 'Guardar Cambios' }}
          </button>
        </div>
      </div>

      <!-- Source access -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Acceso a Fuentes</h2>
        <div class="space-y-3">
          <div v-for="(label, key) in sourceLabels" :key="key" class="flex items-center justify-between bg-[#252b45] rounded-lg px-4 py-3">
            <div>
              <span class="text-sm text-gray-200">{{ label }}</span>
              <span v-if="hasOverride(key)" class="ml-2 text-xs text-yellow-400">(override)</span>
              <span v-else class="ml-2 text-xs text-gray-500">(rol default)</span>
            </div>
            <button
              @click="toggleSource(key)"
              class="relative w-11 h-6 rounded-full transition-colors"
              :class="sourceAccess[key] ? 'bg-cyan-500' : 'bg-gray-600'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                :class="sourceAccess[key] ? 'translate-x-5' : ''"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Password reset -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
        <h2 class="text-lg font-semibold text-white mb-4">Resetear Contraseña</h2>
        <div v-if="passwordMsg" class="mb-3 text-sm" :class="passwordMsg.includes('actualizada') ? 'text-green-400' : 'text-red-400'">{{ passwordMsg }}</div>
        <div class="flex gap-3">
          <input
            v-model="newPassword"
            type="password"
            placeholder="Nueva contraseña (min 6 chars)"
            class="flex-1 px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
          <button @click="handleResetPassword" class="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700">
            Resetear
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
