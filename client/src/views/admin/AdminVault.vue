<script setup>
import { onMounted, ref, computed } from 'vue'
import { useAdminStore } from '../../stores/admin'
import { fetchVaultCredential } from '../../lib/admin-api'

const admin = useAdminStore()
const search = ref('')
const showModal = ref(false)
const editingId = ref(null)
const error = ref('')
const showPassword = ref(false)
const copiedId = ref(null)

const form = ref({
  name: '',
  username: '',
  password: '',
  url: '',
  notes: '',
  tags: '',
  departments: ''
})

onMounted(() => {
  admin.loadVault()
})

const filteredCredentials = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return admin.vaultCredentials
  return admin.vaultCredentials.filter(c =>
    c.name?.toLowerCase().includes(q) ||
    c.username?.toLowerCase().includes(q) ||
    c.tags?.toLowerCase().includes(q) ||
    c.url?.toLowerCase().includes(q)
  )
})

function openCreate() {
  editingId.value = null
  error.value = ''
  showPassword.value = false
  form.value = { name: '', username: '', password: '', url: '', notes: '', tags: '', departments: '' }
  showModal.value = true
}

async function openEdit(cred) {
  editingId.value = cred.id
  error.value = ''
  showPassword.value = false
  try {
    const full = await fetchVaultCredential(cred.id)
    form.value = {
      name: full.name || '',
      username: full.username || '',
      password: full.password || '',
      url: full.url || '',
      notes: full.notes || '',
      tags: full.tags || '',
      departments: full.departments || ''
    }
    showModal.value = true
  } catch (e) {
    error.value = e.message
  }
}

async function saveForm() {
  error.value = ''
  if (!form.value.name || !form.value.password) {
    error.value = 'Nombre y password son requeridos'
    return
  }
  try {
    if (editingId.value) {
      await admin.updateCredential(editingId.value, form.value)
    } else {
      await admin.createCredential(form.value)
    }
    showModal.value = false
  } catch (e) {
    error.value = e.message
  }
}

async function handleDelete(cred) {
  if (!confirm(`¿Eliminar la credencial "${cred.name}"? Esta acción no se puede deshacer.`)) return
  try {
    await admin.deleteCredential(cred.id)
  } catch (e) {
    alert('Error: ' + e.message)
  }
}

async function copyPassword(cred) {
  try {
    const full = await fetchVaultCredential(cred.id)
    await navigator.clipboard.writeText(full.password || '')
    copiedId.value = cred.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch (e) {
    alert('Error copiando: ' + e.message)
  }
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-white">Vault de Credenciales</h1>
      <button
        v-if="admin.vaultConfigured"
        @click="openCreate"
        class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Nueva Credencial
      </button>
    </div>

    <!-- Not configured warning -->
    <div v-if="!admin.vaultConfigured" class="mb-6 px-4 py-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-sm text-yellow-300">
      <p class="font-medium mb-1">Vault no configurado</p>
      <p class="text-yellow-400/70">Añade <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">VAULT_KEY=tu-clave-de-32-caracteres-aqui</code> al archivo <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">.env</code> y reinicia el servidor.</p>
    </div>

    <template v-else>
      <!-- Stats -->
      <div class="flex gap-4 mb-4">
        <div class="px-4 py-2 bg-[#1a1f36] rounded-lg border border-[#252b45] text-sm">
          <span class="text-gray-400">Credenciales:</span>
          <span class="text-cyan-400 ml-1 font-medium">{{ admin.vaultCredentials.length }}</span>
        </div>
      </div>

      <!-- Search -->
      <input
        v-model="search"
        type="text"
        placeholder="Buscar por nombre, usuario, tags o URL..."
        class="w-full mb-4 px-4 py-2 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
      />

      <!-- Table -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] overflow-hidden">
        <table class="w-full">
          <thead class="bg-[#252b45] text-xs text-gray-400 uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Nombre</th>
              <th class="px-4 py-3 text-left">Usuario</th>
              <th class="px-4 py-3 text-left">URL</th>
              <th class="px-4 py-3 text-left">Departamentos</th>
              <th class="px-4 py-3 text-left">Tags</th>
              <th class="px-4 py-3 text-left">Fecha</th>
              <th class="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#252b45]">
            <tr v-if="filteredCredentials.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-gray-500 text-sm">
                {{ search ? 'Sin resultados' : 'No hay credenciales en el vault' }}
              </td>
            </tr>
            <tr v-for="c in filteredCredentials" :key="c.id" class="hover:bg-[#252b45]/50">
              <td class="px-4 py-3 text-sm text-gray-200 font-medium">{{ c.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ c.username || '—' }}</td>
              <td class="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">
                <a v-if="c.url" :href="c.url" target="_blank" class="text-cyan-400 hover:text-cyan-300">{{ c.url }}</a>
                <span v-else>—</span>
              </td>
              <td class="px-4 py-3 text-sm">
                <template v-if="c.departments">
                  <span
                    v-for="dept in c.departments.split(',')"
                    :key="dept"
                    class="inline-block px-2 py-0.5 mr-1 mb-0.5 rounded-full text-xs bg-blue-900/30 text-blue-400"
                  >{{ dept.trim() }}</span>
                </template>
                <span v-else class="text-gray-500 text-xs">Todos</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-400 max-w-[150px] truncate">{{ c.tags || '—' }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(c.created_at) }}</td>
              <td class="px-4 py-3 text-center space-x-2 whitespace-nowrap">
                <button
                  @click="copyPassword(c)"
                  class="text-sm transition-colors"
                  :class="copiedId === c.id ? 'text-green-400' : 'text-gray-400 hover:text-gray-200'"
                  :title="copiedId === c.id ? 'Copiado!' : 'Copiar password'"
                >
                  <svg v-if="copiedId !== c.id" class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                  </svg>
                  <svg v-else class="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                </button>
                <button @click="openEdit(c)" class="text-cyan-400 hover:text-cyan-300 text-sm">Editar</button>
                <button @click="handleDelete(c)" class="text-red-400 hover:text-red-300 text-sm">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 class="text-lg font-semibold text-white mb-4">
          {{ editingId ? 'Editar Credencial' : 'Nueva Credencial' }}
        </h2>
        <div v-if="error" class="mb-3 text-red-400 text-sm">{{ error }}</div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Nombre *</label>
            <input v-model="form.name" placeholder="ej: Router Fibernet" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Usuario</label>
            <input v-model="form.username" placeholder="ej: admin" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Password *</label>
            <div class="relative">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Contraseña"
                class="w-full px-3 py-2 pr-10 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
              >
                <svg v-if="!showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">URL</label>
            <input v-model="form.url" placeholder="ej: https://192.168.1.1" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Notas</label>
            <textarea v-model="form.notes" rows="2" placeholder="Notas adicionales..." class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-y" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Tags (separados por coma)</label>
            <input v-model="form.tags" placeholder="ej: router, fibra, red" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Departamentos (separados por coma, vacío = todos)</label>
            <input v-model="form.departments" placeholder="ej: IT,Soporte (vacío = visible para todos)" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button @click="showModal = false" class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
          <button @click="saveForm" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">
            {{ editingId ? 'Guardar' : 'Crear' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
