const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const emailService = require('../services/email');
const vault = require('../services/vault');

const router = express.Router();

// GET /api/admin/stats — dashboard stats
router.get('/stats', (req, res) => {
  try {
    const users = db.getAllUsers();
    const feedbackStats = db.getFeedbackStats();

    res.json({
      users: users.length,
      activeUsers: users.filter(u => u.active).length,
      conversations: db.getConversationCount(),
      messages: db.getMessageCount(),
      feedback: feedbackStats
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// GET /api/admin/users — list all users (filtered)
router.get('/users', (req, res) => {
  const users = db.getAllUsers().map(({ password_hash, setup_token, setup_token_expires, ...safe }) => safe);
  res.json(users);
});

// POST /api/admin/users — create user
router.post('/users', async (req, res) => {
  try {
    const { email, name, password, department, sede, role } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'Email y nombre son requeridos' });
    }
    const existing = db.getUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Ya existe una cuenta con este correo' });
    }

    let user;
    let emailSent = false;
    let setupRequired = false;

    if (password) {
      // Legacy flow: admin sets password directly
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      user = db.createUser(email.toLowerCase(), name.trim(), passwordHash, department, sede, role || 'user');
    } else {
      // New flow: create with setup token, user sets own password via email
      const result = db.createUserWithToken(email.toLowerCase(), name.trim(), department, sede, role || 'user');
      user = result.user;
      setupRequired = true;

      if (emailService.isConfigured()) {
        const appUrl = process.env.APP_URL || 'http://localhost:3080';
        const setupUrl = `${appUrl}/setup?token=${result.token}`;
        emailService.sendWelcomeEmail({
          to: email.toLowerCase(),
          name: name.trim(),
          setupUrl
        }).then(sent => {
          if (sent) console.log(`Setup email delivered to ${email}`);
        });
        emailSent = true;
      }
    }

    res.status(201).json({ ...user, emailSent, setupRequired });
  } catch (err) {
    console.error('Admin create user error:', err);
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

// GET /api/admin/users/:id — user detail (filtered)
router.get('/users/:id', (req, res) => {
  const raw = db.getUserById(parseInt(req.params.id));
  if (!raw) return res.status(404).json({ error: 'Usuario no encontrado' });
  const { password_hash, setup_token, setup_token_expires, ...user } = raw;
  const preferences = db.getUserPreferences(user.id);
  const sourceAccess = db.getEffectiveSourceAccess(user.id, user.role);
  const overrides = db.getUserSourceOverrides(user.id);
  res.json({ user, preferences, sourceAccess, overrides });
});

// PUT /api/admin/users/:id — update user
router.put('/users/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { name, email, department, sede, role, active } = req.body;

    // Safety: can't demote yourself
    if (id === req.user.id && role && role !== 'admin') {
      return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
    }

    // Safety: can't deactivate yourself
    if (id === req.user.id && active === 0) {
      return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });
    }

    // Safety: can't deactivate the last admin
    if (active === 0 && user.role === 'admin') {
      const admins = db.getAllUsers().filter(u => u.role === 'admin' && u.active);
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'No se puede desactivar al último administrador' });
      }
    }

    // Safety: can't demote the last admin
    if (role && role !== 'admin' && user.role === 'admin') {
      const admins = db.getAllUsers().filter(u => u.role === 'admin' && u.active);
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'No se puede quitar el rol admin al último administrador' });
      }
    }

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (email !== undefined) fields.email = email.toLowerCase();
    if (department !== undefined) fields.department = department;
    if (sede !== undefined) fields.sede = sede;
    if (role !== undefined) fields.role = role;
    if (active !== undefined) fields.active = active;

    db.updateUser(id, fields);
    const updated = db.getUserById(id);
    res.json(updated);
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
});

// PUT /api/admin/users/:id/password — reset password
router.put('/users/:id/password', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const hash = await bcrypt.hash(password, 10);
    db.updateUserPassword(id, hash);
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'Error reseteando contraseña' });
  }
});

// GET /api/admin/sources/defaults — get all role defaults
router.get('/sources/defaults', (req, res) => {
  const adminDefaults = db.getRoleSourceDefaults('admin');
  const userDefaults = db.getRoleSourceDefaults('user');
  res.json({ admin: adminDefaults, user: userDefaults });
});

// PUT /api/admin/sources/defaults/:role — set role defaults
router.put('/sources/defaults/:role', (req, res) => {
  try {
    const { role } = req.params;
    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    const { sources } = req.body; // { bookstack: true, rag: false, ... }
    if (!sources) return res.status(400).json({ error: 'Sources requeridos' });

    for (const [key, enabled] of Object.entries(sources)) {
      db.setRoleSourceDefault(role, key, enabled);
    }
    res.json(db.getRoleSourceDefaults(role));
  } catch (err) {
    console.error('Admin set role defaults error:', err);
    res.status(500).json({ error: 'Error actualizando defaults' });
  }
});

// GET /api/admin/sources/user/:userId — get user overrides + effective
router.get('/sources/user/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const overrides = db.getUserSourceOverrides(userId);
  const effective = db.getEffectiveSourceAccess(userId, user.role);
  res.json({ overrides, effective });
});

// PUT /api/admin/sources/user/:userId — set user overrides
router.put('/sources/user/:userId', (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const user = db.getUserById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const { sources } = req.body; // { bookstack: true, rag: false, ... }
    if (!sources) return res.status(400).json({ error: 'Sources requeridos' });

    for (const [key, enabled] of Object.entries(sources)) {
      db.setUserSourceOverride(userId, key, enabled);
    }
    const effective = db.getEffectiveSourceAccess(userId, user.role);
    res.json(effective);
  } catch (err) {
    console.error('Admin set user overrides error:', err);
    res.status(500).json({ error: 'Error actualizando overrides' });
  }
});

// DELETE /api/admin/sources/user/:userId/:sourceKey — remove single override
router.delete('/sources/user/:userId/:sourceKey', (req, res) => {
  const userId = parseInt(req.params.userId);
  const user = db.getUserById(userId);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  db.deleteUserSourceOverride(userId, req.params.sourceKey);
  const effective = db.getEffectiveSourceAccess(userId, user.role);
  res.json(effective);
});

// DELETE /api/admin/users/:id — delete user
router.delete('/users/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const user = db.getUserById(id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Safety: can't delete yourself
    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    // Safety: can't delete the last active admin
    if (user.role === 'admin') {
      const admins = db.getAllUsers().filter(u => u.role === 'admin' && u.active);
      if (admins.length <= 1) {
        return res.status(400).json({ error: 'No se puede eliminar al último administrador activo' });
      }
    }

    db.deleteUser(id);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
});

// GET /api/admin/user-metrics — per-user activity metrics
router.get('/user-metrics', (req, res) => {
  try {
    const raw = db.getUserMetrics();
    const metrics = raw.map(row => {
      // Aggregate source frequencies from all_sources (joined by |||)
      const sourceFreq = {};
      if (row.all_sources) {
        const chunks = row.all_sources.split('|||').filter(Boolean);
        for (const chunk of chunks) {
          try {
            const arr = JSON.parse(chunk);
            for (const src of arr) {
              sourceFreq[src] = (sourceFreq[src] || 0) + 1;
            }
          } catch { /* skip malformed */ }
        }
      }
      // Sort by frequency descending
      const topSources = Object.entries(sourceFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([key, count]) => ({ key, count }));

      return {
        user_id: row.user_id,
        name: row.name,
        email: row.email,
        role: row.role,
        department: row.department,
        total_messages: row.total_messages,
        total_conversations: row.total_conversations,
        last_activity: row.last_activity,
        top_sources: topSources
      };
    });
    res.json(metrics);
  } catch (err) {
    console.error('Admin user-metrics error:', err);
    res.status(500).json({ error: 'Error obteniendo métricas de usuarios' });
  }
});

// --- Knowledge Base Admin ---

// GET /api/admin/knowledge — list all articles
router.get('/knowledge', (req, res) => {
  try {
    const articles = db.getAllKnowledgeArticles();
    const stats = db.getKnowledgeStats();
    res.json({ articles, stats });
  } catch (err) {
    console.error('Admin KB list error:', err);
    res.status(500).json({ error: 'Error obteniendo artículos' });
  }
});

// GET /api/admin/knowledge/:id — article detail
router.get('/knowledge/:id', (req, res) => {
  const article = db.getKnowledgeArticle(parseInt(req.params.id));
  if (!article) return res.status(404).json({ error: 'Artículo no encontrado' });
  res.json(article);
});

// PUT /api/admin/knowledge/:id — update article
router.put('/knowledge/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const article = db.getKnowledgeArticle(id);
    if (!article) return res.status(404).json({ error: 'Artículo no encontrado' });

    const { title, problem, solution, keywords, source_tickets } = req.body;
    db.updateKnowledgeArticle(id, { title, problem, solution, keywords, source_tickets });
    res.json(db.getKnowledgeArticle(id));
  } catch (err) {
    console.error('Admin KB update error:', err);
    res.status(500).json({ error: 'Error actualizando artículo' });
  }
});

// DELETE /api/admin/knowledge/:id — delete article
router.delete('/knowledge/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const article = db.getKnowledgeArticle(id);
    if (!article) return res.status(404).json({ error: 'Artículo no encontrado' });

    db.deleteKnowledgeArticle(id);
    res.json({ message: 'Artículo eliminado' });
  } catch (err) {
    console.error('Admin KB delete error:', err);
    res.status(500).json({ error: 'Error eliminando artículo' });
  }
});

// --- Vault Credentials Admin ---

// GET /api/admin/vault — list all credentials (password NOT decrypted)
router.get('/vault', (req, res) => {
  try {
    if (!vault.isConfigured()) {
      return res.json({ credentials: [], configured: false });
    }
    const credentials = db.getAllVaultCredentials();
    res.json({ credentials, configured: true });
  } catch (err) {
    console.error('Admin vault list error:', err);
    res.status(500).json({ error: 'Error obteniendo credenciales' });
  }
});

// POST /api/admin/vault — create credential
router.post('/vault', (req, res) => {
  try {
    if (!vault.isConfigured()) {
      return res.status(400).json({ error: 'Vault no configurado. Añade VAULT_KEY al .env' });
    }
    const { name, username, password, url, notes, tags, departments } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: 'Nombre y password son requeridos' });
    }
    const encrypted = vault.encrypt(password);
    const id = db.addVaultCredential(name, username, encrypted, url, notes, tags, departments, req.user.email);
    res.status(201).json({ id, name, message: 'Credencial creada' });
  } catch (err) {
    console.error('Admin vault create error:', err);
    res.status(500).json({ error: 'Error creando credencial' });
  }
});

// GET /api/admin/vault/:id — detail with decrypted password
router.get('/vault/:id', (req, res) => {
  try {
    if (!vault.isConfigured()) {
      return res.status(400).json({ error: 'Vault no configurado' });
    }
    const cred = db.getVaultCredential(parseInt(req.params.id));
    if (!cred) return res.status(404).json({ error: 'Credencial no encontrada' });

    let decryptedPassword = '';
    try {
      decryptedPassword = vault.decrypt(cred.password_encrypted);
    } catch (e) {
      decryptedPassword = '[error al descifrar]';
    }

    res.json({
      ...cred,
      password: decryptedPassword,
      password_encrypted: undefined
    });
  } catch (err) {
    console.error('Admin vault detail error:', err);
    res.status(500).json({ error: 'Error obteniendo credencial' });
  }
});

// PUT /api/admin/vault/:id — update credential
router.put('/vault/:id', (req, res) => {
  try {
    if (!vault.isConfigured()) {
      return res.status(400).json({ error: 'Vault no configurado' });
    }
    const id = parseInt(req.params.id);
    const cred = db.getVaultCredential(id);
    if (!cred) return res.status(404).json({ error: 'Credencial no encontrada' });

    const { name, username, password, url, notes, tags, departments } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name;
    if (username !== undefined) fields.username = username;
    if (password !== undefined) fields.password_encrypted = vault.encrypt(password);
    if (url !== undefined) fields.url = url;
    if (notes !== undefined) fields.notes = notes;
    if (tags !== undefined) fields.tags = tags;
    if (departments !== undefined) fields.departments = departments;

    db.updateVaultCredential(id, fields);
    res.json({ message: 'Credencial actualizada' });
  } catch (err) {
    console.error('Admin vault update error:', err);
    res.status(500).json({ error: 'Error actualizando credencial' });
  }
});

// DELETE /api/admin/vault/:id — delete credential
router.delete('/vault/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cred = db.getVaultCredential(id);
    if (!cred) return res.status(404).json({ error: 'Credencial no encontrada' });

    db.deleteVaultCredential(id);
    res.json({ message: 'Credencial eliminada' });
  } catch (err) {
    console.error('Admin vault delete error:', err);
    res.status(500).json({ error: 'Error eliminando credencial' });
  }
});

module.exports = router;
