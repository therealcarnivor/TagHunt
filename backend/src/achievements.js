import { db } from './db.js';

const FIVE_MINUTES = 5 * 60 * 1000;
const THIRTY_SECONDS = 30 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;
const THREE_MINUTES = 3 * 60 * 1000;
const FINAL_MINUTE = 60 * 1000;
const FINAL_TWO_MINUTES = 2 * 60 * 1000;

function settings() {
  return db.prepare('SELECT start_time AS startTime, end_time AS endTime FROM game_settings WHERE id = 1').get();
}

function data() {
  const finds = db.prepare(`
    SELECT player_id AS playerId, tag_id AS tagId, clues_used AS cluesUsed,
           CAST(strftime('%s', found_at) AS INTEGER) * 1000 AS foundMs
    FROM finds ORDER BY foundMs ASC, rowid ASC
  `).all();
  const byPlayer = new Map();
  for (const find of finds) {
    if (!byPlayer.has(find.playerId)) byPlayer.set(find.playerId, []);
    byPlayer.get(find.playerId).push(find);
  }
  return { finds, byPlayer };
}

function earliest(byPlayer, predicate) {
  let winner = null;
  for (const [playerId, finds] of byPlayer) {
    const foundMs = predicate(finds);
    if (foundMs !== null && (!winner || foundMs < winner.foundMs)) winner = { playerId, foundMs };
  }
  return winner?.playerId ?? null;
}

function firstFind(finds, predicate) {
  for (let index = 0; index < finds.length; index++) {
    if (predicate(finds[index], index)) return finds[index].playerId;
  }
  return null;
}

function firstThreeWindow(byPlayer, predicate, windowMs) {
  return earliest(byPlayer, (finds) => {
    for (let index = 0; index + 2 < finds.length; index++) {
      const window = finds.slice(index, index + 3);
      if (window[2].foundMs - window[0].foundMs <= windowMs && predicate(window)) return window[2].foundMs;
    }
    return null;
  });
}

function allTags(byPlayer, totalTags) {
  if (!totalTags) return null;
  return earliest(byPlayer, (finds) => finds.length === totalTags ? finds.at(-1).foundMs : null);
}

function allRooms(byPlayer, roomByTag, totalRooms) {
  if (!totalRooms) return null;
  return earliest(byPlayer, (finds) => {
    const rooms = new Set();
    for (const find of finds) {
      const room = roomByTag.get(find.tagId);
      if (room) rooms.add(room);
      if (rooms.size === totalRooms) return find.foundMs;
    }
    return null;
  });
}

function allGold(byPlayer, goldTags) {
  if (!goldTags.size) return null;
  return earliest(byPlayer, (finds) => {
    const gold = new Set();
    for (const find of finds) {
      if (goldTags.has(find.tagId)) gold.add(find.tagId);
      if (gold.size === goldTags.size) return find.foundMs;
    }
    return null;
  });
}

function consecutivePlayerSequence(finds, predicate, count) {
  let playerId = null;
  let length = 0;
  for (const find of finds) {
    if (find.playerId === playerId && predicate(find)) length += 1;
    else {
      playerId = find.playerId;
      length = predicate(find) ? 1 : 0;
    }
    if (length >= count) return { playerId, foundMs: find.foundMs };
  }
  return null;
}

function fastestSpeed(byPlayer) {
  let winner = null;
  for (const [playerId, finds] of byPlayer) {
    for (let index = 0; index + 2 < finds.length; index++) {
      const duration = finds[index + 2].foundMs - finds[index].foundMs;
      if (duration <= FIVE_MINUTES && (!winner || duration < winner.duration || (duration === winner.duration && finds[index + 2].foundMs < winner.foundMs))) {
        winner = { playerId, duration, foundMs: finds[index + 2].foundMs };
      }
    }
  }
  return winner?.playerId ?? null;
}

function lightningFinder(finds) {
  return firstFind(finds, (find, index) => finds.slice(0, index).some((previous) => previous.playerId !== find.playerId && previous.tagId === find.tagId && find.foundMs - previous.foundMs <= THIRTY_SECONDS));
}

function tagCollector(byPlayer, endMs) {
  if (endMs === null || Date.now() < endMs) return null;
  let winner = null;
  for (const [playerId, finds] of byPlayer) {
    const eligible = finds.filter((find) => find.foundMs <= endMs);
    const last = eligible.at(-1)?.foundMs ?? 0;
    if (!winner || eligible.length > winner.count || (eligible.length === winner.count && last < winner.last)) winner = { playerId, count: eligible.length, last };
  }
  return winner?.playerId ?? null;
}

function comeback(byPlayer, startMs, endMs) {
  if (startMs === null || endMs === null || Date.now() < endMs) return null;
  const halfway = startMs + (endMs - startMs) / 2;
  const ranking = (until) => [...byPlayer.keys()].sort((a, b) => byPlayer.get(b).filter((find) => find.foundMs <= until).length - byPlayer.get(a).filter((find) => find.foundMs <= until).length);
  const middleTop = new Set(ranking(halfway).slice(0, 3));
  return ranking(endMs).slice(0, 3).find((playerId) => !middleTop.has(playerId)) ?? null;
}

function secondChance(finds) {
  const hints = db.prepare('SELECT player_id AS playerId, tag_id AS tagId, used_at AS usedAt FROM hint_uses').all();
  return firstFind(finds, (find) => hints.some((hint) => hint.playerId !== find.playerId && hint.tagId === find.tagId && new Date(hint.usedAt).getTime() < find.foundMs));
}

function detective(finds) {
  const detailed = new Set(db.prepare('SELECT DISTINCT tag_id AS tagId FROM hint_uses WHERE stage >= 2').all().map((row) => row.tagId));
  const seen = new Set();
  for (const find of finds) {
    if (detailed.has(find.tagId) && !seen.has(find.tagId)) return find.playerId;
    seen.add(find.tagId);
  }
  return null;
}

export function computeAchievements() {
  const game = settings();
  const startMs = game.startTime ? new Date(game.startTime).getTime() : null;
  const endMs = game.endTime ? new Date(game.endTime).getTime() : null;
  const tags = db.prepare('SELECT id, room_id AS roomId, is_gold AS isGold FROM tags').all();
  const roomByTag = new Map(tags.map((tag) => [tag.id, tag.roomId]));
  const goldTags = new Set(tags.filter((tag) => tag.isGold).map((tag) => tag.id));
  const totalRooms = new Set(tags.map((tag) => tag.roomId).filter(Boolean)).size;
  const { finds, byPlayer } = data();
  const names = new Map(db.prepare('SELECT id, name FROM players').all().map((player) => [player.id, player.name]));
  const winnerName = (winnerId) => winnerId ? names.get(winnerId) ?? null : null;
  const early = (find, duration) => startMs !== null && find.foundMs >= startMs && find.foundMs - startMs <= duration;
  const hot = consecutivePlayerSequence(finds, () => true, 3);
  const goldRush = earliest(byPlayer, (entries) => {
    const result = consecutivePlayerSequence(entries, (find) => goldTags.has(find.tagId), 3);
    return result?.foundMs ?? null;
  });

  const results = [
    ['speedDemon', 'Speed Demon', '⚡', 'Scan 3 tags in under 5 minutes; the fastest qualifying player wins.', fastestSpeed(byPlayer)],
    ['masterHunter', 'Master Hunter', '🎯', 'Find every tag in the hunt.', allTags(byPlayer, tags.length)],
    ['firstFinder', 'First Finder', '🥇', 'Be first to scan a tag after the hunt begins.', firstFind(finds, (find) => startMs === null || find.foundMs >= startMs)],
    ['explorer', 'Explorer', '🧭', 'Find a tag in every room.', allRooms(byPlayer, roomByTag, totalRooms)],
    ['treasureHunter', 'Treasure Hunter', '💰', 'Find every gold-starred tag first.', allGold(byPlayer, goldTags)],
    ['hotStreak', 'Hot Streak', '🔥', 'Scan 3 tags in a row without another player scanning between them.', hot?.playerId ?? null],
    ['lightningFinder', 'Lightning Finder', '⚡', 'Find a tag within 30 seconds of another player finding it.', lightningFinder(finds)],
    ['sharpEyes', 'Sharp Eyes', '🕵️', 'Find a tag without using either hint.', firstFind(finds, (find) => !find.cluesUsed)],
    ['hintMaster', 'Hint Master', '💡', 'Find 5 tags after using only the room hint.', earliest(byPlayer, (entries) => entries.filter((find) => find.cluesUsed === 1).length >= 5 ? entries.at(-1).foundMs : null)],
    ['speedHunter', 'Speed Hunter', '🏃', 'Find 5 tags within the first 10 minutes of the hunt.', earliest(byPlayer, (entries) => { const matches = entries.filter((find) => early(find, TEN_MINUTES)); return matches.length >= 5 ? matches[4].foundMs : null; })],
    ['perfectStart', 'Perfect Start', '🎯', 'Scan 3 different tags within the first 3 minutes.', earliest(byPlayer, (entries) => { const matches = entries.filter((find) => early(find, THREE_MINUTES)).slice(0, 3); return matches.length === 3 && new Set(matches.map((find) => find.tagId)).size === 3 ? matches[2].foundMs : null; })],
    ['tagCollector', 'Tag Collector', '👑', 'Finish the hunt with the most tags scanned.', tagCollector(byPlayer, endMs)],
    ['goldRush', 'Gold Rush', '💎', 'Find 3 gold tags consecutively without a normal tag between them.', goldRush],
    ['secondChance', 'Second Chance', '🥈', 'Find a tag another player searched for but did not find.', secondChance(finds)],
    ['globeTrotter', 'Globe Trotter', '🗺️', 'Find tags in 3 different rooms within 5 minutes.', firstThreeWindow(byPlayer, (window) => new Set(window.map((find) => roomByTag.get(find.tagId)).filter(Boolean)).size >= 3, FIVE_MINUTES)],
    ['detective', 'Detective', '🔎', 'Be first to find a tag after its detailed hint was revealed.', detective(finds)],
    ['comebackKid', 'Comeback Kid', '🏆', 'Finish in the top 3 after not being top 3 halfway through.', comeback(byPlayer, startMs, endMs)],
    ['lastMinuteHero', 'Last Minute Hero', '⏰', 'Find a tag during the final minute.', firstFind(finds, (find) => endMs !== null && find.foundMs >= endMs - FINAL_MINUTE && find.foundMs <= endMs)],
    ['finalSprint', 'Final Sprint', '🚀', 'Scan at least 3 tags during the final 2 minutes.', earliest(byPlayer, (entries) => { if (endMs === null) return null; const matches = entries.filter((find) => find.foundMs >= endMs - FINAL_TWO_MINUTES && find.foundMs <= endMs); return matches.length >= 3 ? matches[2].foundMs : null; })],
    ['stealthHunter', 'Stealth Hunter', '🥷', 'Find 5 tags without being first to any of them.', earliest(byPlayer, (entries) => { const firstPlayers = new Map(); for (const find of finds) if (!firstPlayers.has(find.tagId)) firstPlayers.set(find.tagId, find.playerId); const matches = entries.filter((find) => firstPlayers.get(find.tagId) !== find.playerId); return matches.length >= 5 ? matches[4].foundMs : null; })],
  ];

  return results.map(([key, label, icon, description, winnerId]) => ({ key, label, icon, description, winnerId, winnerName: winnerName(winnerId) }));
}

export function progressForPlayer(playerId) {
  const game = settings();
  const startMs = game.startTime ? new Date(game.startTime).getTime() : null;
  const endMs = game.endTime ? new Date(game.endTime).getTime() : null;
  const tags = db.prepare('SELECT id, room_id AS roomId, is_gold AS isGold FROM tags').all();
  const roomByTag = new Map(tags.map((tag) => [tag.id, tag.roomId]));
  const goldTags = new Set(tags.filter((tag) => tag.isGold).map((tag) => tag.id));
  const { finds } = data();
  const playerFinds = finds.filter((find) => find.playerId === playerId);
  const allFinds = finds;
  const active = computeAchievements();
  const firstPlayers = new Map();
  for (const find of allFinds) if (!firstPlayers.has(find.tagId)) firstPlayers.set(find.tagId, find.playerId);
  const recent = playerFinds.filter((find) => startMs !== null && find.foundMs >= startMs);
  const progress = new Map();
  const set = (key, value) => progress.set(key, Math.max(0, Math.min(100, Math.round(value))));
  const maxStreak = (predicate) => {
    let current = 0;
    let best = 0;
    for (const find of playerFinds) {
      current = predicate(find) ? current + 1 : 0;
      best = Math.max(best, current);
    }
    return best;
  };

  set('speedDemon', playerFinds.reduce((best, _, index) => index >= 2 ? Math.max(best, playerFinds[index].foundMs - playerFinds[index - 2].foundMs <= FIVE_MINUTES ? 3 : 0) : best, 0) / 3 * 100);
  set('masterHunter', tags.length ? playerFinds.length / tags.length * 100 : 0);
  set('firstFinder', active.find((achievement) => achievement.key === 'firstFinder')?.winnerId ? 100 : 0);
  set('explorer', new Set(playerFinds.map((find) => roomByTag.get(find.tagId)).filter(Boolean)).size / Math.max(1, new Set(tags.map((tag) => tag.roomId).filter(Boolean)).size) * 100);
  set('treasureHunter', goldTags.size ? new Set(playerFinds.filter((find) => goldTags.has(find.tagId)).map((find) => find.tagId)).size / goldTags.size * 100 : 0);
  set('hotStreak', maxStreak(() => true) / 3 * 100);
  set('lightningFinder', playerFinds.some((find, index) => allFinds.slice(0, allFinds.indexOf(find)).some((previous) => previous.playerId !== playerId && previous.tagId === find.tagId && find.foundMs - previous.foundMs <= THIRTY_SECONDS)) ? 100 : 0);
  set('sharpEyes', playerFinds.some((find) => !find.cluesUsed) ? 100 : 0);
  set('hintMaster', playerFinds.filter((find) => find.cluesUsed === 1).length / 5 * 100);
  set('speedHunter', recent.filter((find) => find.foundMs - startMs <= TEN_MINUTES).length / 5 * 100);
  set('perfectStart', new Set(recent.filter((find) => find.foundMs - startMs <= THREE_MINUTES).map((find) => find.tagId)).size / 3 * 100);
  set('tagCollector', playerFinds.length ? 100 : 0);
  set('goldRush', maxStreak((find) => goldTags.has(find.tagId)) / 3 * 100);
  set('secondChance', playerFinds.some((find) => db.prepare('SELECT 1 FROM hint_uses WHERE tag_id = ? AND player_id != ? AND used_at < datetime(?, \'unixepoch\')').get(find.tagId, playerId, Math.floor(find.foundMs / 1000))) ? 100 : 0);
  set('globeTrotter', (() => { for (let index = 0; index + 2 < playerFinds.length; index++) { const window = playerFinds.slice(index, index + 3); if (window[2].foundMs - window[0].foundMs <= FIVE_MINUTES) return new Set(window.map((find) => roomByTag.get(find.tagId)).filter(Boolean)).size / 3 * 100; } return 0; })());
  set('detective', playerFinds.some((find) => db.prepare('SELECT 1 FROM hint_uses WHERE tag_id = ? AND stage >= 2 AND used_at < datetime(?, \'unixepoch\')').get(find.tagId, Math.floor(find.foundMs / 1000))) ? 100 : 0);
  set('comebackKid', endMs !== null && Date.now() >= endMs ? 100 : 0);
  set('lastMinuteHero', playerFinds.some((find) => endMs !== null && find.foundMs >= endMs - FINAL_MINUTE && find.foundMs <= endMs) ? 100 : 0);
  set('finalSprint', endMs !== null ? playerFinds.filter((find) => find.foundMs >= endMs - FINAL_TWO_MINUTES && find.foundMs <= endMs).length / 3 * 100 : 0);
  set('stealthHunter', playerFinds.filter((find) => firstPlayers.get(find.tagId) !== playerId).length / 5 * 100);

  return active.map((achievement) => ({ ...achievement, progress: progress.get(achievement.key) || 0 }));
}
