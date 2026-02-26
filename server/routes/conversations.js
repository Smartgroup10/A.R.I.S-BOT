const express = require('express');
const db = require('../db');

const router = express.Router();

// --- Feedback routes (before /:id to avoid matching) ---

router.post('/feedback', (req, res) => {
  const { messageId, conversationId, rating } = req.body;
  if (!messageId || !conversationId || ![1, -1].includes(rating)) {
    return res.status(400).json({ error: 'messageId, conversationId, and rating (1 or -1) required' });
  }
  db.upsertFeedback(messageId, conversationId, rating);
  res.json({ success: true });
});

router.get('/feedback/stats', (req, res) => {
  const stats = db.getFeedbackStats();
  res.json(stats);
});

router.get('/feedback/:conversationId', (req, res) => {
  const feedback = db.getFeedbackByConversation(req.params.conversationId);
  res.json(feedback);
});

// List conversations for authenticated user
router.get('/', (req, res) => {
  const conversations = db.getConversationsByUser(req.user.id);
  res.json(conversations);
});

// Get messages for a conversation
router.get('/:id/messages', (req, res) => {
  const conversation = db.getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  if (conversation.user_id && conversation.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  const messages = db.getMessages(req.params.id);
  res.json({ conversation, messages });
});

// Delete a conversation
router.delete('/:id', (req, res) => {
  const conversation = db.getConversation(req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversation not found' });
  }
  if (conversation.user_id && conversation.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  db.deleteConversation(req.params.id);
  res.json({ success: true });
});

module.exports = router;
