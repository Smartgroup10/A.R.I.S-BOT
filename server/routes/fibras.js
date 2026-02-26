const express = require('express');
const fibras = require('../services/fibras');

const router = express.Router();

// GET /api/fibras/status
router.get('/status', (req, res) => {
  res.json({ configured: fibras.isConfigured() });
});

// GET /api/fibras/stats
router.get('/stats', async (req, res) => {
  try {
    const stats = await fibras.getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fibras/search?q=algeciras
router.get('/search', async (req, res) => {
  try {
    const query = req.query.q || '';
    if (!query.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    const results = await fibras.searchLineas(query, 20);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/fibras/linea/:numero
router.get('/linea/:numero', async (req, res) => {
  try {
    const linea = await fibras.getLineaByNumero(req.params.numero);
    if (!linea) {
      return res.status(404).json({ error: 'Línea no encontrada' });
    }
    res.json(linea);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
