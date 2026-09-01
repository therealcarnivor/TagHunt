import { useEffect, useState } from 'react';
import { adminRequest } from '../api.js';

export default function Help() {
  const [settings, setSettings] = useState({
    noCluePoints: 3,
    oneCluePoints: 2,
    twoCluePoints: 1,
    triplePointsMins: 30,
  });

  useEffect(() => {
    let mounted = true;
    adminRequest('/settings')
      .then((data) => {
        if (!mounted) return;
        setSettings({
          noCluePoints: data.noCluePoints ?? 3,
          oneCluePoints: data.oneCluePoints ?? 2,
          twoCluePoints: data.twoCluePoints ?? 1,
          triplePointsMins: data.triplePointsMins ?? 30,
        });
      })
      .catch(() => {
        // Keep the built-in defaults if the settings request fails.
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="card help-card">
      <h1>How to play 🔎</h1>

      <section className="help-section">
        <h2>The basics</h2>
        <p>
          Create an account with a username and password, then go find the
          hidden tags around the house. Scanning a tag with your phone (NFC tap
          or QR code) records it as found and adds it to your progress.
        </p>
        <p>
          Your progress is tied to your account, so you can sign in on any
          device or browser and pick up exactly where you left off. If you
          forget your password, ask an admin to reset it for you.
        </p>
      </section>

      <section className="help-section">
        <h2>Hints</h2>
        <p>
          Stuck? Tap <strong>"Get a hint 💡"</strong> on the home page and you'll be
          told which <strong>room</strong> to search. If that isn't enough, tap
          <strong> "Need more detail?"</strong> on that clue to reveal exactly where
          it's hidden.
        </p>
        <p>
          Clues stay on your home page until you find that tag, and they're
          grouped by room. If you want to give up on one for now, tap
          <strong> "Get a clue for another tag"</strong> — your existing clues are
          kept so you can come back to them later.
        </p>
        <p>
          Each clue costs you points when you finally find the tag, so try to
          use as few as you can.
        </p>
      </section>

      <section className="help-section">
        <h2>Scoring</h2>
        <ul>
          <li>
            A tag found with <strong>no clues</strong> is worth <strong>{settings.noCluePoints} point{settings.noCluePoints === 1 ? '' : 's'}</strong>.
          </li>
          <li>
            A tag found after using its room clue is worth <strong>{settings.oneCluePoints} point{settings.oneCluePoints === 1 ? '' : 's'}</strong>.
          </li>
          <li>
            A tag found after using both clues is worth <strong>{settings.twoCluePoints} point{settings.twoCluePoints === 1 ? '' : 's'}</strong>.
          </li>
          {settings.triplePointsMins > 0 && (
            <li>
              Tags scanned in the <strong>last {settings.triplePointsMins} minute{settings.triplePointsMins === 1 ? '' : 's'}</strong> before the hunt's
              end time are worth <strong>triple points</strong>.
            </li>
          )}
          <li>
            The <strong>very last tag</strong> collected before time runs out (or
            the one that completes the whole hunt) is worth <strong>10 points</strong>.
          </li>
        </ul>
        <p>Check the leaderboard any time to see everyone's score and progress.</p>
      </section>

      <section className="help-section">
        <h2>Achievements 🌟</h2>
        <ul>
          <li>
            <strong>⚡ Speed Demon</strong> — scan 3 tags in under 5 minutes. If more
            than one player manages it, whoever did it fastest wins.
          </li>
          <li>
            <strong>🎯 Master Hunter</strong> — find every tag in the hunt.
          </li>
          <li>
            <strong>🥇 First Finder</strong> — be the very first player to scan a
            tag once the hunt begins.
          </li>
          <li>
            <strong>🧭 Explorer</strong> — find at least one tag in every room used
            by the hunt.
          </li>
          <li>
            <strong>💰 Treasure Hunter</strong> — be the first to find every
            gold-starred ⭐ tag.
          </li>
          <li><strong>🔥 Hot Streak</strong> — scan 3 tags in a row without another player scanning between them.</li>
          <li><strong>⚡ Lightning Finder</strong> — find a tag within 30 seconds of another player finding it.</li>
          <li><strong>🕵️ Sharp Eyes</strong> — find a tag without using either hint.</li>
          <li><strong>💡 Hint Master</strong> — find 5 tags after using only room hints, never detailed hints.</li>
          <li><strong>🏃 Speed Hunter</strong> — find 5 tags within the first 10 minutes.</li>
          <li><strong>🎯 Perfect Start</strong> — scan 3 different tags within the first 3 minutes.</li>
          <li><strong>👑 Tag Collector</strong> — finish with the most tags scanned.</li>
          <li><strong>💎 Gold Rush</strong> — find 3 gold tags consecutively without a normal tag between them.</li>
          <li><strong>🥈 Second Chance</strong> — find a tag another player searched for but did not find.</li>
          <li><strong>🗺️ Globe Trotter</strong> — find tags in 3 different rooms within 5 minutes.</li>
          <li><strong>🔎 Detective</strong> — be first to find a tag after its detailed hint was revealed.</li>
          <li><strong>🏆 Comeback Kid</strong> — finish in the top 3 after not being top 3 halfway through.</li>
          <li><strong>⏰ Last Minute Hero</strong> — find a tag during the final minute.</li>
          <li><strong>🚀 Final Sprint</strong> — scan at least 3 tags during the final 2 minutes.</li>
          <li><strong>🥷 Stealth Hunter</strong> — find 5 tags without being first to any of them.</li>
        </ul>
        <p>See who currently holds each achievement at the bottom of the leaderboard.</p>
      </section>

      <section className="help-section">
        <h2>Timing</h2>
        <p>
          If the host has set a start/end time, the home page shows a countdown.
          Scans outside that window don't count. The hunt also auto-locks the
          moment someone finds every tag — nobody can score any more after that.
        </p>
      </section>
    </div>
  );
}
