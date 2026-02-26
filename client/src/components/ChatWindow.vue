<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import { useChatStore } from '../stores/chat'
import ChatMessage from './ChatMessage.vue'
import ChatInput from './ChatInput.vue'
import { marked } from 'marked'

const store = useChatStore()
const messagesContainer = ref(null)

// Auto-scroll on new messages or streaming
watch(
  () => [store.messages.length, store.streamingContent],
  () => {
    nextTick(() => {
      const el = messagesContainer.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
)

const streamingHtml = computed(() => {
  if (!store.streamingContent) return ''
  return marked(store.streamingContent)
})

function handleFeedback({ messageId, rating }) {
  store.submitFeedback(messageId, rating)
}

function sendSuggestion(text) {
  store.sendMessage(text)
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0">
    <!-- Messages area -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto px-4 py-4">
      <div class="max-w-3xl mx-auto">
        <!-- Welcome screen when no messages -->
        <div
          v-if="store.messages.length === 0 && !store.isStreaming"
          class="flex flex-col items-center justify-center h-full min-h-[400px] text-center"
        >
          <img src="/aria-logo.png" alt="A.R.I.S." class="w-20 h-20 rounded-full object-cover mb-4 shadow-lg ring-2 ring-cyan-400/20" />
          <h2 class="text-2xl font-bold mb-2">Hola, {{ store.userContext.name || 'bienvenido' }}!</h2>
          <p class="text-gray-500 dark:text-gray-400 mb-6">Soy A.R.I.S., tu asistente corporativo. ¿En qué puedo ayudarte?</p>
          <div class="grid grid-cols-2 gap-3 max-w-md">
            <button
              v-for="msg in store.departmentSuggestions"
              :key="msg"
              @click="store.sendMessage(msg)"
              class="px-4 py-3 text-sm text-left rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {{ msg }}
            </button>
          </div>
        </div>

        <!-- Message list -->
        <template v-else>
          <!-- History used badge -->
          <div v-if="store.historyUsed" class="flex justify-center mb-3">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium border border-amber-200 dark:border-amber-800">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Usando contexto de conversaciones anteriores
            </span>
          </div>

          <ChatMessage
            v-for="(msg, i) in store.messages"
            :key="msg.id || i"
            :role="msg.role"
            :content="msg.content"
            :message-id="msg.id || null"
            :conversation-id="store.currentConversationId"
            :feedback="store.feedbackMap[msg.id] || null"
            @feedback="handleFeedback"
          />

          <!-- Streaming message -->
          <div v-if="store.isStreaming" class="flex gap-3 py-3">
            <img src="/aria-logo.png" alt="A.R.I.S." class="w-8 h-8 rounded-full object-cover flex-shrink-0" />
            <div class="max-w-[75%] rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <div v-if="store.streamingContent" class="markdown-content" v-html="streamingHtml"></div>
              <div v-else class="flex gap-1 py-1">
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                <span class="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
              </div>
            </div>
          </div>

          <!-- Follow-up suggestion chips -->
          <div v-if="!store.isStreaming && store.followUpSuggestions.length > 0" class="flex flex-wrap gap-2 mt-3 ml-11">
            <button
              v-for="s in store.followUpSuggestions"
              :key="s"
              @click="sendSuggestion(s)"
              class="px-3 py-1.5 text-xs rounded-full border border-gray-200 dark:border-gray-700 hover:bg-cyan-50 dark:hover:bg-cyan-900/30 hover:border-cyan-300 dark:hover:border-cyan-700 text-gray-600 dark:text-gray-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
            >
              {{ s }}
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Input -->
    <ChatInput />
  </div>
</template>
