const db = require('../db');

/**
 * Save a knowledge article to the internal knowledge base.
 */
function saveKnowledge({ title, problem, solution, keywords, sourceTickets }) {
  const id = db.addKnowledgeArticle(title, problem, solution, keywords, sourceTickets || '', 'ARIA');
  console.log(`Knowledge: saved article #${id} — "${title}"`);
  return { success: true, id, title };
}

/**
 * Search the knowledge base and return matching articles.
 */
function searchKnowledge(query, limit = 5) {
  const results = db.searchKnowledgeBase(query, limit);
  // Increment usage for returned results
  for (const r of results) {
    db.incrementKnowledgeUsage(r.id);
  }
  return results;
}

/**
 * Build knowledge base context for the AI system prompt.
 * Returns formatted context string or null if no results.
 */
function getKnowledgeContext(message) {
  const results = searchKnowledge(message, 5);
  if (results.length === 0) return null;

  let context = '\n---\n## Base de Conocimiento Interna\n\n';
  context += `Se encontraron **${results.length} artículo(s)** relevantes en la base de conocimiento:\n\n`;

  for (const r of results) {
    context += `### KB #${r.id}: ${r.title}\n`;
    context += `- **Problema:** ${r.problem.substring(0, 500)}\n`;
    context += `- **Solución:** ${r.solution.substring(0, 800)}\n`;
    if (r.source_tickets) context += `- **Tickets relacionados:** ${r.source_tickets}\n`;
    context += `- **Usado ${r.times_used} vez(es)** | Creado por: ${r.created_by}\n\n`;
  }

  context += `## INSTRUCCIONES PARA BASE DE CONOCIMIENTO (OBLIGATORIO):\n`;
  context += `1. Si un artículo de la KB coincide con el problema del usuario, **úsalo como fuente principal**.\n`;
  context += `2. Cita la fuente: "Según nuestra base de conocimiento (KB #X)..."\n`;
  context += `3. Si la solución de la KB resuelve el problema, sugiérela directamente.\n`;
  context += `4. Después de resolver una incidencia con éxito, **sugiere al usuario guardar la solución** en la KB si no existe ya.\n`;
  context += `---\n`;

  return context;
}

module.exports = {
  saveKnowledge,
  searchKnowledge,
  getKnowledgeContext
};
