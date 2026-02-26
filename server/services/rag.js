const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const AdmZip = require('adm-zip');

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');
const INDEX_PATH = path.join(__dirname, '..', '..', 'vector-index.json');

// Embedding model (loaded lazily)
let pipeline = null;
let embedder = null;

// In-memory index
let vectorIndex = { chunks: [], embeddings: [] };
let isIndexing = false;
let indexStats = { totalDocs: 0, totalChunks: 0, lastIndexed: null };

/**
 * Initialize the embedding model (downloads on first run ~80MB)
 */
async function initEmbedder() {
  if (embedder) return embedder;

  console.log('Loading embedding model (first time may take a minute to download)...');
  const { pipeline: pipelineFn } = await import('@huggingface/transformers');
  pipeline = pipelineFn;
  embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    dtype: 'fp32'
  });
  console.log('Embedding model loaded.');
  return embedder;
}

/**
 * Generate embedding for a text string
 */
async function embed(text) {
  const model = await initEmbedder();
  const result = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Clean garbled PDF text where words are concatenated without spaces.
 * Detects camelCase-like patterns and inserts spaces.
 */
function cleanPdfText(text) {
  // Insert space before uppercase letter preceded by lowercase (e.g. "clienteSeleccionamos" → "cliente Seleccionamos")
  let cleaned = text.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2');
  // Insert space before lowercase preceded by a sequence ending in uppercase+lowercase (fix overcorrection)
  // Remove multiple spaces
  cleaned = cleaned.replace(/  +/g, ' ');
  return cleaned;
}

/**
 * Generate a human-readable title from filename for embedding context.
 * E.g. "Guia JDS crear Ticket.pdf" → "Guia JDS crear Ticket"
 */
function sourceToTitle(source) {
  return path.basename(source, path.extname(source)).replace(/[_-]/g, ' ');
}

/**
 * Split text into chunks with overlap.
 * Handles PDFs that have single newlines instead of double.
 * Prepends source filename to each chunk for better semantic matching.
 */
function chunkText(text, source, maxChunkSize = 250, overlap = 40) {
  const chunks = [];
  const title = sourceToTitle(source);

  // Clean garbled PDF text
  text = cleanPdfText(text);

  // Clean up text: normalize whitespace, remove excessive blank lines
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Split by multiple strategies: double newline, single newline, or sentences
  let segments = cleaned.split(/\n\s*\n/).filter(p => p.trim().length > 10);

  // If splitting by double newline gives very few segments, also split by single newlines
  if (segments.length <= 2 && cleaned.length > 500) {
    segments = cleaned.split(/\n/).filter(p => p.trim().length > 10);
  }

  // If still too few segments (dense text), split by sentences
  if (segments.length <= 2 && cleaned.length > 500) {
    segments = cleaned.split(/(?<=[.!?])\s+/).filter(p => p.trim().length > 10);
  }

  let currentChunk = '';
  let currentWords = 0;

  for (const seg of segments) {
    const segWords = seg.split(/\s+/).length;

    if (currentWords + segWords > maxChunkSize && currentChunk) {
      chunks.push({
        text: `[${title}]\n${currentChunk.trim()}`,
        source,
        wordCount: currentWords
      });

      // Keep overlap from end of current chunk
      const words = currentChunk.trim().split(/\s+/);
      currentChunk = words.slice(-overlap).join(' ') + '\n' + seg;
      currentWords = overlap + segWords;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + seg;
      currentWords += segWords;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      text: `[${title}]\n${currentChunk.trim()}`,
      source,
      wordCount: currentWords
    });
  }

  return chunks;
}

/**
 * Read all files from knowledge directory recursively
 */
async function readDocuments() {
  const documents = [];

  async function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await scanDir(fullPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      const relativePath = path.relative(KNOWLEDGE_DIR, fullPath);

      try {
        if (ext === '.txt' || ext === '.md') {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.trim().length > 0) {
            documents.push({ source: relativePath, content, type: ext });
          }
        } else if (ext === '.pdf') {
          const buffer = fs.readFileSync(fullPath);
          const data = await pdf(buffer);
          if (data.text.trim().length > 0) {
            documents.push({ source: relativePath, content: data.text, type: ext });
          }
        } else if (ext === '.docx' || ext === '.doc') {
          const buffer = fs.readFileSync(fullPath);
          const result = await mammoth.extractRawText({ buffer });
          if (result.value.trim().length > 0) {
            documents.push({ source: relativePath, content: result.value, type: ext });
          }
        } else if (ext === '.odt') {
          const zip = new AdmZip(fullPath);
          const contentXml = zip.readAsText('content.xml');
          // Strip XML tags and clean up
          const text = contentXml
            .replace(/<text:line-break\/>/g, '\n')
            .replace(/<text:tab\/>/g, '\t')
            .replace(/<text:s\s*\/>/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/ \n/g, '\n')
            .trim();
          if (text.length > 0) {
            documents.push({ source: relativePath, content: text, type: ext });
          }
        }
      } catch (err) {
        console.error(`Error reading ${relativePath}:`, err.message);
      }
    }
  }

  await scanDir(KNOWLEDGE_DIR);
  return documents;
}

/**
 * Index all documents in the knowledge directory
 */
async function indexDocuments() {
  if (isIndexing) {
    return { status: 'already_indexing' };
  }

  isIndexing = true;
  console.log('Starting document indexing...');

  try {
    // Read all documents
    const documents = await readDocuments();
    console.log(`Found ${documents.length} documents`);

    // Chunk all documents
    const allChunks = [];
    for (const doc of documents) {
      const chunks = chunkText(doc.content, doc.source);
      allChunks.push(...chunks);
    }
    console.log(`Created ${allChunks.length} chunks`);

    if (allChunks.length === 0) {
      vectorIndex = { chunks: [], embeddings: [] };
      indexStats = { totalDocs: 0, totalChunks: 0, lastIndexed: new Date().toISOString() };
      saveIndex();
      isIndexing = false;
      return { status: 'ok', docs: 0, chunks: 0 };
    }

    // Generate embeddings (batch for efficiency)
    console.log('Generating embeddings...');
    const embeddings = [];
    for (let i = 0; i < allChunks.length; i++) {
      const emb = await embed(allChunks[i].text);
      embeddings.push(emb);
      if ((i + 1) % 10 === 0) {
        console.log(`  Embedded ${i + 1}/${allChunks.length} chunks`);
      }
    }

    // Store index
    vectorIndex = {
      chunks: allChunks.map(c => ({ text: c.text, source: c.source })),
      embeddings
    };

    indexStats = {
      totalDocs: documents.length,
      totalChunks: allChunks.length,
      lastIndexed: new Date().toISOString()
    };

    saveIndex();
    console.log(`Indexing complete: ${documents.length} docs, ${allChunks.length} chunks`);

    isIndexing = false;
    return { status: 'ok', docs: documents.length, chunks: allChunks.length };
  } catch (err) {
    isIndexing = false;
    console.error('Indexing error:', err);
    throw err;
  }
}

/**
 * Save vector index to disk
 */
function saveIndex() {
  const data = JSON.stringify({ ...vectorIndex, stats: indexStats });
  fs.writeFileSync(INDEX_PATH, data);
}

/**
 * Load vector index from disk
 */
function loadIndex() {
  if (fs.existsSync(INDEX_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
      vectorIndex = { chunks: data.chunks || [], embeddings: data.embeddings || [] };
      indexStats = data.stats || { totalDocs: 0, totalChunks: 0, lastIndexed: null };
      console.log(`Loaded index: ${vectorIndex.chunks.length} chunks`);
    } catch (err) {
      console.error('Error loading index:', err.message);
    }
  }
}

/**
 * Search for relevant chunks given a query
 * @param {string} query - The user's question
 * @param {number} topK - Number of results to return
 * @param {number} threshold - Minimum similarity score (0-1)
 * @returns {Array} Array of { text, source, score }
 */
async function search(query, topK = 5, threshold = 0.3) {
  if (vectorIndex.chunks.length === 0) return [];

  const queryEmbedding = await embed(query);

  // Extract meaningful words from query for source name boosting
  const queryWords = query.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2 && !['como', 'que', 'para', 'los', 'las', 'del', 'una', 'con', 'por'].includes(w));

  // Calculate similarities with source name boost
  const results = vectorIndex.chunks.map((chunk, i) => {
    const baseScore = cosineSimilarity(queryEmbedding, vectorIndex.embeddings[i]);

    // Boost score if source filename contains query terms
    const sourceLower = chunk.source.toLowerCase();
    const matchingWords = queryWords.filter(w => sourceLower.includes(w));
    const sourceBoost = matchingWords.length > 0 ? 0.05 * matchingWords.length : 0;

    return {
      text: chunk.text,
      source: chunk.source,
      score: Math.min(baseScore + sourceBoost, 1.0)
    };
  });

  // Sort by score and filter
  return results
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

/**
 * Format search results as context for Claude
 */
async function getRelevantContext(query) {
  const results = await search(query);
  if (results.length === 0) return null;

  const contextParts = results.map((r, i) =>
    `[Fuente: ${r.source} | Relevancia: ${(r.score * 100).toFixed(0)}%]\n${r.text}`
  );

  return `
---
## Documentación interna encontrada

A continuación tienes fragmentos de documentos internos de la empresa que son relevantes para la pregunta del usuario:

${contextParts.join('\n\n---\n\n')}

## INSTRUCCIONES PARA USAR ESTA INFORMACIÓN (OBLIGATORIO):

1. **NO copies los fragmentos textualmente**. Interpreta, sintetiza y reformula la información con tus propias palabras de forma clara y amigable.
2. **Habla como un compañero experto** que explica las cosas de forma sencilla, no como un documento legal o un manual técnico.
3. **Adapta el nivel de detalle** al usuario: si es una pregunta simple, da una respuesta corta y directa. Si es compleja, estructura bien la respuesta con pasos claros.
4. **Si hay datos concretos** (montos, plazos, requisitos, nombres), inclúyelos con precisión — esos no los parafrasees.
5. **Menciona la fuente solo al final** de forma sutil, ej: _"Esto está en la política de vacaciones"_ o _"Según el manual de compras..."_. No pongas códigos de relevancia ni porcentajes.
6. **Si la información es parcial o insuficiente**, di lo que sí sabes y sugiere con quién contactar para completar la respuesta.
7. **Nunca digas** "según los fragmentos proporcionados" ni "la documentación dice" de forma robótica. Habla como si conocieras la empresa.
---
`;
}

function getStats() {
  return { ...indexStats, isIndexing };
}

function getIndexedDocuments() {
  const sources = [...new Set(vectorIndex.chunks.map(c => c.source))];
  return sources.map(s => ({
    source: s,
    chunks: vectorIndex.chunks.filter(c => c.source === s).length
  }));
}

module.exports = {
  initEmbedder,
  indexDocuments,
  loadIndex,
  search,
  getRelevantContext,
  getStats,
  getIndexedDocuments
};
