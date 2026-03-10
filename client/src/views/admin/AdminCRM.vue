<script setup>
import { onMounted, ref, computed, watch } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()
const smsCode = ref('')
const sending = ref(false)
const validating = ref(false)
const message = ref(null) // { type: 'success'|'error', text: '' }

// Ticket perfil filter
const selectedPerfil = ref('')

// Client search
const clientSearch = ref('')
const selectedClient = ref(null)
let searchTimer = null

// Ticket dashboard helpers
const estadoColors = {
  'En operador': 'bg-blue-500',
  'En espera de cliente': 'bg-yellow-500',
  'En espera de proveedor': 'bg-orange-500',
  'Nuevo': 'bg-cyan-500',
  'Cerrado': 'bg-gray-500',
  'Resuelto': 'bg-green-500'
}
const prioridadLabels = { '0': 'Normal', '1': 'Alta', '2': 'Urgente' }
const prioridadColors = { '0': 'bg-gray-500', '1': 'bg-yellow-500', '2': 'bg-red-500' }

function getEstadoColor(estado) {
  return estadoColors[estado] || 'bg-gray-500'
}

const sortedEstados = computed(() => {
  if (!admin.crmTicketStats?.por_estado) return []
  return Object.entries(admin.crmTicketStats.por_estado).sort((a, b) => b[1] - a[1])
})
const sortedAreas = computed(() => {
  if (!admin.crmTicketStats?.por_area) return []
  return Object.entries(admin.crmTicketStats.por_area).sort((a, b) => b[1] - a[1])
})
const sortedTemas = computed(() => {
  if (!admin.crmTicketStats?.por_tema) return []
  return Object.entries(admin.crmTicketStats.por_tema).sort((a, b) => b[1] - a[1]).slice(0, 8)
})
const maxEstado = computed(() => sortedEstados.value.length ? sortedEstados.value[0][1] : 1)
const maxArea = computed(() => sortedAreas.value.length ? sortedAreas.value[0][1] : 1)
const maxTema = computed(() => sortedTemas.value.length ? sortedTemas.value[0][1] : 1)

const urgentCount = computed(() => {
  if (!admin.crmTicketStats?.por_prioridad) return 0
  return (admin.crmTicketStats.por_prioridad['2'] || 0) + (admin.crmTicketStats.por_prioridad['1'] || 0)
})

onMounted(() => {
  admin.loadCRM2FAStatus()
  admin.loadCRMClients('')
  admin.loadCRMTicketStats()
})

// Watch perfil filter changes
watch(selectedPerfil, (val) => {
  admin.loadCRMTicketStats(val)
})

// Debounced client search
watch(clientSearch, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    admin.loadCRMClients(val.trim())
    selectedClient.value = null
  }, 400)
})

function selectClient(client) {
  selectedClient.value = selectedClient.value?.id === client.id ? null : client
}

async function handleSend() {
  sending.value = true
  message.value = null
  try {
    const result = await admin.sendCRM2FA()
    if (result.success) {
      message.value = { type: 'success', text: result.message || 'Codigo SMS enviado' }
    } else {
      message.value = { type: 'error', text: result.error || 'Error enviando SMS' }
    }
  } catch (err) {
    message.value = { type: 'error', text: err.message }
  } finally {
    sending.value = false
  }
}

async function handleValidate() {
  if (!smsCode.value.trim()) return
  validating.value = true
  message.value = null
  try {
    const result = await admin.validateCRM2FA(smsCode.value.trim())
    if (result.success) {
      message.value = { type: 'success', text: result.message || '2FA validado correctamente' }
      smsCode.value = ''
      await admin.loadCRM2FAStatus()
    } else {
      message.value = { type: 'error', text: result.error || 'Codigo incorrecto' }
    }
  } catch (err) {
    message.value = { type: 'error', text: err.message }
  } finally {
    validating.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold text-white">CRM JD Systems</h1>
      <button
        @click="admin.loadCRM2FAStatus()"
        class="px-4 py-2 bg-[#252b45] text-gray-300 rounded-lg text-sm hover:bg-[#333b55] transition-colors flex items-center gap-2"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        Actualizar
      </button>
    </div>

    <!-- Loading -->
    <div v-if="!admin.crm2FAStatus" class="text-gray-400 text-sm">Cargando estado del CRM...</div>

    <!-- Not configured -->
    <div v-else-if="!admin.crm2FAStatus.configured" class="px-4 py-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-sm text-yellow-300">
      <p class="font-medium mb-1">CRM no configurado</p>
      <p class="text-yellow-400/70">Configura las variables <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">CRM_URL</code>, <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">CRM_USER</code> y <code class="bg-yellow-900/40 px-1.5 py-0.5 rounded">CRM_PASS</code> en el archivo .env.</p>
    </div>

    <!-- Status cards -->
    <template v-else>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <!-- 2FA Status -->
        <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
          <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Verificacion 2FA</div>
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded-full"
              :class="admin.crm2FAStatus.validated ? 'bg-green-400' : (admin.crm2FAStatus.required ? 'bg-red-400' : 'bg-green-400')"
            ></div>
            <span class="text-lg font-semibold" :class="admin.crm2FAStatus.validated ? 'text-green-400' : (admin.crm2FAStatus.required ? 'text-red-400' : 'text-green-400')">
              {{ admin.crm2FAStatus.validated ? 'Verificado' : (admin.crm2FAStatus.required ? 'Pendiente' : 'No requerido') }}
            </span>
          </div>
        </div>

        <!-- Session -->
        <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
          <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Sesion CRM</div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full" :class="admin.crm2FAStatus.sessionActive ? 'bg-green-400' : 'bg-yellow-400'"></div>
            <span class="text-lg font-semibold" :class="admin.crm2FAStatus.sessionActive ? 'text-green-400' : 'text-yellow-400'">
              {{ admin.crm2FAStatus.sessionActive ? 'Activa' : 'Inactiva' }}
            </span>
          </div>
        </div>

        <!-- Remaining time -->
        <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
          <div class="text-xs text-gray-400 uppercase tracking-wider mb-2">Tiempo restante</div>
          <div class="text-3xl font-bold" :class="admin.crm2FAStatus.remainingMinutes > 5 ? 'text-cyan-400' : 'text-yellow-400'">
            {{ admin.crm2FAStatus.validated ? admin.crm2FAStatus.remainingMinutes + ' min' : '---' }}
          </div>
        </div>
      </div>

      <!-- 2FA Action Panel -->
      <div v-if="admin.crm2FAStatus.required && !admin.crm2FAStatus.validated" class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-6 mb-6">
        <h2 class="text-lg font-semibold text-white mb-2">Verificacion SMS requerida</h2>
        <p class="text-sm text-gray-400 mb-4">
          El CRM requiere verificacion 2FA desde esta IP. Pulsa "Enviar codigo" para recibir un SMS y luego introduce el codigo recibido.
        </p>

        <!-- Step 1: Send -->
        <div class="flex items-center gap-3 mb-4">
          <button
            @click="handleSend"
            :disabled="sending"
            class="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg v-if="sending" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
            </svg>
            {{ sending ? 'Enviando...' : 'Enviar codigo SMS' }}
          </button>
        </div>

        <!-- Step 2: Validate -->
        <div class="flex items-center gap-3">
          <input
            v-model="smsCode"
            type="text"
            placeholder="Codigo SMS"
            maxlength="10"
            class="px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm w-48 focus:outline-none focus:border-cyan-400"
            @keyup.enter="handleValidate"
          />
          <button
            @click="handleValidate"
            :disabled="validating || !smsCode.trim()"
            class="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <svg v-if="validating" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            {{ validating ? 'Validando...' : 'Validar' }}
          </button>
        </div>
      </div>

      <!-- Message -->
      <div v-if="message" class="px-4 py-3 rounded-lg text-sm mb-6" :class="message.type === 'success' ? 'bg-green-900/20 border border-green-700/30 text-green-300' : 'bg-red-900/20 border border-red-700/30 text-red-300'">
        {{ message.text }}
      </div>

      <!-- Info box when validated -->
      <div v-if="admin.crm2FAStatus.validated" class="px-4 py-4 bg-green-900/20 border border-green-700/30 rounded-lg text-sm text-green-300 mb-6">
        <p class="font-medium mb-1">2FA activo</p>
        <p class="text-green-400/70">La sesion CRM tiene acceso completo (crear clientes, etc.). Se renovara automaticamente cuando expire.</p>
      </div>

      <!-- Info box when not required -->
      <div v-if="!admin.crm2FAStatus.required && !admin.crm2FAStatus.validated" class="px-4 py-4 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-400 mb-6">
        <p class="font-medium text-gray-300 mb-2">IP reconocida</p>
        <p>El CRM no requiere 2FA desde esta IP. Todas las funciones estan disponibles.</p>
      </div>

      <!-- General info -->
      <div class="px-4 py-4 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-400 mb-8">
        <p class="font-medium text-gray-300 mb-2">Sobre la verificacion 2FA del CRM</p>
        <ul class="space-y-1 list-disc list-inside">
          <li>El CRM JD Systems exige 2FA por SMS cuando se accede desde una IP no reconocida.</li>
          <li>Las funciones API (buscar tickets, clientes) funcionan sin 2FA.</li>
          <li>Crear clientes requiere 2FA porque usa paginas JSP del CRM directamente.</li>
          <li>La verificacion dura ~25 minutos. Cuando expire, se solicitara de nuevo al intentar crear un cliente.</li>
        </ul>
      </div>

      <!-- ===== Ticket Dashboard ===== -->
      <div class="border-t border-[#252b45] pt-8 mb-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-white">Dashboard de Tickets</h2>
          <div class="flex items-center gap-2">
            <select
              v-model="selectedPerfil"
              class="px-3 py-1.5 bg-[#252b45] text-gray-300 rounded-lg text-xs border border-[#333b55] focus:outline-none focus:border-cyan-400"
            >
              <option value="">Todos los perfiles</option>
              <option v-for="p in admin.crmTicketStats?.perfiles || []" :key="p" :value="p">{{ p }}</option>
            </select>
            <button
              @click="admin.loadCRMTicketStats(selectedPerfil)"
              :disabled="admin.crmTicketStatsLoading"
              class="px-3 py-1.5 bg-[#252b45] text-gray-300 rounded-lg text-xs hover:bg-[#333b55] transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg :class="admin.crmTicketStatsLoading ? 'animate-spin' : ''" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Actualizar
            </button>
          </div>
        </div>

        <!-- Loading -->
        <div v-if="admin.crmTicketStatsLoading && !admin.crmTicketStats" class="text-gray-400 text-sm py-8 text-center">
          Cargando estadisticas de tickets...
        </div>

        <!-- Error -->
        <div v-else-if="admin.crmTicketStats?.error" class="px-4 py-3 bg-red-900/20 border border-red-700/30 rounded-lg text-sm text-red-300">
          {{ admin.crmTicketStats.error }}
        </div>

        <!-- Stats content -->
        <template v-else-if="admin.crmTicketStats">
          <!-- Stat cards -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Total tickets</div>
              <div class="text-3xl font-bold text-white">{{ admin.crmTicketStats.total?.toLocaleString() }}</div>
            </div>
            <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Abiertos</div>
              <div class="text-3xl font-bold text-cyan-400">{{ admin.crmTicketStats.abiertos?.toLocaleString() }}</div>
            </div>
            <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Cerrados</div>
              <div class="text-3xl font-bold text-gray-400">{{ admin.crmTicketStats.cerrados?.toLocaleString() }}</div>
            </div>
            <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
              <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">Alta + Urgente</div>
              <div class="text-3xl font-bold" :class="urgentCount > 0 ? 'text-red-400' : 'text-green-400'">{{ urgentCount }}</div>
            </div>
          </div>

          <!-- Charts row -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <!-- Por estado -->
            <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
              <div class="text-sm font-semibold text-gray-300 mb-3">Por estado</div>
              <div class="space-y-2">
                <div v-for="[estado, count] in sortedEstados" :key="estado" class="flex items-center gap-2">
                  <div class="w-24 text-xs text-gray-400 truncate" :title="estado">{{ estado }}</div>
                  <div class="flex-1 h-5 bg-[#252b45] rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all duration-500"
                      :class="getEstadoColor(estado)"
                      :style="{ width: (count / maxEstado * 100) + '%' }"
                    ></div>
                  </div>
                  <div class="w-8 text-xs text-gray-300 text-right font-mono">{{ count }}</div>
                </div>
              </div>
            </div>

            <!-- Por area -->
            <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
              <div class="text-sm font-semibold text-gray-300 mb-3">Por area</div>
              <div class="space-y-2">
                <div v-for="[area, count] in sortedAreas" :key="area" class="flex items-center gap-2">
                  <div class="w-24 text-xs text-gray-400 truncate" :title="area">{{ area }}</div>
                  <div class="flex-1 h-5 bg-[#252b45] rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full bg-blue-500 transition-all duration-500"
                      :style="{ width: (count / maxArea * 100) + '%' }"
                    ></div>
                  </div>
                  <div class="w-8 text-xs text-gray-300 text-right font-mono">{{ count }}</div>
                </div>
              </div>
            </div>

            <!-- Por tema (top 8) -->
            <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-5">
              <div class="text-sm font-semibold text-gray-300 mb-3">Por tema (top 8)</div>
              <div class="space-y-2">
                <div v-for="[tema, count] in sortedTemas" :key="tema" class="flex items-center gap-2">
                  <div class="w-24 text-xs text-gray-400 truncate" :title="tema">{{ tema }}</div>
                  <div class="flex-1 h-5 bg-[#252b45] rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full bg-purple-500 transition-all duration-500"
                      :style="{ width: (count / maxTema * 100) + '%' }"
                    ></div>
                  </div>
                  <div class="w-8 text-xs text-gray-300 text-right font-mono">{{ count }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Recent tickets table -->
          <div v-if="admin.crmTicketStats.recientes?.length" class="bg-[#1a1f36] rounded-xl border border-[#252b45] overflow-hidden">
            <div class="px-5 py-3 border-b border-[#252b45]">
              <span class="text-sm font-semibold text-gray-300">Ultimos 10 tickets</span>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-[#252b45]">
                    <th class="text-left px-4 py-2.5 text-xs text-gray-400 uppercase tracking-wider font-medium">ID</th>
                    <th class="text-left px-4 py-2.5 text-xs text-gray-400 uppercase tracking-wider font-medium">Fecha</th>
                    <th class="text-left px-4 py-2.5 text-xs text-gray-400 uppercase tracking-wider font-medium">Cliente</th>
                    <th class="text-left px-4 py-2.5 text-xs text-gray-400 uppercase tracking-wider font-medium">Descripcion</th>
                    <th class="text-left px-4 py-2.5 text-xs text-gray-400 uppercase tracking-wider font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="t in admin.crmTicketStats.recientes" :key="t.id" class="border-b border-[#252b45]/50 hover:bg-[#252b45]/30">
                    <td class="px-4 py-2.5 text-cyan-400 font-mono text-xs">{{ t.id }}</td>
                    <td class="px-4 py-2.5 text-gray-300 text-xs whitespace-nowrap">{{ t.fecha }} {{ t.hora }}</td>
                    <td class="px-4 py-2.5 text-white text-xs max-w-[150px] truncate">{{ t.cliente }}</td>
                    <td class="px-4 py-2.5 text-gray-400 text-xs max-w-[250px] truncate">{{ t.descripcion }}</td>
                    <td class="px-4 py-2.5">
                      <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                        :class="{
                          'bg-blue-900/30 text-blue-400': t.estado === 'En operador',
                          'bg-yellow-900/30 text-yellow-400': t.estado === 'En espera de cliente',
                          'bg-orange-900/30 text-orange-400': t.estado === 'En espera de proveedor',
                          'bg-cyan-900/30 text-cyan-400': t.estado === 'Nuevo',
                          'bg-green-900/30 text-green-400': t.estado === 'Resuelto' || t.estado === 'Cerrado',
                          'bg-gray-700/30 text-gray-400': !['En operador','En espera de cliente','En espera de proveedor','Nuevo','Resuelto','Cerrado'].includes(t.estado)
                        }">
                        {{ t.estado || '-' }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </div>

      <!-- ===== Client Listing ===== -->
      <div class="border-t border-[#252b45] pt-8">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold text-white">Clientes CRM</h2>
          <span v-if="admin.crmClientsTotal > 0" class="text-sm text-gray-400">
            {{ admin.crmClientsTotal }} resultado{{ admin.crmClientsTotal !== 1 ? 's' : '' }}
          </span>
        </div>

        <!-- Search -->
        <div class="mb-4">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              v-model="clientSearch"
              type="text"
              placeholder="Buscar por nombre, CIF, telefono..."
              class="w-full pl-10 pr-4 py-2.5 bg-[#1a1f36] border border-[#252b45] rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400 placeholder-gray-500"
            />
            <svg v-if="admin.crmClientsLoading" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
          </div>
        </div>

        <!-- Table -->
        <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-[#252b45]">
                  <th class="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">ID</th>
                  <th class="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">Nombre</th>
                  <th class="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">CIF</th>
                  <th class="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">Distribuidor</th>
                  <th class="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">Lineas</th>
                  <th class="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">Estado</th>
                  <th class="text-left px-4 py-3 text-xs text-gray-400 uppercase tracking-wider font-medium">Contacto</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="admin.crmClientsLoading && admin.crmClients.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-gray-500">Cargando clientes...</td>
                </tr>
                <tr v-else-if="admin.crmClients.length === 0">
                  <td colspan="7" class="px-4 py-8 text-center text-gray-500">No se encontraron clientes</td>
                </tr>
                <tr
                  v-for="client in admin.crmClients"
                  :key="client.id"
                  @click="selectClient(client)"
                  class="border-b border-[#252b45]/50 hover:bg-[#252b45]/40 cursor-pointer transition-colors"
                  :class="selectedClient?.id === client.id ? 'bg-[#252b45]/60' : ''"
                >
                  <td class="px-4 py-3 text-cyan-400 font-mono text-xs">{{ client.id }}</td>
                  <td class="px-4 py-3 text-white font-medium">{{ client.nombre }}</td>
                  <td class="px-4 py-3 text-gray-300 font-mono text-xs">{{ client.cif }}</td>
                  <td class="px-4 py-3 text-gray-400">{{ client.distribuidor }}</td>
                  <td class="px-4 py-3 text-gray-300 text-center">{{ client.lineas }}</td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-0.5 rounded-full text-xs font-medium"
                      :class="client.estado === 'Alta' ? 'bg-green-900/30 text-green-400' : client.estado === 'Baja' ? 'bg-red-900/30 text-red-400' : 'bg-gray-700/30 text-gray-400'">
                      {{ client.estado || '-' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">{{ client.contacto }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Selected client detail -->
        <div v-if="selectedClient" class="mt-4 bg-[#1a1f36] rounded-xl border border-cyan-800/30 p-5">
          <h3 class="text-lg font-semibold text-white mb-3">{{ selectedClient.nombre }}</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span class="text-gray-500 text-xs uppercase">ID</span>
              <p class="text-cyan-400 font-mono">{{ selectedClient.id }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs uppercase">CIF/NIF</span>
              <p class="text-gray-200 font-mono">{{ selectedClient.cif || '-' }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs uppercase">Distribuidor</span>
              <p class="text-gray-200">{{ selectedClient.distribuidor || '-' }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs uppercase">Lineas</span>
              <p class="text-gray-200">{{ selectedClient.lineas }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs uppercase">Estado</span>
              <p :class="selectedClient.estado === 'Alta' ? 'text-green-400' : 'text-red-400'">{{ selectedClient.estado || '-' }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs uppercase">Fecha Alta</span>
              <p class="text-gray-200">{{ selectedClient.fecha || '-' }}</p>
            </div>
            <div class="col-span-2">
              <span class="text-gray-500 text-xs uppercase">Contacto</span>
              <p class="text-gray-200">{{ selectedClient.contacto || '-' }}</p>
            </div>
            <div>
              <span class="text-gray-500 text-xs uppercase">Ultima interaccion</span>
              <p class="text-gray-200">{{ selectedClient.ultima_interaccion_fecha || '-' }}</p>
            </div>
          </div>
        </div>

        <!-- Truncation notice -->
        <div v-if="admin.crmClientsTotal > 100" class="mt-3 text-xs text-gray-500 text-center">
          Mostrando 100 de {{ admin.crmClientsTotal }} clientes. Usa la busqueda para filtrar.
        </div>
      </div>
    </template>
  </div>
</template>
