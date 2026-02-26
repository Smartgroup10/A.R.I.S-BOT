<script setup>
import { ref, computed } from 'vue'
import { useChatStore } from '../stores/chat'

const store = useChatStore()

const loading = ref(false)
const error = ref('')

// Login fields
const loginEmail = ref('')
const loginPassword = ref('')

const showPassword = ref(false)

const allowedDomains = ['smartgroup.es', 'asociatel.es', 'go-red.es']

const emailDomainError = computed(() => {
  const email = loginEmail.value
  if (!email || !email.includes('@')) return ''
  const domain = email.split('@')[1]?.toLowerCase()
  if (domain && !allowedDomains.includes(domain)) {
    return `Solo correos corporativos: ${allowedDomains.map(d => '@' + d).join(', ')}`
  }
  return ''
})

async function handleLogin() {
  error.value = ''
  if (emailDomainError.value) {
    error.value = emailDomainError.value
    return
  }
  loading.value = true
  try {
    await store.login(loginEmail.value.trim(), loginPassword.value)
  } catch (err) {
    error.value = err.message || 'Error al iniciar sesión'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
      <!-- Logo -->
      <div class="text-center mb-6">
        <img src="/aria-logo.png" alt="A.R.I.S." class="w-20 h-20 rounded-full object-cover mx-auto mb-3 shadow-lg ring-2 ring-cyan-400/30" />
        <h2 class="text-xl font-bold">A.R.I.S.</h2>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Asistente de Respuesta Inteligente de Smartgroup</p>
      </div>

      <!-- Error -->
      <div v-if="error" class="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
        {{ error }}
      </div>

      <!-- Login Form -->
      <form @submit.prevent="handleLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Correo corporativo</label>
          <input
            v-model="loginEmail"
            type="email"
            placeholder="tu@smartgroup.es"
            class="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
            required
          />
          <p v-if="emailDomainError && loginEmail" class="text-xs text-red-500 mt-1">{{ emailDomainError }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1">Contraseña</label>
          <div class="relative">
            <input
              v-model="loginPassword"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Tu contraseña"
              class="w-full px-3 py-2 pr-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
              required
            />
            <button type="button" @click="showPassword = !showPassword"
                    class="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
              <svg v-if="!showPassword" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
            </button>
          </div>
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {{ loading ? 'Ingresando...' : 'Iniciar sesión' }}
        </button>
      </form>
    </div>
  </div>
</template>
