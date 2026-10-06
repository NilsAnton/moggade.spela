import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { MAPS } from '../public/js/maps.js';
import { WEAPONS, GUNGAME, damageAt } from '../public/js/weapons.js';
import { CHARACTERS, SLAM, ARMOR, ABILITY } from '../public/js/characters.js';
import { RULES, readConfig, applyConfig } from '../public/js/config.js';
import { makeSolids, rayBox, hitboxes, stuck, grounded, PLAYER } from '../public/js/physics.js';
import { COLORS, XP, levelInfo, hasReward, cleanProfile } from '../public/js/progress.js';
import { BOT_NAMES, newBrain, botSpawned, botThink, botHurt } from './bots.js';
import { openDb } from './db.js';
import { authRouter, discordEnabled, userIdFrom } from './auth.js';

// Spelvärden från .env (skada, HP, förmågor, XP …) – måste köras innan något annat använder dem
const CONFIG = readConfig(process.env);
applyConfig(CONFIG.values);
for (const w of CONFIG.warnings) console.log(`[inställning] ${w}`);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
// Fingeravtryck av alla spelfiler: ändras en enda fil får alla filer en ny adress, så att webbläsaren
// aldrig kör gammal kod från sin cache (även om man glömmer att höja versionen).
const BUILD = (() => {
  const h = crypto.createHash('sha1');
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else h.update(e.name).update(readFileSync(p));
    }
  };
  walk(path.join(ROOT, 'public'));
  return `${VERSION}-${h.digest('hex').slice(0, 10)}`;
})();
const PORT = Number(process.env.PORT) || 3000;
const KILL_LIMIT = Number(process.env.KILL_LIMIT) || 25;
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS) || 16;
const ROUND_MS = (Number(process.env.ROUND_MINUTES) || 8) * 60000;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const SAVE_MS = 15000;

const TICK_MS = 50;
const RANGE = 300;
const INTERP_MS = 100;
const HISTORY_MS = 1000;
const ROUND_PAUSE_MS = 10000;
const BOT_COUNT = Number(process.env.BOTS ?? 0); // 0 = inga bottar som standard
const BOT_SKILL = ['easy', 'normal', 'hard'].includes(process.env.BOT_SKILL) ? process.env.BOT_SKILL : 'normal';
// Fusk-skydd: hur långt man får röra sig. Generöst så att dash, bunny hop och lagg aldrig slår till i onödan.
// Gränserna växer med DASH_FART och SUPERHOPP_KRAFT i .env.
const LEAP = ABILITY.leapPower;
const MOVE = {
  speed: PLAYER.MAX_HS * 1.1, // m/s i sidled
  burst: 10, // extra meter som får "sparas" (paket som kommer i klump)
  up: Math.max(15, LEAP * 1.15), // m/s uppåt
  upBurst: Math.max(5, (LEAP * LEAP) / (2 * PLAYER.GRAVITY) + 1),
  air: Math.max(3, (2 * LEAP) / PLAYER.GRAVITY + 1.5), // sekunder i luften utan att landa
};
const KNIFE = WEAPONS.findIndex((w) => w.id === 'knife'); // plats 2 för alla
const DRAW_MS = 200; // ta fram ett vapen innan man kan skjuta
const MSG_PER_S = 120; // fler meddelanden än så slängs
const KICK_PER_S = 400; // så många = kickas
const MULTI = { 2: 'DUBBELKILL', 3: 'TRIPPELKILL', 4: 'MEGAKILL', 5: 'MONSTERKILL' };
const START_COLORS = COLORS.filter((c) => hasReward('color', c, 1));

// ---------- konton ----------
const db = openDb(DATA_DIR);
// Inloggade konton i minnet (samma objekt om man är inne i två flikar samtidigt)
const accounts = new Map(); // användar-id -> { user, n }

function acquireAccount(id) {
  if (!id) return null;
  let a = accounts.get(id);
  if (!a) {
    const user = db.getUser(id);
    if (!user) return null;
    a = { user, n: 0 };
    accounts.set(id, a);
  }
  a.n++;
  return a.user;
}

function releaseAccount(user) {
  const a = accounts.get(user.id);
  if (!a) return;
  db.saveUser(user);
  if (--a.n <= 0) accounts.delete(user.id);
}

const liveUser = (id) => accounts.get(id)?.user ?? db.getUser(id);

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

// Går sträckan a -> b (i midjehöjd) rakt igenom en vägg? Lådorna krymps lite så att hörn inte räknas.
function throughWall(solids, a, b) {
  const o = [a[0], a[1] + 1, a[2]];
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (len < 0.3) return false;
  for (let i = 0; i < 3; i++) d[i] /= len;
  for (const box of solids) {
    const sx = Math.min(0.2, (box.max[0] - box.min[0]) / 2 - 0.05);
    const sz = Math.min(0.2, (box.max[2] - box.min[2]) / 2 - 0.05);
    const h = rayBox(o, d, [box.min[0] + sx, box.min[1], box.min[2] + sz], [box.max[0] - sx, box.max[1], box.max[2] - sz]);
    if (h && h.t < len) return true;
  }
  return false;
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
    this.resetPads();
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
        w: p.weapon, c: p.char, lvl: p.level, bot: p.bot ? 1 : 0, r: p.bot ? p.rank : levelInfo(p.prof.xp).lvl,
        ti: p.title ?? '', acc: p.user ? 1 : 0,
      })),
    });
  }

  // vilket vapen spelaren ska ha just nu
  weaponFor(p) {
    return this.gungame ? GUNGAME[p.level].w : CHARACTERS[p.char].weapon;
  }

  // user = inloggat konto (eller null för gäster, som skickar med sin egen profil från webbläsaren)
  join(ws, m, user) {
    if (this.players.size >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: 'full' }));
      ws.close();
      return null;
    }
    const id = nextId++;
    const ch = charIndex(m.c);
    const prof = user ? user.prof : cleanProfile(m.prof);
    const lvl = levelInfo(prof.xp).lvl;
    const p = {
      id, ws, user, prof, xpQ: [], killTimes: [],
      name: cleanName(m.name || user?.name, id),
      color: hasReward('color', m.color, lvl) ? m.color : START_COLORS[id % START_COLORS.length],
      title: typeof m.title === 'string' && hasReward('title', m.title, lvl) ? m.title : '',
      char: ch, nextChar: ch, weapon: 0, maxHp: CHARACTERS[ch].hp, level: 0, levelKills: 0,
      lastAbility: 0, sl: 0, vote: -1,
      x: 0, y: 0, z: 0, yaw: 0, pitch: 0, mv: 0,
      hp: 0, alive: false, sp: 0, kills: 0, deaths: 0, streak: 0,
      lastShot: 0, rtt: 80, respawnAt: 0, protectUntil: 0, hist: [],
    };
    p.slot = 0;
    p.ammoBy = {};
    this.equip(p);
    prof.games++;
    if (user) user.sel = { name: m.name ? p.name : user.sel.name, color: p.color, title: p.title };
    this.players.set(id, p);
    send(p, {
      t: 'welcome', id, mode: this.mode, killLimit: KILL_LIMIT, map: this.mapIndex, pads: this.padState(),
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
    p.slot = 0;
    p.ammoBy = {};
    this.equip(p);
    this.players.set(id, p);
    if (!this.roundEndsAt) this.spawn(p);
    this.sendRoster();
  }

  leave(p) {
    this.players.delete(p.id);
    if (p.user) releaseAccount(p.user);
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
      case 'rl': if (p.alive) this.reload(p, Date.now()); break;
      case 'slot': this.onSlot(p, m); break;
      case 'chat': this.onChat(p, m); break;
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
    p.slot = 0;
    this.equip(p);
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
    p.protectUntil = Date.now() + RULES.protectMs;
    p.hist = [];
    this.resetMove(p);
    p.ammoBy = {};
    if (p.bot) botSpawned(p);
    send(p, { t: 'spawn', p: best, yaw: r3(p.yaw), sp: p.sp, c: p.char, hp: p.maxHp, w: p.primary, lvl: p.level });
    this.broadcast({ t: 'wp', id: p.id, w: p.weapon }, p);
  }

  resetMove(p) {
    p.chk = { at: Date.now(), budget: MOVE.burst, up: MOVE.upBurst, air: 0 };
  }

  // Plats 1 = huvudvapnet (gubbens, eller nivåns i Gun Game), plats 2 = kniven
  equip(p) {
    p.primary = this.weaponFor(p);
    p.weapon = p.slot === 1 ? KNIFE : p.primary;
  }

  // Ammo sparas per vapen, så att man inte kan fylla magasinet genom att byta fram och tillbaka
  ammoState(p) {
    return (p.ammoBy[p.weapon] ??= { ammo: WEAPONS[p.weapon].mag, reloadUntil: 0 });
  }

  onSlot(p, m) {
    const s = m.s === 1 ? 1 : 0;
    if (!p.alive || s === p.slot) return;
    p.slot = s;
    this.equip(p);
    p.drawUntil = Date.now() + DRAW_MS;
    this.broadcast({ t: 'wp', id: p.id, w: p.weapon }, p);
  }

  // Skicka tillbaka spelaren till senast godkända position. sp räknas upp så att paket
  // som redan är på väg (med den gamla positionen) ignoreras.
  correct(p, why) {
    p.sp++;
    p.violations = (p.violations ?? 0) + 1;
    this.resetMove(p);
    if (p.violations % 20 === 1) console.log(`[fusk?] ${p.name} (#${p.id}): ${why} (${p.violations} st)`);
    send(p, { t: 'pos', p: [r2(p.x), r2(p.y), r2(p.z)], sp: p.sp });
  }

  // ---------- hälsoplattor ----------
  resetPads() {
    this.pads = (this.map.pads ?? []).map((p) => ({ p, readyAt: 0 }));
  }

  // ms kvar tills varje platta är redo (0 = redo)
  padState(now = Date.now()) {
    return this.pads.map((d) => Math.max(0, d.readyAt - now));
  }

  // Står spelaren på en redo platta och saknar HP? Då läker den.
  checkPads(p, now) {
    if (p.hp >= p.maxHp) return;
    for (let i = 0; i < this.pads.length; i++) {
      const d = this.pads[i];
      if (now < d.readyAt || Math.abs(p.y - d.p[1]) > 1 || Math.hypot(p.x - d.p[0], p.z - d.p[2]) > 1.1) continue;
      p.hp = Math.min(p.maxHp, p.hp + RULES.padHp);
      d.readyAt = now + RULES.padMs;
      this.broadcast({ t: 'pads', s: this.padState(now), i, by: p.id });
      return;
    }
  }

  // ---------- XP (räknas bara här på servern) ----------
  award(p, amount, label) {
    if (!p.prof || amount <= 0) return;
    p.prof.xp += Math.round(amount);
    p.xpQ.push([Math.round(amount), label]);
  }

  // Skickar profilen + nya XP-poster till spelaren
  sendProf(p) {
    if (!p.prof) return;
    send(p, { t: 'prof', prof: p.prof, xp: p.xpQ });
    p.xpQ = [];
  }

  killXp(a, head) {
    const pr = a.prof;
    if (!pr) return;
    const now = Date.now();
    a.killTimes = a.killTimes.filter((t) => now - t < 4000);
    a.killTimes.push(now);
    pr.kills++;
    if (head) pr.heads++;
    pr.bestStreak = Math.max(pr.bestStreak, a.streak);
    this.award(a, XP.kill, head ? 'HEADSHOT-KILL' : 'KILL');
    if (head) this.award(a, XP.head, 'HEADSHOT');
    const n = a.killTimes.length;
    if (n >= 2) this.award(a, XP.multi * (n - 1), MULTI[Math.min(n, 5)]);
    if (a.streak >= 3) this.award(a, XP.streak * a.streak, `SVIT ${a.streak}`);
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
    const next = [clamp(pos[0], -b, b), clamp(pos[1], -1, 30), clamp(pos[2], -b, b)];

    // Rimlighetskoll: fart, hopphöjd, väggar och svävande
    const c = p.chk, now = Date.now();
    const dt = Math.min((now - c.at) / 1000, 1);
    c.at = now;
    c.budget = Math.min(MOVE.burst, c.budget + dt * MOVE.speed);
    c.up = Math.min(MOVE.upBurst, c.up + dt * MOVE.up);
    c.budget -= Math.hypot(next[0] - p.x, next[2] - p.z);
    c.up -= Math.max(0, next[1] - p.y);
    c.air = grounded(this.solids, next) ? 0 : c.air + Math.min(dt, 0.1);
    let bad = null;
    if (c.budget < 0) bad = 'för snabb';
    else if (c.up < 0) bad = 'för högt hopp';
    else if (c.air > MOVE.air) bad = 'svävar';
    else if (stuck(this.solids, next)) bad = 'inne i vägg';
    else if (throughWall(this.solids, [p.x, p.y, p.z], next)) bad = 'genom vägg';
    if (bad) { this.correct(p, bad); return; }

    [p.x, p.y, p.z] = next;
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
    const am = this.ammoState(p);
    if (now < am.reloadUntil || now < (p.drawUntil ?? 0)) return;
    if (!w.melee && --am.ammo <= 0) this.reload(p, now);
    if (p.prof && !w.melee) p.prof.shots++;
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

  // Laddar om (lite kortare tid än på klienten, så att nätverksfladder inte slänger skott)
  reload(p, now) {
    const w = WEAPONS[p.weapon];
    const am = this.ammoState(p);
    if (w.melee || now < am.reloadUntil || am.ammo >= w.mag) return;
    am.reloadUntil = now + w.reloadMs * 0.8;
    am.ammo = w.mag;
  }

  onAbility(p) {
    const ch = CHARACTERS[p.char];
    const now = Date.now();
    if (!p.alive || this.roundEndsAt || now - p.lastAbility < ch.ability.cooldown * 0.85) return;
    p.lastAbility = now;
    if (ch.ability.id === 'stim') {
      p.hp = Math.min(p.maxHp, p.hp + ABILITY.stimHp);
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

  onChat(p, m) {
    const now = Date.now();
    if (now - (p.lastChat ?? 0) < 700) return;
    const text = String(m.text ?? '').replace(/[\p{C}]/gu, '').trim().slice(0, 100);
    if (!text) return;
    p.lastChat = now;
    this.broadcast({ t: 'chat', id: p.id, text });
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
    if (a.prof && a !== v) { a.prof.hits++; a.prof.dmg += amount; }
    send(a, { t: 'hc', head, kill, d: amount, v: v.id });
    if (v.bot && !kill && a !== v) botHurt(v, a, now);
    send(v, { t: 'hurt', hp: v.hp, from: [r2(a.x), r2(a.z)] });
    if (kill) this.killPlayer(v, a, head, how);
  }

  killPlayer(v, a, head, how) {
    v.alive = false;
    v.deaths++;
    v.streak = 0;
    v.respawnAt = Date.now() + RULES.respawnMs;
    a.kills++;
    a.streak++;
    if (v.prof) v.prof.deaths++;
    if (a !== v) this.killXp(a, head);
    this.broadcast({ t: 'kill', k: a.id, v: v.id, head, streak: a.streak, w: a.weapon, how });

    if (this.gungame) {
      // knivad = du tappar en nivå
      if (how === 'knife' && v.level > 0) {
        v.level--;
        v.levelKills = 0;
        send(v, { t: 'level', lvl: v.level, down: true });
      }
      if (a.level === GUNGAME.length - 1 && how === 'knife') {
        this.sendRoster();
        this.endRound(a);
        return;
      }
      a.levelKills++;
      if (a.level < GUNGAME.length - 1 && a.levelKills >= GUNGAME[a.level].kills) {
        a.level++;
        a.levelKills = 0;
        this.equip(a);
        if (a.slot === 0) this.broadcast({ t: 'wp', id: a.id, w: a.weapon }, a);
        send(a, { t: 'level', lvl: a.level, w: a.primary });
        this.award(a, XP.level, 'NY NIVÅ');
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
    for (const p of this.players.values()) {
      p.vote = -1;
      if (!p.prof) continue;
      if (p === winner) { p.prof.wins++; this.award(p, XP.win, 'VINST'); }
      this.award(p, XP.round, 'RUNDA SPELAD');
      this.sendProf(p); // före roundEnd, så att rundans XP hinner med i sammanfattningen
      if (p.user) db.saveUser(p.user);
    }
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
    this.resetPads();
    this.broadcast({ t: 'roundStart', map: this.mapIndex, left: this.roundLeft(), pads: this.padState() });
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
      if (p.xpQ?.length) this.sendProf(p);
      if (!p.alive) {
        if (!this.roundEndsAt && now >= p.respawnAt) this.spawn(p);
        continue;
      }
      if (p.bot) botThink(this, p, now, TICK_MS / 1000);
      if (!this.roundEndsAt) this.checkPads(p, now);
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
app.set('trust proxy', true); // Cloudflare-tunneln talar om att anslutningen är https
app.use(express.json({ limit: '4kb' }));
app.use(authRouter(db));
app.get('/health', (_req, res) => res.send('ok'));

// Vem är jag? Profil, val och om Discord-inloggning finns.
app.get('/api/me', (req, res) => {
  const id = userIdFrom(db, req);
  const user = id ? liveUser(id) : null;
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    discord: discordEnabled(),
    user: user ? { name: user.name, avatar: user.avatar, prof: user.prof, sel: user.sel, canImport: !user.imported && user.prof.xp === 0 } : null,
  });
});

// Engångsflytt av gäst-profilen (från webbläsaren) till ett nytt konto
app.post('/api/import', (req, res) => {
  const id = userIdFrom(db, req);
  const user = id ? liveUser(id) : null;
  if (!user || user.imported || user.prof.xp > 0) return res.status(400).json({ ok: false });
  Object.assign(user.prof, cleanProfile(req.body?.prof));
  user.imported = true;
  db.saveUser(user);
  res.json({ ok: true, prof: user.prof });
});

app.get('/api/top', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(db.top(10));
});
app.get('/api/version', (_req, res) => res.json({ version: VERSION }));
app.get('/api/rooms', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  // bara riktiga spelare räknas, inte bottar
  const count = (r) => [...r.players.values()].filter((p) => !p.bot).length;
  res.json({ ...Object.fromEntries(Object.entries(rooms).map(([k, r]) => [k, count(r)])), killLimit: KILL_LIMIT });
});
// three.js byter aldrig innehåll (låst version) – får cachas länge.
app.use('/vendor/three', express.static(path.join(ROOT, 'node_modules/three'), { maxAge: '30d', immutable: true }));

// Startsidan pekar på /v/<version>/... så att varje ny version får helt nya filadresser.
// Då kan webbläsaren aldrig blanda gamla och nya JS-filer (alla import './x.js' följer med versionen).
const INDEX = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8')
  .replace('href="style.css"', `href="/v/${BUILD}/style.css"`)
  .replace('src="js/main.js"', `src="/v/${BUILD}/js/main.js"`)
  // samma spelvärden till webbläsaren (bara siffror med kända namn, så det är säkert att skriva in här)
  .replace('<script type="importmap">', `<script>window.LOCKDOWN_CONFIG = ${JSON.stringify(CONFIG.values)};</script>\n  <script type="importmap">`);
const sendIndex = (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  res.type('html').send(INDEX);
};
app.get(['/', '/index.html'], sendIndex);
// Versionerade filer ändras aldrig – får cachas länge.
app.use(`/v/${BUILD}`, express.static(path.join(ROOT, 'public'), { maxAge: '365d', immutable: true }));
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

wss.on('connection', (ws, req) => {
  let p = null, room = null;
  let user = acquireAccount(userIdFrom(db, req));
  let second = 0, count = 0;

  ws.on('message', (raw) => {
    const s = Math.floor(Date.now() / 1000);
    if (s !== second) { second = s; count = 0; }
    if (++count > KICK_PER_S) { ws.close(); return; }
    if (count > MSG_PER_S) return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!p) {
      if (m.t !== 'join') return;
      room = rooms[m.mode] ?? rooms.ffa;
      p = room.join(ws, m, user);
      if (p) user = null; // ägs nu av spelaren och släpps i leave()
      return;
    }
    room.message(p, m);
  });

  ws.on('close', () => {
    if (p) room.leave(p);
    if (user) releaseAccount(user);
  });
});

setInterval(() => { for (const r of Object.values(rooms)) r.tick(); }, TICK_MS);
setInterval(() => {
  for (const r of Object.values(rooms)) {
    r.broadcast({ t: 'ping', s: Date.now() });
    r.sendRoster();
    for (const p of r.players.values()) r.sendProf(p); // statistik (skott, träffar) uppdateras löpande
  }
}, 2000);
// spara inloggade konton regelbundet, och när servern stängs
setInterval(() => { for (const { user } of accounts.values()) db.saveUser(user); }, SAVE_MS);
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const { user } of accounts.values()) db.saveUser(user);
    process.exit(0);
  });
}

server.listen(PORT, () => console.log(`LOCKDOWN v${VERSION} kör på port ${PORT} (FFA + Gun Game, kill-gräns ${KILL_LIMIT}, ${ROUND_MS / 60000} min/runda, Discord-inloggning ${discordEnabled() ? 'på' : 'av'})`));
