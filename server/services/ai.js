const Anthropic = require('@anthropic-ai/sdk');
const { EventEmitter } = require('events');

const PROVIDER = (process.env.AI_PROVIDER || 'claude').toLowerCase();

// --- Claude ---
let anthropic = null;
function getAnthropic() {
  if (!anthropic) anthropic = new Anthropic();
  return anthropic;
}

// --- Groq (OpenAI-compatible) ---
const GROQ_BASE = 'https://api.groq.com/openai/v1';
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Stream chat via Claude
 */
function streamClaude(messages, systemPrompt) {
  const stream = getAnthropic().messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages
  });
  return stream;
}

/**
 * Stream chat via Groq (OpenAI-compatible streaming)
 * Returns an EventEmitter with 'text', 'end', 'error' events (same interface as Claude)
 */
function streamGroq(messages, systemPrompt) {
  const emitter = new EventEmitter();

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
        emitter.emit('error', new Error(`Groq API ${res.status}: ${errText}`));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
              emitter.emit('text', delta);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      emitter.emit('end');
    } catch (e) {
      emitter.emit('error', e);
    }
  })();

  // Add abort method for compatibility
  emitter.abort = () => { /* Groq streams auto-close */ };

  return emitter;
}

/**
 * Stream a chat response from the configured AI provider.
 */
function streamChat(messages, systemPrompt) {
  if (PROVIDER === 'groq') {
    return streamGroq(messages, systemPrompt);
  }
  return streamClaude(messages, systemPrompt);
}

/**
 * Stream chat with vision support — always uses Claude (Groq doesn't support vision).
 */
function streamChatWithVision(messages, systemPrompt) {
  return streamClaude(messages, systemPrompt);
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

module.exports = { streamChat, streamChatWithVision, generateTitle, getProvider };
