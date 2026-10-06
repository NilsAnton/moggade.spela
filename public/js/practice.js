import { RULES } from './config.js';
import * as THREE from 'three';
import { PLAYER, raycastWorld } from './physics.js';
import { RANGE } from './maps.js';
import { CHARACTERS, SLAM } from './characters.js';
import { RemotePlayer } from './player.js';
import { G, keys, me, settings } from './state.js';
import { $, effects, loadMap, scene, sound, weapon } from './core.js';
import { centerMsg, damageNumber, hitmarker } from './hud.js';
import { showMenu } from './menu.js';
import { onMessage } from './net.js';
import { panFor } from './local.js';

// ---------- övningsläge (körs helt lokalt) ----------
export let botsOn = false;
export const dummies = [];
export const stats = { shots: 0, hits: 0, heads: 0, kills: 0, dmg: 0 };

export function startPractice() {
  G.practice = true;
  G.playing = true;
  G.roundOver = false;
  me.id = 0;
  loadMap('range');
  for (const def of RANGE.dummies) addDummy(def, false);
  resetStats();
  practiceSpawn(false);
  showMenu(!G.locked);
}

export function stopPractice() {
  G.practice = false;
  G.playing = false;
  botsOn = false;
  me.alive = false;
  for (const d of dummies) d.r.dispose();
  dummies.length = 0;
  $('death').classList.add('hidden');
  loadMap(0);
  showMenu(true);
}

export function practiceSpawn(keepPosition) {
  const p = keepPosition && me.alive ? [...me.p] : [...RANGE.spawns[0]];
  const yaw = keepPosition && me.alive ? me.yaw : 0;
  onMessage({ t: 'spawn', p, yaw, sp: me.sp + 1, c: settings.char, hp: CHARACTERS[settings.char].hp });
}

export function addDummy(def, bot) {
  const r = new RemotePlayer(scene);
  r.setInfo(bot ? 'BOT' : 'DOCKA', bot ? '#ff4d6d' : '#c9ced8');
  r.setWeapon(bot ? 0 : 1);
  const d = { def, r, bot, hp: 100, respawnAt: 0, x: def.p[0], z: def.p[2], tx: def.p[0], tz: def.p[2], nextShot: 0, sp: 1 };
  r.push(performance.now(), d.x, 0, d.z, Math.PI, 0, 1, d.sp, 0, 0);
  dummies.push(d);
  return d;
}

export function toggleBots() {
  botsOn = !botsOn;
  if (botsOn) {
    for (let i = 0; i < 3; i++) addDummy({ p: [-12 + i * 8, 0, -5] }, true);
  } else {
    for (const d of dummies.filter((x) => x.bot)) d.r.dispose();
    for (let i = dummies.length - 1; i >= 0; i--) if (dummies[i].bot) dummies.splice(i, 1);
  }
  centerMsg(botsOn ? 'BOTTAR PÅ' : 'BOTTAR AV', botsOn ? 'De skjuter tillbaka!' : '');
}

export function resetStats() {
  Object.assign(stats, { shots: 0, hits: 0, heads: 0, kills: 0, dmg: 0 });
}

export function damageDummy(r, amount, head) {
  const d = dummies.find((x) => x.r === r);
  if (!d || !r.alive) return;
  d.hp -= amount;
  stats.dmg += amount;
  r.setInfo(`${d.bot ? 'BOT' : 'DOCKA'} ${Math.max(0, d.hp)}`, d.bot ? '#ff4d6d' : '#c9ced8');
  if (head) stats.heads++;
  const kill = d.hp <= 0;
  hitmarker(kill);
  damageNumber(r.pos.clone().setY(r.pos.y + (head ? 2 : 1.4)), amount, head, kill);
  if (head) sound.headshot(); else sound.hit();
  if (kill) {
    sound.kill();
    stats.kills++;
    r.die();
    d.respawnAt = performance.now() + 1500;
  }
}

export function practiceSlam() {
  for (const d of dummies) {
    if (!d.r.alive) continue;
    const dist = Math.hypot(d.r.pos.x - me.p[0], d.r.pos.z - me.p[2]);
    if (dist <= SLAM.radius) damageDummy(d.r, Math.round(SLAM.damage * (1 - (dist / SLAM.radius) * 0.5)), false);
  }
}

export const _botEye = new THREE.Vector3();
export function updatePractice(dt, now) {
  if (!me.alive && now - G.deathAt > RULES.respawnMs) practiceSpawn(false);

  for (const d of dummies) {
    const r = d.r;
    if (!r.alive) {
      if (now >= d.respawnAt) {
        d.hp = 100;
        d.sp++;
        r.setInfo(d.bot ? 'BOT' : 'DOCKA', d.bot ? '#ff4d6d' : '#c9ced8');
        r.push(now, d.x, 0, d.z, Math.PI, 0, 1, d.sp, 1, 0);
      } else {
        r.push(now, d.x, 0, d.z, r.yaw, 0, 0, d.sp, 0, 0);
      }
      r.update(now, dt);
      continue;
    }

    let yaw = Math.PI;
    if (d.bot) {
      // vandra runt ute på banan och skjut mot spelaren
      if (Math.hypot(d.tx - d.x, d.tz - d.z) < 0.5) { d.tx = -16 + Math.random() * 22; d.tz = -30 + Math.random() * 50; }
      // står still en stund när den skjuter, annars går den lugnt
      if (now >= (d.standUntil ?? 0)) {
        const dx = d.tx - d.x, dz = d.tz - d.z, l = Math.hypot(dx, dz) || 1;
        d.x += (dx / l) * 2.2 * dt;
        d.z += (dz / l) * 2.2 * dt;
      }
      yaw = Math.atan2(-(me.p[0] - d.x), -(me.p[2] - d.z));
      if (me.alive && now >= d.nextShot) {
        d.nextShot = now + 1100 + Math.random() * 900;
        d.standUntil = now + 700;
        botShoot(d, now);
      }
    } else if (d.def.move) {
      const t = (now / 1000) * d.def.speed / d.def.move;
      const k = d.def.strafe ? Math.sin(t * 2.3) * 0.6 + Math.sin(t * 5.1) * 0.4 : Math.sin(t);
      d.x = d.def.p[0] + k * d.def.move;
    }
    r.push(now, d.x, 0, d.z, yaw, 0, 1, d.sp, 0, 0);
    r.update(now, dt);
  }
}

export function botShoot(d, now) {
  const from = d.r.muzzlePos(_botEye);
  const eye = [d.x, PLAYER.EYE, d.z];
  const tx = me.p[0], ty = me.p[1] + 1.2, tz = me.p[2];
  const dir = [tx - eye[0], ty - eye[1], tz - eye[2]];
  const dist = Math.hypot(...dir);
  const nd = dir.map((v) => v / dist);
  const wall = raycastWorld(G.solids, eye, nd, dist);
  if (wall) return; // ser dig inte
  const hit = Math.random() < 0.33;
  const miss = hit ? [0, 0, 0] : [(Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3];
  const end = new THREE.Vector3(tx + miss[0], ty + miss[1], tz + miss[2]);
  effects.tracer(from.clone(), end);
  effects.flash(from.clone());
  sound.shoot(dist, panFor(from), 'rifle');
  if (!hit || now < (me.protectUntil ?? 0)) return;
  me.hp = Math.max(0, me.hp - (now < G.armorUntil ? 6 : 12));
  onMessage({ t: 'hurt', hp: me.hp, from: [d.x, d.z] });
  if (me.hp <= 0) {
    me.alive = false;
    G.firing = false;
    G.scoped = false;
    G.deathAt = now;
    G.killerId = null;
    $('death-by').innerHTML = 'av <b style="color:#ff4d6d">BOT</b>';
    $('death-weapon').innerHTML = '';
    $('death').classList.remove('hidden');
    sound.death();
  }
}

export function updatePracticeHud() {
  const radarOn = me.alive && performance.now() < G.radarUntil;
  for (const d of dummies) d.r.setMarked(radarOn);
  const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
  const hs = stats.hits ? Math.round((stats.heads / stats.hits) * 100) : 0;
  $('practice-stats').innerHTML = `
    <div class="ps-title">SKJUTBANAN</div>
    <div class="ps-grid">
      <span>Träff</span><b>${acc}%</b>
      <span>Headshots</span><b>${hs}%</b>
      <span>Kills</span><b>${stats.kills}</b>
      <span>Skada</span><b>${stats.dmg}</b>
      <span>Skott</span><b>${stats.shots}</b>
    </div>
    <div class="ps-keys"><kbd>H</kbd> gubbe · <kbd>B</kbd> bottar ${botsOn ? 'PÅ' : 'AV'} · <kbd>T</kbd> nollställ</div>`;
}
