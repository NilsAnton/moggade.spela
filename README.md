# MOGGADE

Free-for-all-FPS i webbläsaren. Three.js på klienten och Node.js + WebSockets på servern.
Körs i Docker på en Synology NAS och nås från internet via en Cloudflare Tunnel, så du behöver inte öppna några portar.

## Spelet
- **Lägen:** Free for all (först till 25 kills) och Gun Game (klättra genom 7 vapen, kniv-kill vinner). Plus ett övningsläge med skjutbana.
- **Banor:** Skymning, Hamnen och Neonstad. Alla röstar på nästa bana när rundan är slut.
- **6 gubbar** med eget vapen och en förmåga på E:
  | Gubbe | Vapen | Förmåga |
  |---|---|---|
  | Soldat | Autokarbin | Stim: +40 HP |
  | Löpare | SMG | Dash + dubbelhopp |
  | Tank | Hagelgevär | Markstöt |
  | Skytt | Prickskytt | Superhopp |
  | Spanare | DMR | Radar: se fiender genom väggar |
  | Fästning | Kulspruta | Pansar: halv skada i 4 s |
- **Progression:** XP för kills, headshots, multikills, sviter och vinster. Nivåer och rang från Rekryt till Moggad legend, nya färger låses upp och statistik sparas i webbläsaren.
- **Känsla:** skadesiffror, multikill-utrop (dubbel, trippel, mega, monster), hjärtslag vid låg hälsa och skärmskak.
- **Bottar** fyller upp servern (`BOTS`, `BOT_SKILL=easy|normal|hard`). De vänder sig mot den som skjuter, backar vid låg hälsa och använder förmågor.

**Kontroller:** WASD gå · Shift spring · Space hoppa · Ctrl glid · E förmåga · Vänsterklick skjut · Högerklick sikta · R ladda om · 1–6 byt gubbe · Tab poängtavla · Esc meny

## 1. Skapa tunneln i Cloudflare
1. Gå till [one.dash.cloudflare.com](https://one.dash.cloudflare.com) och välj **Networks → Tunnels → Create a tunnel**.
2. Välj **Cloudflared** och ge tunneln ett namn, t.ex. `moggade`.
3. Under *Install connector* väljer du **Docker**. Kopiera den långa token som står efter `--token` i kommandot.
4. Lägg till en **Public hostname**:
   - Subdomain: `fps` (eller vad du vill), Domain: din domän
   - Service: **HTTP** och URL: **`game:3000`**

   `game` är namnet på containern i docker-compose, och cloudflared hittar den på det namnet.

WebSockets fungerar direkt genom tunneln. Du behöver inte ändra några inställningar för det.

## 2. Lägg upp på Synology NAS
GitHub bygger spelet åt dig (se `.github/workflows/docker.yml`). NAS:en hämtar bara den färdiga imagen, så du behöver aldrig ladda upp spelfilerna dit.

**Första gången:**
1. Pusha repot till GitHub och vänta tills den gröna bocken under **Actions** syns.
2. På GitHub: din profil → **Packages** → paketet → **Package settings** → **Change visibility → Public**. (Annars måste NAS:en logga in mot ghcr.io.)
3. Skapa mappen `/volume1/docker/moggade` i File Station och lägg dit **bara** `docker-compose.yml` och `.env` (kopia av `.env.example` med din `TUNNEL_TOKEN`).
4. **Container Manager → Projekt → Skapa**. Projektnamn: `moggade`, sökväg: mappen ovan, *Använd befintlig docker-compose.yml*.

Nu kan ni spela på `https://fps.dindomän.se`, och på hemnätverket via `http://NAS-IP:3000`.

### Uppdatera spelet
1. Höj `"version"` i `package.json`, t.ex. `1.0.0` → `1.0.1`.
2. **Commit** och **Push** i GitHub Desktop. Vänta på den gröna bocken under Actions (ett par minuter).
3. På NAS:en: öppna `.env` med Text Editor och sätt `APP_VERSION=1.0.1`.
4. Container Manager → Projekt → moggade → **Åtgärd → Bygg**. Då hämtas den nya versionen.

**Ångra:** sätt tillbaka `APP_VERSION` till den gamla versionen och kör **Bygg** igen.

Via SSH: `./update.sh 1.0.1`

## Filer
| Fil | Vad |
|---|---|
| `server/server.js` | Spelserver: anslutningar, träffar, kills, respawn, rundor |
| `public/js/maps.js` | Banorna (delas av server och klient) |
| `public/js/weapons.js` / `characters.js` | Vapen och gubbar (delas) |
| `public/js/profile.js` | XP, nivåer och statistik |
| `server/bots.js` | Bottarnas hjärna |
| `public/js/physics.js` | Rörelse, kollision och träffboxar (delas) |
| `public/js/main.js` | Klienten: input, nätverk, kamera, HUD |
| `public/js/world.js` | Grafik: texturer, himmel, ljus, stadssiluett |
| `public/js/weapon.js` | Vapnet i första person |
| `public/js/player.js` | Andra spelares modeller |
| `public/js/effects.js` | Tracers, gnistor, kulhål, blod |
| `public/js/audio.js` | Syntetiserade ljud |
