# Crash Corps (Arbeitstitel)

Class-based Cartoon-Arena-Shooter im Browser, seit dem Figurentausch im Fantasy-Gewand: Barbar, Schurke, Magier statt Soldaten, Axt, Armbrust und Zauberstab statt Gewehren. Inspiriert von Team-Fortress-artigen Mobile-Shootern (bunt, überzeichnet, Klassen, Domination), aber eigene Marke: eigene Namen, eigene Figuren, eigene Assets. **Kein Nachbau eines bestehenden Spiels** – Namen, Charakterdesigns und Assets fremder Spiele werden nicht übernommen; das gilt für Fantasy-Vorbilder genauso wie für Shooter.

## Stack
- Vite + Three.js (ES-Module, kein Framework)
- Figuren als glTF-Modelle aus `public/assets/characters/`, geladen über `assets.js`. Die drei Spielfiguren sind aus drei CC0-Paketen von Quaternius selbst zusammengebaut (Körper, Kleidung, Bewegungen – `tools/figur-bauen.mjs`) und tragen prozedurale Waffen aus `gear.js` am Handknochen; welche Form, sagt `waffenform`. Die KayKit-Figuren liegen als Alternativen daneben: bei ihnen hängen die Waffen als Meshes an `handslot.r` und werden über `weapons`/`weaponHide` ein- und ausgeblendet. Arena ist ein mittelalterliches Dorf aus dem „Medieval Village MegaKit" (CC0), gepackt als ein Bausatz `dorf.glb`, dazu Bäume, Büsche und Gras aus dem
  „Stylized Nature MegaKit“ als `natur.glb`; Effekte per Code.
- Look: zwei Stile in `render.js`. **Standard ist `real`**: fotografische Oberflächen,
  Himmelslicht aus einer HDRI, AgX-Kurve, Streulicht. `toon` ist das alte Cel-Shading mit
  Lichtstufen-Rampe und Outline und die Vorgabe auf Touch-Geräten. Umschalten über den
  Knopf im Menü (`stilSetzen`, wirkt nach dem Neuladen) oder `?stil=real|toon`.
  Tone-Mapping passiert im Composite-Shader, nicht im Renderer – three wendet es beim
  Rendern in ein Render-Target nicht an.
- Klang wird synthetisiert, nicht geladen (`sound.js`): gefiltertes Rauschen plus
  Oszillatoren, dazu ein kurzer Faltungshall. Das kostet keine Bytes im Offline-Speicher.
- Kein TypeScript im Prototyp, JSDoc wo sinnvoll.

## Struktur
```
src/
  main.js      Bootstrap, Game-Loop, Zustand (Menü → Match → Ende)
  terrain.js   Das Höhenfeld unter allem: eine feste Funktion, abgetastet auf
               2 m. Talstadt, zwei Böschungen, zwei Terrassen, Hochterrasse –
               an z = 0 gespiegelt. Die Hohlwege sind Einschnitte darin
  world.js     Die Stadt am Hang, 240 x 240 m, gebaut aus Mustern (gasse, hof,
               bruestung, rampenstrasse, ruine), je Seite einmal. Drei Ebenen,
               Stadtmauer, fuenf Kontrollpunkte, Kollisionsraster, Licht
  navgitter.js Wegfindung: 2-m-Zellen ueber die Welt, A*, Glaettung ueber
               Sichtlinien. Ebenen laufen weiter ueber world.ramps
  player.js    FPS-Controller (PointerLock, WASD, Sprung, Kollision grob)
  classes.js   Klassendefinitionen (HP, Speed, Waffe, Farbe, Spezial)
  weapons.js   Waffenlogik (Raycast-Hitscan, Cooldown, Spread, Schaden)
  bots.js      Bot-Gegner (Zustandsautomat: patrol → chase → shoot)
  characters.js Prozedurale Low-Poly-Figur pro Klasse
  assets.js    Modell-Manifest, Laden, Klonen pro Figur (Knochen, Clips, Materialien)
  gear.js      Ego-Waffe (Klon aus dem Modell) + prozedurale Ersatzwaffen für Modelle ohne eigene
  render.js    Zwei Stile: fotoreal (HDRI-Himmel, AgX, Streulicht) oder Cel-Shading mit
               Outline. HDR-Zwischenbild, Tone-Mapping im Composite-Shader.
               Ebene `OHNE_UMRISS` für alles, was die Kantenerkennung nicht sehen soll
  leben.js     Was sich bewegt, ohne mitzuspielen: Schornsteinrauch, Banner in
               Mannschaftsfarbe an den Kontrollpunkten, Vögel über dem Dorf
  style.js     Stilumschalter (?stil=real)
  mess.js      Testflug: feste Strecke, einmal je Stufe geflogen, und in jedem
               Lauf ist eine Stufe aus. Der Abstand zwischen zwei Läufen ist,
               was die Stufe auf diesem Gerät kostet
  device.js    Touch-Erkennung, Leistungsstufe (Auflösung, Schatten, Verdeckung) und die
               Bühne: Bildmaße, bei hochkant gehaltenem Handy um 90° gedreht
  input.js     Eingabe-Schicht: Tastatur, Maus und Touch gebündelt; Anordnung der
               Bildschirm-Knöpfe (verschiebbar, skalierbar, in localStorage)
  aimassist.js Zielhilfe für Touch: Reibung im Zielkegel und träges Nachführen
  gyro.js      Zielen mit dem Gyroskop: Drehrate statt Lage. Die Blickachsen werden
               beim Einschalten kalibriert (zwei Bewegungen), nicht hergeleitet
  domination.js Modus mit fuenf Kontrollpunkten: Mannschaften, Eroberung, Punktestand,
               Marker in der Arena und Marschziele für die Bots
  sound.js     Klang, vollständig zur Laufzeit erzeugt (WebAudio) – keine Audiodateien.
               Schüsse, Treffer, Schritte, Nachladen, Spezial, Menü. Weltklänge mit
               Entfernungsdämpfung und Panorama relativ zur Blickrichtung.
  surface.js   Oberflächen für den realistischen Stil: PBR-Texturen, bei Props ohne UVs
               über Weltraum-Projektion (triplanar)
  animation.js Skelett-Clips (Stehen/Gehen/Rennen, Anschlag-Varianten, Tod) + Knochen-Overlays als Ersatz
  figurlook.js Beleuchtung der Figuren: weniger Fülllicht, schmaler Saum,
               Bodenverdunkelung. Greift nur in Figurenmaterialien, nicht in die
               Arena – dort ist das Licht eingestellt und soll so bleiben
  vorschau.js  Standbilder der Figuren für die Klassenwahl. Einmal beim Laden in
               einen eigenen kleinen Renderer, der danach weggeworfen wird –
               aus der Ich-Perspektive sieht man die eigene Figur sonst nie
  hud.js       DOM-HUD (HP, Munition, Fadenkreuz, Killfeed, Score, Klassenwahl)
  style.css
tools/
  figur-bauen.mjs   Baut eine Spielfigur aus Körper, Kleidung und einer
                    Animationsbibliothek zusammen; schneidet den nackten Körper
                    über die Hautgewichte zurecht
  kit-packen.mjs    Packt einen modularen Bausatz (Wände, Dächer, Treppen) in
                    eine GLB mit geteilten Texturen
  glb-info.mjs      Liest den JSON-Teil einer GLB: Knochen, Clips, Materialien,
                    Maße – und druckt eine Vorlage für den Manifest-Eintrag
  glb-schlanken.mjs Wirft alle Clips außer einer Liste weg und packt neu; dazu
                    --dreiecke und --textur für Figuren aus Bild-zu-3D-Diensten
  glb-nach-obj.mjs  GLB nach OBJ+MTL+Textur als ZIP – so nimmt Mixamo eine Figur an
  fbx-nach-glb.mjs  Mixamo-FBX zurück nach GLB und alle Clips in eine Datei
  mixamo-figur.mjs  Ein Ordner voll Mixamo-Downloads → fertige Spielfigur samt
                    Manifest-Eintrag: wandeln, Clips benennen, zusammenhängen,
                    `mixamorig:` streichen, Texturen kürzen, messen
  mixamo-pruefen.mjs Prüft die Namensregeln des Imports gegen das echte
                    Mixamo-Skelett – ohne Downloads, ohne Browser
  gangtempo.mjs     Für welches Tempo ist ein Laufclip gebaut, und wohin schaut
                    die Figur? Beides gemessen statt geraten
  balance.mjs       Rechnet Duelldauern aus Klassen- und Waffenwerten aus und
                    meldet Ausreißer – ohne das Spiel zu starten
  hdri-holen.mjs    Holt eine HDRI von Poly Haven (CC0) als Lichtquelle des
                    realen Stils, samt Herkunftsvermerk
  textur-holen.mjs  Holt einen Fotooberflächen-Satz von Poly Haven, verkleinert
                    ihn und legt ihn für `surface.js` ab
  bild-messen.mjs   Vergleicht Bilder über Tonwertumfang und ausgebrannte
                    Flächen – „sieht besser aus“ ist kein Befund
  assets-liste.mjs  Welche Assets das Spiel zur Laufzeit wirklich holt
  sw-liste.mjs      Trägt Liste und Version in den Service Worker ein
  einzeldatei.mjs   Packt den Build in eine einzelne HTML-Datei
```

## Regeln für Änderungen
- Gameplay-Werte (HP, Schaden, Cooldowns) leben nur in `classes.js` / `weapons.js`, nirgends hartcodiert.
- Auf Figuren wird nie direkt geschossen: jede trägt einen unsichtbaren
  Trefferquader aus `trefferQuader()` (`characters.js`), und der ist das Ziel
  der Strahlen. Ein Strahl gegen eine animierte Figur verfehlt sie verlässlich
  unzuverlässig – three prüft zuerst die Hülle aus der Bindepose, und die passt
  zur Laufpose nicht. Der Kopf ist die oberste Zone des Quaders
  (`TREFFERZONEN.hoehe`), Kopftreffer zählen doppelt, und Zone mal Spezial ist
  auf `MAX_FAKTOR` gedeckelt.
- Jede Waffe hat ihre eigene Abfallkurve (`abfall` in `weapons.js`), keine
  gemeinsame Formel: die Kurve entscheidet, welche Klasse auf welcher
  Entfernung gewinnt. Nach jeder Änderung an Klassen- oder Waffenwerten
  `node tools/balance.mjs` laufen lassen – es rechnet Duelldauern aus und
  meldet Ausreißer (Abschuss mit einem Körpertreffer, Revier vertauscht).
- Bots zielen auf die Brust (`ZIELHOEHE` in `bots.js`), nie auf die Augen: auf
  Augenhöhe liegt der Kopf, und dann wäre fast jeder zweite Treffer ein
  Kopftreffer, ohne dass jemand gezielt hätte.
- Wie gut ein Bot ist, steht in der Tabelle `KI` in `bots.js` – Reaktionszeit,
  Streuung, ab wann er Deckung sucht, wie oft er die Spezialfähigkeit nutzt.
  Das sind keine Klassenwerte (die stehen in `classes.js`), sondern Können.
  Die Streuung ist ein **Winkel**: ein fester Versatz auf dem Richtungsvektor
  machte Bots auf 30 m genauer als auf 5 m, weil der Vektor so lang ist wie die
  Entfernung.
- Das Zielkreuz eines Bots wird nachgeführt (`zielFuehren`), es schnappt nicht.
  Die Waffen treffen ohne Flugzeit – würde ein Bot sofort auf die aktuelle
  Position zielen, wäre Ausweichen wirkungslos. Die Nachführung ist der einzige
  Hebel, den ein Spieler gegen einen Hitscan-Gegner hat.
- Deckung (`deckungSuchen`) sind Punkte an den vier Seiten naher
  Kollisionsquader, geprüft mit derselben Sichtprüfung wie beim Zielen. Die
  Suche läuft höchstens alle `KI.deckungPruefen` Sekunden, nicht je Bild – sie
  schießt je Kandidat einen Strahl.
- Kein Server-Code in diesem Repo, bis der Single-Player-Loop sauber ist. Multiplayer kommt als separater Schritt (autoritativer Server, Colyseus oder eigenes WS-Protokoll).
- Neue Klasse = Eintrag in `classes.js` (inkl. `model`) + ggf. Modell-Eintrag in `assets.js`. Sonst nichts anfassen.
- **Ein Gangzyklus sind zwei Schritte.** Die Obergrenze der Abspielrate in
  `animation.js` ist eine Schrittfrequenz, keine abstrakte Zahl: Rate 1,9 heißt
  beim Barbaren Zyklus 0,49 s und 245 Schritte je Minute, Rate 2,8 heißt 361 –
  das rennt niemand, und genau so sah es aus. Wer die Grenze anfasst, rechnet
  vorher `2 / (Zyklusdauer / Rate) * 60` aus.
- Die Zielhilfe führt das Fadenkreuz **nur nach, während der Spieler selbst den
  Blick bewegt** – Wischen oder Gyro, nicht der Laufstick. Mit dem Stick in der
  Rechnung drehte die Kamera beim bloßen Laufen mit bis zu 50 Grad je Sekunde
  von allein, sobald ein Gegner im Kegel stand; das fühlt sich an, als gehorche
  die Steuerung nicht. Umschaltbar ist sie über den Knopf 🎯 im Menü – ob eine
  Zielhilfe hilft oder im Weg ist, lässt sich nicht messen, das sagt nur der,
  der sie benutzt.
- Die **Wisch-Empfindlichkeit** ist einstellbar („Bedienung anpassen", gemerkt
  in `localStorage`). Auf dem Handy ist Wischen die einzige Art zu zielen, und
  der richtige Wert hängt an Daumen und Bildschirmgröße – eine feste Zahl ist
  für die eine Hälfte zäh und für die andere nervös. `player.js` multipliziert
  sie auf `sens`; der Gyro hat seinen eigenen Regler, weil er Winkel liefert
  und keine Pixel.
- `BLICK.ab` ist die Schwelle, ab der „rückwärts" gilt, und sie wird am
  Laufstick gemessen: -0,3 sind bei voller Auslenkung 17 Grad hinter der
  Querrichtung, also fast jede seitliche Bewegung. Auf dem Handy ist der Stick
  analog – damit drehte der Blick ständig von selbst mit.
- **`walkSpeed`/`runSpeed` werden gemessen, nicht geschätzt** (`tools/gangtempo.mjs`).
  Sie sagen, für welches Tempo der Clip gebaut ist; `animation.js` rechnet daraus
  die Abspielrate. Steht dort eine erfundene Zahl, rutschen die Füße über den
  Boden – das ist der Eindruck, den man als „sieht billig aus" beschreibt.
  Gemessen wird die Strecke, die der Fuß gegen die Hüfte zurücklegt, geteilt
  durch die Clipdauer, und mal dem Maßstab, auf den das Spiel die Figur bringt.
  Alle elf Figuren im Repo lagen zwischen zwei- und sechsfach daneben.
- Mixamo: die Anleitung steht in `public/assets/MIXAMO.md`, der Import ist
  **ein** Aufruf (`tools/mixamo-figur.mjs`). Zwei Fallen stecken dort schon
  abgefangen: three streicht Doppelpunkte aus Knotennamen (`mixamorig:LeftArm`
  wird zu `mixamorigLeftArm`), und `upperBones` vergleicht mit `startsWith` –
  ein Präfix `Arm` trifft damit auch den Wurzelknoten `Armature` und legt die
  ganze Figur in die Anschlagsebene. Deshalb leitet der Import `upperBones` aus
  der Knochenhierarchie ab (alles unterhalb des Wirbels) statt aus einer
  Namensliste, und `tools/mixamo-pruefen.mjs` hält das fest.
- Neue Figur: **erst `node tools/glb-info.mjs <datei.glb>`**, dann den Eintrag schreiben.
  Ein falscher Knochenname gibt nur eine Warnung in der Konsole, ein falscher
  Clip-Name gar nichts, und ein `tintMaterials`, das auf kein Material passt,
  färbt stillschweigend nicht ein. Fertige Pakete vorher durch
  `tools/glb-schlanken.mjs` schicken – 76 Clips statt 14 kosten je Figur rund 2,7 MB.
  Der Dateiname muss dem Wert von `model:` entsprechen, und der muss ein
  einfach zitierter String sein: `tools/assets-liste.mjs` sucht ihn per
  regulärem Ausdruck, sonst fehlt die Figur offline und in der Einzeldatei.
- Manifest-Schlüssel jenseits der Knochen und Clips: `scaleBias` gleicht aus,
  wenn Hut oder Helm in der Bounding-Box stecken (der Maßstab kommt aus der
  Gesamthöhe); `tintMix` regelt, wie stark die Klassenfarbe in eine texturierte
  Figur mischt; `viewmodel` beschreibt die Lage der mitgelieferten Waffe im
  Ego-Bild, mit `laenge` in Metern statt eines Faktors, und mit `form` wahlweise
  eine prozedurale Waffe aus `gear.js` statt der mitgelieferten. Ist die Waffe im
  Modell an die Knochen gewichtet statt angehängt, backt `cloneWeaponMesh` sie
  fürs Ego-Bild zu einem starren Mesh um – ein Klon behielte sonst das Skelett
  der Vorlage und stünde in der Bindepose.
- Mannschaften: jede Figur hat `team` (0 = Spielerseite). Wer auf wen schießen darf,
  entscheidet allein diese Zahl – `main.js` reicht den Bots die passende Gegnerliste.
  Deathmatch ist derselbe Code: Spieler in Mannschaft 0, alle Bots in Mannschaft 1.
- Domination-Regelwerte stehen nur in `REGELN` in `domination.js`. Die Lage der
  Kontrollpunkte gehört zur Karte und kommt aus `world.js` (`world.punkte`).
  `zielFuer()` schickt die Bots los: fremde und neutrale Punkte zuerst, ein
  eigener nur, wenn er gerade umkämpft ist – sonst rennt die ganze Mannschaft
  nach vorn, während zu Hause in Ruhe erobert wird.
- Die Toon-Kit-Figuren sind CC0 und dürfen bleiben. Eigene Modelle: siehe public/assets/README.md.
- Performance-Ziel: 60 fps auf Mittelklasse-Laptop, spielbar auf Handy. Auf Touch-Geräten greift automatisch die niedrigere Leistungsstufe aus `device.js`.
- Figuren behalten ihr physikalisches Material aus dem Loader, während Props und
  Welt auf Toon-Material umgestellt werden. Damit hängen sie allein am Licht der
  Arena, und das ist für Figuren zu flach. `figurlook.js` zieht deshalb je Figur
  den indirekten Lichtanteil herunter (`fuellAnteil`), legt einen schmalen Saum
  auf die Silhouette und dunkelt zum Boden hin ab. Regler stehen in `LOOK`.
  Den Saum sparsam dosieren: zu viel, und die Figur bekommt einen milchigen
  Schleier und verliert ihre Farbe.
- Die Klassenkarten zeigen ein Bild der Figur, erzeugt von `vorschau.js`. Auf
  kleinen Bildschirmen steht es neben dem Text statt darüber (`body.klein`),
  sonst wächst das Menü über den Bildschirm hinaus.
- Das Bild ist immer quer. Hält jemand das Handy hochkant (Drehsperre), dreht
  `buehneAnpassen()` in `device.js` die Bühne `#buehne` (Canvas, HUD, Touch-Schicht)
  per CSS um 90°. Deshalb nie `innerWidth`/`innerHeight` oder `clientX`/`clientY`
  direkt benutzen: Maße kommen aus `bild()`, Zeigerpositionen aus `zuBild()`.
  `@media (max-height)` sähe das Hochformat-Fenster – dafür gibt es `body.klein`.
- **Der Blick folgt der Laufrichtung** (`BLICK` in `player.js`): wer rückwärts
  läuft, schaut nach einem Moment dorthin, wo es hingeht, statt rückwärts auf
  die Kamera zuzulaufen. Nur in der Verfolgersicht, nicht beim Schießen, nicht
  während man sich selbst umsieht, und erst ab `BLICK.ab` rückwärts – seitwärts
  soll den Blick nicht mitziehen, sonst gäbe es kein Ausweichen mehr.
  Dazu gehört zwingend der **Laufanker**: die Eingabe wird gegen einen
  festgehaltenen Blickwinkel gerechnet, nicht gegen den laufenden. Sonst dreht
  sich mit dem Blick auch die Bedeutung von „rückwärts“, und die Figur läuft im
  Kreis. Neu festgehalten wird beim Stehenbleiben, beim eigenen Umsehen und ab
  20° Richtungsänderung am Stick. Die Animation bekommt deshalb die Laufrichtung
  **im Bezugssystem der Figur**, nicht die rohe Eingabe – sonst moonwalkt sie,
  sobald der Blick nachgedreht hat.
- Zwei Ansichten: Ego und Verfolger, umgeschaltet mit **V** oder dem Auge-Knopf;
  die Wahl liegt in `localStorage`, ab Werk die Verfolgersicht. Sichtbar ist immer
  genau eins – Ego-Waffe **oder** ganze Figur (`sichtAnwenden()`), nie beides.
  Der Spieler hat dafür eine eigene Figur aus `buildCharacter`, animiert wie die
  Bots; der unsichtbare Trefferquader bleibt daneben bestehen, denn er ist das
  Ziel der Bots. Die Figur bekommt **kein** `userData.target`, sonst zählt jeder
  Treffer doppelt.
- In der Verfolgersicht zeigt die Bildmitte woandershin als der Lauf. Deshalb
  bestimmt `zielen()` erst von der Kamera aus den Punkt im Fadenkreuz, und
  gefeuert wird von der Figur dorthin. Steht die Figur dicht an einer Deckung,
  die der Spieler gar nicht sieht, käme kein Schuss durch – dann feuert
  `schussStart()` von der Kamera. Gemessen: null Abweichung in beiden Ansichten.
- Die Kamera rückt in zwei Schritten heran: erst gerade nach hinten, dann zur
  Seite. In einem Zug gerechnet fräße eine seitliche Hauswand auch den Abstand
  nach hinten. Bleibt weniger als `SCHULTER.zeigen` Platz, wird die Figur
  ausgeblendet – sonst steckt die Kamera im Kopf und nimmt das halbe Bild.
- **Aus der Runde muss man wieder herauskommen.** Am Rechner macht das Esc, auf
  dem Handy der Knopf ☰ oben links (`menu` in `DEFAULT_LAYOUT`). Beides hält die
  Runde nur an: sie steht vollständig weiter da, und „Weiter spielen“ im Menü
  setzt sie fort. Ein Menüknopf, der die Runde wegwirft, wäre ein Ausknopf – wer
  nur den Ton umstellen will, verlöre sein Spiel.
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
  Schleife den Gyro-Puffer nicht leeren (`kalibLaeuft` in `main.js`).
- **Ein Tipp auf den Kompass schaltet ein und lässt an.** Der Kalibrierbildschirm
  erscheint **nur**, wenn es gar keine Achsen gibt (`hatAchsen`) oder wenn jemand
  ausdrücklich „Neu kalibrieren“ tippt. Ein Prüfschritt bei jedem Einschalten ist
  eine Zumutung, kein Schutz – genau das war er einmal, und es war falsch.
  Die Einrichtung sind **zwei Bewegungen**, dann ist sie gespeichert und fertig.
  Es gab dort einmal einen dritten Bildschirm, auf dem ein Punkt im Raster die
  Richtung bestätigen musste. Wer ihn nicht bestand – und das ist genau der,
  dessen Achsen verkehrt herum liegen –, bekam beim nächsten Einschalten wieder
  alles von vorn und nie einen laufenden Gyro. Eine Prüfung, die nur den
  aussperrt, der Hilfe braucht, ist keine.
- Zielt der Gyro verkehrt herum, ist das **ein Tipp**: die Pfeile ↔ und ↕ stehen
  neben dem Kompass im Menü, sobald er an ist. Vorher lagen sie nur unter
  „Bedienung anpassen“, und wer das nicht weiß, hält den Gyro für kaputt. iOS gibt den Sensor nur aus einer Geste frei,
  deshalb holt `main.js` das Einschalten bei der ersten Berührung nach.
- Klangfarben stehen nur in `sound.js` (Tabelle `SCHUSS`). Spieler und Bots rufen
  Methoden auf (`schuss`, `treffer`, `schritt` …) und kennen keine Frequenzen.
  Klänge in der Welt bekommen eine Position mit, eigene nicht – daraus ergibt sich
  Lautstärke und Seite. Die Schleife meldet dafür jeden Frame `sound.listener()`.
- Bewegung ist dreidimensional: `groundHeightAt()` liefert die Bodenhöhe, `resolveCollisions()` übergeht Quader unterhalb der Schrittweite (STEP_UP) und über Kopfhöhe. Treppen sind unsichtbare Stufen unter den sichtbaren Treppenmodulen – die Geometrie einer echten Treppe als Kollision zu nehmen, ließe jeden an der Stufenkante hängen.
- Häuser sind massive Quader, keine betretbare Kulisse: ein Kollisionsquader je Haus statt einer je Wandstück, sonst bleibt man in den Fugen hängen.
- Nichts darf eine Lücke von unter zwei Metern zur Spielfeldgrenze lassen. Bots fahren sich in solchen Ritzen fest und laufen bis zum Rundenende gegen die Wand; Häuser am Rand stehen deshalb bündig.
- Treppen zeigen nach innen. Liegt ihr Fuß außerhalb von `bounds`, ist der Wegpunkt für die Bots unerreichbar – sie drücken dann ewig gegen die Grenze, statt hochzusteigen.
- Pflanzen bestehen aus Blattkärtchen, deren Form allein in der Alphastufe der
  Textur steckt (`alphaMode: MASK`). Zwei Stellen müssen mitspielen: die
  Toon-Umwandlung in `assets.js` übernimmt `alphaTest`, sonst wird aus dem Busch
  ein dunkler Klotz – und der Normalen-Durchgang in `render.js` tauscht alle
  Materialien gegen eines aus und kennt den Alphatest nicht, zöge also Rahmen um
  jedes Kärtchen. Laub und Rauch laufen deshalb auf der Ebene `OHNE_UMRISS`;
  `place()` erkennt sie am Prop-Namen (`LAUB`).
- Was sich von allein bewegt, steht in `leben.js` und bekommt vom Modus nur den
  Zustand gereicht (`world.leben.update(dt, dom)` in der Schleife). Die
  Bannerfarbe kommt aus `TEAMS`, der Besitzer aus `dom.punkte` – `world.punkte`
  sind reine Ortsangaben.
- Marktstände und Dachterrassen baut `world.js` selbst aus Quadern. Der Bausatz
  hat keinen Stand, und seine Vordächer sind Wandteile: frei auf dem Platz
  liegen sie da wie abgestürzte Hausdächer.
- Die Karte ist punktsymmetrisch. Was auf der einen Seite Deckung, Aufstieg oder
  Sichtschutz ist, gehört gespiegelt auch auf die andere – sonst hat eine
  Mannschaft die bessere Hälfte.
- Das Farbbild wird in ein **Halbgleitkomma**-Target gerendert. Mit acht Bit
  wurde alles über Weiß abgeschnitten, bevor Belichtung und Kurve rechneten –
  daher der ausgebrannte Himmel im realen Stil. Gemessen stehen dort mit Sonne
  im Bild Werte bis 44 000.
- Das Licht des realen Stils kommt aus einer HDRI (`assets/hdri/himmel.hdr`),
  nicht aus gerechnetem Himmel: der liefert nur Werte bis knapp über 1, und aus
  so einem flachen Signal macht keine Belichtung ein Foto. Die Sonnenrichtung
  liest `sonneAusHdri()` aus dem hellsten Fleck – nie von Hand eintragen, sonst
  steht der Schatten woanders als die Sonne. Ohne Netz bleibt `buildRealSky()`
  als Rückfallebene.
- Oberflächen im realen Stil: `SURFACE_FOR_MATERIAL` in `surface.js` ordnet
  jedem Material des Bausatzes (MI_Plaster, MI_RoundTiles …) einen Fotosatz zu.
  Die Kit-Teile haben UVs, also `uvSurface()` statt Weltraum-Projektion. Die
  Fotofarbe wird **eingemischt, nicht ersetzt** – sonst sehen zwei Wandstücke
  verschieden aus, weil ihre UV-Inseln verschieden groß sind. Große Flächen
  brauchen `makro`, sonst sieht man das Kachelraster.
- **Über Texturauflösung entscheidet die Texeldichte, nicht das Gefühl.** Wie
  viele Texel je Meter ein Material hat, steht in der UV-Spanne gegen die
  Bauteilmaße; wie viele Bildpunkte je Meter der Bildschirm hat, ist
  `hoehePx / (2 · d · tan(fov/2))` – auf dem Handy mit Bildpunkten 2,0 sind das
  465 auf einem Meter, 232 auf zwei, 93 auf fünf. Ab dem Schnittpunkt liegt die
  Textur im Überfluss da und eine höhere ändert nichts.
  Ausgerechnet und ausprobiert: der Dorfbausatz auf 1024 kostet nur 70 KB
  Download, schiebt die Wände aber bloß von „scharf ab 1,8 m" auf 0,9 m – so
  dicht steht niemand vor einer Hauswand. Gemessen an zwei Blickpunkten:
  3,94 → 3,94 und 4,41 → 4,50. Deshalb bleibt das Dorf bei 512.
  Der Naturbausatz von 256 auf 512 dagegen bleibt: ein Blattkärtchen ist 3,9 m
  breit und benutzt die Textur einmal, das sind 66 Texel je Meter und „scharf
  erst ab sieben Metern" – an einem Baum läuft man näher vorbei.
  Der Speicher ist die zweite Grenze: acht Texturen sind bei 512 rund 11 MB,
  bei 1024 rund 43, bei 2048 rund 172. Die Download-Größe ist für diese
  Entscheidung das falsche Maß.
- Die Vorlade-Liste ist zweigeteilt (`assetGruppen()` in `tools/assets-liste.mjs`):
  Grundpaket (Figuren, Bausatz) unter 8 MB und offline, Realismus-Satz (HDRI,
  Fotooberflächen) nur nachgeladen. Neue Realismus-Assets gehören in die zweite
  Gruppe, sonst wächst das Offline-Paket unbemerkt.
- `figurlook.js` greift **nur** im Cel-Stil. Saum, gedämpftes Fülllicht und
  Bodenverdunkelung sind Ersatz für Licht, das es im realen Stil wirklich gibt.
- Die Automatik zielt auf **60 Bilder** – flüssig vor hübsch. `leistungPruefen()`
  in `main.js` schaltet stufenweise ab: Streulicht, dann Umgebungsverdeckung
  (die den Normalen-Durchgang mitnimmt), dann Bildpunkte, dann Figuren, zuletzt
  der Stil. Sie läuft in **beiden** Stilen; vorher stieg sie bei `if (!REAL)
  return` sofort aus, und auf dem Handy gab es damit gar keine Automatik.
- Die Stufen der Leiter stehen in `sparsam()` in `render.js`, nach Kosten je
  sichtbarem Verlust: Streulicht → Umgebungsverdeckung (nimmt den
  Normalen-Durchgang mit) → Kantenglättung → Bildpunkte → Schattenschärfe →
  Bildpunkte tiefer → Figuren → Stil. Die Kantenglättung sitzt **nicht** am
  Renderer, sondern als `samples` am Farb-Target, und ein Target merkt sich
  seinen Framebuffer: ohne `dispose()` bleibt die alte Anzahl stehen und der
  Schalter tut stillschweigend nichts. Dasselbe gilt für die Schattenkarte –
  `mapSize` allein reicht nicht, die Karte muss weg (`shadow.map = null`).
- **Am Anschlag misst der Testflug nichts.** Liegt der erste Lauf beim Takt des
  Bildschirms, sind die Abstände in Klammern Streuung, keine Kosten – gemessen
  auf einem Handy: 58,8 Bilder und „ohne Verdeckung (−13,4)", obwohl auf der
  niedrigen Stufe gar keine Verdeckung an war. Der Bericht schätzt den Takt
  deshalb aus den schnellsten Bildern und sagt es dazu; und eine Stufe, die
  ohnehin aus war, bekommt „(war aus)" statt einer Zahl.
- Der Testflug misst einen **Kameraflug mit stehendem Spieler**: keine Eingabe,
  keine Kollision, keine Verfolgerkamera. Meldet er 59 Bilder und es fühlt sich
  trotzdem hakelig an, liegt es genau in diesem Unterschied – oder am Drosseln
  nach ein paar Minuten. Dafür schreibt `Spielmessung` nebenher mit und zeigt
  im Pausenmenü Median, 1-%-Tief und die Zahl der **Hänger** (Bilder länger als
  zwei Bildschirmperioden). Ein Hänger ist das, was man sieht; im Median ist er
  unsichtbar.
- Jede Stufe der Leiter gehört auch in `LAEUFE` in `mess.js`. Eine Messung, die
  andere Knöpfe drückt als das Spiel, misst das falsche Spiel.
- Die Leiter hat einen **Rückweg** (`grosszuegig()`). Ohne ihn ist sie eine
  Einbahnstraße: ein einziger schwerer Moment – ein Rauchfeld, nachgeladene
  Texturen – kostete den Rest der Runde die halbe Grafik. Zurückgenommen wird
  erst nach `LEISTUNG.ruhe` guten Prüfungen hintereinander, sonst pendelt es.
- Der Rückfall auf den Comic-Stil greift nur im realen Stil und erst sehr tief
  (`aufgebenUnter`): ein Gerät, dessen Bildschirm auf 30 Hz steht, liefert 30
  und ist trotzdem in Ordnung. Wer den Stil selbst gewählt hat, wird nicht
  überstimmt.
- Die Welt ist 240 x 240 m und hat ein **Höhenfeld** (`terrain.js`). Bild,
  Kollision und Wegfindung fragen dieselbe Funktion `hoeheBei()`; wer
  woanders rechnet, baut ein Loch im Boden. Alles in `world.js` rechnet in
  Höhen **über Gelände** – die Hilfsfunktionen schlagen die Geländehöhe drauf.
- **Gespiegelt an z = 0**, nicht punktsymmetrisch: die Mannschaften stehen im
  Norden und im Süden, und `landschaft()` hängt nur von `|z|` ab. Jede Anlage
  wird zweimal gebaut (`seiten()`); Drehungen spiegelt `mry()`, Richtungen
  `mdir()`. Was auf der Spiegelachse steht (Markt, Handwerkerhöfe), wird
  **einmal** gebaut – sonst stehen zwei Anlagen ineinander.
- Steiler als `NEIGUNG_MAX` ist Wand, nicht Rampe: `resolveCollisions()` hält
  an, wer bergauf in eine zu steile Neigung läuft. Höhe wird dadurch zur
  Spielfeldgrenze. Hinauf geht es nur über die **Hohlwege**, die `terrain.js`
  in die Böschungen schneidet – drei je Seite, damit nicht die ganze
  Mannschaft in derselben Engstelle steht.
- Treppen beginnen auf dem **Boden am Treppenfuß**, nicht auf der Bauhöhe des
  Decks: am Hang stünde die unterste Stufe sonst in der Luft. Nach jeder
  Änderung an Treppen oder Höfen jeden Aufstieg einmal zu Fuß ablaufen lassen.
- Bauteile werden **gesammelt, nicht gesetzt**: `place()` merkt sich nur
  Position, Drehung und Maßstab, `bauFertig()` baut daraus je Bauteil und
  Bezirk eine `InstancedMesh`. Kollisionsquader kommen **nicht** in die Szene –
  sie werden nie gezeichnet und würden nur je Bild durchlaufen.
- Kollisionsquader liegen in einem Raster von 8 m. `inBereich()` liefert die
  Quader unter einem Rechteck, `amStrahl()` die entlang eines Strahls. Beide
  liefern **Kandidaten**, keine Treffer – wer die Überlappung nicht selbst
  prüft, sperrt ganze Rasterzellen (so war einmal das halbe Tal unbegehbar).
- Bots laufen über das Navigationsgitter, wenn die Luftlinie verstellt ist.
  Der **Aufstieg ist der letzte Schritt**: erst über den Boden in die Nähe,
  dann die Treppe. Andersherum schickt jedes höher liegende Ziel den Bot auf
  die nächstbeste Treppe, und er steht auf einem Dach im Tal, während der
  Punkt auf der Terrasse liegt. Zum Fuß einer Treppe läuft er ebenfalls über
  das Gitter, nicht geradeaus.
- Die Stufengrenze im Gitter ist die **Neigung**, nicht `STEP_UP`: auf einem
  durchgehenden Hang läuft man bergauf, ohne zu steigen. Mit der Schrittweite
  als Grenze ist jede Auffahrt gesperrt.
- Jeder Modus hat seinen Ausschnitt (`world.zonen`), und `resolveCollisions()`
  begrenzt **je Achse**: das Tal ist dreimal so lang wie breit. Deathmatch
  spielt im Tal mit sechs Figuren, Domination auf der ganzen Karte mit zwölf.
  Die Figurenzahl ist der letzte Regler in `leistungPruefen()`, paarweise
  gekürzt, damit das Sparen den Spielstand nicht verschiebt.
- **Schärfung und Umriss vertragen sich nicht ohne Vorkehrung.** Das Mittel der
  Nachbarn im Composite kommt aus dem rohen Farbbild und kennt die Abdunklung
  durch den Umriss nicht; auf einer Linie steht die Farbe schon bei 12 Prozent,
  das Mittel noch hell, und die Schärfung drückt den Bildpunkt unter Null. Wo
  viele Linien dicht beieinanderliegen, wird daraus ein schwarzer Klumpen –
  gemessen stieg der Anteil tiefschwarzer Bildpunkte von 3,7 auf 7,9 Prozent.
  Deshalb `* (1.0 - edge * outline)` und ein `max(…, 0.0)`. Genau daran lag es,
  dass `schaerfe` im Comic-Stil auf null stand.
- **Schärfe wird gemessen, nicht beurteilt.** `tools/bild-messen.mjs` nennt den
  mittleren Betrag des Laplace-Operators: ein hochskaliertes Bild verrät sich
  dort sofort, weil ihm die Hochfrequenz fehlt. Verglichen wird nur, was gleich
  groß ist – zwei Bilder verschiedener Auflösung haben verschiedene
  Hochfrequenz, ohne dass eines schärfer wäre.
- Drei Stellen entscheiden über die Schärfe, und alle drei standen falsch:
  `QUALITY.pixelRatio` (auf dem Handy 1,4 bei dreifacher Bildpunktdichte – der
  Browser skalierte den Rest), `schaerfe` im Comic-Stil (stand auf 0, obwohl
  gerade der hochskaliert wird) und die **anisotrope Filterung** der
  Bausatz-Texturen (stand auf 1, dem Standardwert – `world.js` setzt 8 für
  seine Leinwandtexturen und `surface.js` 4 für die Fotos, aber jede Wand und
  jede Gasse aus `dorf.glb` bekam nie einen Wert). Ohne Anisotropie nimmt three
  für eine schräge Fläche die Mipmap-Stufe des stärker verkleinerten Randes –
  eine Straße bis zum Horizont ist nach wenigen Metern Brei.
- **Leistung wird gemessen, nicht geschätzt** – und zwar auf dem Gerät, auf dem
  gespielt wird: der Testbrowser rendert in Software mit rund 0,3 Bildern je
  Sekunde, und diese Zahl sagt nichts. Der Knopf 📊 im Menü fliegt dieselbe
  Strecke einmal je Stufe und schaltet dabei eine ab; der **Abstand** zwischen
  zwei Läufen ist die Antwort. Eine reine Bildratenanzeige verrät nicht, was
  teuer ist. Gemessen wird Median **und** 1-%-Tief: die schlechtesten Bilder
  sind das Ruckeln, und ein guter Median versteckt sie.
  Im Container messbar und deshalb dort zu prüfen: Zeichenaufrufe und Dreiecke
  je Bild (`renderer.info`, mit `autoReset = false`, sonst zählt nur der letzte
  Durchgang) und Strahlen je Simulationsschritt.
- Die Schattenkarte wird **einmal** je Bild gebaut. `Pipeline.render()` ruft
  `renderer.render()` zweimal (Normalen, Farbe), und three baut sie sonst bei
  jedem Aufruf neu – gemessen 604 von 1024 Zeichenaufrufen je Bild für ein
  Ergebnis, das sich dazwischen nicht ändert. Deshalb `shadowMap.autoUpdate =
  false` und je Bild einmal `needsUpdate = true`.
- Der Normalen-Durchgang zeichnet die ganze Szene **ein zweites Mal** und läuft
  nur, wenn Umriss oder Verdeckung ihn brauchen (`normalVoll`). Im realen Stil
  ist der Umriss aus; schaltet die Automatik die Verdeckung ab, fällt der
  Durchgang mit weg.
- `antialias` am Renderer ist wirkungslos – gezeichnet wird in Render-Targets,
  auf den Bildschirm kommt ein Vollbild-Rechteck ohne Innenkanten. Die Glättung,
  die wirkt, sitzt als `samples` am Farb-Target.
- Die Zielsuche der Bots ist die teuerste Stelle der KI: **ein Strahl je
  Gegner**. Sie läuft mit `KI.zielPruefen` (5 Hz) und je Bot versetzt – alle im
  selben Bild suchen zu lassen erzeugt genau die Ruckler, die man vermeiden
  will. Ungedrosselt gemessen: 11,3 Strahlen je Simulationsschritt, gedrosselt
  2,6, bei gleichem Verhalten (keine Klemmstellen, Punkte werden erobert).
- In `bots.js` wird in der Schleife **nicht** allokiert: die Zwischenspeicher am
  Kopf der Datei (`_dir`, `_mv`, …) reichen, weil die Bots nacheinander laufen.
  Ein Dutzend Vektoren je Bot und Bild sind bei zwölf Figuren über achttausend
  kurzlebige Objekte je Sekunde – und der Aufräumer holt sie sich genau dann,
  wenn es gerade eng ist.
- Nach Änderungen `npm run build` laufen lassen; muss ohne Fehler durchgehen.

## Roadmap
1. [x] Prototyp: Arena, 3 Klassen, Bots, Deathmatch gegen Bots, HUD
2. [x] Domination-Modus – 3 Kontrollpunkte, 3 gegen 3, Punkte je gehaltenem Punkt
3. [x] Cel-Shading + Outline-Pass
4. [x] Charakter-Animation prozedural (Laufen, Anschlag/Rückstoß, Umfallen) – Mixamo später
5. [x] Sounds – prozedural erzeugt, mit Richtungshören und Ton-Schalter (M)
6. [x] Touch-Controls (Mobile) – Bildschirm-Stick, Wischen zum Umsehen, anpassbare Schaltflächen, Zielhilfe
7. [x] Asset-Pipeline: Modelle in `public/assets/`, Loader in `assets.js` (Quaternius Ultimate Modular Men, CC0)
8. [x] Fotorealistischer Stil als Standard (HDRI-Licht, AgX, Fotooberflächen)
9. [x] Die Stadt am Hang: 240 x 240 m, Höhenfeld, drei Ebenen, Wegfindung
       über ein Gitter, zwei Modi mit eigener Größe
10. [ ] Multiplayer-Server (eigenes Repo)

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
