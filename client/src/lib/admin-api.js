import { authHeaders, handleUnauthorized } from './api'

const API_BASE = '/api/admin'

export async function fetchAdminStats() {
  const res = await fetch(`${API_BASE}/stats`, { headers: authHeaders() })
  handleUnauthorized(res)
  return res.json()
}

export async function fetchAdminUsers() {
  const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() })
  handleUnauthorized(res)
  return res.json()
}

export async function createAdminUser(data) {
  const res = await fetch(`${API_BASE}/users`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Error creando usuario')
  }
  return res.json()
}

export async function fetchAdminUser(id) {
  const res = await fetch(`${API_BASE}/users/${id}`, { headers: authHeaders() })
  handleUnauthorized(res)
  return res.json()
}

export async function updateAdminUser(id, data) {
  const res = await fetch(`${API_BASE}/users/${id}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Error actualizando usuario')
  }
  return res.json()
}

export async function resetAdminUserPassword(id, password) {
  const res = await fetch(`${API_BASE}/users/${id}/password`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ password })
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Error reseteando contraseña')
  }
  return res.json()
}

export async function fetchRoleDefaults() {
  const res = await fetch(`${API_BASE}/sources/defaults`, { headers: authHeaders() })
  handleUnauthorized(res)
  return res.json()
}

export async function updateRoleDefaults(role, sources) {
  const res = await fetch(`${API_BASE}/sources/defaults/${role}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ sources })
  })
  handleUnauthorized(res)
  return res.json()
}

export async function fetchUserSourceAccess(userId) {
  const res = await fetch(`${API_BASE}/sources/user/${userId}`, { headers: authHeaders() })
  handleUnauthorized(res)
  return res.json()
}

export async function updateUserSourceOverrides(userId, sources) {
  const res = await fetch(`${API_BASE}/sources/user/${userId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ sources })
  })
  handleUnauthorized(res)
  return res.json()
}

export async function deleteAdminUser(id) {
  const res = await fetch(`${API_BASE}/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Error eliminando usuario')
  }
  return res.json()
}

export async function deleteUserSourceOverride(userId, sourceKey) {
  const res = await fetch(`${API_BASE}/sources/user/${userId}/${sourceKey}`, {
    method: 'DELETE',
    headers: authHeaders()
  })
  handleUnauthorized(res)
  return res.json()
}
