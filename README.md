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
1. Kopiera hela mappen till NAS:en, t.ex. till `/volume1/docker/moggade`. Du kan använda File Station.
2. Skapa filen `.env` i samma mapp (kopiera `.env.example`) och klistra in din `TUNNEL_TOKEN`.
3. Öppna **Container Manager → Projekt → Skapa**.
   - Projektnamn: `moggade`
   - Sökväg: mappen ovan
   - Välj *Använd befintlig docker-compose.yml*
4. Klicka igenom guiden så bygger och startar den allt.

Nu kan ni spela på `https://fps.dindomän.se`.
På hemnätverket går det även att gå direkt till `http://NAS-IP:3000`.

### Uppdatera efter ändringar
1. Kopiera in de nya filerna till mappen på NAS:en.
2. Öppna `.env` (med Text Editor i DSM) och höj `APP_VERSION`, t.ex. `1.0.0` → `1.0.1`.
3. Container Manager → Projekt → moggade → **Åtgärd → Bygg**.

**Ångra en uppdatering:** sätt tillbaka `APP_VERSION` till den gamla versionen och starta projektet igen. Den gamla versionen finns kvar på NAS:en, så den behöver inte byggas om.

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
