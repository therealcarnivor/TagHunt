const BASE = '/api';
const TOKEN_KEY = 'taghunt.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

export function register(username, password, name) {
  return request('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, name }) });
}

export function login(username, password) {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export function logout() {
  return request('/auth/logout', { method: 'POST' });
}

export function getMe() {
  return request('/auth/me');
}

export function changePassword(currentPassword, newPassword) {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function updateMe(body) {
  return request('/players/me', { method: 'PATCH', body: JSON.stringify(body) });
}

export function getAvatarOptions() {
  return request('/players/avatars');
}

export function getTagTotal() {
  return request('/tags');
}

export function getRoomsProgress() {
  return request('/tags/rooms-progress');
}

export function scanTag(tagId) {
  return request(`/tags/${encodeURIComponent(tagId)}/scan`, { method: 'POST' });
}

export function getHint() {
  return request('/tags/hint');
}

export function getFoundTags() {
  return request('/tags/found');
}

export function getLeaderboard() {
  return request('/leaderboard');
}

export function getGameSettings() {
  return request('/game');
}

export function getAchievements() {
  return request('/achievements');
}

export function adminRequest(path, options = {}) {
  return request(`/admin${path}`, options);
}
