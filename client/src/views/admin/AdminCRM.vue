<script setup>
import { onMounted, ref } from 'vue'
import { useAdminStore } from '../../stores/admin'

const admin = useAdminStore()
const smsCode = ref('')
const sending = ref(false)
const validating = ref(false)
const message = ref(null) // { type: 'success'|'error', text: '' }

onMounted(() => {
  admin.loadCRM2FAStatus()
})

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
      <div v-if="!admin.crm2FAStatus.required && !admin.crm2FAStatus.validated" class="px-4 py-4 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-400">
        <p class="font-medium text-gray-300 mb-2">IP reconocida</p>
        <p>El CRM no requiere 2FA desde esta IP. Todas las funciones estan disponibles.</p>
      </div>

      <!-- General info -->
      <div class="px-4 py-4 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-400">
        <p class="font-medium text-gray-300 mb-2">Sobre la verificacion 2FA del CRM</p>
        <ul class="space-y-1 list-disc list-inside">
          <li>El CRM JD Systems exige 2FA por SMS cuando se accede desde una IP no reconocida.</li>
          <li>Las funciones API (buscar tickets, clientes) funcionan sin 2FA.</li>
          <li>Crear clientes requiere 2FA porque usa paginas JSP del CRM directamente.</li>
          <li>La verificacion dura ~25 minutos. Cuando expire, se solicitara de nuevo al intentar crear un cliente.</li>
        </ul>
      </div>
    </template>
  </div>
</template>
