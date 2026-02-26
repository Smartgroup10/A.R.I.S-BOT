<script setup>
import { onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useChatStore } from './stores/chat'
import UserContext from './components/UserContext.vue'

const store = useChatStore()
const route = useRoute()
const checking = ref(true)

const isPublicRoute = computed(() => route.name === 'setup-password')

onMounted(async () => {
  if (store.token) {
    await store.checkAuth()
  }
  checking.value = false
})
</script>

<template>
  <!-- Loading state while checking auth -->
  <div v-if="checking" class="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div class="text-gray-400 text-sm">Cargando...</div>
  </div>

  <div v-else class="h-full">
    <!-- Public routes (setup password) -->
    <router-view v-if="isPublicRoute" />

    <!-- Auth modal -->
    <UserContext v-else-if="!store.isAuthenticated" />

    <!-- Router view -->
    <router-view v-else />
  </div>
</template>
