import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MAP, SPAWNS, BOUNDS } from '../public/js/map.js';
import { makeSolids, rayBox, hitboxes, PLAYER } from '../public/js/physics.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 3000;
const KILL_LIMIT = Number(process.env.KILL_LIMIT) || 25;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 16;

const TICK_MS = 50;
const MAX_HP = 100;
const RESPAWN_MS = 3000;
const PROTECT_MS = 1500;
const FIRE_MS = 100;
const DMG_BODY = 22;
const DMG_HEAD = 55;
const RANGE = 300;
const INTERP_MS = 100;
const HISTORY_MS = 1000;
const ROUND_PAUSE_MS = 10000;
const COLORS = ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff', '#ff8fab', '#f77f00', '#e9ecef'];

const solids = makeSolids(MAP);
const players = new Map();
let nextId = 1;
let roundEndsAt = 0;

// ---------- HTTP ----------
const app = express();
app.get('/health', (_req, res) => res.send('ok'));
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three')));
app.use(express.static(path.join(ROOT, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });

// ---------- hjälpfunktioner ----------
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function send(p, msg) {
  if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}

function broadcast(msg, except) {
  const data = JSON.stringify(msg);
  for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(data);
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

function sendRoster() {
  broadcast({
    t: 'roster',
    killLimit: KILL_LIMIT,
    list: [...players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, k: p.kills, d: p.deaths, ping: Math.round(p.rtt) })),
  });
}

// ---------- spellogik ----------
function spawn(p) {
  const others = [...players.values()].filter((q) => q !== p && q.alive);
  let best = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
  if (others.length) {
    let bestD = -1;
    for (const s of SPAWNS) {
      let d = Infinity;
      for (const q of others) d = Math.min(d, Math.hypot(q.x - s[0], q.z - s[2]));
      d += Math.random() * 6;
      if (d > bestD) { bestD = d; best = s; }
    }
  }
  p.x = best[0]; p.y = best[1]; p.z = best[2];
  p.yaw = Math.atan2(best[0], best[2]);
  p.pitch = 0;
  p.hp = MAX_HP;
  p.alive = true;
  p.sp++;
  p.streak = 0;
  p.protectUntil = Date.now() + PROTECT_MS;
  p.hist = [];
  send(p, { t: 'spawn', p: best, yaw: r3(p.yaw), sp: p.sp });
}

function posAt(p, t) {
  const h = p.hist;
  if (!h.length || t >= h[h.length - 1].t) return [p.x, p.y, p.z];
  if (t <= h[0].t) return [h[0].x, h[0].y, h[0].z];
  for (let i = h.length - 1; i > 0; i--) {
    const a = h[i - 1], b = h[i];
    if (a.t <= t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      return [a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k];
    }
  }
  return [p.x, p.y, p.z];
}

function onState(p, m) {
  if (!p.alive || m.sp !== p.sp) return;
  const pos = vec3(m.p);
  if (!pos) return;
  p.x = clamp(pos[0], -BOUNDS, BOUNDS);
  p.y = clamp(pos[1], -1, 30);
  p.z = clamp(pos[2], -BOUNDS, BOUNDS);
  p.yaw = Number(m.y) || 0;
  p.pitch = clamp(Number(m.x) || 0, -1.6, 1.6);
  p.mv = m.m ? 1 : 0;
}

function onShoot(p, m) {
  const now = Date.now();
  if (!p.alive || roundEndsAt || now - p.lastShot < FIRE_MS * 0.75) return;
  let o = vec3(m.o), d = vec3(m.d);
  if (!o || !d) return;
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-6) return;
  d = d.map((v) => v / len);
  p.lastShot = now;
  p.protectUntil = 0;

  const eye = [p.x, p.y + PLAYER.EYE, p.z];
  if (Math.hypot(o[0] - eye[0], o[1] - eye[1], o[2] - eye[2]) > 1.5) o = eye;

  let best = RANGE, victim = null, head = false;
  for (const b of solids) {
    const h = rayBox(o, d, b.min, b.max);
    if (h && h.t < best) best = h.t;
  }

  // Lag-kompensation: kolla mot där målen var när skytten såg dem.
  const t = now - Math.min(p.rtt / 2, 250) - INTERP_MS;
  for (const q of players.values()) {
    if (q === p || !q.alive) continue;
    const pos = posAt(q, t);
    const hb = hitboxes(pos[0], pos[1], pos[2]);
    const hh = rayBox(o, d, hb.head.min, hb.head.max);
    if (hh && hh.t < best) { best = hh.t; victim = q; head = true; }
    const hbody = rayBox(o, d, hb.body.min, hb.body.max);
    if (hbody && hbody.t < best) { best = hbody.t; victim = q; head = false; }
  }

  const e = [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best].map(r2);
  broadcast({ t: 'shot', id: p.id, e, hit: victim ? 1 : 0 }, p);
  if (victim) damage(victim, p, head);
}

function damage(v, a, head) {
  if (Date.now() < v.protectUntil) return;
  v.hp = Math.max(0, v.hp - (head ? DMG_HEAD : DMG_BODY));
  const kill = v.hp <= 0;
  send(a, { t: 'hc', head, kill });
  send(v, { t: 'hurt', hp: v.hp, from: [r2(a.x), r2(a.z)] });
  if (kill) killPlayer(v, a, head);
}

function killPlayer(v, a, head) {
  v.alive = false;
  v.deaths++;
  v.streak = 0;
  v.respawnAt = Date.now() + RESPAWN_MS;
  a.kills++;
  a.streak++;
  broadcast({ t: 'kill', k: a.id, v: v.id, head, streak: a.streak });
  sendRoster();
  if (a.kills >= KILL_LIMIT && !roundEndsAt) {
    roundEndsAt = Date.now() + ROUND_PAUSE_MS;
    broadcast({ t: 'roundEnd', winner: a.id, ms: ROUND_PAUSE_MS });
  }
}

// ---------- anslutningar ----------
wss.on('connection', (ws) => {
  let p = null;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (!p) {
      if (m.t !== 'join') return;
      if (players.size >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ t: 'full' }));
        ws.close();
        return;
      }
      const id = nextId++;
      p = {
        id, ws,
        name: cleanName(m.name, id),
        color: COLORS.includes(m.color) ? m.color : COLORS[id % COLORS.length],
        x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0,
        hp: 0, alive: false, sp: 0, kills: 0, deaths: 0, streak: 0,
        lastShot: 0, rtt: 80, respawnAt: 0, protectUntil: 0, hist: [],
      };
      players.set(id, p);
      send(p, { t: 'welcome', id, killLimit: KILL_LIMIT, roundOver: roundEndsAt > 0 });
      if (!roundEndsAt) spawn(p);
      sendRoster();
      broadcast({ t: 'msg', text: `${p.name} anslöt` }, p);
      return;
    }

    switch (m.t) {
      case 'st': onState(p, m); break;
      case 'sh': onShoot(p, m); break;
      case 'pong': if (Number.isFinite(m.s)) p.rtt = clamp(Date.now() - m.s, 0, 1000); break;
    }
  });

  ws.on('close', () => {
    if (!p) return;
    players.delete(p.id);
    broadcast({ t: 'leave', id: p.id });
    broadcast({ t: 'msg', text: `${p.name} lämnade` });
    sendRoster();
  });
});

// ---------- tick ----------
setInterval(() => {
  const now = Date.now();

  if (roundEndsAt && now >= roundEndsAt) {
    roundEndsAt = 0;
    for (const p of players.values()) { p.kills = 0; p.deaths = 0; spawn(p); }
    broadcast({ t: 'roundStart' });
    sendRoster();
  }

  for (const p of players.values()) {
    if (!p.alive) {
      if (!roundEndsAt && now >= p.respawnAt) spawn(p);
      continue;
    }
    p.hist.push({ t: now, x: p.x, y: p.y, z: p.z });
    while (p.hist.length && now - p.hist[0].t > HISTORY_MS) p.hist.shift();
  }

  if (!players.size) return;
  broadcast({
    t: 's',
    ts: now,
    p: [...players.values()].map((q) => [
      q.id, r2(q.x), r2(q.y), r2(q.z), r3(q.yaw), r3(q.pitch),
      q.hp, q.alive ? 1 : 0, q.sp, now < q.protectUntil ? 1 : 0, q.mv,
    ]),
  });
}, TICK_MS);

setInterval(() => {
  broadcast({ t: 'ping', s: Date.now() });
  sendRoster();
}, 2000);

server.listen(PORT, () => console.log(`MOGGADE kör på port ${PORT} (kill-gräns ${KILL_LIMIT})`));
