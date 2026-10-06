# MOGGADE

Free-for-all-FPS i webbläsaren. Three.js på klienten och Node.js + WebSockets på servern.
Körs i Docker på en Synology NAS och nås från internet via en Cloudflare Tunnel, så du behöver inte öppna några portar.

## Spelet
- Först till 25 kills vinner rundan (ändra med `KILL_LIMIT`). Efter 10 sekunder startar en ny runda.
- Kroppsskott gör 22 i skada och headshots 55. Alla har 100 HP.
- Du har 1,5 s spawnskydd, men det försvinner direkt om du skjuter.
- Servern bestämmer alla träffar och kompenserar för lagg, så det man ser är det som räknas.

**Kontroller:** WASD gå · Shift spring · Space hoppa · Vänsterklick skjut · Högerklick sikta · R ladda om · Tab poängtavla · Esc meny

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
| `public/js/maps.js` | Banan (delas av server och klient) |
| `public/js/physics.js` | Rörelse, kollision och träffboxar (delas) |
| `public/js/main.js` | Klienten: input, nätverk, kamera, HUD |
| `public/js/world.js` | Grafik: texturer, himmel, ljus, stadssiluett |
| `public/js/weapon.js` | Vapnet i första person |
| `public/js/player.js` | Andra spelares modeller |
| `public/js/effects.js` | Tracers, gnistor, kulhål, blod |
| `public/js/audio.js` | Syntetiserade ljud |
