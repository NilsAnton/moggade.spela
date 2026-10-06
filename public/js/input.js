import { WEAPONS } from './weapons.js';
import { MAPS } from './maps.js';
import { CHARACTERS } from './characters.js';
import { G, gun, keys, me, settings } from './state.js';
import { $, camera, clamp, renderer } from './core.js';
import { showScoreboard } from './hud.js';
import { selectChar, showMenu } from './menu.js';
import { renderVotes, send, updateDeathWeapon } from './net.js';
import { inspectWeapon, startReload, startSlide, switchSlot, useAbility } from './local.js';
import { resetStats, toggleBots } from './practice.js';

export function initInput() {
  // ---------- input ----------
  addEventListener('keydown', (e) => {
    // Ctrl är glid-knappen: utan det här stänger Ctrl+W fliken mitt i matchen (och Ctrl+S, Ctrl+D osv. öppnar dialoger)
    if (G.locked && (e.ctrlKey || e.metaKey) && !(G.chatOpen && ['KeyA', 'KeyC', 'KeyV', 'KeyX', 'KeyZ'].includes(e.code))) e.preventDefault();
    if (G.chatOpen) {
      if (e.code === 'Enter') { e.preventDefault(); closeChat(true); }
      return;
    }
    if (e.code === 'Tab') { e.preventDefault(); if (G.playing) showScoreboard(true); return; }
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    const n = digit ? Number(digit[1]) - 1 : -1;
    // gubbvalet (H) är öppet: 1–6 väljer, H stänger
    if (G.heroOpen) {
      e.preventDefault();
      if (CHARACTERS[n]) { selectChar(n); updateDeathWeapon(); closeHero(); }
      else if (e.code === 'KeyH' || e.code === 'Escape') closeHero();
      return;
    }
    if (!G.locked) return;
    if (e.code === 'KeyH' && G.playing && !e.repeat) { openHero(); return; }
    if ((e.code === 'KeyT' || e.code === 'Enter') && G.ws && !G.practice && !e.repeat) { e.preventDefault(); openChat(); return; }
    if (e.code === 'Space' && !e.repeat) G.jumpQueued = true;
    if ((e.code === 'ControlLeft' || e.code === 'KeyC') && !e.repeat) startSlide();
    if (e.code === 'KeyE' && !e.repeat) useAbility();
    keys[e.code] = true;
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyF' && !e.repeat) inspectWeapon();
    if (G.practice) {
      if (e.code === 'KeyB') toggleBots();
      if (e.code === 'KeyT') resetStats();
    }
    // när rundan är slut röstar 1–3 på nästa bana, annars 1 = vapen och 2 = kniv
    if (G.roundOver && MAPS[n]) { G.myVote = n; send({ t: 'vote', m: n }); renderVotes(); return; }
    if (n === 0 || n === 1) switchSlot(n);
  });
  addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'Tab') showScoreboard(G.roundOver);
  });
  addEventListener('mousedown', (e) => {
    if (!G.locked || G.chatOpen) return;
    if (e.button === 0) G.firing = true;
    if (e.button === 2 && !G.W.melee) G.ads = true; // kniven: bara vänsterklick
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) { G.firing = false; gun.trigger = true; }
    if (e.button === 2) G.ads = false;
  });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (!G.locked || !me.alive) return;
    const zoom = camera.fov / settings.fov;
    // när du siktar: sänks automatiskt med zoomen, gånger din egen sikt-känslighet
    const s = 0.0022 * settings.sens * (G.ads ? Math.max(0.3, zoom) * (settings.adsSens ?? 1) : 1);
    me.yaw -= e.movementX * s;
    me.pitch = clamp(me.pitch - e.movementY * s, -1.55, 1.55);
    G.lookDX += e.movementX;
    G.lookDY += e.movementY;
  });
  // Sista skyddet om webbläsaren ändå försöker stänga fliken mitt i spelet: fråga först
  addEventListener('beforeunload', (e) => {
    if (G.playing && G.locked) { e.preventDefault(); e.returnValue = ''; }
  });

  document.addEventListener('pointerlockchange', () => {
    G.locked = document.pointerLockElement === renderer.domElement;
    if (G.locked) { showMenu(false); return; }
    closeChat(false);
    closeHero();
    G.firing = false;
    G.ads = false;
    for (const k in keys) keys[k] = false;
    showMenu(true);
  });

}

// ---------- gubbval (H) ----------
export function openHero() {
  G.heroOpen = true;
  G.firing = false;
  renderHero();
  $('hero').classList.remove('hidden');
}

export function closeHero() {
  G.heroOpen = false;
  $('hero').classList.add('hidden');
}

function renderHero() {
  const now = G.C;
  $('hero-list').innerHTML = CHARACTERS.map((ch, i) => `
    <div class="hero-item${i === settings.char ? ' on' : ''}">
      <div class="hi-top"><kbd>${i + 1}</kbd><b>${ch.name}</b>${ch === now && me.alive ? '<span class="hi-now">NU</span>' : ''}</div>
      <div class="hi-row">${WEAPONS[ch.weapon].name} · ${ch.ability.name} · ${ch.hp} HP</div>
    </div>`).join('');
  $('hero-note').textContent = G.practice ? 'Byts direkt.'
    : me.alive ? 'Den nya gubben gäller när du spawnar nästa gång.' : 'Gäller när du kommer tillbaka.';
}

// ---------- chatt ----------
export function openChat() {
  G.chatOpen = true;
  G.firing = false;
  G.ads = false;
  for (const k in keys) keys[k] = false;
  $('chat-input').value = '';
  $('chat-input').classList.remove('hidden');
  $('chat').classList.add('open');
  $('chat-input').focus();
}
export function closeChat(sendIt) {
  if (!G.chatOpen) return;
  G.chatOpen = false;
  const text = $('chat-input').value.trim();
  if (sendIt && text) send({ t: 'chat', text });
  $('chat-input').blur();
  $('chat-input').classList.add('hidden');
  $('chat').classList.remove('open');
}
export function chatLine(html) {
  const el = document.createElement('div');
  el.className = 'line';
  el.innerHTML = html;
  const log = $('chat-log');
  log.appendChild(el);
  while (log.children.length > 8) log.firstChild.remove();
  setTimeout(() => el.classList.add('old'), 9000);
}
