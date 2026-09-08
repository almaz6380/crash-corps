# Crash Corps

Class-based Cartoon-Arena-Shooter im Browser. Vite + Three.js, kein Framework.

## Starten

```
npm install
npm run dev
```

## Auf dem Handy spielen

Das Spiel erkennt Touch-Geräte selbst und blendet dann die Bildschirm-Bedienung
ein: links ziehen zum Laufen, rechts wischen zum Umsehen, dazu FEUER, Springen,
Nachladen und Spezial. Am Rechner lässt sich das mit `?touch=1` testen.

Die Schaltflächen lassen sich verschieben und in der Größe ändern: im Menü auf
**Bedienung anpassen**, dann Knopf ziehen oder antippen und den Regler nutzen.
Die Anordnung bleibt im Browser gespeichert.

**Zielhilfe:** Auf Touch-Geräten bremst das Wischen ab, sobald ein Gegner nah am
Fadenkreuz ist, und das Fadenkreuz wird sanft nachgeführt – aber nur, solange
man selbst wischt oder läuft. Wer stillhält, bekommt keine Korrektur.

**Ohne Veröffentlichung, über das eigene WLAN:**

```
npm run dev -- --host
```

Vite zeigt neben der lokalen auch eine Netzwerk-Adresse (`http://192.168.…:5173`).
Die im Handy-Browser öffnen; Handy und Rechner müssen im selben WLAN sein.

**Dauerhaft im Netz:** `.github/workflows/pages.yml` baut und veröffentlicht auf
GitHub Pages. Dafür einmalig im Repository unter *Settings → Pages* bei
*Build and deployment* die Source auf **GitHub Actions** stellen. Danach läuft
der Workflow bei jedem Push auf `main`.

## Adresszeilen-Schalter

| Parameter | Wirkung |
|---|---|
| `?stil=real` | Physikalische Materialien, Himmelslicht, Umgebungsverdeckung statt Cel-Shading |
| `?touch=1` | Touch-Bedienung erzwingen (zum Testen am Rechner) |
| `?leistung=niedrig` | Kleinere Auflösung und Schattenkarte, keine Umgebungsverdeckung |
| `?zielhilfe=an` / `=aus` | Zielhilfe erzwingen (Standard: an auf Touch, aus am Rechner) |

## Steuerung am Rechner

WASD laufen · Shift sprinten · Leertaste springen · Klick schießen ·
R nachladen · Q Spezial · Esc Menü

Details zum Aufbau: siehe `CLAUDE.md`.
