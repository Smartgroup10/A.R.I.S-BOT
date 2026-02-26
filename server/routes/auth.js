const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Avatar upload config
const AVATARS_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
if (!fs.existsSync(AVATARS_DIR)) fs.mkdirSync(AVATARS_DIR, { recursive: true });

const avatarStorage = multer.diskStorage({
  destination: AVATARS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${req.user.id}-${uuidv4()}${ext}`);
  }
});
const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

function getAllowedDomains() {
  const raw = process.env.ALLOWED_DOMAINS || '';
  return raw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
}

function isEmailAllowed(email) {
  const domains = getAllowedDomains();
  if (domains.length === 0) return true; // No restriction if not configured
  const domain = email.split('@')[1]?.toLowerCase();
  return domains.includes(domain);
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, name, password, department, sede } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({ error: 'Email, nombre y contraseña son requeridos' });
    }

    if (!email.includes('@')) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    if (!isEmailAllowed(email)) {
      const domains = getAllowedDomains();
      return res.status(400).json({
        error: `Solo se permiten correos corporativos: ${domains.map(d => '@' + d).join(', ')}`
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existing = db.getUserByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Ya existe una cuenta con este correo' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = db.createUser(email.toLowerCase(), name.trim(), passwordHash, department, sede, 'user');

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, department: user.department, sede: user.sede, role: user.role }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const user = db.getUserByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, department: user.department, sede: user.sede, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/setup-password (public — no auth)
router.post('/setup-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token y contraseña son requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }
    const user = db.getUserBySetupToken(token);
    if (!user) {
      return res.status(400).json({ error: 'El enlace es inválido o ha expirado' });
    }
    const hash = await bcrypt.hash(password, 10);
    db.consumeSetupToken(user.id, hash);
    res.json({ message: 'Contraseña establecida correctamente' });
  } catch (err) {
    console.error('Setup password error:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// PUT /api/auth/me — update own profile
router.put('/me', authenticate, (req, res) => {
  try {
    const { name, department, sede, bio } = req.body;
    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (department !== undefined) fields.department = department;
    if (sede !== undefined) fields.sede = sede;
    db.updateUser(req.user.id, fields);
    if (bio !== undefined) {
      db.upsertUserPreferences(req.user.id, { bio });
    }
    const updated = db.getUserById(req.user.id);
    res.json({ user: updated });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Error actualizando perfil' });
  }
});

// PUT /api/auth/me/password — change own password
router.put('/me/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }
    const fullUser = db.getUserByEmail(req.user.email);
    const valid = await bcrypt.compare(currentPassword, fullUser.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    db.updateUserPassword(req.user.id, hash);
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Error cambiando contraseña' });
  }
});

// GET /api/auth/me/preferences
router.get('/me/preferences', authenticate, (req, res) => {
  const prefs = db.getUserPreferences(req.user.id);
  res.json(prefs);
});

// PUT /api/auth/me/preferences
router.put('/me/preferences', authenticate, (req, res) => {
  try {
    const { preferred_ai_provider, preferred_language, preferred_theme } = req.body;
    const fields = {};
    if (preferred_ai_provider !== undefined) fields.preferred_ai_provider = preferred_ai_provider;
    if (preferred_language !== undefined) fields.preferred_language = preferred_language;
    if (preferred_theme !== undefined) fields.preferred_theme = preferred_theme;
    const prefs = db.upsertUserPreferences(req.user.id, fields);
    res.json(prefs);
  } catch (err) {
    console.error('Update preferences error:', err);
    res.status(500).json({ error: 'Error actualizando preferencias' });
  }
});

// POST /api/auth/me/avatar
router.post('/me/avatar', authenticate, avatarUpload.single('avatar'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No se proporcionó imagen' });
  }
  const avatarPath = `/uploads/avatars/${req.file.filename}`;
  db.upsertUserPreferences(req.user.id, { avatar_path: avatarPath });
  res.json({ avatar_path: avatarPath });
});

// GET /api/auth/me/sources — own effective source access
router.get('/me/sources', authenticate, (req, res) => {
  const access = db.getEffectiveSourceAccess(req.user.id, req.user.role);
  res.json(access);
});

module.exports = router;
