<script setup>
import { onMounted, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import * as api from '../lib/api'

const router = useRouter()
const store = useChatStore()

const profile = reactive({
  name: '',
  department: '',
  sede: '',
  bio: ''
})
const prefs = reactive({
  preferred_ai_provider: 'claude',
  preferred_language: 'es',
  preferred_theme: 'dark'
})
const avatarPath = ref(null)
const sources = ref(null)
const profileMsg = ref('')
const profileError = ref('')
const passwordForm = reactive({ currentPassword: '', newPassword: '' })
const passwordMsg = ref('')
const passwordError = ref('')
const saving = ref(false)

onMounted(async () => {
  // Load profile data
  if (store.user) {
    profile.name = store.user.name || ''
    profile.department = store.user.department || ''
    profile.sede = store.user.sede || ''
  }

  // Load preferences
  try {
    const p = await api.getPreferences()
    prefs.preferred_ai_provider = p.preferred_ai_provider || 'claude'
    prefs.preferred_language = p.preferred_language || 'es'
    prefs.preferred_theme = p.preferred_theme || 'dark'
    avatarPath.value = p.avatar_path
    profile.bio = p.bio || ''
  } catch { /* ignore */ }

  // Load source access
  try {
    sources.value = await api.getMySourceAccess()
  } catch { /* ignore */ }
})

async function saveProfile() {
  saving.value = true
  profileMsg.value = ''
  profileError.value = ''
  try {
    await store.updateProfile({
      name: profile.name,
      department: profile.department,
      sede: profile.sede,
      bio: profile.bio
    })
    profileMsg.value = 'Perfil actualizado'
    setTimeout(() => profileMsg.value = '', 3000)
  } catch (e) {
    profileError.value = e.message
  } finally {
    saving.value = false
  }
}

async function savePrefs() {
  try {
    await api.updatePreferences(prefs)
    store.preferences = { ...prefs }
    profileMsg.value = 'Preferencias actualizadas'
    setTimeout(() => profileMsg.value = '', 3000)
  } catch (e) {
    profileError.value = e.message
  }
}

async function handleChangePassword() {
  passwordMsg.value = ''
  passwordError.value = ''
  if (!passwordForm.currentPassword || !passwordForm.newPassword) {
    passwordError.value = 'Ambos campos son requeridos'
    return
  }
  try {
    await api.changePassword(passwordForm)
    passwordMsg.value = 'Contraseña actualizada'
    passwordForm.currentPassword = ''
    passwordForm.newPassword = ''
  } catch (e) {
    passwordError.value = e.message
  }
}

async function handleAvatarUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    const result = await api.uploadAvatar(file)
    avatarPath.value = result.avatar_path
  } catch (e) {
    profileError.value = e.message
  }
}

const sourceLabels = {
  bookstack: 'BookStack (Wiki)',
  rag: 'RAG (Docs Locales)',
  fibras: 'Fibras (Conectividad)',
  crm: 'CRM (Tickets)'
}

function getInitials() {
  const name = store.user?.name || ''
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
}
</script>

<template>
  <div class="h-full bg-gray-900 overflow-y-auto">
    <div class="max-w-2xl mx-auto py-8 px-4">
      <button @click="router.push('/')" class="text-sm text-gray-400 hover:text-gray-200 mb-6 inline-flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        Volver al Chat
      </button>

      <h1 class="text-2xl font-bold text-white mb-6">Mi Perfil</h1>

      <!-- Messages -->
      <div v-if="profileError" class="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">{{ profileError }}</div>
      <div v-if="profileMsg" class="mb-4 p-3 bg-green-900/30 border border-green-800 rounded-lg text-green-400 text-sm">{{ profileMsg }}</div>

      <!-- Avatar -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Avatar</h2>
        <div class="flex items-center gap-4">
          <div class="w-20 h-20 rounded-full bg-[#252b45] flex items-center justify-center overflow-hidden">
            <img v-if="avatarPath" :src="avatarPath" class="w-full h-full object-cover" />
            <span v-else class="text-2xl font-bold text-cyan-400">{{ getInitials() }}</span>
          </div>
          <label class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600">
            Cambiar Avatar
            <input type="file" accept="image/*" class="hidden" @change="handleAvatarUpload" />
          </label>
        </div>
      </div>

      <!-- Profile info -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Información</h2>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Nombre</label>
            <input v-model="profile.name" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">Departamento</label>
              <input v-model="profile.department" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-1">Sede</label>
              <input v-model="profile.sede" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Bio</label>
            <textarea v-model="profile.bio" rows="3" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500 resize-none" />
          </div>
        </div>
        <button @click="saveProfile" :disabled="saving" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50">
          {{ saving ? 'Guardando...' : 'Guardar' }}
        </button>
      </div>

      <!-- Password -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Cambiar Contraseña</h2>
        <div v-if="passwordError" class="mb-3 text-red-400 text-sm">{{ passwordError }}</div>
        <div v-if="passwordMsg" class="mb-3 text-green-400 text-sm">{{ passwordMsg }}</div>
        <div class="space-y-3">
          <input v-model="passwordForm.currentPassword" type="password" placeholder="Contraseña actual" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <input v-model="passwordForm.newPassword" type="password" placeholder="Nueva contraseña (min 6 chars)" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
        </div>
        <button @click="handleChangePassword" class="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700">
          Cambiar Contraseña
        </button>
      </div>

      <!-- Preferences -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Preferencias</h2>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Proveedor IA</label>
            <select v-model="prefs.preferred_ai_provider" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500">
              <option value="claude">Claude</option>
              <option value="groq">Groq</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Idioma</label>
            <select v-model="prefs.preferred_language" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500">
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Tema</label>
            <select v-model="prefs.preferred_theme" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500">
              <option value="dark">Oscuro</option>
              <option value="light">Claro</option>
            </select>
          </div>
        </div>
        <button @click="savePrefs" class="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
          Guardar Preferencias
        </button>
      </div>

      <!-- My sources (read-only) -->
      <div v-if="sources" class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Mis Fuentes de Datos</h2>
        <div class="space-y-2">
          <div
            v-for="(label, key) in sourceLabels"
            :key="key"
            class="flex items-center justify-between bg-[#252b45] rounded-lg px-4 py-3"
          >
            <span class="text-sm text-gray-200">{{ label }}</span>
            <span
              class="text-xs font-medium px-2 py-0.5 rounded-full"
              :class="sources[key] ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'"
            >
              {{ sources[key] ? 'Habilitada' : 'Deshabilitada' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
