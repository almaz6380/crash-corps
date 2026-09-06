# Assets

## characters/soldier.glb — PLATZHALTER

Herkunft: three.js-Beispiele (`examples/models/gltf/Soldier.glb`), Figur "Vanguard"
aus der Mixamo-Bibliothek. Gerigt (49 Knochen, Mixamo-Namensschema), Clips:
`Idle`, `Walk`, `Run`, `TPose`.

Das ist ein **Platzhalter**, damit die Asset-Pipeline gegen ein echtes Modell
läuft. Er ist nicht die Marke von Crash Corps und soll ersetzt werden.

## Eigene Figuren einhängen

1. GLB nach `public/assets/characters/<name>.glb` legen.
2. In `src/assets.js` unter `CHARACTER_MODELS` eintragen (Datei, Skalierung,
   Knochen-Namensschema, Waffen-Offset an der rechten Hand).
3. In `src/classes.js` bei der Klasse `model: '<name>'` setzen.

Erwartet wird ein humanoides Rig mit Clips für Stehen, Gehen und Rennen.
Fehlen Clips, greift die prozedurale Ebene (Anschlag, Rückstoß, Umfallen)
trotzdem, sie läuft über Knochen-Overlays statt über Clips.
