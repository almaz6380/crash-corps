# Assets

Alle Modelle sind **CC0 1.0** (gemeinfrei, auch kommerziell, keine Namensnennung
nötig). Zwei Quellen: Kay Lousberg (kaylousberg.com) für Schurke und Magier,
Quaternius (quaternius.com) für den Ork, die Arena-Props und die früheren Figuren.

## characters/qua_ork.glb — „Ultimate Monsters" (im Spiel aktiv)

Ein richtiger Ork: grün, Hauer, Irokese, Stachelkeule. Ein Material `Atlas`,
7344 Dreiecke, 43 Knochen nach Quaternius-Schema – aber **ohne `Wrist`**, die
Hand heißt `Index1.R`, und statt `Chest` gibt es `Torso`.

Zwei Eigenheiten gegenüber den KayKit-Figuren:

- **Keine Ziel- und keine Seitwärts-Clips.** Ohne `runLeft/Right/Back` fällt die
  Richtungsmischung in `animation.js` weg, der Ork läuft immer vorwärts. Statt
  einer Zielpose bekommt er `Weapon` als Schuss-Ebene: bei jedem Schuss ein
  Keulenhieb. Deshalb hat sein Eintrag kein `layers.aim`.
- **Seine Keule ist an die Knochen gewichtet, nicht angehängt.** In der dritten
  Person ideal. Für das Ego-Bild backt `cloneWeaponMesh` sie zu einem starren
  Mesh um und schiebt sie auf den Ursprung – ein einfacher Klon behielte das
  Skelett der Vorlage, das nie mitläuft, und stünde in der Bindepose.

Von 14 Clips sind 6 übrig (`tools/glb-schlanken.mjs --liste=monster`): aus
1,22 MB werden 0,42 MB.
Quelle: https://quaternius.com/packs/ultimatemonsters.html — dort auch Goblin,
Dämon, Yeti, Ninja und rund 45 weitere, alle mit demselben Rig.

## characters/kay_*.glb — „KayKit Character Pack: Adventurers" (im Spiel aktiv)

Comic-Fantasy, eine Farbatlas-Textur je Figur (1024×1024), ein Material, rund
5700 Dreiecke. Rig mit 41 Knochen: `hips`, `spine`, `chest`, `head`,
`upperarm.l/r`, `lowerarm.l/r`, `wrist.l/r`, `hand.l/r`, `handslot.l/r`.
An `handslot.r` hängen die Waffen als eigene Meshes – deshalb `weapons` im
Manifest statt einer prozeduralen Waffe aus `gear.js`.

| Datei | Quelle | Klasse | Waffe |
|---|---|---|---|
| `kay_schurke.glb` | Rogue | Nachtschatten | `2H_Crossbow` |
| `kay_magier.glb`  | Mage  | Runenweber    | `2H_Staff` |

Der Barbar aus demselben Paket wäre ein guter vierter Anwärter; sein Eintrag
`kay_ork` steht noch im Manifest, die Datei liegt aber nicht mehr hier.

Die Pakete bringen 76 Clips mit (kämpfen, sitzen, liegen, jubeln). Im Spiel sind
14 übrig; der Rest ist mit `tools/glb-schlanken.mjs` entfernt – das spart je
Figur rund 2,7 MB, und zwar nicht nur an Kurvendaten, sondern vor allem an
Buchhaltung im JSON-Teil der Datei.
Quelle: https://kaylousberg.itch.io/kaykit-adventurers
Ebenfalls CC0 und passend: „Character Pack: Skeletons" (vier Skelette, gleiches
Rig) – https://kaylousberg.itch.io/kaykit-skeletons

## characters/men_*.glb — „Ultimate Modular Men" (Alternative, nicht aktiv)

Menschliche Proportionen, 62 Knochen, keine eigenen Waffen (die kommen aus
`gear.js` und hängen an `Wrist.R`). Clips: `Idle`, `Idle_Gun`,
`Idle_Gun_Pointing`, `Idle_Gun_Shoot`, `Gun_Shoot`, `Walk`, `Run`, `Run_Shoot`,
`Run_Left/Right/Back`, `Death`, `HitRecieve`, `Roll`, `Punch_*`, `Kick_*`, …

| Datei | Figur | Klasse |
|---|---|---|
| `men_spacesuit.glb` | Spacesuit | – |
| `men_punk.glb`      | Punk      | – |
| `men_swat.glb`      | Swat      | – |

Weitere Figuren im selben Paket (gleicher Rig, gleiche Clips): Adventurer,
Beach, Casual_2, Casual_Hoodie, Farmer, King, Suit, Worker.
Quelle: https://quaternius.com/packs/ultimatemodularcharacters.html

## characters/toon_soldier.glb — „Toon Shooter Game Kit" (Alternative, nicht aktiv)

Comic-Proportionen mit großem Kopf. 43 Knochen, 14 Waffen-Meshes am Knochen
`Index1.R`, Clips `Idle`, `Walk`, `Run`, `Idle_Shoot`, `Walk_Shoot`, `Run_Shoot`,
`Death`, `HitReact`. Bleibt als Beispiel dafür im Manifest, wie mitgelieferte
Waffen über `weapons`/`weaponHide` angesprochen werden. Das Paket enthält außerdem Arena-Props (Container,
Sandsäcke, Kisten, Fässer, Zäune, Bäume) – noch nicht eingebunden.
Quelle: https://quaternius.com/packs/toonshootergamekit.html

## props/*.glb — Arena-Ausstattung aus dem „Toon Shooter Game Kit" (CC0)

30 statische Props (Container, Structures, Sandsäcke, Zaun, Bäume, Panzer,
Autowrack, Fässer, Kisten, Straßenlaterne, …), nach GLB gepackt. Geladen
über `preloadProps()` in `assets.js`, gesetzt in `world.js` mit `place()`.
Jedes solide Prop bekommt einen unsichtbaren Kollisionsquader aus seiner
Bounding-Box; Bewegung und Sichtlinien laufen dagegen, das Modell ist Optik.
Quelle: https://quaternius.com/packs/toonshootergamekit.html

## Eigene Figuren einhängen

Zwei Werkzeuge nehmen das Raten heraus:

```
node tools/glb-info.mjs <datei.glb>
```
Zeigt Knochen, Clips samt Dauer, Materialien (inklusive der Regel, die im Stil
`?stil=real` greifen wird), Maße und den Speicherbedarf – und druckt am Ende
eine Vorlage für den Manifest-Eintrag. Ohne das schreibt man den Eintrag blind:
ein falscher Knochenname gibt nur eine Warnung in der Konsole, ein falscher
Clip-Name gar nichts.

```
node tools/glb-schlanken.mjs --liste=kay quelle.glb ziel.glb
node tools/glb-schlanken.mjs --dreiecke=7000 --textur=512 quelle.glb ziel.glb Idle Walk Run
```
Wirft alle Clips außer den gebrauchten weg und packt die Datei neu. Fertige
Pakete bringen oft 70 bis 90 Animationen mit; das Spiel benutzt vierzehn.

Für Figuren aus Bild-zu-3D-Diensten (Meshy, Tripo, Hunyuan3D) zusätzlich:
`--dreiecke=<n>` reduziert die Geometrie, `--textur=<px>` die Bildgröße. Solche
Figuren kommen mit Hunderttausenden bis Millionen Dreiecken und 2K- oder
4K-Texturen; die Arena zeichnet jedes Bild zweimal, jedes Dreieck zählt also
doppelt. Zielwert 6000 bis 8000 Dreiecke. Erreicht der Vereinfacher das Ziel
nicht, bremst die erlaubte Abweichung – dann `--fehler=0.05` setzen. Die
Hautgewichte überleben; ab etwa 90 Prozent Reduktion franst die Verformung an
Schultern und Fingern aus.

Dann:

1. GLB nach `public/assets/characters/<name>.glb` legen.
2. In `src/assets.js` unter `CHARACTER_MODELS` eintragen:
   - `bones`: Hüfte, Wirbelsäule, Brust, Kopf, Ober-/Unterarme, Hände.
     Namen werden normalisiert verglichen (Groß/Klein, Punkte, Doppelpunkte egal).
   - `clips`: mindestens `idle`, `walk`, `run`. Optional `aimIdle`/`aimWalk`/
     `aimRun` (Anschlag), `death`, `hit`.
   - `weapons`: Name des mitgelieferten Waffen-Meshes je Waffen-Id, plus
     `weaponHide` für alle, die ausgeblendet werden sollen. Fehlt das, baut
     `gear.js` eine prozedurale Waffe und hängt sie mit `grip` an `rightHand`.
   - `tintMaterials`: welche Materialien die Klassenfarbe bekommen.
   - `yaw`: Drehung, falls das Modell nicht nach +z schaut (Mixamo: `Math.PI`).
     Verlässlich prüfen lässt sich das am Umhang: der hängt hinten.
   - `grip`: Versatz, Drehung, Größe der prozeduralen Waffe am Handknochen.
   - `viewmodel`: Lage der mitgelieferten Waffe im Ego-Bild. `laenge` gibt die
     gewünschte Länge in Metern an, statt eines Faktors – wie groß eine Waffe
     im Modell gebaut ist, ist von Paket zu Paket verschieden. `form` erzwingt
     stattdessen eine prozedurale Waffe aus `gear.js` (`axt`, `shotgun`, `smg`,
     `rifle`), unabhängig vom Spielwert der Klasse.
   - `scaleBias`: Ausgleich, wenn Hut, Helm oder erhobener Stab in der
     Bounding-Box stecken. Der Maßstab kommt aus der Gesamthöhe, sonst
     schrumpft der Körper.
   - `tintMix`: wie stark die Klassenfarbe in eine texturierte Figur mischt
     (Standard 0.8). Bei Atlas-Texturen sind 0.4 bis 0.5 genug.
3. In `src/classes.js` bei der Klasse `model: '<name>'` setzen.

Modelle ohne Anschlag-Clips (z. B. Mixamo-Export mit nur Idle/Walk/Run)
bekommen den Anschlag prozedural: `aimTune` beschreibt, wohin Hände und
Ellbogen relativ zur Brust zeigen; die Knochenwinkel werden daraus berechnet.
