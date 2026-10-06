// Inställningar från .env – delas mellan server och klient.
// Servern läser .env och skickar med samma värden till webbläsaren, så att båda räknar likadant.
// Alla namn och standardvärden listas i .env.example (genereras med: node server/config-docs.js).
import { WEAPONS, GUNGAME } from './weapons.js';
import { CHARACTERS, SLAM, ARMOR, ABILITY, describeAbilities } from './characters.js';
import { XP } from './progress.js';
import { PLAYER } from './physics.js';

// Spelregler som inte hör till ett vapen eller en gubbe
export const RULES = { respawnMs: 3000, protectMs: 1500, padHp: 50, padMs: 20000 };

// Namnen i .env för vapnen (samma ordning som WEAPONS) och gubbarna (samma ordning som CHARACTERS)
const WEAPON_KEYS = ['AUTOKARBIN', 'SMG', 'HAGELGEVAR', 'PRICKSKYTT', 'KNIV', 'DMR', 'KULSPRUTA'];
const CHAR_KEYS = ['SOLDAT', 'LOPARE', 'TANK', 'SKYTT', 'SPANARE', 'FASTNING'];

// [fält i .env, egenskap, min, max, förklaring]
const WEAPON_FIELDS = [
  ['SKADA', 'body', 0, 1000, 'skada per träff i kroppen (hagelgevär: per hagel)'],
  ['HUVUDSKADA', 'head', 0, 1000, 'skada per träff i huvudet'],
  ['MS_MELLAN_SKOTT', 'fireMs', 30, 5000, 'millisekunder mellan skotten (lägre = snabbare)'],
  ['MAGASIN', 'mag', 1, 500, 'skott per magasin'],
  ['OMLADDNING_MS', 'reloadMs', 0, 10000, 'hur lång tid omladdningen tar'],
  ['KULOR_PER_SKOTT', 'pellets', 1, 30, 'kulor per skott (hagelgevär)'],
  ['SKADA_TAPPAS_EFTER', 'falloff', 0, 300, 'meter innan skadan börjar minska (0 = aldrig)'],
  ['RACKVIDD', 'range', 0.5, 10, 'räckvidd i meter (kniv)'],
  ['SPRIDNING', 'hip', 0, 0.5, 'spridning utan att sikta'],
  ['SPRIDNING_SIKTE', 'adsSpread', 0, 0.5, 'spridning när du siktar'],
  ['SPRIDNING_I_RORELSE', 'moveSpread', 0, 0.5, 'extra spridning när du rör dig'],
  ['REKYL', 'kick', 0, 0.3, 'hur mycket vapnet sparkar uppåt'],
  ['ZOOM_FOV', 'adsFov', 5, 100, 'synfält när du siktar (lägre = mer zoom)'],
];
const CHAR_FIELDS = [
  ['HP', 'hp', 1, 1000, 'liv'],
  ['FART', 'speed', 0.3, 3, 'gångfart (1 = normal)'],
  ['COOLDOWN_MS', 'ability.cooldown', 0, 120000, 'tid mellan förmågorna'],
];
// [namn, läs, skriv, min, max, förklaring]
const SINGLES = [
  ['STIM_HP', () => ABILITY.stimHp, (v) => { ABILITY.stimHp = v; }, 0, 1000, 'HP som Soldatens stim ger'],
  ['MARKSTOT_SKADA', () => SLAM.damage, (v) => { SLAM.damage = v; }, 0, 1000, 'Tankens markstöt: skada mitt i (halva längst ut)'],
  ['MARKSTOT_RADIE', () => SLAM.radius, (v) => { SLAM.radius = v; }, 1, 30, 'markstötens radie i meter'],
  ['RADAR_MS', () => ABILITY.radarMs, (v) => { ABILITY.radarMs = v; }, 0, 60000, 'hur länge Spanarens radar varar'],
  ['PANSAR_MS', () => ARMOR.ms, (v) => { ARMOR.ms = v; }, 0, 60000, 'hur länge Fästningens pansar varar'],
  ['PANSAR_SKADA_PROCENT', () => ARMOR.factor * 100, (v) => { ARMOR.factor = v / 100; }, 0, 100, 'hur många procent skada man tar med pansar'],
  ['DASH_FART', () => ABILITY.dashSpeed, (v) => { ABILITY.dashSpeed = v; }, 5, 60, 'Löparens dash, m/s'],
  ['SUPERHOPP_KRAFT', () => ABILITY.leapPower, (v) => { ABILITY.leapPower = v; }, 5, 30, 'Skyttens superhopp (vanligt hopp är 7.6)'],
  ['RESPAWN_SEKUNDER', () => RULES.respawnMs / 1000, (v) => { RULES.respawnMs = v * 1000; }, 0, 60, 'väntetid innan du kommer tillbaka'],
  ['SPAWNSKYDD_SEKUNDER', () => RULES.protectMs / 1000, (v) => { RULES.protectMs = v * 1000; }, 0, 30, 'osårbar efter spawn (slutar när du skjuter)'],
  ['HEALPAD_HP', () => RULES.padHp, (v) => { RULES.padHp = v; }, 0, 1000, 'HP som en hälsoplatta ger'],
  ['HEALPAD_SEKUNDER', () => RULES.padMs / 1000, (v) => { RULES.padMs = v * 1000; }, 1, 600, 'sekunder innan plattan går att ta igen'],
  ['GUNGAME_KILLS_PER_NIVA', () => GUNGAME[0].kills, (v) => { for (const g of GUNGAME.slice(0, -1)) g.kills = Math.round(v); }, 1, 20, 'kills per vapen i Gun Game'],
  ['XP_KILL', () => XP.kill, (v) => { XP.kill = v; }, 0, 100000, 'XP per kill'],
  ['XP_HEADSHOT', () => XP.head, (v) => { XP.head = v; }, 0, 100000, 'extra XP för headshot-kill'],
  ['XP_MULTIKILL', () => XP.multi, (v) => { XP.multi = v; }, 0, 100000, 'XP per extra kill i en multikill'],
  ['XP_SVIT', () => XP.streak, (v) => { XP.streak = v; }, 0, 100000, 'XP × sviten (från 3 kills i rad)'],
  ['XP_VINST', () => XP.win, (v) => { XP.win = v; }, 0, 100000, 'XP för att vinna rundan'],
  ['XP_RUNDA', () => XP.round, (v) => { XP.round = v; }, 0, 100000, 'XP för att spela klart en runda'],
  ['XP_GUNGAME_NIVA', () => XP.level, (v) => { XP.level = v; }, 0, 100000, 'XP för ny nivå i Gun Game'],
];

const getPath = (o, path) => path.split('.').reduce((a, k) => a[k], o);
const setPath = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };

// Alla inställningar: { key, get, set, min, max, help, group }
function allSettings() {
  const out = [];
  WEAPONS.forEach((w, i) => {
    for (const [f, prop, min, max, help] of WEAPON_FIELDS) {
      if (prop === 'range' && !w.melee) continue;
      if (w.melee && !['body', 'head', 'fireMs', 'range'].includes(prop)) continue;
      if (prop === 'pellets' && w.id !== 'shotgun') continue;
      out.push({ key: `${WEAPON_KEYS[i]}_${f}`, get: () => w[prop], set: (v) => { w[prop] = v; }, min, max, help, group: w.name });
    }
  });
  CHARACTERS.forEach((ch, i) => {
    for (const [f, prop, min, max, help] of CHAR_FIELDS) {
      out.push({ key: `${CHAR_KEYS[i]}_${f}`, get: () => getPath(ch, prop), set: (v) => setPath(ch, prop, v), min, max, help, group: ch.name });
    }
  });
  for (const [key, get, set, min, max, help] of SINGLES) {
    out.push({ key, get, set, min, max, help, group: key.startsWith('XP_') ? 'XP' : 'Förmågor och regler' });
  }
  return out;
}

// Plockar ut giltiga värden ur t.ex. process.env. Returnerar { värden, varningar }.
export function readConfig(env) {
  const values = {}, warnings = [];
  for (const s of allSettings()) {
    // "30   # kommentar" fungerar också
    const raw = env[s.key] === undefined ? '' : String(env[s.key]).split('#')[0].trim();
    if (raw === '') continue;
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v)) { warnings.push(`${s.key}=${raw} är inget tal – ignoreras`); continue; }
    const c = Math.min(s.max, Math.max(s.min, v));
    if (c !== v) warnings.push(`${s.key}=${raw} ändrades till ${c} (tillåtet ${s.min}–${s.max})`);
    values[s.key] = c;
  }
  return { values, warnings };
}

// Lägger in värdena i spelets data. Körs på servern vid start och i webbläsaren innan spelet laddas.
export function applyConfig(values = {}) {
  for (const s of allSettings()) if (s.key in values) s.set(values[s.key]);
  // Fartspärren måste alltid tillåta dashen
  PLAYER.MAX_HS = Math.max(24, ABILITY.dashSpeed + 2);
  describeAbilities();
}

// För .env.example: alla inställningar med standardvärden, gruppade
export function configDocs() {
  const lines = [];
  let group = null;
  for (const s of allSettings()) {
    if (s.group !== group) { group = s.group; lines.push('', `# --- ${group} ---`); }
    lines.push(`#${s.key}=${Math.round(s.get() * 10000) / 10000}   # ${s.help}`);
  }
  return lines.join('\n');
}
