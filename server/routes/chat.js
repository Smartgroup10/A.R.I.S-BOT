const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { streamChat, streamChatWithVision, generateTitle } = require('../services/ai');
const { getSystemPrompt } = require('../system-prompt');
const rag = require('../services/rag');
const bookstack = require('../services/bookstack');
const fibras = require('../services/fibras');
const crm = require('../services/crm');
const db = require('../db');

const router = express.Router();

// Configure multer for file uploads
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Regex patterns that indicate the user is referencing past conversations
const HISTORY_PATTERNS = [
  /la otra vez/i,
  /recuerdas/i,
  /como hicimos/i,
  /ya me dijiste/i,
  /me explicaste/i,
  /hablamos de/i,
  /la vez pasada/i,
  /anteriormente/i,
  /como me dijiste/i,
  /lo que me ense[ñn]aste/i,
  /ya hab[ií]amos/i,
  /en la otra conversaci[oó]n/i,
  /la conversaci[oó]n anterior/i,
  /antes me/i
];

function mightNeedHistory(message) {
  return HISTORY_PATTERNS.some(p => p.test(message));
}

// Text file extensions that can be included inline
const TEXT_EXTENSIONS = ['.txt', '.log', '.csv', '.json', '.md', '.xml', '.yaml', '.yml', '.ini', '.conf', '.sh', '.bat', '.py', '.js', '.ts', '.html', '.css'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

// File upload endpoint
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  const isText = TEXT_EXTENSIONS.includes(ext);
  const isImage = IMAGE_EXTENSIONS.includes(ext);

  let textContent = null;
  let base64 = null;
  let mediaType = null;

  if (isText) {
    try {
      textContent = fs.readFileSync(req.file.path, 'utf-8').substring(0, 50000);
    } catch { /* ignore */ }
  } else if (isImage) {
    try {
      const buffer = fs.readFileSync(req.file.path);
      base64 = buffer.toString('base64');
      mediaType = req.file.mimetype;
    } catch { /* ignore */ }
  }

  res.json({
    storedName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    isText,
    isImage,
    textContent,
    base64,
    mediaType
  });
});

router.post('/', async (req, res) => {
  const { conversationId, message, attachments } = req.body;
  // Build userContext from authenticated user
  const userContext = {
    name: req.user.name,
    department: req.user.department,
    sede: req.user.sede,
    role: req.user.role
  };

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  let ended = false;

  function safeWrite(data) {
    if (!ended && !res.writableEnded) {
      res.write(data);
    }
  }

  function safeEnd() {
    if (!ended && !res.writableEnded) {
      ended = true;
      res.end();
    }
  }

  try {
    // Determine conversation ID
    let convId = conversationId;
    let isNew = false;

    if (!convId) {
      convId = uuidv4();
      db.createConversation(
        convId,
        'Nueva conversación',
        userContext.name,
        userContext.department,
        userContext.sede,
        req.user.id
      );
      isNew = true;
    }

    // Build user message content — include text file attachments inline
    let userContent = message.trim();
    let hasImageAttachments = false;
    const imageAttachments = [];

    if (attachments && attachments.length > 0) {
      for (const att of attachments) {
        if (att.isText && att.textContent) {
          userContent += `\n\n--- Archivo adjunto: ${att.originalName} ---\n${att.textContent}\n--- Fin del archivo ---`;
        }
        if (att.isImage && att.base64 && att.mediaType) {
          hasImageAttachments = true;
          imageAttachments.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mediaType, data: att.base64 }
          });
        }
        // Save attachment reference
        db.addAttachment(null, convId, att.originalName, att.storedName, att.mimeType, att.size);
      }
    }

    // Save user message
    db.addMessage(convId, 'user', userContent);

    // Build message history
    const history = db.getMessages(convId).map(m => ({
      role: m.role,
      content: m.content
    }));

    // Get system prompt with user context + RAG context
    let systemPrompt = getSystemPrompt(userContext);

    // Get effective source access for this user
    const sourceAccess = db.getEffectiveSourceAccess(req.user.id, req.user.role);

    // Search relevant documents — BookStack is PRIMARY, RAG is secondary, Fibras for connectivity
    const ragStats = rag.getStats();
    const searches = [];

    // Always search BookStack first (primary source) — if allowed
    if (sourceAccess.bookstack) {
      searches.push(bookstack.getRelevantContext(message.trim()).catch(() => null));
    } else {
      searches.push(Promise.resolve(null));
    }

    // Also search RAG if indexed docs exist (secondary source) — if allowed
    if (sourceAccess.rag && ragStats.totalChunks > 0) {
      searches.push(rag.getRelevantContext(message.trim()).catch(() => null));
    } else {
      searches.push(Promise.resolve(null));
    }

    // Search Fibras if the message might be about connectivity — if allowed
    if (sourceAccess.fibras && fibras.isConfigured() && fibras.mightBeAboutFibras(message.trim())) {
      searches.push(fibras.getRelevantContext(message.trim()).catch(() => null));
    } else {
      searches.push(Promise.resolve(null));
    }

    // Search CRM if the message might be about tickets/incidents — if allowed
    if (sourceAccess.crm && crm.isConfigured() && crm.mightBeAboutCRM(message.trim())) {
      searches.push(crm.getRelevantContext(message.trim()).catch(() => null));
    } else {
      searches.push(Promise.resolve(null));
    }

    // Search closed Soporte tickets if user needs help resolving an incident — if CRM allowed
    if (sourceAccess.crm && crm.isConfigured() && crm.mightNeedResolution(message.trim())) {
      searches.push(crm.getResolutionContext(message.trim()).catch(() => null));
    } else {
      searches.push(Promise.resolve(null));
    }

    // Direct ticket lookup by number (e.g. "ticket 16648", "#16648") — if CRM allowed
    const directTicketId = (sourceAccess.crm && crm.isConfigured()) ? crm.extractTicketNumber(message.trim()) : null;
    if (directTicketId) {
      searches.push(crm.getDirectTicketContext(directTicketId).catch(() => null));
    } else {
      searches.push(Promise.resolve(null));
    }

    // Client search (phone, CIF, name) — if CRM allowed
    if (sourceAccess.crm && crm.isConfigured() && crm.mightBeAboutClient(message.trim())) {
      searches.push(crm.getClientContext(message.trim()).catch(() => null));
    } else {
      searches.push(Promise.resolve(null));
    }

    const [bookstackCtx, ragCtx, fibrasCtx, crmCtx, resolutionCtx, directTicketCtx, clientCtx] = await Promise.all(searches);

    // Build source priority instructions
    const foundSources = [];
    if (bookstackCtx) foundSources.push('Wiki corporativa (BookStack)');
    if (ragCtx) foundSources.push('Documentación interna (PDFs/docs locales)');
    if (fibrasCtx) foundSources.push('Sistema de Gestión de Fibras');
    if (crmCtx) foundSources.push('CRM de Tickets (ALPHA)');
    if (resolutionCtx) foundSources.push('Historial de resoluciones (Soporte)');
    if (directTicketCtx) foundSources.push('Detalle directo de ticket (CRM)');
    if (clientCtx) foundSources.push('Datos de Clientes (CRM)');

    if (foundSources.length > 0) {
      systemPrompt += `\n---\n## JERARQUÍA DE FUENTES (OBLIGATORIO)\n\nSe encontró información en: **${foundSources.join(' y ')}**.\n\n**REGLAS DE PRIORIDAD:**\n1. **SIEMPRE usa primero la información de las fuentes internas** (Wiki y documentación) que se incluyen abajo.\n2. **NO des respuestas genéricas ni de internet** si hay información relevante en las fuentes internas.\n3. **Solo usa tu conocimiento general** si las fuentes internas NO contienen información relevante para la pregunta.\n4. Si la info interna es parcial, complémenta con tu conocimiento pero SIEMPRE indicando qué viene de la empresa y qué es información general.\n---\n`;
    } else {
      systemPrompt += `\n---\n## FUENTES\n\nNo se encontró información relevante en la wiki ni en la documentación interna para esta consulta.\nPuedes responder con tu conocimiento general, pero indica al usuario que no encontraste documentación interna específica sobre el tema.\n---\n`;
    }

    // Append context from sources
    if (bookstackCtx) systemPrompt += bookstackCtx;
    if (ragCtx) systemPrompt += ragCtx;
    if (fibrasCtx) systemPrompt += fibrasCtx;
    if (crmCtx) systemPrompt += crmCtx;
    if (resolutionCtx) systemPrompt += resolutionCtx;
    if (directTicketCtx) systemPrompt += directTicketCtx;
    if (clientCtx) systemPrompt += clientCtx;

    // Smart history: check if user references past conversations
    let historyUsed = false;
    if (mightNeedHistory(message.trim())) {
      const pastMessages = db.searchMessages(message.trim(), convId, 8);
      if (pastMessages.length > 0) {
        historyUsed = true;
        let historyCtx = '\n---\n## CONTEXTO DE CONVERSACIONES ANTERIORES\n\nEl usuario hace referencia a conversaciones previas. Aquí tienes mensajes relevantes encontrados:\n\n';
        pastMessages.forEach(m => {
          const prefix = m.role === 'user' ? 'Usuario' : 'Asistente';
          historyCtx += `**[${m.title}]** ${prefix}: ${m.content.substring(0, 500)}\n\n`;
        });
        historyCtx += 'Usa este contexto para dar una respuesta coherente con lo que ya se discutió.\n---\n';
        systemPrompt += historyCtx;
      }
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send conversation ID first
    safeWrite(`data: ${JSON.stringify({ type: 'conversation_id', id: convId })}\n\n`);

    // Notify if history context was used
    if (historyUsed) {
      safeWrite(`data: ${JSON.stringify({ type: 'history_used' })}\n\n`);
    }

    // Stream response — if images are attached, use vision (force Claude)
    let stream;
    if (hasImageAttachments) {
      // Replace the last user message content with multimodal content for Claude vision
      const lastMsg = history[history.length - 1];
      lastMsg.content = [
        { type: 'text', text: lastMsg.content },
        ...imageAttachments
      ];
      stream = await streamChatWithVision(history, systemPrompt);
    } else {
      stream = await streamChat(history, systemPrompt);
    }
    let fullResponse = '';

    stream.on('text', (text) => {
      fullResponse += text;
      safeWrite(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
    });

    stream.on('end', async () => {
      // Save assistant response
      if (fullResponse) {
        db.addMessage(convId, 'assistant', fullResponse);
      }

      // Generate title for new conversations
      if (isNew) {
        try {
          const title = await generateTitle(message.trim());
          db.updateConversationTitle(convId, title);
          safeWrite(`data: ${JSON.stringify({ type: 'title', title })}\n\n`);
        } catch (e) {
          console.error('Error generating title:', e.message);
        }
      }

      safeWrite(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      safeEnd();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error.message);
      safeWrite(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      safeEnd();
    });

    // Handle client disconnect
    req.on('close', () => {
      ended = true;
      stream.abort();
    });
  } catch (error) {
    console.error('Chat error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error processing chat request' });
    } else {
      safeWrite(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      safeEnd();
    }
  }
});

module.exports = router;
