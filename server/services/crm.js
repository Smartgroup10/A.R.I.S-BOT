const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const fibras = require('./fibras');

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

/**
 * Update seguimiento interno (TKINTERNO) of a ticket.
 * Appends text to existing seguimiento, preserving all other fields.
 */
async function updateSeguimiento(ticketId, text) {
  const cookie = await login();

  // First fetch current ticket data (need all required fields for TKT_SAVE)
  const res1 = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_FICHA`, {
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

  if (!res1.ok) throw new Error(`CRM detail error: ${res1.status}`);
  const data1 = await res1.json();
  if (data1.respuesta && data1.respuesta.startsWith('-')) {
    throw new Error(`Ticket ${ticketId} no encontrado`);
  }

  const f = data1.ficha || {};
  const currentSeg = (f.TKINTERNO || '').trim();
  const newSeg = currentSeg ? currentSeg + '\n' + text : text;

  // Save with all required fields
  const res2 = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_SAVE`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: new URLSearchParams({
      crmEmpresa: CRM_EMPRESA,
      CRMEMPRE: CRM_EMPRESA,
      TKID: f.TKID.toString(),
      TKIDCL: (f.TKIDCL || 0).toString(),
      TKIDAR: (f.TKIDAR || '').toString(),
      TKIDTM: (f.TKIDTM || '').toString(),
      TMAREA: f.TMAREA || '',
      TKIDUS: (f.TKIDUS || '').toString(),
      TKESTADO: f.TKESTADO || '',
      TKFECHA: f.TKFECHA || '',
      TKHORA: f.TKHORA || '',
      TKFECHALIM: f.TKFECHALIM || '',
      TKPRIORIDAD: (f.TKPRIORIDAD || 0).toString(),
      TKCONTACTO: f.TKCONTACTO || '',
      TKTELEFONO: f.TKTELEFONO || '',
      TKEMAIL: f.TKEMAIL || '',
      TKDESCRIPCION: f.TKDESCRIPCION || '',
      TKSOLUCION: f.TKSOLUCION || '',
      TKINTERNO: newSeg,
      TKORIGEN: f.TKORIGEN || '',
      SCRH: '900',
      SCRW: '1440'
    }).toString()
  });

  if (!res2.ok) throw new Error(`CRM save error: ${res2.status}`);
  const data2 = await res2.json();

  if (data2.respuesta && data2.respuesta.startsWith('-')) {
    throw new Error(`Error al guardar: ${data2.respuesta.substring(1)}`);
  }

  console.log(`CRM: seguimiento actualizado en ticket #${ticketId}`);
  return { success: true, ticketId, rid: data2.rid };
}

/**
 * Close a ticket: set estado=Cerrado, add solution text, append note to seguimiento.
 * Invalidates ticket cache after closing.
 */
async function closeTicket(ticketId, solucion) {
  const cookie = await login();

  // Fetch current ticket data
  const res1 = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_FICHA`, {
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

  if (!res1.ok) throw new Error(`CRM detail error: ${res1.status}`);
  const data1 = await res1.json();
  if (data1.respuesta && data1.respuesta.startsWith('-')) {
    throw new Error(`Ticket ${ticketId} no encontrado`);
  }

  const f = data1.ficha || {};

  // Build closing note
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;
  const resumenCorto = solucion.length > 120 ? solucion.substring(0, 120) + '...' : solucion;
  const closingNote = `${dateStr} - Ticket cerrado via ARIA: ${resumenCorto}`;

  const currentSeg = (f.TKINTERNO || '').trim();
  const newSeg = currentSeg ? currentSeg + '\n' + closingNote : closingNote;

  // Save with estado=Cerrado and solution
  const res2 = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_SAVE`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: new URLSearchParams({
      crmEmpresa: CRM_EMPRESA,
      CRMEMPRE: CRM_EMPRESA,
      TKID: f.TKID.toString(),
      TKIDCL: (f.TKIDCL || 0).toString(),
      TKIDAR: (f.TKIDAR || '').toString(),
      TKIDTM: (f.TKIDTM || '').toString(),
      TMAREA: f.TMAREA || '',
      TKIDUS: (f.TKIDUS || '').toString(),
      TKIDUSULT: (f.TKIDUS || '').toString(),
      TKESTADO: f.TKESTADO || '',
      TKIDESTADO: '3',
      TKFECHA: f.TKFECHA || '',
      TKHORA: f.TKHORA || '',
      TKFECHALIM: f.TKFECHALIM || '',
      TKPRIORIDAD: (f.TKPRIORIDAD || 0).toString(),
      TKCONTACTO: f.TKCONTACTO || '',
      TKTELEFONO: f.TKTELEFONO || '',
      TKEMAIL: f.TKEMAIL || '',
      TKDESCRIPCION: f.TKDESCRIPCION || '',
      TKSOLUCION: solucion,
      TKINTERNO: newSeg,
      TKORIGEN: f.TKORIGEN || '',
      TKUID: (f.TKUID || '').toString(),
      TKBLOQUEO: '0',
      SCRH: '900',
      SCRW: '1440'
    }).toString()
  });

  if (!res2.ok) throw new Error(`CRM save error: ${res2.status}`);
  const data2 = await res2.json();

  if (data2.respuesta && data2.respuesta.startsWith('-')) {
    throw new Error(`Error al cerrar: ${data2.respuesta.substring(1)}`);
  }

  // Invalidate caches
  cachedTickets = null;
  cacheTime = 0;

  console.log(`CRM: ticket #${ticketId} cerrado`);
  return { success: true, ticketId, rid: data2.rid };
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
  /(?:crea|crear|abrir|abre|nuevo)\s+(?:un\s+)?(?:ticket|incidencia)\s+(?:para|de|del?|al?\s+cliente)\s+/i,
  /ticket\s+(?:para|de)\s+/i,
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
 * Get client context from CRM for AI, with automatic Fibras cross-reference.
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

    // Cross-reference: search Fibras by each client name (top 5 clients max)
    let fibrasResults = {};
    if (fibras.isConfigured()) {
      const clientNames = clients.slice(0, 5).map(c => c.nombre).filter(n => n && n.length >= 3);
      const fibrasSearches = await Promise.all(
        clientNames.map(name =>
          fibras.getLineasByCliente(name).catch(() => [])
        )
      );
      for (let i = 0; i < clientNames.length; i++) {
        if (fibrasSearches[i].length > 0) {
          fibrasResults[clientNames[i]] = fibrasSearches[i];
        }
      }
    }

    // Fetch CRM lines for top 3 clients (paginates automatically)
    let crmLinesResults = {};
    const clientsWithId = clients.slice(0, 3).filter(c => c.id);
    const crmLinesSearches = await Promise.all(
      clientsWithId.map(c =>
        fetchClientLines(c.id).catch(e => {
          console.error(`CRM: error fetching lines for client ${c.id}:`, e.message);
          return [];
        })
      )
    );
    for (let i = 0; i < clientsWithId.length; i++) {
      if (crmLinesSearches[i].length > 0) {
        crmLinesResults[clientsWithId[i].id] = crmLinesSearches[i];
      }
    }

    for (const c of clients.slice(0, 10)) {
      context += `### Cliente #${c.id}: ${c.nombre}\n`;
      context += `| Campo | Valor |\n|---|---|\n`;
      if (c.cif) context += `| **CIF/NIF** | ${c.cif} |\n`;
      if (c.distribuidor) context += `| **Distribuidor** | ${c.distribuidor} |\n`;
      context += `| **Nº Líneas (CRM)** | ${c.lineas} |\n`;
      context += `| **Estado** | ${c.estado} |\n`;
      if (c.fecha) context += `| **Fecha** | ${c.fecha} |\n`;
      if (c.contacto) context += `| **Contacto** | ${c.contacto} |\n`;
      if (c.ultima_interaccion_fecha) context += `| **Última interacción** | ${c.ultima_interaccion_fecha} |\n`;
      if (c.ultima_interaccion) context += `| **Detalle interacción** | ${c.ultima_interaccion.substring(0, 300)} |\n`;
      context += '\n';

      // Append CRM lines (contratos) for this client
      const crmLines = crmLinesResults[c.id];
      if (crmLines && crmLines.length > 0) {
        context += `#### Líneas/Contratos de ${c.nombre} (CRM: ${crmLines.length} líneas)\n\n`;
        context += `| Contrato | Línea Móvil | Fijo Virtual | ADSL/Sede | Fijo ADSL | Nº Corto | Fª Alta | Estado | Plan Tarifa |\n`;
        context += `|---|---|---|---|---|---|---|---|---|\n`;
        for (const l of crmLines.slice(0, 40)) {
          context += `| ${l.contrato} | ${l.linea_movil || '-'} | ${l.fijo_virtual || '-'} | ${l.linea_adsl_sede || '-'} | ${l.fijo_adsl || '-'} | ${l.num_corto || '-'} | ${l.fecha_alta} | ${l.estado} | ${l.plan_tarifa || '-'} |\n`;
        }
        if (crmLines.length > 40) {
          context += `\n_(Mostrando 40 de ${crmLines.length} líneas. Usa la herramienta get_client_lines para ver todas)_\n`;
        }
        context += '\n';
      }

      // Append Fibras lines for this client
      const lineas = fibrasResults[c.nombre];
      if (lineas && lineas.length > 0) {
        context += `#### Líneas de ${c.nombre} (Sistema de Fibras: ${lineas.length} encontradas)\n\n`;
        context += `| Nº Línea | Proveedor | Sede | Tipo | Velocidad | IP | Dirección IP |\n`;
        context += `|---|---|---|---|---|---|---|\n`;
        for (const l of lineas.slice(0, 30)) {
          context += `| ${l.numero_linea} | ${l.proveedor} | ${l.sede} | ${l.tipo_conectividad} | ${l.velocidad} | ${l.tipo_ip} | ${l.direccion_ip || '-'} |\n`;
        }
        if (lineas.length > 30) {
          context += `\n_(Mostrando 30 de ${lineas.length} líneas)_\n`;
        }
        context += '\n';
      } else if (parseInt(c.lineas) > 0 && (!crmLines || crmLines.length === 0)) {
        context += `_(No se encontraron líneas de este cliente en el Sistema de Fibras ni en el CRM)_\n\n`;
      }
    }

    if (clients.length > 10) {
      context += `_(Mostrando 10 de ${clients.length} resultados)_\n\n`;
    }

    const totalFibras = Object.values(fibrasResults).reduce((sum, arr) => sum + arr.length, 0);

    // --- Ticket history for top clients (use ID-based lookup when available) ---
    for (const c of clients.slice(0, 3)) {
      if (!c.nombre || c.nombre.length < 3) continue;
      try {
        const tickets = c.id ? await fetchClientTicketsById(c.id) : await fetchClientTickets(c.nombre);
        if (tickets.length === 0) continue;

        // Count by estado
        const estadoCount = {};
        for (const t of tickets) {
          const est = t.estado || 'Desconocido';
          estadoCount[est] = (estadoCount[est] || 0) + 1;
        }

        context += `### Historial de Tickets de ${c.nombre}\n\n`;
        context += `**Total:** ${tickets.length} ticket(s)\n`;
        context += `**Desglose por estado:** `;
        context += Object.entries(estadoCount).map(([k, v]) => `${k}: ${v}`).join(' | ');
        context += '\n\n';

        // Last 10 tickets (sorted by date desc — already comes sorted from CRM)
        const last10 = tickets.slice(0, 10);
        context += `| # | Fecha | Área | Descripción | Estado |\n`;
        context += `|---|---|---|---|---|\n`;
        for (const t of last10) {
          const desc = (t.descripcion || '').substring(0, 120).replace(/\n/g, ' ');
          context += `| ${t.id} | ${t.fecha} | ${t.area || t.perfil || ''} | ${desc} | ${t.estado} |\n`;
        }
        if (tickets.length > 10) {
          context += `\n_(Mostrando 10 de ${tickets.length} tickets)_\n`;
        }
        context += '\n';

        // Fetch detail for top 3 most recent tickets
        const top3 = last10.slice(0, 3);
        const details = await Promise.all(
          top3.map(t => fetchTicketDetail(t.id).catch(() => null))
        );
        for (let i = 0; i < top3.length; i++) {
          const detail = details[i];
          if (!detail) continue;
          context += `#### Detalle Ticket #${top3[i].id}\n`;
          if (detail.descripcion) context += `- **Descripción:** ${detail.descripcion.substring(0, 500)}\n`;
          if (detail.solucion) context += `- **Solución:** ${detail.solucion.substring(0, 500)}\n`;
          if (detail.seguimiento) context += `- **Seguimiento:** ${detail.seguimiento.substring(0, 600)}\n`;
          if (detail.notas) context += `- **Notas:** ${detail.notas.substring(0, 600)}\n`;
          context += '\n';
        }
      } catch (e) {
        console.error(`CRM: error fetching tickets for client ${c.nombre}:`, e.message);
      }
    }

    context += `## INSTRUCCIONES PARA DATOS DE CLIENTES (OBLIGATORIO):\n`;
    context += `1. SOLO usa los datos de clientes listados arriba. NUNCA inventes nombres, CIFs ni datos.\n`;
    context += `2. Si la búsqueda fue por teléfono, indica que ese número pertenece al cliente encontrado.\n`;
    context += `3. Si se incluyen líneas del Sistema de Fibras, preséntalas junto con los datos del cliente.\n`;
    context += `4. El "Nº Líneas (CRM)" es el total registrado en el CRM. Las líneas del Sistema de Fibras son las que tenemos detalladas (puede no ser el 100%).\n`;
    context += `5. Menciona las fuentes: "Según el CRM..." para datos del cliente, "Según el Sistema de Fibras..." para las líneas.\n`;
    context += `6. Si se incluye historial de tickets, cita SIEMPRE los números exactos. NUNCA inventes números de ticket.\n`;
    context += `7. Para el historial de tickets, presenta el resumen (total, desglose por estado) y los tickets más relevantes.\n`;
    context += `---\n`;

    if (totalFibras > 0) {
      console.log(`CRM+Fibras: cross-referenced ${totalFibras} lines for ${Object.keys(fibrasResults).length} client(s)`);
    }

    return context;
  } catch (e) {
    console.error('CRM client search error:', e.message);
    return null;
  }
}

/**
 * Fetch all tickets (open + closed) for a specific client by name.
 * Uses CndCLIENTE + CndCERRADO=0 which returns everything.
 */
async function fetchClientTickets(clientName) {
  return fetchTickets({ cliente: clientName, cerrado: '0' });
}

/**
 * Fetch all tickets for a client by their numeric ID (more precise than by name).
 * Uses CLI_REFRESH_TKT endpoint with CLID parameter.
 */
async function fetchClientTicketsById(clientId) {
  const cookie = await login();

  const res = await fetch(`${CRM_URL}/aServerSide.jsp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: new URLSearchParams({
      FCT: 'CLI_REFRESH_TKT',
      crmEmpresa: CRM_EMPRESA,
      CLID: String(clientId)
    }).toString()
  });

  if (!res.ok) throw new Error(`CRM CLI_REFRESH_TKT error: ${res.status}`);
  const data = await res.json();
  if (data.respuesta && data.respuesta.startsWith('-')) {
    throw new Error(`CRM error: ${data.respuesta.substring(1)}`);
  }

  const rows = data.lista?.rows || [];
  return rows.map(row => {
    const d = row.data || [];
    return {
      id: parseTicketId(d[0]),
      fecha_limite: d[2] || '',
      fecha: d[3] ? d[3].split(' ')[0] : '',
      hora: d[3] ? d[3].split(' ')[1] || '' : '',
      telefono: d[4] || '',
      area: d[5] || '',
      tema: d[6] || '',
      descripcion: d[7] || '',
      estado: d[8] || '',
      ultimo_usuario: d[9] || ''
    };
  });
}

// --- Client lines via BDClientesCTOFichaValida.jsp ---

/**
 * Fetch lines (contratos/líneas) for a client by their numeric CRM ID.
 * Uses BDClientesCTOFichaValida.jsp with TIPOCHK=REFRESHLINCTO (not aServerSide.jsp).
 * Returns array of line objects with: contrato, linea_movil, fijo_virtual, linea_adsl_sede,
 * fijo_adsl, num_corto, fecha_alta, estado, fecha_baja, plan_tarifa
 *
 * @param {number|string} clientId - CRM client ID (CLID)
 * @param {number} [pageSize=200] - Number of results per page
 * @returns {Promise<Array>}
 */
async function fetchClientLines(clientId, pageSize = 200) {
  const cookie = await login();

  const allLines = [];
  let start = 1;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      TIPOCHK: 'REFRESHLINCTO',
      CLID: String(clientId),
      I_START: String(start),
      I_RECPAGE: String(pageSize),
      crmEmpresa: CRM_EMPRESA
    });

    const res = await fetch(`${CRM_URL}/BDClientesCTOFichaValida.jsp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie
      },
      body: params.toString()
    });

    if (!res.ok) throw new Error(`CRM lines error: ${res.status}`);
    const data = await res.json();

    const rows = data.lista?.rows || [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const d = row.data || [];
      // d[0] and d[1] contain JS links like "456217^javascript:Show_CTO(...)^_self"
      const contrato = d[0] ? String(d[0]).split('^')[0] : '';
      let lineaMov = d[1] ? String(d[1]).split('^')[0] : '';
      // Clean placeholder labels like "-- adsl/fibra --"
      if (lineaMov.startsWith('--')) lineaMov = '';
      allLines.push({
        contrato,
        linea_movil: lineaMov,
        fijo_virtual: d[2] || '',
        linea_adsl_sede: d[3] || '',
        fijo_adsl: d[4] || '',
        num_corto: d[5] || '',
        fecha_alta: d[6] || '',
        estado: d[7] || '',
        fecha_baja: d[8] || '',
        plan_tarifa: d[9] || ''
      });
    }

    // If we got fewer than pageSize, we've reached the end
    if (rows.length < pageSize) {
      hasMore = false;
    } else {
      start += pageSize;
    }
  }

  console.log(`CRM: fetched ${allLines.length} lines for client ${clientId}`);
  return allLines;
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

// --- Ticket classification suggestion ---

// Tema name → ID mapping (reverse of what create_crm_ticket uses)
const TEMA_NAME_TO_ID = {
  'Centralita': 226,
  'Centralitas': 226,
  'Conectividad': 228,
  'Configuración de endpoint': 225,
  'Config endpoint': 225,
  'Configuración endpoint': 225,
  'Gestión de líneas móviles': 227,
  'Líneas Móviles': 227,
  'Equipos informáticos': 229,
  'Equipos': 229,
  'Instalación de equipos': 255,
  'Instalación equipos': 255,
  'Instalacion': 255,
  'Visita de valoración/presupuesto': 232,
  'Visita valoración': 232,
  'General/Otros': 175,
  'General': 175,
};

/**
 * Suggest ticket classification (tema + prioridad) based on similar closed tickets.
 * Returns: { tema_id, tema_nombre, prioridad, confianza, basado_en, tickets_similares }
 */
async function suggestTicketClassification(description) {
  const results = await searchClosedSoporte(description, 20);

  if (results.length === 0) {
    return {
      tema_id: 175,
      tema_nombre: 'General/Otros',
      prioridad: 0,
      confianza: 0,
      basado_en: 0,
      tickets_similares: []
    };
  }

  // Count tema frequency
  const temaCount = {};
  const prioridadCount = {};
  for (const t of results) {
    const tema = (t.tema || '').trim();
    if (tema) temaCount[tema] = (temaCount[tema] || 0) + 1;
    const prio = parseInt(t.prioridad) || 0;
    prioridadCount[prio] = (prioridadCount[prio] || 0) + 1;
  }

  // Find most frequent tema
  let topTema = 'General/Otros';
  let topTemaCount = 0;
  for (const [tema, count] of Object.entries(temaCount)) {
    if (count > topTemaCount) {
      topTema = tema;
      topTemaCount = count;
    }
  }

  // Find most frequent prioridad
  let topPrio = 0;
  let topPrioCount = 0;
  for (const [prio, count] of Object.entries(prioridadCount)) {
    if (count > topPrioCount) {
      topPrio = parseInt(prio);
      topPrioCount = count;
    }
  }

  // Resolve tema to ID
  const temaId = TEMA_NAME_TO_ID[topTema] || 175;
  const confianza = Math.round((topTemaCount / results.length) * 100);

  // Top 5 similar tickets as reference
  const similares = results.slice(0, 5).map(t => ({
    id: t.id,
    tema: t.tema,
    cliente: t.cliente,
    descripcion: (t.descripcion || '').substring(0, 150)
  }));

  return {
    tema_id: temaId,
    tema_nombre: topTema,
    prioridad: topPrio,
    prioridad_texto: topPrio === 0 ? 'Normal' : topPrio === 1 ? 'Urgente' : 'Muy urgente',
    confianza,
    basado_en: results.length,
    tickets_similares: similares
  };
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

    // Fetch email thread for this ticket
    try {
      const emails = await fetchTicketEmails(ticketId);
      if (emails.length > 0) {
        context += `### Hilo de Emails (${emails.length} correo(s))\n\n`;
        context += `| # | Fecha | Hora | Tipo | Asunto |\n|---|---|---|---|---|\n`;
        for (const e of emails) {
          const tipo = e.tipo === 0 ? 'Entrada' : 'Salida';
          context += `| ${e.id} | ${e.fecha} | ${e.hora} | ${tipo} | ${e.asunto} |\n`;
        }
        context += '\n';

        // Fetch detail of last 3 emails for full body
        const top3 = emails.slice(0, 3);
        const details = await Promise.all(
          top3.map(e => fetchEmailDetail(e.id).catch(() => null))
        );
        for (const ed of details) {
          if (!ed) continue;
          const dir = ed.carpeta === 'Salida' ? 'Enviado' : 'Recibido';
          context += `#### Email #${ed.id} (${dir} — ${ed.fecha} ${ed.hora})\n`;
          context += `- **De:** ${ed.from}\n`;
          context += `- **Para:** ${ed.to}\n`;
          if (ed.asunto) context += `- **Asunto:** ${ed.asunto}\n`;
          if (ed.body) {
            const plainBody = ed.body.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            context += `- **Contenido:** ${plainBody.substring(0, 800)}\n`;
          }
          context += '\n';
        }
      }
    } catch (e) {
      console.error('Error fetching ticket emails:', e.message);
    }

    context += `## INSTRUCCIONES (OBLIGATORIO):\n`;
    context += `1. Presenta TODA la información del ticket #${ticketId} de forma clara y organizada.\n`;
    context += `2. Si el usuario pregunta algo específico del ticket, responde basándote SOLO en los datos reales proporcionados.\n`;
    context += `3. NUNCA inventes datos que no estén aquí.\n`;
    context += `4. Si hay hilo de emails, puedes usar \`reply_ticket_email\` para responder al cliente si el usuario lo solicita.\n`;
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

    // Fetch detail (seguimiento + notas) for top 3 tickets
    const top3 = results.slice(0, 3);
    const details = await Promise.all(
      top3.map(t => fetchTicketDetail(t.id).catch(() => null))
    );
    const detailMap = {};
    for (let i = 0; i < top3.length; i++) {
      if (details[i]) detailMap[top3[i].id] = details[i];
    }

    let context = '\n---\n## Datos del CRM - Tickets ALPHA\n\n';
    context += `Se encontraron **${results.length} ticket(s)** relevantes (de ${tickets.length} abiertos):\n\n`;

    for (const t of results.slice(0, 10)) {
      const detail = detailMap[t.id];
      context += `### Ticket #${t.id}\n`;
      context += `| Campo | Valor |\n|---|---|\n`;
      context += `| Fecha | ${t.fecha} ${t.hora} |\n`;
      context += `| Cliente | ${t.cliente} |\n`;
      context += `| Perfil | ${t.perfil} |\n`;
      context += `| Estado | ${t.estado} |\n`;
      context += `| Área | ${t.area} |\n`;
      if (t.tema) context += `| Tema | ${t.tema} |\n`;
      context += `| Descripción | ${(detail?.descripcion || t.descripcion).substring(0, 300)} |\n`;
      if (t.solucion || detail?.solucion) context += `| Solución | ${(detail?.solucion || t.solucion).substring(0, 300)} |\n`;
      if (detail?.seguimiento) context += `| **Seguimiento interno** | ${detail.seguimiento.substring(0, 500)} |\n`;
      if (detail?.notas) context += `| Historial acciones | ${detail.notas.substring(0, 400)} |\n`;
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

// --- Ticket creation via TKT_SAVE ---

// TKIDAR → TMAREA mapping (derived from CRM structure)
const AREA_MAP = {
  '10': 'INCIDENCIA',  // Soporte
  '1': 'PETICIÓN',     // Instalaciones
  '2': 'GESTIÓN',      // Comercial Voip
  '3': 'GESTIÓN',      // Oficina técnica
  '5': 'GESTIÓN',      // Atención móvil
  '6': 'GESTIÓN',      // Facturación
  '7': 'GESTIÓN',      // Atención cliente
  '8': 'GESTIÓN',      // Comercial
  '9': 'GESTIÓN',      // Oficina móvil
};

/**
 * Create a new ticket in the CRM.
 * IMPORTANT: clientId MUST be > 0 (valid CRM client). The server-side CLOB handler
 * fails with "EOF" error when TKIDCL=0. Always look up the client first via fetchClients().
 *
 * @param {Object} params
 * @param {number} params.temaId - Tema/type ID (required). 226=Centralita, 228=Conectividad, etc.
 * @param {string} params.description - Problem description (required)
 * @param {string} params.fechaLimite - Deadline DD-MM-YYYY (required)
 * @param {number} params.clientId - Client ID from CLI_LISTA (REQUIRED, must be > 0)
 * @param {number} [params.prioridad=0] - 0=Normal, 1=Urgente, 2=Muy urgente
 * @param {string} [params.contacto] - Contact name
 * @param {string} [params.email] - Contact email
 * @param {string} [params.telefono] - Contact phone
 * @returns {{ success: boolean, ticketId?: string, error?: string }}
 */
async function createTicket({ temaId, description, fechaLimite, clientId, prioridad, contacto, email, telefono }) {
  if (!clientId || clientId <= 0) {
    return { success: false, error: 'Se requiere un ID de cliente válido (clientId > 0). Busca el cliente primero con la función de búsqueda de clientes.' };
  }

  const cookie = await login();

  const now = new Date();
  const fecha = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
  const hora = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

  const params = new URLSearchParams({
    crmEmpresa: CRM_EMPRESA,
    TKID: '0',
    TKIDAR: '10',                              // Soporte
    TMAREA: AREA_MAP['10'] || 'INCIDENCIA',    // Area for Soporte
    TKIDTM: String(temaId),
    TKDESCRIPCION: description,
    TKFECHALIM: fechaLimite,
    TKIDCL: String(clientId),                  // Client ID (MUST be > 0)
    TKPRIORIDAD: String(prioridad || 0),
    TKCONTACTO: contacto || '',
    TKEMAIL: email || '',
    TKTELEFONO: telefono || '',
    TKIDUS: '1048',                            // Creator user ID
    TKFECHA: fecha,
    TKHORA: hora,
    TKESTADO: 'En espera cliente',
    TKIDESTADO: '0',
    TKUID: String(Date.now()),
    USCREA: 'ARIA Bot',
    USULTIMO: 'ARIA Bot',
    TKULTFECHA: fecha,
    TKBLOQUEO: '0',
    TKIDUSULT: '0',
    MATEXTO: '',
    MATEXTOVF: '',
    MAFICHEROS: '',
    MAFICHEROSVF: '',
    HAYMAILC: '0',
    HAYMAILO: '0',
    MAIDBU: '2',
    MAIDBU2: '6',
    OPERADORALPHA: '0',
    SCRH: '900',
    SCRW: '1440'
  });

  const res = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_SAVE`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: params.toString()
  });

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` };
  }

  const data = await res.json();

  if (data.respuesta && data.respuesta.startsWith('-')) {
    return { success: false, error: data.respuesta.substring(1).trim() };
  }

  const ticketId = data.rid ? String(data.rid) : null;
  console.log(`CRM: ticket created, rid=${data.rid}`);

  // Invalidate ticket cache
  cachedTickets = null;
  cacheTime = 0;

  return {
    success: true,
    ticketId: ticketId,
    rid: data.rid
  };
}

/**
 * Fetch the email thread (listaMails) for a specific ticket.
 * Returns array of { id, tipo, fecha, hora, asunto }
 */
async function fetchTicketEmails(ticketId) {
  const cookie = await login();

  const res = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_FICHA`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: new URLSearchParams({
      crmEmpresa: CRM_EMPRESA,
      TKID: String(ticketId),
      CLID: '0',
      MAID: '0'
    }).toString()
  });

  if (!res.ok) throw new Error(`CRM TKT_FICHA error: ${res.status}`);
  const data = await res.json();

  const rows = data.listaMails?.rows || [];
  return rows.map(row => {
    const d = row.data || [];
    return {
      id: row.id,
      tipo: row.tipo,  // 0=entrada, 1=salida
      fecha: d[1] || '',
      hora: d[2] || '',
      asunto: d[3] || ''
    };
  });
}

/**
 * Fetch full detail of a specific email by ID.
 * Uses RID parameter (not MAID).
 */
async function fetchEmailDetail(emailId) {
  const cookie = await login();

  const res = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=MAIL_FICHA`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: new URLSearchParams({
      crmEmpresa: CRM_EMPRESA,
      RID: String(emailId)
    }).toString()
  });

  if (!res.ok) throw new Error(`CRM MAIL_FICHA error: ${res.status}`);
  const data = await res.json();
  if (data.respuesta && data.respuesta.startsWith('-')) return null;

  const f = data.ficha || {};
  return {
    id: f.MAID,
    ticketId: f.MAIDTK,
    clientId: f.MAIDCL,
    asunto: f.MAASUNTO || '',
    from: f.MAFROM || '',
    to: f.MADESTS || '',
    cc: f.MACC || '',
    body: f.MATEXTO || '',
    fecha: f.MAFECHA || '',
    hora: f.MAHORA || '',
    carpeta: f.MACARPETA || '',
    estado: f.MAESTADOLBL || '',
    cliente: f.CLNOMBRE || '',
    buzon: f.BUUSR || ''
  };
}

/**
 * Send an email to a client through JDS's native email system (TKT_SAVE with HAYMAILC=1).
 * This sends the email from the soporte@ mailbox and records it in the ticket's email thread.
 *
 * @param {string} ticketId - Ticket ID
 * @param {string} toEmail - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML body of the email
 * @returns {{ success: boolean, rid?: number, error?: string }}
 */
async function sendTicketEmail(ticketId, toEmail, subject, htmlBody) {
  const cookie = await login();

  // Fetch current ticket data (need all fields for TKT_SAVE)
  const res1 = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_FICHA`, {
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

  if (!res1.ok) throw new Error(`CRM detail error: ${res1.status}`);
  const data1 = await res1.json();
  if (data1.respuesta && data1.respuesta.startsWith('-')) {
    throw new Error(`Ticket ${ticketId} no encontrado`);
  }

  const f = data1.ficha || {};

  const now = new Date();
  const fecha = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
  const hora = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}`;

  // Append send note to seguimiento
  const currentSeg = (f.TKINTERNO || '').trim();
  const segNote = `${dateStr} - Email enviado a ${toEmail}: "${subject}" (via ARIS)`;
  const newSeg = currentSeg ? currentSeg + '\n' + segNote : segNote;

  const params = new URLSearchParams({
    crmEmpresa: CRM_EMPRESA,
    CRMEMPRE: CRM_EMPRESA,
    // List filter fields (required by TKT_SAVE)
    CndCLIENTE: '',
    CndVEID: '0',
    CndIDAR: '',
    CndTMAREA: '',
    CndESTADO: '',
    CndBUS: '',
    CndCERRADO: '2',
    CndFECHA1: '',
    CndFECHA2: '',
    // Ticket fields
    TKID: f.TKID.toString(),
    TKIDAR: (f.TKIDAR || '10').toString(),
    TKFECHA: f.TKFECHA || fecha,
    TKHORA: f.TKHORA || hora,
    USCREA: f.USCREA || 'ARIS Bot',
    TKESTADO: f.TKESTADO || '',
    TMAREA: f.TMAREA || '',
    TKIDTM: (f.TKIDTM || '').toString(),
    TMCOMPROMISO: f.TMCOMPROMISO || '',
    TKFECHALIM: f.TKFECHALIM || '',
    TKPRIORIDAD: (f.TKPRIORIDAD || 0).toString(),
    VEID: (f.VEID || '0').toString(),
    TKIDCL: (f.TKIDCL || 0).toString(),
    TKIDCL_new_value: 'false',
    TKTELEFONO: f.TKTELEFONO || '',
    TKTELEFONO_new_value: 'false',
    TKCONTACTO: f.TKCONTACTO || '',
    CLCALLE: f.CLCALLE || '',
    CLCODPOST: f.CLCODPOST || '',
    TKDESCRIPCION: f.TKDESCRIPCION || '',
    TKSOLUCION: f.TKSOLUCION || '',
    TKINTERNO: newSeg,
    // Email fields — this is the key part
    MAIDBU: '2',                   // Buzón: soporte@smartgroup.es
    TKDESTS: toEmail,              // Destinatario
    TKDESTSBC: '',                 // BCC
    MAASUNTO: subject,             // Asunto del email
    CARTA_CK1: '',
    OPERADORALPHA: '0',
    MAIDBU2: '6',
    TKDESTSVF: '',
    TKDESTSVFBC: '',
    MAASUNTOVF: '',
    CARTA_CK2: '',
    // Metadata
    USBLOQUEO: '',
    TKBLOQUEOFEC: '',
    USULTIMO: 'ARIS Bot',
    TKULTFECHA: fecha,
    TKNOTAS: f.TKNOTAS || '',
    MAFICHEROS: '',
    MAFICHEROSVF: '',
    MATEXTO: htmlBody,             // HTML body del email
    MATEXTOVF: '',
    TKNUEVOESTADO: '',
    TKIDTE: '0',
    TKIDESTADO: (f.TKIDESTADO || '0').toString(),
    TKUID: String(Date.now()),
    TECUENTAVF: '',
    TKORIGEN: f.TKORIGEN || ' ',
    TKEMAIL: toEmail,
    TKNOMBRE: '',
    TKBLOQUEO: '0',
    TKIDUS: (f.TKIDUS || '1048').toString(),
    TKIDUSULT: (f.TKIDUSULT || '1048').toString(),
    PLID: '25:Respuesta Generica', // Plantilla
    PLIDVF: '',
    HAYMAILC: '1',                 // FLAG: enviar email al cliente
    HAYMAILO: '0'
  });

  const res2 = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=TKT_SAVE`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookie
    },
    body: params.toString()
  });

  if (!res2.ok) {
    return { success: false, error: `HTTP ${res2.status}` };
  }

  const data2 = await res2.json();

  if (data2.respuesta && data2.respuesta.startsWith('-')) {
    return { success: false, error: data2.respuesta.substring(1).trim() };
  }

  console.log(`CRM: email sent to ${toEmail} on ticket #${ticketId} (rid=${data2.rid})`);
  return { success: true, ticketId, rid: data2.rid };
}

// CLTIPONIF values (select dropdown in CRM form)
const TIPO_NIF_MAP = {
  'CIF': '1', 'NIF': '1', 'NIF/CIF': '1',
  'Intracomunitario': '2',
  'Pasaporte': '3',
  'Doc.Oficial': '4',
  'Cert.Residencia': '5',
  'Otro': '6'
};

// CLIDVE (Distribuidor) — known values from CRM dropdown
const DISTRIBUIDOR_MAP = {
  'SMARTGROUP': '20', 'SMARTGROUP VOIP SERVICES SL': '20',
  'GO RED': '58', 'GO RED TELECOMUNICACIONES': '58',
  'ASOCIATEL': '61', 'ASOCIATEL INTEGRADOR DE SERVICIOS': '61',
};
const DEFAULT_DISTRIBUIDOR = '20'; // SMARTGROUP

/**
 * Create a new client in the CRM.
 * 3-step flow: load form (init session) → validate → save with EdFunction=G.
 *
 * Required fields (server-side enforced):
 *   nombre, cif, tipoNif, razonSocial, calle, provincia, municipio,
 *   cargo, iban, contacto, telefono, email, lineaspot (>0), idve (distribuidor)
 */
async function createClient({ nombre, cif, tipoNif, razonSocial, calle, provincia, cargo, iban,
                               municipio, contacto, telefono, email, lineaspot, idve, ...opcionales }) {
  // Validate required fields locally first
  const missing = [];
  if (!nombre) missing.push('nombre');
  if (!cif) missing.push('cif');
  if (!razonSocial) missing.push('razonSocial');
  if (!calle) missing.push('calle');
  if (!provincia) missing.push('provincia');
  if (!cargo) missing.push('cargo');
  if (!iban) missing.push('iban');
  if (!contacto) missing.push('contacto');
  if (!telefono) missing.push('telefono');
  if (!email) missing.push('email');
  if (missing.length > 0) {
    return { success: false, error: `Faltan campos obligatorios: ${missing.join(', ')}` };
  }

  const cookie = await login();

  // Resolve tipoNif to numeric value
  const clTipoNif = TIPO_NIF_MAP[tipoNif] || TIPO_NIF_MAP[(tipoNif || '').toUpperCase()] || '1';

  // Resolve distribuidor: if numeric string use as-is, otherwise look up
  let clIdve = String(idve || '');
  if (!clIdve || clIdve === '0') {
    clIdve = DEFAULT_DISTRIBUIDOR;
  } else if (!/^\d+$/.test(clIdve)) {
    clIdve = DISTRIBUIDOR_MAP[clIdve.toUpperCase()] || DEFAULT_DISTRIBUIDOR;
  }

  // Normalize provincia to uppercase (CRM expects exact match from dropdown)
  const clProvincia = (provincia || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Remove spaces from IBAN
  const clIban = (iban || '').replace(/\s+/g, '');

  // Common fields
  const commonFields = {
    crmEmpresa: CRM_EMPRESA,
    CLID: '0',
    CLNOMBRE: nombre,
    CLCIF: cif,
    CLTIPONIF: clTipoNif,
    CLRASOCIAL: razonSocial,
    CLCALLE: calle,
    CLPROVINCIA: clProvincia,
    CLCARGO: cargo,
    CLIBAN: clIban,
    CLLINEASPOT: String(lineaspot || 1),
    CLIDVE: clIdve,
    CLCODPOST: opcionales.codPostal || '',
    CLPOBLACION: opcionales.poblacion || '',
    CLMUNICIPIO: municipio || opcionales.poblacion || '',
    CLTELEFONO: telefono,
    CLEMAIL: email,
    CLCONTACTO: contacto,
    CLTELEFONO2: '',
    CLCOMISION: '',
    CLPORTADO: '',
    CLCODPAIS: '',
    CLESTADOCOM: 'Inicial',
    CLPAIS: '',
    CLIDVE2: '',
    CLIDAGRUPADA: '',
    CLIDTECNICO: '',
    CLFACTURA: '',
    CLDIA1: '',
    CLAGRUPACION: '',
    CLTIPOCOB: '',
    CLIVA: '',
    CLEMPRESA: CRM_EMPRESA,
    CLESTRUCTURA: '',
    CLDIRFACT: '',
    CLOBSERVA: '',
    CLCOD: '',
    CLCLAVEEXT: '',
    CLFCREACION: '',
    CLFECHASUS: '',
    CLVPN: '',
    CLCTOVDATOS: '',
    CLCTBASE500: '',
    CLCTILIMITADAS: '',
    CLCTM2M: '',
    CLCTOTR1: '',
    CLCTOTR2: ''
  };

  // Step 1: Load the form to initialize server session
  await fetch(`${CRM_URL}/BDClientesCOMFicha.jsp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie },
    body: new URLSearchParams({ crmEmpresa: CRM_EMPRESA, CLID: '0', Seccion: '0', Iniciado: 'Clientes', EdFunction: 'N' }).toString()
  });

  // Step 2: Validate (TIPOCHK=SAVE) — returns JSON
  const resVal = await fetch(`${CRM_URL}/BDClientesCOMFichaValida.jsp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie },
    body: new URLSearchParams({ TIPOCHK: 'SAVE', ...commonFields }).toString()
  });

  if (!resVal.ok) {
    return { success: false, error: `Error de validación HTTP ${resVal.status}` };
  }

  const valData = await resVal.json().catch(() => null);
  if (valData && valData.respuesta && valData.respuesta.startsWith('-')) {
    return { success: false, error: `Validación CRM: ${valData.respuesta.substring(1)}` };
  }

  // Step 3: Save (POST form with EdFunction=G)
  const resCreate = await fetch(`${CRM_URL}/BDClientesCOMFicha.jsp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie },
    body: new URLSearchParams({
      EdFunction: 'G',
      Seccion: '0',
      SubSeccion: '0',
      Entrada: '',
      Iniciado: 'Clientes',
      TIPOCHK: '',
      SCRH: '900',
      SCRW: '1440',
      ...commonFields
    }).toString(),
    redirect: 'manual'
  });

  const createText = await resCreate.text();

  // Check for server-side save errors — only match errors that run on page load
  // (inside $(document).ready or inline script), NOT inside function definitions
  const docReadyBlock = createText.match(/\$\(document\)\.ready\(function\(\)\s*\{([\s\S]{0,2000}?)\}\)/);
  const inlineError = docReadyBlock ? docReadyBlock[1].match(/MensajeError\(["']([^"']+)["']\)/) : null;
  if (inlineError) {
    const cleanError = inlineError[1].replace(/<br\s*\/?>/gi, '; ').replace(/<[^>]*>/g, '');
    return { success: false, error: cleanError };
  }

  // Try to extract CLID from the saved form
  let clientId = null;
  const clidMatch = createText.match(/name=["']CLID["'][^>]*value=["'](\d+)["']/i);
  if (clidMatch && clidMatch[1] !== '0') {
    clientId = clidMatch[1];
  }

  // If CLID still 0, verify by searching (the save might have worked but form reloaded with CLID=0)
  if (!clientId) {
    try {
      const verifyRes = await fetch(`${CRM_URL}/aServerSide.jsp?FCT=CLI_LISTA`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookie },
        body: new URLSearchParams({ crmEmpresa: CRM_EMPRESA, CRMEMPRE: CRM_EMPRESA, CndBUS: cif, SCRH: '900', SCRW: '1440' }).toString()
      });
      const verifyData = await verifyRes.json();
      const rows = verifyData.lista?.rows || [];
      const match = rows.find(r => (r.data?.[1] || '').includes(nombre.substring(0, 10)));
      if (match) {
        clientId = parseClientId(match.data?.[0]);
      }
    } catch {}
  }

  if (!clientId) {
    return { success: false, error: 'No se pudo confirmar la creación del cliente. Verifica manualmente en el CRM.' };
  }

  console.log(`CRM: client created "${nombre}" (CLID=${clientId})`);
  return {
    success: true,
    clientId,
    message: `Cliente "${nombre}" creado correctamente (ID: ${clientId})`
  };
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
  searchClosedSoporte,
  createTicket,
  createClient,
  updateSeguimiento,
  fetchClientTickets,
  fetchClients,
  fetchTicketEmails,
  fetchEmailDetail,
  fetchTicketDetail,
  sendTicketEmail,
  fetchClientTicketsById,
  fetchClientLines,
  closeTicket,
  suggestTicketClassification
};
