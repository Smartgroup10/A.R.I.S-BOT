<script setup>
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const navItems = [
  { label: 'Dashboard', route: 'admin-dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Usuarios', route: 'admin-users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { label: 'Fuentes de Datos', route: 'admin-sources', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' }
]

function isActive(name) {
  if (name === 'admin-dashboard') {
    return route.name === 'admin-dashboard'
  }
  return route.name?.startsWith(name.replace('admin-', 'admin-'))
}
</script>

<template>
  <div class="h-full flex bg-gray-900 text-gray-100">
    <!-- Admin sidebar -->
    <aside class="w-64 flex-shrink-0 bg-[#1a1f36] border-r border-[#252b45] flex flex-col">
      <!-- Header -->
      <div class="h-12 flex items-center px-4 border-b border-[#252b45]">
        <span class="text-cyan-400 font-bold text-sm">A.R.I.S.</span>
        <span class="text-gray-400 text-xs ml-2">Panel Admin</span>
      </div>

      <!-- Nav -->
      <nav class="flex-1 py-4 px-3 space-y-1">
        <button
          v-for="item in navItems"
          :key="item.route"
          @click="router.push({ name: item.route })"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
          :class="isActive(item.route)
            ? 'bg-blue-500/20 text-cyan-400'
            : 'text-gray-400 hover:bg-[#252b45] hover:text-gray-200'"
        >
          <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="item.icon"/>
          </svg>
          {{ item.label }}
        </button>
      </nav>

      <!-- Footer -->
      <div class="p-3 border-t border-[#252b45]">
        <button
          @click="router.push('/')"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-[#252b45] hover:text-gray-200 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z"/>
          </svg>
          Volver al Chat
        </button>
      </div>
    </aside>

    <!-- Content area -->
    <main class="flex-1 overflow-y-auto bg-gray-900">
      <router-view />
    </main>
  </div>
</template>
