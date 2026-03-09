<script setup>
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()

const navItems = [
  { label: 'Dashboard', route: 'admin-dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Usuarios', route: 'admin-users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { label: 'Fuentes de Datos', route: 'admin-sources', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
  { label: 'Conocimiento', route: 'admin-knowledge', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { label: 'Vault', route: 'admin-vault', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { label: 'Audit Log', route: 'admin-audit', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' }
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
