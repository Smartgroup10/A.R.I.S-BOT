import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as api from '../lib/api'

const DEPARTMENT_SUGGESTIONS = {
  IT: [
    'Buscar cliente por número',
    'Crear ticket en JDS',
    'Comandos útiles de Asterisk',
    'Configurar centralita',
    'Estado de servicios'
  ],
  'Recursos Humanos': [
    'Solicitar vacaciones',
    'Consultar nómina',
    'Proceso de incorporación',
    'Políticas de empresa',
    'Gestionar permisos'
  ],
  Ventas: [
    'Buscar cliente',
    'Crear presupuesto',
    'Estado de pedidos',
    'Objetivos del mes',
    'Informe de ventas'
  ],
  Administración: [
    'Solicitar reembolso',
    'Gestión de facturas',
    'Proceso de compras',
    'Consultar presupuesto',
    'Documentación fiscal'
  ],
  default: [
    'Consulta procesos de tu departamento',
    'Resuelve incidencias de IT',
    'Gestiona vacaciones y permisos',
    'Solicita compras y reembolsos'
  ]
}

export const useChatStore = defineStore('chat', () => {
  // Auth state
  const token = ref(localStorage.getItem('authToken') || null)
  const user = ref(JSON.parse(localStorage.getItem('authUser') || 'null'))

  const isAuthenticated = computed(() => !!token.value && !!user.value)

  // Derive userContext from authenticated user (backward compat for system prompt etc.)
  const userContext = computed(() => {
    if (!user.value) return { name: '', department: '', sede: '', role: '' }
    return {
      name: user.value.name || '',
      department: user.value.department || '',
      sede: user.value.sede || '',
      role: user.value.role || ''
    }
  })

  const hasContext = computed(() => isAuthenticated.value)

  const preferences = ref(null)

  // Chat state
  const conversations = ref([])
  const currentConversationId = ref(null)
  const messages = ref([])
  const isStreaming = ref(false)
  const streamingContent = ref('')
  const feedbackMap = ref({})
  const historyUsed = ref(false)
  const followUpSuggestions = ref([])

  let abortFn = null

  const currentConversation = computed(() =>
    conversations.value.find(c => c.id === currentConversationId.value)
  )

  const departmentSuggestions = computed(() => {
    const dept = userContext.value.department
    return DEPARTMENT_SUGGESTIONS[dept] || DEPARTMENT_SUGGESTIONS.default
  })

  // --- Auth actions ---

  async function login(email, password) {
    const data = await api.apiLogin({ email, password })
    token.value = data.token
    user.value = data.user
    localStorage.setItem('authToken', data.token)
    localStorage.setItem('authUser', JSON.stringify(data.user))
    return data
  }

  async function register({ email, name, password, department, sede }) {
    const data = await api.apiRegister({ email, name, password, department, sede })
    token.value = data.token
    user.value = data.user
    localStorage.setItem('authToken', data.token)
    localStorage.setItem('authUser', JSON.stringify(data.user))
    return data
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem('authToken')
    localStorage.removeItem('authUser')
    conversations.value = []
    currentConversationId.value = null
    messages.value = []
  }

  async function checkAuth() {
    if (!token.value) return false
    try {
      const data = await api.apiGetMe()
      user.value = data.user
      localStorage.setItem('authUser', JSON.stringify(data.user))
      // Load preferences in background
      api.getPreferences().then(p => { preferences.value = p }).catch(() => {})
      return true
    } catch {
      logout()
      return false
    }
  }

  async function updateProfile(data) {
    const result = await api.updateProfile(data)
    if (result.user) {
      user.value = result.user
      localStorage.setItem('authUser', JSON.stringify(result.user))
    }
    return result
  }

  // --- Chat actions ---

  async function loadConversations() {
    conversations.value = await api.fetchConversations()
  }

  async function selectConversation(id) {
    if (isStreaming.value) return
    currentConversationId.value = id
    const data = await api.fetchMessages(id)
    messages.value = data.messages || []
    feedbackMap.value = {}
    historyUsed.value = false
    followUpSuggestions.value = []
    await loadFeedback()
  }

  function newConversation() {
    if (isStreaming.value) return
    currentConversationId.value = null
    messages.value = []
    feedbackMap.value = {}
    historyUsed.value = false
    followUpSuggestions.value = []
  }

  async function deleteConversation(id) {
    await api.deleteConversation(id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
      messages.value = []
    }
  }

  function sendMessage(text, attachments = []) {
    if (isStreaming.value || !text.trim()) return

    // Add user message to UI immediately
    const userMsg = { role: 'user', content: text.trim() }
    if (attachments.length > 0) {
      userMsg.attachments = attachments
    }
    messages.value.push(userMsg)

    isStreaming.value = true
    streamingContent.value = ''
    historyUsed.value = false
    followUpSuggestions.value = []

    abortFn = api.sendMessage(
      {
        conversationId: currentConversationId.value,
        message: text.trim(),
        attachments
      },
      {
        onConversationId(id) {
          currentConversationId.value = id
        },
        onDelta(chunk) {
          streamingContent.value += chunk
        },
        onTitle(title) {
          const conv = conversations.value.find(c => c.id === currentConversationId.value)
          if (conv) {
            conv.title = title
          } else {
            conversations.value.unshift({
              id: currentConversationId.value,
              title,
              user_name: userContext.value.name,
              department: userContext.value.department
            })
          }
        },
        onHistoryUsed() {
          historyUsed.value = true
        },
        onDone() {
          messages.value.push({ role: 'assistant', content: streamingContent.value })
          streamingContent.value = ''
          isStreaming.value = false
          abortFn = null

          // Reload messages to get IDs for feedback
          if (currentConversationId.value) {
            reloadMessages()
          }

          // Generate follow-up suggestions
          generateFollowUps()

          if (!conversations.value.find(c => c.id === currentConversationId.value)) {
            loadConversations()
          }
        },
        onError(err) {
          console.error('Chat error:', err)
          isStreaming.value = false
          streamingContent.value = ''
          abortFn = null
        }
      }
    )
  }

  async function reloadMessages() {
    if (!currentConversationId.value) return
    try {
      const data = await api.fetchMessages(currentConversationId.value)
      if (data.messages) {
        messages.value = data.messages
        // Load feedback for this conversation
        await loadFeedback()
      }
    } catch { /* ignore */ }
  }

  async function loadFeedback() {
    if (!currentConversationId.value) return
    try {
      const data = await api.fetchFeedback(currentConversationId.value)
      if (data && Array.isArray(data)) {
        const map = {}
        data.forEach(f => { map[f.message_id] = f.rating })
        feedbackMap.value = map
      }
    } catch { /* ignore */ }
  }

  async function submitFeedback(messageId, rating) {
    if (!currentConversationId.value || !messageId) return
    try {
      await api.sendFeedback(currentConversationId.value, messageId, rating)
      feedbackMap.value[messageId] = rating
    } catch (e) {
      console.error('Feedback error:', e)
    }
  }

  function generateFollowUps() {
    const dept = userContext.value.department
    const suggestions = DEPARTMENT_SUGGESTIONS[dept] || DEPARTMENT_SUGGESTIONS.default
    // Pick 3 random suggestions different from what was just asked
    const lastMsg = messages.value.filter(m => m.role === 'user').pop()?.content || ''
    const filtered = suggestions.filter(s => s.toLowerCase() !== lastMsg.toLowerCase())
    const shuffled = filtered.sort(() => 0.5 - Math.random())
    followUpSuggestions.value = shuffled.slice(0, 3)
  }

  function stopStreaming() {
    if (abortFn) {
      abortFn()
      if (streamingContent.value) {
        messages.value.push({ role: 'assistant', content: streamingContent.value + '\n\n_(respuesta interrumpida)_' })
      }
      streamingContent.value = ''
      isStreaming.value = false
      abortFn = null
    }
  }

  return {
    // Auth
    token,
    user,
    isAuthenticated,
    preferences,
    login,
    register,
    logout,
    checkAuth,
    updateProfile,
    // Chat
    conversations,
    currentConversationId,
    currentConversation,
    messages,
    isStreaming,
    streamingContent,
    userContext,
    hasContext,
    feedbackMap,
    historyUsed,
    followUpSuggestions,
    departmentSuggestions,
    loadConversations,
    selectConversation,
    newConversation,
    deleteConversation,
    sendMessage,
    stopStreaming,
    submitFeedback
  }
})
