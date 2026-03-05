const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { EventEmitter } = require('events');

const PROVIDER = (process.env.AI_PROVIDER || 'claude').toLowerCase();

// --- Claude ---
let anthropic = null;
function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// --- OpenAI ---
let openaiClient = null;
function getOpenAI() {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// --- Groq (OpenAI-compatible) ---
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Stream chat via Claude
 */
function streamClaude(messages, systemPrompt, tools) {
  const opts = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages
  };
  if (tools && tools.length > 0) {
    opts.tools = tools;
  }
  const stream = getAnthropic().messages.stream(opts);
  return stream;
}

/**
 * Convert Claude tool definitions to OpenAI format
 */
function claudeToolsToOpenAI(tools) {
  return tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema
    }
  }));
}

/**
 * Convert Claude message history to OpenAI format.
 * Handles text, tool_use blocks, tool_result blocks, and image attachments.
 */
function claudeMessagesToOpenAI(messages, systemPrompt) {
  const result = [{ role: 'system', content: systemPrompt }];

  for (const msg of messages) {
    if (msg.role === 'user') {
      if (Array.isArray(msg.content)) {
        // Could be tool results or multimodal content
        const toolResults = msg.content.filter(b => b.type === 'tool_result');
        if (toolResults.length > 0) {
          // Tool results → one 'tool' message per result
          for (const block of toolResults) {
            result.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
            });
          }
        } else {
          // Multimodal content (text + images)
          const parts = [];
          for (const block of msg.content) {
            if (block.type === 'text') {
              parts.push({ type: 'text', text: block.text });
            } else if (block.type === 'image') {
              parts.push({
                type: 'image_url',
                image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` }
              });
            }
          }
          result.push({ role: 'user', content: parts });
        }
      } else {
        result.push({ role: 'user', content: msg.content });
      }
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.content)) {
        // Assistant with tool_use blocks
        let text = '';
        const toolCalls = [];
        for (const block of msg.content) {
          if (block.type === 'text') text += block.text;
          if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: {
                name: block.name,
                arguments: JSON.stringify(block.input)
              }
            });
          }
        }
        const assistantMsg = { role: 'assistant', content: text || null };
        if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
        result.push(assistantMsg);
      } else {
        result.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  return result;
}

/**
 * Stream chat via OpenAI (GPT-4o-mini, etc.) with full tool use support.
 * Returns an object compatible with Claude's stream interface: .on('text'), .finalMessage()
 */
function streamOpenAI(messages, systemPrompt, tools) {
  const emitter = new EventEmitter();

  let resolved = false;
  let _resolve = null;
  let _reject = null;
  let activeStream = null;
  let timeoutId = null;

  const finalPromise = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  function finish(msg) {
    if (resolved) return;
    resolved = true;
    if (timeoutId) clearTimeout(timeoutId);
    _resolve(msg);
  }

  function fail(err) {
    if (resolved) return;
    resolved = true;
    if (timeoutId) clearTimeout(timeoutId);
    _reject(err);
    emitter.emit('error', err);
  }

  // 2 minute timeout
  timeoutId = setTimeout(() => {
    fail(new Error('OpenAI stream timeout (120s)'));
    if (activeStream && activeStream.controller) {
      try { activeStream.controller.abort(); } catch {}
    }
  }, 120000);

  (async () => {
    try {
      const opts = {
        model: OPENAI_MODEL,
        max_tokens: 4096,
        stream: true,
        messages: claudeMessagesToOpenAI(messages, systemPrompt)
      };

      if (tools && tools.length > 0) {
        opts.tools = claudeToolsToOpenAI(tools);
      }

      activeStream = await getOpenAI().chat.completions.create(opts);

      let textContent = '';
      const toolCalls = {}; // keyed by index
      let finishReason = null;

      for await (const chunk of activeStream) {
        if (resolved) break; // aborted

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        if (choice.finish_reason) finishReason = choice.finish_reason;

        const delta = choice.delta;
        if (!delta) continue;

        // Text content
        if (delta.content) {
          textContent += delta.content;
          emitter.emit('text', delta.content);
        }

        // Tool call deltas
        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index;
            if (!toolCalls[idx]) {
              toolCalls[idx] = { id: '', name: '', arguments: '' };
            }
            if (tc.id) toolCalls[idx].id = tc.id;
            if (tc.function?.name) toolCalls[idx].name = tc.function.name;
            if (tc.function?.arguments) toolCalls[idx].arguments += tc.function.arguments;
          }
        }
      }

      if (resolved) return; // was aborted during stream

      // Build Claude-compatible finalMessage
      const content = [];
      if (textContent) content.push({ type: 'text', text: textContent });

      for (const idx of Object.keys(toolCalls).sort((a, b) => a - b)) {
        const tc = toolCalls[idx];
        let parsedInput = {};
        try {
          parsedInput = JSON.parse(tc.arguments || '{}');
        } catch (parseErr) {
          console.error(`Failed to parse tool args for ${tc.name}:`, tc.arguments);
          parsedInput = {};
        }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: parsedInput
        });
      }

      const finalMsg = {
        stop_reason: finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
        content: content.length > 0 ? content : [{ type: 'text', text: '' }]
      };

      finish(finalMsg);
      emitter.emit('end');
    } catch (e) {
      console.error('OpenAI stream error:', e.message);
      fail(e);
    }
  })();

  emitter.finalMessage = () => finalPromise;
  emitter.abort = () => {
    if (activeStream && activeStream.controller) {
      try { activeStream.controller.abort(); } catch {}
    }
    fail(new Error('Stream aborted'));
  };

  return emitter;
}

/**
 * Stream chat via Groq (OpenAI-compatible streaming)
 * Returns an EventEmitter with 'text', 'end', 'error' events (same interface as Claude)
 */
function streamGroq(messages, systemPrompt) {
  const emitter = new EventEmitter();

  let _resolve = null;
  let _reject = null;
  const finalPromise = new Promise((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  (async () => {
    try {
      const body = {
        model: GROQ_MODEL,
        max_tokens: 4096,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      };

      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Groq API ${res.status}: ${errText}`);
        _reject(err);
        emitter.emit('error', err);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              emitter.emit('text', delta);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Groq doesn't support tools — return simple text response
      _resolve({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: fullText }]
      });
      emitter.emit('end');
    } catch (e) {
      _reject(e);
      emitter.emit('error', e);
    }
  })();

  emitter.finalMessage = () => finalPromise;
  emitter.abort = () => { /* Groq streams auto-close */ };

  return emitter;
}

/**
 * Stream a chat response from the configured AI provider.
 */
function streamChat(messages, systemPrompt, tools) {
  if (PROVIDER === 'groq') {
    return streamGroq(messages, systemPrompt);
  }
  if (PROVIDER === 'openai') {
    return streamOpenAI(messages, systemPrompt, tools);
  }
  return streamClaude(messages, systemPrompt, tools);
}

/**
 * Stream chat with vision support — OpenAI and Claude support vision natively.
 */
function streamChatWithVision(messages, systemPrompt) {
  if (PROVIDER === 'openai') {
    return streamOpenAI(messages, systemPrompt);
  }
  return streamClaude(messages, systemPrompt);
}

// --- Tool definitions ---

const CRM_TOOLS = [
  {
    name: 'search_crm_clients',
    description: 'Busca clientes en el CRM por nombre, teléfono o CIF. Usa esta herramienta SIEMPRE que necesites obtener el ID de un cliente para crear un ticket, o cuando el usuario pida buscar un cliente.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Texto de búsqueda: nombre del cliente, número de teléfono o CIF/NIF (ej: "Movistar", "912345678", "B12345678")'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'add_seguimiento_crm',
    description: 'Añade una nota al seguimiento interno de un ticket del CRM. Usa esta herramienta cuando el usuario pida agregar, apuntar o anotar algo en el seguimiento de un ticket.',
    input_schema: {
      type: 'object',
      properties: {
        ticket_id: {
          type: 'string',
          description: 'ID numérico del ticket (ej: "16806")'
        },
        text: {
          type: 'string',
          description: 'Texto a añadir al seguimiento interno. Debe incluir la fecha en formato DD/MM al inicio.'
        }
      },
      required: ['ticket_id', 'text']
    }
  },
  {
    name: 'create_crm_ticket',
    description: 'Crea un nuevo ticket en el CRM de ALPHA/JD Systems. SOLO usar cuando el usuario haya confirmado EXPLÍCITAMENTE que quiere crear el ticket. Antes de usar esta herramienta, SIEMPRE muestra un resumen de los datos y pide confirmación.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'integer',
          description: 'ID numérico del cliente en el CRM (OBLIGATORIO, debe ser > 0). Obtenerlo del contexto de búsqueda de clientes. Si no se conoce, PRIMERO busca al cliente por nombre, teléfono o CIF antes de crear el ticket.'
        },
        tema_id: {
          type: 'integer',
          description: 'ID del tema/tipo de ticket. Valores disponibles: 226=Centralita, 228=Conectividad, 225=Configuración endpoint, 227=Gestión de líneas móviles, 229=Equipos informáticos, 255=Instalación equipos, 232=Visita valoración/presupuesto, 175=General/Otros'
        },
        description: {
          type: 'string',
          description: 'Descripción detallada del problema o solicitud. Incluir toda la información relevante proporcionada por el usuario.'
        },
        fecha_limite: {
          type: 'string',
          description: 'Fecha límite en formato DD-MM-YYYY. Si el usuario no especifica, usar la fecha actual + 7 días.'
        },
        prioridad: {
          type: 'integer',
          description: 'Nivel de prioridad: 0=Normal (por defecto), 1=Urgente, 2=Muy urgente'
        },
        contacto: {
          type: 'string',
          description: 'Nombre de la persona de contacto (opcional)'
        },
        email: {
          type: 'string',
          description: 'Email de contacto (opcional)'
        },
        telefono: {
          type: 'string',
          description: 'Teléfono de contacto (opcional)'
        }
      },
      required: ['client_id', 'tema_id', 'description', 'fecha_limite']
    }
  },
  {
    name: 'send_email_client',
    description: 'Envía un correo electrónico a un cliente. Usar después de crear un ticket para notificar al cliente, o cuando el usuario pida enviar un email a alguien. SOLO usar cuando el usuario haya confirmado EXPLÍCITAMENTE que quiere enviar el correo.',
    input_schema: {
      type: 'object',
      properties: {
        to_email: {
          type: 'string',
          description: 'Dirección email del destinatario'
        },
        subject: {
          type: 'string',
          description: 'Asunto del correo'
        },
        body: {
          type: 'string',
          description: 'Cuerpo del mensaje en texto plano'
        }
      },
      required: ['to_email', 'subject', 'body']
    }
  },
  {
    name: 'reply_ticket_email',
    description: 'Responde al hilo de correo de un cliente en un ticket del CRM. Lee el hilo de emails del ticket, envía la respuesta por email al cliente y registra la acción en el seguimiento del ticket. SOLO usar cuando el usuario haya confirmado EXPLÍCITAMENTE que quiere enviar la respuesta.',
    input_schema: {
      type: 'object',
      properties: {
        ticket_id: {
          type: 'string',
          description: 'ID numérico del ticket al que se responde (ej: "16648")'
        },
        to_email: {
          type: 'string',
          description: 'Dirección email del destinatario (cliente). Si no se conoce, obtenerla del hilo de emails del ticket o del detalle del ticket.'
        },
        reply_text: {
          type: 'string',
          description: 'Texto de la respuesta al cliente. Debe ser profesional y conciso. NO incluir asunto ni firma, solo el cuerpo del mensaje.'
        }
      },
      required: ['ticket_id', 'to_email', 'reply_text']
    }
  }
];

function getToolDefinitions(sourceAccess) {
  const tools = [];
  if (sourceAccess && sourceAccess.crm) {
    tools.push(...CRM_TOOLS);
  }
  return tools;
}

/**
 * Generate a short title for a conversation.
 */
async function generateTitle(userMessage) {
  const prompt = `Genera un título corto (máximo 6 palabras, sin comillas) para una conversación que empieza con este mensaje:\n\n"${userMessage}"`;

  if (PROVIDER === 'groq') {
    const res = await fetch(`${GROQ_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 50,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!res.ok) throw new Error(`Groq API ${res.status}`);
    const data = await res.json();
    return data.choices[0].message.content.trim();
  }

  if (PROVIDER === 'openai') {
    const response = await getOpenAI().chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 50,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.choices[0].message.content.trim();
  }

  // Claude
  const response = await getAnthropic().messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [{ role: 'user', content: prompt }]
  });
  return response.content[0].text.trim();
}

function getProvider() {
  return PROVIDER;
}

module.exports = { streamChat, streamChatWithVision, generateTitle, getProvider, getToolDefinitions };
