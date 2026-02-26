const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DB_DIR = process.env.DB_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(DB_DIR, 'assistant.db');

let db = null;

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
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

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      conversation_id TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating IN (-1, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(message_id)
    )
  `);

  db.run(`
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

  db.run(`
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

  db.run(`
    CREATE TABLE IF NOT EXISTS role_source_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      source_key TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      UNIQUE(role, source_key)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_source_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      source_key TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      UNIQUE(user_id, source_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // Migration: add user_id column to conversations if missing
  try {
    const cols = db.exec("PRAGMA table_info(conversations)");
    const hasUserId = cols.length > 0 && cols[0].values.some(row => row[1] === 'user_id');
    if (!hasUserId) {
      db.run('ALTER TABLE conversations ADD COLUMN user_id INTEGER');
    }
  } catch { /* column may already exist */ }

  // Migration: add active column to users if missing
  try {
    const cols = db.exec("PRAGMA table_info(users)");
    const hasActive = cols.length > 0 && cols[0].values.some(row => row[1] === 'active');
    if (!hasActive) {
      db.run('ALTER TABLE users ADD COLUMN active INTEGER DEFAULT 1');
    }
  } catch { /* column may already exist */ }

  // Migration: add setup_token columns to users if missing
  try {
    const cols3 = db.exec("PRAGMA table_info(users)");
    const hasSetupToken = cols3.length > 0 && cols3[0].values.some(row => row[1] === 'setup_token');
    if (!hasSetupToken) {
      db.run('ALTER TABLE users ADD COLUMN setup_token TEXT');
      db.run('ALTER TABLE users ADD COLUMN setup_token_expires TEXT');
    }
  } catch { /* columns may already exist */ }

  // Migration: set default roles
  db.run("UPDATE users SET role = 'admin' WHERE email = 'stefano.yepez@smartgroup.es' AND (role IS NULL OR role = '')");
  db.run("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''");

  // Seed role_source_defaults if empty
  const rsdCount = db.exec('SELECT COUNT(*) FROM role_source_defaults');
  if (rsdCount.length === 0 || rsdCount[0].values[0][0] === 0) {
    const sources = ['bookstack', 'rag', 'fibras', 'crm', 'teki'];
    const roles = ['admin', 'user'];
    for (const role of roles) {
      for (const src of sources) {
        db.run('INSERT OR IGNORE INTO role_source_defaults (role, source_key, enabled) VALUES (?, ?, 1)', [role, src]);
      }
    }
  }

  // Seed default admin if no users exist
  const userCount = db.exec('SELECT COUNT(*) FROM users');
  if (userCount.length === 0 || userCount[0].values[0][0] === 0) {
    const adminEmail = (process.env.ADMIN_EMAIL || 'stefano.yepez@smartgroup.es').toLowerCase();
    const adminPass = process.env.ADMIN_PASSWORD || 'Smart.2018';
    const adminName = process.env.ADMIN_NAME || 'Stefano Yepez';
    const hash = bcrypt.hashSync(adminPass, 10);
    db.run(
      'INSERT INTO users (email, name, password_hash, department, sede, role, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [adminEmail, adminName, hash, 'IT', 'Madrid', 'admin']
    );
    console.log(`Default admin created: ${adminEmail}`);
  }

  save();
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// --- Conversations ---

function createConversation(id, title, userName, department, sede, userId) {
  const stmt = getDb().prepare(
    'INSERT INTO conversations (id, title, user_name, department, sede, user_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run([id, title, userName || null, department || null, sede || null, userId || null]);
  stmt.free();
  save();
  return { id, title, user_name: userName, department, sede, user_id: userId };
}

function getConversations() {
  const results = [];
  const stmt = getDb().prepare(
    'SELECT id, title, user_name, department, sede, user_id, created_at, updated_at FROM conversations ORDER BY updated_at DESC'
  );
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getConversationsByUser(userId) {
  const results = [];
  const stmt = getDb().prepare(
    'SELECT id, title, user_name, department, sede, user_id, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC'
  );
  stmt.bind([userId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getConversation(id) {
  const stmt = getDb().prepare('SELECT * FROM conversations WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

function updateConversationTitle(id, title) {
  getDb().run("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?", [title, id]);
  save();
}

function deleteConversation(id) {
  getDb().run('DELETE FROM messages WHERE conversation_id = ?', [id]);
  getDb().run('DELETE FROM conversations WHERE id = ?', [id]);
  save();
}

// --- Messages ---

function addMessage(conversationId, role, content) {
  const stmt = getDb().prepare(
    'INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)'
  );
  stmt.run([conversationId, role, content]);
  stmt.free();
  // Get inserted ID
  const idResult = getDb().exec('SELECT last_insert_rowid() as id');
  const insertedId = idResult[0]?.values[0]?.[0] || null;
  getDb().run("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?", [conversationId]);
  save();
  return insertedId;
}

function getMessages(conversationId) {
  const results = [];
  const stmt = getDb().prepare(
    'SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  );
  stmt.bind([conversationId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// --- Feedback ---

function upsertFeedback(messageId, conversationId, rating) {
  // Try update first, then insert
  getDb().run(
    'INSERT INTO feedback (message_id, conversation_id, rating) VALUES (?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET rating = ?',
    [messageId, conversationId, rating, rating]
  );
  save();
}

function getFeedbackByConversation(conversationId) {
  const results = [];
  const stmt = getDb().prepare(
    'SELECT message_id, rating FROM feedback WHERE conversation_id = ?'
  );
  stmt.bind([conversationId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getFeedbackStats() {
  const result = getDb().exec(`
    SELECT
      COUNT(CASE WHEN rating = 1 THEN 1 END) as positive,
      COUNT(CASE WHEN rating = -1 THEN 1 END) as negative,
      COUNT(*) as total
    FROM feedback
  `);
  if (result.length === 0) return { positive: 0, negative: 0, total: 0 };
  const row = result[0].values[0];
  return { positive: row[0], negative: row[1], total: row[2] };
}

// --- Search (for smart history) ---

function searchMessages(query, excludeConversationId = null, limit = 10) {
  const results = [];
  const words = query.trim().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return results;

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

  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// --- Attachments ---

function addAttachment(messageId, conversationId, originalName, storedName, mimeType, size) {
  const stmt = getDb().prepare(
    'INSERT INTO attachments (message_id, conversation_id, original_name, stored_name, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run([messageId, conversationId, originalName, storedName, mimeType, size]);
  stmt.free();
  save();
}

function getAttachmentsByMessage(messageId) {
  const results = [];
  const stmt = getDb().prepare('SELECT * FROM attachments WHERE message_id = ?');
  stmt.bind([messageId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// --- Users ---

function createUser(email, name, passwordHash, department, sede, role) {
  const stmt = getDb().prepare(
    'INSERT INTO users (email, name, password_hash, department, sede, role) VALUES (?, ?, ?, ?, ?, ?)'
  );
  stmt.run([email, name, passwordHash, department || null, sede || null, role || null]);
  stmt.free();
  const idResult = getDb().exec('SELECT last_insert_rowid() as id');
  const id = idResult[0]?.values[0]?.[0] || null;
  save();
  return { id, email, name, department, sede, role };
}

function getUserByEmail(email) {
  const stmt = getDb().prepare('SELECT * FROM users WHERE email = ?');
  stmt.bind([email]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

function getUserById(id) {
  const stmt = getDb().prepare('SELECT id, email, name, department, sede, role, active, created_at FROM users WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

// --- Admin: User Management ---

function getAllUsers() {
  const results = [];
  const stmt = getDb().prepare('SELECT id, email, name, department, sede, role, active, created_at FROM users ORDER BY id ASC');
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
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
  getDb().run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  save();
  return true;
}

function updateUserPassword(id, hash) {
  getDb().run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id]);
  save();
}

function createUserWithToken(email, name, department, sede, role) {
  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const stmt = getDb().prepare(
    'INSERT INTO users (email, name, password_hash, department, sede, role, setup_token, setup_token_expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run([email, name, '', department || null, sede || null, role || 'user', token, expires]);
  stmt.free();
  const idResult = getDb().exec('SELECT last_insert_rowid() as id');
  const id = idResult[0]?.values[0]?.[0] || null;
  save();
  return { user: { id, email, name, department, sede, role: role || 'user' }, token };
}

function getUserBySetupToken(token) {
  const stmt = getDb().prepare('SELECT id, email, name, department, sede, role, setup_token_expires FROM users WHERE setup_token = ?');
  stmt.bind([token]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  if (!row) return null;
  if (new Date(row.setup_token_expires) < new Date()) return null;
  return row;
}

function consumeSetupToken(userId, passwordHash) {
  getDb().run('UPDATE users SET password_hash = ?, setup_token = NULL, setup_token_expires = NULL WHERE id = ?', [passwordHash, userId]);
  save();
}

function deleteUser(id) {
  const d = getDb();
  // Delete related data
  d.run('DELETE FROM user_preferences WHERE user_id = ?', [id]);
  d.run('DELETE FROM user_source_overrides WHERE user_id = ?', [id]);
  // Delete messages from user's conversations, then the conversations
  d.run('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ?)', [id]);
  d.run('DELETE FROM conversations WHERE user_id = ?', [id]);
  // Delete user record
  d.run('DELETE FROM users WHERE id = ?', [id]);
  save();
}

// --- Admin: User Preferences ---

function getUserPreferences(userId) {
  const stmt = getDb().prepare('SELECT * FROM user_preferences WHERE user_id = ?');
  stmt.bind([userId]);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
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
  getDb().run(
    'INSERT OR REPLACE INTO user_preferences (user_id, avatar_path, bio, preferred_ai_provider, preferred_language, preferred_theme) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, merged.avatar_path, merged.bio, merged.preferred_ai_provider, merged.preferred_language, merged.preferred_theme]
  );
  save();
  return { user_id: userId, ...merged };
}

// --- Admin: Source Access ---

function getRoleSourceDefaults(role) {
  const results = [];
  const stmt = getDb().prepare('SELECT source_key, enabled FROM role_source_defaults WHERE role = ?');
  stmt.bind([role]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function setRoleSourceDefault(role, key, enabled) {
  getDb().run(
    'INSERT OR REPLACE INTO role_source_defaults (role, source_key, enabled) VALUES (?, ?, ?)',
    [role, key, enabled ? 1 : 0]
  );
  save();
}

function getUserSourceOverrides(userId) {
  const results = [];
  const stmt = getDb().prepare('SELECT source_key, enabled FROM user_source_overrides WHERE user_id = ?');
  stmt.bind([userId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function setUserSourceOverride(userId, key, enabled) {
  getDb().run(
    'INSERT OR REPLACE INTO user_source_overrides (user_id, source_key, enabled) VALUES (?, ?, ?)',
    [userId, key, enabled ? 1 : 0]
  );
  save();
}

function deleteUserSourceOverride(userId, key) {
  getDb().run('DELETE FROM user_source_overrides WHERE user_id = ? AND source_key = ?', [userId, key]);
  save();
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
  // Ensure all 4 sources have a value
  for (const key of ['bookstack', 'rag', 'fibras', 'crm', 'teki']) {
    if (result[key] === undefined) {
      result[key] = overrideMap[key] !== undefined ? !!overrideMap[key] : true;
    }
  }
  return result;
}

module.exports = {
  initDb,
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
  deleteUser
};
