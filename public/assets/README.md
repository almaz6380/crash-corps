# Assets

Alle Figuren stammen von Quaternius (quaternius.com), Lizenz **CC0 1.0**
(gemeinfrei, auch kommerziell, keine Namensnennung nötig). Die glTF-Exporte der
Pakete wurden nach GLB gepackt, Inhalt unverändert.

## characters/men_*.glb — „Ultimate Modular Men" (im Spiel aktiv)

Menschliche Proportionen, 62 Knochen, keine eigenen Waffen (die kommen aus
`gear.js` und hängen an `Wrist.R`). Clips: `Idle`, `Idle_Gun`,
`Idle_Gun_Pointing`, `Idle_Gun_Shoot`, `Gun_Shoot`, `Walk`, `Run`, `Run_Shoot`,
`Run_Left/Right/Back`, `Death`, `HitRecieve`, `Roll`, `Punch_*`, `Kick_*`, …

| Datei | Figur | Klasse |
|---|---|---|
| `men_spacesuit.glb` | Spacesuit | Rammbock |
| `men_punk.glb`      | Punk      | Flitzer |
| `men_swat.glb`      | Swat      | Adlerauge |

Weitere Figuren im selben Paket (gleicher Rig, gleiche Clips): Adventurer,
Beach, Casual_2, Casual_Hoodie, Farmer, King, Suit, Worker.
Quelle: https://quaternius.com/packs/ultimatemodularcharacters.html

## characters/toon_*.glb — „Toon Shooter Game Kit" (Alternative, nicht aktiv)

Comic-Proportionen mit großem Kopf. 43 Knochen, 14 Waffen-Meshes am Knochen
`Index1.R`, Clips `Idle`, `Walk`, `Run`, `Idle_Shoot`, `Walk_Shoot`, `Run_Shoot`,
`Death`, `HitReact`. Bleibt als zweiter Stil im Manifest; umschalten über
`model:` in `classes.js`. Das Paket enthält außerdem Arena-Props (Container,
Sandsäcke, Kisten, Fässer, Zäune, Bäume) – noch nicht eingebunden.
Quelle: https://quaternius.com/packs/toonshootergamekit.html

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
   - `grip`: Versatz, Drehung, Größe der prozeduralen Waffe am Handknochen.
3. In `src/classes.js` bei der Klasse `model: '<name>'` setzen.

Modelle ohne Anschlag-Clips (z. B. Mixamo-Export mit nur Idle/Walk/Run)
bekommen den Anschlag prozedural: `aimTune` beschreibt, wohin Hände und
Ellbogen relativ zur Brust zeigen; die Knochenwinkel werden daraus berechnet.
