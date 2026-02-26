const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const FIBRAS_URL = process.env.FIBRAS_URL || 'http://192.168.172.201:8000';
const FIBRAS_USER = process.env.FIBRAS_USER || 'admin';
const FIBRAS_PASS = process.env.FIBRAS_PASS || 'admin123';

let cachedToken = null;
let tokenExpiry = 0;

function isConfigured() {
  return !!(FIBRAS_URL && FIBRAS_USER && FIBRAS_PASS);
}

/**
 * Login to Fibras API and cache JWT token
 */
async function login() {
  // Reuse token if still valid (refresh 5 min before expiry)
  if (cachedToken && Date.now() < tokenExpiry - 5 * 60 * 1000) {
    return cachedToken;
  }

  const res = await fetch(`${FIBRAS_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: FIBRAS_USER, password: FIBRAS_PASS }),
    redirect: 'manual'
  });

  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/access_token=([^;]+)/);
  if (!match) {
    throw new Error('Fibras login failed: no token received');
  }

  cachedToken = match[1];
  // Parse JWT expiry or default to 7 hours
  try {
    const payload = JSON.parse(Buffer.from(cachedToken.split('.')[1], 'base64').toString());
    tokenExpiry = (payload.exp || 0) * 1000;
  } catch {
    tokenExpiry = Date.now() + 7 * 60 * 60 * 1000;
  }

  return cachedToken;
}

/**
 * Fetch all lineas by scraping paginated HTML dashboard.
 * The HTML table has: Proveedor, Nº Línea, Cliente, Sede, Tipo, Velocidad, Tipo IP, IP
 */
async function getAllLineas() {
  const token = await login();
  const allLineas = [];

  // Fetch page 1 to get total pages
  const firstPage = await fetchPage(token, 1);
  allLineas.push(...firstPage.rows);

  // Fetch remaining pages in parallel (batches of 5)
  if (firstPage.totalPages > 1) {
    const pages = [];
    for (let p = 2; p <= firstPage.totalPages; p++) pages.push(p);

    for (let i = 0; i < pages.length; i += 5) {
      const batch = pages.slice(i, i + 5);
      const results = await Promise.all(
        batch.map(p => fetchPage(token, p).catch(() => ({ rows: [] })))
      );
      for (const r of results) allLineas.push(...r.rows);
    }
  }

  console.log(`Fibras: loaded ${allLineas.length} lines from ${firstPage.totalPages} pages`);
  return allLineas;
}

/**
 * Fetch a single page and parse the HTML table
 */
async function fetchPage(token, page) {
  const res = await fetch(`${FIBRAS_URL}/?page=${page}`, {
    headers: { Cookie: `access_token=${token}` }
  });

  if (!res.ok) throw new Error(`Fibras page ${page} failed: ${res.status}`);

  const html = await res.text();

  // Extract total pages
  let totalPages = 1;
  const pageMatch = html.match(/P[aá]gina\s+\d+\s+de\s+(\d+)/);
  if (pageMatch) totalPages = parseInt(pageMatch[1]);

  // Extract table rows from tbody
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { rows: [], totalPages };

  const rowMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  const rows = [];

  for (const rowHtml of rowMatches) {
    const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const values = cells.map(c => c.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

    // Columns: Proveedor, Nº Línea, Cliente, Sede, Tipo, Velocidad, Tipo IP, IP, (Acciones)
    if (values.length >= 7) {
      let tipo_ip = values[6] || '';
      let direccion_ip = values[7] || '';

      // If tipo_ip looks like an IP address, move it to direccion_ip
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(tipo_ip)) {
        direccion_ip = tipo_ip;
        tipo_ip = '';
      }
      // Normalize tipo_ip labels
      if (/din/i.test(tipo_ip)) tipo_ip = 'IP DINÁMICA';
      else if (/est/i.test(tipo_ip)) tipo_ip = 'IP ESTÁTICA';

      rows.push({
        proveedor: values[0] || '-',
        numero_linea: values[1] || '',
        cliente: values[2] || '-',
        sede: values[3] || '',
        tipo_conectividad: values[4] || '',
        velocidad: values[5] || '',
        tipo_ip,
        direccion_ip
      });
    }
  }

  return { rows, totalPages };
}

// --- Cache layer ---
let cachedLineas = null;
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getLineas() {
  if (cachedLineas && Date.now() - cacheTime < CACHE_TTL) {
    return cachedLineas;
  }
  cachedLineas = await getAllLineas();
  cacheTime = Date.now();
  return cachedLineas;
}

/**
 * Search lineas by query string (matches across all fields)
 */
async function searchLineas(query, limit = 20) {
  const lineas = await getLineas();
  const terms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 1);

  if (terms.length === 0) return [];

  const scored = lineas.map(linea => {
    const text = Object.values(linea).join(' ').toLowerCase();
    const matches = terms.filter(t => text.includes(t)).length;
    return { linea, score: matches };
  }).filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.linea);
}

/**
 * Get a specific linea by number
 */
async function getLineaByNumero(numero) {
  const lineas = await getLineas();
  const clean = numero.replace(/\D/g, '');
  return lineas.find(l => l.numero_linea.replace(/\D/g, '') === clean) || null;
}

/**
 * Get stats about the fibras database
 */
async function getStats() {
  const lineas = await getLineas();

  const proveedores = {};
  const tipos = {};
  const velocidades = {};
  const tiposIp = {};

  for (const l of lineas) {
    const prov = l.proveedor || l.servicio || 'Sin proveedor';
    proveedores[prov] = (proveedores[prov] || 0) + 1;
    if (l.tipo_conectividad) tipos[l.tipo_conectividad] = (tipos[l.tipo_conectividad] || 0) + 1;
    if (l.velocidad) velocidades[l.velocidad] = (velocidades[l.velocidad] || 0) + 1;
    if (l.tipo_ip) tiposIp[l.tipo_ip] = (tiposIp[l.tipo_ip] || 0) + 1;
  }

  return {
    total: lineas.length,
    proveedores,
    tipos_conectividad: tipos,
    velocidades,
    tipos_ip: tiposIp
  };
}

// --- Patterns to detect fibras-related queries ---
const FIBRAS_PATTERNS = [
  /fibra/i,
  /l[ií]nea/i,
  /conexi[oó]n/i,
  /conectividad/i,
  /velocidad.*(?:mb|gb|mega|giga)/i,
  /ip\s*(?:est[aá]tica|din[aá]mica|fija|p[uú]blica)/i,
  /\b\d{9}\b/,  // 9-digit phone/line number
  /\bLCR[-\s]?\d+\b/i,  // LCR line numbers like LCR-24589
  /operador/i,
  /cliente.*fibra/i,
  /ip\s*fija/i,
  /sede.*(?:fibra|conexi|internet)/i,
  /internet.*sede/i,
  /mantenimiento.*l[ií]nea/i,
  /cu[aá]ntas\s*(?:l[ií]neas|fibras)/i,
  /proveedor/i
];

/**
 * Check if a message might be about fibras/connectivity
 */
function mightBeAboutFibras(message) {
  return FIBRAS_PATTERNS.some(p => p.test(message));
}

/**
 * Get relevant fibras context for AI, given a user message
 */
async function getRelevantContext(message) {
  if (!isConfigured()) return null;

  try {
    // Extract 9-digit numbers (line numbers)
    const lineNumbers = message.match(/\b\d{9}\b/g) || [];

    let results = [];

    // If specific line numbers mentioned, fetch those directly
    for (const num of lineNumbers) {
      const linea = await getLineaByNumero(num);
      if (linea) results.push(linea);
    }

    // Also do a general search
    const searchResults = await searchLineas(message, 10);
    for (const r of searchResults) {
      if (!results.find(x => x.numero_linea === r.numero_linea)) {
        results.push(r);
      }
    }

    if (results.length === 0) {
      // If asking about stats/totals, provide stats
      if (/cu[aá]ntas|total|estad[ií]stica|resumen|todas/i.test(message)) {
        const stats = await getStats();
        let context = '\n---\n## Datos del Sistema de Gestión de Fibras\n\n';
        context += `**Total de líneas registradas:** ${stats.total}\n\n`;
        context += '**Por tipo de conectividad:**\n';
        for (const [k, v] of Object.entries(stats.tipos_conectividad)) {
          context += `- ${k}: ${v} líneas\n`;
        }
        context += '\n**Por velocidad:**\n';
        for (const [k, v] of Object.entries(stats.velocidades)) {
          context += `- ${k}: ${v} líneas\n`;
        }
        context += '\n**Por tipo de IP:**\n';
        for (const [k, v] of Object.entries(stats.tipos_ip)) {
          context += `- ${k}: ${v} líneas\n`;
        }
        context += '\n---\n';
        return context;
      }
      return null;
    }

    // Format results as context
    let context = '\n---\n## Datos del Sistema de Gestión de Fibras\n\n';
    context += `Se encontraron **${results.length} línea(s)** relevantes:\n\n`;

    for (const linea of results.slice(0, 15)) {
      context += `### Línea ${linea.numero_linea}\n`;
      context += `| Campo | Valor |\n|---|---|\n`;
      if (linea.proveedor && linea.proveedor !== '-') context += `| Proveedor/Operador | ${linea.proveedor} |\n`;
      if (linea.cliente && linea.cliente !== '-') context += `| Cliente | ${linea.cliente} |\n`;
      if (linea.sede) context += `| Sede | ${linea.sede} |\n`;
      if (linea.tipo_conectividad) context += `| Tipo | ${linea.tipo_conectividad} |\n`;
      if (linea.velocidad) context += `| Velocidad | ${linea.velocidad} |\n`;
      if (linea.tipo_ip) context += `| Tipo IP | ${linea.tipo_ip} |\n`;
      if (linea.direccion_ip && linea.direccion_ip !== '-') context += `| Dirección IP | ${linea.direccion_ip} |\n`;
      context += '\n';
    }

    if (results.length > 15) {
      context += `\n_(Mostrando 15 de ${results.length} resultados)_\n`;
    }

    context += `\n## INSTRUCCIONES PARA DATOS DE FIBRAS:\n`;
    context += `1. Presenta esta información de forma clara y organizada.\n`;
    context += `2. Si el usuario pregunta por una sede específica, filtra y muestra solo las líneas de esa sede.\n`;
    context += `3. Si pregunta por estadísticas, resume los datos (totales, por tipo, por velocidad, etc.).\n`;
    context += `4. Nunca inventes datos de líneas que no estén aquí.\n`;
    context += `5. Menciona la fuente: "Según nuestro sistema de gestión de fibras..."\n`;
    context += `---\n`;

    return context;
  } catch (e) {
    console.error('Fibras search error:', e.message);
    return null;
  }
}

module.exports = {
  isConfigured,
  searchLineas,
  getLineaByNumero,
  getStats,
  getLineas,
  mightBeAboutFibras,
  getRelevantContext
};
