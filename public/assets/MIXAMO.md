# Figuren über Mixamo einbauen

Mixamo (mixamo.com, Adobe) ist keine Modellquelle, sondern eine
**Bewegungsbibliothek**: ein paar hundert aufgenommene Animationen, die auf
jedes humanoide Skelett passen, und ein Auto-Rigger, der einem nackten Modell in
T-Pose ein Skelett verpasst. Die mitgelieferten Figuren sind Beiwerk und
stammen aus der Fuse-Zeit – wer bessere Grafik will, bringt sein eigenes Modell
mit und holt bei Mixamo nur die Bewegungen.

**Was ich nicht kann:** die Dateien holen. Mixamo verlangt eine Adobe-Anmeldung,
und die habe nur ich nicht. Alles danach macht `tools/mixamo-figur.mjs`.

**Lizenz, bevor etwas hier landet:** Mixamo-Inhalte sind *nicht* CC0. Adobe
erlaubt die Nutzung in eigenen Projekten, aber keine Weitergabe der Dateien als
Asset. Dieses Repository ist öffentlich, die GLB liegt darin zum Herunterladen –
das ist eine Grauzone. Für die **Bewegungen** ist das unkritisch (sie stecken
als Kurven in der Figur), für eine **mitgelieferte Mixamo-Figur** weniger. Wer
auf Nummer sicher gehen will, riggt ein eigenes oder ein CC0-Modell (Weg B).

---

## Weg A – schnell: fertige Mixamo-Figur

1. **mixamo.com** öffnen, anmelden (kostenlos), Reiter **Characters**, eine
   Figur auswählen.
2. Reiter **Animations**. Für jede Bewegung: suchen, anklicken, rechts die
   Regler stehen lassen, **DOWNLOAD**.

   | Datei nennen nach | Mixamo-Suche | wofür |
   |---|---|---|
   | Idle | `Idle`, `Breathing Idle` | Stehen |
   | Walk | `Walking` | Gehen |
   | Run | **`Fast Run`** oder `Sprinting` | Rennen |
   | Death | `Standing React Death` | Umfallen |
   | Roll | `Standing Dodge Forward` | Ausweichrolle |
   | Aim | `Rifle Aiming Idle` (oder Schwert-Anschlag) | Anschlag |
   | Shoot | `Firing Rifle`, `Sword And Shield Slash` | Schuss/Hieb |
   | Hit | `Hit Reaction` | Treffer |

   **Beim Rennen nicht den normalen `Running`-Clip nehmen.** Die Klassen im
   Spiel laufen 5–8 m/s; ein gewöhnlicher Mixamo-Lauf trägt rund 1,5 m/s, und
   dann rudern die Beine der Bewegung hinterher. `tools/gangtempo.mjs` sagt
   hinterher, wie weit es auseinanderliegt.

3. **Download-Einstellungen**, und die sind der Teil, an dem es scheitert:

   | Feld | Wert |
   |---|---|
   | Format | **FBX Binary (.fbx)** |
   | Skin | **With Skin** bei *einer* Bewegung, **Without Skin** bei allen anderen |
   | Frames per Second | 30 |
   | Keyframe Reduction | none |
   | In Place | **an** bei Walk und Run |

   „With Skin" bringt den Körper mit; bei jeder weiteren Datei wäre er nur ein
   zweiter Körper im selben Bild. Welche Datei den Körper hat, findet das
   Werkzeug selbst heraus – es müssen nur nicht alle sein.

   „In Place" hält die Figur an Ort und Stelle. Bewegt wird sie im Spiel vom
   Code; ein Clip mit Wurzelbewegung ließe sie zusätzlich davonlaufen.

4. Alle Dateien in **einen Ordner**, benannt wie in der Tabelle (`Walk.fbx`,
   `Fast Run.fbx` … – erkannt wird auch der Mixamo-Originalname).

5. Einmal laufen lassen:

   ```
   node tools/mixamo-figur.mjs ~/Downloads/ritter --id=mix_ritter --waffe=axt --hoehe=1.95
   ```

   Das wandelt jede FBX, hängt alle Clips in die Datei mit dem Körper, streicht
   `mixamorig:` von den Knochennamen, verkleinert die Texturen, **misst**
   Blickrichtung und Gangtempo und druckt den fertigen Eintrag für
   `CHARACTER_MODELS` in `src/assets.js`.

6. Eintrag hineinkopieren, in `src/classes.js` bei einer Klasse
   `model: 'mix_ritter'` setzen, `npm run build`.

7. Übrig bleiben zwei Zahlenpaare, die niemand ausrechnen kann: **`grip`** und
   **`viewmodel`** – wie die Waffe in der Hand liegt und wie sie im Ego-Bild
   steht. Die stellt man im Spiel ein, nicht am Schreibtisch.

---

## Weg B – besser: eigenes Modell, Bewegungen von Mixamo

Das ist der Weg zu Figuren, die nicht nach Baukasten aussehen. Mixamo riggt
jedes humanoide Modell automatisch, und danach steht die ganze Bibliothek offen.

1. Modell besorgen – gekauft, selbst gebaut oder CC0. Bedingungen des
   Auto-Riggers: **eine** zusammenhängende Figur, **T-Pose oder A-Pose**, Arme
   und Beine nicht am Körper klebend, keine Waffe in der Hand, Maßstab in
   Metern.
2. Liegt es als GLB vor: `node tools/glb-nach-obj.mjs figur.glb` – das ergibt
   ein ZIP aus OBJ, MTL und Textur, und genau das nimmt Mixamo an.
3. **mixamo.com → UPLOAD CHARACTER**, ZIP hineinziehen. Der Rigger fragt nach
   Kinn, Handgelenken, Ellbogen, Knien und Leiste; **Skeleton LOD: Standard
   Skeleton (65)** wählen – mit weniger Fingern passt es nicht zum Rest.
4. Weiter bei **Weg A, Schritt 2**: Die Figur ist jetzt der ausgewählte
   Charakter, alle Animationen laufen auf ihr.

---

## Wenn etwas nicht stimmt

| Was man sieht | Woran es liegt |
|---|---|
| Figur rennt rückwärts | `yaw` falsch. Das Werkzeug misst die Blickrichtung an den Zehen; ohne Zehenknochen steht dort 0 – dann `yaw: Math.PI`. |
| Füße rutschen über den Boden | `walkSpeed`/`runSpeed` passen nicht zum Clip. `node tools/gangtempo.mjs <datei.glb> --hoehe=1.95` zeigt die gemessenen Werte. |
| Beine bleiben beim Zielen stehen | Ein `upperBones`-Präfix trifft einen Beinknochen. `tools/mixamo-pruefen.mjs` prüft genau das. |
| Waffe steckt im Bauch | `grip` – von Hand. |
| Figur ist riesig oder winzig | Das Spiel skaliert über die Gesamthöhe; steckt ein Helm oder ein Stab in der Bounding-Box, gleicht `scaleBias` aus. |
| Ein Clip fehlt, keine Meldung | Der Clipname im Manifest passt nicht. `node tools/glb-info.mjs <datei.glb>` zeigt, was wirklich drin ist. |
| Datei über 3 MB | `node tools/glb-schlanken.mjs --textur=512 --dreiecke=8000 quelle.glb ziel.glb Idle Walk Run …` |

## Werkzeuge

| Werkzeug | wofür |
|---|---|
| `tools/mixamo-figur.mjs` | Ordner voll Downloads → Spielfigur samt Manifest-Eintrag |
| `tools/gangtempo.mjs` | Für welches Tempo ist ein Clip gebaut, und wohin schaut die Figur |
| `tools/mixamo-pruefen.mjs` | Prüft die Namensregeln gegen das echte Mixamo-Skelett |
| `tools/glb-info.mjs` | Was steckt in einer GLB: Knochen, Clips, Materialien, Maße |
| `tools/glb-nach-obj.mjs` | GLB → OBJ+MTL+Textur als ZIP, für den Auto-Rigger |
| `tools/fbx-nach-glb.mjs` | Einzelne FBX-Dateien von Hand zusammenführen |
| `tools/glb-schlanken.mjs` | Clips wegwerfen, Texturen und Dreiecke kürzen |
