// Menyn: namn, färg, titel, inställningar, gubbval, konto och topplista.
import { WEAPONS } from './weapons.js';
import { CHARACTERS } from './characters.js';
import {
  profile, account, levelInfo, rankName, REWARDS, TITLES, COLORS, hasReward, newRewards,
  setProfile, loadAccount, logout,
} from './profile.js';
import { CROSS_COLORS, G, me, saveSettings, settings } from './state.js';
import { $, esc, renderer, sound, weapon } from './core.js';
import { centerMsg } from './hud.js';
import { connect, send } from './net.js';
import { practiceSpawn, startPractice, stopPractice } from './practice.js';

const colorLevel = (c) => REWARDS.find((r) => r.type === 'color' && r.value === c)?.lvl ?? 1;

export function initMenu() {
  $('name').value = settings.name;
  $('sens').value = settings.sens;
  $('ads-sens').value = settings.adsSens ?? 1;
  $('vol').value = settings.vol;
  $('fov').value = settings.fov;
  $('cross-size').value = settings.crossSize;
  const sensLabel = () => { $('sens-val').textContent = Number(settings.sens).toFixed(2); };
  sensLabel();
  const adsLabel = () => { $('ads-sens-val').textContent = `${Math.round((settings.adsSens ?? 1) * 100)} %`; };
  adsLabel();
  const fovLabel = () => { $('fov-val').textContent = `${settings.fov}°`; };
  fovLabel();

  CROSS_COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch cross-swatch';
    b.style.background = c;
    b.dataset.c = c;
    b.onclick = () => { settings.cross = c; applyCrosshair(); saveSettings(); };
    $('cross-colors').appendChild(b);
  });
  if (!CROSS_COLORS.includes(settings.cross)) settings.cross = CROSS_COLORS[0];
  applyCrosshair();

  COLORS.forEach((c) => {
    const b = document.createElement('button');
    b.className = 'swatch player-swatch';
    b.style.background = c;
    b.dataset.c = c;
    b.dataset.lvl = colorLevel(c);
    b.onclick = () => {
      if (G.playing || colorLevel(c) > levelInfo().lvl) return;
      settings.color = c;
      weapon.setColor(c);
      refreshUnlocks();
      renderIdentity();
      saveSettings();
    };
    $('colors').appendChild(b);
  });

  $('title').onchange = (e) => { settings.title = e.target.value; saveSettings(); };
  $('fullscreen').checked = settings.fullscreen;
  $('fullscreen').onchange = (e) => { settings.fullscreen = e.target.checked; saveSettings(); };

  CHARACTERS.forEach((ch, i) => {
    const w = WEAPONS[ch.weapon];
    const card = document.createElement('button');
    card.className = 'weapon-card' + (i === settings.char ? ' active' : '');
    const bar = (label, v) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.round(Math.max(0.04, Math.min(1, v)) * 100)}%"></b></i></div>`;
    card.innerHTML = `
      <div class="w-head"><span class="w-key">${i + 1}</span> <span class="w-name">${ch.name}</span> <span class="w-hp">${ch.hp} HP</span></div>
      <div class="w-desc">${ch.desc}</div>
      <div class="w-gear"><div><small>Vapen</small> <b>${w.name}</b></div> <div><small>Förmåga</small> <b>${ch.ability.name}</b></div></div>
      <div class="w-ability"><kbd>E</kbd>${ch.ability.desc}</div>
      <div class="stats">${bar('Skada', w.stats.dmg)}${bar('Eldtakt', w.stats.rate)}${bar('Räckvidd', w.stats.range)}${bar('Fart', (ch.speed - 0.8) / 0.35)}</div>`;
    card.onclick = () => selectChar(i);
    $('weapons').appendChild(card);
  });

  $('sens').oninput = (e) => { settings.sens = Number(e.target.value); sensLabel(); saveSettings(); };
  $('ads-sens').oninput = (e) => { settings.adsSens = Number(e.target.value); adsLabel(); saveSettings(); };
  $('vol').oninput = (e) => { settings.vol = Number(e.target.value); sound.setVolume(settings.vol); saveSettings(); };
  $('fov').oninput = (e) => { settings.fov = Number(e.target.value); fovLabel(); saveSettings(); };
  $('cross-size').oninput = (e) => { settings.crossSize = Number(e.target.value); applyCrosshair(); saveSettings(); };

  $('play').onclick = () => playOnline('ffa');
  $('play-gg').onclick = () => playOnline('gungame');
  $('practice').onclick = () => {
    sound.init();
    if (G.ws || G.practice) return;
    startPractice();
    lockPointer();
  };
  $('resume-btn').onclick = () => { sound.init(); lockPointer(); };
  $('leave-btn').onclick = () => {
    if (G.practice) { stopPractice(); return; }
    if (G.ws) { G.leaving = true; G.ws.close(); }
  };

  document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  $('name').oninput = () => { settings.name = $('name').value.trim().slice(0, 16); saveSettings(); renderIdentity(); };
  loadRooms();
  setInterval(() => { if (!G.playing && !$('menu').classList.contains('hidden')) loadRooms(); }, 5000);

  fetch('/api/version').then((r) => r.json()).then((v) => { $('version').textContent = `v${v.version}`; }).catch(() => {});

  // ?login=fel när Discord-inloggningen inte gick igenom
  if (new URLSearchParams(location.search).has('login')) {
    $('status').textContent = 'Inloggningen misslyckades – försök igen';
    history.replaceState(null, '', '/');
  }

  renderProfile();
  renderAccount();
  loadAccount().then(() => {
    const sel = account.user?.sel;
    if (sel) {
      // kontots senaste val gäller på alla datorer
      if (sel.name) { settings.name = sel.name; $('name').value = sel.name; }
      if (sel.color) settings.color = sel.color;
      if (typeof sel.title === 'string') settings.title = sel.title;
      saveSettings();
    }
    renderAccount();
    renderProfile();
  });
  loadTop();
}

export function applyCrosshair() {
  for (const ch of [$('crosshair'), $('cross-preview')]) {
    ch.style.setProperty('--cross', settings.cross);
    ch.style.setProperty('--size', settings.crossSize);
  }
  $('cross-size-val').textContent = `${Math.round(settings.crossSize * 100)}%`;
  document.querySelectorAll('.cross-swatch').forEach((b) => b.classList.toggle('active', b.dataset.c === settings.cross));
}

// Färger och titlar man har låst upp
export function refreshUnlocks() {
  const lvl = levelInfo().lvl;
  if (!hasReward('color', settings.color, lvl)) settings.color = COLORS[0];
  weapon.setColor(settings.color);
  document.querySelectorAll('.player-swatch').forEach((sw) => {
    const isLocked = Number(sw.dataset.lvl) > lvl;
    sw.classList.toggle('locked-color', isLocked);
    sw.classList.toggle('active', sw.dataset.c === settings.color);
    sw.title = isLocked ? `Låses upp på nivå ${sw.dataset.lvl}` : '';
  });
  if (!hasReward('title', settings.title ?? '', lvl)) settings.title = '';
  $('title').innerHTML = TITLES.map((t) => {
    const open = t.lvl <= lvl;
    return `<option value="${esc(t.value)}" ${open ? '' : 'disabled'} ${t.value === settings.title ? 'selected' : ''}>${esc(t.name)}${open ? '' : ` · nivå ${t.lvl}`}</option>`;
  }).join('');
}

export function renderProfile() {
  const info = levelInfo();
  const kd = (profile.kills / Math.max(1, profile.deaths)).toFixed(2);
  const acc = profile.shots ? Math.round((profile.hits / profile.shots) * 100) : 0;
  const hs = profile.kills ? Math.round((profile.heads / profile.kills) * 100) : 0;
  $('profile').innerHTML = `
    <div class="pf-top">
      <div class="pf-badge">${info.lvl}</div>
      <div class="pf-main">
        <div class="pf-rank">${info.rank}</div>
        <div class="pf-bar"><i style="width:${(info.cur / info.need) * 100}%"></i></div>
        <div class="pf-xp">${info.cur} / ${info.need} XP</div>
      </div>
    </div>
    <div class="pf-stats">
      <div><b>${profile.kills}</b> <span>Kills</span></div>
      <div><b>${kd}</b> <span>K/D</span></div>
      <div><b>${hs}%</b> <span>Headshot</span></div>
      <div><b>${profile.wins}</b> <span>Vinster</span></div>
      <div><b>${profile.bestStreak}</b> <span>Bästa svit</span></div>
      <div><b>${acc}%</b> <span>Träff</span></div>
    </div>`;
  refreshUnlocks();
  renderIdentity();
}

// "Spelar som …" överst på Spela-fliken
export function renderIdentity() {
  const info = levelInfo();
  const name = settings.name || account.user?.name || 'Namnlös';
  $('identity').innerHTML = `
    <div class="id-badge">${info.lvl}</div>
    <div class="id-main">
      <div class="id-name" style="color:${esc(settings.color)}">${esc(name)}</div>
      <div class="id-sub">${info.rank} · ${account.user ? 'sparas på ditt konto' : 'gäst'}</div>
    </div>
    <button id="edit-profile">Ändra</button>`;
  $('edit-profile').onclick = () => showTab('profile');
}

export function showTab(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.dataset.tab === tab));
  if (tab === 'top') loadTop();
}

// Hur många spelar i varje läge just nu
export function loadRooms() {
  fetch('/api/rooms').then((r) => r.json()).then((rooms) => {
    document.querySelectorAll('.m-count').forEach((el) => {
      const n = rooms[el.dataset.room] ?? 0;
      el.textContent = n ? `${n} spelar` : 'Tomt just nu';
      el.classList.toggle('live', n > 0);
    });
    if (rooms.killLimit) $('ffa-desc').textContent = `Först till ${rooms.killLimit} kills vinner rundan.`;
  }).catch(() => {});
}

export function renderAccount() {
  const el = $('account');
  const u = account.user;
  if (u) {
    el.innerHTML = `
      ${u.avatar ? `<img src="${esc(u.avatar)}" alt="">` : '<span class="acc-dot"></span>'}
      <div class="acc-main"><b>${esc(u.name)}</b> <span>Inloggad med Discord · sparas på ditt konto</span></div>
      <button class="acc-btn" id="logout">Logga ut</button>`;
    $('logout').onclick = async () => {
      if (G.playing) return;
      await logout();
      renderAccount();
      renderProfile();
    };
  } else if (account.discord) {
    el.innerHTML = `
      <a class="discord-btn" href="/auth/discord">Logga in med Discord</a>
      <span class="acc-note">Som gäst sparas dina framsteg bara i den här webbläsaren.</span>`;
  } else {
    el.innerHTML = account.loaded ? '<span class="acc-note">Du spelar som gäst. Framsteg sparas i den här webbläsaren.</span>' : '';
  }
  el.classList.toggle('playing', G.playing);
}

let topAt = 0;
export function loadTop() {
  if (performance.now() - topAt < 30000 && topAt) return;
  topAt = performance.now();
  fetch('/api/top').then((r) => r.json()).then((list) => {
    $('top').innerHTML = list.length
      ? list.map((p, i) => `
        <li><span class="t-pos">${i + 1}</span>${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '<i></i>'}
        <span class="t-name">${esc(p.name)}${p.title ? ` <em>${esc(p.title)}</em>` : ''}</span> <b>NIVÅ ${p.lvl}</b></li>`).join('')
      : '<li class="t-empty">Ingen har loggat in än. Bli först!</li>';
  }).catch(() => {});
}

// Servern skickar profilen och nya XP-poster
export function onProf(m) {
  const before = levelInfo().lvl;
  setProfile(m.prof);
  for (const [amount, label] of m.xp ?? []) {
    G.roundXp += amount;
    xpPopup(`+${amount} ${label}`);
  }
  const after = levelInfo().lvl;
  if (after > before) {
    const got = newRewards(before, after);
    setTimeout(() => {
      centerMsg(`NIVÅ ${after}`, `${rankName(after)}${got.length ? ` · UPPLÅST: ${got.map((r) => esc(r.name)).join(', ')}` : ''}`);
      sound.levelUp();
    }, 600);
  }
}

export function xpPopup(text) {
  const el = document.createElement('div');
  el.className = 'xp-pop';
  el.textContent = text;
  $('xp-feed').prepend(el);
  while ($('xp-feed').children.length > 4) $('xp-feed').lastChild.remove();
  setTimeout(() => el.remove(), 2200);
}

export function selectChar(i) {
  settings.char = i;
  saveSettings();
  document.querySelectorAll('.weapon-card').forEach((c, j) => c.classList.toggle('active', j === i));
  if (G.practice) {
    practiceSpawn(true);
  } else if (G.playing) {
    send({ t: 'loadout', c: i });
    $('weapon-note').textContent = me.alive ? `${CHARACTERS[i].name} – byts när du spawnar nästa gång` : '';
  } else {
    G.C = CHARACTERS[i];
    G.W = G.primaryW = WEAPONS[G.C.weapon];
    weapon.setType(G.W.id, settings.skins?.[G.W.id]);
  }
}

export function playOnline(m) {
  sound.init();
  settings.name = $('name').value.trim().slice(0, 16);
  saveSettings();
  if (!G.ws && !G.practice) { G.mode = m; connect(); }
  lockPointer();
}

// Tangenterna som spelet tar över i helskärm, så att t.ex. Ctrl+W, Ctrl+T och Ctrl+N inte når webbläsaren.
// Esc är inte med, den lämnar spelet som vanligt.
const LOCK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyT', 'KeyN', 'KeyC', 'KeyF', 'KeyB',
  'Space', 'Tab', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'AltLeft', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

export function lockPointer() {
  if (settings.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => navigator.keyboard?.lock?.(LOCK_KEYS))
      .catch(() => {});
  }
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => { $('status').textContent = 'Klicka igen för att låsa musen'; });
  } catch {}
}

export function showMenu(show) {
  if (show) { renderProfile(); renderAccount(); loadTop(); if (!G.playing) loadRooms(); }
  $('menu').classList.toggle('hidden', !show);
  $('hud').classList.toggle('hidden', show || !G.playing);
  $('hud').classList.toggle('practice', G.practice);
  // under en match: Fortsätt / Lämna i stället för spellägena
  $('modes').classList.toggle('hidden', G.playing);
  $('resume').classList.toggle('hidden', !G.playing);
  $('leave-btn').textContent = G.practice ? 'Avsluta övning' : 'Lämna matchen';
  if (show && G.playing) showTab('play');
  $('name').disabled = G.playing;
  $('title').disabled = G.playing;
  $('colors').classList.toggle('locked', G.playing);
  if (!show) $('weapon-note').textContent = '';
}
