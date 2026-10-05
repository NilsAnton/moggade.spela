import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PLAYER, makeSolids, moveBody, raycastWorld, rayBox, hitboxes } from './physics.js';
import { MAPS } from './maps.js';
import { WEAPONS } from './weapons.js';
import { buildWorld } from './world.js';
import { Effects } from './effects.js';
import { Sound } from './audio.js';
import { Weapon } from './weapon.js';
import { RemotePlayer } from './player.js';

const COLORS = ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff', '#ff8fab', '#f77f00', '#e9ecef'];
const WALK = 5.6, SPRINT = 8.8, ADS_SPEED = 3.4;
const SEND_MS = 33, INTERP_MS = 100;
const STREAKS = { 3: 'PÅ GÅNG', 5: 'DOMINERAR', 7: 'OSTOPPBAR', 10: 'GUDALIK', 15: 'MOGGAD' };

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ---------- inställningar ----------
const settings = { name: '', color: COLORS[Math.floor(Math.random() * COLORS.length)], sens: 1, vol: 0.7, weapon: 0 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('moggade') || '{}')); } catch {}
if (!WEAPONS[settings.weapon]) settings.weapon = 0;
const saveSettings = () => { try { localStorage.setItem('moggade', JSON.stringify(settings)); } catch {} };

// ---------- rendering ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
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
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.4, 0.95));
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

let mapIndex = -1, solids = [], disposeWorld = null;
function loadMap(i) {
  if (i === mapIndex) return;
  disposeWorld?.();
  mapIndex = i;
  disposeWorld = buildWorld(scene, renderer, MAPS[i]);
  solids = makeSolids(MAPS[i].boxes);
}
loadMap(0);

const effects = new Effects(scene);
const sound = new Sound();
sound.setVolume(settings.vol);
const weapon = new Weapon(camera, settings.color);
weapon.setType(WEAPONS[settings.weapon].id);
const flashLight = new THREE.PointLight('#ffb060', 0, 10, 2);
flashLight.position.set(0.1, -0.05, -0.6);
camera.add(flashLight);

// ---------- spelstatus ----------
const me = { id: null, p: [0, 0, 0], v: [0, 0, 0], ground: false, yaw: 0, pitch: 0, hp: 100, alive: false, sp: 0, protect: false, sprint: false, streak: 0 };
let W = WEAPONS[settings.weapon];
const gun = { ammo: W.mag, lastShot: 0, reloading: false, reloadStart: 0, reloadEnd: 0, bloom: 0, recoil: 0, trigger: true };
const remotes = new Map();
const roster = new Map();
let ws = null, playing = false, locked = false, roundOver = false, killLimit = 25;
let serverOffset = null, roundEndAt = 0, roundDeadline = 0, deathAt = 0, killerId = null;
let firing = false, ads = false, lookDX = 0, lookDY = 0;
let eyeY = null, bobT = 0, stepT = 0, lastSend = 0, flashT = 0, shake = 0, menuAngle = 0, scoped = false;
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

const STAT_NAMES = { dmg: 'Skada', rate: 'Eldhastighet', range: 'Räckvidd', mobility: 'Rörlighet' };
WEAPONS.forEach((w, i) => {
  const card = document.createElement('button');
  card.className = 'weapon-card' + (i === settings.weapon ? ' active' : '');
  card.innerHTML = `
    <div class="w-head"><span class="w-key">${i + 1}</span><span class="w-name">${w.name}</span></div>
    <div class="w-desc">${w.desc}</div>
    ${Object.entries(w.stats).map(([k, v]) => `<div class="stat"><span>${STAT_NAMES[k]}</span><i><b style="width:${v * 100}%"></b></i></div>`).join('')}`;
  card.onclick = () => selectWeapon(i);
  $('weapons').appendChild(card);
});

function selectWeapon(i) {
  settings.weapon = i;
  saveSettings();
  document.querySelectorAll('.weapon-card').forEach((c, j) => c.classList.toggle('active', j === i));
  if (playing) {
    send({ t: 'loadout', w: i });
    $('weapon-note').textContent = me.alive ? `${WEAPONS[i].name} – byts när du spawnar nästa gång` : '';
  } else {
    W = WEAPONS[i];
    weapon.setType(W.id);
  }
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
  if (!show) $('weapon-note').textContent = '';
}

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Tab') { e.preventDefault(); if (playing) showScoreboard(true); return; }
  if (!locked) return;
  keys[e.code] = true;
  if (e.code === 'KeyR') startReload();
  // 1–4 byter vapen när du är död
  const n = Number(e.key) - 1;
  if (!me.alive && WEAPONS[n]) { selectWeapon(n); updateDeathWeapon(); }
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
  if (e.button === 0) { firing = false; gun.trigger = true; }
  if (e.button === 2) ads = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (!locked || !me.alive) return;
  const zoom = camera.fov / 75;
  const s = 0.0022 * settings.sens * (ads ? Math.max(0.3, zoom) : 1);
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
  ws.onopen = () => send({ t: 'join', name: settings.name, color: settings.color, w: settings.weapon });
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
      roundDeadline = performance.now() + m.left;
      loadMap(m.map);
      $('status').textContent = '';
      showMenu(!locked);
      break;
    case 'spawn':
      W = WEAPONS[m.w] ?? WEAPONS[0];
      weapon.setType(W.id);
      me.p = [...m.p];
      me.v = [0, 0, 0];
      me.yaw = m.yaw;
      me.pitch = 0;
      me.sp = m.sp;
      me.alive = true;
      me.hp = 100;
      me.streak = 0;
      gun.ammo = W.mag;
      gun.reloading = false;
      gun.recoil = 0;
      gun.bloom = 0;
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
      const ends = Array.isArray(m.e[0]) ? m.e : [m.e];
      for (const e of ends) {
        const to = new THREE.Vector3(...e);
        effects.tracer(from, to);
        if (!m.hit) effects.sparksAt(to);
      }
      effects.flash(from);
      sound.shoot(Math.max(0.1, camera.position.distanceTo(from)), panFor(from), WEAPONS[m.w]?.id);
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
      $('re-next').textContent = `Nästa bana: ${m.next}`;
      $('roundend').classList.remove('hidden');
      firing = false;
      showScoreboard(true);
      break;
    }
    case 'roundStart':
      roundOver = false;
      roundDeadline = performance.now() + m.left;
      loadMap(m.map);
      for (const r of remotes.values()) r.buf.length = 0;
      $('roundend').classList.add('hidden');
      showScoreboard(false);
      centerMsg(MAPS[m.map].name, 'NY RUNDA');
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
      if (info) { r.setInfo(info.name, info.color); r.setWeapon(info.w); }
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
    const r = remotes.get(p.id);
    if (r) { r.setInfo(p.name, p.color); r.setWeapon(p.w); }
  }
  for (const [id, r] of remotes) if (!roster.has(id)) { r.dispose(); remotes.delete(id); }
  renderScoreboard();
  renderTopbar();
}

function updateDeathWeapon() {
  $('death-weapon').innerHTML = WEAPONS.map((w, i) =>
    `<span class="${i === settings.weapon ? 'on' : ''}"><kbd>${i + 1}</kbd>${w.name}</span>`).join('');
}

function onKill(m) {
  const k = roster.get(m.k), v = roster.get(m.v);
  const name = (p, id) => `<b style="color:${p?.color ?? '#fff'}">${esc(id === me.id ? 'DU' : p?.name ?? '?')}</b>`;
  const wname = WEAPONS[m.w]?.name ?? '';
  feed(`${name(k, m.k)} <span class="gun">${m.head ? '⌖ ' : ''}${wname}</span> ${name(v, m.v)}`);
  remotes.get(m.v)?.die();

  if (m.v === me.id) {
    me.alive = false;
    firing = false;
    scoped = false;
    deathAt = performance.now();
    killerId = m.k;
    $('death-by').innerHTML = `av ${name(k, m.k)} · ${wname}${m.head ? ' · HEADSHOT' : ''}`;
    updateDeathWeapon();
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
  const aiming = ads && weapon.adsK > 0.7;
  const base = aiming ? W.adsSpread : W.hip;
  return base + Math.min(hs / WALK, 1) * W.moveSpread * (aiming ? 0.6 : 1) + (me.ground ? 0 : 0.05) + gun.bloom;
}

function startReload() {
  if (gun.reloading || gun.ammo === W.mag || !me.alive) return;
  gun.reloading = true;
  gun.reloadStart = performance.now();
  gun.reloadEnd = gun.reloadStart + W.reloadMs;
  sound.reload(W.reloadMs / 1700);
}

function tryFire(now) {
  if (roundOver || gun.reloading || now - gun.lastShot < W.fireMs) return;
  if (!W.auto && !gun.trigger) return;
  gun.trigger = false;
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
  const o = [camera.position.x, camera.position.y, camera.position.z];
  const spread = currentSpread();
  weapon.muzzleWorld(_muzzle);
  const dirs = [];

  for (let i = 0; i < W.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const d = _fwd.clone().addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    const da = [d.x, d.y, d.z];
    dirs.push(da.map((v) => Math.round(v * 10000) / 10000));

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
    if (!scoped) effects.tracer(_muzzle, end);
    if (hitPlayer) effects.blood(end, d);
    else if (normal) effects.impact(end, new THREE.Vector3(...normal));
  }

  weapon.fire();
  flashLight.intensity = 25;
  flashT = 0.05;
  sound.shoot(0, 0, W.id);

  const kick = W.kick * (ads ? 0.6 : 1);
  me.pitch = Math.min(1.55, me.pitch + kick);
  me.yaw += (Math.random() - 0.5) * kick * 0.5;
  gun.recoil += kick * 0.75;
  gun.bloom = Math.min(0.035, gun.bloom + W.hip * 0.35);

  send({ t: 'sh', o: o.map(r3), d: W.pellets > 1 ? dirs : dirs[0] });
  if (W.id === 'sniper') setTimeout(() => { if (me.alive && gun.ammo > 0) sound.bolt(); }, 350);
}

// ---------- uppdatering ----------
function updateLocal(dt, now) {
  const hs0 = Math.hypot(me.v[0], me.v[2]);

  if (me.alive) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    me.sprint = !!(keys.ShiftLeft || keys.ShiftRight) && f > 0 && !ads && !firing && !gun.reloading;
    const speed = (ads ? ADS_SPEED : me.sprint ? SPRINT : WALK) * W.speed;
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

    if (gun.reloading && now >= gun.reloadEnd) { gun.reloading = false; gun.ammo = W.mag; }
    if (firing) tryFire(now);
    gun.bloom = Math.max(0, gun.bloom - dt * 0.08);
    const rec = Math.min(gun.recoil, dt * (W.kick > 0.03 ? 0.4 : 0.25));
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
      let diff = Math.atan2(-dx, -dz) - me.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      me.yaw += diff * Math.min(1, dt * 3);
      me.pitch += (0 - me.pitch) * Math.min(1, dt * 3);
    }
    const roll = Math.min(1, (now - deathAt) / 500) * 0.35;
    camera.rotation.set(me.pitch, me.yaw, roll);
  }

  const aiming = ads && me.alive && !gun.reloading;
  scoped = !!W.scope && aiming && weapon.adsK > 0.8;
  const fov = aiming ? (W.scope && weapon.adsK < 0.8 ? 50 : W.adsFov) : me.sprint ? 82 : 75;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }

  weapon.update(dt, {
    ads: aiming,
    sprint: me.sprint,
    bob: bobT,
    bobAmt,
    lookDX,
    lookDY,
    reload: gun.reloading ? (now - gun.reloadStart) / W.reloadMs : -1,
    alive: me.alive,
    hidden: scoped,
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
  $('sb-limit').textContent = `${MAPS[mapIndex]?.name ?? ''} · först till ${killLimit} kills`;
  $('sb-body').innerHTML = sortedRoster().map((p, i) => `
    <tr class="${p.id === me.id ? 'me' : ''}">
      <td>${i + 1}</td>
      <td><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</td>
      <td class="muted">${WEAPONS[p.w]?.name ?? ''}</td>
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
  $('ammo-num').classList.toggle('low', gun.ammo <= Math.ceil(W.mag / 4));
  $('weapon-name').textContent = W.name;
  $('reload-hint').textContent = gun.reloading ? 'LADDAR OM…' : gun.ammo <= Math.ceil(W.mag / 4) ? 'R – LADDA OM' : '';
  $('vignette').style.opacity = me.alive && me.hp < 60 ? (1 - me.hp / 60) * 0.85 : 0;
  $('protect').classList.toggle('hidden', !(me.alive && me.protect));
  $('scope').classList.toggle('hidden', !scoped);

  const ch = $('crosshair');
  ch.classList.toggle('hidden', !me.alive || (ads && weapon.adsK > 0.5) || me.sprint);
  ch.style.setProperty('--gap', `${6 + currentSpread() * 500}px`);

  const left = Math.max(0, roundDeadline - now) / 1000;
  $('timer').textContent = roundOver ? '' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  $('timer').classList.toggle('low', left < 30);

  if (!me.alive && !roundOver) {
    $('death-timer').textContent = `Återupplivas om ${Math.max(0, 3 - (now - deathAt) / 1000).toFixed(1)}`;
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
