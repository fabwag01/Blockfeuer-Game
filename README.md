# BLOCKFEUER – Multiplayer-Shooter im Browser

Ein 3D-Shooter im Stil von CS, der komplett im Browser läuft. Über **GitHub Pages** liegt das Spiel unter einer festen Adresse im Netz: Einer klickt auf **Spiel erstellen**, schickt den Link herum, alle anderen klicken nur noch auf **Beitreten** – keine Installation, kein Server, kein Account.

- **Spielmodi:** Gun Game (zwei Kills = nächste Waffe, Messer-Kill auf der letzten Stufe gewinnt), Deathmatch (freie Waffenwahl, 40 Kills gewinnen) und **Punkt erobern** (Team Blau gegen Rot, 180 Punkte gewinnen)
- **Karten:** Altstadt (groß, mit Kenney-Stadthäusern, Straßen, Platz, Park, Parkplatz, Baustelle und begehbaren Häusern) und Wüstendorf (klein und schnell)
- **3D-Modelle:** Waffen aus dem *Ultimate Gun Pack* von Quaternius, Gebäude und Skyline aus dem *City Kit (Commercial)* von Kenney, animierte Zombies, Fahrzeuge und Endzeit-Requisiten aus dem *Zombie Apocalypse Kit* (Quaternius), Bäume, Kakteen und Felsen aus dem *Ultimate Nature Pack* (Quaternius), Autos, Ampeln und Müllcontainer aus *KayKit City Builder Bits*, Möbel aus dem *Furniture Kit* (Kenney) und Laternen aus *City Kit Roads* (Kenney) – alle CC0
- **Loadout vor jedem Spawn:** Primär- und Sekundärwaffe, Visier (Kimme & Korn, Rotpunkt, Holo, ACOG, Zielfernrohr), Mündung (Schalldämpfer, Kompensator), Unterlauf (Vertikalgriff, Winkelgriff, Laser) und Magazin (erweitert, Schnellzieh)
- **Zielen über das Visier** mit Rechtsklick, **Nachladeanimationen** (Magazin fällt zu Boden, Patronen einzeln, Revolvertrommel, Pumpe, Kammerstängel)
- **Grafik:** Low-Poly-Stil mit flächigen Materialien, Echtzeit-Schatten, spiegelnde Fenster, Himmel mit Wolken, drei Qualitätsstufen (Standard: Mittel)
- **Utility:** HE-, Blend- und Rauchgranate, Medipacks
- **Belohnung:** Wer eine Runde gewinnt, öffnet ein Glückspaket mit einem zufälligen Waffen-Skin
- **Lobby:** Nach dem Erstellen landet ihr in einer Lobby mit Spiel-Code, Spielerliste, Modus, Karte, Anzahl und Stärke der Bots – erst der Host startet das Spiel. Nach jeder Runde geht es dorthin zurück.
- **Zombies:** Koop-Modus auf der eigenen Karte „Tankstelle“ (Dämmerung): Welle um Welle von Zombies, Coins für Kills, Shop mit Waffen, Munition, Granaten, Medipacks, Schutzweste und Geschütztürmen
- **Schießstand:** Alle Waffen mit allen Aufsätzen ausprobieren, Scheiben auf 10/25/50 m und eine 45-Sekunden-Challenge mit fahrenden und aufklappenden Zielscheiben (Rekord wird gespeichert)
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
2. **Lobby:** Oben steht groß der **Code** und der Einladungslink (**Link kopieren** → in Discord/WhatsApp schicken). Der Host stellt Spielmodus, Karte, Anzahl der Bots und deren Stärke ein; alle sehen die Spielerliste (im Modus „Punkt erobern“ mit Teams). Mit **Loadout vorbereiten** kann jeder schon seine Waffen wählen.
3. **Freunde treten bei:** Link öffnen (oder im Startmenü den Code eintippen), Namen eingeben, **Beitreten** – sie erscheinen sofort in der Lobby.
4. **Spiel starten:** Der Host drückt **Spiel starten**. Nach Rundenende geht es automatisch zurück in die Lobby; der Host kann auch jederzeit über **Esc → Zurück zur Lobby** abbrechen. Verlässt der Host das Spiel, ist es für alle vorbei; beim eigenen Node-Server übernimmt der nächste Spieler die Lobby.

**Allein gegen Bots** öffnet dieselbe Lobby nur für dich. Willst du doch Freunde dazuholen, drückst du dort auf **Online stellen**.

**Schießstand** startet sofort einen Übungsplatz nur für dich (kein Internet nötig):
- **B** öffnet die Waffenwahl – Primär- und Sekundärwaffe samt Aufsätzen wechseln sofort.
- Feste Scheiben stehen auf 10 m (gelbe Marke), 25 m (orange) und 50 m (rot); ein Treffer zeigt Ring und Entfernung.
- **E** startet die **Zielscheiben-Challenge**: 45 Sekunden lang fahren Scheiben quer über die Bahnen oder klappen kurz hoch. Punkte gibt es nach Ring (Volltreffer in der Mitte am meisten), Entfernung und Bewegung. Oben stehen Zeit, Punkte, Treffer/Schüsse und dein Rekord (wird im Browser gespeichert).

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
| Shift | Sprinten (nur vorwärts; beim Sprinten kein Schießen und Zielen) |
| Strg oder C | Ducken (genauer) |
| X | Leise gehen (langsam, keine Schrittgeräusche) |
| R | Nachladen (bei der Schrotflinte: Schießen bricht das Nachladen ab) |
| 1 / 2 / 3 / Q | Primärwaffe / Sekundärwaffe / Messer / letzte Waffe |
| 4 / 5 / 6 | HE- / Blend- / Rauchgranate (G wechselt durch) |
| Tab | Scoreboard |
| Enter | Chat |
| B | Zombies: Shop öffnen · Schießstand: Waffe wählen |
| E | Schießstand: Challenge starten |
| Esc | Menü: Loadout, Maus, Sichtfeld, Lautstärke, Grafik, Vollbild, zurück zur Lobby, Einladungslink |

**Strg+W:** Wer geduckt vorwärts läuft, drückt Strg+W – das schließt normalerweise den Browser-Tab. Im Spiel fragt der Browser deshalb vorher nach („Seite verlassen?“ → *Abbrechen*). Sicherer ist **Esc → Vollbild**: Im Vollbild sperrt das Spiel die Tastenkombination (Chrome/Edge). Alternativ duckt auch **C**.

Läuft das Spiel ruckelig: **Esc → Grafik → Niedrig** (schaltet die Schatten ab und rendert mit geringerer Auflösung).

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

## Zombie-Modus

In der Lobby **Zombies** wählen – die Karte „Tankstelle“ wird automatisch gesetzt, Bots spielen nicht mit (nur ihr gemeinsam, bis 12 Spieler).

- **Ablauf:** 12 Sekunden Vorbereitung, dann kommen die Zombies durch die Lücken im Zaun. Ist eine Welle komplett erledigt, gibt es 20 Sekunden Pause und einen Coin-Bonus. Jede Welle bringt mehr und stärkere Zombies.
- **Zombie-Arten:** normale Zombies (zwei Modelle); ab Welle 3 schnelle **Läufer** (Rippen-Zombie); ab Welle 5 große **Kolosse** mit viel Leben und hartem Schlag. Kopfschüsse zählen mehr. Alle Zombies sind animiert (Gehen, Rennen, Schlagen, Treffer-Reaktion, Sterben); Grafikkarten mit zu wenigen Shader-Registern bekommen automatisch die alten Kastenfiguren.
- **Tod:** Wer stirbt, schaut zu und steigt in der nächsten Pause wieder ein. Sind alle gleichzeitig tot, ist das Spiel vorbei („Überrannt!“) und es geht zurück in die Lobby. Ab Welle 5 gibt es für alle ein Glückspaket.
- **Coins:** Start mit 500 Coins und der Pistole. +1 pro Treffer, 10/15/60 pro Kill (Zombie/Läufer/Koloss), +5 für Kopfschuss-Kills, Bonus nach jeder Welle.
- **Shop (Taste B, jederzeit – das Spiel läuft weiter!):**

| Kategorie | Angebot |
|---|---|
| Waffen | Revolver 200 · Viper SMG 400 · Breacher 500 · Scout 600 · M4 750 · AR-47 800 · Longbow 1000 · Brute LMG 1200 |
| Ausrüstung | Munition 150 · HE-Granate 150 · Blendgranate 100 (betäubt Zombies) · Medipack 200 · Schutzweste 300 (halbiert Schaden) |
| Stationär | MG-Geschützturm 900 (75 s, 24 m) · Schweres Geschütz 1500 (90 s, 45 m) – werden vor dir aufgestellt, max. 2 pro Spieler |

- **Munition ist begrenzt:** Neben dem Magazin gibt es eine Reserve (rechts unten „30 / 150“). Ist sie leer, hilft nur der Shop.
- Die Aufsätze aus deinem Loadout gelten auch für gekaufte Waffen.

## Regeln im Detail

- **Gun Game:** Zwei Kills mit der Stufenwaffe oder HE-Granate = +1 Stufe. Ein Messer-Kill bringt sofort +1 Stufe und klaut dem Opfer eine Stufe. Selbstmord kostet den Fortschritt bzw. eine Stufe. Ein Messer-Kill auf der letzten Stufe gewinnt.
- **Deathmatch:** Wer zuerst 40 Kills hat, gewinnt. Selbstmord kostet einen Kill.
- **Punkt erobern:** Zwei Teams (Blau startet im Osten, Rot im Westen, Bots werden aufgeteilt, kein Eigenbeschuss). Steht nur ein Team im leuchtenden Ring in der Kartenmitte, erobert es den Punkt in etwa 7 Sekunden (mit mehr Spielern schneller). Ist der Gegner auch im Ring, ist der Punkt umkämpft. Das Team, das den Punkt hält, bekommt 1 Punkt pro Sekunde; 180 Punkte gewinnen. Jeder Spieler des Siegerteams erhält ein Glückspaket.
- Jeder Kill heilt 30 HP. Nach dem Spawn gibt es 1,8 s Spawnschutz (endet beim ersten eigenen Schuss).
- Karte, Modus und Bots stellt der Host in der Lobby ein.

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
| `MODE` | Start-Modus in der Lobby: `gungame`, `dm`, `ctp` (Punkt erobern) oder `zombies` | gungame |

## Aufbau

| Datei | Inhalt |
|---|---|
| `index.html` | Startseite: Menü, Loadout-Bildschirm, HUD, Scoreboard |
| `game.js` | Client: WebGL-Renderer (Schatten, Materialien, 3D-Modelle), Bewegung, Waffen, Zielen, Animationen, Effekte, Sound |
| `shared.js` | Gemeinsame Spieldaten: Waffen, Aufsätze, Skins, Modi, Karten (inkl. Platzierung der Stadtmodelle), Raycasts, Kollision |
| `host.js` | Spiellogik des Hosts: Treffer, Leben, Stufen, Runden, Bots. Läuft im Browser des Hosts (GitHub Pages) oder in `server.js` |
| `net.js` | Verbindungen: Host im eigenen Browser, Beitritt per WebRTC/PeerJS, oder WebSocket zum eigenen Server |
| `server.js` | Optionaler Node-Server (HTTP + WebSocket ohne Bibliotheken) |
| `assets/models.bin`, `assets/models.json` | Aufbereitete 3D-Modelle (Waffen, Zubehör, Stadt mit drei Farbvarianten, Requisiten, Möbel, Pflanzen, Fahrzeuge) |
| `assets/zombies.bin` | Animierte Zombies (Skinning auf der Grafikkarte; wird im Hintergrund nachgeladen) |
| `tools/build_assets.py` | Erzeugt `assets/` aus den Original-Paketen (siehe unten) |

Fehlen die Dateien in `assets/` (oder lädt man `index.html` direkt von der Festplatte), läuft das Spiel mit der eingebauten Klötzchen-Grafik weiter – Kollision und Spiellogik sind identisch.

### Modelle neu erzeugen oder austauschen

`tools/build_assets.py` liest die Original-Pakete (OBJ-Waffen von Quaternius, GLB-Gebäude von Kenney), backt die Texturfarben in die Vertices, richtet die Waffen aus (Griff im Ursprung, Lauf nach vorn) und trennt bewegliche Teile (Magazin, Schlitten, Pumpe, Trommel, Zielfernrohr):

```bash
pip install pillow numpy
python3 tools/build_assets.py Pfad/zum/Ultimate_Gun_Pack Pfad/zum/kenney_city-kit-commercial assets \
  --zombie "Pfad/zum/Zombie Apocalypse Kit - March 2024" --nature Pfad/zum/Ultimate_Nature_Pack \
  --kaykit Pfad/zu/KayKit_City_Builder_Bits_1.0_FREE --furniture Pfad/zum/kenney_furniture-kit --roads Pfad/zum/kenney_city-kit-roads
```

Die fünf Zusatzpakete sind optional; ohne sie bleiben an den betreffenden Stellen die Klötzchen. Welche Modelle übernommen werden, steht in `PROPS` im Skript. Platziert werden sie in `shared.js` mit `Q`/`SQ` (`SQ` = punktsymmetrisch gespiegelt): Name wie `'nt:PineTree_1'`, Position, Drehung und Zielmaße in Metern. Die Modelle sind reine Optik – die Kollision kommt von unsichtbaren Kästen (`hide(true)`), damit Server und Browser immer dieselbe Karte haben.

Welche Waffe welches Modell bekommt, steht oben im Skript (`GUNS`). Wo die Häuser stehen, steht in `buildStadt` in `shared.js` (`kblock` für Häuserblöcke, `row` für die Häuserzeilen am Kartenrand).

Technik in Kürze: Die Bewegung rechnet jeder Browser selbst (fühlt sich sofort an), Treffer meldet der Schütze, und der Host prüft sie auf Plausibilität (Feuerrate, Sichtlinie, Position des Ziels). Das ist für Runden unter Freunden gedacht, nicht als Schutz gegen entschlossene Cheater.

## Credits

- 3D-Waffen: **Ultimate Gun Pack** von [Quaternius](https://quaternius.com) – CC0 1.0
- 3D-Gebäude: **City Kit (Commercial) 2.1** von [Kenney](https://www.kenney.nl) – CC0 1.0
- Zombies, Fahrzeuge, Endzeit-Requisiten: **Zombie Apocalypse Kit** von [Quaternius](https://quaternius.com) – CC0 1.0
- Bäume, Pflanzen, Felsen: **Ultimate Nature Pack** von [Quaternius](https://quaternius.com) – CC0 1.0
- Autos, Ampeln, Müllcontainer: **City Builder Bits** von [KayKit](https://www.kaylousberg.com) – CC0 1.0
- Möbel: **Furniture Kit** und Laternen: **City Kit Roads** von [Kenney](https://www.kenney.nl) – CC0 1.0
- Peer-to-Peer-Verbindungen: [PeerJS](https://peerjs.com) – MIT-Lizenz

Details in `CREDITS.md`.
