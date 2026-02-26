const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const BASE_URL = process.env.BOOKSTACK_URL;
const TOKEN_ID = process.env.BOOKSTACK_TOKEN_ID;
const TOKEN_SECRET = process.env.BOOKSTACK_TOKEN_SECRET;

function getHeaders() {
  return {
    'Authorization': `Token ${TOKEN_ID}:${TOKEN_SECRET}`,
    'Content-Type': 'application/json'
  };
}

function isConfigured() {
  return !!(BASE_URL && TOKEN_ID && TOKEN_SECRET && TOKEN_SECRET !== 'YOUR_TOKEN_SECRET_HERE');
}

/**
 * Generic API call to BookStack (JSON)
 */
async function apiCall(endpoint, params = {}) {
  if (!isConfigured()) {
    throw new Error('BookStack no está configurado. Revisa las variables BOOKSTACK_* en .env');
  }

  const url = new URL(`/api/${endpoint}`, BASE_URL);
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      url.searchParams.set(key, val);
    }
  }

  const res = await fetch(url.toString(), { headers: getHeaders() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BookStack API error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * Export content as plain text (works for books, chapters, pages)
 */
async function exportPlainText(type, id) {
  if (!isConfigured()) {
    throw new Error('BookStack no está configurado.');
  }

  const url = new URL(`/api/${type}/${id}/export/plaintext`, BASE_URL);
  const res = await fetch(url.toString(), { headers: getHeaders() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BookStack export error ${res.status}: ${text}`);
  }

  return res.text();
}

/**
 * Search across all BookStack content
 */
async function search(query, count = 5) {
  const data = await apiCall('search', { query, count });
  return data.data || [];
}

async function getPage(pageId) {
  return apiCall(`pages/${pageId}`);
}

async function getChapter(chapterId) {
  return apiCall(`chapters/${chapterId}`);
}

async function getBook(bookId) {
  return apiCall(`books/${bookId}`);
}

async function listBooks() {
  const data = await apiCall('books', { count: 100 });
  return data.data || [];
}

/**
 * Get the full text content of any BookStack item (book, chapter, or page)
 */
async function getFullContent(type, id, name) {
  try {
    // Use the export/plaintext endpoint — works for all types
    let content = await exportPlainText(type + 's', id);
    content = content.trim();

    if (content.length > 3000) {
      content = content.substring(0, 3000) + '\n\n[... contenido recortado por extensión]';
    }

    return { name, type, content };
  } catch (e) {
    console.error(`Error exporting ${type} ${id}:`, e.message);

    // Fallback: try getting page content directly
    if (type === 'page') {
      try {
        const page = await getPage(id);
        let content = page.markdown || stripHtml(page.html || '');
        if (content.length > 3000) {
          content = content.substring(0, 3000) + '\n\n[... contenido recortado]';
        }
        return { name, type, content };
      } catch (e2) {
        console.error(`Fallback also failed for page ${id}:`, e2.message);
      }
    }

    return null;
  }
}

// Simple cache: key -> { data, timestamp }
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
  // Clean old entries
  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.timestamp > CACHE_TTL) cache.delete(k);
    }
  }
}

/**
 * Extract key terms from a user query (remove filler words)
 */
function extractKeyTerms(query) {
  const fillerWords = new Set([
    'dame', 'dime', 'quiero', 'necesito', 'busca', 'buscar', 'encuentra',
    'info', 'información', 'informacion', 'datos', 'sobre', 'del', 'de',
    'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'que', 'qué', 'cual', 'cuál', 'como', 'cómo',
    'tiene', 'tienen', 'hay', 'ver', 'mostrar', 'enseña',
    'me', 'te', 'se', 'lo', 'le', 'nos',
    'por', 'para', 'con', 'sin', 'en', 'a', 'al', 'es', 'y', 'o',
    'todo', 'toda', 'todos', 'todas',
    'cliente', 'empresa', 'compañía', 'cuenta',
    'favor', 'please', 'puedes', 'podrias', 'podrías',
    'hola', 'buenas', 'buenos', 'dias', 'días', 'tardes', 'noches',
    'gracias', 'oye', 'oiga', 'mira', 'estas', 'estás', 'bien',
    'saludos', 'hey', 'holi', 'bueno', 'vale', 'ok', 'si', 'sí', 'no'
  ]);

  const words = query.toLowerCase()
    .replace(/[¿?¡!.,;:()]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !fillerWords.has(w));

  return words.join(' ');
}

/**
 * Search BookStack and return formatted context for Claude
 */
async function getRelevantContext(query) {
  if (!isConfigured()) return null;

  try {
    const keyTerms = extractKeyTerms(query);
    if (!keyTerms) return null;

    // Check cache first
    const cached = getCached(keyTerms);
    if (cached !== null) return cached;

    // First: fast search by name (most queries are about a client name)
    let results = await search(`{in_name:${keyTerms}}`, 3).catch(() => []);

    // Fallback: general search only if name search found nothing
    if (!results.length) {
      results = await search(keyTerms, 3).catch(() => []);
    }

    if (!results.length) return null;

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const r of results) {
      const key = `${r.type}-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(r);
    }

    // Fetch content in PARALLEL (max 2 results to keep it fast)
    const contentPromises = unique.slice(0, 2).map(r =>
      getFullContent(r.type, r.id, r.name).catch(() => null)
    );
    const contents = (await Promise.all(contentPromises)).filter(c => c && c.content);

    if (contents.length === 0) return null;

    let context = '\n---\n## Información de la Wiki corporativa (BookStack)\n\n';

    for (const item of contents) {
      context += `### ${item.name} (${item.type})\n${item.content}\n\n---\n\n`;
    }

    context += `
## INSTRUCCIONES PARA USAR ESTA INFORMACIÓN DE LA WIKI (FUENTE PRINCIPAL):

1. **Esta es tu FUENTE PRINCIPAL de información.** Basa tu respuesta en estos datos ANTES de usar cualquier conocimiento general.
2. **Presenta TODA la información que encuentres**, aunque sea poca. Si solo hay 2 datos, preséntalos claramente — es mejor poco que nada.
3. **Interpreta y reformula** de forma natural y amigable. No copies literalmente.
4. **NUNCA digas al usuario que "revise BookStack directamente"** — tú ya lo consultaste por él. Presenta lo que encontraste.
5. **NUNCA inventes datos que no estén aquí.** Si falta información, di lo que SÍ encontraste y pregunta si necesita algo más específico.
6. Si la info es breve, preséntala y luego pregunta: _"¿Necesitas algo más específico sobre este tema?"_
7. Menciona la fuente de forma natural: _"Según nuestra wiki..."_ o _"En la ficha del cliente..."_.
8. Si hay datos técnicos (centralita, extensiones, equipos), preséntalos de forma organizada.
---
`;

    setCache(keyTerms, context);
    return context;
  } catch (e) {
    console.error('BookStack search error:', e.message);
    return null;
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  isConfigured,
  search,
  getPage,
  getChapter,
  getBook,
  listBooks,
  getRelevantContext
};
