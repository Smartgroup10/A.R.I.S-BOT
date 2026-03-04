const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const { initDb } = require('./db');
const { loadSystemPrompt } = require('./system-prompt');
const rag = require('./services/rag');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const { authenticate } = require('./middleware/auth');
const { requireAdmin } = require('./middleware/admin');
const chatRoutes = require('./routes/chat');
const conversationRoutes = require('./routes/conversations');
const knowledgeRoutes = require('./routes/knowledge');
const fibrasRoutes = require('./routes/fibras');
const bookstack = require('./services/bookstack');
const fibras = require('./services/fibras');
const { getProvider } = require('./services/ai');

const app = express();
const PORT = process.env.PORT || 3080;

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Vue SPA needs inline scripts
  crossOriginEmbedderPolicy: false
}));

// CORS — restrict to known origins
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
if (ALLOWED_ORIGINS.length === 0) {
  ALLOWED_ORIGINS.push(`http://localhost:${PORT}`, 'http://localhost:3080', 'http://localhost:5173');
}
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true
}));

// Body parser with size limit
app.use(express.json({ limit: '2mb' }));

// Rate limiting — login: 10 attempts per 15min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Espera 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
});

// Rate limiting — chat: 40 requests per minute per user
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { error: 'Demasiadas solicitudes. Espera un momento.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || 'anon'),
  validate: { xForwardedForHeader: false }
});

// Public auth routes (with login rate limiting)
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/setup-password', loginLimiter);
app.use('/api/auth', authRoutes);

// Admin API Routes
app.use('/api/admin', authenticate, requireAdmin, adminRoutes);

// Protected API Routes
app.use('/api/chat', authenticate, chatLimiter, chatRoutes);
app.use('/api/conversations', authenticate, conversationRoutes);
app.use('/api/knowledge', authenticate, knowledgeRoutes);
app.use('/api/fibras', authenticate, fibrasRoutes);

// BookStack (protected)
app.get('/api/bookstack/status', authenticate, (req, res) => {
  res.json({ configured: bookstack.isConfigured() });
});
app.get('/api/bookstack/books', authenticate, async (req, res) => {
  try {
    const books = await bookstack.listBooks();
    res.json(books);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/bookstack/search', authenticate, async (req, res) => {
  try {
    const results = await bookstack.search(req.body.query, req.body.count || 5);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve static frontend in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

// Check if port is already in use before starting
function checkPort(port) {
  return new Promise((resolve) => {
    const net = require('net');
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') resolve(true);
      else resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

// Start
async function start() {
  const inUse = await checkPort(PORT);
  if (inUse) {
    console.error(`\n  ERROR: El puerto ${PORT} ya está en uso.`);
    console.error(`  Ya hay un servidor corriendo. Ciérralo primero o usa otro puerto.\n`);
    process.exit(1);
  }

  await initDb();
  loadSystemPrompt();
  rag.loadIndex();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`AI Provider: ${getProvider().toUpperCase()}`);
    console.log(`Fibras API: ${fibras.isConfigured() ? 'Configured (' + (process.env.FIBRAS_URL || 'http://192.168.172.201:8000') + ')' : 'Not configured'}`);
  });

  // Pre-load embedding model in background
  rag.initEmbedder().catch(err => {
    console.error('Warning: Could not pre-load embedding model:', err.message);
  });
}

start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
