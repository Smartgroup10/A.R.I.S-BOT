const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const CRM_URL = process.env.CRM_URL || 'https://crm.go-red.es';
const CRM_USER = process.env.CRM_USER;
const CRM_PASS = process.env.CRM_PASS;
const CRM_EMPRESA = process.env.CRM_EMPRESA || 'ALPHAV2';

let sessionCookie = null;
let sessionExpiry = 0;

function isConfigured() {
  return !!(CRM_URL && CRM_USER && CRM_PASS);
}

/**
 * Login to CRM JD Systems and cache session cookie
 */
async function login() {
  if (sessionCookie && Date.now() < sessionExpiry) {
    return sessionCookie;
  }

  const params = new URLSearchParams({
    USU_LOGIN: CRM_USER,
    USU_PASSWORD: CRM_PASS,
    EdFunction: 'LOGIN',
    crmEmpresa: CRM_EMPRESA,
    Iniciado: 'login',
    Seccion: '0',
    SubSeccion: '0',
    SCRH: '900',
    SCRW: '1440'
  });

  const res = await fetch(`${CRM_URL}/Inicio.jsp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    redirect: 'manual'
  });

  // Extract session cookies
  const cookies = res.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map(c => c.split(';')[0]).join('; ');

  // If no set-cookie, try reading from response (session might be in URL)
  if (!cookieStr) {
    // Fallback: read response to check login success
    const html = await res.text();
    if (!html.includes('Bienvenido')) {
      throw new Error('CRM login failed');
    }
  }

  // Also capture cookies from the response headers raw
  const allCookies = [];
  const raw = res.headers.raw?.() || {};
  if (raw['set-cookie']) {
    for (const c of raw['set-cookie']) {
      allCookies.push(c.split(';')[0]);
    }
  }

  sessionCookie = allCookies.length > 0 ? allCookies.join('; ') : cookieStr;

  // Session valid for 30 minutes
  sessionExpiry = Date.now() + 30 * 60 * 1000;

  // Verify login worked
  if (!sessionCookie) {
    // Try alternative cookie extraction
    const setCookie = res.headers.get('set-cookie') || '';
    sessionCookie = setCookie.split(';')[0];
  }

  console.log('CRM: Login successful');
  return sessionCookie;
}

// Estado images to text mapping
const ESTADO_MAP = {
  'estado0': 'En espera de cliente',
  'estado1': 'En operador',
  'estado2': 'En BO Asociatel',
  'estado3': 'Cerrado',
  'estado4': 'En gestor'
};

function parseEstado(estadoHtml) {
  if (!estadoHtml) return 'Desconocido';
  const match = estadoHtml.match(/estado(\d)/);
  if (match) return ESTADO_MAP['estado' + match[1]] || 'Desconocido';
  return estadoHtml.replace(/<[^>]*>/g, '').trim() || 'Desconocido';
}

function parseTicketId(idField) {
  if (!idField) return '';
  const match = idField.match(/^0*(\d+)\^/);
  return match ? match[1] : idField.replace(/\^.*/, '');
}

/**
 * Fetch all open tickets from CRM
 */
async function fetchTickets(filters = {}) {
  const cookie = await login();

  const params = new URLSearchParams({
    crmEmpresa: CRM_EMPRESA,
    CRMEMPRE: CRM_EMPRESA,
    CndCERRADO: filters.cerrado ?? '2',  // 0=all, 1=closed, 2=not closed
    CndESTADO: filters.estado || '',
    CndIDAR: filters.perfil || '',
    CndCLIENTE: filters.cliente || '',
    CndBUS: filters.busqueda || '',
    CndTMAREA: filters.area || '',
    SCRH: '900',
    SCRW: '1440',
    EdFunction: '',
    RID: '',
    CRMTICKET: '',
    CRMTEL: ''
  });

  const res = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_LISTA`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: params.toString()
  });

  if (!res.ok) throw new Error(`CRM API error: ${res.status}`);

  const data = await res.json();
  if (data.respuesta && data.respuesta.startsWith('-')) {
    throw new Error(`CRM error: ${data.respuesta.substring(1)}`);
  }

  const rows = data.lista?.rows || [];
  return rows.map(row => {
    const d = row.data || [];
    return {
      id: parseTicketId(d[0]),
      fecha: d[1] || '',
      hora: d[2] || '',
      perfil: d[3] || '',
      cliente: d[4] || '',
      asociacion: d[5] || '',
      fecha_limite: d[6] || '',
      descripcion: d[7] || '',
      solucion: d[8] || '',
      estado: parseEstado(d[9]),
      prioridad: d[10] || 0,
      area: d[11] || '',
      tema: d[12] || '',
      ultimo_usuario: d[13] || '',
      usuario_creacion: d[14] || ''
    };
  });
}

/**
 * Fetch full ticket detail (description, solution, internal follow-up, notes)
 */
async function fetchTicketDetail(ticketId) {
  const cookie = await login();

  const res = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_FICHA`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: new URLSearchParams({
      crmEmpresa: CRM_EMPRESA,
      TKID: ticketId,
      CLID: '0',
      MAID: '0'
    }).toString()
  });

  if (!res.ok) throw new Error(`CRM detail error: ${res.status}`);
  const data = await res.json();
  if (data.respuesta && data.respuesta.startsWith('-')) return null;

  const f = data.ficha || {};
  return {
    id: f.TKID,
    cliente: f.CLNOMBRE || '',
    descripcion: f.TKDESCRIPCION || '',
    solucion: f.TKSOLUCION || '',
    seguimiento: f.TKINTERNO || '',
    notas: f.TKNOTAS || '',
    contacto: f.TKCONTACTO || '',
    telefono: f.TKTELEFONO || '',
    email: f.TKEMAIL || ''
  };
}

// --- Client search via CLI_LISTA ---

function parseClientId(idField) {
  if (!idField) return '';
  const match = idField.match(/^0*(\d+)\^/);
  return match ? match[1] : idField.replace(/\^.*/, '');
}

/**
 * Search clients in CRM by free text (name, phone, CIF, etc.)
 */
async function fetchClients(query) {
  const cookie = await login();

  const params = new URLSearchParams({
    crmEmpresa: CRM_EMPRESA,
    CRMEMPRE: CRM_EMPRESA,
    CndBUS: query,
    SCRH: '900',
    SCRW: '1440'
  });

  const res = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=CLI_LISTA`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: params.toString()
  });

  if (!res.ok) throw new Error(`CRM CLI_LISTA error: ${res.status}`);
  const data = await res.json();
  if (data.respuesta && data.respuesta.startsWith('-')) {
    throw new Error(`CRM error: ${data.respuesta.substring(1)}`);
  }

  const rows = data.lista?.rows || [];
  return rows.map(row => {
    const d = row.data || [];
    return {
      id: parseClientId(d[0]),
      nombre: d[1] || '',
      cif: d[2] || '',
      distribuidor: d[3] || '',
      lineas: d[5] || 0,
      fecha: d[6] || '',
      estado: d[7] || '',
      ultima_interaccion_fecha: d[8] || '',
      ultima_interaccion: d[9] || '',
      contacto: d[10] || ''
    };
  });
}

// Patterns to detect client/phone lookup queries
const CLIENT_PATTERNS = [
  /(?:a\s+)?qui[eé]n\s+pertenece/i,
  /(?:de\s+)?qui[eé]n\s+es\s+(?:el\s+)?(?:n[uú]mero|tel[eé]fono|l[ií]nea)/i,
  /(?:busca|buscar|consulta|consultar)\s+(?:el\s+)?cliente/i,
  /(?:datos|info|informaci[oó]n)\s+(?:del?\s+)?cliente/i,
  /cliente\s+(?:con|del?)\s+(?:CIF|NIF|n[uú]mero)/i,
  /\b[89]\d{8}\b/,              // Spanish phone (9 digits starting with 8 or 9)
  /\b[BbAa]\d{7,8}\b/,         // CIF pattern
  /numeraci[oó]n/i,
  /titularidad/i,
];

function mightBeAboutClient(message) {
  return CLIENT_PATTERNS.some(p => p.test(message));
}

/**
 * Extract the search term for client lookup (phone number, CIF, or client name from the query).
 */
function extractClientQuery(message) {
  // Try phone number (9 digits starting with 8 or 9)
  const phone = message.match(/\b([89]\d{8})\b/);
  if (phone) return phone[1];

  // Try CIF/NIF
  const cif = message.match(/\b([A-Za-z]\d{7,8})\b/);
  if (cif) return cif[1];

  // Extract client name after common patterns
  const namePatterns = [
    /cliente\s+(.{3,40})$/i,
    /datos\s+(?:de|del)\s+(.{3,40})$/i,
    /info(?:rmaci[oó]n)?\s+(?:de|del|sobre)\s+(.{3,40})$/i,
    /busca(?:r)?\s+(?:el\s+)?(?:cliente\s+)?(.{3,40})$/i,
  ];
  for (const p of namePatterns) {
    const m = message.match(p);
    if (m) return m[1].trim();
  }

  // Fallback: strip common filler words and use remaining terms
  const stripped = message
    .replace(/(?:a\s+)?qui[eé]n\s+pertenece\s*/i, '')
    .replace(/(?:de\s+)?qui[eé]n\s+es\s*/i, '')
    .replace(/(?:el|la|los|las|un|una|del?|que|su)\s+/gi, '')
    .replace(/n[uú]mero|tel[eé]fono|l[ií]nea|numeraci[oó]n|titularidad|cliente|buscar?/gi, '')
    .trim();

  return stripped.length >= 3 ? stripped : null;
}

/**
 * Get client context from CRM for AI.
 */
async function getClientContext(message) {
  if (!isConfigured()) return null;

  try {
    const query = extractClientQuery(message);
    if (!query) return null;

    const clients = await fetchClients(query);
    if (clients.length === 0) return null;

    console.log(`CRM: client search "${query}" found ${clients.length} result(s)`);

    let context = '\n---\n## Datos de Clientes - CRM ALPHA\n\n';
    context += `Búsqueda: **"${query}"** — ${clients.length} resultado(s):\n\n`;

    for (const c of clients.slice(0, 10)) {
      context += `### Cliente #${c.id}: ${c.nombre}\n`;
      context += `| Campo | Valor |\n|---|---|\n`;
      if (c.cif) context += `| **CIF/NIF** | ${c.cif} |\n`;
      if (c.distribuidor) context += `| **Distribuidor** | ${c.distribuidor} |\n`;
      context += `| **Nº Líneas** | ${c.lineas} |\n`;
      context += `| **Estado** | ${c.estado} |\n`;
      if (c.fecha) context += `| **Fecha** | ${c.fecha} |\n`;
      if (c.contacto) context += `| **Contacto** | ${c.contacto} |\n`;
      if (c.ultima_interaccion_fecha) context += `| **Última interacción** | ${c.ultima_interaccion_fecha} |\n`;
      if (c.ultima_interaccion) context += `| **Detalle interacción** | ${c.ultima_interaccion.substring(0, 300)} |\n`;
      context += '\n';
    }

    if (clients.length > 10) {
      context += `_(Mostrando 10 de ${clients.length} resultados)_\n\n`;
    }

    context += `## INSTRUCCIONES PARA DATOS DE CLIENTES (OBLIGATORIO):\n`;
    context += `1. SOLO usa los datos de clientes listados arriba. NUNCA inventes nombres, CIFs ni datos.\n`;
    context += `2. Si la búsqueda fue por teléfono, indica que ese número pertenece al cliente encontrado.\n`;
    context += `3. Menciona la fuente: "Según el CRM..."\n`;
    context += `---\n`;

    return context;
  } catch (e) {
    console.error('CRM client search error:', e.message);
    return null;
  }
}

// --- Cache layer ---
let cachedTickets = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getTickets(forceRefresh = false) {
  if (!forceRefresh && cachedTickets && Date.now() - cacheTime < CACHE_TTL) {
    return cachedTickets;
  }
  cachedTickets = await fetchTickets();
  cacheTime = Date.now();
  console.log(`CRM: loaded ${cachedTickets.length} tickets`);
  return cachedTickets;
}

/**
 * Search tickets by query string
 */
async function searchTickets(query, limit = 20) {
  const tickets = await getTickets();
  const terms = query.toLowerCase().trim().split(/\s+/).filter(t => t.length > 1);

  if (terms.length === 0) return tickets.slice(0, limit);

  const scored = tickets.map(ticket => {
    const text = Object.values(ticket).join(' ').toLowerCase();
    const matches = terms.filter(t => text.includes(t)).length;
    return { ticket, score: matches };
  }).filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.ticket);
}

/**
 * Get ticket stats
 */
async function getStats() {
  const tickets = await getTickets();

  const estados = {};
  const areas = {};
  const perfiles = {};
  const temas = {};

  for (const t of tickets) {
    if (t.estado) estados[t.estado] = (estados[t.estado] || 0) + 1;
    if (t.area) areas[t.area] = (areas[t.area] || 0) + 1;
    if (t.perfil) perfiles[t.perfil] = (perfiles[t.perfil] || 0) + 1;
    if (t.tema) temas[t.tema] = (temas[t.tema] || 0) + 1;
  }

  return { total: tickets.length, estados, areas, perfiles, temas };
}

// --- Closed ticket search for incident resolution (Soporte only) ---
const SOPORTE_PERFIL_ID = '10';

/**
 * Search closed Soporte tickets server-side via CRM free-text search.
 * Returns tickets with solutions that match the query.
 */
// Cache for closed Soporte tickets (loaded once, refreshed every 30 min)
let cachedClosedSoporte = null;
let closedCacheTime = 0;
const CLOSED_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

async function getClosedSoporte() {
  if (cachedClosedSoporte && Date.now() - closedCacheTime < CLOSED_CACHE_TTL) {
    return cachedClosedSoporte;
  }
  const tickets = await fetchTickets({
    cerrado: '1',
    perfil: SOPORTE_PERFIL_ID
  });
  // Only keep tickets that have a solution
  cachedClosedSoporte = tickets.filter(t => t.solucion && t.solucion.trim().length > 5);
  closedCacheTime = Date.now();
  console.log(`CRM: loaded ${cachedClosedSoporte.length} closed Soporte tickets with solutions`);
  return cachedClosedSoporte;
}

async function searchClosedSoporte(query, limit = 15) {
  const stopwords = ['el','la','los','las','de','del','en','un','una','que','se','no','por','con','para','al','es','lo','como','su','me','ya','le','ha','mi','si','te','nos','hay','tiene','ser','muy','más','mas','este','esta','son','fue','han','sin','como','pero','todo','todos','hola','quiero','puedes','favor','necesito'];
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2 && !stopwords.includes(t));

  const tickets = await getClosedSoporte();

  if (terms.length === 0) return tickets.slice(0, limit);

  // Score by relevance locally
  const scored = tickets.map(ticket => {
    const text = (ticket.descripcion + ' ' + ticket.solucion + ' ' + ticket.tema + ' ' + ticket.area + ' ' + ticket.cliente).toLowerCase();
    const matches = terms.filter(t => text.includes(t)).length;
    return { ticket, score: matches };
  }).filter(s => s.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.ticket);
}

/**
 * Get context from closed Soporte tickets to help resolve an incident.
 */
async function getResolutionContext(message) {
  if (!isConfigured()) return null;

  try {
    const results = await searchClosedSoporte(message, 10);
    if (results.length === 0) return null;

    // Fetch full detail (seguimiento interno + notas) for top 5 tickets
    const top5 = results.slice(0, 5);
    const details = await Promise.all(
      top5.map(t => fetchTicketDetail(t.id).catch(() => null))
    );

    let context = '\n---\n## Tickets de Soporte cerrados similares (historial de resoluciones)\n\n';
    context += `Se encontraron **${results.length} ticket(s) cerrados** similares. Detalle de los 5 más relevantes:\n\n`;

    for (let i = 0; i < top5.length; i++) {
      const t = top5[i];
      const detail = details[i];

      context += `### Ticket #${t.id} (${t.fecha})\n`;
      context += `- **Cliente:** ${t.cliente}\n`;
      context += `- **Tema:** ${t.tema || t.area}\n`;
      context += `- **Problema:** ${(detail?.descripcion || t.descripcion).substring(0, 500)}\n`;
      context += `- **Solución aplicada:** ${(detail?.solucion || t.solucion).substring(0, 500)}\n`;

      if (detail?.seguimiento) {
        context += `- **Seguimiento interno:** ${detail.seguimiento.substring(0, 600)}\n`;
      }
      if (detail?.notas) {
        context += `- **Historial de acciones:**\n${detail.notas.substring(0, 800)}\n`;
      }
      if (t.ultimo_usuario) context += `- **Resuelto por:** ${t.ultimo_usuario}\n`;
      context += '\n';
    }

    // Add remaining tickets (without detail) as brief references
    if (results.length > 5) {
      context += `\n**Otros tickets similares:**\n`;
      for (const t of results.slice(5)) {
        context += `- #${t.id} (${t.fecha}) ${t.cliente}: ${t.descripcion.substring(0, 100)} → ${t.solucion.substring(0, 100)}\n`;
      }
      context += '\n';
    }

    context += `## INSTRUCCIONES PARA RESOLUCIÓN DE INCIDENCIAS (OBLIGATORIO):\n`;
    context += `1. SOLO usa los tickets listados arriba. NUNCA inventes números de ticket ni soluciones.\n`;
    context += `2. Cita SIEMPRE el número exacto del ticket (ej: "Según el ticket #16648...").\n`;
    context += `3. Usa el seguimiento interno y el historial de acciones para dar pasos detallados.\n`;
    context += `4. Si varios tickets tienen soluciones similares, destácalo como patrón confirmado.\n`;
    context += `5. Sugiere una solución basada EXCLUSIVAMENTE en lo que funcionó en estos casos reales.\n`;
    context += `6. NO generes números de ticket inventados bajo ninguna circunstancia.\n`;
    context += `---\n`;

    return context;
  } catch (e) {
    console.error('CRM resolution search error:', e.message);
    return null;
  }
}

// Patterns that indicate the user wants help resolving an incident
const RESOLUTION_PATTERNS = [
  /c[oó]mo\s+(?:se\s+)?(?:resuelv|solucion|arregl|fix)/i,
  /soluci[oó]n\s+(?:para|de|del?)/i,
  /resolver\s+(?:un[ao]?\s+)?(?:incidencia|problema|ticket|error|fallo)/i,
  /qu[eé]\s+(?:se\s+)?hizo\s+(?:con|para|cuando)/i,
  /caso[s]?\s+similar/i,
  /ha\s+pasado\s+antes/i,
  /precedente/i,
  /problema\s+(?:con|de|del?)\s+/i,
  /no\s+(?:funciona|va|anda|conecta|llama)/i,
  /se\s+(?:cae|corta|pierde|desconecta)/i,
  /sin\s+(?:servicio|conexi[oó]n|l[ií]nea|tono|internet)/i,
  /error\s+(?:en|de|del?|al)/i,
  /fallo\s+(?:en|de|del?)/i,
  /ayuda\s+(?:con|para)\s+(?:un[ao]?\s+)?(?:incidencia|ticket|problema)/i
];

function mightNeedResolution(message) {
  return RESOLUTION_PATTERNS.some(p => p.test(message));
}

// --- Patterns to detect CRM/ticket queries ---
const CRM_PATTERNS = [
  /ticket/i,
  /incidencia/i,
  /crm/i,
  /soporte/i,
  /reclamaci[oó]n/i,
  /petici[oó]n/i,
  /caso\s+abierto/i,
  /tickets?\s+(?:abierto|pendiente|cerrado)/i,
  /estado\s+(?:del?\s+)?ticket/i,
  /cu[aá]ntos\s+tickets/i,
  /cliente.*ticket/i,
  /ticket.*cliente/i,
  /[\s,]baja[\s,.]/i,
  /alta\s+(?:de\s+)?(?:fibra|l[ií]nea|servicio|centralita)/i,
  /portabilidad/i,
  /aver[ií]a/i,
  /gesti[oó]n.*(?:comercial|t[eé]cnica)/i,
  /oficina\s+t[eé]cnica/i,
  /atenci[oó]n\s+m[oó]vil/i
];

function mightBeAboutCRM(message) {
  return CRM_PATTERNS.some(p => p.test(message));
}

// --- Direct ticket lookup by number ---
const TICKET_NUMBER_PATTERN = /(?:ticket|incidencia|caso|#)\s*(?:n[uú]mero\s*)?#?(\d{4,6})/i;
const BARE_TICKET_PATTERN = /\b(\d{4,6})\b/;

/**
 * Extract a ticket number from user message, e.g. "ticket 16648", "#16648", "incidencia 16648"
 * Returns the ticket ID string or null.
 */
function extractTicketNumber(message) {
  const match = message.match(TICKET_NUMBER_PATTERN);
  if (match) return match[1];
  // If message is very short and contains only a number with "ticket" context word nearby
  if (mightBeAboutCRM(message)) {
    const bare = message.match(BARE_TICKET_PATTERN);
    if (bare) return bare[1];
  }
  return null;
}

/**
 * Get full detail context for a specific ticket by ID (open or closed).
 */
async function getDirectTicketContext(ticketId) {
  if (!isConfigured()) return null;

  try {
    const detail = await fetchTicketDetail(ticketId);
    if (!detail || !detail.id) return null;

    let context = '\n---\n## Detalle completo del Ticket #' + ticketId + ' (CRM ALPHA)\n\n';
    context += `| Campo | Valor |\n|---|---|\n`;
    context += `| **ID** | ${detail.id} |\n`;
    if (detail.cliente) context += `| **Cliente** | ${detail.cliente} |\n`;
    if (detail.contacto) context += `| **Contacto** | ${detail.contacto} |\n`;
    if (detail.telefono) context += `| **Teléfono** | ${detail.telefono} |\n`;
    if (detail.email) context += `| **Email** | ${detail.email} |\n`;
    context += '\n';

    if (detail.descripcion) {
      context += `### Descripción del problema\n${detail.descripcion}\n\n`;
    }
    if (detail.solucion) {
      context += `### Solución aplicada\n${detail.solucion}\n\n`;
    }
    if (detail.seguimiento) {
      context += `### Seguimiento interno\n${detail.seguimiento}\n\n`;
    }
    if (detail.notas) {
      context += `### Historial de acciones\n${detail.notas}\n\n`;
    }

    context += `## INSTRUCCIONES (OBLIGATORIO):\n`;
    context += `1. Presenta TODA la información del ticket #${ticketId} de forma clara y organizada.\n`;
    context += `2. Si el usuario pregunta algo específico del ticket, responde basándote SOLO en los datos reales proporcionados.\n`;
    context += `3. NUNCA inventes datos que no estén aquí.\n`;
    context += `---\n`;

    return context;
  } catch (e) {
    console.error('CRM direct ticket lookup error:', e.message);
    return null;
  }
}

/**
 * Get relevant CRM context for AI
 */
async function getRelevantContext(message) {
  if (!isConfigured()) return null;

  try {
    const tickets = await getTickets();

    // Check if asking for stats
    if (/cu[aá]ntos|total|estad[ií]stica|resumen|dashboard/i.test(message)) {
      const stats = await getStats();
      let context = '\n---\n## Datos del CRM - Tickets ALPHA\n\n';
      context += `**Total de tickets abiertos:** ${stats.total}\n\n`;
      context += '**Por estado:**\n';
      for (const [k, v] of Object.entries(stats.estados)) {
        context += `- ${k}: ${v}\n`;
      }
      context += '\n**Por área:**\n';
      for (const [k, v] of Object.entries(stats.areas)) {
        context += `- ${k}: ${v}\n`;
      }
      context += '\n**Por perfil:**\n';
      for (const [k, v] of Object.entries(stats.perfiles)) {
        context += `- ${k}: ${v}\n`;
      }
      if (Object.keys(stats.temas).length > 0) {
        context += '\n**Por tema (top 10):**\n';
        const sorted = Object.entries(stats.temas).sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (const [k, v] of sorted) {
          context += `- ${k}: ${v}\n`;
        }
      }
      context += '\n---\n';
      return context;
    }

    // Search tickets matching the query
    const results = await searchTickets(message, 15);
    if (results.length === 0) return null;

    let context = '\n---\n## Datos del CRM - Tickets ALPHA\n\n';
    context += `Se encontraron **${results.length} ticket(s)** relevantes (de ${tickets.length} abiertos):\n\n`;

    for (const t of results.slice(0, 10)) {
      context += `### Ticket #${t.id}\n`;
      context += `| Campo | Valor |\n|---|---|\n`;
      context += `| Fecha | ${t.fecha} ${t.hora} |\n`;
      context += `| Cliente | ${t.cliente} |\n`;
      context += `| Perfil | ${t.perfil} |\n`;
      context += `| Estado | ${t.estado} |\n`;
      context += `| Área | ${t.area} |\n`;
      if (t.tema) context += `| Tema | ${t.tema} |\n`;
      context += `| Descripción | ${t.descripcion.substring(0, 300)} |\n`;
      if (t.solucion) context += `| Solución | ${t.solucion.substring(0, 300)} |\n`;
      if (t.fecha_limite) context += `| Fecha límite | ${t.fecha_limite} |\n`;
      if (t.ultimo_usuario) context += `| Último usuario | ${t.ultimo_usuario} |\n`;
      if (t.usuario_creacion) context += `| Creado por | ${t.usuario_creacion} |\n`;
      context += '\n';
    }

    if (results.length > 10) {
      context += `\n_(Mostrando 10 de ${results.length} resultados)_\n`;
    }

    context += `\n## INSTRUCCIONES PARA DATOS DEL CRM (OBLIGATORIO):\n`;
    context += `1. SOLO usa los tickets listados arriba. NUNCA inventes números de ticket, clientes ni datos.\n`;
    context += `2. Cita SIEMPRE el número exacto del ticket (ej: "Ticket #16658").\n`;
    context += `3. Si preguntan por un cliente específico, filtra solo sus tickets de los datos proporcionados.\n`;
    context += `4. Menciona la fuente: "Según el CRM..."\n`;
    context += `5. NO generes números de ticket inventados bajo ninguna circunstancia.\n`;
    context += `---\n`;

    return context;
  } catch (e) {
    console.error('CRM search error:', e.message);
    return null;
  }
}

module.exports = {
  isConfigured,
  getTickets,
  searchTickets,
  getStats,
  mightBeAboutCRM,
  mightNeedResolution,
  mightBeAboutClient,
  extractTicketNumber,
  getRelevantContext,
  getResolutionContext,
  getDirectTicketContext,
  getClientContext,
  searchClosedSoporte
};
