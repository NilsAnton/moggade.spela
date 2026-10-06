// Databas: konton och inloggningar. SQLite – en enda fil, inbyggt i Node (node:sqlite).
// Filen ligger i DATA_DIR (i Docker: en volym, så att den överlever uppdateringar).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { freshProfile, cleanProfile, levelInfo } from '../public/js/progress.js';

const SESSION_DAYS = 30;

export function openDb(dir) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'lockdown.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      discord_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      created INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      xp INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS users_xp ON users (xp DESC);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
  `);
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());

  const q = {
    byDiscord: db.prepare('SELECT * FROM users WHERE discord_id = ?'),
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    insert: db.prepare('INSERT INTO users (discord_id, name, avatar, created, last_seen, data) VALUES (?, ?, ?, ?, ?, ?)'),
    touch: db.prepare('UPDATE users SET name = ?, avatar = ?, last_seen = ? WHERE id = ?'),
    save: db.prepare('UPDATE users SET xp = ?, data = ?, last_seen = ? WHERE id = ?'),
    top: db.prepare('SELECT name, avatar, xp, data FROM users ORDER BY xp DESC LIMIT ?'),
    newSession: db.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)'),
    session: db.prepare('SELECT user_id FROM sessions WHERE token_hash = ? AND expires > ?'),
    endSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
  };

  const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

  // data-kolumnen är JSON så att det är lätt att lägga till nya saker utan att ändra tabellen
  function parse(row) {
    if (!row) return null;
    let data = {};
    try { data = JSON.parse(row.data); } catch {}
    return {
      id: row.id, name: row.name, avatar: row.avatar,
      prof: cleanProfile(data.prof ?? freshProfile()),
      sel: data.sel ?? {},
      imported: !!data.imported,
    };
  }

  return {
    // Hittar eller skapar kontot för en Discord-användare
    upsertDiscordUser(discordId, name, avatar) {
      const now = Date.now();
      const row = q.byDiscord.get(discordId);
      if (row) {
        q.touch.run(name, avatar, now, row.id);
        return row.id;
      }
      const data = JSON.stringify({ prof: freshProfile(), sel: {} });
      return Number(q.insert.run(discordId, name, avatar, now, now, data).lastInsertRowid);
    },

    getUser(id) {
      return parse(q.byId.get(id));
    },

    saveUser(user) {
      const data = JSON.stringify({ prof: user.prof, sel: user.sel, imported: user.imported });
      q.save.run(user.prof.xp, data, Date.now(), user.id);
    },

    top(n = 10) {
      return q.top.all(n).map((r) => {
        let sel = {};
        try { sel = JSON.parse(r.data).sel ?? {}; } catch {}
        return { name: sel.name || r.name, avatar: r.avatar, xp: r.xp, lvl: levelInfo(r.xp).lvl, title: sel.title ?? '' };
      });
    },

    createSession(userId) {
      const token = crypto.randomBytes(32).toString('base64url');
      q.newSession.run(hash(token), userId, Date.now() + SESSION_DAYS * 864e5);
      return { token, maxAge: SESSION_DAYS * 86400 };
    },

    sessionUser(token) {
      if (!token) return null;
      const row = q.session.get(hash(token), Date.now());
      return row ? row.user_id : null;
    },

    endSession(token) {
      if (token) q.endSession.run(hash(token));
    },
  };
}
