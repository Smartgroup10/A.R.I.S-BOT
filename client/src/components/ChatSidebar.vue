<script setup>
import { useChatStore } from '../stores/chat'

const store = useChatStore()
const emit = defineEmits(['close'])

function handleSelect(id) {
  store.selectConversation(id)
  // Close sidebar on mobile
  if (window.innerWidth < 768) emit('close')
}

function handleNew() {
  store.newConversation()
  if (window.innerWidth < 768) emit('close')
}
</script>

<template>
  <aside class="h-full flex flex-col bg-[#1a1f36] border-r border-[#252b45]">
    <!-- Header -->
    <div class="h-12 flex items-center justify-between px-4 border-b border-[#252b45]">
      <div class="flex items-center gap-2">
        <img src="/aria-logo.png" alt="A.R.I.S." class="w-7 h-7 rounded-full object-cover" />
        <span class="text-sm font-bold text-white">A.R.I.S.</span>
      </div>
      <button
        @click="handleNew"
        class="p-1.5 rounded-lg hover:bg-[#252b45] text-gray-300"
        title="Nueva conversación"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
      </button>
    </div>

    <!-- Conversation list -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1">
      <div
        v-for="conv in store.conversations"
        :key="conv.id"
        @click="handleSelect(conv.id)"
        class="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors"
        :class="conv.id === store.currentConversationId
          ? 'bg-cyan-500/20 text-cyan-300'
          : 'hover:bg-[#252b45] text-gray-400'"
      >
        <svg class="w-4 h-4 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
        <span class="truncate flex-1">{{ conv.title }}</span>
        <button
          @click.stop="store.deleteConversation(conv.id)"
          class="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 transition-opacity"
          title="Eliminar"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </div>

      <div v-if="store.conversations.length === 0" class="text-center text-sm text-gray-500 py-8">
        Sin conversaciones aún
      </div>
    </div>

    <!-- Footer -->
    <div class="p-3 border-t border-[#252b45]">
      <button
        @click="handleNew"
        class="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        Nueva conversación
      </button>
    </div>
  </aside>
</template>
