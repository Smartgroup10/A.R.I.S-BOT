const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const emailService = require('../services/email');

const router = express.Router();

// GET /api/admin/stats — dashboard stats
router.get('/stats', (req, res) => {
  try {
    const users = db.getAllUsers();
    const convResult = db.getDb().exec('SELECT COUNT(*) FROM conversations');
    const msgResult = db.getDb().exec('SELECT COUNT(*) FROM messages');
    const feedbackStats = db.getFeedbackStats();

    res.json({
      users: users.length,
      activeUsers: users.filter(u => u.active).length,
      conversations: convResult.length > 0 ? convResult[0].values[0][0] : 0,
      messages: msgResult.length > 0 ? msgResult[0].values[0][0] : 0,
      feedback: feedbackStats
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', (req, res) => {
  const users = db.getAllUsers();
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

// GET /api/admin/users/:id — user detail
router.get('/users/:id', (req, res) => {
  const user = db.getUserById(parseInt(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
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

module.exports = router;
