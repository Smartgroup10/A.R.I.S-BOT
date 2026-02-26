const API_BASE = '/api';

export function authHeaders() {
  const token = localStorage.getItem('authToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export function handleUnauthorized(res) {
  if (res.status === 401) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.reload();
    throw new Error('Sesión expirada');
  }
  if (!res.ok) {
    // Avoid parsing non-JSON error responses
    throw new Error(`Error ${res.status}`);
  }
}

// --- Auth API ---

export async function apiRegister({ email, name, password, department, sede }) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password, department, sede })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en registro');
  return data;
}

export async function apiLogin({ email, password }) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en login');
  return data;
}

export async function apiGetMe() {
  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: authHeaders()
  });
  if (!res.ok) {
    throw new Error('No autenticado');
  }
  return res.json();
}

// --- Conversations API ---

export async function fetchConversations() {
  const res = await fetch(`${API_BASE}/conversations`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

export async function fetchMessages(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/${conversationId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  handleUnauthorized(res);
  return res.json();
}

// --- Chat API ---

export function sendMessage({ conversationId, message, attachments }, { onDelta, onDone, onConversationId, onTitle, onHistoryUsed, onError }) {
  const controller = new AbortController();

  fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ conversationId, message, attachments }),
    signal: controller.signal
  })
    .then(async (response) => {
      if (response.status === 401) {
        handleUnauthorized(response);
        onError?.('Sesión expirada');
        return;
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        onError?.(err.error || 'Request failed');
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);

            switch (data.type) {
              case 'conversation_id':
                onConversationId?.(data.id);
                break;
              case 'delta':
                onDelta?.(data.text);
                break;
              case 'title':
                onTitle?.(data.title);
                break;
              case 'history_used':
                onHistoryUsed?.();
                break;
              case 'done':
                onDone?.();
                break;
              case 'error':
                onError?.(data.message);
                break;
            }
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.(err.message);
      }
    });

  return () => controller.abort();
}

// --- Feedback API ---

export async function sendFeedback(conversationId, messageId, rating) {
  const res = await fetch(`${API_BASE}/conversations/feedback`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ conversationId, messageId, rating })
  });
  handleUnauthorized(res);
  return res.json();
}

export async function fetchFeedback(conversationId) {
  const res = await fetch(`${API_BASE}/conversations/feedback/${conversationId}`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

export async function fetchFeedbackStats() {
  const res = await fetch(`${API_BASE}/conversations/feedback/stats`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

// --- File Upload API ---

export async function uploadFile(file) {
  const token = localStorage.getItem('authToken');
  const formData = new FormData();
  formData.append('file', file);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/chat/upload`, {
    method: 'POST',
    headers,
    body: formData
  });
  handleUnauthorized(res);
  return res.json();
}

// --- Knowledge Base API ---

export async function fetchKnowledgeStats() {
  const res = await fetch(`${API_BASE}/knowledge/stats`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

export async function fetchKnowledgeDocs() {
  const res = await fetch(`${API_BASE}/knowledge/documents`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

export async function uploadDocuments(files) {
  const token = localStorage.getItem('authToken');
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/knowledge/upload`, {
    method: 'POST',
    headers,
    body: formData
  });
  handleUnauthorized(res);
  return res.json();
}

export async function reindexKnowledge() {
  const res = await fetch(`${API_BASE}/knowledge/reindex`, { method: 'POST', headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

export async function deleteDocument(filename) {
  const res = await fetch(`${API_BASE}/knowledge/documents/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  handleUnauthorized(res);
  return res.json();
}

// --- Profile API ---

export async function updateProfile(data) {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Error actualizando perfil');
  }
  return res.json();
}

export async function changePassword({ currentPassword, newPassword }) {
  const res = await fetch(`${API_BASE}/auth/me/password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Error cambiando contraseña');
  }
  return res.json();
}

export async function getPreferences() {
  const res = await fetch(`${API_BASE}/auth/me/preferences`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}

export async function updatePreferences(data) {
  const res = await fetch(`${API_BASE}/auth/me/preferences`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  handleUnauthorized(res);
  return res.json();
}

export async function uploadAvatar(file) {
  const token = localStorage.getItem('authToken');
  const formData = new FormData();
  formData.append('avatar', file);
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/auth/me/avatar`, {
    method: 'POST',
    headers,
    body: formData
  });
  handleUnauthorized(res);
  return res.json();
}

export async function getMySourceAccess() {
  const res = await fetch(`${API_BASE}/auth/me/sources`, { headers: authHeaders() });
  handleUnauthorized(res);
  return res.json();
}
