<script setup>
import { computed, ref, onMounted, onUpdated, nextTick } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  role: { type: String, required: true },
  content: { type: String, required: true },
  messageId: { type: Number, default: null },
  conversationId: { type: String, default: null },
  feedback: { type: Number, default: null }
})

const emit = defineEmits(['feedback'])

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true
})

const html = computed(() => {
  return marked(props.content)
})

const isUser = computed(() => props.role === 'user')
const localFeedback = ref(props.feedback)

const bubbleRef = ref(null)

function injectCopyButtons() {
  if (!bubbleRef.value) return
  const blocks = bubbleRef.value.querySelectorAll('pre')
  blocks.forEach(pre => {
    if (pre.querySelector('.copy-btn')) return
    const btn = document.createElement('button')
    btn.className = 'copy-btn'
    btn.textContent = 'Copiar'
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')
      const text = code ? code.textContent : pre.textContent
      try {
        await navigator.clipboard.writeText(text)
        btn.textContent = '¡Copiado!'
        btn.classList.add('copied')
        setTimeout(() => {
          btn.textContent = 'Copiar'
          btn.classList.remove('copied')
        }, 2000)
      } catch { /* ignore */ }
    })
    pre.style.position = 'relative'
    pre.appendChild(btn)
  })
}

onMounted(() => nextTick(injectCopyButtons))
onUpdated(() => nextTick(injectCopyButtons))

function sendFeedback(rating) {
  if (localFeedback.value === rating) return
  localFeedback.value = rating
  emit('feedback', { messageId: props.messageId, rating })
}
</script>

<template>
  <div class="flex gap-3 py-3" :class="isUser ? 'justify-end' : 'justify-start'">
    <!-- Avatar -->
    <img
      v-if="!isUser"
      src="/aria-logo.png"
      alt="A.R.I.S."
      class="w-8 h-8 rounded-full object-cover flex-shrink-0"
    />

    <!-- Message bubble -->
    <div class="flex flex-col">
      <div
        ref="bubbleRef"
        class="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
        :class="isUser
          ? 'bg-blue-500 text-white rounded-br-md'
          : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-bl-md'"
      >
        <div v-if="isUser" class="whitespace-pre-wrap">{{ content }}</div>
        <div v-else class="markdown-content" v-html="html"></div>
      </div>

      <!-- Feedback buttons (assistant messages with ID only) -->
      <div v-if="!isUser && messageId" class="flex gap-1 mt-1 ml-1">
        <button
          @click="sendFeedback(1)"
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          :class="localFeedback === 1 ? 'text-green-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'"
          title="Útil"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2 20h2V10H2v10zm20-9a2 2 0 00-2-2h-6.31l.95-4.57.03-.32a1.5 1.5 0 00-.44-1.06L13.17 2 7.59 7.59A1.99 1.99 0 007 9v10a2 2 0 002 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/></svg>
        </button>
        <button
          @click="sendFeedback(-1)"
          class="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          :class="localFeedback === -1 ? 'text-red-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'"
          title="No útil"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22 4h-2v10h2V4zM2 13a2 2 0 002 2h6.31l-.95 4.57-.03.32c0 .4.16.76.44 1.06L10.83 22l5.58-5.59A1.99 1.99 0 0017 15V5a2 2 0 00-2-2H6c-.83 0-1.54.5-1.84 1.22L1.14 11.27A2.04 2.04 0 001 12v2z"/></svg>
        </button>
      </div>
    </div>

    <!-- User avatar -->
    <div
      v-if="isUser"
      class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
      </svg>
    </div>
  </div>
</template>
