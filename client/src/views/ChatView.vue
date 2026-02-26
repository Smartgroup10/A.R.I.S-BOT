<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatStore } from '../stores/chat'
import ChatSidebar from '../components/ChatSidebar.vue'
import ChatWindow from '../components/ChatWindow.vue'
import KnowledgeBase from '../components/KnowledgeBase.vue'

const store = useChatStore()
const router = useRouter()
const sidebarOpen = ref(true)
const showKnowledge = ref(false)

onMounted(() => {
  if (store.isAuthenticated) {
    store.loadConversations()
  }
})

function toggleSidebar() {
  sidebarOpen.value = !sidebarOpen.value
}

const isAdmin = computed(() => store.user?.role === 'admin')
</script>

<template>
  <div class="h-full flex bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
    <KnowledgeBase v-if="showKnowledge" @close="showKnowledge = false" />

    <!-- Sidebar -->
    <transition name="slide">
      <ChatSidebar
        v-show="sidebarOpen"
        class="w-72 flex-shrink-0"
        @close="sidebarOpen = false"
      />
    </transition>

    <!-- Main area -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Top bar -->
      <header class="h-12 flex items-center px-4 border-b border-[#252b45] bg-[#1a1f36] text-white">
        <button
          @click="toggleSidebar"
          class="p-1.5 rounded-lg hover:bg-[#252b45] mr-3"
          title="Toggle sidebar"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
        <h1 class="text-sm font-semibold truncate">
          {{ store.currentConversation?.title || 'A.R.I.S. — Asistente Corporativo' }}
        </h1>
        <div class="ml-auto flex items-center gap-3 text-xs text-gray-500">
          <button
            @click="showKnowledge = true"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#252b45] transition-colors"
            title="Base de Conocimiento"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <span class="hidden sm:inline">Docs</span>
          </button>

          <!-- Profile -->
          <button
            @click="router.push('/profile')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#252b45] transition-colors"
            title="Mi Perfil"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
            <span class="hidden sm:inline">Perfil</span>
          </button>

          <!-- Admin -->
          <button
            v-if="isAdmin"
            @click="router.push('/admin')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-[#252b45] transition-colors text-cyan-400"
            title="Panel de Admin"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <span class="hidden sm:inline">Admin</span>
          </button>

          <span>{{ store.userContext.name }}</span>
          <span v-if="store.userContext.department" class="bg-cyan-900/40 text-cyan-300 px-2 py-0.5 rounded-full">
            {{ store.userContext.department }}
          </span>
          <button
            @click="store.logout()"
            class="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Cerrar sesión"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
            </svg>
            <span class="hidden sm:inline">Salir</span>
          </button>
        </div>
      </header>

      <!-- Chat -->
      <ChatWindow class="flex-1" />
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active, .slide-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}
</style>
