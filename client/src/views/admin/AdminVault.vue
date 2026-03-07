<script setup>
import { onMounted } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()

onMounted(() => {
  admin.loadPassboltStatus()
})
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-white">Credenciales (Passbolt)</h1>
      <button
        @click="admin.loadPassboltStatus()"
        class="px-4 py-2 bg-[#252b45] text-gray-300 rounded-lg text-sm hover:bg-[#333b55] transition-colors flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        Actualizar
      </button>
    </div>

    <!-- Loading -->
    <div v-if="!admin.passboltStatus" class="text-gray-400 text-sm">Cargando estado de Passbolt...</div>

    <!-- Not configured -->
    <div v-else-if="!admin.passboltStatus.configured" class="px-4 py-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-sm text-yellow-300">
      <p class="font-medium mb-1">Passbolt no configurado</p>
      <p class="text-yellow-400/70">Configura las variables <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">PASSBOLT_URL</code>, <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">PASSBOLT_USER_ID</code> y <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">PASSBOLT_PASSPHRASE</code> en el archivo <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">.env</code>, coloca la clave privada en <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">config/passbolt-private.key</code> y reinicia el servidor.</p>
    </div>

    <!-- Status cards -->
    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <!-- Connection status -->
        <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
          <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Estado de conexion</div>
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded-full"
              :class="admin.passboltStatus.connected ? 'bg-green-400' : 'bg-red-400'"
            ></div>
            <span class="text-lg font-semibold" :class="admin.passboltStatus.connected ? 'text-green-400' : 'text-red-400'">
              {{ admin.passboltStatus.connected ? 'Conectado' : 'Desconectado' }}
            </span>
          </div>
        </div>

        <!-- Resources count -->
        <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
          <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Credenciales accesibles</div>
          <div class="text-3xl font-bold text-cyan-400">
            {{ admin.passboltStatus.resources >= 0 ? admin.passboltStatus.resources : '—' }}
          </div>
        </div>

        <!-- Source -->
        <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
          <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Fuente</div>
          <div class="text-sm text-gray-200">Passbolt (API en tiempo real)</div>
          <div class="text-xs text-gray-500 mt-1">Las credenciales se gestionan directamente en Passbolt</div>
        </div>
      </div>

      <!-- Error message -->
      <div v-if="admin.passboltStatus.error" class="px-4 py-3 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
        <span class="font-medium">Error:</span> {{ admin.passboltStatus.error }}
      </div>

      <!-- Info box -->
      <div v-if="admin.passboltStatus.connected" class="px-4 py-4 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-400">
        <p class="font-medium text-gray-300 mb-2">Integracion con Passbolt activa</p>
        <ul class="space-y-1 list-disc list-inside">
          <li>Las credenciales se consultan en tiempo real desde Passbolt.</li>
          <li>Para gestionar credenciales (crear, editar, eliminar), usa la interfaz de <a href="https://passbolt.api2smart.com" target="_blank" class="text-cyan-400 hover:text-cyan-300">Passbolt</a>.</li>
          <li>ARIA busca automaticamente en Passbolt cuando un usuario pregunta por contraseñas o credenciales.</li>
          <li>Los resultados de busqueda se cachean 5 minutos para rendimiento.</li>
        </ul>
      </div>
    </template>
  </div>
</template>
