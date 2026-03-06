const crypto = require('crypto');
const db = require('../db');

const VAULT_KEY = process.env.VAULT_KEY || '';
const ALGORITHM = 'aes-256-gcm';

function isConfigured() {
  return VAULT_KEY.length >= 32;
}

function getKey() {
  // Use first 32 bytes of the key (or pad if needed)
  return Buffer.from(VAULT_KEY.padEnd(32, '0').slice(0, 32), 'utf-8');
}

function encrypt(text) {
  if (!isConfigured()) throw new Error('Vault not configured');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return iv.toString('hex') + ':' + tag + ':' + encrypted;
}

function decrypt(ciphertext) {
  if (!isConfigured()) throw new Error('Vault not configured');
  const [ivHex, tagHex, encrypted] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Patterns that indicate the user wants credentials
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

function mightNeedCredentials(message) {
  return CREDENTIAL_PATTERNS.some(p => p.test(message));
}

/**
 * Search credentials by query text (matches name, tags, notes).
 */
function searchCredentials(query) {
  return db.searchVaultCredentials(query);
}

/**
 * Build vault context for the AI system prompt.
 * Filters by department: credential.departments="" means visible to all,
 * otherwise only if user's department is in the list. Admins see everything.
 */
function getCredentialsContext(message, department, role) {
  const results = searchCredentials(message);
  if (results.length === 0) return null;

  // Filter by department access
  const filtered = results.filter(cred => {
    if (role === 'admin') return true;
    if (!cred.departments || cred.departments.trim() === '') return true;
    if (!department) return false;
    const depts = cred.departments.split(',').map(d => d.trim().toLowerCase());
    return depts.includes(department.toLowerCase());
  });

  if (filtered.length === 0) return null;

  let context = '\n---\n## Vault de Credenciales\n\n';
  context += `Se encontraron **${filtered.length} credencial(es)** relevantes:\n\n`;

  for (const cred of filtered) {
    let decryptedPass = '[error al descifrar]';
    try {
      decryptedPass = decrypt(cred.password_encrypted);
    } catch (e) {
      console.error('Vault decrypt error:', e.message);
    }

    context += `### ${cred.name}\n`;
    if (cred.username) context += `- **Usuario:** ${cred.username}\n`;
    context += `- **Password:** ${decryptedPass}\n`;
    if (cred.url) context += `- **URL:** ${cred.url}\n`;
    if (cred.notes) context += `- **Notas:** ${cred.notes}\n`;
    if (cred.tags) context += `- **Tags:** ${cred.tags}\n`;
    if (cred.departments && cred.departments.trim()) {
      context += `- **Acceso:** Departamentos ${cred.departments}\n`;
    } else {
      context += `- **Acceso:** Todos los departamentos\n`;
    }
    context += '\n';
  }

  context += `## INSTRUCCIONES PARA CREDENCIALES (OBLIGATORIO):\n`;
  context += `1. Muestra las credenciales directamente al usuario que las solicita.\n`;
  context += `2. **NUNCA inventes credenciales.** Solo usa las que aparecen en este contexto.\n`;
  context += `3. Si no hay credenciales en el contexto, indica que no se encontraron.\n`;
  context += `4. Indica a qué departamentos tiene acceso cada credencial.\n`;
  context += `---\n`;

  return context;
}

module.exports = {
  isConfigured,
  encrypt,
  decrypt,
  mightNeedCredentials,
  searchCredentials,
  getCredentialsContext
};
