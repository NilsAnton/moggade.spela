import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { MAPS } from '../public/js/maps.js';
import { WEAPONS, GUNGAME, damageAt } from '../public/js/weapons.js';
import { CHARACTERS, SLAM, STIM_HP, ARMOR } from '../public/js/characters.js';
import { makeSolids, rayBox, hitboxes, PLAYER } from '../public/js/physics.js';
import { BOT_NAMES, newBrain, botSpawned, botThink, botHurt } from './bots.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const PORT = Number(process.env.PORT) || 3000;
const KILL_LIMIT = Number(process.env.KILL_LIMIT) || 25;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 16;
const ROUND_MS = (Number(process.env.ROUND_MINUTES) || 8) * 60000;

const TICK_MS = 50;
const RESPAWN_MS = 3000;
const PROTECT_MS = 1500;
const RANGE = 300;
const INTERP_MS = 100;
const HISTORY_MS = 1000;
const ROUND_PAUSE_MS = 10000;
const BOT_COUNT = Number(process.env.BOTS ?? 0); // 0 = inga bottar som standard
const BOT_SKILL = ['easy', 'normal', 'hard'].includes(process.env.BOT_SKILL) ? process.env.BOT_SKILL : 'normal';
const COLORS = ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff', '#ff8fab', '#f77f00', '#e9ecef'];

// ---------- hjälpfunktioner ----------
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const charIndex = (c) => (Number.isInteger(c) && CHARACTERS[c] ? c : 0);

function send(p, msg) {
  if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}

function vec3(a) {
  if (!Array.isArray(a) || a.length !== 3) return null;
  const v = a.map(Number);
  return v.every(Number.isFinite) ? v : null;
}

function cleanName(n, id) {
  const s = String(n ?? '').replace(/[^\p{L}\p{N} _\-]/gu, '').trim().slice(0, 16);
  return s || `Spelare${id}`;
}

let nextId = 1;

// Ett rum per spelläge – egna spelare, egen bana, egna rundor.
class Room {
  constructor(mode) {
    this.mode = mode;
    this.gungame = mode === 'gungame';
    this.players = new Map();
    this.mapIndex = this.gungame ? 1 : 0;
    this.map = MAPS[this.mapIndex];
    this.solids = makeSolids(this.map.boxes);
    this.roundEndsAt = 0;
    this.roundStartedAt = Date.now();
  }

  roundLeft() {
    return Math.max(0, ROUND_MS - (Date.now() - this.roundStartedAt));
  }

  broadcast(msg, except) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(data);
  }

  sendRoster() {
    this.broadcast({
      t: 'roster',
      killLimit: KILL_LIMIT,
      list: [...this.players.values()].map((p) => ({
        id: p.id, name: p.name, color: p.color, k: p.kills, d: p.deaths, ping: p.bot ? 0 : Math.round(p.rtt),
        w: p.weapon, c: p.char, lvl: p.level, bot: p.bot ? 1 : 0, r: p.rank,
      })),
    });
  }

  // vilket vapen spelaren ska ha just nu
  weaponFor(p) {
    return this.gungame ? GUNGAME[p.level].w : CHARACTERS[p.char].weapon;
  }

  join(ws, m) {
    if (this.players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: 'full' }));
      ws.close();
      return null;
    }
    const id = nextId++;
    const ch = charIndex(m.c);
    const p = {
      id, ws,
      name: cleanName(m.name, id),
      rank: clamp(Math.floor(Number(m.rank) || 1), 1, 999),
      color: COLORS.includes(m.color) ? m.color : COLORS[id % COLORS.length],
      char: ch, nextChar: ch, weapon: 0, maxHp: CHARACTERS[ch].hp, level: 0, levelKills: 0,
      lastAbility: 0, sl: 0, vote: -1,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0,
      hp: 0, alive: false, sp: 0, kills: 0, deaths: 0, streak: 0,
      lastShot: 0, rtt: 80, respawnAt: 0, protectUntil: 0, hist: [],
    };
    p.weapon = this.weaponFor(p);
    this.players.set(id, p);
    send(p, {
      t: 'welcome', id, mode: this.mode, killLimit: KILL_LIMIT, map: this.mapIndex,
      left: this.roundLeft(), roundOver: this.roundEndsAt > 0,
    });
    if (!this.roundEndsAt) this.spawn(p);
    this.sendRoster();
    this.broadcast({ t: 'msg', text: `${p.name} anslöt` }, p);
    return p;
  }

  // Är du ensam i rummet fylls det på med bottar; kommer det fler människor försvinner de.
  manageBots() {
    const all = [...this.players.values()];
    const humans = all.filter((p) => !p.bot).length;
    const bots = all.filter((p) => p.bot);
    // fyll upp så att det alltid finns minst BOT_COUNT + 1 spelare så länge någon människa är inne
    const want = humans > 0 ? Math.max(0, BOT_COUNT + 1 - humans) : 0;
    if (bots.length < want) this.addBot(bots.length);
    else if (bots.length > want) this.leave(bots[bots.length - 1]);
  }

  addBot(n) {
    const id = nextId++;
    const ch = Math.floor(Math.random() * CHARACTERS.length);
    const p = {
      id, ws: { readyState: 0, send() {} }, bot: newBrain(BOT_SKILL), rank: 1 + Math.floor(Math.random() * 25),
      name: `BOT ${BOT_NAMES[(id + n) % BOT_NAMES.length]}`,
      color: COLORS[(id * 3) % COLORS.length],
      char: ch, nextChar: ch, weapon: 0, maxHp: CHARACTERS[ch].hp, level: 0, levelKills: 0,
      lastAbility: 0, sl: 0, vote: -1,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0,
      hp: 0, alive: false, sp: 0, kills: 0, deaths: 0, streak: 0,
      // negativ rtt => lag-kompensationen spolar inte tillbaka för bottar
      lastShot: 0, rtt: -2 * INTERP_MS, respawnAt: 0, protectUntil: 0, hist: [],
    };
    p.weapon = this.weaponFor(p);
    this.players.set(id, p);
    if (!this.roundEndsAt) this.spawn(p);
    this.sendRoster();
  }

  leave(p) {
    this.players.delete(p.id);
    this.broadcast({ t: 'leave', id: p.id });
    this.broadcast({ t: 'msg', text: `${p.name} lämnade` });
    this.sendRoster();
  }

  message(p, m) {
    switch (m.t) {
      case 'st': this.onState(p, m); break;
      case 'sh': this.onShoot(p, m); break;
      case 'loadout': p.nextChar = charIndex(m.c); break;
      case 'ab': this.onAbility(p); break;
      case 'vote': this.onVote(p, m); break;
      case 'pong': if (Number.isFinite(m.s)) p.rtt = clamp(Date.now() - m.s, 0, 1000); break;
    }
  }

  spawn(p) {
    const { map } = this;
    const others = [...this.players.values()].filter((q) => q !== p && q.alive);
    let best = map.spawns[Math.floor(Math.random() * map.spawns.length)];
    if (others.length) {
      let bestD = -1;
      for (const s of map.spawns) {
        let d = Infinity;
        for (const q of others) d = Math.min(d, Math.hypot(q.x - s[0], q.z - s[2]));
        d += Math.random() * 6;
        if (d > bestD) { bestD = d; best = s; }
      }
    }
    p.char = p.nextChar;
    p.weapon = this.weaponFor(p);
    p.maxHp = CHARACTERS[p.char].hp;
    p.lastAbility = 0;
    p.armorUntil = 0;
    p.sl = 0;
    p.x = best[0]; p.y = best[1]; p.z = best[2];
    p.yaw = Math.atan2(best[0], best[2]);
    p.pitch = 0;
    p.hp = p.maxHp;
    p.alive = true;
    p.sp++;
    p.streak = 0;
    p.protectUntil = Date.now() + PROTECT_MS;
    p.hist = [];
    if (p.bot) botSpawned(p);
    send(p, { t: 'spawn', p: best, yaw: r3(p.yaw), sp: p.sp, c: p.char, hp: p.maxHp, w: p.weapon, lvl: p.level });
  }

  posAt(p, t) {
    const h = p.hist;
    if (!h.length || t >= h[h.length - 1].t) return [p.x, p.y, p.z, p.sl];
    if (t <= h[0].t) return [h[0].x, h[0].y, h[0].z, h[0].sl];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t) {
        const k = (t - a.t) / (b.t - a.t || 1);
        return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k, b.sl];
      }
    }
    return [p.x, p.y, p.z, p.sl];
  }

  onState(p, m) {
    if (!p.alive || m.sp !== p.sp) return;
    const pos = vec3(m.p);
    if (!pos) return;
    const b = this.map.bounds;
    p.x = clamp(pos[0], -b, b);
    p.y = clamp(pos[1], -1, 30);
    p.z = clamp(pos[2], -b, b);
    p.yaw = Number(m.y) || 0;
    p.pitch = clamp(Number(m.x) || 0, -1.6, 1.6);
    p.mv = m.m ? 1 : 0;
    p.sl = m.s ? 1 : 0;
  }

  onShoot(p, m) {
    const now = Date.now();
    const w = WEAPONS[p.weapon];
    if (!p.alive || this.roundEndsAt || now - p.lastShot < w.fireMs * 0.75) return;
    let o = vec3(m.o);
    const dirs = (Array.isArray(m.d) && Array.isArray(m.d[0]) ? m.d : [m.d]).slice(0, w.pellets).map(vec3);
    if (!o || !dirs.length || dirs.some((d) => !d)) return;
    p.lastShot = now;
    p.protectUntil = 0;

    const eye = [p.x, p.y + PLAYER.EYE, p.z];
    if (Math.hypot(o[0] - eye[0], o[1] - eye[1], o[2] - eye[2]) > 1.5) o = eye;

    // Lag-kompensation: kolla mot där målen var när skytten såg dem.
    const t = now - Math.min(p.rtt / 2, 250) - INTERP_MS;
    const targets = [];
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      const pos = this.posAt(q, t);
      targets.push({ q, hb: hitboxes(pos[0], pos[1], pos[2], !!pos[3]) });
    }

    const dmg = new Map();
    const ends = [];
    for (let d of dirs) {
      const len = Math.hypot(d[0], d[1], d[2]);
      if (len < 1e-6) continue;
      d = d.map((v) => v / len);
      let best = w.melee ? w.range : RANGE, victim = null, head = false;
      for (const b of this.solids) {
        const h = rayBox(o, d, b.min, b.max);
        if (h && h.t < best) best = h.t;
      }
      for (const { q, hb } of targets) {
        const hh = rayBox(o, d, hb.head.min, hb.head.max);
        if (hh && hh.t < best) { best = hh.t; victim = q; head = true; }
        const hbody = rayBox(o, d, hb.body.min, hb.body.max);
        if (hbody && hbody.t < best) { best = hbody.t; victim = q; head = false; }
      }
      ends.push([o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best].map(r2));
      if (victim) {
        const cur = dmg.get(victim) ?? { amount: 0, head: false };
        cur.amount += damageAt(w, head, best);
        cur.head ||= head;
        dmg.set(victim, cur);
      }
    }

    this.broadcast({ t: 'shot', id: p.id, w: p.weapon, e: w.melee ? [] : ends, hit: dmg.size ? 1 : 0 }, p);
    for (const [victim, { amount, head }] of dmg) this.damage(victim, p, amount, head, w.melee ? 'knife' : undefined);
  }

  onAbility(p) {
    const ch = CHARACTERS[p.char];
    const now = Date.now();
    if (!p.alive || this.roundEndsAt || now - p.lastAbility < ch.ability.cooldown * 0.85) return;
    p.lastAbility = now;
    if (ch.ability.id === 'stim') {
      p.hp = Math.min(p.maxHp, p.hp + STIM_HP);
      this.broadcast({ t: 'fx', k: 'stim', id: p.id });
    } else if (ch.ability.id === 'armor') {
      p.armorUntil = now + ARMOR.ms;
      this.broadcast({ t: 'fx', k: 'armor', id: p.id, ms: ARMOR.ms });
    } else if (ch.ability.id === 'slam') {
      p.protectUntil = 0;
      this.broadcast({ t: 'fx', k: 'slam', id: p.id, p: [r2(p.x), r2(p.y), r2(p.z)] });
      for (const q of [...this.players.values()]) {
        if (q === p || !q.alive) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d > SLAM.radius || Math.abs(q.y - p.y) > 2.5) continue;
        this.damage(q, p, Math.round(SLAM.damage * (1 - (d / SLAM.radius) * 0.5)), false, 'slam');
      }
    }
  }

  onVote(p, m) {
    if (!this.roundEndsAt || !Number.isInteger(m.m) || !MAPS[m.m]) return;
    p.vote = m.m;
    this.broadcast({ t: 'votes', v: this.voteCounts() });
  }

  voteCounts() {
    const v = MAPS.map(() => 0);
    for (const p of this.players.values()) if (p.vote >= 0) v[p.vote]++;
    return v;
  }

  damage(v, a, amount, head, how) {
    const now = Date.now();
    if (!v.alive || now < v.protectUntil) return;
    if (now < (v.armorUntil ?? 0)) amount = Math.round(amount * ARMOR.factor);
    v.hp = Math.max(0, v.hp - amount);
    const kill = v.hp <= 0;
    send(a, { t: 'hc', head, kill, d: amount, v: v.id });
    if (v.bot && !kill && a !== v) botHurt(v, a, now);
    send(v, { t: 'hurt', hp: v.hp, from: [r2(a.x), r2(a.z)] });
    if (kill) this.killPlayer(v, a, head, how);
  }

  killPlayer(v, a, head, how) {
    v.alive = false;
    v.deaths++;
    v.streak = 0;
    v.respawnAt = Date.now() + RESPAWN_MS;
    a.kills++;
    a.streak++;
    this.broadcast({ t: 'kill', k: a.id, v: v.id, head, streak: a.streak, w: a.weapon, how });

    if (this.gungame) {
      // knivad = du tappar en nivå
      if (how === 'knife' && v.level > 0) {
        v.level--;
        v.levelKills = 0;
        send(v, { t: 'level', lvl: v.level, down: true });
      }
      if (a.level === GUNGAME.length - 1) {
        this.sendRoster();
        this.endRound(a);
        return;
      }
      a.levelKills++;
      if (a.levelKills >= GUNGAME[a.level].kills) {
        a.level++;
        a.levelKills = 0;
        a.weapon = GUNGAME[a.level].w;
        send(a, { t: 'level', lvl: a.level, w: a.weapon });
        if (a.level === GUNGAME.length - 1) this.broadcast({ t: 'msg', text: `${a.name} har KNIVEN!` });
      }
    } else if (a.kills >= KILL_LIMIT) {
      this.sendRoster();
      this.endRound(a);
      return;
    }
    this.sendRoster();
  }

  endRound(winner) {
    if (this.roundEndsAt) return;
    this.roundEndsAt = Date.now() + ROUND_PAUSE_MS;
    for (const p of this.players.values()) p.vote = -1;
    this.broadcast({ t: 'roundEnd', winner: winner?.id ?? null, ms: ROUND_PAUSE_MS, maps: MAPS.map((m) => m.name), current: this.mapIndex });
  }

  startRound() {
    this.roundEndsAt = 0;
    this.roundStartedAt = Date.now();
    const votes = this.voteCounts();
    const top = Math.max(...votes);
    if (top > 0) {
      const best = votes.map((n, i) => (n === top ? i : -1)).filter((i) => i >= 0);
      this.mapIndex = best[Math.floor(Math.random() * best.length)];
    } else {
      this.mapIndex = (this.mapIndex + 1) % MAPS.length;
    }
    this.map = MAPS[this.mapIndex];
    this.solids = makeSolids(this.map.boxes);
    this.broadcast({ t: 'roundStart', map: this.mapIndex, left: this.roundLeft() });
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.level = 0; p.levelKills = 0; p.alive = false;
      this.spawn(p);
    }
    this.sendRoster();
  }

  leader() {
    return [...this.players.values()].sort((a, b) =>
      (this.gungame ? b.level - a.level || b.levelKills - a.levelKills : 0) || b.kills - a.kills || a.deaths - b.deaths)[0];
  }

  tick() {
    const now = Date.now();
    if (![...this.players.values()].some((p) => !p.bot)) {
      for (const p of [...this.players.values()]) this.leave(p);
      this.roundStartedAt = now;
      return;
    }

    if (this.roundEndsAt && now >= this.roundEndsAt) this.startRound();
    if (!this.roundEndsAt && this.roundLeft() <= 0) this.endRound(this.leader());

    if (now >= (this.nextBotCheck ?? 0)) { this.nextBotCheck = now + 1000; this.manageBots(); }

    for (const p of this.players.values()) {
      if (!p.alive) {
        if (!this.roundEndsAt && now >= p.respawnAt) this.spawn(p);
        continue;
      }
      if (p.bot) botThink(this, p, now, TICK_MS / 1000);
      p.hist.push({ t: now, x: p.x, y: p.y, z: p.z, sl: p.sl });
      while (p.hist.length && now - p.hist[0].t > HISTORY_MS) p.hist.shift();
    }

    this.broadcast({
      t: 's',
      ts: now,
      p: [...this.players.values()].map((q) => [
        q.id, r2(q.x), r2(q.y), r2(q.z), r3(q.yaw), r3(q.pitch),
        q.hp, q.alive ? 1 : 0, q.sp, now < q.protectUntil ? 1 : 0, q.mv, q.sl, q.maxHp,
      ]),
    });
  }
}

const rooms = { ffa: new Room('ffa'), gungame: new Room('gungame') };

// ---------- HTTP ----------
const app = express();
app.get('/health', (_req, res) => res.send('ok'));
app.get('/api/version', (_req, res) => res.json({ version: VERSION }));
app.get('/api/rooms', (_req, res) => res.json(Object.fromEntries(Object.entries(rooms).map(([k, r]) => [k, r.players.size]))));
// three.js byter aldrig innehåll (låst version) – får cachas länge.
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three'), { maxAge: '30d', immutable: true }));
// Spelets egna filer: webbläsaren ska alltid fråga efter senaste versionen, och Cloudflare ska inte spara dem.
// Annars syns inte en ny version förrän cachen rensas.
app.use(express.static(path.join(ROOT, 'public'), {
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  },
}));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8192 });

wss.on('connection', (ws) => {
  let p = null, room = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!p) {
      if (m.t !== 'join') return;
      room = rooms[m.mode] ?? rooms.ffa;
      p = room.join(ws, m);
      return;
    }
    room.message(p, m);
  });

  ws.on('close', () => {
    if (p) room.leave(p);
  });
});

setInterval(() => { for (const r of Object.values(rooms)) r.tick(); }, TICK_MS);
setInterval(() => {
  for (const r of Object.values(rooms)) {
    r.broadcast({ t: 'ping', s: Date.now() });
    r.sendRoster();
  }
}, 2000);

server.listen(PORT, () => console.log(`MOGGADE v${VERSION} kör på port ${PORT} (FFA + Gun Game, kill-gräns ${KILL_LIMIT}, ${ROUND_MS / 60000} min/runda)`));
