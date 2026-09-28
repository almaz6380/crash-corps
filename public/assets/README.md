# Assets

Eigene Figuren über Mixamo einbauen: **MIXAMO.md** in diesem Ordner. Achtung,
Mixamo-Inhalte sind *nicht* CC0 – Adobe erlaubt die Nutzung im eigenen Projekt,
nicht die Weitergabe der Dateien als Asset. Was heute hier liegt, ist CC0 und
darf bleiben, wie es ist.

Alle Modelle sind **CC0 1.0** (gemeinfrei, auch kommerziell, keine Namensnennung
nötig). Zwei Quellen: Quaternius (quaternius.com) für die drei Spielfiguren, das
Dorf und die Arena-Props, Kay Lousberg (kaylousberg.com) für die Figuren auf der
Reserve.

## props/dorf.glb — „Medieval Village MegaKit" (im Spiel aktiv)

Die Arena. 33 Bauteile aus einem Bausatz von 176, gepackt mit
`tools/kit-packen.mjs` in **eine** Datei mit geteilten Texturen – einzeln
gewandelt läge dieselbe Putztextur in einem Dutzend Dateien.

Raster: Wände 2 m breit und 3,12 m hoch, Böden 2×2 m, Treppenmodule 2 m breit
mit 1 m Steigung (im Spiel auf 1,2 m gestreckt, zwei übereinander ergeben die
Galeriehöhe von 2,4 m). Dächer sind auf Grundflächen zugeschnitten: `6x8` deckt
ein Haus von 6×8 m mit anderthalb Metern Überstand. Ein zu großes Dach auf einem
kleinen Haus ragt meterweit in die Gasse – `world.js` wählt deshalb nach der
tatsächlichen Grundfläche und dreht notfalls um 90°.

Mit `--textur=1024 --nur-farbe` sind es 1,48 MB. Die Quelltexturen sind
2048 × 2048; auf 512 verkleinert wären es 1,41 MB – die vierfache Zahl an
Texturpunkten kostet also **70 KB**, weil WebP diese Oberflächen sehr gut
packt. 2048 wären 1,73 MB und damit auch bezahlbar, aber acht Texturen
dieser Größe belegen auf dem Gerät rund 172 MB Texturspeicher statt 43 –
deshalb 1024.
Quelle: https://quaternius.itch.io/medieval-village-megakit

Einen Marktstand hat der Bausatz nicht. Die Vordächer darin (`Overhang_*`) sind
Wandteile und liegen frei auf dem Platz wie abgestürzte Hausdächer; die Stände
baut `world.js` deshalb selbst aus vier Pfosten, einem Tisch und einem Segeldach.

## props/natur.glb — „Stylized Nature MegaKit“ (im Spiel aktiv)

Waldrand und Grün im Dorf: neun Teile (drei Bäume, zwei Büsche, Farn, Gras,
Fels, Kiesel) aus einem Bausatz von 68, gepackt wie das Dorf.

Gepackt mit `--textur=512 --nur-farbe --dreiecke=5000 --fehler=0.12
--kanten-frei`: 1,24 MB und 13 457 Dreiecke statt 3,05 MB und 40 000.
Bei 256 waren es 1,16 MB – die Verdopplung kostet 80 KB und ist bei Laub gut
angelegt, denn dessen Form steckt allein in der Alphastufe: zu grob, und die
Blattränder werden zu Treppen. Laub
besteht aus einzelnen Blattkärtchen – hält man beim Vereinfachen deren Ränder
fest (der Normalfall), lässt sich nichts wegnehmen; bei Kulisse ist
`--kanten-frei` dafür zu verschmerzen.

Zwei Dinge, die man dabei wissen muss:

- **Die Blattform steckt allein in der Alphastufe** (`alphaMode: MASK`). Die
  Toon-Umwandlung in `assets.js` muss `alphaTest` mitübernehmen, sonst wird aus
  einem Busch ein dunkler Klotz.
- **Der Outline-Pass tauscht alle Materialien gegen eines aus** und kennt den
  Alphatest nicht. Ohne Gegenmaßnahme zieht er weiße Rahmen um jedes
  Blattkärtchen. Pflanzen laufen deshalb auf der Ebene `OHNE_UMRISS` aus
  `render.js`: gezeichnet werden sie normal, nur die Kantenerkennung sieht sie
  nicht.
- **`Leaves_TwistedTree` ist Herbstlaub**, kein Sommergrün. Der Busch
  `Bush_Common` ist damit rot – im Dorf steht deshalb `Bush_Common_Flowers`
  (grün, mit Blüten), rot nur als Farbtupfer draußen am Rand.

Quelle: https://quaternius.itch.io/stylized-nature-megakit

## characters/qua_barbar|schurke|magier.glb — selbst zusammengesetzt (im Spiel aktiv)

Diese drei Figuren liegen in keinem Paket fertig herum; sie werden aus drei
gebaut, mit `tools/figur-bauen.mjs`:

| Paket | liefert |
|---|---|
| Universal Base Characters | Körper, Kopf, Gesicht, Haare, Bart |
| Modular Character Outfits – Fantasy | Kleidung: Bauer und Waldläufer |
| Universal Animation Library | 43 Bewegungen, davon 9 im Spiel |

Alle drei teilen dasselbe Skelett mit 65 Knochen (`root`, `pelvis`, `spine_01`
… `hand_r`), deshalb lassen sie sich überhaupt mischen. Das Werkzeug nimmt die
Animationsbibliothek als Gerüst, wirft ihre Anzeigepuppe weg und hängt die Haut
der Einzelteile auf deren Knochen um.

**Der Haken, den man kennen muss:** Die Outfits sind für die Proportion
„Regular" geschnitten, kostenlos ist aber nur „Superhero". Der nackte Körper
schaut sonst durch die Kleidung. `--behalten=` schneidet ihn deshalb über die
Hautgewichte zurecht – beim Waldläufer und Magier auf den Kopf, beim Barbaren
auf Kopf und Oberkörper, denn der geht mit nacktem Oberkörper in den Kampf.

Was kostenlos **nicht** dabei ist: Ritter, Magier-Robe, Adliger und die großen
Monster (Oger, Werwolf, Dämon). Die stecken in den kostenpflichtigen
„Source"-Fassungen, 20 $ je Paket auf itch.io.

Waffen bringen die Figuren keine mit. Axt, Armbrust und Zauberstab baut
`gear.js` prozedural; welche Form eine Figur trägt, sagt `waffenform` im
Manifest, die Lage an der Hand `grip`.

Größen je Figur: rund 9000 Dreiecke, eine 512er-Farbtextur je Material,
0,98 bis 1,24 MB. Ohne `--nur-farbe` (Normalen- und Rauheitskarten) und ohne
`resample` (Schlüsselbilder) wären es 2,9 MB.

## characters/qua_ork.glb — „Ultimate Monsters" (Alternative, nicht aktiv)

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

Warum er wieder auf der Reserve sitzt: neben den KayKit-Figuren fiel er ab –
anderer Zeichner, andere Handschrift, in derselben Arena sieht man das. Wer ihn
zurückholen will, setzt in `classes.js` bei `brawler` wieder `model: 'qua_ork'`.
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
| `kay_barbar.glb`  | Barbarian | Grimmbart | `2H_Axe` |
| `kay_schurke.glb` | Rogue     | Nachtschatten | `2H_Crossbow` |
| `kay_magier.glb`  | Mage      | Runenweber    | `2H_Staff` |

Der Barbar trägt vier Waffen und einen Schild am Gürtel; `weaponHide` blendet
alles außer der Streitaxt aus. Eingefärbt wird er nicht (`tintMaterials: []`) –
die Textur bringt ihre Farbe mit.

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

## props/*.glb — Arena-Ausstattung aus dem „Toon Shooter Game Kit" (nicht aktiv)

Die Ausstattung der alten Containerhalde. Seit dem Dorf setzt `world.js` nur
noch Teile aus `dorf.glb` und `natur.glb`; die Dateien hier bleiben als
Alternative liegen und landen weder im Offline-Paket noch in der Einzeldatei –
`tools/assets-liste.mjs` folgt `world.js`, nicht dem Ordner.

30 statische Props (Container, Structures, Sandsäcke, Zaun, Bäume, Panzer,
Autowrack, Fässer, Kisten, Straßenlaterne, …), nach GLB gepackt. Geladen
über `preloadProps()` in `assets.js`, gesetzt in `world.js` mit `place()`.
Jedes solide Prop bekommt einen unsichtbaren Kollisionsquader aus seiner
Bounding-Box; Bewegung und Sichtlinien laufen dagegen, das Modell ist Optik.
Quelle: https://quaternius.com/packs/toonshootergamekit.html

## hdri/himmel.hdr — Himmel und Licht des realen Stils

Eine HDRI von Poly Haven (CC0): `kloofendal_48d_partly_cloudy_puresky`, 1k,
1,37 MB. Sie ist im realen Stil **die** Lichtquelle – Umgebungslicht über
PMREM und zugleich der sichtbare Himmel.

Warum nicht der gerechnete Himmel von three: der liefert Werte bis knapp über
1. Gemessen lag damit das ganze Bild zwischen 0,09 und 0,5 – kein Glanz, keine
tiefen Schatten, nichts, woraus eine Belichtung etwas machen könnte. Die HDRI
bringt die echten Größenordnungen mit: Himmel um 1, Sonne 60 000.

Die Sonnenrichtung liest `sonneAusHdri()` aus dem hellsten Fleck – gemessen
48° Höhe, genau die 48 im Dateinamen. Neue HDRI holen:

```
node tools/hdri-holen.mjs <polyhaven-name> --res=1k
```

## textures/dorf_* — Fotooberflächen des Dorfes

Sechs Sätze von Poly Haven (CC0), je Basisfarbe, Normale und Rauheit:

| Ordner | Poly Haven | liegt auf |
|---|---|---|
| `dorf_putz/` | medieval_wall_01 | MI_Plaster – Putzwände |
| `dorf_stein/` | medieval_blocks_05 | MI_UnevenBrick, MI_Brick, MI_RockTrim |
| `dorf_dach/` | clay_roof_tiles_03 | MI_RoundTiles – Ziegeldächer |
| `dorf_holz/` | medieval_wood | MI_WoodTrim – Balken, Geländer |
| `dorf_pflaster/` | cobblestone_floor_02 | Arenaboden |
| `dorf_wiese/` | aerial_grass_rock | Boden außerhalb |

Holen und verkleinern mit `node tools/textur-holen.mjs <name> <ziel>`: aus rund
3 MB Rohmaterial je Satz werden 600 KB. Zugeordnet wird in
`SURFACE_FOR_MATERIAL` (`src/surface.js`) über den **Materialnamen** des
Bausatzes, nicht über den Prop-Namen – nur so trifft es jedes Wandstück.

Diese Dateien stehen **nicht** in der Vorlade-Liste: sie werden nur im realen
Stil geholt und danach vom Service Worker zwischengespeichert.

## Eigene Figur bauen, ohne zu bezahlen

Die KI-3D-Dienste lassen einen kostenlos erzeugen, aber nicht kostenlos
herunterladen – das ist ihr Geschäftsmodell. Zwei Werkzeuge kommen ohne diese
Schranke aus, und zusammen ergeben sie eine vollständige Kette:

| Werkzeug | Rolle | Lizenz |
|---|---|---|
| TRELLIS (Microsoft) | Bild zu 3D | MIT, kommerziell erlaubt |
| Mixamo (Adobe) | Skelett und Animationen | frei, keine Namensnennung nötig |

Die beiden sprechen verschiedene Formate, dafür gibt es zwei Umrechner:

```
node tools/glb-nach-obj.mjs figur.glb ordner/
```
Schreibt OBJ, MTL und Textur und packt sie als ZIP – so nimmt Mixamo die Figur
entgegen, glTF versteht es nicht. Die Geometrie wird dabei in Weltkoordinaten
ausgerechnet, weil der Rigger mit lokalen Systemen durcheinanderkommt.

```
node tools/fbx-nach-glb.mjs ziel.glb koerper.fbx=Idle laufen.fbx=Walk rennen.fbx=Run
```
Holt die Mixamo-Dateien zurück und führt sie zu einer GLB zusammen. Die erste
Datei muss den Körper enthalten („With Skin"), die weiteren dürfen ohne sein.
Zwei Dinge erledigt das Skript dabei stillschweigend, die sonst still
schiefgehen: **Mixamo nennt jede Animation „mixamo.com"** – ohne Umbenennen
hießen alle Clips gleich und das Spiel fände immer denselben. Und **die Kanäle
zeigen auf die Knochen ihrer eigenen Datei** – sie werden über den Namen auf das
Skelett der ersten umgehängt, die Zweitskelette fliegen raus. Ohne das hätte die
Figur nach drei Animationen 129 Knochen statt 43.

Beide Werkzeuge nehmen auch GLB als Eingabe, damit sich die Kette ohne
Mixamo-Dateien prüfen lässt.

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

Für Figuren aus Bild-zu-3D-Diensten (TRELLIS, Meshy, Tripo, Hunyuan3D) zusätzlich:
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
