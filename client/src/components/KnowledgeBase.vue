<script setup>
import { ref, onMounted } from 'vue'
import * as api from '../lib/api'

const emit = defineEmits(['close'])

const stats = ref({ totalDocs: 0, totalChunks: 0, lastIndexed: null, isIndexing: false })
const documents = ref([])
const isUploading = ref(false)
const isReindexing = ref(false)
const uploadMessage = ref('')
const fileInput = ref(null)

onMounted(async () => {
  await loadData()
})

async function loadData() {
  try {
    const [s, d] = await Promise.all([api.fetchKnowledgeStats(), api.fetchKnowledgeDocs()])
    stats.value = s
    documents.value = d
  } catch (e) {
    console.error('Error loading knowledge data:', e)
  }
}

async function handleUpload(event) {
  const files = event.target.files
  if (!files.length) return

  isUploading.value = true
  uploadMessage.value = ''

  try {
    const result = await api.uploadDocuments(files)
    uploadMessage.value = `${result.uploaded.length} archivo(s) subido(s) correctamente.`
    fileInput.value.value = ''
    await loadData()
  } catch (e) {
    uploadMessage.value = 'Error subiendo archivos: ' + e.message
  } finally {
    isUploading.value = false
  }
}

async function reindex() {
  isReindexing.value = true
  uploadMessage.value = 'Indexando documentos... esto puede tardar unos minutos.'

  try {
    const result = await api.reindexKnowledge()
    if (result.status === 'already_indexing') {
      uploadMessage.value = 'Ya hay una indexación en progreso.'
    } else {
      uploadMessage.value = `Indexación completa: ${result.docs} documentos, ${result.chunks} fragmentos.`
    }
    await loadData()
  } catch (e) {
    uploadMessage.value = 'Error indexando: ' + e.message
  } finally {
    isReindexing.value = false
  }
}

async function deleteDoc(filename) {
  if (!confirm(`¿Eliminar ${filename}?`)) return
  try {
    await api.deleteDocument(filename)
    await loadData()
  } catch (e) {
    console.error('Error deleting:', e)
  }
}

function formatDate(iso) {
  if (!iso) return 'Nunca'
  return new Date(iso).toLocaleString('es')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 class="text-lg font-bold">Base de Conocimiento</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">Sube documentos para que SmartBot pueda consultarlos</p>
        </div>
        <button @click="emit('close')" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Stats -->
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-cyan-50 dark:bg-cyan-900/30 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{{ stats.totalDocs }}</div>
            <div class="text-xs text-gray-500">Documentos</div>
          </div>
          <div class="bg-green-50 dark:bg-green-900/30 rounded-xl p-3 text-center">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{{ stats.totalChunks }}</div>
            <div class="text-xs text-gray-500">Fragmentos</div>
          </div>
          <div class="bg-amber-50 dark:bg-amber-900/30 rounded-xl p-3 text-center">
            <div class="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">Última indexación</div>
            <div class="text-xs text-gray-500 mt-1">{{ formatDate(stats.lastIndexed) }}</div>
          </div>
        </div>

        <!-- Upload -->
        <div class="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center">
          <svg class="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
          </svg>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Arrastra archivos aquí o haz clic para seleccionar
          </p>
          <input
            ref="fileInput"
            type="file"
            multiple
            accept=".pdf,.md,.txt"
            @change="handleUpload"
            class="hidden"
            id="file-upload"
          />
          <label
            for="file-upload"
            class="inline-block px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors"
            :class="{ 'opacity-50 pointer-events-none': isUploading }"
          >
            {{ isUploading ? 'Subiendo...' : 'Seleccionar archivos (.pdf, .md, .txt)' }}
          </label>
        </div>

        <!-- Message -->
        <div v-if="uploadMessage" class="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm rounded-lg px-4 py-3">
          {{ uploadMessage }}
        </div>

        <!-- Documents list -->
        <div v-if="documents.length > 0">
          <h3 class="text-sm font-semibold mb-2">Documentos indexados</h3>
          <div class="space-y-2">
            <div
              v-for="doc in documents"
              :key="doc.source"
              class="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-2.5"
            >
              <div class="flex items-center gap-2 min-w-0">
                <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span class="text-sm truncate">{{ doc.source }}</span>
                <span class="text-xs text-gray-400 flex-shrink-0">{{ doc.chunks }} fragmentos</span>
              </div>
              <button
                @click="deleteDoc(doc.source)"
                class="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 flex-shrink-0"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="p-5 border-t border-gray-200 dark:border-gray-700">
        <button
          @click="reindex"
          :disabled="isReindexing"
          class="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <svg v-if="isReindexing" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          {{ isReindexing ? 'Indexando...' : 'Reindexar documentos' }}
        </button>
        <p class="text-xs text-gray-400 text-center mt-2">
          Reindexar después de subir o modificar documentos
        </p>
      </div>
    </div>
  </div>
</template>
