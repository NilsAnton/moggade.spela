// Serverbottar – spelar som riktiga spelare: samma fysik, samma vapen, samma regler.
import { moveBody, raycastWorld, PLAYER } from '../public/js/physics.js';
import { WEAPONS } from '../public/js/weapons.js';
import { CHARACTERS, RADAR_MS } from '../public/js/characters.js';

export const BOT_NAMES = ['Kalle', 'Stina', 'Bosse', 'Greta', 'Måns', 'Tuva', 'Sixten', 'Majken'];

// Avstånd boten helst håller till sitt mål, per vapen
const PREFERRED = { rifle: 14, smg: 7, shotgun: 4, sniper: 26, knife: 0, dmr: 20, lmg: 12 };

// Svårighetsgrad (BOT_SKILL=easy|normal|hard)
const SKILL = {
  easy: { react: 650, err: 1.7, slower: 1.35, head: 0.06, scan: 320 },
  normal: { react: 400, err: 1, slower: 1, head: 0.15, scan: 200 },
  hard: { react: 230, err: 0.6, slower: 0.85, head: 0.28, scan: 120 },
};
const WALK = 5.6;
const TURN = 7; // rad/s

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function newBrain(skill = 'normal') {
  return {
    skill: SKILL[skill] ?? SKILL.normal,
    hurtBy: null, hurtAt: 0,
    body: { p: [0, 0, 0], v: [0, 0, 0], ground: false },
    target: null, seenAt: 0, nextScan: 0,
    goal: null, goalUntil: 0,
    strafe: 1, strafeUntil: 0,
    stuckCheck: 0, lastPos: [0, 0, 0],
    ammo: 0, weaponId: null, reloadUntil: 0,
  };
}

// Kallas när boten tar skada: vänd dig mot den som sköt (om du inte redan slåss med någon nära)
export function botHurt(p, attacker, now) {
  const b = p.bot;
  b.hurtBy = attacker;
  b.hurtAt = now;
  if (!b.target || !b.target.alive || b.target === attacker) {
    if (b.target !== attacker) b.seenAt = now - b.skill.react * 0.5; // snabbare reaktion när man blir skjuten
    b.target = attacker;
  }
  b.strafe = -b.strafe;
}

// Kallas när boten spawnar
export function botSpawned(p) {
  const b = p.bot;
  b.body.p = [p.x, p.y, p.z];
  b.body.v = [0, 0, 0];
  b.target = null;
  b.goal = null;
  b.weaponId = null;
}

function canSee(room, eye, q) {
  const tx = q.x - eye[0], ty = q.y + 1.2 - eye[1], tz = q.z - eye[2];
  const dist = Math.hypot(tx, ty, tz);
  if (dist < 0.01) return true;
  return !raycastWorld(room.solids, eye, [tx / dist, ty / dist, tz / dist], dist);
}

export function botThink(room, p, now, dt) {
  const b = p.bot;
  p.mv = 0;
  if (!p.alive || room.roundEndsAt) return;

  const w = WEAPONS[p.weapon];
  if (b.weaponId !== w.id) { b.weaponId = w.id; b.ammo = w.mag; b.reloadUntil = 0; }
  const ch = CHARACTERS[p.char];
  const eye = [p.x, p.y + PLAYER.EYE, p.z];

  // leta mål (inte varje tick – sparar CPU och ger en naturlig reaktionstid)
  const sk = b.skill;
  if (now >= b.nextScan) {
    b.nextScan = now + sk.scan;
    let best = null, bestD = 70;
    for (const q of room.players.values()) {
      if (q === p || !q.alive) continue;
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bestD && canSee(room, eye, q)) { best = q; bestD = d; }
    }
    if (!best && b.hurtBy?.alive && now - b.hurtAt < 2500) best = b.hurtBy; // leta efter den som sköt
    if (best && best !== b.target) b.seenAt = now;
    b.target = best;
  }
  const lowHp = p.hp < p.maxHp * 0.35;
  useAbility(room, p, b, ch, now);
  const t = b.target && b.target.alive ? b.target : null;

  // ---------- rörelse ----------
  let wx = 0, wz = 0, wantYaw = p.yaw;
  if (t) {
    const dx = t.x - p.x, dz = t.z - p.z, dist = Math.hypot(dx, dz) || 1;
    const fx = dx / dist, fz = dz / dist;
    wantYaw = Math.atan2(-dx, -dz);
    if (now >= b.strafeUntil) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeUntil = now + 700 + Math.random() * 1000; }
    const pref = PREFERRED[w.id] ?? 12;
    let fwd = dist > pref + 2 ? 1 : dist < pref - 2 && pref > 0 ? -0.7 : 0;
    if (lowHp && w.id !== 'knife' && w.id !== 'shotgun') fwd = -0.9; // backa och överlev
    wx = fx * fwd - fz * b.strafe * 0.8;
    wz = fz * fwd + fx * b.strafe * 0.8;
    if (b.body.ground && Math.random() < dt * 0.25) b.body.v[1] = PLAYER.JUMP;
  } else {
    if (now < (b.radarUntil ?? 0)) {
      // radar: gå mot närmaste fiende även om den inte syns
      let near = null, nd = Infinity;
      for (const q of room.players.values()) {
        if (q === p || !q.alive) continue;
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        if (d < nd) { near = q; nd = d; }
      }
      if (near) { b.goal = [near.x, near.y, near.z]; b.goalUntil = now + 1500; }
    }
    if (!b.goal || now > b.goalUntil || Math.hypot(b.goal[0] - p.x, b.goal[2] - p.z) < 1.5) {
      b.goal = room.map.spawns[Math.floor(Math.random() * room.map.spawns.length)];
      b.goalUntil = now + 9000;
    }
    const dx = b.goal[0] - p.x, dz = b.goal[2] - p.z, dist = Math.hypot(dx, dz) || 1;
    wx = dx / dist;
    wz = dz / dist;
    wantYaw = Math.atan2(-dx, -dz);
  }

  const l = Math.hypot(wx, wz);
  const speed = WALK * ch.speed * (t ? 0.8 : 1);
  if (l > 0) { wx = (wx / l) * speed; wz = (wz / l) * speed; }
  const body = b.body;
  body.p = [p.x, p.y, p.z];
  const k = Math.min(1, (body.ground ? 12 : 2.5) * dt);
  body.v[0] += (wx - body.v[0]) * k;
  body.v[2] += (wz - body.v[2]) * k;

  // fastnat? hoppa och välj ett nytt mål
  if (now >= b.stuckCheck) {
    if (Math.hypot(p.x - b.lastPos[0], p.z - b.lastPos[2]) < 0.6 && l > 0) {
      if (body.ground) body.v[1] = PLAYER.JUMP;
      b.goal = null;
      b.strafe = -b.strafe;
    }
    b.lastPos = [p.x, p.y, p.z];
    b.stuckCheck = now + 1000;
  }

  moveBody(body, room.solids, dt);
  [p.x, p.y, p.z] = body.p;
  p.mv = Math.hypot(body.v[0], body.v[2]) > 0.5 ? 1 : 0;

  const turn = wrap(wantYaw - p.yaw);
  p.yaw = wrap(p.yaw + Math.sign(turn) * Math.min(Math.abs(turn), TURN * dt));

  if (!t) { p.pitch *= 0.9; return; }
  const ty = t.y + 1.1 - (p.y + PLAYER.EYE);
  const horiz = Math.hypot(t.x - p.x, t.z - p.z);
  p.pitch = Math.atan2(ty, horiz);

  // ---------- skjuta ----------
  if (now - b.seenAt < sk.react || Math.abs(turn) > 0.35) return; // reaktionstid och måste vara vänd mot målet
  if (now < b.reloadUntil) return;
  if (w.melee && horiz > w.range) return;
  const slower = (w.auto ? 1.5 : 1.25) * sk.slower;
  if (now - p.lastShot < w.fireMs * slower) return;
  if (!canSee(room, eye, t)) return;

  const aimY = t.y + (Math.random() < sk.head ? 1.65 : 1.1);
  const base = [t.x - eye[0], aimY - eye[1], t.z - eye[2]];
  const dist = Math.hypot(...base);
  const err = ((w.id === 'sniper' || w.id === 'dmr' ? 0.012 : 0.03) + Math.min(dist * 0.0006, 0.03) + (t.mv ? 0.012 : 0)) * sk.err;
  const dirs = [];
  for (let i = 0; i < w.pellets; i++) {
    const e = w.pellets > 1 ? err + w.hip : err;
    dirs.push([
      base[0] / dist + (Math.random() - 0.5) * 2 * e,
      base[1] / dist + (Math.random() - 0.5) * 2 * e,
      base[2] / dist + (Math.random() - 0.5) * 2 * e,
    ]);
  }
  room.onShoot(p, { o: eye, d: w.pellets > 1 ? dirs : dirs[0] });
  if (!w.melee && --b.ammo <= 0) { b.reloadUntil = now + w.reloadMs; b.ammo = w.mag; }
}

// Bottarna använder också sina förmågor
function useAbility(room, p, b, ch, now) {
  const ab = ch.ability;
  if (now - p.lastAbility < ab.cooldown) return;
  const t = b.target && b.target.alive ? b.target : null;
  const dist = t ? Math.hypot(t.x - p.x, t.z - p.z) : Infinity;
  let use = false;
  if (ab.id === 'stim') use = p.hp < p.maxHp * 0.55;
  else if (ab.id === 'armor') use = t && now - b.hurtAt < 600;
  else if (ab.id === 'slam') use = dist < SLAM_RANGE && Math.abs(t.y - p.y) < 2;
  else if (ab.id === 'dash') {
    use = t && (dist > 10 || now - b.hurtAt < 300) && Math.random() < 0.02;
    if (use) { const d = dist || 1; b.body.v[0] = ((t.x - p.x) / d) * 18; b.body.v[2] = ((t.z - p.z) / d) * 18; }
  } else if (ab.id === 'radar') {
    use = !t && Math.random() < 0.01;
    if (use) b.radarUntil = now + RADAR_MS;
  } else if (ab.id === 'leap') {
    use = b.body.ground && !t && Math.random() < 0.004;
    if (use) b.body.v[1] = 13.5;
  }
  if (use) room.onAbility(p);
}
const SLAM_RANGE = 4.2;
