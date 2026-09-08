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

## Steuerung am Rechner

WASD laufen · Shift sprinten · Leertaste springen · Klick schießen ·
R nachladen · Q Spezial · Esc Menü

Details zum Aufbau: siehe `CLAUDE.md`.
