const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'assistant.db');

let db = null;

function initDb() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      department TEXT,
      sede TEXT,
      role TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'Nueva conversación',
      user_name TEXT,
      department TEXT,
      sede TEXT,
      user_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      conversation_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER,
      conversation_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- New admin tables ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      avatar_path TEXT,
      bio TEXT,
      preferred_ai_provider TEXT DEFAULT 'claude',
      preferred_language TEXT DEFAULT 'es',
      preferred_theme TEXT DEFAULT 'dark',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS role_source_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      source_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(role, source_key)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_source_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_key TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      UNIQUE(user_id, source_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      problem TEXT NOT NULL,
      solution TEXT NOT NULL,
      keywords TEXT NOT NULL,
      source_tickets TEXT DEFAULT '',
      times_used INTEGER DEFAULT 0,
      created_by TEXT DEFAULT 'ARIA',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      user_id INTEGER,
      conversation_id TEXT,
      call_type TEXT DEFAULT 'chat',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vault_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT DEFAULT '',
      password_encrypted TEXT NOT NULL,
      url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      departments TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add user_id column to conversations if missing
  const convCols = db.pragma('table_info(conversations)');
  if (!convCols.some(row => row.name === 'user_id')) {
    db.exec('ALTER TABLE conversations ADD COLUMN user_id INTEGER');
  }

  // Migration: add active column to users if missing
  const userCols = db.pragma('table_info(users)');
  if (!userCols.some(row => row.name === 'active')) {
    db.exec('ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1');
  }

  // Migration: add setup_token columns to users if missing
  const userCols2 = db.pragma('table_info(users)');
  if (!userCols2.some(row => row.name === 'setup_token')) {
    db.exec('ALTER TABLE users ADD COLUMN setup_token TEXT');
    db.exec('ALTER TABLE users ADD COLUMN setup_token_expires TEXT');
  }

  // Migration: add sources_used column to messages if missing
  const msgCols = db.pragma('table_info(messages)');
  if (!msgCols.some(row => row.name === 'sources_used')) {
    db.exec('ALTER TABLE messages ADD COLUMN sources_used TEXT DEFAULT NULL');
  }

  // Migration: set default roles
  db.prepare("UPDATE users SET role = 'admin' WHERE email = 'stefano.yepez@smartgroup.es' AND (role IS NULL OR role = '')").run();
  db.prepare("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''").run();

  // Seed role_source_defaults if empty
  const rsdCount = db.prepare('SELECT COUNT(*) as cnt FROM role_source_defaults').get();
  if (rsdCount.cnt === 0) {
    const sources = ['bookstack', 'rag', 'fibras', 'crm', 'teki', 'vault'];
    const roles = ['admin', 'user'];
    const insertRsd = db.prepare('INSERT OR IGNORE INTO role_source_defaults (role, source_key, enabled) VALUES (?, ?, 1)');
    for (const role of roles) {
      for (const src of sources) {
        insertRsd.run(role, src);
      }
    }
  }

  // Migration: ensure vault source exists in role_source_defaults (for existing DBs)
  const vaultRsd = db.prepare("SELECT COUNT(*) as cnt FROM role_source_defaults WHERE source_key = 'vault'").get();
  if (vaultRsd.cnt === 0) {
    const insertRsd = db.prepare('INSERT OR IGNORE INTO role_source_defaults (role, source_key, enabled) VALUES (?, ?, 1)');
    insertRsd.run('admin', 'vault');
    insertRsd.run('user', 'vault');
  }

  // Seed default admin if no users exist
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (userCount.cnt === 0) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'stefano.yepez@smartgroup.es').toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || 'Smart.2018';
    const adminName = process.env.ADMIN_NAME || 'Stefano Yepez';
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare(
      'INSERT INTO users (email, name, password_hash, department, sede, role, active) VALUES (?, ?, ?, ?, ?, ?, 1)'
    ).run(adminEmail, adminName, hash, 'IT', 'Madrid', 'admin');
    console.log(`Default admin created: ${adminEmail}`);
  }

  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// --- Conversations ---

function createConversation(id, title, userName, department, sede, userId) {
  getDb().prepare(
    'INSERT INTO conversations (id, title, user_name, department, sede, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, title, userName || null, department || null, sede || null, userId || null);
  return { id, title, user_name: userName, department, sede, user_id: userId };
}

function getConversations() {
  return getDb().prepare(
    'SELECT id, title, user_name, department, sede, user_id, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
  ).all();
}

function getConversationsByUser(userId) {
  return getDb().prepare(
    'SELECT id, title, user_name, department, sede, user_id, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId);
}

function getConversation(id) {
  return getDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id) || null;
}

function updateConversationTitle(id, title) {
  getDb().prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
}

function deleteConversation(id) {
  const d = getDb();
  d.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  d.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

// --- Messages ---

function addMessage(conversationId, role, content, sourcesUsed = null) {
  const result = getDb().prepare(
    'INSERT INTO messages (conversation_id, role, content, sources_used) VALUES (?, ?, ?, ?)'
  ).run(conversationId, role, content, sourcesUsed ? JSON.stringify(sourcesUsed) : null);
  const insertedId = result.lastInsertRowid;
  getDb().prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?").run(conversationId);
  return Number(insertedId);
}

function getMessages(conversationId) {
  return getDb().prepare(
    'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  ).all(conversationId);
}

// --- Feedback ---

function upsertFeedback(messageId, conversationId, rating) {
  getDb().prepare(
    'INSERT INTO feedback (message_id, conversation_id, rating) VALUES (?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET rating = ?'
  ).run(messageId, conversationId, rating, rating);
}

function getFeedbackByConversation(conversationId) {
  return getDb().prepare(
    'SELECT message_id, rating FROM feedback WHERE conversation_id = ?'
  ).all(conversationId);
}

function getFeedbackStats() {
  const row = getDb().prepare(`
    SELECT
      COUNT(CASE WHEN rating = 1 THEN 1 END) as positive,
      COUNT(CASE WHEN rating = -1 THEN 1 END) as negative,
      COUNT(*) as total
    FROM feedback
  `).get();
  return row || { positive: 0, negative: 0, total: 0 };
}

// --- Search (for smart history) ---

function searchMessages(query, excludeConversationId = null, limit = 10) {
  const words = query.trim().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return [];

  const likeClause = words.map(() => 'content LIKE ?').join(' OR ');
  const params = words.map(w => `%${w}%`);

  let sql = `SELECT m.conversation_id, m.role, m.content, c.title
    FROM messages m JOIN conversations c ON m.conversation_id = c.id
    WHERE (${likeClause})`;

  if (excludeConversationId) {
    sql += ' AND m.conversation_id != ?';
    params.push(excludeConversationId);
  }

  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);

  return getDb().prepare(sql).all(...params);
}

// --- Attachments ---

function addAttachment(messageId, conversationId, originalName, storedName, mimeType, size) {
  getDb().prepare(
    'INSERT INTO attachments (message_id, conversation_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(messageId, conversationId, originalName, storedName, mimeType, size);
}

function getAttachmentsByMessage(messageId) {
  return getDb().prepare('SELECT * FROM attachments WHERE message_id = ?').all(messageId);
}

// --- Users ---

function createUser(email, name, passwordHash, department, sede, role) {
  const result = getDb().prepare(
    'INSERT INTO users (email, name, password_hash, department, sede, role) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(email, name, passwordHash, department || null, sede || null, role || null);
  const id = Number(result.lastInsertRowid);
  return { id, email, name, department, sede, role };
}

function getUserByEmail(email) {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) || null;
}

function getUserById(id) {
  return getDb().prepare('SELECT id, email, name, department, sede, role, active, created_at FROM users WHERE id = ?').get(id) || null;
}

// --- Admin: User Management ---

function getAllUsers() {
  return getDb().prepare('SELECT id, email, name, department, sede, role, active, created_at FROM users ORDER BY id ASC').all();
}

function updateUser(id, fields) {
  const allowed = ['name', 'email', 'department', 'sede', 'role', 'active'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return false;
  params.push(id);
  getDb().prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

function updateUserPassword(id, hash) {
  getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
}

function createUserWithToken(email, name, department, sede, role) {
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const result = getDb().prepare(
    'INSERT INTO users (email, name, password_hash, department, sede, role, setup_token, setup_token_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(email, name, '', department || null, sede || null, role || 'user', token, expires);
  const id = Number(result.lastInsertRowid);
  return { user: { id, email, name, department, sede, role: role || 'user' }, token };
}

function getUserBySetupToken(token) {
  const row = getDb().prepare('SELECT id, email, name, department, sede, role, setup_token_expires FROM users WHERE setup_token = ?').get(token);
  if (!row) return null;
  if (new Date(row.setup_token_expires) < new Date()) return null;
  return row;
}

function consumeSetupToken(userId, passwordHash) {
  getDb().prepare('UPDATE users SET password_hash = ?, setup_token = NULL, setup_token_expires = NULL WHERE id = ?').run(passwordHash, userId);
}

function deleteUser(id) {
  const d = getDb();
  d.prepare('DELETE FROM user_preferences WHERE user_id = ?').run(id);
  d.prepare('DELETE FROM user_source_overrides WHERE user_id = ?').run(id);
  d.prepare('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)').run(id);
  d.prepare('DELETE FROM conversations WHERE user_id = ?').run(id);
  d.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// --- Admin: User Preferences ---

function getUserPreferences(userId) {
  const row = getDb().prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(userId);
  return row || { user_id: userId, avatar_path: null, bio: null, preferred_ai_provider: 'claude', preferred_language: 'es', preferred_theme: 'dark' };
}

function upsertUserPreferences(userId, fields) {
  const current = getUserPreferences(userId);
  const merged = {
    avatar_path: fields.avatar_path !== undefined ? fields.avatar_path : current.avatar_path,
    bio: fields.bio !== undefined ? fields.bio : current.bio,
    preferred_ai_provider: fields.preferred_ai_provider !== undefined ? fields.preferred_ai_provider : current.preferred_ai_provider,
    preferred_language: fields.preferred_language !== undefined ? fields.preferred_language : current.preferred_language,
    preferred_theme: fields.preferred_theme !== undefined ? fields.preferred_theme : current.preferred_theme
  };
  getDb().prepare(
    'INSERT OR REPLACE INTO user_preferences (user_id, avatar_path, bio, preferred_ai_provider, preferred_language, preferred_theme) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, merged.avatar_path, merged.bio, merged.preferred_ai_provider, merged.preferred_language, merged.preferred_theme);
  return { user_id: userId, ...merged };
}

// --- Admin: Source Access ---

function getRoleSourceDefaults(role) {
  return getDb().prepare('SELECT source_key, enabled FROM role_source_defaults WHERE role = ?').all(role);
}

function setRoleSourceDefault(role, key, enabled) {
  getDb().prepare(
    'INSERT OR REPLACE INTO role_source_defaults (role, source_key, enabled) VALUES (?, ?, ?)'
  ).run(role, key, enabled ? 1 : 0);
}

function getUserSourceOverrides(userId) {
  return getDb().prepare('SELECT source_key, enabled FROM user_source_overrides WHERE user_id = ?').all(userId);
}

function setUserSourceOverride(userId, key, enabled) {
  getDb().prepare(
    'INSERT OR REPLACE INTO user_source_overrides (user_id, source_key, enabled) VALUES (?, ?, ?)'
  ).run(userId, key, enabled ? 1 : 0);
}

function deleteUserSourceOverride(userId, key) {
  getDb().prepare('DELETE FROM user_source_overrides WHERE user_id = ? AND source_key = ?').run(userId, key);
}

function getEffectiveSourceAccess(userId, role) {
  const defaults = getRoleSourceDefaults(role);
  const overrides = getUserSourceOverrides(userId);
  const overrideMap = {};
  for (const o of overrides) {
    overrideMap[o.source_key] = o.enabled;
  }
  const result = {};
  for (const d of defaults) {
    result[d.source_key] = overrideMap[d.source_key] !== undefined ? !!overrideMap[d.source_key] : !!d.enabled;
  }
  for (const key of ['bookstack', 'rag', 'fibras', 'crm', 'teki', 'vault']) {
    if (result[key] === undefined) {
      result[key] = overrideMap[key] !== undefined ? !!overrideMap[key] : true;
    }
  }
  return result;
}

// --- Admin: User Metrics ---

function getUserMetrics() {
  return getDb().prepare(`
    SELECT
      u.id as user_id,
      u.name,
      u.email,
      u.role,
      u.department,
      COUNT(DISTINCT CASE WHEN m.role = 'user' THEN m.id END) as total_messages,
      COUNT(DISTINCT c.id) as total_conversations,
      MAX(m.created_at) as last_activity,
      GROUP_CONCAT(CASE WHEN m.role = 'assistant' AND m.sources_used IS NOT NULL THEN m.sources_used END, '|||') as all_sources
    FROM users u
    LEFT JOIN conversations c ON c.user_id = u.id
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE u.active = 1
    GROUP BY u.id
    ORDER BY last_activity DESC
  `).all();
}

// --- Admin: Counts ---

function getConversationCount() {
  return getDb().prepare('SELECT COUNT(*) as cnt FROM conversations').get().cnt;
}

function getMessageCount() {
  return getDb().prepare('SELECT COUNT(*) as cnt FROM messages').get().cnt;
}

// --- Knowledge Base ---

function addKnowledgeArticle(title, problem, solution, keywords, sourceTickets, createdBy) {
  const result = getDb().prepare(
    'INSERT INTO knowledge_base (title, problem, solution, keywords, source_tickets, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(title, problem, solution, keywords, sourceTickets || '', createdBy || 'ARIA');
  return Number(result.lastInsertRowid);
}

function searchKnowledgeBase(query, limit = 5) {
  const stopwords = ['el','la','los','las','de','del','en','un','una','que','se','no','por','con','para','al','es','lo','como','su','me','ya','le','ha','mi','si','te','nos','hay','tiene','ser','muy','más','mas','este','esta','son','fue','han','sin','pero','todo','todos','hola','quiero','puedes','favor','necesito'];
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2 && !stopwords.includes(t));
  if (terms.length === 0) return [];

  const allArticles = getDb().prepare('SELECT id, title, problem, solution, keywords, source_tickets, times_used, created_by, created_at FROM knowledge_base').all();
  const results = [];

  for (const row of allArticles) {
    const text = (row.title + ' ' + row.problem + ' ' + row.solution + ' ' + row.keywords).toLowerCase();
    const matches = terms.filter(t => text.includes(t)).length;
    if (matches > 0) {
      results.push({ ...row, score: matches });
    }
  }

  results.sort((a, b) => b.score - a.score || b.times_used - a.times_used);
  return results.slice(0, limit);
}

function incrementKnowledgeUsage(id) {
  getDb().prepare("UPDATE knowledge_base SET times_used = times_used + 1, updated_at = datetime('now') WHERE id = ?").run(id);
}

function getKnowledgeStats() {
  const row = getDb().prepare('SELECT COUNT(*) as total, COALESCE(SUM(times_used), 0) as total_uses FROM knowledge_base').get();
  return { total: row.total || 0, totalUses: row.total_uses || 0 };
}

// --- Knowledge Base Admin ---

function getAllKnowledgeArticles() {
  return getDb().prepare(
    'SELECT id, title, keywords, source_tickets, times_used, created_by, created_at, updated_at FROM knowledge_base ORDER BY updated_at DESC'
  ).all();
}

function getKnowledgeArticle(id) {
  return getDb().prepare('SELECT * FROM knowledge_base WHERE id = ?').get(id) || null;
}

function updateKnowledgeArticle(id, fields) {
  const allowed = ['title', 'problem', 'solution', 'keywords', 'source_tickets'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return false;
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE knowledge_base SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

function deleteKnowledgeArticle(id) {
  getDb().prepare('DELETE FROM knowledge_base WHERE id = ?').run(id);
}

// --- Vault Credentials ---

function addVaultCredential(name, username, passwordEncrypted, url, notes, tags, departments, createdBy) {
  const result = getDb().prepare(
    'INSERT INTO vault_credentials (name, username, password_encrypted, url, notes, tags, departments, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(name, username || '', passwordEncrypted, url || '', notes || '', tags || '', departments || '', createdBy || '');
  return Number(result.lastInsertRowid);
}

function getAllVaultCredentials() {
  return getDb().prepare(
    'SELECT id, name, username, url, notes, tags, departments, created_by, created_at, updated_at FROM vault_credentials ORDER BY name ASC'
  ).all();
}

function getVaultCredential(id) {
  return getDb().prepare('SELECT * FROM vault_credentials WHERE id = ?').get(id) || null;
}

function updateVaultCredential(id, fields) {
  const allowed = ['name', 'username', 'password_encrypted', 'url', 'notes', 'tags', 'departments'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return false;
  sets.push("updated_at = datetime('now')");
  params.push(id);
  getDb().prepare(`UPDATE vault_credentials SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return true;
}

function deleteVaultCredential(id) {
  getDb().prepare('DELETE FROM vault_credentials WHERE id = ?').run(id);
}

function searchVaultCredentials(query, limit = 10) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  if (terms.length === 0) return [];

  const all = getDb().prepare('SELECT * FROM vault_credentials').all();
  const results = [];

  for (const row of all) {
    const text = (row.name + ' ' + row.username + ' ' + row.tags + ' ' + row.notes + ' ' + row.url).toLowerCase();
    const matches = terms.filter(t => text.includes(t)).length;
    if (matches > 0) {
      results.push({ ...row, score: matches });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

// --- API Usage Tracking ---

const COST_PER_MILLION = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 }
};

function addApiUsage(provider, model, inputTokens, outputTokens, userId, conversationId, callType) {
  getDb().prepare(
    'INSERT INTO api_usage (provider, model, input_tokens, output_tokens, user_id, conversation_id, call_type) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(provider, model, inputTokens || 0, outputTokens || 0, userId || null, conversationId || null, callType || 'chat');
}

function getApiUsageStats() {
  const d = getDb();

  const totals = d.prepare(`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(SUM(input_tokens), 0) as total_input,
      COALESCE(SUM(output_tokens), 0) as total_output,
      COALESCE(SUM(input_tokens + output_tokens), 0) as total_tokens
    FROM api_usage
  `).get();

  const byDay = d.prepare(`
    SELECT
      DATE(created_at) as day,
      COUNT(*) as calls,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      model
    FROM api_usage
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY DATE(created_at), model
    ORDER BY day DESC
  `).all();

  const byProvider = d.prepare(`
    SELECT
      provider,
      model,
      COUNT(*) as calls,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens
    FROM api_usage
    GROUP BY provider, model
    ORDER BY calls DESC
  `).all();

  // Calculate estimated costs
  let totalCost = 0;
  for (const row of byProvider) {
    const rates = COST_PER_MILLION[row.model] || { input: 1.0, output: 3.0 };
    row.cost = ((row.input_tokens / 1e6) * rates.input) + ((row.output_tokens / 1e6) * rates.output);
    totalCost += row.cost;
  }

  // Aggregate daily data (merge models per day) and add cost
  const dailyMap = {};
  for (const row of byDay) {
    if (!dailyMap[row.day]) {
      dailyMap[row.day] = { day: row.day, calls: 0, input_tokens: 0, output_tokens: 0, cost: 0 };
    }
    dailyMap[row.day].calls += row.calls;
    dailyMap[row.day].input_tokens += row.input_tokens;
    dailyMap[row.day].output_tokens += row.output_tokens;
    const rates = COST_PER_MILLION[row.model] || { input: 1.0, output: 3.0 };
    dailyMap[row.day].cost += ((row.input_tokens / 1e6) * rates.input) + ((row.output_tokens / 1e6) * rates.output);
  }
  const daily = Object.values(dailyMap).sort((a, b) => b.day.localeCompare(a.day));

  return {
    total_calls: totals.total_calls,
    total_input: totals.total_input,
    total_output: totals.total_output,
    total_tokens: totals.total_tokens,
    total_cost: totalCost,
    daily,
    by_provider: byProvider
  };
}

module.exports = {
  initDb,
  getDb,
  createConversation,
  getConversations,
  getConversationsByUser,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  addMessage,
  getMessages,
  upsertFeedback,
  getFeedbackByConversation,
  getFeedbackStats,
  searchMessages,
  addAttachment,
  getAttachmentsByMessage,
  createUser,
  getUserByEmail,
  getUserById,
  getAllUsers,
  updateUser,
  updateUserPassword,
  createUserWithToken,
  getUserBySetupToken,
  consumeSetupToken,
  getUserPreferences,
  upsertUserPreferences,
  getRoleSourceDefaults,
  setRoleSourceDefault,
  getUserSourceOverrides,
  setUserSourceOverride,
  deleteUserSourceOverride,
  getEffectiveSourceAccess,
  deleteUser,
  getUserMetrics,
  getConversationCount,
  getMessageCount,
  addKnowledgeArticle,
  searchKnowledgeBase,
  incrementKnowledgeUsage,
  getKnowledgeStats,
  getAllKnowledgeArticles,
  getKnowledgeArticle,
  updateKnowledgeArticle,
  deleteKnowledgeArticle,
  addVaultCredential,
  getAllVaultCredentials,
  getVaultCredential,
  updateVaultCredential,
  deleteVaultCredential,
  searchVaultCredentials,
  addApiUsage,
  getApiUsageStats,
  COST_PER_MILLION
};
