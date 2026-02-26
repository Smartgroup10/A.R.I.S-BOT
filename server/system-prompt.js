const fs = require('fs');
const path = require('path');

const PROMPT_PATH = path.join(__dirname, '..', 'system-prompt.md');

let cachedPrompt = null;

function loadSystemPrompt() {
  cachedPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  return cachedPrompt;
}

function getSystemPrompt(userContext) {
  const base = cachedPrompt || loadSystemPrompt();

  if (!userContext) return base;

  const contextBlock = `
---
## Contexto del usuario actual
- Nombre: ${userContext.name || 'No proporcionado'}
- Departamento: ${userContext.department || 'No proporcionado'}
- Sede: ${userContext.sede || 'No proporcionada'}
- Rol: ${userContext.role || 'No proporcionado'}
`;

  return base + contextBlock;
}

module.exports = { loadSystemPrompt, getSystemPrompt };
