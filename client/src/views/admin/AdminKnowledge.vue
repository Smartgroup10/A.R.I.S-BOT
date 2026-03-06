<script setup>
import { onMounted, ref, computed } from 'vue'
import { useAdminStore } from '../../stores/admin'
import * as api from '../../lib/api'

const admin = useAdminStore()
const activeTab = ref('articles')
const search = ref('')

// --- Tab 1: KB Articles ---
const editingArticle = ref(null)
const editForm = ref({})
const editError = ref('')

onMounted(() => {
  admin.loadKnowledgeArticles()
  loadRagData()
})

const filteredArticles = computed(() => {
  const q = search.value.toLowerCase()
  if (!q) return admin.knowledgeArticles
  return admin.knowledgeArticles.filter(a =>
    a.title?.toLowerCase().includes(q) ||
    a.keywords?.toLowerCase().includes(q) ||
    a.created_by?.toLowerCase().includes(q)
  )
})

function openEdit(article) {
  editError.value = ''
  editingArticle.value = article.id
  editForm.value = { ...article }
  // Fetch full detail (includes problem/solution)
  import('../../lib/admin-api').then(m => {
    m.fetchKnowledgeArticle(article.id).then(full => {
      editForm.value = { ...full }
    })
  })
}

async function saveEdit() {
  editError.value = ''
  try {
    await admin.updateKnowledgeArticle(editForm.value.id, {
      title: editForm.value.title,
      problem: editForm.value.problem,
      solution: editForm.value.solution,
      keywords: editForm.value.keywords,
      source_tickets: editForm.value.source_tickets
    })
    editingArticle.value = null
  } catch (e) {
    editError.value = e.message
  }
}

async function handleDeleteArticle(article) {
  if (!confirm(`¿Eliminar el artículo "${article.title}"? Esta acción no se puede deshacer.`)) return
  try {
    await admin.deleteKnowledgeArticle(article.id)
  } catch (e) {
    alert('Error: ' + e.message)
  }
}

// --- Tab 2: RAG Documents ---
const ragStats = ref(null)
const ragDocs = ref([])
const ragLoading = ref(false)
const uploadDragging = ref(false)
const uploadStatus = ref('')

async function loadRagData() {
  try {
    const [stats, docs] = await Promise.all([
      api.fetchKnowledgeStats(),
      api.fetchKnowledgeDocs()
    ])
    ragStats.value = stats
    ragDocs.value = docs
  } catch { /* ignore */ }
}

async function handleFileUpload(files) {
  if (!files || files.length === 0) return
  ragLoading.value = true
  uploadStatus.value = ''
  try {
    const result = await api.uploadDocuments(files)
    uploadStatus.value = result.message || `${result.uploaded?.length || 0} archivo(s) subido(s)`
    await loadRagData()
  } catch (e) {
    uploadStatus.value = 'Error: ' + e.message
  } finally {
    ragLoading.value = false
  }
}

function onDrop(e) {
  uploadDragging.value = false
  handleFileUpload(e.dataTransfer.files)
}

function onFileInput(e) {
  handleFileUpload(e.target.files)
  e.target.value = ''
}

async function handleReindex() {
  ragLoading.value = true
  uploadStatus.value = ''
  try {
    const result = await api.reindexKnowledge()
    uploadStatus.value = `Reindexado: ${result.totalChunks || 0} chunks de ${result.documents || 0} documento(s)`
    await loadRagData()
  } catch (e) {
    uploadStatus.value = 'Error: ' + e.message
  } finally {
    ragLoading.value = false
  }
}

async function handleDeleteDoc(filename) {
  if (!confirm(`¿Eliminar "${filename}"?`)) return
  try {
    await api.deleteDocument(filename)
    await loadRagData()
  } catch (e) {
    alert('Error: ' + e.message)
  }
}

function formatSize(bytes) {
  if (!bytes) return '—'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
</script>

<template>
  <div class="p-6 max-w-6xl mx-auto">
    <h1 class="text-2xl font-bold text-white mb-6">Base de Conocimiento</h1>

    <!-- Tabs -->
    <div class="flex gap-1 mb-6 border-b border-[#252b45]">
      <button
        @click="activeTab = 'articles'"
        class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
        :class="activeTab === 'articles'
          ? 'bg-[#1a1f36] text-cyan-400 border border-[#252b45] border-b-transparent -mb-px'
          : 'text-gray-400 hover:text-gray-200'"
      >
        Artículos KB
        <span class="ml-1 text-xs opacity-70">({{ admin.knowledgeStats.total }})</span>
      </button>
      <button
        @click="activeTab = 'documents'"
        class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors"
        :class="activeTab === 'documents'
          ? 'bg-[#1a1f36] text-cyan-400 border border-[#252b45] border-b-transparent -mb-px'
          : 'text-gray-400 hover:text-gray-200'"
      >
        Documentos RAG
        <span v-if="ragStats" class="ml-1 text-xs opacity-70">({{ ragStats.totalDocuments || 0 }})</span>
      </button>
    </div>

    <!-- Tab 1: Articles -->
    <div v-if="activeTab === 'articles'">
      <!-- Stats bar -->
      <div class="flex gap-4 mb-4">
        <div class="px-4 py-2 bg-[#1a1f36] rounded-lg border border-[#252b45] text-sm">
          <span class="text-gray-400">Artículos:</span>
          <span class="text-cyan-400 ml-1 font-medium">{{ admin.knowledgeStats.total }}</span>
        </div>
        <div class="px-4 py-2 bg-[#1a1f36] rounded-lg border border-[#252b45] text-sm">
          <span class="text-gray-400">Usos totales:</span>
          <span class="text-cyan-400 ml-1 font-medium">{{ admin.knowledgeStats.totalUses }}</span>
        </div>
      </div>

      <!-- Search -->
      <input
        v-model="search"
        type="text"
        placeholder="Buscar por título, keywords o autor..."
        class="w-full mb-4 px-4 py-2 bg-[#1a1f36] border border-[#252b45] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500"
      />

      <!-- Table -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] overflow-hidden">
        <table class="w-full">
          <thead class="bg-[#252b45] text-xs text-gray-400 uppercase">
            <tr>
              <th class="px-4 py-3 text-left">ID</th>
              <th class="px-4 py-3 text-left">Título</th>
              <th class="px-4 py-3 text-left">Keywords</th>
              <th class="px-4 py-3 text-center">Usos</th>
              <th class="px-4 py-3 text-left">Creado por</th>
              <th class="px-4 py-3 text-left">Fecha</th>
              <th class="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#252b45]">
            <tr v-if="filteredArticles.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-gray-500 text-sm">
                {{ search ? 'Sin resultados' : 'No hay artículos en la base de conocimiento' }}
              </td>
            </tr>
            <tr v-for="a in filteredArticles" :key="a.id" class="hover:bg-[#252b45]/50">
              <td class="px-4 py-3 text-sm text-gray-500">{{ a.id }}</td>
              <td class="px-4 py-3 text-sm text-gray-200 max-w-[250px] truncate">{{ a.title }}</td>
              <td class="px-4 py-3 text-sm text-gray-400 max-w-[200px] truncate">{{ a.keywords }}</td>
              <td class="px-4 py-3 text-center">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-900/30 text-blue-400">
                  {{ a.times_used }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ a.created_by }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(a.created_at) }}</td>
              <td class="px-4 py-3 text-center space-x-3">
                <button @click="openEdit(a)" class="text-cyan-400 hover:text-cyan-300 text-sm">Editar</button>
                <button @click="handleDeleteArticle(a)" class="text-red-400 hover:text-red-300 text-sm">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Tab 2: RAG Documents -->
    <div v-if="activeTab === 'documents'">
      <!-- Stats bar -->
      <div class="flex gap-4 mb-4" v-if="ragStats">
        <div class="px-4 py-2 bg-[#1a1f36] rounded-lg border border-[#252b45] text-sm">
          <span class="text-gray-400">Documentos:</span>
          <span class="text-cyan-400 ml-1 font-medium">{{ ragStats.totalDocuments || 0 }}</span>
        </div>
        <div class="px-4 py-2 bg-[#1a1f36] rounded-lg border border-[#252b45] text-sm">
          <span class="text-gray-400">Chunks:</span>
          <span class="text-cyan-400 ml-1 font-medium">{{ ragStats.totalChunks || 0 }}</span>
        </div>
        <div class="px-4 py-2 bg-[#1a1f36] rounded-lg border border-[#252b45] text-sm">
          <span class="text-gray-400">Última indexación:</span>
          <span class="text-cyan-400 ml-1 font-medium">{{ ragStats.lastIndexed ? formatDate(ragStats.lastIndexed) : 'Nunca' }}</span>
        </div>
        <button
          @click="handleReindex"
          :disabled="ragLoading"
          class="ml-auto px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {{ ragLoading ? 'Procesando...' : 'Reindexar' }}
        </button>
      </div>

      <!-- Upload status -->
      <div v-if="uploadStatus" class="mb-4 px-4 py-3 bg-blue-900/20 border border-blue-700/30 rounded-lg text-sm text-blue-300">
        {{ uploadStatus }}
      </div>

      <!-- Drag and drop zone -->
      <div
        @dragover.prevent="uploadDragging = true"
        @dragleave="uploadDragging = false"
        @drop.prevent="onDrop"
        class="mb-6 border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer"
        :class="uploadDragging ? 'border-cyan-400 bg-cyan-900/10' : 'border-[#252b45] hover:border-gray-500'"
        @click="$refs.fileInput.click()"
      >
        <input ref="fileInput" type="file" multiple accept=".pdf,.md,.txt,.docx,.doc,.odt" class="hidden" @change="onFileInput" />
        <svg class="w-10 h-10 mx-auto mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
        </svg>
        <p class="text-sm text-gray-400">
          Arrastra archivos aquí o <span class="text-cyan-400">haz clic para seleccionar</span>
        </p>
        <p class="text-xs text-gray-500 mt-1">.pdf, .md, .txt, .docx, .odt</p>
      </div>

      <!-- Document list -->
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] overflow-hidden">
        <table class="w-full">
          <thead class="bg-[#252b45] text-xs text-gray-400 uppercase">
            <tr>
              <th class="px-4 py-3 text-left">Archivo</th>
              <th class="px-4 py-3 text-center">Tamaño</th>
              <th class="px-4 py-3 text-center">Chunks</th>
              <th class="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-[#252b45]">
            <tr v-if="!ragDocs || ragDocs.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-gray-500 text-sm">
                No hay documentos indexados
              </td>
            </tr>
            <tr v-for="doc in ragDocs" :key="doc.filename || doc.name" class="hover:bg-[#252b45]/50">
              <td class="px-4 py-3 text-sm text-gray-200">{{ doc.filename || doc.name }}</td>
              <td class="px-4 py-3 text-center text-sm text-gray-400">{{ formatSize(doc.size) }}</td>
              <td class="px-4 py-3 text-center text-sm text-gray-400">{{ doc.chunks || '—' }}</td>
              <td class="px-4 py-3 text-center">
                <button @click="handleDeleteDoc(doc.filename || doc.name)" class="text-red-400 hover:text-red-300 text-sm">
                  Eliminar
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Edit Article Modal -->
    <div v-if="editingArticle" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-[#1a1f36] rounded-xl border border-[#252b45] p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <h2 class="text-lg font-semibold text-white mb-4">Editar Artículo KB #{{ editForm.id }}</h2>
        <div v-if="editError" class="mb-3 text-red-400 text-sm">{{ editError }}</div>
        <div class="space-y-3">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Título</label>
            <input v-model="editForm.title" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Problema</label>
            <textarea v-model="editForm.problem" rows="4" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500 resize-y" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Solución</label>
            <textarea v-model="editForm.solution" rows="6" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500 resize-y" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Keywords (separadas por coma)</label>
            <input v-model="editForm.keywords" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Tickets relacionados</label>
            <input v-model="editForm.source_tickets" placeholder="ej: 16648,16750" class="w-full px-3 py-2 bg-[#252b45] border border-[#333b55] rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-cyan-500" />
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button @click="editingArticle = null" class="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
          <button @click="saveEdit" class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">Guardar</button>
        </div>
      </div>
    </div>
  </div>
</template>
