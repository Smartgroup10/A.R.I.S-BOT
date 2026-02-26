const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const TEKI_URL = process.env.TEKI_URL || 'https://www.teki.es';
const TEKI_USER = process.env.TEKI_USER;
const TEKI_PASS = process.env.TEKI_PASS;

let sessionCookies = null;
let cookieExpiry = 0;

function isConfigured() {
  return !!(TEKI_USER && TEKI_PASS);
}

// --- Authentication ---

async function login() {
  const res = await fetch(TEKI_URL + '/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      usuario_mail: TEKI_USER,
      password: TEKI_PASS
    }),
    redirect: 'manual'
  });

  // Collect cookies from Set-Cookie headers
  const raw = res.headers.get('set-cookie') || '';
  if (raw) {
    sessionCookies = raw.split(/,(?=\s*\w+=)/).map(c => c.split(';')[0].trim()).join('; ');
  }

  // Follow redirect to get more cookies if needed
  const location = res.headers.get('location');
  if (location) {
    const followUrl = location.startsWith('http') ? location : TEKI_URL + location;
    const res2 = await fetch(followUrl, {
      headers: { Cookie: sessionCookies || '' },
      redirect: 'manual'
    });
    const raw2 = res2.headers.get('set-cookie') || '';
    if (raw2) {
      const extra = raw2.split(/,(?=\s*\w+=)/).map(c => c.split(';')[0].trim()).join('; ');
      sessionCookies = sessionCookies ? sessionCookies + '; ' + extra : extra;
    }
  }

  cookieExpiry = Date.now() + 25 * 60 * 1000; // 25 min
  console.log('Teki: logged in successfully');
  return sessionCookies;
}

async function getSession() {
  if (!sessionCookies || Date.now() > cookieExpiry) {
    await login();
  }
  return sessionCookies;
}

function isLoginPage(html) {
  return html.includes('usuario_mail') && html.includes('password') && html.includes('Acceder');
}

async function fetchPage(url) {
  let session = await getSession();
  let res = await fetch(url, { headers: { Cookie: session }, redirect: 'follow' });
  let html = await res.text();

  if (isLoginPage(html)) {
    await login();
    res = await fetch(url, { headers: { Cookie: sessionCookies }, redirect: 'follow' });
    html = await res.text();
  }
  return html;
}

async function postForm(url, formData) {
  let session = await getSession();
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: session },
    body: new URLSearchParams(formData),
    redirect: 'follow'
  });
  let html = await res.text();

  if (isLoginPage(html)) {
    await login();
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: sessionCookies },
      body: new URLSearchParams(formData),
      redirect: 'follow'
    });
    html = await res.text();
  }
  return html;
}

// --- Form field discovery ---

function parseFormFields(html) {
  const fields = {};
  const inputRegex = /<input[^>]+name="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = inputRegex.exec(html)) !== null) {
    // Get value if present
    const valMatch = m[0].match(/value="([^"]*)"/);
    fields[m[1]] = valMatch ? valMatch[1] : '';
  }
  const selectRegex = /<select[^>]+name="([^"]+)"[^>]*>/gi;
  while ((m = selectRegex.exec(html)) !== null) {
    fields[m[1]] = '';
  }
  return fields;
}

// Find field name near a label text
function findFieldByLabel(html, labelText) {
  // Look for: label containing text, then nearby input/select with name
  const escapedLabel = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Pattern 1: label text in a div/label before input
  const pattern = new RegExp(escapedLabel + '[\\s\\S]{0,500}?name="([^"]+)"', 'i');
  const m = pattern.exec(html);
  return m ? m[1] : null;
}

// --- HTML table parsing ---

function parseTable(html) {
  const results = [];
  const columns = [];

  // Extract thead columns
  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const thMatches = theadMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
    for (const th of thMatches) {
      const text = th.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text) columns.push(text);
    }
  }

  // Extract tbody rows
  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { columns, rows: results };

  const rowMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  for (const rowHtml of rowMatches) {
    const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const values = cells.map(c => c.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

    if (values.length > 0 && columns.length > 0) {
      const row = {};
      // Skip first column if it's "Opciones" (action button)
      const offset = columns[0].toLowerCase().includes('opciones') ? 1 : 0;
      for (let i = offset; i < columns.length; i++) {
        row[columns[i]] = values[i] || '';
      }
      results.push(row);
    }
  }

  return { columns, rows: results };
}

// --- Desvíos ---

const DESVIOS_URL = TEKI_URL + '/proc/provision_desvio_geografico_lcr/busc/';
let desviosFormCache = null;

async function getDesviosFormFields() {
  if (desviosFormCache) return desviosFormCache;
  const html = await fetchPage(DESVIOS_URL);
  desviosFormCache = parseFormFields(html);

  // Try to identify the phone number field
  const phoneField = findFieldByLabel(html, 'Teléfono') ||
                     findFieldByLabel(html, 'telefono') ||
                     findFieldByLabel(html, 'Número');
  if (phoneField) desviosFormCache._phoneField = phoneField;

  return desviosFormCache;
}

async function searchDesvios(telefono) {
  const fields = await getDesviosFormFields();

  // Build form data with all empty fields + phone number
  const formData = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('_')) continue;
    formData[k] = v;
  }

  // Set phone field
  const phoneField = fields._phoneField || Object.keys(fields).find(k =>
    /telefono|phone|linea|numero/i.test(k)
  );
  if (phoneField) {
    formData[phoneField] = telefono;
  }

  const html = await postForm(DESVIOS_URL, formData);
  const { rows } = parseTable(html);

  // Also try to extract total from "Registros X a Y de Z"
  const totalMatch = html.match(/Registros?\s+\d+\s+a\s+\d+\s+de\s+(\d+)/i);
  const total = totalMatch ? parseInt(totalMatch[1]) : rows.length;

  return { rows, total };
}

// --- Teki Fibras ---

const FIBRAS_TEKI_URL = TEKI_URL + '/proc/solicitud_fibra_fib/busc';
let fibrasFormCache = null;

async function getFibrasFormFields() {
  if (fibrasFormCache) return fibrasFormCache;
  const html = await fetchPage(FIBRAS_TEKI_URL);
  fibrasFormCache = parseFormFields(html);

  // Identify key fields
  const codeField = findFieldByLabel(html, 'Solicitud') || findFieldByLabel(html, 'Código');
  if (codeField) fibrasFormCache._codeField = codeField;

  const ipField = findFieldByLabel(html, 'Dirección IP') || findFieldByLabel(html, 'IP');
  if (ipField) fibrasFormCache._ipField = ipField;

  const iuaField = findFieldByLabel(html, 'IUA');
  if (iuaField) fibrasFormCache._iuaField = iuaField;

  return fibrasFormCache;
}

async function searchTekiFibras(query) {
  const fields = await getFibrasFormFields();

  const formData = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('_')) continue;
    formData[k] = v;
  }

  // Detect what the user is searching for
  const codeMatch = query.match(/\b(\d{4,6})\b/);
  const ipMatch = query.match(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/);
  const iuaMatch = query.match(/\b(\d{9,12})\b/);

  if (codeMatch && fields._codeField) {
    formData[fields._codeField] = codeMatch[1];
  } else if (ipMatch && fields._ipField) {
    formData[fields._ipField] = ipMatch[1];
  } else if (iuaMatch && fields._iuaField) {
    formData[fields._iuaField] = iuaMatch[1];
  }

  const html = await postForm(FIBRAS_TEKI_URL, formData);
  const { rows } = parseTable(html);

  const totalMatch = html.match(/Registros?\s+\d+\s+a\s+\d+\s+de\s+(\d+)/i);
  const total = totalMatch ? parseInt(totalMatch[1]) : rows.length;

  return { rows: rows.slice(0, 20), total };
}

// --- Detection patterns ---

const DESVIO_PATTERNS = [
  /desv[ií]o/i,
  /desviar/i,
  /redirig/i,
  /forwarding/i,
  /tiene\s+desv/i,
  /desv[ií]os?\s+activ/i,
  /desv[ií]os?\s+program/i,
  /a\s+d[oó]nde\s+desv/i,
  /n[uú]mero\s+de\s+desv/i,
  /l[ií]nea\s+fija.*desv/i,
  /fijo.*desv/i,
];

const TEKI_FIBRAS_PATTERNS = [
  /solicitud\s+(?:de\s+)?fibra/i,
  /estado\s+(?:de\s+)?(?:la\s+)?fibra/i,
  /estado\s+lcr/i,
  /estado\s+proveedor/i,
  /instalaci[oó]n\s+ptro/i,
  /ventana\s+(?:de\s+)?activaci[oó]n/i,
  /\bIUA\b/,
  /\bIDONT\b/,
  /\bptro\b/i,
  /solicitud\s+\d{4,6}/i,
  /c[oó]digo\s+(?:de\s+)?solicitud/i,
];

function mightBeAboutDesvios(message) {
  return DESVIO_PATTERNS.some(p => p.test(message));
}

function mightBeAboutTekiFibras(message) {
  return TEKI_FIBRAS_PATTERNS.some(p => p.test(message));
}

// Extract phone numbers from message (Spanish landlines: 9 digits starting with 8 or 9)
function extractPhoneNumbers(message) {
  const matches = message.match(/\b[89]\d{8}\b/g) || [];
  return [...new Set(matches)];
}

// --- Context formatters ---

async function getDesviosContext(message) {
  if (!isConfigured()) return null;

  try {
    const phones = extractPhoneNumbers(message);
    if (phones.length === 0) return null;

    let allRows = [];
    for (const phone of phones.slice(0, 5)) {
      const { rows } = await searchDesvios(phone);
      allRows.push(...rows);
    }

    if (allRows.length === 0) {
      return `\n---\n## Desvíos de Líneas Fijas (Portal Teki)\n\nNo se encontraron datos de desvío para: ${phones.join(', ')}.\n---\n`;
    }

    let ctx = '\n---\n## Desvíos de Líneas Fijas (Portal Teki)\n\n';
    ctx += `Se encontraron **${allRows.length} resultado(s)**:\n\n`;
    ctx += '| Línea | Empresa | Cliente | Desvío activo | Desvío programado | Número desvío |\n';
    ctx += '|---|---|---|---|---|---|\n';

    for (const row of allRows) {
      const linea = row['Linea'] || row['Línea'] || row['linea'] || '';
      const empresa = row['Empresa'] || '';
      const cliente = row['Cliente'] || '';
      const activo = row['Desvio activo'] || row['Desvío activo'] || '';
      const programado = row['Desvio programado'] || row['Desvío programado'] || '';
      const numDesvio = row['Número desvio'] || row['Número desvío'] || row['Numero desvio'] || '';
      ctx += `| ${linea} | ${empresa} | ${cliente} | ${activo} | ${programado} | ${numDesvio} |\n`;
    }

    ctx += '\n## INSTRUCCIONES PARA DATOS DE DESVÍOS (OBLIGATORIO):\n';
    ctx += '1. Presenta la información de desvíos de forma clara.\n';
    ctx += '2. Indica si el desvío está ACTIVO o NO, y a qué número redirige.\n';
    ctx += '3. NUNCA inventes datos de desvíos. Solo usa lo que está en la tabla.\n';
    ctx += '4. Menciona la fuente: "Según el portal Teki..."\n';
    ctx += '---\n';

    return ctx;
  } catch (e) {
    console.error('Teki desvíos error:', e.message);
    return null;
  }
}

async function getTekiFibrasContext(message) {
  if (!isConfigured()) return null;

  try {
    const { rows, total } = await searchTekiFibras(message);

    if (rows.length === 0) return null;

    let ctx = '\n---\n## Solicitudes de Fibra (Portal Teki)\n\n';
    ctx += `Se encontraron **${total} solicitud(es)**`;
    if (total > 20) ctx += ` (mostrando 20)`;
    ctx += ':\n\n';

    for (const row of rows.slice(0, 10)) {
      const codigo = row['Código'] || row['Codigo'] || '';
      ctx += `### Solicitud ${codigo}\n`;
      ctx += '| Campo | Valor |\n|---|---|\n';
      for (const [k, v] of Object.entries(row)) {
        if (v && v !== '-' && !k.toLowerCase().includes('opciones') && !k.toLowerCase().includes('hitos')) {
          ctx += `| ${k} | ${v} |\n`;
        }
      }
      ctx += '\n';
    }

    ctx += '## INSTRUCCIONES PARA SOLICITUDES DE FIBRA (OBLIGATORIO):\n';
    ctx += '1. Presenta la información de forma clara y organizada.\n';
    ctx += '2. NUNCA inventes códigos de solicitud, estados ni fechas.\n';
    ctx += '3. Menciona la fuente: "Según el portal Teki..."\n';
    ctx += '---\n';

    return ctx;
  } catch (e) {
    console.error('Teki fibras error:', e.message);
    return null;
  }
}

module.exports = {
  isConfigured,
  mightBeAboutDesvios,
  mightBeAboutTekiFibras,
  getDesviosContext,
  getTekiFibrasContext,
  searchDesvios,
  searchTekiFibras
};
