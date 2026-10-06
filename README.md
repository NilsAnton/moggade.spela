# LOCKDOWN

Free-for-all-FPS i webbläsaren. Three.js på klienten och Node.js + WebSockets på servern.
Körs i Docker på en Synology NAS och nås från internet via en Cloudflare Tunnel, så du behöver inte öppna några portar.

## Spelet
- **Lägen:** Free for all (först till 25 kills) och Gun Game (klättra genom 7 vapen, kniv-kill vinner). Plus ett övningsläge med skjutbana.
- **Banor:** Skymning, Hamnen och Shipment (liten containerbana inspirerad av CoD4). Alla röstar på nästa bana när rundan är slut.
- **6 gubbar** med eget vapen och en förmåga på E:
  | Gubbe | Vapen | Förmåga |
  |---|---|---|
  | Soldat | Autokarbin | Stim: +40 HP |
  | Löpare | SMG | Dash |
  | Tank | Hagelgevär | Markstöt |
  | Skytt | Prickskytt | Superhopp |
  | Spanare | DMR | Radar: se fiender genom väggar |
  | Fästning | Kulspruta | Pansar: halv skada i 4 s |
- **Konton:** logga in med Discord så sparas XP, nivå och statistik på servern och följer med till alla datorer. Det går också att spela som gäst, men då sparas framstegen bara i webbläsaren. Första gången du loggar in flyttas din gäst-profil över till kontot.
- **Progression:** servern räknar all XP: kills, headshots, multikills, sviter och vinster. Rang från Rekryt till Lockdown-legend. På nivåerna låses färger och titlar upp, och titeln syns på poängtavlan. Det finns en topplista i menyn.
- **Känsla:** skadesiffror, multikill-utrop (dubbel, trippel, mega, monster), hjärtslag vid låg hälsa och skärmskak.
- **Bottar** fyller upp servern (`BOTS`, `BOT_SKILL=easy|normal|hard`). De vänder sig mot den som skjuter, backar vid låg hälsa och använder förmågor.
- **Fuskskydd:** servern kontrollerar fart, hopp, väggar, ammo och hur många meddelanden en spelare skickar. Den som fuskar skickas tillbaka. Servern loggar varför, på rader som börjar med `[fusk?]`.
- **Chatt** på `T`. Inställningar för FOV, sikte och helskärm finns under *Fler inställningar*.

**Kontroller:** WASD gå · Shift spring · Space hoppa · Ctrl/C glid · E förmåga · Vänsterklick skjut · Högerklick sikta · R ladda om · 1 vapen · 2 kniv · F inspektera · H byt gubbe · T chatt · Tab poängtavla · Esc meny

**Kniven (M9 Bayonett)** har alla på 2: 50 skada per hugg (`KNIV_SKADA`), och du springer lite snabbare med den framme. Vapnens utseende ligger i `public/js/skins.js`, så nya skins blir en ny rad där.

Spelet går i helskärm när du spelar. Då kan det ta över Ctrl+W och andra webbläsarknappar, så att du inte stänger fliken av misstag när du glider framåt. Det går att stänga av under *Fler inställningar*.

## 1. Skapa tunneln i Cloudflare
1. Gå till [one.dash.cloudflare.com](https://one.dash.cloudflare.com) och välj **Networks → Tunnels → Create a tunnel**.
2. Välj **Cloudflared** och ge tunneln ett namn, t.ex. `lockdown`.
3. Under *Install connector* väljer du **Docker**. Kopiera den långa token som står efter `--token` i kommandot.
4. Lägg till en **Public hostname**:
   - Subdomain: `fps` (eller vad du vill), Domain: din domän
   - Service: **HTTP** och URL: **`game:3000`**

   `game` är namnet på containern i docker-compose, och cloudflared hittar den på det namnet.

WebSockets fungerar direkt genom tunneln. Du behöver inte ändra några inställningar för det.

## 2. Discord-inloggning (valfritt)
Utan det här går det bara att spela som gäst.
1. Gå till [discord.com/developers/applications](https://discord.com/developers/applications) och välj **New Application**. Ge den namnet `LOCKDOWN`.
2. Välj **OAuth2** i menyn till vänster:
   - Kopiera **Client ID**.
   - Tryck **Reset Secret** och kopiera **Client Secret**. Den syns bara en gång, och du ska aldrig dela den eller lägga den på GitHub.
   - Under **Redirects**, lägg till `https://fps.dindomän.se/auth/discord/callback` (din adress + `/auth/discord/callback`) och spara.
3. Fyll i `.env` på NAS:en:
   ```
   DISCORD_CLIENT_ID=...
   DISCORD_CLIENT_SECRET=...
   PUBLIC_URL=https://fps.dindomän.se
   ```
4. Starta om projektet. Nu finns knappen **Logga in med Discord** i menyn.

Spelet frågar bara Discord efter namn och profilbild (scope `identify`), inget annat.

## Ändra spelvärden (skada, HP, förmågor, XP …)
Allt går att ställa in i `.env`. Där finns skada och huvudskada för varje vapen, eldhastighet, magasin, omladdning, spridning, rekyl och zoom. För varje gubbe finns liv, fart och cooldown på förmågan. Dessutom finns stimmets HP, markstötens skada och radie, hur länge radarn och pansaret varar, dashens fart, superhoppets kraft, respawn-tid, spawnskydd, kills per nivå i Gun Game och all XP.

1. Öppna `.env` och leta upp värdet i listan längst ner. Exempel: `#STIM_HP=40`.
2. Ta bort `#` i början av raden och ändra siffran: `STIM_HP=60`.
3. Starta om projektet i Container Manager.

Servern skickar samma värden till alla webbläsare, och beskrivningarna i menyn uppdateras automatiskt. Värden som inte är tal eller ligger utanför det tillåtna intervallet skrivs ut i loggen som `[inställning] …`. Rader du inte ändrar behåller standardvärdet.

Lägger du till ett vapen eller en gubbe kan listan skrivas ut på nytt med `node server/config-docs.js`.

## 3. Lägg upp på Synology NAS
GitHub bygger spelet åt dig (se `.github/workflows/docker.yml`). NAS:en hämtar bara den färdiga imagen, så du behöver aldrig ladda upp spelfilerna dit.

**Första gången:**
1. Pusha repot till GitHub och vänta tills den gröna bocken under **Actions** syns.
2. På GitHub: din profil → **Packages** → paketet → **Package settings** → **Change visibility → Public**. (Annars måste NAS:en logga in mot ghcr.io.)
3. Skapa mappen `/volume1/docker/moggade` i File Station och lägg dit **bara** `docker-compose.yml` och `.env` (kopia av `.env.example` med din `TUNNEL_TOKEN`).
4. **Container Manager → Projekt → Skapa**. Projektnamn: `moggade`, sökväg: mappen ovan, *Använd befintlig docker-compose.yml*.

Nu kan ni spela på `https://fps.dindomän.se`, och på hemnätverket via `http://NAS-IP:3000`.

### Uppdatera spelet
1. Höj `"version"` i `package.json`, t.ex. `1.2.0` → `1.2.1`. **Glöm inte det här steget**, annars fortsätter webbläsarna att använda de gamla filerna.
2. **Commit** och **Push** i GitHub Desktop. Vänta på den gröna bocken under Actions (ett par minuter).
3. På NAS:en: öppna `.env` med Text Editor och sätt `APP_VERSION=1.2.1`.
4. Container Manager → Projekt → moggade → **Åtgärd → Bygg**. Då hämtas den nya versionen.

**Ångra:** sätt tillbaka `APP_VERSION` till den gamla versionen och kör **Bygg** igen.

Via SSH: `./update.sh 1.2.1`

> **Uppdatera från 1.1.x:** `docker-compose.yml` och `.env.example` har fått nya rader (databasvolym och Discord). Kopiera den nya `docker-compose.yml` till NAS:en och lägg till de nya raderna i din `.env`.

### Databasen och säkerhetskopior
Konton och statistik ligger i SQLite-filen `lockdown.db` i Docker-volymen `lockdown-data`. Volymen finns kvar när du uppdaterar eller bygger om projektet. Den försvinner bara om du själv tar bort den.

Säkerhetskopiera med SSH:
```
sudo docker cp moggade-game:/data ./backup-$(date +%F)
```

Vill du köra servern lokalt utan Docker hamnar databasen i mappen `data/` i repot. Den mappen följer inte med till GitHub.

## Filer
### Server
| Fil | Vad |
|---|---|
| `server/server.js` | Spelserver: rum, anslutningar, träffar, kills, XP, fuskskydd, rundor |
| `server/db.js` | Databasen: konton, sessioner, topplista |
| `server/auth.js` | Inloggning med Discord |
| `server/bots.js` | Bottarnas hjärna |

### Delat (server + klient)
| Fil | Vad |
|---|---|
| `public/js/progress.js` | XP, nivåer, rang och **belöningar**. Nya färger och titlar läggs till här |
| `public/js/maps.js` | Banorna |
| `public/js/weapons.js` / `characters.js` | Vapen och gubbar |
| `public/js/physics.js` | Rörelse, kollision och träffboxar |

### Klient
| Fil | Vad |
|---|---|
| `public/js/main.js` | Startar allt och kör spel-loopen |
| `public/js/state.js` | Delat tillstånd (`G`), inställningar, din spelare |
| `public/js/core.js` | Renderare, scen, kamera, ljud, laddning av banor |
| `public/js/menu.js` | Menyn: konto, profil, färg, titel, inställningar, topplista |
| `public/js/input.js` | Tangentbord, mus och chatt |
| `public/js/net.js` | Allt som kommer från servern |
| `public/js/local.js` | Din rörelse, skott, förmågor och kamera |
| `public/js/hud.js` | HUD, poängtavla, skadesiffror |
| `public/js/practice.js` | Övningsläget (körs helt lokalt) |
| `public/js/profile.js` | Profilen som visas: från servern, eller från webbläsaren för gäster |
| `public/js/world.js` | Grafik: texturer, himmel, ljus, stadssiluett |
| `public/js/weapon.js` | Vapnet i första person |
| `public/js/player.js` | Andra spelares modeller |
| `public/js/effects.js` | Tracers, gnistor, kulhål, blod |
| `public/js/audio.js` | Syntetiserade ljud |
