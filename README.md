# Crash Corps

Class-based Cartoon-Arena-Shooter im Browser, im Fantasy-Gewand. Vite + Three.js,
kein Framework.

Drei Klassen treten in derselben Arena gegeneinander an:

| Klasse | Rolle | Waffe | Spezial |
|---|---|---|---|
| **Grollzahn** | 160 HP, langsam | Spalterklinge (Streitaxt) | Sturmangriff |
| **Nachtschatten** | 90 HP, sehr schnell | Bolzenwerfer (Armbrust) | Schattenschritt |
| **Runenweber** | 110 HP, präzise | Runenstab | Zauberblick |

Die Figuren stammen aus dem KayKit Character Pack von Kay Lousberg (CC0); ihre
Waffen hängen als eigene Meshes am Handknochen. Wie man weitere Figuren einhängt,
steht in [public/assets/README.md](public/assets/README.md).

## Starten

```
npm install
npm run dev
```

## Als App installieren

Das Spiel ist eine Progressive Web App: Manifest, Icons und ein Service Worker,
der alle Modelle und Texturen vorhält. Nach dem ersten Laden meldet das Menü
**Offline spielbar** – danach läuft es ohne Netz.

Installieren:
- **Android/Chrome:** Menü → *App installieren* (oder *Zum Startbildschirm*)
- **iOS/Safari:** Teilen → *Zum Home-Bildschirm*

**Wichtig:** Service Worker brauchen HTTPS. Über `http://192.168.…` aus dem
lokalen Netz lässt sich das Spiel spielen, aber **nicht installieren** –
dafür muss es über HTTPS ausgeliefert werden (GitHub Pages, Netlify,
Cloudflare Pages). `localhost` gilt als sicher und funktioniert auch.

Der Build liegt danach vollständig in `dist/` und ist auf jeden statischen
Hoster kopierbar; alle Pfade sind relativ.

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

## Modi

**Deathmatch** – jeder gegen jeden, du allein gegen fünf Bots.

**Domination** – drei gegen drei um die Kontrollpunkte **A**, **B** und **C**. Sie liegen
auf den Plattformdächern, man muss also über eine Rampe hoch. Wer allein im Ring steht,
zieht ihn zu seiner Mannschaft; stehen beide Mannschaften drauf, bewegt sich nichts.
Ein gegnerischer Punkt muss erst neutralisiert und dann erobert werden – das dauert
doppelt so lange wie ein freier. Jeder gehaltene Punkt bringt zwei Zähler pro Sekunde,
bei 250 ist Schluss. Der Wimpel über jeder Figur zeigt die Mannschaft.

## Steuerung am Rechner

WASD laufen · Shift sprinten · Leertaste springen · Klick schießen ·
R nachladen · Q Spezial · M Ton an/aus · Esc Menü

## Gyroskop

Das Spiel ist immer quer. Ist die Drehsperre des Handys an und der Browser
bleibt hochkant, dreht sich das Bild von selbst – Handy einfach so drehen, dass
die Oberkante links liegt.

Über **🧭** im Menü lässt sich das Gyroskop zuschalten. Es zielt zusätzlich zum
Wischen: die grobe Drehung macht der Daumen, das Feinzielen die Hand.

Beim Einschalten kalibriert das Spiel in drei Schritten: das Handy nach links
schwenken (so, wie du dich im Spiel umsiehst – nicht wie ein Lenkrad), dann nach
oben kippen, dann prüfen: ein Punkt bewegt sich genau so, wie das Spiel den Blick
bewegen würde. Geht er nach rechts, wenn du nach rechts drehst, und nach oben,
wenn du nach oben kippst, tipp auf **Stimmt** – der Knopf wird erst frei, wenn
der Punkt beides gemacht hat; sonst **Nochmal**. Denk beim Schwenken an eine
Kamera: die Rückseite des Handys zeigt auf etwas links von dir, nicht wie ein
Lenkrad drehen. Unter dem Text stehen die rohen Sensorwerte; wenn etwas nicht
klappt, hilft ein Bildschirmfoto davon bei der Fehlersuche. So misst
das Spiel, welche Sensorachse sich wobei bewegt; was das Gerät über seine Achsen
behauptet, ist egal. Die Kalibrierung bleibt gespeichert – der Gyro-Knopf schaltet danach nur
noch an und aus. Läuft später etwas verkehrt, unter **Bedienung anpassen**
auf **Neu kalibrieren** tippen.
Dort stehen auch Stärke, Umkehrschalter und eine Live-Anzeige der gemessenen
Drehraten.

Unten im Menü steht „Stand TT.MM., HH:MM“ – der Bauzeitpunkt. Zeigt das Handy
nach einer Änderung noch den alten Stand, liefert der Service Worker die alte
Version: App schließen und neu öffnen.

Gemessen wird die Drehrate, nicht die Lage – es gibt also keinen festen
Bezugspunkt, der wegdriften kann. Auf iOS fragt der erste Tipp nach der
Erlaubnis für Bewegungsdaten.

## Ton

Alle Geräusche werden im Browser erzeugt (WebAudio), es gibt keine Audiodateien –
das Spiel wird dadurch keinen Kilobyte größer und klingt auch offline. Schüsse und
Schritte anderer Figuren sind ortbar: Lautstärke fällt mit der Entfernung, die Seite
ergibt sich aus der eigenen Blickrichtung, Entferntes klingt dumpfer.

Der Ton startet erst nach dem ersten Tippen oder Klicken – so schreiben es die
Browser vor. Umschalten mit **M** oder dem Lautsprecher-Knopf; die Einstellung wird
gemerkt.

## Ohne Server: eine einzige Datei

```
npm run build && node tools/einzeldatei.mjs
```

Packt Skript, Stile, Modelle und Texturen in eine HTML-Datei (rund 10 MB), die
ohne Server und ohne Nachladen läuft – zum Verschicken oder für einen USB-Stick.

Details zum Aufbau: siehe `CLAUDE.md`.
