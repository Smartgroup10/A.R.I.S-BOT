<script setup>
import { onMounted, ref, computed } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()
const search = ref('')

onMounted(() => {
  admin.loadAuditLog()
})

const filteredEntries = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return admin.auditLog
  return admin.auditLog.filter(e =>
    e.action?.toLowerCase().includes(q) ||
    e.detail?.toLowerCase().includes(q) ||
    e.user_name?.toLowerCase().includes(q) ||
    e.user_email?.toLowerCase().includes(q)
  )
})

const ACTION_LABELS = {
  credentials_query: 'Consulta credenciales',
  tool_create_crm_ticket: 'Crear ticket CRM',
  tool_close_crm_ticket: 'Cerrar ticket CRM',
  tool_reply_ticket_email: 'Responder email ticket',
  tool_add_seguimiento_crm: 'Seguimiento CRM'
}

function actionLabel(action) {
  return ACTION_LABELS[action] || action
}

function actionColor(action) {
  if (action === 'credentials_query') return 'text-yellow-400'
  if (action.startsWith('tool_close')) return 'text-red-400'
  if (action.startsWith('tool_create')) return 'text-green-400'
  return 'text-blue-400'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d + 'Z').toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-gray-100">Audit Log</h1>
      <button
        @click="admin.loadAuditLog()"
        class="px-3 py-1.5 bg-[#252b45] hover:bg-[#2f3655] text-gray-300 text-sm rounded-lg transition-colors"
      >
        Actualizar
      </button>
    </div>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="Buscar por usuario, accion o detalle..."
        class="w-full max-w-md px-3 py-2 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
    </div>

    <!-- Table -->
    <div class="bg-[#1a1f36] border border-[#252b45] rounded-lg overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-[#252b45] text-gray-400 text-left">
              <th class="px-4 py-3 font-medium">Fecha</th>
              <th class="px-4 py-3 font-medium">Usuario</th>
              <th class="px-4 py-3 font-medium">Accion</th>
              <th class="px-4 py-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="entry in filteredEntries"
              :key="entry.id"
              class="border-b border-[#252b45]/50 hover:bg-[#252b45]/30"
            >
              <td class="px-4 py-2.5 text-gray-400 whitespace-nowrap">{{ formatDate(entry.created_at) }}</td>
              <td class="px-4 py-2.5 text-gray-300">{{ entry.user_name || 'Sistema' }}</td>
              <td class="px-4 py-2.5">
                <span :class="actionColor(entry.action)" class="font-medium">{{ actionLabel(entry.action) }}</span>
              </td>
              <td class="px-4 py-2.5 text-gray-400 max-w-md truncate" :title="entry.detail">{{ entry.detail }}</td>
            </tr>
            <tr v-if="filteredEntries.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-gray-500">
                {{ search ? 'Sin resultados para esta busqueda' : 'No hay eventos registrados' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="mt-3 text-xs text-gray-500">Mostrando {{ filteredEntries.length }} de {{ admin.auditLog.length }} eventos</p>
  </div>
</template>
