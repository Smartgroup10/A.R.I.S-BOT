<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAdminStore } from '../../stores/admin'
import { useChatStore } from '../../stores/chat'

const admin = useAdminStore()
const chatStore = useChatStore()
const router = useRouter()
const currentUserId = computed(() => chatStore.user?.id)
const search = ref('')
const showCreate = ref(false)
const createError = ref('')
const createSuccess = ref('')
const newUser = ref({ email: '', name: '', department: '', sede: '', role: 'user' })

onMounted(() => {
  admin.loadUsers()
})

const filteredUsers = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return admin.users
  return admin.users.filter(u =>
    u.name?.toLowerCase().includes(q) ||
    u.email?.toLowerCase().includes(q) ||
    u.department?.toLowerCase().includes(q)
  )
})

async function handleCreate() {
  createError.value = ''
  createSuccess.value = ''
  try {
    const result = await admin.createUser(newUser.value)
    showCreate.value = false
    newUser.value = { email: '', name: '', department: '', sede: '', role: 'user' }
    createSuccess.value = result.emailSent
      ? 'Usuario creado. Se ha enviado email de configuración de contraseña.'
      : 'Usuario creado (email no configurado — el usuario necesitará un enlace de configuración).'
    setTimeout(() => { createSuccess.value = '' }, 5000)
  } catch (e) {
    createError.value = e.message
  }
}

async function toggleActive(user) {
  try {
    await admin.updateUser(user.id, { active: user.active ? 0 : 1 })
    await admin.loadUsers()
  } catch (e) {
    alert(e.message)
  }
}

async function handleDelete(user) {
  if (!confirm('¿Eliminar permanentemente a ' + user.name + ' (' + user.email + ')? Esta accion no se puede deshacer.')) return
  try {
    await admin.deleteUser(user.id)
  } catch (e) {
    alert('Error: ' + e.message)
  }
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-white">Usuarios</h1>
      <button
        @click="showCreate = true"
        class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
      >
        Crear Usuario
      </button>
    </div>

    <!-- Success toast -->
    <div v-if="createSuccess" class="mb-4 px-4 py-3 bg-green-900/30 border border-green-700/50 rounded-lg text-sm text-green-400">
      {{ createSuccess }}
    </div>

    <!-- Search -->
    <input
      v-model="search"
      type="text"
      placeholder="Buscar por nombre, email o departamento..."
      class="w-full mb-4 px-4 py-2 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
    />

    <!-- Table -->
    <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] overflow-hidden">
      <table class="w-full">
        <thead class="bg-[#252b45] text-xs text-gray-400 uppercase">
          <tr>
            <th class="px-4 py-3 text-left">Nombre</th>
            <th class="px-4 py-3 text-left">Email</th>
            <th class="px-4 py-3 text-left">Departamento</th>
            <th class="px-4 py-3 text-center">Rol</th>
            <th class="px-4 py-3 text-center">Estado</th>
            <th class="px-4 py-3 text-center">Acciones</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#252b45]">
          <tr v-for="u in filteredUsers" :key="u.id" class="hover:bg-[#252b45]/50">
            <td class="px-4 py-3 text-sm text-gray-200">{{ u.name }}</td>
            <td class="px-4 py-3 text-sm text-gray-400">{{ u.email }}</td>
            <td class="px-4 py-3 text-sm text-gray-400">{{ u.department || '—' }}</td>
            <td class="px-4 py-3 text-center">
              <span
                class="px-2 py-0.5 rounded-full text-xs font-medium"
                :class="u.role === 'admin' ? 'bg-cyan-900/40 text-cyan-400' : 'bg-gray-700 text-gray-300'"
              >
                {{ u.role || 'user' }}
              </span>
            </td>
            <td class="px-4 py-3 text-center">
              <button
                @click="toggleActive(u)"
                class="px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer"
                :class="u.active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'"
              >
                {{ u.active ? 'Activo' : 'Inactivo' }}
              </button>
            </td>
            <td class="px-4 py-3 text-center space-x-3">
              <button
                @click="router.push({ name: 'admin-user-edit', params: { id: u.id } })"
                class="text-cyan-400 hover:text-cyan-300 text-sm"
              >
                Editar
              </button>
              <button
                v-if="u.id != currentUserId"
                @click="handleDelete(u)"
                class="text-red-400 hover:text-red-300 text-sm"
              >
                Eliminar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create user modal -->
    <div v-if="showCreate" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-6 w-full max-w-md">
        <h2 class="text-lg font-semibold text-white mb-4">Crear Usuario</h2>
        <div v-if="createError" class="mb-3 text-red-400 text-sm">{{ createError }}</div>
        <div class="space-y-3">
          <input v-model="newUser.email" placeholder="Email" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <input v-model="newUser.name" placeholder="Nombre" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <input v-model="newUser.department" placeholder="Departamento" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <input v-model="newUser.sede" placeholder="Sede" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          <select v-model="newUser.role" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500">
            <option value="user">Usuario</option>
            <option value="admin">Administrador</option>
          </select>
          <p class="text-xs text-gray-500">Se enviará un email para que el usuario configure su propia contraseña.</p>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button @click="showCreate = false" class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
          <button @click="handleCreate" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">Crear</button>
        </div>
      </div>
    </div>
  </div>
</template>
