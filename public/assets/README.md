# Assets

## characters/toon_*.glb — Quaternius „Toon Shooter Game Kit" (CC0)

Quelle: https://quaternius.com/packs/toonshootergamekit.html, Lizenz CC0 1.0
(gemeinfrei, auch kommerziell, keine Namensnennung nötig). Aus dem glTF-Export
des Pakets nach GLB gepackt, Inhalt unverändert.

| Datei | Figur | Klasse |
|---|---|---|
| `toon_hazmat.glb`  | Character_Hazmat  | Rammbock |
| `toon_enemy.glb`   | Character_Enemy   | Flitzer |
| `toon_soldier.glb` | Character_Soldier | Adlerauge |

Jede Figur bringt mit: 43 Knochen, 14 Waffen-Meshes am rechten Zeigefinger-
Knochen (`Index1.R`), Clips `Idle`, `Walk`, `Run`, `Idle_Shoot`, `Walk_Shoot`,
`Run_Shoot`, `Death`, `HitReact`, `Jump*`, `Duck`, `Punch`, `Wave`, `Yes`, `No`.

Das Paket enthält außerdem Arena-Props (Container, Sandsäcke, Kisten, Fässer,
Zäune, Bäume) und einzelne Waffenmodelle – noch nicht eingebunden.

## Eigene Figuren einhängen

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
3. In `src/classes.js` bei der Klasse `model: '<name>'` setzen.

Modelle ohne Anschlag-Clips (z. B. Mixamo-Export mit nur Idle/Walk/Run)
bekommen den Anschlag prozedural: `aimTune` beschreibt, wohin Hände und
Ellbogen relativ zur Brust zeigen; die Knochenwinkel werden daraus berechnet.
