# Crash Corps (Arbeitstitel)

Class-based Cartoon-Arena-Shooter im Browser. Inspiriert von Team-Fortress-artigen Mobile-Shootern (bunt, überzeichnet, Klassen, Domination), aber eigene Marke: eigene Namen, eigene Figuren, eigene Assets. **Kein Nachbau eines bestehenden Spiels** – Namen, Charakterdesigns und Assets fremder Spiele werden nicht übernommen.

## Stack
- Vite + Three.js (ES-Module, kein Framework)
- Figuren als glTF-Modelle aus `public/assets/characters/` (Quaternius Ultimate Modular Men, CC0), geladen über `assets.js`. Waffen prozedural aus `gear.js` am Handknochen. Arena aus Toon-Kit-Props (`public/assets/props/`), Effekte per Code.
- Look: zwei Stile in `render.js`, umschaltbar über `?stil=real`. Standard ist Cel-Shading mit
  Lichtstufen-Rampe und Outline; `real` nutzt physikalische Materialien, Himmelslicht und
  Umgebungsverdeckung. ACES-Tone-Mapping passiert im Composite-Shader, nicht im Renderer –
  three wendet es beim Rendern in ein Render-Target nicht an.
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
  device.js    Touch-Erkennung und Leistungsstufe (Auflösung, Schatten, Verdeckung)
  input.js     Eingabe-Schicht: Tastatur, Maus und Touch zu einem Zustand gebündelt
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
- Die Toon-Kit-Figuren sind CC0 und dürfen bleiben. Eigene Modelle: siehe public/assets/README.md.
- Performance-Ziel: 60 fps auf Mittelklasse-Laptop, spielbar auf Handy. Auf Touch-Geräten greift automatisch die niedrigere Leistungsstufe aus `device.js`.
- Eingaben laufen nur über `input.js`. `player.js` kennt keine Tasten und keine Berührungen, sondern fragt `moveX/moveY`, `fire`, `jump` und die Flanken ab.
- Bewegung ist dreidimensional: `groundHeightAt()` liefert die Bodenhöhe, `resolveCollisions()` übergeht Quader unterhalb der Schrittweite (STEP_UP) und über Kopfhöhe. Rampen sind unsichtbare Stufen unter einer geneigten Platte.
- Nach Änderungen `npm run build` laufen lassen; muss ohne Fehler durchgehen.

## Roadmap
1. [x] Prototyp: Arena, 3 Klassen, Bots, Deathmatch gegen Bots, HUD
2. [ ] Domination-Modus (3 Kontrollpunkte, Team-Score)
3. [x] Cel-Shading + Outline-Pass
4. [x] Charakter-Animation prozedural (Laufen, Anschlag/Rückstoß, Umfallen) – Mixamo später
5. [ ] Sounds
6. [x] Touch-Controls (Mobile) – Bildschirm-Stick, Wischen zum Umsehen, Schaltflächen
7. [x] Asset-Pipeline: Modelle in `public/assets/`, Loader in `assets.js` (Quaternius Ultimate Modular Men, CC0)
8. [ ] Multiplayer-Server (eigenes Repo)

## Start
```
npm install
npm run dev
```
