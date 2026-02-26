<script setup>
import { ref, nextTick } from 'vue'
import { useChatStore } from '../stores/chat'
import * as api from '../lib/api'

const store = useChatStore()
const text = ref('')
const textarea = ref(null)
const fileInput = ref(null)
const pendingFiles = ref([])
const uploading = ref(false)
const isDragging = ref(false)

function handleSubmit() {
  if ((!text.value.trim() && pendingFiles.value.length === 0) || store.isStreaming || uploading.value) return
  const attachments = pendingFiles.value.map(f => f.uploaded)
  store.sendMessage(text.value || '(archivo adjunto)', attachments)
  text.value = ''
  pendingFiles.value = []
  nextTick(() => autoResize())
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSubmit()
  }
}

function autoResize() {
  const el = textarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

// File handling
function openFilePicker() {
  fileInput.value?.click()
}

async function handleFiles(files) {
  if (!files || files.length === 0) return
  uploading.value = true
  try {
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} excede 10MB`)
        continue
      }
      const result = await api.uploadFile(file)
      pendingFiles.value.push({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        uploaded: result
      })
    }
  } catch (e) {
    console.error('Upload error:', e)
  } finally {
    uploading.value = false
  }
}

function onFileSelected(e) {
  handleFiles(e.target.files)
  e.target.value = ''
}

function removeFile(index) {
  const f = pendingFiles.value[index]
  if (f.preview) URL.revokeObjectURL(f.preview)
  pendingFiles.value.splice(index, 1)
}

// Drag & drop
function onDragEnter(e) {
  e.preventDefault()
  isDragging.value = true
}
function onDragLeave(e) {
  e.preventDefault()
  isDragging.value = false
}
function onDrop(e) {
  e.preventDefault()
  isDragging.value = false
  handleFiles(e.dataTransfer.files)
}

// Paste images
function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  const files = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (files.length > 0) {
    handleFiles(files)
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<template>
  <div
    class="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
    @dragenter="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <!-- Drag overlay -->
    <div
      v-if="isDragging"
      class="absolute inset-0 z-50 flex items-center justify-center bg-cyan-500/10 border-2 border-dashed border-cyan-400 rounded-xl"
    >
      <p class="text-cyan-600 dark:text-cyan-400 font-medium">Suelta archivos aquí</p>
    </div>

    <div class="max-w-3xl mx-auto">
      <!-- Pending file previews -->
      <div v-if="pendingFiles.length > 0" class="flex flex-wrap gap-2 mb-2">
        <div
          v-for="(pf, i) in pendingFiles"
          :key="i"
          class="relative group flex items-center gap-2 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600"
        >
          <img v-if="pf.preview" :src="pf.preview" class="w-10 h-10 rounded object-cover" />
          <svg v-else class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <div class="text-xs">
            <p class="font-medium truncate max-w-[120px]">{{ pf.uploaded.originalName }}</p>
            <p class="text-gray-400">{{ formatSize(pf.uploaded.size) }}</p>
          </div>
          <button
            @click="removeFile(i)"
            class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >×</button>
        </div>
      </div>

      <!-- Input row -->
      <div class="flex gap-3 items-end">
        <!-- Attach button -->
        <button
          @click="openFilePicker"
          :disabled="store.isStreaming || uploading"
          class="p-2.5 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors disabled:opacity-50"
          title="Adjuntar archivo"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
          </svg>
        </button>
        <input ref="fileInput" type="file" class="hidden" @change="onFileSelected" multiple />

        <textarea
          ref="textarea"
          v-model="text"
          @keydown="handleKeydown"
          @input="autoResize"
          @paste="onPaste"
          :disabled="store.isStreaming"
          placeholder="Escribe tu mensaje..."
          rows="1"
          class="flex-1 resize-none px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none text-sm placeholder-gray-400 disabled:opacity-50"
        ></textarea>

        <button
          v-if="!store.isStreaming"
          @click="handleSubmit"
          :disabled="(!text.trim() && pendingFiles.length === 0) || uploading"
          class="p-2.5 rounded-xl bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white transition-colors"
          title="Enviar"
        >
          <svg v-if="uploading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>

        <button
          v-else
          @click="store.stopStreaming"
          class="p-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors"
          title="Detener"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>
      </div>
    </div>
    <p class="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
      A.R.I.S. puede cometer errores. Verifica la información importante.
    </p>
  </div>
</template>
