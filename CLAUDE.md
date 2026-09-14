# Crash Corps (Arbeitstitel)

Class-based Cartoon-Arena-Shooter im Browser. Inspiriert von Team-Fortress-artigen Mobile-Shootern (bunt, überzeichnet, Klassen, Domination), aber eigene Marke: eigene Namen, eigene Figuren, eigene Assets. **Kein Nachbau eines bestehenden Spiels** – Namen, Charakterdesigns und Assets fremder Spiele werden nicht übernommen.

## Stack
- Vite + Three.js (ES-Module, kein Framework)
- Figuren als glTF-Modelle aus `public/assets/characters/` (Quaternius Ultimate Modular Men, CC0), geladen über `assets.js`. Waffen prozedural aus `gear.js` am Handknochen. Arena aus Toon-Kit-Props (`public/assets/props/`), Effekte per Code.
- Look: zwei Stile in `render.js`, umschaltbar über `?stil=real`. Standard ist Cel-Shading mit
  Lichtstufen-Rampe und Outline; `real` nutzt physikalische Materialien, Himmelslicht und
  Umgebungsverdeckung. ACES-Tone-Mapping passiert im Composite-Shader, nicht im Renderer –
  three wendet es beim Rendern in ein Render-Target nicht an.
- Klang wird synthetisiert, nicht geladen (`sound.js`): gefiltertes Rauschen plus
  Oszillatoren, dazu ein kurzer Faltungshall. Das kostet keine Bytes im Offline-Speicher.
- Kein TypeScript im Prototyp, JSDoc wo sinnvoll.

## Struktur
```
src/
  main.js      Bootstrap, Game-Loop, Zustand (Menü → Match → Ende)
  world.js     Arena aus Props: zwei Ebenen (Boden + begehbare Dächer), Rampen, Kollisionsquader, Licht
  player.js    FPS-Controller (PointerLock, WASD, Sprung, Kollision grob)
  classes.js   Klassendefinitionen (HP, Speed, Waffe, Farbe, Spezial)
  weapons.js   Waffenlogik (Raycast-Hitscan, Cooldown, Spread, Schaden)
  bots.js      Bot-Gegner (Zustandsautomat: patrol → chase → shoot)
  characters.js Prozedurale Low-Poly-Figur pro Klasse
  assets.js    Modell-Manifest, Laden, Klonen pro Figur (Knochen, Clips, Materialien)
  gear.js      Ego-Waffe (Klon aus dem Modell) + prozedurale Ersatzwaffen für Modelle ohne eigene
  render.js    Zwei Stile: Cel-Shading mit Outline oder physikalisch (Himmel, Umgebungslicht,
               Umgebungsverdeckung). Tone-Mapping liegt im Composite-Shader.
  style.js     Stilumschalter (?stil=real)
  device.js    Touch-Erkennung, Leistungsstufe (Auflösung, Schatten, Verdeckung) und die
               Bühne: Bildmaße, bei hochkant gehaltenem Handy um 90° gedreht
  input.js     Eingabe-Schicht: Tastatur, Maus und Touch gebündelt; Anordnung der
               Bildschirm-Knöpfe (verschiebbar, skalierbar, in localStorage)
  aimassist.js Zielhilfe für Touch: Reibung im Zielkegel und träges Nachführen
  gyro.js      Zielen mit dem Gyroskop: Drehrate statt Lage. Die Blickachsen werden
               beim Einschalten kalibriert (zwei Bewegungen), nicht hergeleitet
  domination.js Modus mit drei Kontrollpunkten: Mannschaften, Eroberung, Punktestand,
               Marker in der Arena und Marschziele für die Bots
  sound.js     Klang, vollständig zur Laufzeit erzeugt (WebAudio) – keine Audiodateien.
               Schüsse, Treffer, Schritte, Nachladen, Spezial, Menü. Weltklänge mit
               Entfernungsdämpfung und Panorama relativ zur Blickrichtung.
  surface.js   Oberflächen für den realistischen Stil: PBR-Texturen, bei Props ohne UVs
               über Weltraum-Projektion (triplanar)
  animation.js Skelett-Clips (Stehen/Gehen/Rennen, Anschlag-Varianten, Tod) + Knochen-Overlays als Ersatz
  hud.js       DOM-HUD (HP, Munition, Fadenkreuz, Killfeed, Score, Klassenwahl)
  style.css
```

## Regeln für Änderungen
- Gameplay-Werte (HP, Schaden, Cooldowns) leben nur in `classes.js` / `weapons.js`, nirgends hartcodiert.
- Kein Server-Code in diesem Repo, bis der Single-Player-Loop sauber ist. Multiplayer kommt als separater Schritt (autoritativer Server, Colyseus oder eigenes WS-Protokoll).
- Neue Klasse = Eintrag in `classes.js` (inkl. `model`) + ggf. Modell-Eintrag in `assets.js`. Sonst nichts anfassen.
- Mannschaften: jede Figur hat `team` (0 = Spielerseite). Wer auf wen schießen darf,
  entscheidet allein diese Zahl – `main.js` reicht den Bots die passende Gegnerliste.
  Deathmatch ist derselbe Code: Spieler in Mannschaft 0, alle Bots in Mannschaft 1.
- Domination-Regelwerte stehen nur in `REGELN` in `domination.js`. Die Lage der
  Kontrollpunkte gehört zur Karte und kommt aus `world.js` (`world.punkte`).
- Die Toon-Kit-Figuren sind CC0 und dürfen bleiben. Eigene Modelle: siehe public/assets/README.md.
- Performance-Ziel: 60 fps auf Mittelklasse-Laptop, spielbar auf Handy. Auf Touch-Geräten greift automatisch die niedrigere Leistungsstufe aus `device.js`.
- Das Bild ist immer quer. Hält jemand das Handy hochkant (Drehsperre), dreht
  `buehneAnpassen()` in `device.js` die Bühne `#buehne` (Canvas, HUD, Touch-Schicht)
  per CSS um 90°. Deshalb nie `innerWidth`/`innerHeight` oder `clientX`/`clientY`
  direkt benutzen: Maße kommen aus `bild()`, Zeigerpositionen aus `zuBild()`.
  `@media (max-height)` sähe das Hochformat-Fenster – dafür gibt es `body.klein`.
- Eingaben laufen nur über `input.js`. `player.js` kennt keine Tasten und keine Berührungen, sondern fragt `moveX/moveY`, `fire`, `jump` und die Flanken ab.
- Blick kommt aus zwei Quellen: `takeLook()` in Pixeln (Maus, Wischen) und
  `takeGyro()` im Bogenmaß. Getrennt halten – das eine wird noch mit der
  Empfindlichkeit multipliziert, das andere ist schon ein Winkel.
- Das Gyroskop misst die Drehrate, nicht die Lage: so wirkt es wie eine Maus und
  driftet nicht. **Die Achsen werden kalibriert, nicht hergeleitet.** Drei Versuche,
  sie aus Spezifikation, Schwerkraft oder `screen.orientation` abzuleiten, sind auf
  echter Hardware gescheitert – Sensoren melden je nach Gerät in anderen Achsen und
  mit anderen Vorzeichen. Beim Einschalten macht der Spieler zwei Bewegungen (links
  drehen, oben kippen); die aufsummierte Drehung ergibt je einen Vektor im
  Gerätesystem, und die *sind* die Gier- und Nickachse. Gezählt wird der größte
  Ausschlag, nicht die Nettodrehung – wer vor dem Tippen zurückdreht, verliert
  die Richtung sonst. Ein dritter Schritt zeigt einen Punkt, der sich wie der
  Blick bewegt; „Stimmt“ wird erst frei, wenn der Punkt rechts und oben war.
  Die Schwerkraft dient nur zur Anzeige und zur Plausibilitätsprüfung von
  Schritt 1 (Schwenk = Drehung um die Hochachse), nie zum Zielen; die Prüfung
  warnt einmal und lässt dann durch. Jeder Schritt zeigt die rohen Sensorwerte
  – ein Bildschirmfoto davon ist die einzige Ferndiagnose. Nie wieder eine Annahme
  über x/y/z in diesen Code schreiben – wenn etwas falsch herum läuft, neu
  kalibrieren, nicht das Vorzeichen raten. Während der Kalibrierung darf die
  Schleife den Gyro-Puffer nicht leeren (`kalibLaeuft` in `main.js`). Gespeicherte
  Achsen bleiben: der Gyro-Knopf kalibriert nur, wenn keine da sind; neu messen
  geht über „Neu kalibrieren“. iOS gibt den Sensor nur aus einer Geste frei,
  deshalb holt `main.js` das Einschalten bei der ersten Berührung nach.
- Klangfarben stehen nur in `sound.js` (Tabelle `SCHUSS`). Spieler und Bots rufen
  Methoden auf (`schuss`, `treffer`, `schritt` …) und kennen keine Frequenzen.
  Klänge in der Welt bekommen eine Position mit, eigene nicht – daraus ergibt sich
  Lautstärke und Seite. Die Schleife meldet dafür jeden Frame `sound.listener()`.
- Bewegung ist dreidimensional: `groundHeightAt()` liefert die Bodenhöhe, `resolveCollisions()` übergeht Quader unterhalb der Schrittweite (STEP_UP) und über Kopfhöhe. Rampen sind unsichtbare Stufen unter einer geneigten Platte.
- Nach Änderungen `npm run build` laufen lassen; muss ohne Fehler durchgehen.

## Roadmap
1. [x] Prototyp: Arena, 3 Klassen, Bots, Deathmatch gegen Bots, HUD
2. [x] Domination-Modus – 3 Kontrollpunkte, 3 gegen 3, Punkte je gehaltenem Punkt
3. [x] Cel-Shading + Outline-Pass
4. [x] Charakter-Animation prozedural (Laufen, Anschlag/Rückstoß, Umfallen) – Mixamo später
5. [x] Sounds – prozedural erzeugt, mit Richtungshören und Ton-Schalter (M)
6. [x] Touch-Controls (Mobile) – Bildschirm-Stick, Wischen zum Umsehen, anpassbare Schaltflächen, Zielhilfe
7. [x] Asset-Pipeline: Modelle in `public/assets/`, Loader in `assets.js` (Quaternius Ultimate Modular Men, CC0)
8. [ ] Multiplayer-Server (eigenes Repo)

## Auslieferung
- Das Menü zeigt unten „Stand TT.MM., HH:MM“ – der Bauzeitpunkt aus `vite.config.js`
  (`__BUILD__`). Daran erkennt man am Handy, ob der Service Worker die neue
  Version schon ausliefert.
- `npm run build` erzeugt `dist/` und trägt über `tools/sw-liste.mjs` die Vorlade-Liste
  und eine Version in den Service Worker ein. Ohne diesen Schritt kennt er die Modelle
  nicht und das Spiel ist offline nur zufällig verfügbar.
- Als App installierbar (Manifest, Icons, Service Worker). Service Worker brauchen HTTPS;
  über eine LAN-Adresse lässt es sich spielen, aber nicht installieren.
- `tools/einzeldatei.mjs` packt alles in eine HTML-Datei ohne Server.
- Was eingebettet bzw. vorgehalten wird, bestimmt `tools/assets-liste.mjs` – die Auswahl
  folgt `classes.js` (Modelle) und `world.js` (Props), ungenutzte Alternativen bleiben draußen.

## Start
```
npm install
npm run dev
```
