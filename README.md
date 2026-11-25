# BLOCKFEUER – Multiplayer-Shooter im Browser

Ein 3D-Shooter im Stil von CS, der komplett im Browser läuft. Über **GitHub Pages** liegt das Spiel unter einer festen Adresse im Netz: Einer klickt auf **Spiel erstellen**, schickt den Link herum, alle anderen klicken nur noch auf **Beitreten** – keine Installation, kein Server, kein Account.

- **Spielmodi:** Gun Game (jeder Kill = nächste Waffe, Messer-Kill auf der letzten Stufe gewinnt) und Deathmatch (freie Waffenwahl, wer zuerst 25 Kills hat, gewinnt)
- **Karten:** Altstadt (groß, mit Kenney-Stadthäusern, Straßen, Platz, Park, Parkplatz, Baustelle und begehbaren Häusern) und Wüstendorf (klein und schnell)
- **3D-Modelle:** Waffen aus dem *Ultimate Gun Pack* von Quaternius, Gebäude und Skyline aus dem *City Kit (Commercial)* von Kenney – beide CC0
- **Loadout vor jedem Spawn:** Primär- und Sekundärwaffe, Visier (Kimme & Korn, Rotpunkt, Holo, ACOG, Zielfernrohr), Mündung (Schalldämpfer, Kompensator), Unterlauf (Vertikalgriff, Winkelgriff, Laser) und Magazin (erweitert, Schnellzieh)
- **Zielen über das Visier** mit Rechtsklick, **Nachladeanimationen** (Magazin fällt zu Boden, Patronen einzeln, Revolvertrommel, Pumpe, Kammerstängel)
- **Grafik:** Echtzeit-Schatten, spiegelnde Fenster, Materialien, Himmel mit Wolken, drei Qualitätsstufen
- **Utility:** HE-, Blend- und Rauchgranate, Medipacks
- **Belohnung:** Wer eine Runde gewinnt, öffnet ein Glückspaket mit einem zufälligen Waffen-Skin
- **Außerdem:** Scoreboard (Tab), Killfeed, Chat, Kopfschüsse, Bots in drei Stärken, bis zu 12 Spieler

---

## 1. Auf GitHub Pages bereitstellen (einmalig, ca. 5 Minuten)

Du brauchst nur einen kostenlosen GitHub-Account.

1. Auf <https://github.com/new> ein neues Repository anlegen, z. B. `blockfeuer`. Sichtbarkeit **Public** (GitHub Pages ist im Gratis-Tarif nur für öffentliche Repositories verfügbar).
2. Dateien hochladen – eine der beiden Varianten:
   - **Im Browser:** Im neuen Repository auf **uploading an existing file** klicken, den **Inhalt** dieses Ordners (nicht den Ordner selbst) hineinziehen – inklusive des Ordners `assets` – und **Commit changes** drücken.
     Wichtig: Die Datei `.nojekyll` beginnt mit einem Punkt und wird vom Explorer/Finder evtl. ausgeblendet. Fehlt sie, funktioniert es trotzdem.
   - **Mit Git:**
     ```bash
     cd blockfeuer
     git init -b main
     git add .
     git commit -m "BLOCKFEUER"
     git remote add origin https://github.com/DEIN-NAME/blockfeuer.git
     git push -u origin main
     ```
3. Im Repository auf **Settings → Pages** gehen. Bei *Build and deployment* als **Source** „Deploy from a branch“ wählen, **Branch** `main` und Ordner `/ (root)`, dann **Save**.
4. Nach ein bis zwei Minuten steht oben auf der Seite die Adresse, z. B. `https://dein-name.github.io/blockfeuer/`. Das ist ab jetzt euer Spiel-Link.

Änderungen am Spiel lädst du einfach neu ins Repository hoch – GitHub Pages veröffentlicht sie automatisch.

## 2. Mit Freunden spielen

1. **Einer erstellt das Spiel:** Seite öffnen, Namen eingeben, **Spiel erstellen**. Der Browser dieser Person ist jetzt der Host (er rechnet Treffer, Bots und Runden).
2. **Link teilen:** Im Spiel mit **Esc** das Menü öffnen. Unten steht der **Link für Freunde** (z. B. `…/blockfeuer/?join=k7m2x`) – mit **Kopieren** in Discord/WhatsApp schicken. Den fünfstelligen Code kann man auch im Startmenü bei „Code eines Freundes“ eintippen.
3. **Freunde treten bei:** Link öffnen, Namen eingeben, **Beitreten**.

**Allein gegen Bots** startet eine Runde nur für dich. Willst du später doch Freunde dazuholen, drückst du im Esc-Menü auf **Online stellen**.

Gut zu wissen:
- Die Verbindung läuft direkt zwischen den Browsern (WebRTC). Nur zum Kennenlernen der Browser wird kurz der kostenlose öffentliche Vermittlungsdienst von [PeerJS](https://peerjs.com) benutzt; die Bibliothek wird beim Erstellen/Beitreten von jsDelivr geladen.
- **Der Host muss den Tab offen und im Vordergrund lassen.** Schließt er ihn, ist die Runde für alle vorbei. Im Hintergrund drosselt der Browser den Tab, dann ruckelt es für alle.
- Der Host sollte den stärksten Rechner und die beste Internetverbindung haben. Für 2–8 Spieler reicht ein normaler Laptop.
- In sehr strengen Netzen (Firmen, manche Schulen, manche Mobilfunk-Hotspots) kann WebRTC blockiert sein. Dann hilft die Variante mit eigenem Server (Abschnitt 4).
- Chrome, Edge und Firefox funktionieren am besten; Safari geht meist auch.

## 3. Steuerung

| Taste | Aktion |
|---|---|
| W A S D | Laufen |
| Maus | Zielen, Linksklick schießen |
| Rechtsklick | Über das Visier zielen (Halten oder Umschalten, einstellbar) |
| Leertaste | Springen |
| Shift | Schleichen (langsam, keine Schrittgeräusche, genauer) |
| C | Ducken (genauer) |
| R | Nachladen (bei der Schrotflinte: Schießen bricht das Nachladen ab) |
| 1 / 2 / 3 / Q | Primärwaffe / Sekundärwaffe / Messer / letzte Waffe |
| 4 / 5 / 6 | HE- / Blend- / Rauchgranate (G wechselt durch) |
| Tab | Scoreboard |
| Enter | Chat |
| Esc | Menü: Loadout, Karte & Modus, Bots, Maus, Sichtfeld, Lautstärke, Grafik, Einladungslink |

Ducken liegt absichtlich auf **C** statt Strg: Strg+W würde im Browser den Tab schließen. Läuft das Spiel ruckelig: **Esc → Grafik → Mittel** oder **Niedrig** (Niedrig schaltet die Schatten ab).

## Loadout und Aufsätze

Nach jedem Tod (und beim Beitreten) öffnet sich der Loadout-Bildschirm. Im Deathmatch wählst du Primär- und Sekundärwaffe, im Gun Game bestimmt die Stufe die Waffe; Aufsätze rüstest du für jede Waffe einzeln aus. Das Loadout wird im Browser gespeichert.

| Aufsatz | Wirkung |
|---|---|
| Rotpunkt / Holo | klares Absehen, 1,25–1,3-facher Zoom, Holo zielt etwas schneller |
| ACOG 3,5× | starker Zoom für weite Distanzen, langsameres Zielen |
| Zielfernrohr | nur Scharfschützengewehre, sehr starker Zoom |
| Schalldämpfer | leiser, keine Leuchtspur, kein Mündungsfeuer, −15 % Reichweite |
| Kompensator | −25 % Rückstoß |
| Vertikalgriff / Winkelgriff | −20 % Rückstoß bzw. 30 % schneller zielen |
| Laser | −35 % Streuung aus der Hüfte – aber der Strahl ist für alle sichtbar |
| Erweitertes / Schnellzieh-Magazin | +50 % Munition bzw. 30 % schneller nachladen |

## Glückspaket und Skins

Gewinnt ein Spieler eine Runde (Bots bekommen nichts), bekommt er ein Glückspaket mit einem zufälligen Skin. Mit **Ausrüsten** kommt der Skin ab dem nächsten Spawn auf die Waffe – und alle anderen sehen ihn auch.

| Seltenheit | Chance | Beispiele |
|---|---|---|
| Gewöhnlich | 55 % | Waldtarn, Wüstentarn, Stadttarn, Rost |
| Selten | 25 % | Arktis, Tiger, Kobalt, Zebra |
| Episch | 13 % | Neonrausch, Sonnenuntergang, Karbon, Ozean |
| Legendär | 5,5 % | Drachenfeuer, Chrom |
| Mythisch | 1,5 % | Reines Gold, Galaxie |

Messer-Skins gibt es nur ab Legendär. Das Inventar gehört zum Browser (keine Benutzerkonten).

## Regeln im Detail

- **Gun Game:** Kill mit der Stufenwaffe oder HE-Granate = +1 Stufe. Messer-Kills bringen +1 Stufe und klauen dem Opfer eine Stufe. Selbstmord kostet eine Stufe. Ein Messer-Kill auf der letzten Stufe gewinnt.
- **Deathmatch:** Wer zuerst 25 Kills hat, gewinnt. Selbstmord kostet einen Kill.
- Jeder Kill heilt 30 HP. Nach dem Spawn gibt es 1,8 s Spawnschutz (endet beim ersten eigenen Schuss).
- Karte und Modus wechselt jeder Spieler über **Esc → Spiel → Neue Runde mit dieser Auswahl**.

## 4. Alternative: eigener Server mit Node.js (optional)

Wer lieber einen eigenen Server betreibt (z. B. wenn WebRTC im Netz blockiert ist), kann denselben Ordner mit [Node.js](https://nodejs.org) ab Version 18 starten – ohne `npm install`:

- **Windows:** Doppelklick auf `start.bat` · **Mac / Linux:** `./start.sh` (oder `node server.js --tunnel`)
- Danach `http://localhost:3000` öffnen. Im gleichen WLAN gilt die im Fenster angezeigte Adresse `http://192.168.x.x:3000`.
- **Über das Internet:** `cloudflared` installieren (Windows: `winget install --id Cloudflare.cloudflared`, Mac: `brew install cloudflared`) – der Server startet dann automatisch einen Cloudflare Quick Tunnel und zeigt einen `https://…trycloudflare.com`-Link an.
- **Dauerhaft:** Repository bei einem Node-Hoster wie Render als *Web Service* anlegen, Start-Befehl `node server.js`.

Die Seite merkt selbst, ob sie von diesem Server kommt, und zeigt dann statt „Spiel erstellen / Beitreten“ nur **Spielen**.

| Variable | Bedeutung | Standard |
|---|---|---|
| `PORT` | Port des Servers | 3000 |
| `BOTS` | Anzahl Bots beim Start (0–8) | 2 |
| `BOT_SKILL` | 0 = leicht, 1 = mittel, 2 = schwer | 1 |
| `MAP` | `stadt` oder `wueste` | stadt |
| `MODE` | `gungame` oder `dm` | gungame |

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Menü, Loadout-Bildschirm, HUD, Scoreboard |
| `game.js` | Client: WebGL-Renderer (Schatten, Materialien, 3D-Modelle), Bewegung, Waffen, Zielen, Animationen, Effekte, Sound |
| `shared.js` | Gemeinsame Spieldaten: Waffen, Aufsätze, Skins, Modi, Karten (inkl. Platzierung der Stadtmodelle), Raycasts, Kollision |
| `host.js` | Spiellogik des Hosts: Treffer, Leben, Stufen, Runden, Bots. Läuft im Browser des Hosts (GitHub Pages) oder in `server.js` |
| `net.js` | Verbindungen: Host im eigenen Browser, Beitritt per WebRTC/PeerJS, oder WebSocket zum eigenen Server |
| `server.js` | Optionaler Node-Server (HTTP + WebSocket ohne Bibliotheken) |
| `assets/models.bin`, `assets/models.json` | Aufbereitete 3D-Modelle (Waffen, Zubehör, Stadt mit drei Farbvarianten) |
| `tools/build_assets.py` | Erzeugt `assets/` aus den Original-Paketen (siehe unten) |

Fehlen die Dateien in `assets/` (oder lädt man `index.html` direkt von der Festplatte), läuft das Spiel mit der eingebauten Klötzchen-Grafik weiter – Kollision und Spiellogik sind identisch.

### Modelle neu erzeugen oder austauschen

`tools/build_assets.py` liest die Original-Pakete (OBJ-Waffen von Quaternius, GLB-Gebäude von Kenney), backt die Texturfarben in die Vertices, richtet die Waffen aus (Griff im Ursprung, Lauf nach vorn) und trennt bewegliche Teile (Magazin, Schlitten, Pumpe, Trommel, Zielfernrohr):

```bash
pip install pillow
python3 tools/build_assets.py Pfad/zum/Ultimate_Gun_Pack Pfad/zum/kenney_city-kit-commercial assets
```

Welche Waffe welches Modell bekommt, steht oben im Skript (`GUNS`). Wo die Häuser stehen, steht in `buildStadt` in `shared.js` (`kblock` für Häuserblöcke, `row` für die Häuserzeilen am Kartenrand).

Technik in Kürze: Die Bewegung rechnet jeder Browser selbst (fühlt sich sofort an), Treffer meldet der Schütze, und der Host prüft sie auf Plausibilität (Feuerrate, Sichtlinie, Position des Ziels). Das ist für Runden unter Freunden gedacht, nicht als Schutz gegen entschlossene Cheater.

## Credits

- 3D-Waffen: **Ultimate Gun Pack** von [Quaternius](https://quaternius.com) – CC0 1.0
- 3D-Gebäude: **City Kit (Commercial) 2.1** von [Kenney](https://www.kenney.nl) – CC0 1.0
- Peer-to-Peer-Verbindungen: [PeerJS](https://peerjs.com) – MIT-Lizenz

Details in `CREDITS.md`.
