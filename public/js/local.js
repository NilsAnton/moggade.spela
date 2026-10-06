import * as THREE from 'three';
import { PLAYER, moveBody, raycastWorld, rayBox, hitboxes } from './physics.js';
import { WEAPONS, damageAt } from './weapons.js';
import { ARMOR, ABILITY } from './characters.js';
import { G, gun, keys, me, remotes, settings } from './state.js';
import { ADS_SPEED, SEND_MS, SPRINT, WALK, camera, clamp, effects, flashLight, r2, r3, sound, weapon } from './core.js';
import { centerMsg } from './hud.js';
import { send } from './net.js';
import { damageDummy, dummies, practiceSlam, stats } from './practice.js';

// ---------- vapen ----------
export const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(), _muzzle = new THREE.Vector3();

export function currentSpread() {
  const hs = Math.hypot(me.v[0], me.v[2]);
  const aiming = G.ads && weapon.adsK > 0.7;
  const base = aiming ? G.W.adsSpread : G.W.hip;
  return base + Math.min(hs / WALK, 1) * G.W.moveSpread * (aiming ? 0.6 : 1) + (me.ground ? 0 : 0.05) + gun.bloom;
}

export const KNIFE_W = WEAPONS.find((w) => w.id === 'knife');

// Visar rätt vapenmodell med spelarens skin
export function showWeapon() {
  weapon.setType(G.W.id, settings.skins?.[G.W.id]);
}

// 1 = huvudvapnet, 2 = kniven. Ammo och omladdning sparas per plats (laddar klart i bakgrunden).
export function switchSlot(s) {
  if (!me.alive || s === G.slot) return;
  const now = performance.now();
  G.slotGun[G.slot] = { ammo: gun.ammo, reloading: gun.reloading, reloadStart: gun.reloadStart, reloadEnd: gun.reloadEnd };
  G.slot = s;
  G.W = s === 1 ? KNIFE_W : G.primaryW;
  const sv = G.slotGun[s];
  if (sv) Object.assign(gun, sv);
  else Object.assign(gun, { ammo: G.W.mag, reloading: false });
  if (gun.reloading && now >= gun.reloadEnd) { gun.reloading = false; gun.ammo = G.W.mag; }
  gun.lastShot = now - G.W.fireMs + 250; // dra fram vapnet innan man kan skjuta
  gun.recoil = 0;
  G.ads = false;
  showWeapon();
  weapon.cancelInspect();
  sound.whoosh();
  if (!G.practice) send({ t: 'slot', s });
}

export function inspectWeapon() {
  if (!me.alive || G.firing || G.ads || gun.reloading) return;
  weapon.inspect();
}

export function startReload() {
  if (gun.reloading || gun.ammo === G.W.mag || !me.alive) return;
  gun.reloading = true;
  gun.reloadStart = performance.now();
  gun.reloadEnd = gun.reloadStart + G.W.reloadMs;
  sound.reload(G.W.reloadMs / 1700);
  if (!G.practice) send({ t: 'rl' });
}

export function tryFire(now) {
  if (G.roundOver || gun.reloading || now - gun.lastShot < G.W.fireMs) return;
  if (!G.W.auto && !gun.trigger) return;
  gun.trigger = false;
  if (gun.ammo <= 0) {
    gun.lastShot = now + 150;
    sound.empty();
    startReload();
    return;
  }
  gun.lastShot = now;
  gun.ammo--;
  G.shake = Math.max(G.shake, G.W.kick * 6);

  camera.updateMatrixWorld();
  _fwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  const o = [camera.position.x, camera.position.y, camera.position.z];
  const spread = currentSpread();
  weapon.muzzleWorld(_muzzle);
  const dirs = [];
  const targets = G.practice ? dummies.map((dm) => dm.r) : [...remotes.values()];
  const practiceHits = new Map();

  for (let i = 0; i < G.W.pellets; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
    const d = _fwd.clone().addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    const da = [d.x, d.y, d.z];
    dirs.push(da.map((v) => Math.round(v * 10000) / 10000));

    // Lokal träffberäkning bara för effekter – servern bestämmer skadan.
    let best = G.W.melee ? G.W.range : 300, normal = null, hitPlayer = null, hitHead = false;
    const w = raycastWorld(G.solids, o, da, best);
    if (w) { best = w.t; normal = w.n; }
    for (const rp of targets) {
      if (!rp.alive) continue;
      const hb = hitboxes(rp.pos.x, rp.pos.y, rp.pos.z);
      for (const box of [hb.head, hb.body]) {
        const h = rayBox(o, da, box.min, box.max);
        if (h && h.t < best) { best = h.t; hitPlayer = rp; hitHead = box === hb.head; }
      }
    }
    if (G.practice && hitPlayer) {
      const cur = practiceHits.get(hitPlayer) ?? { amount: 0, head: false };
      cur.amount += damageAt(G.W, hitHead, best);
      cur.head ||= hitHead;
      practiceHits.set(hitPlayer, cur);
    }
    const end = new THREE.Vector3(o[0] + da[0] * best, o[1] + da[1] * best, o[2] + da[2] * best);
    if (!G.scoped && !G.W.melee) effects.tracer(_muzzle, end);
    if (hitPlayer) effects.blood(end, d);
    else if (normal) effects.impact(end, new THREE.Vector3(...normal));
  }

  weapon.fire();
  weapon.cancelInspect();
  flashLight.intensity = 25;
  G.flashT = 0.05;
  if (G.W.melee) sound.whoosh(); else sound.shoot(0, 0, G.W.id);

  const kick = G.W.kick * (G.ads ? 0.6 : 1);
  me.pitch = Math.min(1.55, me.pitch + kick);
  me.yaw += (Math.random() - 0.5) * kick * 0.5;
  gun.recoil += kick * 0.75;
  gun.bloom = Math.min(0.035, gun.bloom + G.W.hip * 0.35);

  if (G.practice) {
    stats.shots++;
    if (practiceHits.size) stats.hits++;
    for (const [r, { amount, head }] of practiceHits) damageDummy(r, amount, head);
  }
  send({ t: 'sh', o: o.map(r3), d: G.W.pellets > 1 ? dirs : dirs[0] });
  if (G.W.id === 'sniper') setTimeout(() => { if (me.alive && gun.ammo > 0) sound.bolt(); }, 350);
}

// ---------- uppdatering ----------
export function updateLocal(dt, now) {
  const hs0 = Math.hypot(me.v[0], me.v[2]);

  if (me.alive) {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    me.sprint = !!(keys.ShiftLeft || keys.ShiftRight) && f > 0 && !G.ads && !G.firing && !gun.reloading && me.slideT <= 0;
    // kniven framme: lite snabbare
    const speed = (G.ads ? ADS_SPEED : me.sprint ? SPRINT : WALK) * G.C.speed * (G.W.melee ? G.W.speed : 1);
    const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
    let wx = -sin * f + cos * s, wz = -cos * f - sin * s;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx = (wx / len) * speed; wz = (wz / len) * speed; }

    me.slideT -= dt;
    me.slideCd -= dt;
    me.dashT -= dt;
    // Under glidning och dash behåller du farten – annars styr du som vanligt.
    // håller du hopp när du landar slipper du markfriktionen den rutan
    const hopping = keys.Space && now - (me.landedAt ?? 0) < 120;
    let accel = me.ground && !hopping ? 12 : 2.5;
    if (me.slideT > 0) { accel = 0.9; wx *= 0.2; wz *= 0.2; }
    if (me.dashT > 0) accel = 0;
    const k = Math.min(1, accel * dt);
    const before = Math.hypot(me.v[0], me.v[2]);
    me.v[0] += (wx - me.v[0]) * k;
    me.v[2] += (wz - me.v[2]) * k;
    // I luften tappar du aldrig fart när du styr – det är det som gör bunny hop möjligt.
    if (!me.ground && me.dashT <= 0) {
      const after = Math.hypot(me.v[0], me.v[2]);
      if (after > 0.01 && after < before && len > 0) {
        me.v[0] *= before / after;
        me.v[2] *= before / after;
      }
    }
    if (keys.Space && me.ground) G.jumpQueued = true;
    if (me.slideT > 0 && Math.hypot(me.v[0], me.v[2]) < 4) me.slideT = 0;

    if (G.jumpQueued) {
      if (me.ground) {
        me.v[1] = PLAYER.JUMP;
        me.ground = false;
        if (me.slideT > 0) { me.slideT = 0; me.v[0] *= 1.08; me.v[2] *= 1.08; }
        // bunny hop: hoppar du direkt när du landar får du lite extra fart, upp till ett tak
        if (now - me.landedAt < 120) {
          const hs = Math.hypot(me.v[0], me.v[2]), cap = 13 * G.C.speed;
          const boost = hs > 0.1 ? Math.min(hs * 1.07, Math.max(hs, cap)) / hs : 1;
          me.v[0] *= boost;
          me.v[2] *= boost;
        }
        sound.jump();
      }
    }
    G.jumpQueued = false;
    // fartspärr: glidhopp och bunny hop kan inte bygga upp fart i all oändlighet
    const hsNow = Math.hypot(me.v[0], me.v[2]);
    if (hsNow > PLAYER.MAX_HS) { me.v[0] *= PLAYER.MAX_HS / hsNow; me.v[2] *= PLAYER.MAX_HS / hsNow; }

    const wasGround = me.ground, vy = me.v[1];
    moveBody(me, G.solids, dt);
    if (me.ground && !wasGround) {
      me.landedAt = now;
      if (me.slamArmed) {
        me.slamArmed = false;
        if (G.practice) practiceSlam();
        send({ t: 'ab' });
        effects.shockwave(new THREE.Vector3(me.p[0], me.p[1], me.p[2]));
        sound.slam();
        G.shake = 1.5;
      } else if (vy < -5) { sound.land(); weapon.land = 1; }
    }

    const hs = Math.hypot(me.v[0], me.v[2]);
    if (me.ground && hs > 1) {
      G.bobT += dt * hs * 1.5;
      G.stepT += dt * hs;
      if (G.stepT > (me.sprint ? 2.6 : 2.1)) { G.stepT = 0; sound.step(); }
    }

    if (gun.reloading && now >= gun.reloadEnd) { gun.reloading = false; gun.ammo = G.W.mag; }
    if (G.firing) tryFire(now);
    gun.bloom = Math.max(0, gun.bloom - dt * 0.08);
    const rec = Math.min(gun.recoil, dt * (G.W.kick > 0.03 ? 0.4 : 0.25));
    me.pitch -= rec;
    gun.recoil -= rec;

    const target = me.p[1] + (me.slideT > 0 ? 0.95 : PLAYER.EYE);
    if (G.eyeY === null || (!me.ground && me.slideT <= 0)) G.eyeY = target;
    else G.eyeY += (target - G.eyeY) * Math.min(1, dt * (target < G.eyeY ? 14 : 18));
  } else if (G.eyeY !== null) {
    G.eyeY += (me.p[1] + 0.5 - G.eyeY) * Math.min(1, dt * 3);
  }

  const bobAmt = me.ground && me.alive ? Math.min(hs0 / WALK, 1.5) : 0;
  G.shake *= Math.exp(-dt * 10);
  camera.position.set(me.p[0], (G.eyeY ?? me.p[1] + PLAYER.EYE) + Math.abs(Math.sin(G.bobT)) * 0.035 * bobAmt, me.p[2]);

  if (me.alive) {
    camera.rotation.set(
      me.pitch + (Math.random() - 0.5) * G.shake * 0.02,
      me.yaw + (Math.random() - 0.5) * G.shake * 0.02,
      Math.sin(G.bobT) * 0.004 * bobAmt,
    );
  } else {
    // dödskamera: sjunk ner, luta och vänd mot den som dödade dig
    const kr = remotes.get(G.killerId);
    if (kr) {
      const dx = kr.pos.x - me.p[0], dz = kr.pos.z - me.p[2];
      let diff = Math.atan2(-dx, -dz) - me.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      me.yaw += diff * Math.min(1, dt * 3);
      me.pitch += (0 - me.pitch) * Math.min(1, dt * 3);
    }
    const roll = Math.min(1, (now - G.deathAt) / 500) * 0.35;
    camera.rotation.set(me.pitch, me.yaw, roll);
  }

  const aiming = G.ads && me.alive && !gun.reloading;
  G.scoped = !!G.W.scope && aiming && weapon.adsK > 0.45;
  G.fovPunch *= Math.exp(-dt * 6);
  const fov = (aiming ? (G.W.scope && weapon.adsK < 0.45 ? 50 : G.W.adsFov) : settings.fov + (me.sprint ? 7 : 0)) + G.fovPunch * 4;
  // hjärtslag när du har lite hälsa
  if (me.alive && G.playing && me.hp > 0 && me.hp < me.maxHp * 0.3) {
    G.heartT -= dt;
    if (G.heartT <= 0) { G.heartT = 0.85; sound.heartbeat(); }
  }
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * (G.fovPunch > 0.5 ? 30 : 14));
    camera.updateProjectionMatrix();
  }

  weapon.update(dt, {
    ads: aiming,
    sprint: me.sprint,
    bob: G.bobT,
    bobAmt,
    lookDX: G.lookDX,
    lookDY: G.lookDY,
    reload: gun.reloading ? (now - gun.reloadStart) / G.W.reloadMs : -1,
    alive: me.alive,
    hidden: G.scoped,
  });
  G.lookDX = G.lookDY = 0;

  G.flashT -= dt;
  if (G.flashT <= 0) flashLight.intensity = 0;

  if (me.alive && now - G.lastSend > SEND_MS) {
    G.lastSend = now;
    send({ t: 'st', p: me.p.map(r2), y: r3(me.yaw), x: r3(me.pitch), m: hs0 > 0.5 ? 1 : 0, s: me.slideT > 0 ? 1 : 0, sp: me.sp });
  }
}

export function startSlide() {
  if (!me.alive || !me.ground || me.slideCd > 0) return;
  const hs = Math.hypot(me.v[0], me.v[2]);
  if (hs < WALK * 0.8) return;
  const boost = Math.max(hs, 11.5 * G.C.speed) / hs;
  me.v[0] *= boost;
  me.v[2] *= boost;
  me.slideT = 0.75;
  me.slideCd = 1.1;
  sound.slide();
}

export function useAbility() {
  const now = performance.now();
  if (!me.alive || G.roundOver || now < me.abilityReady) return;
  const id = G.C.ability.id;
  const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);

  if (id === 'stim') {
    if (me.hp >= me.maxHp) return;
    if (G.practice) {
      me.hp = Math.min(me.maxHp, me.hp + ABILITY.stimHp);
      effects.heal(new THREE.Vector3(me.p[0], me.p[1] + 1, me.p[2]));
    }
    send({ t: 'ab' });
    sound.stim();
  } else if (id === 'dash') {
    const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    let dx = -fx * f + fz * s, dz = -fz * f - fx * s;
    const l = Math.hypot(dx, dz);
    if (l === 0) { dx = -fx; dz = -fz; } else { dx /= l; dz /= l; }
    me.v[0] = dx * ABILITY.dashSpeed;
    me.v[2] = dz * ABILITY.dashSpeed;
    me.v[1] = Math.max(me.v[1], 1.5);
    me.dashT = 0.2;
    sound.whoosh();
  } else if (id === 'slam') {
    if (me.ground) {
      me.v[1] = 9;
      me.v[0] = -fx * 9;
      me.v[2] = -fz * 9;
      me.ground = false;
    } else {
      me.v[1] = -22;
    }
    me.slamArmed = true;
    sound.whoosh();
  } else if (id === 'leap') {
    me.v[1] = ABILITY.leapPower;
    me.ground = false;
    sound.whoosh();
  } else if (id === 'radar') {
    G.radarUntil = now + ABILITY.radarMs;
    send({ t: 'ab' });
    sound.radar();
    centerMsg('RADAR', 'Fiender syns genom väggar');
  } else if (id === 'armor') {
    if (G.practice) { G.armorUntil = now + ARMOR.ms; effects.heal(new THREE.Vector3(me.p[0], me.p[1] + 1, me.p[2])); }
    send({ t: 'ab' });
    sound.armor();
  }
  me.abilityReady = now + G.C.ability.cooldown;
}

export function menuCamera(dt) {
  G.menuAngle += dt * 0.06;
  camera.position.set(Math.cos(G.menuAngle) * 34, 13, Math.sin(G.menuAngle) * 34);
  camera.lookAt(0, 1.5, 0);
  weapon.root.visible = false;
}

export function panFor(pos) {
  const v = pos.clone().applyMatrix4(camera.matrixWorldInverse);
  return clamp(v.x / (Math.hypot(v.x, v.z) || 1), -1, 1) * 0.8;
}
