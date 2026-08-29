import { EventEmitter } from 'node:events';

// Lets the tags route notify any open leaderboard SSE streams of a new find.
export const leaderboardEvents = new EventEmitter();

export function notifyLeaderboardChanged() {
  leaderboardEvents.emit('change');
}
