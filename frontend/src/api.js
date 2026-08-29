const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function createPlayer(name) {
  return request('/players', { method: 'POST', body: JSON.stringify({ name }) });
}

export function getPlayer(id) {
  return request(`/players/${id}`);
}

export function renamePlayer(id, name) {
  return request(`/players/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
}

export function updatePlayerAvatar(id, avatar) {
  return request(`/players/${id}`, { method: 'PATCH', body: JSON.stringify({ avatar }) });
}

export function getAvatarOptions(playerId) {
  const suffix = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
  return request(`/players/avatars${suffix}`);
}

export function getTagTotal() {
  return request('/tags');
}

export function getRoomsProgress(playerId) {
  const suffix = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
  return request(`/tags/rooms-progress${suffix}`);
}

export function scanTag(tagId, playerId) {
  return request(`/tags/${encodeURIComponent(tagId)}/scan`, {
    method: 'POST',
    body: JSON.stringify({ playerId }),
  });
}

export function getHint(playerId) {
  return request(`/tags/hint?playerId=${encodeURIComponent(playerId)}`);
}

export function getFoundTags(playerId) {
  return request(`/tags/found?playerId=${encodeURIComponent(playerId)}`);
}

export function getLeaderboard() {
  return request('/leaderboard');
}

export function getGameSettings() {
  return request('/game');
}

export function getAchievements(playerId) {
  const suffix = playerId ? `?playerId=${encodeURIComponent(playerId)}` : '';
  return request(`/achievements${suffix}`);
}

export function adminRequest(path, adminKey, options = {}) {
  return request(`/admin${path}`, {
    ...options,
    headers: { 'x-admin-key': adminKey, ...(options.headers || {}) },
  });
}
