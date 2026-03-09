const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const openpgp = require('openpgp');

const PASSBOLT_URL = (process.env.PASSBOLT_URL || '').replace(/\/$/, '');
const PASSBOLT_USER_ID = process.env.PASSBOLT_USER_ID || '';
const PASSBOLT_PASSPHRASE = process.env.PASSBOLT_PASSPHRASE || '';
const PRIVATE_KEY_PATH = path.join(__dirname, '..', '..', 'config', 'passbolt-private.key');

// Patterns that indicate the user wants credentials (same as old vault.js)
const CREDENTIAL_PATTERNS = [
  /password/i,
  /contrase[ñn]a/i,
  /credencial/i,
  /acceso a\b/i,
  /clave de\b/i,
  /usuario de\b/i,
  /login de\b/i,
  /usuario y (contrase|clave|pass)/i,
  /datos de acceso/i,
  /c[oó]mo (entro|accedo|me conecto)/i,
  /pass (del|de la|de los)/i
];

// Stop words to strip from search queries
const STOP_WORDS = new Set([
  'dime', 'dame', 'cual', 'cuál', 'que', 'qué', 'es', 'la', 'el', 'los', 'las', 'de', 'del',
  'un', 'una', 'unos', 'unas', 'para', 'por', 'porfa', 'porfavor', 'por favor', 'me',
  'contraseña', 'contrasena', 'password', 'pass', 'clave', 'credencial', 'credenciales',
  'acceso', 'usuario', 'login', 'datos', 'como', 'cómo', 'entro', 'accedo', 'conecto',
  'necesito', 'quiero', 'puedes', 'darme', 'decirme', 'saber', 'ver', 'a', 'al', 'y',
  'con', 'en', 'te', 'se', 'si', 'no', 'hay', 'tiene', 'tengo', 'favor'
]);

/**
 * Extract meaningful search keywords from a user message.
 * Strips credential-related words and stop words to get the actual service name.
 */
function extractSearchKeywords(message) {
  const words = message.toLowerCase()
    .replace(/[¿?¡!.,;:()]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return words;
}

/**
 * Score how well a resource matches search keywords.
 * Returns 0 if no match, higher = better match.
 */
function scoreResource(resource, keywords) {
  const haystack = [
    resource.name || '',
    resource.username || '',
    resource.uri || '',
    resource.description || ''
  ].join(' ').toLowerCase();

  let score = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) score += 1;
  }
  return score;
}

// In-memory state
let privateKey = null;
let serverPublicKey = null;
let accessToken = null;
let refreshToken = null;
let tokenExpiry = 0;
let initialized = false;

// Search cache: { query -> { results, timestamp } }
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function isConfigured() {
  const hasKey = process.env.PASSBOLT_PRIVATE_KEY_B64 || process.env.PASSBOLT_PRIVATE_KEY || fs.existsSync(PRIVATE_KEY_PATH);
  return !!(PASSBOLT_URL && PASSBOLT_USER_ID && PASSBOLT_PASSPHRASE && hasKey);
}

function mightNeedCredentials(message) {
  return CREDENTIAL_PATTERNS.some(p => p.test(message));
}

/**
 * Repair a PGP armored key where newlines were stripped (e.g. by Coolify).
 * Reconstructs proper armored format with header, base64 lines, and footer.
 */
function repairArmoredKey(key) {
  const header = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
  const footer = '-----END PGP PRIVATE KEY BLOCK-----';

  // Extract the base64 body between header and footer
  let body = key
    .replace(header, '')
    .replace(footer, '')
    .replace(/\s+/g, '');

  // Split base64 into 76-char lines (standard PGP armored format)
  const lines = [];
  for (let i = 0; i < body.length; i += 76) {
    lines.push(body.substring(i, i + 76));
  }

  return `${header}\n\n${lines.join('\n')}\n${footer}\n`;
}

/**
 * Initialize: read + decrypt private key, fetch server public key.
 */
async function init() {
  if (!isConfigured()) {
    console.log('Passbolt: not configured, skipping init');
    return;
  }
  try {
    // Read private key: PASSBOLT_PRIVATE_KEY_B64 (base64, safest for Coolify)
    //                    PASSBOLT_PRIVATE_KEY (raw armored text)
    //                    or file (local dev)
    let armoredKey;
    if (process.env.PASSBOLT_PRIVATE_KEY_B64) {
      armoredKey = Buffer.from(process.env.PASSBOLT_PRIVATE_KEY_B64, 'base64').toString('utf-8');
    } else if (process.env.PASSBOLT_PRIVATE_KEY) {
      armoredKey = process.env.PASSBOLT_PRIVATE_KEY;
      if (armoredKey.includes('\\n')) armoredKey = armoredKey.replace(/\\n/g, '\n');
      if (!armoredKey.includes('\n')) armoredKey = repairArmoredKey(armoredKey);
    } else {
      armoredKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf-8');
    }
    const rawKey = await openpgp.readPrivateKey({ armoredKey });
    privateKey = await openpgp.decryptKey({ privateKey: rawKey, passphrase: PASSBOLT_PASSPHRASE });

    const res = await fetch(`${PASSBOLT_URL}/auth/verify.json`);
    if (!res.ok) throw new Error(`Server verify failed: ${res.status}`);
    const data = await res.json();
    serverPublicKey = await openpgp.readKey({ armoredKey: data.body.keydata });

    initialized = true;
    console.log('Passbolt: initialized OK');
  } catch (err) {
    console.error('Passbolt init error:', err.message);
    // Log key diagnostics to help debug env var issues
    const envKey = process.env.PASSBOLT_PRIVATE_KEY;
    if (envKey) {
      console.error(`Passbolt: PASSBOLT_PRIVATE_KEY length=${envKey.length}, starts="${envKey.substring(0, 40)}..."`);
    }
    initialized = false;
  }
}

/**
 * JWT login via GPG challenge-response.
 */
async function login() {
  const challenge = JSON.stringify({
    version: '1.0.0',
    domain: PASSBOLT_URL,
    verify_token: crypto.randomUUID(),
    verify_token_expiry: Math.floor(Date.now() / 1000) + 600
  });

  const message = await openpgp.createMessage({ text: challenge });
  const encrypted = await openpgp.encrypt({
    message,
    encryptionKeys: serverPublicKey,
    signingKeys: privateKey,
    format: 'armored'
  });

  const res = await fetch(`${PASSBOLT_URL}/auth/jwt/login.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: PASSBOLT_USER_ID, challenge: encrypted })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Passbolt login failed (${res.status}): ${errBody}`);
  }

  const responseData = await res.json();
  const encryptedResponse = await openpgp.readMessage({ armoredMessage: responseData.body.challenge });
  const { data: decrypted } = await openpgp.decrypt({
    message: encryptedResponse,
    decryptionKeys: privateKey
  });

  const tokens = JSON.parse(decrypted);
  accessToken = tokens.access_token;
  refreshToken = tokens.refresh_token;
  // Set expiry ~4 min from now (tokens last ~5 min, refresh early)
  tokenExpiry = Date.now() + 4 * 60 * 1000;
  console.log('Passbolt: logged in OK');
}

/**
 * Refresh JWT tokens using refresh_token.
 */
async function refreshTokens() {
  if (!refreshToken) throw new Error('No refresh token available');

  const res = await fetch(`${PASSBOLT_URL}/auth/jwt/refresh.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: PASSBOLT_USER_ID, refresh_token: refreshToken })
  });

  if (!res.ok) {
    // Refresh failed — need full re-login
    accessToken = null;
    refreshToken = null;
    tokenExpiry = 0;
    throw new Error('Refresh failed');
  }

  const data = await res.json();
  accessToken = data.body.access_token;
  refreshToken = data.body.refresh_token;
  tokenExpiry = Date.now() + 4 * 60 * 1000;
}

/**
 * Ensure we have a valid auth token before making API calls.
 */
async function ensureAuth() {
  if (!initialized) await init();
  if (!initialized) throw new Error('Passbolt not initialized');

  if (accessToken && Date.now() < tokenExpiry) return;

  if (refreshToken) {
    try {
      await refreshTokens();
      return;
    } catch {
      // Fall through to full login
    }
  }

  await login();
}

/**
 * Make an authenticated GET request to the Passbolt API.
 */
async function authenticatedFetch(urlPath) {
  await ensureAuth();
  const res = await fetch(`${PASSBOLT_URL}${urlPath}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (res.status === 401) {
    // Token expired mid-request, retry once
    accessToken = null;
    tokenExpiry = 0;
    await ensureAuth();
    const retry = await fetch(`${PASSBOLT_URL}${urlPath}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return retry.json();
  }

  return res.json();
}

/**
 * Decrypt a PGP-encrypted secret string.
 * Returns { password, description? } or { password } for simple types.
 */
async function decryptSecret(armoredSecret) {
  const message = await openpgp.readMessage({ armoredMessage: armoredSecret });
  const { data: decrypted } = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey
  });

  try {
    return JSON.parse(decrypted);
  } catch {
    // password-string type: raw string
    return { password: decrypted };
  }
}

/**
 * Search resources in Passbolt by query. Returns decrypted results.
 * Extracts keywords, searches via API, then filters + ranks client-side.
 * Uses cache with 5min TTL.
 */
async function searchResources(query) {
  const keywords = extractSearchKeywords(query);
  if (keywords.length === 0) return [];

  // Use the most specific keyword for the API search
  const apiQuery = keywords.join(' ');
  const cacheKey = apiQuery.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.results;
  }

  // Try each keyword individually and collect unique resources
  const allResources = new Map();
  for (const kw of keywords) {
    const data = await authenticatedFetch(
      `/resources.json?filter[search]=${encodeURIComponent(kw)}&contain[secret]=1`
    );
    for (const r of (data.body || [])) {
      if (!allResources.has(r.id)) allResources.set(r.id, r);
    }
  }

  // Score and filter: only keep resources that actually match at least one keyword
  const scored = [];
  for (const r of allResources.values()) {
    const score = scoreResource(r, keywords);
    if (score > 0) scored.push({ resource: r, score });
  }

  // Sort by score descending, limit to top 10
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 10);

  // Decrypt only the matching resources
  const results = [];
  for (const { resource: r } of top) {
    try {
      const secretData = r.secrets && r.secrets[0]
        ? await decryptSecret(r.secrets[0].data)
        : { password: '' };

      results.push({
        name: r.name || '',
        username: r.username || '',
        uri: r.uri || '',
        description: r.description || secretData.description || '',
        password: secretData.password || ''
      });
    } catch (err) {
      console.error(`Passbolt: error decrypting resource "${r.name}":`, err.message);
      results.push({
        name: r.name || '',
        username: r.username || '',
        uri: r.uri || '',
        description: r.description || '',
        password: '[error al descifrar]'
      });
    }
  }

  searchCache.set(cacheKey, { results, timestamp: Date.now() });
  return results;
}

/**
 * Search credentials (direct wrapper for tools/external use).
 */
async function searchCredentials(query) {
  if (!isConfigured()) return [];
  try {
    return await searchResources(query);
  } catch (err) {
    console.error('Passbolt searchCredentials error:', err.message);
    return [];
  }
}

/**
 * Build credentials context for the AI system prompt.
 * Replaces vault.getCredentialsContext() — no department filtering needed
 * since Passbolt handles permissions via sharing.
 */
async function getCredentialsContext(message, department, role) {
  if (!isConfigured()) return null;

  try {
    const results = await searchResources(message);
    if (results.length === 0) return null;

    let context = '\n---\n## Vault de Credenciales (Passbolt)\n\n';
    context += `Se encontraron **${results.length} credencial(es)** relevantes:\n\n`;

    for (const cred of results) {
      context += `### ${cred.name}\n`;
      if (cred.username) context += `- **Usuario:** ${cred.username}\n`;
      context += `- **Password:** ${cred.password}\n`;
      if (cred.uri) context += `- **URL:** ${cred.uri}\n`;
      if (cred.description) context += `- **Notas:** ${cred.description}\n`;
      context += '\n';
    }

    context += `## INSTRUCCIONES PARA CREDENCIALES (OBLIGATORIO):\n`;
    context += `1. Muestra las credenciales directamente al usuario que las solicita.\n`;
    context += `2. **NUNCA inventes credenciales.** Solo usa las que aparecen en este contexto.\n`;
    context += `3. Si no hay credenciales en el contexto, indica que no se encontraron.\n`;
    context += `---\n`;

    return context;
  } catch (err) {
    console.error('Passbolt getCredentialsContext error:', err.message);
    return null;
  }
}

/**
 * Get the total number of accessible resources (for admin status).
 */
async function getResourceCount() {
  try {
    await ensureAuth();
    const data = await authenticatedFetch('/resources.json');
    return (data.body || []).length;
  } catch (err) {
    console.error('Passbolt getResourceCount error:', err.message);
    return -1;
  }
}

/**
 * Get connection status for admin panel.
 */
async function getStatus() {
  if (!isConfigured()) {
    return { configured: false, connected: false, resources: 0, error: 'Variables de entorno no configuradas' };
  }
  try {
    await ensureAuth();
    const count = await getResourceCount();
    return { configured: true, connected: true, resources: count, error: null };
  } catch (err) {
    return { configured: true, connected: false, resources: 0, error: err.message };
  }
}

module.exports = {
  isConfigured,
  mightNeedCredentials,
  init,
  searchCredentials,
  getCredentialsContext,
  getResourceCount,
  getStatus
};
