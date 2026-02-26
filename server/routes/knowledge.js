const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rag = require('../services/rag');

const router = express.Router();

const KNOWLEDGE_DIR = path.join(__dirname, '..', '..', 'knowledge');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subdir = req.body.folder || '';
    const dest = path.join(KNOWLEDGE_DIR, subdir);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    // Keep original filename, sanitize
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-áéíóúñÁÉÍÓÚÑ ]/g, '_');
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.md', '.txt', '.docx', '.doc', '.odt'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos .pdf, .md, .txt, .docx, .doc y .odt'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Get indexing stats
router.get('/stats', (req, res) => {
  res.json(rag.getStats());
});

// Get list of indexed documents
router.get('/documents', (req, res) => {
  res.json(rag.getIndexedDocuments());
});

// Upload documents (with error handling for multer)
router.post('/upload', (req, res) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    const uploaded = (req.files || []).map(f => ({
      name: f.originalname,
      size: f.size,
      path: f.filename
    }));
    res.json({ uploaded, message: `${uploaded.length} archivo(s) subido(s). Usa /reindex para indexar.` });
  });
});

// Trigger reindexing
router.post('/reindex', async (req, res) => {
  try {
    const result = await rag.indexDocuments();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a document
router.delete('/documents/:filename', (req, res) => {
  const filePath = path.join(KNOWLEDGE_DIR, req.params.filename);
  // Prevent directory traversal
  if (!filePath.startsWith(KNOWLEDGE_DIR)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true, message: 'Archivo eliminado. Reindexar para actualizar.' });
});

// Search (for testing)
router.post('/search', async (req, res) => {
  const { query, topK } = req.body;
  if (!query) return res.status(400).json({ error: 'Query required' });
  const results = await rag.search(query, topK || 5);
  res.json(results);
});

module.exports = router;
