import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PLAYER, makeSolids, moveBody, raycastWorld, rayBox, hitboxes } from './physics.js';
import { MAP } from './map.js';
import { buildWorld } from './world.js';
import { Effects } from './effects.js';
import { Sound } from './audio.js';
import { Weapon } from './weapon.js';
import { RemotePlayer } from './player.js';

const COLORS = ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff', '#ff8fab', '#f77f00', '#e9ecef'];
const WALK = 5.6, SPRINT = 8.8, ADS_SPEED = 3.4;
const FIRE_MS = 100, MAG = 30, RELOAD_MS = 1700;
const SEND_MS = 33, INTERP_MS = 100;
const STREAKS = { 3: 'PÅ GÅNG', 5: 'DOMINERAR', 7: 'OSTOPPBAR', 10: 'GUDALIK', 15: 'MOGGAD' };

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- inställningar ----------
const settings = { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], sens: 1, vol: 0.7 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('moggade') || '{}')); } catch {}
const saveSettings = () => { try { localStorage.setItem('moggade', JSON.stringify(settings)); } catch {} };

// ---------- rendering ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.02, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

const pr = renderer.getPixelRatio();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, {
  type: THREE.HalfFloatType, samples: 4,
}));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.5, 0.9));
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

buildWorld(scene, renderer, MAP);
const solids = makeSolids(MAP);
const effects = new Effects(scene);
const sound = new Sound();
sound.setVolume(settings.vol);
const weapon = new Weapon(camera, settings.color);
const flashLight = new THREE.PointLight('#ffb060', 0, 10, 2);
flashLight.position.set(0.1, -0.05, -0.6);
camera.add(flashLight);

// ---------- spelstatus ----------
const me = { id: null, p: [0, 0, 0], v: [0, 0, 0], ground: false, yaw: 0, pitch: 0, hp: 100, alive: false, sp: 0, protect: false, sprint: false, streak: 0 };
const gun = { ammo: MAG, lastShot: 0, reloading: false, reloadStart: 0, reloadEnd: 0, bloom: 0, recoil: 0 };
const remotes = new Map();
const roster = new Map();
let ws = null, playing = false, locked = false, roundOver = false, killLimit = 25;
let serverOffset = null, roundEndAt = 0, deathAt = 0, killerId = null;
let firing = false, ads = false, lookDX = 0, lookDY = 0;
let eyeY = null, bobT = 0, stepT = 0, lastSend = 0, flashT = 0, shake = 0, menuAngle = 0;
const keys = {};

// ---------- meny ----------
$('name').value = settings.name;
$('sens').value = settings.sens;
$('vol').value = settings.vol;
const sensLabel = () => { $('sens-val').textContent = Number(settings.sens).toFixed(2); };
sensLabel();
for (const c of COLORS) {
  const b = document.createElement('button');
  b.className = 'swatch' + (c === settings.color ? ' active' : '');
  b.style.background = c;
  b.onclick = () => {
    if (playing) return;
    settings.color = c;
    weapon.setColor(c);
    document.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === b));
  };
  $('colors').appendChild(b);
}
$('sens').oninput = (e) => { settings.sens = Number(e.target.value); sensLabel(); saveSettings(); };
$('vol').oninput = (e) => { settings.vol = Number(e.target.value); sound.setVolume(settings.vol); saveSettings(); };

$('play').onclick = () => {
  sound.init();
  settings.name = $('name').value.trim().slice(0, 16);
  saveSettings();
  if (!ws) connect();
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => { $('status').textContent = 'Klicka igen för att låsa musen'; });
  } catch {}
};

function showMenu(show) {
  $('menu').classList.toggle('hidden', !show);
  $('hud').classList.toggle('hidden', show || !playing);
  $('play').textContent = playing ? 'FORTSÄTT' : 'SPELA';
  $('name').disabled = playing;
  $('colors').classList.toggle('locked', playing);
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (playing) showScoreboard(true); return; }
  if (!locked) return;
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
});
addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab') showScoreboard(roundOver);
});
addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) firing = true;
  if (e.button === 2) ads = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) ads = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!locked || !me.alive) return;
  const s = 0.0022 * settings.sens * (ads ? 0.55 : 1);
  me.yaw -= e.movementX * s;
  me.pitch = clamp(me.pitch - e.movementY * s, -1.55, 1.55);
  lookDX += e.movementX;
  lookDY += e.movementY;
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  if (locked) { showMenu(false); return; }
  firing = false;
  ads = false;
  for (const k in keys) keys[k] = false;
  showMenu(true);
});

// ---------- nätverk ----------
function connect() {
  $('status').textContent = 'Ansluter…';
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => send({ t: 'join', name: settings.name, color: settings.color });
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    ws = null;
    playing = false;
    me.alive = false;
    for (const r of remotes.values()) r.dispose();
    remotes.clear();
    roster.clear();
    $('status').textContent = 'Anslutningen bröts – klicka SPELA för att återansluta';
    $('death').classList.add('hidden');
    $('roundend').classList.add('hidden');
    document.exitPointerLock();
    showMenu(true);
  };
}

function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

function onMessage(m) {
  switch (m.t) {
    case 'welcome':
      me.id = m.id;
      killLimit = m.killLimit;
      playing = true;
      roundOver = !!m.roundOver;
      $('status').textContent = '';
      showMenu(!locked);
      break;
    case 'spawn':
      me.p = [...m.p];
      me.v = [0, 0, 0];
      me.yaw = m.yaw;
      me.pitch = 0;
      me.sp = m.sp;
      me.alive = true;
      me.hp = 100;
      me.streak = 0;
      gun.ammo = MAG;
      gun.reloading = false;
      gun.recoil = 0;
      eyeY = null;
      $('death').classList.add('hidden');
      sound.spawn();
      break;
    case 's': onSnapshot(m); break;
    case 'roster': onRoster(m); break;
    case 'shot': {
      const r = remotes.get(m.id);
      if (!r) break;
      const from = r.muzzlePos(new THREE.Vector3());
      const to = new THREE.Vector3(...m.e);
      effects.tracer(from, to);
      effects.flash(from);
      if (!m.hit) effects.sparksAt(to);
      sound.shoot(Math.max(0.1, camera.position.distanceTo(from)), panFor(from));
      break;
    }
    case 'hc':
      hitmarker(m.kill);
      if (m.head) sound.headshot(); else sound.hit();
      if (m.kill) sound.kill();
      break;
    case 'hurt':
      me.hp = m.hp;
      damageIndicator(m.from);
      sound.hurt();
      shake = 0.6;
      $('vignette').classList.remove('flash');
      void $('vignette').offsetWidth;
      $('vignette').classList.add('flash');
      break;
    case 'kill': onKill(m); break;
    case 'roundEnd': {
      roundOver = true;
      roundEndAt = performance.now() + m.ms;
      const w = roster.get(m.winner);
      $('re-title').innerHTML = m.winner === me.id ? 'DU VANN!' : `<span style="color:${w?.color}">${esc(w?.name ?? '?')}</span> VANN`;
      $('roundend').classList.remove('hidden');
      firing = false;
      showScoreboard(true);
      break;
    }
    case 'roundStart':
      roundOver = false;
      $('roundend').classList.add('hidden');
      showScoreboard(false);
      centerMsg('NY RUNDA', '');
      break;
    case 'ping': send({ t: 'pong', s: m.s }); break;
    case 'leave': {
      const r = remotes.get(m.id);
      if (r) { r.dispose(); remotes.delete(m.id); }
      break;
    }
    case 'msg': feed(`<span class="sys">${esc(m.text)}</span>`); break;
    case 'full': $('status').textContent = 'Servern är full'; break;
  }
}

function onSnapshot(m) {
  const now = performance.now();
  const off = m.ts - now;
  if (serverOffset === null || Math.abs(off - serverOffset) > 250) serverOffset = off;
  else serverOffset += (off - serverOffset) * 0.05;

  for (const [id, x, y, z, yaw, pitch, hp, alive, sp, prot] of m.p) {
    if (id === me.id) { me.hp = hp; me.protect = !!prot; continue; }
    let r = remotes.get(id);
    if (!r) {
      r = new RemotePlayer(scene);
      const info = roster.get(id);
      if (info) r.setInfo(info.name, info.color);
      remotes.set(id, r);
    }
    r.push(m.ts, x, y, z, yaw, pitch, alive, sp, prot);
  }
}

function onRoster(m) {
  killLimit = m.killLimit;
  roster.clear();
  for (const p of m.list) {
    roster.set(p.id, p);
    remotes.get(p.id)?.setInfo(p.name, p.color);
  }
  for (const [id, r] of remotes) if (!roster.has(id)) { r.dispose(); remotes.delete(id); }
  renderScoreboard();
  renderTopbar();
}

function onKill(m) {
  const k = roster.get(m.k), v = roster.get(m.v);
  const name = (p, id) => `<b style="color:${p?.color ?? '#fff'}">${esc(id === me.id ? 'DU' : p?.name ?? '?')}</b>`;
  feed(`${name(k, m.k)} <span class="gun">${m.head ? '⌖' : '▸'}</span> ${name(v, m.v)}`);
  remotes.get(m.v)?.die();

  if (m.v === me.id) {
    me.alive = false;
    firing = false;
    deathAt = performance.now();
    killerId = m.k;
    $('death-by').innerHTML = `av ${name(k, m.k)}${m.head ? ' · HEADSHOT' : ''}`;
    $('death').classList.remove('hidden');
    sound.death();
  } else if (m.k === me.id) {
    me.streak = m.streak;
    centerMsg(m.head ? 'HEADSHOT' : 'ELIMINERAD', `${esc(v?.name ?? '')}${STREAKS[m.streak] ? ` · ${STREAKS[m.streak]}` : ''}`);
  }
  if (STREAKS[m.streak] && m.streak >= 5) feed(`<span class="sys">${esc(k?.name ?? '?')} ${STREAKS[m.streak]} (${m.streak} i rad)</span>`);
}

// ---------- vapen ----------
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _muzzle = new THREE.Vector3();

function currentSpread() {
  const hs = Math.hypot(me.v[0], me.v[2]);
  return (ads ? 0.002 : 0.012) + Math.min(hs / WALK, 1) * (ads ? 0.008 : 0.025) + (me.ground ? 0 : 0.05) + gun.bloom;
}

function startReload() {
  if (gun.reloading || gun.ammo === MAG || !me.alive) return;
  gun.reloading = true;
  gun.reloadStart = performance.now();
  gun.reloadEnd = gun.reloadStart + RELOAD_MS;
  sound.reload();
}

function tryFire(now) {
  if (roundOver || gun.reloading || now - gun.lastShot < FIRE_MS) return;
  if (gun.ammo <= 0) {
    gun.lastShot = now + 150;
    sound.empty();
    startReload();
    return;
  }
  gun.lastShot = now;
  gun.ammo--;

  camera.updateMatrixWorld();
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const spread = currentSpread();
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  const d = _fwd.clone().addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
  const o = [camera.position.x, camera.position.y, camera.position.z];
  const da = [d.x, d.y, d.z];

  // Lokal träffberäkning bara för effekter – servern bestämmer skadan.
  let best = 300, normal = null, hitPlayer = false;
  const w = raycastWorld(solids, o, da, 300);
  if (w) { best = w.t; normal = w.n; }
  for (const rp of remotes.values()) {
    if (!rp.alive) continue;
    const hb = hitboxes(rp.pos.x, rp.pos.y, rp.pos.z);
    for (const box of [hb.head, hb.body]) {
      const h = rayBox(o, da, box.min, box.max);
      if (h && h.t < best) { best = h.t; hitPlayer = true; }
    }
  }
  const end = new THREE.Vector3(o[0] + da[0] * best, o[1] + da[1] * best, o[2] + da[2] * best);
  weapon.muzzleWorld(_muzzle);
  effects.tracer(_muzzle, end);
  if (hitPlayer) effects.blood(end, d);
  else if (normal) effects.impact(end, new THREE.Vector3(...normal));

  weapon.fire();
  flashLight.intensity = 30;
  flashT = 0.05;
  sound.shoot();

  const kick = ads ? 0.006 : 0.011;
  me.pitch = Math.min(1.55, me.pitch + kick);
  me.yaw += (Math.random() - 0.5) * 0.006;
  gun.recoil += kick * 0.75;
  gun.bloom = Math.min(0.035, gun.bloom + 0.0045);

  send({ t: 'sh', o: o.map(r3), d: da.map((v) => Math.round(v * 10000) / 10000) });
}

// ---------- uppdatering ----------
function updateLocal(dt, now) {
  const hs0 = Math.hypot(me.v[0], me.v[2]);

  if (me.alive) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    me.sprint = !!(keys.ShiftLeft || keys.ShiftRight) && f > 0 && !ads && !firing && !gun.reloading;
    const speed = ads ? ADS_SPEED : me.sprint ? SPRINT : WALK;
    const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx = (wx / len) * speed; wz = (wz / len) * speed; }
    const k = Math.min(1, (me.ground ? 12 : 2.5) * dt);
    me.v[0] += (wx - me.v[0]) * k;
    me.v[2] += (wz - me.v[2]) * k;
    if (keys.Space && me.ground) { me.v[1] = PLAYER.JUMP; me.ground = false; sound.jump(); }

    const wasGround = me.ground, vy = me.v[1];
    moveBody(me, solids, dt);
    if (me.ground && !wasGround && vy < -5) { sound.land(); weapon.land = 1; }

    const hs = Math.hypot(me.v[0], me.v[2]);
    if (me.ground && hs > 1) {
      bobT += dt * hs * 1.5;
      stepT += dt * hs;
      if (stepT > (me.sprint ? 2.6 : 2.1)) { stepT = 0; sound.step(); }
    }

    if (gun.reloading && now >= gun.reloadEnd) { gun.reloading = false; gun.ammo = MAG; }
    if (firing) tryFire(now);
    gun.bloom = Math.max(0, gun.bloom - dt * 0.08);
    const rec = Math.min(gun.recoil, dt * 0.25);
    me.pitch -= rec;
    gun.recoil -= rec;

    const target = me.p[1] + PLAYER.EYE;
    if (eyeY === null || !me.ground || target < eyeY) eyeY = target;
    else eyeY += (target - eyeY) * Math.min(1, dt * 18);
  } else if (eyeY !== null) {
    eyeY += (me.p[1] + 0.5 - eyeY) * Math.min(1, dt * 3);
  }

  const bobAmt = me.ground && me.alive ? Math.min(hs0 / WALK, 1.5) : 0;
  shake *= Math.exp(-dt * 10);
  camera.position.set(me.p[0], (eyeY ?? me.p[1] + PLAYER.EYE) + Math.abs(Math.sin(bobT)) * 0.035 * bobAmt, me.p[2]);

  if (me.alive) {
    camera.rotation.set(
      me.pitch + (Math.random() - 0.5) * shake * 0.02,
      me.yaw + (Math.random() - 0.5) * shake * 0.02,
      Math.sin(bobT) * 0.004 * bobAmt,
    );
  } else {
    // dödskamera: sjunk ner, luta och vänd mot den som dödade dig
    const kr = remotes.get(killerId);
    if (kr) {
      const dx = kr.pos.x - me.p[0], dz = kr.pos.z - me.p[2];
      const target = Math.atan2(-dx, -dz);
      let diff = target - me.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      me.yaw += diff * Math.min(1, dt * 3);
      me.pitch += (0 - me.pitch) * Math.min(1, dt * 3);
    }
    const roll = Math.min(1, (now - deathAt) / 500) * 0.35;
    camera.rotation.set(me.pitch, me.yaw, roll);
  }

  const fov = ads && me.alive ? 55 : me.sprint ? 82 : 75;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }

  weapon.update(dt, {
    ads: ads && me.alive && !gun.reloading,
    sprint: me.sprint,
    bob: bobT,
    bobAmt,
    lookDX,
    lookDY,
    reload: gun.reloading ? (now - gun.reloadStart) / RELOAD_MS : -1,
    alive: me.alive,
  });
  lookDX = lookDY = 0;

  flashT -= dt;
  if (flashT <= 0) flashLight.intensity = 0;

  if (me.alive && now - lastSend > SEND_MS) {
    lastSend = now;
    send({ t: 'st', p: me.p.map(r2), y: r3(me.yaw), x: r3(me.pitch), m: hs0 > 0.5 ? 1 : 0, sp: me.sp });
  }
}

function menuCamera(dt) {
  menuAngle += dt * 0.06;
  camera.position.set(Math.cos(menuAngle) * 34, 13, Math.sin(menuAngle) * 34);
  camera.lookAt(0, 1.5, 0);
  weapon.root.visible = false;
}

function panFor(pos) {
  const v = pos.clone().applyMatrix4(camera.matrixWorldInverse);
  return clamp(v.x / (Math.hypot(v.x, v.z) || 1), -1, 1) * 0.8;
}

// ---------- HUD ----------
function hitmarker(kill) {
  const el = $('hitmarker');
  el.className = '';
  void el.offsetWidth;
  el.className = kill ? 'show kill' : 'show';
}

function damageIndicator(from) {
  const dx = from[0] - me.p[0], dz = from[1] - me.p[2];
  const rel = Math.atan2(-dx, -dz) - me.yaw;
  const el = document.createElement('div');
  el.className = 'dmg';
  el.style.transform = `translate(-50%, -50%) rotate(${-rel}rad)`;
  $('dmg-indicators').appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function feed(html) {
  const el = document.createElement('div');
  el.className = 'entry';
  el.innerHTML = html;
  const kf = $('killfeed');
  kf.prepend(el);
  while (kf.children.length > 6) kf.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 5500);
  setTimeout(() => el.remove(), 6000);
}

let centerTimer = 0;
function centerMsg(title, sub) {
  const el = $('center-msg');
  el.innerHTML = `<div class="big">${title}</div><div class="small">${sub}</div>`;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(centerTimer);
  centerTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function sortedRoster() {
  return [...roster.values()].sort((a, b) => b.k - a.k || a.d - b.d);
}

function renderScoreboard() {
  $('sb-limit').textContent = `Först till ${killLimit} kills vinner`;
  $('sb-body').innerHTML = sortedRoster().map((p, i) => `
    <tr class="${p.id === me.id ? 'me' : ''}">
      <td>${i + 1}</td>
      <td><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</td>
      <td>${p.k}</td><td>${p.d}</td><td>${(p.k / Math.max(1, p.d)).toFixed(2)}</td><td>${p.ping}</td>
    </tr>`).join('');
}

function renderTopbar() {
  const list = sortedRoster();
  const mine = roster.get(me.id);
  const rank = list.findIndex((p) => p.id === me.id) + 1;
  const leader = list[0];
  $('my-score').innerHTML = mine ? `<b>${mine.k}</b><span>/ ${killLimit}</span><small>PLATS ${rank} AV ${list.length}</small>` : '';
  $('leader').innerHTML = leader && leader.id !== me.id
    ? `LEDARE <b style="color:${leader.color}">${esc(leader.name)}</b> ${leader.k}`
    : list.length > 1 ? '<b>DU LEDER</b>' : '';
  $('ping').textContent = mine ? `${mine.ping} ms` : '';
}

function showScoreboard(show) {
  $('scoreboard').classList.toggle('hidden', !show);
}

function updateHud(now) {
  if (!playing) return;
  $('hp-num').textContent = me.hp;
  const bar = $('hp-bar');
  bar.style.width = `${me.hp}%`;
  bar.style.background = me.hp > 60 ? '#e9ecef' : me.hp > 30 ? '#ffb703' : '#ff4d6d';
  $('ammo-num').textContent = gun.ammo;
  $('ammo-num').classList.toggle('low', gun.ammo <= 8);
  $('reload-hint').textContent = gun.reloading ? 'LADDAR OM…' : gun.ammo <= 8 ? 'R – LADDA OM' : '';
  $('vignette').style.opacity = me.alive && me.hp < 60 ? (1 - me.hp / 60) * 0.85 : 0;
  $('protect').classList.toggle('hidden', !(me.alive && me.protect));

  const ch = $('crosshair');
  ch.classList.toggle('hidden', !me.alive || ads || me.sprint);
  ch.style.setProperty('--gap', `${6 + currentSpread() * 500}px`);

  if (!me.alive && !roundOver) {
    const left = Math.max(0, 3 - (now - deathAt) / 1000);
    $('death-timer').textContent = `Återupplivas om ${left.toFixed(1)}`;
  }
  if (roundOver) {
    $('re-timer').textContent = `Ny runda om ${Math.max(0, Math.ceil((roundEndAt - now) / 1000))}`;
  }
}

// ---------- loop ----------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  if (playing) updateLocal(dt, now);
  else menuCamera(dt);
  const rt = serverOffset === null ? 0 : now + serverOffset - INTERP_MS;
  for (const r of remotes.values()) r.update(rt, dt);
  effects.update(dt);
  updateHud(now);
  composer.render();
}
showMenu(true);
frame();
