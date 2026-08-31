// Shared allow-list of silly avatar emoji, validated server-side so the DB
// only ever stores one of these (never arbitrary client-supplied text).
export const AVATAR_OPTIONS = [
  '🦄', '🐵', '🦖', '🤡', '🥷', '👽', '🧟', '🦸', '🐸', '🦁',
  '🐙', '🦊', '🐼', '🦀', '🐧', '🍕', '🌮', '👾', '🤖', '🧙',
  '🎉', '🥳', '🎈', '🍩', '🍭', '🍦', '🍿', '🎮', '🎸', '🦩',
  '🐨', '🐯', '🐶', '🐱', '🐰', '🦋', '🌈', '⭐', '🍀', '🚀',
];

export function isValidAvatar(value) {
  return typeof value === 'string' && AVATAR_OPTIONS.includes(value);
}

export function randomAvatar() {
  return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
}

// Picks a random avatar not already taken by another player. Falls back to
// any avatar (allowing a rare duplicate) if every option is already in use.
export function randomAvailableAvatar(takenAvatars) {
  const available = AVATAR_OPTIONS.filter((a) => !takenAvatars.includes(a));
  const pool = available.length > 0 ? available : AVATAR_OPTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}
