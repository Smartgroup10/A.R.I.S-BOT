const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

/**
 * Stream a chat response from Claude.
 * @param {Array} messages - Array of { role, content } objects
 * @param {string} systemPrompt - The system prompt
 * @param {object} [options] - Optional: context for RAG (future)
 * @returns {AsyncIterable} Stream of text deltas
 */
async function streamChat(messages, systemPrompt, options = {}) {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    }))
  });

  return stream;
}

/**
 * Generate a short title for a conversation based on the first message.
 */
async function generateTitle(userMessage) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: `Genera un título corto (máximo 6 palabras, sin comillas) para una conversación que empieza con este mensaje:\n\n"${userMessage}"`
      }
    ]
  });

  return response.content[0].text.trim();
}

module.exports = { streamChat, generateTitle };
