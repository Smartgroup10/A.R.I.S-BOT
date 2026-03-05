<script setup>
import { onMounted, computed } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()

onMounted(() => {
  admin.loadStats()
  admin.loadUserMetrics()
})

const sourceLabels = {
  bookstack: 'BookStack (Wiki)',
  rag: 'RAG (Docs Locales)',
  fibras: 'Fibras (Conectividad)',
  crm: 'CRM (Tickets)'
}

const sourceColors = {
  bookstack: 'bg-blue-500/20 text-blue-400',
  rag: 'bg-purple-500/20 text-purple-400',
  fibras: 'bg-emerald-500/20 text-emerald-400',
  crm: 'bg-amber-500/20 text-amber-400',
  teki: 'bg-cyan-500/20 text-cyan-400'
}

const sourceShortLabels = {
  bookstack: 'BookStack',
  rag: 'RAG',
  fibras: 'Fibras',
  crm: 'CRM',
  teki: 'Teki'
}

function timeAgo(dateStr) {
  if (!dateStr) return 'Sin actividad'
  const now = new Date()
  const date = new Date(dateStr + 'Z')
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Ahora'
  if (diffMin < 60) return `hace ${diffMin}m`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `hace ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 30) return `hace ${diffD}d`
  const diffMo = Math.floor(diffD / 30)
  return `hace ${diffMo}mes${diffMo > 1 ? 'es' : ''}`
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold text-white mb-6">Dashboard</h1>

    <!-- Loading -->
    <div v-if="admin.loading" class="text-gray-400 text-sm">Cargando estadísticas...</div>

    <!-- Stats cards -->
    <div v-else-if="admin.stats" class="space-y-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
          <div class="text-3xl font-bold text-cyan-400">{{ admin.stats.users }}</div>
          <div class="text-sm text-gray-400 mt-1">Usuarios totales</div>
        </div>
        <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
          <div class="text-3xl font-bold text-green-400">{{ admin.stats.activeUsers }}</div>
          <div class="text-sm text-gray-400 mt-1">Usuarios activos</div>
        </div>
        <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
          <div class="text-3xl font-bold text-blue-400">{{ admin.stats.conversations }}</div>
          <div class="text-sm text-gray-400 mt-1">Conversaciones</div>
        </div>
        <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
          <div class="text-3xl font-bold text-purple-400">{{ admin.stats.messages }}</div>
          <div class="text-sm text-gray-400 mt-1">Mensajes</div>
        </div>
      </div>

      <!-- Feedback stats -->
      <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
        <h2 class="text-lg font-semibold text-white mb-3">Feedback</h2>
        <div class="flex gap-8">
          <div>
            <span class="text-2xl font-bold text-green-400">{{ admin.stats.feedback.positive }}</span>
            <span class="text-sm text-gray-400 ml-2">Positivos</span>
          </div>
          <div>
            <span class="text-2xl font-bold text-red-400">{{ admin.stats.feedback.negative }}</span>
            <span class="text-sm text-gray-400 ml-2">Negativos</span>
          </div>
          <div>
            <span class="text-2xl font-bold text-gray-300">{{ admin.stats.feedback.total }}</span>
            <span class="text-sm text-gray-400 ml-2">Total</span>
          </div>
        </div>
      </div>

      <!-- Sources info -->
      <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
        <h2 class="text-lg font-semibold text-white mb-3">Fuentes de Datos</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div
            v-for="(label, key) in sourceLabels"
            :key="key"
            class="bg-[#252b45] rounded-lg p-3 text-center"
          >
            <div class="text-sm font-medium text-cyan-400">{{ label }}</div>
            <div class="text-xs text-gray-400 mt-1">Configurada</div>
          </div>
        </div>
      </div>

      <!-- User Activity Table -->
      <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
        <h2 class="text-lg font-semibold text-white mb-4">Actividad por Usuario</h2>
        <div v-if="admin.userMetrics.length === 0" class="text-gray-400 text-sm">
          No hay datos de actividad todavía.
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-400 border-b border-[#252b45]">
                <th class="pb-3 pr-4">Usuario</th>
                <th class="pb-3 pr-4">Departamento</th>
                <th class="pb-3 pr-4 text-center">Mensajes</th>
                <th class="pb-3 pr-4 text-center">Conversaciones</th>
                <th class="pb-3 pr-4">Última actividad</th>
                <th class="pb-3">Fuentes más usadas</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in admin.userMetrics"
                :key="m.user_id"
                class="border-b border-[#252b45]/50 hover:bg-[#252b45]/30"
              >
                <td class="py-3 pr-4">
                  <div class="text-white font-medium">{{ m.name }}</div>
                  <div class="text-xs text-gray-500">{{ m.email }}</div>
                </td>
                <td class="py-3 pr-4 text-gray-300">{{ m.department || '—' }}</td>
                <td class="py-3 pr-4 text-center text-gray-200 font-medium">{{ m.total_messages }}</td>
                <td class="py-3 pr-4 text-center text-gray-200 font-medium">{{ m.total_conversations }}</td>
                <td class="py-3 pr-4 text-gray-400 text-xs">{{ timeAgo(m.last_activity) }}</td>
                <td class="py-3">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="src in m.top_sources.slice(0, 3)"
                      :key="src.key"
                      class="px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="sourceColors[src.key] || 'bg-gray-500/20 text-gray-400'"
                    >
                      {{ sourceShortLabels[src.key] || src.key }}
                    </span>
                    <span v-if="m.top_sources.length === 0" class="text-gray-500 text-xs">—</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
