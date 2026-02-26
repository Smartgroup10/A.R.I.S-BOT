<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const token = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const success = ref(false)
const loading = ref(false)
const tokenInvalid = ref(false)

onMounted(() => {
  token.value = route.query.token || ''
  if (!token.value) {
    tokenInvalid.value = true
  }
})

async function handleSubmit() {
  error.value = ''

  if (password.value.length < 6) {
    error.value = 'La contraseña debe tener al menos 6 caracteres'
    return
  }
  if (password.value !== confirmPassword.value) {
    error.value = 'Las contraseñas no coinciden'
    return
  }

  loading.value = true
  try {
    const res = await fetch('/api/auth/setup-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.value, password: password.value })
    })
    const data = await res.json()
    if (!res.ok) {
      error.value = data.error || 'Error al configurar la contraseña'
      if (res.status === 400 && data.error?.includes('inválido')) {
        tokenInvalid.value = true
      }
      return
    }
    success.value = true
    setTimeout(() => router.push('/'), 3000)
  } catch {
    error.value = 'Error de conexión'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-[#0f1225] flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold text-cyan-400 tracking-widest">A.R.I.S.</h1>
        <p class="text-gray-500 text-sm mt-1">Asistente Corporativo</p>
      </div>

      <!-- Card -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-8">
        <!-- Token invalid / expired -->
        <div v-if="tokenInvalid && !success" class="text-center">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/30 flex items-center justify-center">
            <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-white mb-2">Enlace inválido o expirado</h2>
          <p class="text-gray-400 text-sm mb-6">Este enlace de configuración ya no es válido. Contacta con el administrador para que te envíe uno nuevo.</p>
          <button @click="router.push('/')" class="px-4 py-2 bg-[#252b45] text-gray-300 rounded-lg text-sm hover:bg-[#333b55] transition-colors">
            Ir al inicio de sesión
          </button>
        </div>

        <!-- Success -->
        <div v-else-if="success" class="text-center">
          <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center">
            <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          </div>
          <h2 class="text-lg font-semibold text-white mb-2">Contraseña configurada</h2>
          <p class="text-gray-400 text-sm">Redirigiendo al inicio de sesión...</p>
        </div>

        <!-- Setup form -->
        <div v-else>
          <h2 class="text-lg font-semibold text-white mb-2">Configura tu contraseña</h2>
          <p class="text-gray-400 text-sm mb-6">Elige una contraseña para tu cuenta de A.R.I.S.</p>

          <div v-if="error" class="mb-4 px-3 py-2 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-400">
            {{ error }}
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">Contraseña</label>
              <input
                v-model="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                :disabled="loading"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">Confirmar contraseña</label>
              <input
                v-model="confirmPassword"
                type="password"
                placeholder="Repite la contraseña"
                class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                :disabled="loading"
              />
            </div>
            <button
              type="submit"
              :disabled="loading"
              class="w-full py-2.5 bg-cyan-500 text-[#0f1225] font-semibold rounded-lg text-sm hover:bg-cyan-400 transition-colors disabled:opacity-50"
            >
              {{ loading ? 'Configurando...' : 'Establecer contraseña' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
