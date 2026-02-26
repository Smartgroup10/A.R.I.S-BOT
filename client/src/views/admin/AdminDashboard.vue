<script setup>
import { onMounted } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()

onMounted(() => {
  admin.loadStats()
})

const sourceLabels = {
  bookstack: 'BookStack (Wiki)',
  rag: 'RAG (Docs Locales)',
  fibras: 'Fibras (Conectividad)',
  crm: 'CRM (Tickets)'
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
    </div>
  </div>
</template>
