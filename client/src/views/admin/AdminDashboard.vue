<script setup>
import { onMounted, computed } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()

onMounted(() => {
  admin.loadStats()
  admin.loadUserMetrics()
  admin.loadApiUsage()
})

function formatCost(value) {
  if (!value && value !== 0) return '$0.00'
  return '$' + value.toFixed(4)
}

function formatTokens(value) {
  if (!value) return '0'
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M'
  if (value >= 1000) return (value / 1000).toFixed(1) + 'K'
  return value.toString()
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}`
}

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

      <!-- API Usage -->
      <div v-if="admin.apiUsage" class="space-y-4">
        <h2 class="text-lg font-semibold text-white">Consumo API</h2>

        <!-- Usage cards -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
            <div class="text-3xl font-bold text-cyan-400">{{ formatTokens(admin.apiUsage.total_tokens) }}</div>
            <div class="text-sm text-gray-400 mt-1">Tokens totales</div>
          </div>
          <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
            <div class="text-3xl font-bold text-amber-400">{{ formatCost(admin.apiUsage.total_cost) }}</div>
            <div class="text-sm text-gray-400 mt-1">Coste estimado</div>
          </div>
          <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
            <div class="text-3xl font-bold text-blue-400">{{ admin.apiUsage.total_calls }}</div>
            <div class="text-sm text-gray-400 mt-1">Llamadas API</div>
          </div>
          <div class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
            <div class="text-2xl font-bold text-green-400">{{ admin.apiUsage.active_model }}</div>
            <div class="text-sm text-gray-400 mt-1">Modelo activo ({{ admin.apiUsage.active_provider }})</div>
          </div>
        </div>

        <!-- Provider breakdown -->
        <div v-if="admin.apiUsage.by_provider && admin.apiUsage.by_provider.length > 0" class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
          <h3 class="text-sm font-semibold text-gray-300 mb-3">Desglose por Proveedor/Modelo</h3>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-400 border-b border-[#252b45]">
                  <th class="pb-2 pr-4">Proveedor</th>
                  <th class="pb-2 pr-4">Modelo</th>
                  <th class="pb-2 pr-4 text-right">Llamadas</th>
                  <th class="pb-2 pr-4 text-right">Input</th>
                  <th class="pb-2 pr-4 text-right">Output</th>
                  <th class="pb-2 text-right">Coste</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in admin.apiUsage.by_provider" :key="row.provider + row.model" class="border-b border-[#252b45]/50">
                  <td class="py-2 pr-4 text-gray-300 capitalize">{{ row.provider }}</td>
                  <td class="py-2 pr-4 text-gray-200 font-mono text-xs">{{ row.model }}</td>
                  <td class="py-2 pr-4 text-right text-gray-200">{{ row.calls }}</td>
                  <td class="py-2 pr-4 text-right text-gray-300">{{ formatTokens(row.input_tokens) }}</td>
                  <td class="py-2 pr-4 text-right text-gray-300">{{ formatTokens(row.output_tokens) }}</td>
                  <td class="py-2 text-right text-amber-400 font-medium">{{ formatCost(row.cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Daily usage (last 30 days) -->
        <div v-if="admin.apiUsage.daily && admin.apiUsage.daily.length > 0" class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45]">
          <h3 class="text-sm font-semibold text-gray-300 mb-3">Consumo diario (30 dias)</h3>
          <div class="overflow-x-auto max-h-80 overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-[#1a1f36]">
                <tr class="text-left text-gray-400 border-b border-[#252b45]">
                  <th class="pb-2 pr-4">Fecha</th>
                  <th class="pb-2 pr-4 text-right">Llamadas</th>
                  <th class="pb-2 pr-4 text-right">Input</th>
                  <th class="pb-2 pr-4 text-right">Output</th>
                  <th class="pb-2 text-right">Coste</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in admin.apiUsage.daily" :key="row.day" class="border-b border-[#252b45]/50">
                  <td class="py-2 pr-4 text-gray-200">{{ formatDate(row.day) }}</td>
                  <td class="py-2 pr-4 text-right text-gray-200">{{ row.calls }}</td>
                  <td class="py-2 pr-4 text-right text-gray-300">{{ formatTokens(row.input_tokens) }}</td>
                  <td class="py-2 pr-4 text-right text-gray-300">{{ formatTokens(row.output_tokens) }}</td>
                  <td class="py-2 text-right text-amber-400">{{ formatCost(row.cost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-else class="bg-[#1a1f36] rounded-xl p-5 border border-[#252b45] text-gray-400 text-sm">
          No hay datos de consumo API todavia. Los datos se registran al enviar mensajes en el chat.
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
