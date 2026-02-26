<script setup>
import { onMounted, ref } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()
const loading = ref(true)
const error = ref('')

const sourceLabels = {
  bookstack: 'BookStack (Wiki)',
  rag: 'RAG (Docs Locales)',
  fibras: 'Fibras (Conectividad)',
  crm: 'CRM (Tickets)'
}

onMounted(async () => {
  try {
    await admin.loadRoleDefaults()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

function getDefaultValue(role, key) {
  const items = admin.roleDefaults[role] || []
  const item = items.find(i => i.source_key === key)
  return item ? !!item.enabled : true
}

async function toggleRoleDefault(role, key) {
  const current = getDefaultValue(role, key)
  const sources = { [key]: !current }
  try {
    await admin.updateRoleDefaults(role, sources)
  } catch (e) {
    error.value = e.message
  }
}
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto">
    <h1 class="text-2xl font-bold text-white mb-6">Fuentes de Datos</h1>

    <div v-if="loading" class="text-gray-400 text-sm">Cargando...</div>

    <template v-else>
      <div v-if="error" class="mb-4 p-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">{{ error }}</div>

      <!-- Global status -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Estado Global de Fuentes</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div
            v-for="(label, key) in sourceLabels"
            :key="key"
            class="bg-[#252b45] rounded-lg p-4 text-center"
          >
            <div class="text-sm font-medium text-cyan-400">{{ label }}</div>
            <div class="text-xs text-green-400 mt-2">Activa</div>
          </div>
        </div>
      </div>

      <!-- Role defaults for admin -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5 mb-5">
        <h2 class="text-lg font-semibold text-white mb-4">Defaults: Administrador</h2>
        <div class="space-y-3">
          <div v-for="(label, key) in sourceLabels" :key="key" class="flex items-center justify-between bg-[#252b45] rounded-lg px-4 py-3">
            <span class="text-sm text-gray-200">{{ label }}</span>
            <button
              @click="toggleRoleDefault('admin', key)"
              class="relative w-11 h-6 rounded-full transition-colors"
              :class="getDefaultValue('admin', key) ? 'bg-cyan-500' : 'bg-gray-600'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                :class="getDefaultValue('admin', key) ? 'translate-x-5' : ''"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Role defaults for user -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
        <h2 class="text-lg font-semibold text-white mb-4">Defaults: Usuario</h2>
        <div class="space-y-3">
          <div v-for="(label, key) in sourceLabels" :key="key" class="flex items-center justify-between bg-[#252b45] rounded-lg px-4 py-3">
            <span class="text-sm text-gray-200">{{ label }}</span>
            <button
              @click="toggleRoleDefault('user', key)"
              class="relative w-11 h-6 rounded-full transition-colors"
              :class="getDefaultValue('user', key) ? 'bg-cyan-500' : 'bg-gray-600'"
            >
              <span
                class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform"
                :class="getDefaultValue('user', key) ? 'translate-x-5' : ''"
              />
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
