const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const emailService = require('../services/email');
const passbolt = require('../services/passbolt');
const crm = require('../services/crm');
const { getProviderModel } = require('../services/ai');

const router = express.Router();

// GET /api/admin/usage — API usage stats
router.get('/usage', (req, res) => {
  try {
    const stats = db.getApiUsageStats();
    const { provider, model } = getProviderModel();
    res.json({ ...stats, active_provider: provider, active_model: model });
  } catch (err) {
    console.error('Admin usage error:', err);
    res.status(500).json({ error: 'Error obteniendo estadísticas de uso' });
  }
});

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

// --- Passbolt Status ---

// GET /api/admin/passbolt/status — connection status
router.get('/passbolt/status', async (req, res) => {
  try {
    const status = await passbolt.getStatus();
    res.json(status);
  } catch (err) {
    console.error('Admin passbolt status error:', err);
    res.status(500).json({ error: 'Error obteniendo estado de Passbolt' });
  }
});

// GET /api/admin/audit — audit log
router.get('/audit', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const entries = db.getAuditLog(limit);
    res.json(entries);
  } catch (err) {
    console.error('Admin audit error:', err);
    res.status(500).json({ error: 'Error obteniendo audit log' });
  }
});

// --- CRM Clients ---

// GET /api/admin/crm-clients?q=<search> — list clients from CRM
router.get('/crm-clients', async (req, res) => {
  try {
    if (!crm.isConfigured()) {
      return res.json({ clients: [], error: 'CRM no configurado' });
    }
    const query = req.query.q || '';
    const results = await crm.fetchClients(query);
    const clients = results.slice(0, 100).map(c => ({
      id: c.id,
      nombre: c.nombre,
      cif: c.cif,
      distribuidor: c.distribuidor,
      lineas: c.lineas,
      estado: c.estado,
      contacto: c.contacto,
      fecha: c.fecha,
      ultima_interaccion_fecha: c.ultima_interaccion_fecha
    }));
    res.json({ total: results.length, clients });
  } catch (err) {
    console.error('Admin CRM clients error:', err);
    res.status(500).json({ error: 'Error obteniendo clientes del CRM' });
  }
});

// --- CRM 2FA Management ---

// GET /api/admin/crm-2fa/status — check 2FA status
router.get('/crm-2fa/status', async (req, res) => {
  try {
    if (!crm.isConfigured()) {
      return res.json({ configured: false });
    }
    const status = crm.get2FAStatus();
    // Only check if 2FA is required when not already validated
    let required = false;
    if (!status.validated) {
      try { required = await crm.check2FARequired(); } catch {}
    }
    res.json({ configured: true, ...status, required });
  } catch (err) {
    console.error('Admin CRM 2FA status error:', err);
    res.status(500).json({ error: 'Error obteniendo estado 2FA del CRM' });
  }
});

// POST /api/admin/crm-2fa/send — send SMS code
router.post('/crm-2fa/send', async (req, res) => {
  try {
    const result = await crm.send2FA();
    if (result.success) {
      try { db.addAuditLog(req.user.id, 'crm_2fa_send', 'SMS code requested'); } catch {}
    }
    res.json(result);
  } catch (err) {
    console.error('Admin CRM 2FA send error:', err);
    res.status(500).json({ success: false, error: 'Error enviando codigo SMS' });
  }
});

// POST /api/admin/crm-2fa/validate — validate SMS code
router.post('/crm-2fa/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Codigo requerido' });

    const result = await crm.validate2FA(code);
    if (result.success) {
      try { db.addAuditLog(req.user.id, 'crm_2fa_validate', 'SMS code validated successfully'); } catch {}
    }
    res.json(result);
  } catch (err) {
    console.error('Admin CRM 2FA validate error:', err);
    res.status(500).json({ success: false, error: 'Error validando codigo SMS' });
  }
});

module.exports = router;
