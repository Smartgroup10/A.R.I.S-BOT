const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { ImapFlow } = require('imapflow');

const TEKI_URL = process.env.TEKI_URL || 'https://www.teki.es';
const TEKI_USER = process.env.TEKI_USER;
const TEKI_PASS = process.env.TEKI_PASS;
const TEKI_IMAP_HOST = process.env.TEKI_IMAP_HOST || 'imap.serviciodecorreo.es';
const TEKI_IMAP_PORT = parseInt(process.env.TEKI_IMAP_PORT || '993');
const TEKI_IMAP_USER = process.env.TEKI_IMAP_USER;
const TEKI_IMAP_PASS = process.env.TEKI_IMAP_PASS;

let sessionCookies = null;
let cookieExpiry = 0;
let loginInProgress = null; // Prevent concurrent login attempts

function isConfigured() {
  // Disabled until Teki provides a proper API (scraping + 2FA too fragile)
  return false;
}

// --- Hidden field parsing ---

const HIDDEN_FIELD_PATTERNS = [
  /<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"/gi,
  /<input[^>]+name="([^"]+)"[^>]+type="hidden"[^>]+value="([^"]*)"/gi,
  /<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"[^>]+type="hidden"/gi,
];

function parseHiddenFields(html) {
  const fields = {};
  for (const re of HIDDEN_FIELD_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(html)) !== null) fields[m[1]] = m[2];
  }
  return fields;
}

function collectCookies(response, existing) {
  const cookies = [...existing];
  const raw = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const c of raw) {
    const pair = c.split(';')[0].trim();
    // Skip "deleted" cookies
    if (!pair.includes('=deleted')) cookies.push(pair);
  }
  return cookies;
}

function buildCookieString(cookies) {
  // Deduplicate by key (last value wins)
  const map = {};
  for (const c of cookies) {
    const [key] = c.split('=', 1);
    map[key] = c;
  }
  return Object.values(map).join('; ');
}

// --- IMAP 2FA code retrieval ---

function createImapClient() {
  const client = new ImapFlow({
    host: TEKI_IMAP_HOST,
    port: TEKI_IMAP_PORT,
    secure: true,
    auth: { user: TEKI_IMAP_USER, pass: TEKI_IMAP_PASS },
    logger: false,
    socketTimeout: 15000
  });
  // Prevent unhandled error crashes
  client.on('error', (err) => {
    console.error('Teki IMAP error:', err.message);
  });
  return client;
}

// Get the UID of the latest Teki email (to know which ones to skip)
async function getLatestTekiUid() {
  const client = createImapClient();

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      let maxUid = 0;
      for await (const msg of client.fetch(
        { since: tenMinAgo },
        { envelope: true }
      )) {
        const subject = msg.envelope.subject || '';
        if (subject.includes('TEKI') || subject.includes('teki')) {
          if (msg.uid > maxUid) maxUid = msg.uid;
        }
      }
      return maxUid;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
    client.close();
  }
}

async function read2FACode(lastKnownUid, maxWaitMs = 45000) {
  const startTime = Date.now();
  const pollInterval = 3000;
  // Wait at least 5s for email delivery before first check
  await new Promise(r => setTimeout(r, 5000));

  while (Date.now() - startTime < maxWaitMs) {
    const client = createImapClient();

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

        for await (const msg of client.fetch(
          { since: fiveMinAgo },
          { envelope: true, bodyParts: ['1'] }
        )) {
          const subject = msg.envelope.subject || '';
          if ((subject.includes('TEKI') || subject.includes('teki')) && msg.uid > lastKnownUid) {
            const textBody = msg.bodyParts?.get('1')?.toString() || '';
            const codeMatch = textBody.match(/\b(\d{8})\b/);
            if (codeMatch) {
              console.log('Teki: 2FA code extracted from email (uid:', msg.uid + ')');
              return codeMatch[1];
            }
          }
        }
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
      client.close?.();
    }

    // Wait and retry with fresh connection
    console.log('Teki: 2FA email not yet arrived, retrying...');
    await new Promise(r => setTimeout(r, pollInterval));
  }

  console.error('Teki: Timed out waiting for 2FA email');
  return null;
}

// --- Authentication (with 2FA) ---

async function login() {
  // Prevent concurrent logins
  if (loginInProgress) return loginInProgress;

  loginInProgress = (async () => {
    try {
      console.log('Teki: Starting login...');

      // Step 0: Get latest known Teki email UID (to skip old codes)
      const lastUid = await getLatestTekiUid();
      console.log('Teki: Last known email UID:', lastUid);

      // Step 1: GET login page for session cookie + hidden fields
      const getRes = await fetch(TEKI_URL + '/');
      const loginHtml = await getRes.text();
      let cookies = collectCookies(getRes, []);
      const hiddenFields = parseHiddenFields(loginHtml);

      // Step 2: POST credentials (triggers 2FA email)
      const formData = { ...hiddenFields, usuario_mail: TEKI_USER, password: TEKI_PASS };
      const postRes = await fetch(TEKI_URL + '/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: buildCookieString(cookies)
        },
        body: new URLSearchParams(formData),
        redirect: 'follow'
      });

      cookies = collectCookies(postRes, cookies);
      const html2FA = await postRes.text();

      // Verify we're on the 2FA page (not still on login = wrong credentials)
      if (html2FA.includes('usuario_mail') && html2FA.includes('password') && !html2FA.includes('token_2fa')) {
        throw new Error('Teki login failed: invalid credentials');
      }

      if (!html2FA.includes('token_2fa')) {
        throw new Error('Teki login: unexpected page (no 2FA prompt)');
      }

      console.log('Teki: Credentials accepted, waiting for 2FA code...');

      // Step 3: Read 2FA code from email via IMAP (only emails newer than lastUid)
      const code = await read2FACode(lastUid, 45000);
      if (!code) {
        throw new Error('Teki: Could not retrieve 2FA code from email');
      }

      // Step 4: Submit 2FA code
      const fields2FA = parseHiddenFields(html2FA);
      const codeFormData = { ...fields2FA, token_2fa: code };
      const codeRes = await fetch(TEKI_URL + '/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: buildCookieString(cookies)
        },
        body: new URLSearchParams(codeFormData),
        redirect: 'manual'
      });

      cookies = collectCookies(codeRes, cookies);

      // Follow redirects after 2FA
      let nextLoc = codeRes.headers.get('location');
      while (nextLoc) {
        const url = nextLoc.startsWith('http') ? nextLoc : TEKI_URL + nextLoc;
        const r = await fetch(url, { headers: { Cookie: buildCookieString(cookies) }, redirect: 'manual' });
        cookies = collectCookies(r, cookies);
        nextLoc = r.headers.get('location');
      }

      sessionCookies = buildCookieString(cookies);
      cookieExpiry = Date.now() + 25 * 60 * 1000; // 25 min

      console.log('Teki: Login + 2FA completed');
      return sessionCookies;
    } finally {
      loginInProgress = null;
    }
  })();

  return loginInProgress;
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

function isNotAuthorized(html) {
  return html.includes('no autorizado');
}

async function fetchPage(url) {
  let session = await getSession();
  let res = await fetch(url, { headers: { Cookie: session }, redirect: 'follow' });
  let html = await res.text();

  if (isLoginPage(html) || isNotAuthorized(html)) {
    // Force re-login
    sessionCookies = null;
    cookieExpiry = 0;
    session = await getSession();
    res = await fetch(url, { headers: { Cookie: session }, redirect: 'follow' });
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

  if (isLoginPage(html) || isNotAuthorized(html)) {
    sessionCookies = null;
    cookieExpiry = 0;
    session = await getSession();
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: session },
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
    const valMatch = m[0].match(/value="([^"]*)"/);
    fields[m[1]] = valMatch ? valMatch[1] : '';
  }
  const selectRegex = /<select[^>]+name="([^"]+)"[^>]*>/gi;
  while ((m = selectRegex.exec(html)) !== null) {
    fields[m[1]] = '';
  }
  return fields;
}

function findFieldByLabel(html, labelText) {
  const escapedLabel = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(escapedLabel + '[\\s\\S]{0,500}?name="([^"]+)"', 'i');
  const m = pattern.exec(html);
  return m ? m[1] : null;
}

// --- HTML table parsing ---

function parseTable(html) {
  const results = [];
  const columns = [];

  const theadMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/);
  if (theadMatch) {
    const thMatches = theadMatch[1].match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [];
    for (const th of thMatches) {
      const text = th.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      if (text) columns.push(text);
    }
  }

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return { columns, rows: results };

  const rowMatches = tbodyMatch[1].match(/<tr[^>]*>([\s\S]*?)<\/tr>/g) || [];
  for (const rowHtml of rowMatches) {
    const cells = rowHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    const values = cells.map(c => c.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());

    if (values.length > 0 && columns.length > 0) {
      const row = {};
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

  if (isNotAuthorized(html)) {
    console.error('Teki: User not authorized for Desvíos module');
    return null;
  }

  desviosFormCache = parseFormFields(html);

  const phoneField = findFieldByLabel(html, 'Teléfono') ||
                     findFieldByLabel(html, 'telefono') ||
                     findFieldByLabel(html, 'Número');
  if (phoneField) desviosFormCache._phoneField = phoneField;

  return desviosFormCache;
}

async function searchDesvios(telefono) {
  const fields = await getDesviosFormFields();
  if (!fields) return { rows: [], total: 0 };

  const formData = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('_')) continue;
    formData[k] = v;
  }

  const phoneField = fields._phoneField || Object.keys(fields).find(k =>
    /telefono|phone|linea|numero/i.test(k)
  );
  if (phoneField) {
    formData[phoneField] = telefono;
  }

  const html = await postForm(DESVIOS_URL, formData);
  const { rows } = parseTable(html);

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

  if (isNotAuthorized(html)) {
    console.error('Teki: User not authorized for Fibras module');
    return null;
  }

  fibrasFormCache = parseFormFields(html);

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
  if (!fields) return { rows: [], total: 0 };

  const formData = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.startsWith('_')) continue;
    formData[k] = v;
  }

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
