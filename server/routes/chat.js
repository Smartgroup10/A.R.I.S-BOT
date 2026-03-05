const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { streamChat, streamChatWithVision, generateTitle, getToolDefinitions } = require('../services/ai');
const { getSystemPrompt } = require('../system-prompt');
const rag = require('../services/rag');
const bookstack = require('../services/bookstack');
const fibras = require('../services/fibras');
const crm = require('../services/crm');
const email = require('../services/email');
const teki = require('../services/teki');
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

// Simple messages that don't need external searches
const SIMPLE_PATTERNS = [
  /^(hola|hey|buenas|buenos d[ií]as|buenas tardes|buenas noches|qu[eé] tal|saludos)[\s!.?]*$/i,
  /^(gracias|muchas gracias|ok|vale|perfecto|entendido|genial|de acuerdo)[\s!.?]*$/i,
  /^(s[ií]|no|claro|dale|adelante|confirmo|exacto)[\s!.?]*$/i,
  /^(adi[oó]s|hasta luego|nos vemos|chao)[\s!.?]*$/i
];

function isSimpleMessage(message) {
  return SIMPLE_PATTERNS.some(p => p.test(message.trim()));
}

// Wrap a promise with a timeout (returns null on timeout)
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms))
  ]);
}

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
  if (message.length > 10000) {
    return res.status(400).json({ error: 'Mensaje demasiado largo (máx 10.000 caracteres)' });
  }
  if (conversationId && !/^[a-f0-9-]{36}$/.test(conversationId)) {
    return res.status(400).json({ error: 'ID de conversación no válido' });
  }
  if (attachments && attachments.length > 10) {
    return res.status(400).json({ error: 'Máximo 10 archivos adjuntos' });
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

    // Set up SSE early — so the client sees activity immediately
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send conversation ID first
    safeWrite(`data: ${JSON.stringify({ type: 'conversation_id', id: convId })}\n\n`);

    // Get effective source access for this user
    const sourceAccess = db.getEffectiveSourceAccess(req.user.id, req.user.role);

    // Skip external searches for simple messages (greetings, confirmations, etc.)
    const SEARCH_TIMEOUT = 8000; // 8s max per search
    const msg = message.trim();
    const skipSearches = isSimpleMessage(msg);

    const ragStats = rag.getStats();
    const searches = [];

    if (!skipSearches) {
      // BookStack (primary source)
      searches.push(sourceAccess.bookstack
        ? withTimeout(bookstack.getRelevantContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // RAG (secondary source)
      searches.push(sourceAccess.rag && ragStats.totalChunks > 0
        ? withTimeout(rag.getRelevantContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // Fibras
      searches.push(sourceAccess.fibras && fibras.isConfigured() && fibras.mightBeAboutFibras(msg)
        ? withTimeout(fibras.getRelevantContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // CRM tickets
      searches.push(sourceAccess.crm && crm.isConfigured() && crm.mightBeAboutCRM(msg)
        ? withTimeout(crm.getRelevantContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // Resolution context
      searches.push(sourceAccess.crm && crm.isConfigured() && crm.mightNeedResolution(msg)
        ? withTimeout(crm.getResolutionContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // Direct ticket lookup
      const directTicketId = (sourceAccess.crm && crm.isConfigured()) ? crm.extractTicketNumber(msg) : null;
      searches.push(directTicketId
        ? withTimeout(crm.getDirectTicketContext(directTicketId).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // Client search
      searches.push(sourceAccess.crm && crm.isConfigured() && crm.mightBeAboutClient(msg)
        ? withTimeout(crm.getClientContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // Teki desvíos
      searches.push(sourceAccess.teki && teki.isConfigured() && teki.mightBeAboutDesvios(msg)
        ? withTimeout(teki.getDesviosContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));

      // Teki fibras
      searches.push(sourceAccess.teki && teki.isConfigured() && teki.mightBeAboutTekiFibras(msg)
        ? withTimeout(teki.getTekiFibrasContext(msg).catch(() => null), SEARCH_TIMEOUT)
        : Promise.resolve(null));
    } else {
      for (let i = 0; i < 9; i++) searches.push(Promise.resolve(null));
    }

    const [bookstackCtx, ragCtx, fibrasCtx, crmCtx, resolutionCtx, directTicketCtx, clientCtx, desviosCtx, tekiFibrasCtx] = await Promise.all(searches);

    // Track which sources were used
    const usedSources = [];
    if (bookstackCtx) usedSources.push('bookstack');
    if (ragCtx) usedSources.push('rag');
    if (fibrasCtx) usedSources.push('fibras');
    if (crmCtx || resolutionCtx || directTicketCtx || clientCtx) usedSources.push('crm');
    if (desviosCtx || tekiFibrasCtx) usedSources.push('teki');

    // Build source priority instructions
    const foundSources = [];
    if (bookstackCtx) foundSources.push('Wiki corporativa (BookStack)');
    if (ragCtx) foundSources.push('Documentación interna (PDFs/docs locales)');
    if (fibrasCtx) foundSources.push('Sistema de Gestión de Fibras');
    if (crmCtx) foundSources.push('CRM de Tickets (ALPHA)');
    if (resolutionCtx) foundSources.push('Historial de resoluciones (Soporte)');
    if (directTicketCtx) foundSources.push('Detalle directo de ticket (CRM)');
    if (clientCtx) foundSources.push('Datos de Clientes (CRM)');
    if (desviosCtx) foundSources.push('Desvíos de Líneas Fijas (Teki)');
    if (tekiFibrasCtx) foundSources.push('Solicitudes de Fibra (Teki)');

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
    if (desviosCtx) systemPrompt += desviosCtx;
    if (tekiFibrasCtx) systemPrompt += tekiFibrasCtx;

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

    // Notify if history context was used
    if (historyUsed) {
      safeWrite(`data: ${JSON.stringify({ type: 'history_used' })}\n\n`);
    }

    // Get tool definitions based on user's source access
    const tools = getToolDefinitions(sourceAccess);

    // Tool executor: maps tool names to actual functions
    async function executeTool(name, input) {
      if (name === 'search_crm_clients') {
        const results = await crm.fetchClients(input.query);
        const clients = results.slice(0, 10).map(c => ({
          id: c.id,
          nombre: c.nombre,
          cif: c.cif,
          estado: c.estado,
          contacto: c.contacto
        }));
        return { total: results.length, clients };
      }
      if (name === 'add_seguimiento_crm') {
        return crm.updateSeguimiento(input.ticket_id, input.text);
      }
      if (name === 'create_crm_ticket') {
        return crm.createTicket({
          temaId: input.tema_id,
          description: input.description,
          fechaLimite: input.fecha_limite,
          clientId: input.client_id || 0,
          prioridad: input.prioridad || 0,
          contacto: input.contacto || '',
          email: input.email || '',
          telefono: input.telefono || ''
        });
      }
      if (name === 'send_email_client') {
        const ok = await email.sendEmail({ to: input.to_email, subject: input.subject, text: input.body });
        if (ok) return { success: true, message: `Email enviado a ${input.to_email}` };
        return { error: 'No se pudo enviar el email. Verifica la configuración SMTP.' };
      }
      if (name === 'reply_ticket_email') {
        // 1. Fetch email thread for context
        const emails = await crm.fetchTicketEmails(input.ticket_id);

        // 2. Get ticket detail for client name and subject context
        const ticketDetail = await crm.fetchTicketDetail(input.ticket_id);
        const clientName = ticketDetail?.cliente || 'Cliente';

        // 3. Determine subject line
        let subject = `RE: Ticket #${input.ticket_id}`;
        if (emails.length > 0) {
          const lastSubject = emails[0].asunto || '';
          if (lastSubject && !lastSubject.startsWith('RE:')) {
            subject = `RE: ${lastSubject}`;
          } else if (lastSubject) {
            subject = lastSubject;
          }
        }
        if (!subject.includes(`#${input.ticket_id}`)) {
          subject += ` #${input.ticket_id}`;
        }

        // 4. Build HTML email body
        const htmlBody = `<p>Estimado/a ${clientName},</p>` +
          input.reply_text.split('\n').map(line => `<p>${line}</p>`).join('') +
          `<br><p>Atentamente,</p><p><strong>Equipo de Soporte — SmartGroup / ALPHA</strong></p>`;

        // 5. Send via SMTP
        const ok = await email.sendEmail({
          to: input.to_email,
          subject,
          html: htmlBody,
          text: input.reply_text
        });

        if (!ok) {
          return { error: 'No se pudo enviar el email. Verifica la configuración SMTP.' };
        }

        // 6. Log in ticket seguimiento
        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}`;
        const segText = `${dateStr} - Email enviado a ${input.to_email}: "${subject}" (via ARIS)`;
        try {
          await crm.updateSeguimiento(input.ticket_id, segText);
        } catch (e) {
          console.error('Failed to update seguimiento after email:', e.message);
        }

        return {
          success: true,
          message: `Email enviado a ${input.to_email} y registrado en seguimiento del ticket #${input.ticket_id}`,
          subject,
          emailThread: emails.length
        };
      }
      return { error: `Unknown tool: ${name}` };
    }

    // Stream with tool use loop
    let fullResponse = '';
    let streamMessages = [...history];
    let currentStream = null;
    const MAX_TOOL_ROUNDS = 3;

    // Handle client disconnect
    req.on('close', () => {
      ended = true;
      if (currentStream && currentStream.abort) currentStream.abort();
    });

    try {
      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        if (ended) break;
        console.log(`Stream round ${round}, messages: ${streamMessages.length}`);

        // Start stream
        if (hasImageAttachments && round === 0) {
          const lastMsg = streamMessages[streamMessages.length - 1];
          lastMsg.content = [
            { type: 'text', text: lastMsg.content },
            ...imageAttachments
          ];
          currentStream = await streamChatWithVision(streamMessages, systemPrompt);
        } else {
          currentStream = await streamChat(streamMessages, systemPrompt, tools.length > 0 ? tools : undefined);
        }

        // Collect text deltas
        let roundText = '';
        currentStream.on('text', (text) => {
          roundText += text;
          fullResponse += text;
          safeWrite(`data: ${JSON.stringify({ type: 'delta', text })}\n\n`);
        });

        // Wait for stream to finish and get final message
        console.log(`Round ${round}: waiting for finalMessage...`);
        const finalMessage = await currentStream.finalMessage();
        console.log(`Round ${round}: stop_reason=${finalMessage.stop_reason}, content blocks=${finalMessage.content.length}`);

        if (ended) break;

        // Check if AI wants to use tools
        const toolUseBlocks = finalMessage.content.filter(b => b.type === 'tool_use');

        if (toolUseBlocks.length === 0 || finalMessage.stop_reason !== 'tool_use') {
          // No tool calls — we're done
          break;
        }

        // Execute each tool call
        const toolResults = [];
        for (const toolBlock of toolUseBlocks) {
          safeWrite(`data: ${JSON.stringify({ type: 'tool_start', name: toolBlock.name, id: toolBlock.id })}\n\n`);
          console.log(`Tool call: ${toolBlock.name}(${JSON.stringify(toolBlock.input)})`);

          try {
            const result = await executeTool(toolBlock.name, toolBlock.input);
            safeWrite(`data: ${JSON.stringify({ type: 'tool_result', name: toolBlock.name, id: toolBlock.id, result })}\n\n`);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result)
            });
          } catch (e) {
            console.error(`Tool error (${toolBlock.name}):`, e.message);
            safeWrite(`data: ${JSON.stringify({ type: 'tool_result', name: toolBlock.name, id: toolBlock.id, result: { error: e.message } })}\n\n`);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify({ error: e.message }),
              is_error: true
            });
          }
        }

        // Append assistant message (with tool_use blocks) + tool results for next round
        streamMessages.push({ role: 'assistant', content: finalMessage.content });
        streamMessages.push({ role: 'user', content: toolResults });
      }

      // Save assistant response (text portions only)
      if (fullResponse) {
        db.addMessage(convId, 'assistant', fullResponse, usedSources.length > 0 ? usedSources : null);
      }

      // Generate title in background (don't block the response)
      if (isNew) {
        generateTitle(message.trim()).then(title => {
          db.updateConversationTitle(convId, title);
          safeWrite(`data: ${JSON.stringify({ type: 'title', title })}\n\n`);
          safeWrite(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          safeEnd();
        }).catch(() => {
          safeWrite(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
          safeEnd();
        });
      } else {
        safeWrite(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        safeEnd();
      }
    } catch (error) {
      console.error('Stream error:', error.message, error.stack);
      safeWrite(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      safeEnd();
    }
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
