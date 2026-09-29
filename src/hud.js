import { CLASSES } from './classes.js';
import { TOUCH } from './device.js';
import { REAL } from './style.js';
import { TEAMS, REGELN } from './domination.js';
import { Gyro } from './gyro.js';

const MODUS_KEY = 'crashcorps.modus';

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="loading" hidden></div>
      <div id="menu">
        <h1>Crash Corps</h1>
        <p class="sub">Wähl Modus und Klasse. Dann rein.</p>
        <button id="fortsetzen" type="button" hidden>Weiter spielen</button>
        <div id="modi">
          <button type="button" data-modus="deathmatch">Deathmatch<small>Sechs im Tal</small></button>
          <button type="button" data-modus="domination">Domination<small>5 Punkte, 6 gegen 6</small></button>
        </div>
        <div id="classes"></div>
        <div id="menuknoepfe">
          ${TOUCH ? '<button id="anpassen" type="button">Bedienung anpassen</button>' : ''}
          <button id="gyro" type="button" title="Gyroskop">🧭</button>
          <button id="gyro-um-x" type="button" title="Links/rechts umkehren" hidden>↔</button>
          <button id="gyro-um-y" type="button" title="Oben/unten umkehren" hidden>↕</button>
          <button id="mess" type="button" title="Leistungstest: misst auf diesem Gerät, was welche Stufe kostet">📊</button>
          ${TOUCH ? '<button id="zielhilfe" type="button" title="Zielhilfe: bremst das Wischen nah am Gegner"></button>' : ''}
          <button id="bildpunkte" type="button" title="Auflösung: „Scharf&#34; zeichnet so fein wie der Bildschirm ist"></button>
          <button id="grafik" type="button" title="Grafikstil umschalten"></button>
          <button id="ton" type="button" title="Ton an/aus (M)"></button>
        </div>
        ${TOUCH ? '' : `<div id="gyroeinst" hidden>
          <b>Gyroskop</b>
          <label>Stärke <input id="gyro-staerke" type="range" min="0.2" max="3" step="0.1"></label>
          <label><input id="gyro-x" type="checkbox"> X umkehren</label>
          <label><input id="gyro-y" type="checkbox"> Y umkehren</label>
          <button id="gyro-kalib" type="button">Neu kalibrieren</button>
        </div>`}
        <p id="hinweis" hidden></p>
        <p id="spielzahlen" hidden></p>
        <p id="offline" hidden></p>
        <p id="stand">Stand ${typeof __BUILD__ !== 'undefined' ? __BUILD__ : '?'}</p>
        <p class="help">${TOUCH
          ? 'Links ziehen zum Laufen · rechts wischen zum Umsehen · FEUER halten · ⤒ springen · R nachladen · Q Spezial · ☰ Pause'
          : 'WASD laufen · Shift sprinten · Leertaste springen · Klick schießen · R nachladen · Q Spezial · V Ansicht · M Ton · Esc Menü'}</p>
      </div>
      <div id="play" hidden>
        <div id="cross"></div>
        <div id="marker" hidden><i></i><i></i><i></i><i></i></div>
        <div id="woher" hidden><i></i></div>
        <div id="flash"></div>
        <div id="feed"></div>
        <div id="score"></div>
        <div id="dom" hidden>
          <div class="teamstand" id="dom-0"></div>
          <div id="dom-punkte"></div>
          <div class="teamstand" id="dom-1"></div>
        </div>
        <div id="ende" hidden></div>
      </div>
      <div id="messflug" hidden>
        <div>
          <small id="mess-schritt"></small>
          <h2 id="mess-titel">Leistungstest</h2>
          <p id="mess-text"></p>
          <pre id="mess-tabelle" hidden></pre>
          <div class="reihe">
            <button id="mess-abbruch" type="button">Abbrechen</button>
            <button id="mess-kopieren" type="button" hidden>Zahlen kopieren</button>
          </div>
        </div>
      </div>
      <div id="kalib" hidden>
        <div>
          <small id="kalib-schritt"></small>
          <h2 id="kalib-titel"></h2>
          <p id="kalib-text"></p>
          <p id="kalib-fehler" hidden></p>
          <div id="kalib-feld" hidden><div id="kalib-punkt"></div></div>
          <p id="kalib-mess" title="Was der Sensor gerade meldet"></p>
          <div class="reihe">
            <button id="kalib-abbruch" type="button">Abbrechen</button>
            <button id="kalib-weiter" type="button">Weiter</button>
          </div>
        </div>
        <div id="bottom">
          <div id="hp"><div id="hpbar"></div><span id="hptxt"></span></div>
          <div id="ammo"></div>
          <div id="special"></div>
        </div>
        <div id="dead" hidden></div>
        <div id="hint" hidden>Klick ins Bild, um die Maus zu fangen</div>
        <button id="ton2" type="button" title="Ton an/aus (M)"></button>
        <button id="pause" type="button" title="Menü">II</button>
      </div>`;
    // Modus merken, damit die Wahl den Neustart überlebt
    this.modus = 'domination';
    try { this.modus = localStorage.getItem(MODUS_KEY) || 'domination'; } catch { /* privater Modus */ }
    this.modusKnoepfe = [...root.querySelectorAll('#modi button')];
    for (const b of this.modusKnoepfe) {
      b.onclick = () => { this.setModus(b.dataset.modus); this.onModus?.(this.modus); };
    }
    this.setModus(this.modus);

    const list = root.querySelector('#classes');
    for (const c of Object.values(CLASSES)) {
      const el = document.createElement('button');
      el.className = 'cls'; el.style.setProperty('--c', '#' + c.color.toString(16).padStart(6, '0'));
      el.dataset.klasse = c.id;
      el.innerHTML = `<figure class="figur"></figure>`
        + `<b>${c.name}</b><span>${c.tagline}</span><small>${c.hp} HP · Tempo ${c.speed}</small>`;
      el.onclick = () => this.onPick?.(c.id);
      list.append(el);
    }
    root.querySelector('#pause').onclick = () => this.onPause?.();
    this._gyroAufbauen(root);
    // Zwei Knöpfe, ein Schalter: einer im Menü, einer während des Matches
    const grafik = root.querySelector('#grafik');
    if (grafik) {
      grafik.textContent = REAL ? '📷 Fotoreal' : '✎ Comic';
      grafik.onclick = () => this.onGrafik?.();
    }
    const zh = root.querySelector('#zielhilfe');
    if (zh) zh.onclick = () => this.zielhilfeStand(this.onZielhilfe?.());
    const bp = root.querySelector('#bildpunkte');
    if (bp) bp.onclick = () => this.bildpunkteStand(this.onBildpunkte?.());
    this.tonKnoepfe = [root.querySelector('#ton'), root.querySelector('#ton2')];
    for (const b of this.tonKnoepfe) b.onclick = () => this.tonStand(this.onSound?.());
    const anp = root.querySelector('#anpassen');
    if (anp) anp.onclick = () => this.onCustomize?.();
    this.feed = root.querySelector('#feed');
    this.feedItems = [];
  }
  /**
   * Gyro-Bedienung. Der Knopf fordert beim ersten Antippen die Erlaubnis an –
   * iOS gibt sie nur aus einer Nutzergeste heraus.
   */
  _gyroAufbauen(root) {
    const knopf = root.querySelector('#gyro');
    if (!knopf) return;
    this.gyroKnopf = knopf;
    // Umkehr-Pfeile direkt neben dem Kompass. Zielt der Gyro verkehrt herum,
    // ist das ein Tipp – vorher musste man dafür das Spiel starten und die
    // Bedienung anpassen, und wer das nicht weiß, hält den Gyro für kaputt.
    this.umKnoepfe = { x: root.querySelector('#gyro-um-x'), y: root.querySelector('#gyro-um-y') };
    for (const achse of ['x', 'y']) {
      this.umKnoepfe[achse].onclick = () => {
        const an = !(achse === 'x' ? this.gyroEinst?.invertX : this.gyroEinst?.invertY);
        if (this.gyroEinst) this.gyroEinst[achse === 'x' ? 'invertX' : 'invertY'] = an;
        this.onGyroUmkehr?.(achse, an);
        this.gyroStand(true, this.gyroEinst);
      };
    }
    this.hilfeZeile = root.querySelector('#menu .help');
    this.hilfeText = this.hilfeZeile.textContent;
    // Ohne Sensor gar nicht erst anbieten – aber sagen, warum. Ein Knopf, der
    // beim Antippen nichts tut, ist schlimmer als einer, der den Grund nennt.
    if (!Gyro.moeglich()) {
      knopf.textContent = '🧭 kein Sensor';
      knopf.disabled = true;
      knopf.title = 'Dieses Gerät meldet kein Gyroskop (am Rechner normal)';
      return;
    }
    // Einstellungen im Menü gibt es nur ohne Touch – sonst stehen sie im
    // Anpassen-Bildschirm, weil das Menü im Querformat randvoll ist.
    const feld = root.querySelector('#gyroeinst');
    if (feld) {
      this.gyroFeld = feld;
      const st = feld.querySelector('#gyro-staerke');
      st.oninput = (e) => this.onGyroStaerke?.(+e.target.value);
      feld.querySelector('#gyro-x').onchange = (e) => this.onGyroUmkehr?.('x', e.target.checked);
      feld.querySelector('#gyro-y').onchange = (e) => this.onGyroUmkehr?.('y', e.target.checked);
      feld.querySelector('#gyro-kalib').onclick = () => this.onGyroKalib?.();
    }
    // Kalibrier-Overlay: Weiter/Abbrechen lösen ein wartendes Versprechen auf
    this.kalibEl = root.querySelector('#kalib');
    root.querySelector('#kalib-weiter').onclick = () => this._kalibAntwort?.(true);
    root.querySelector('#kalib-abbruch').onclick = () => this._kalibAntwort?.(false);
    knopf.onclick = async () => {
      const an = await this.onGyro?.();
      this.gyroStand(an);
      if (an === false && this.gyroAbgelehnt) {
        knopf.textContent = '🧭 geht nicht';
        knopf.disabled = true;
      }
    };
    this.gyroKnopf = knopf;
    // Pause: aus der Runde ins Menü und zurück. Ohne den Rückweg wäre der
    // Menüknopf im Spiel ein Ausknopf – wer nur den Ton umstellen will,
    // verlöre die Runde.
    this.fortsetzenKnopf = root.querySelector('#fortsetzen');
    this.fortsetzenKnopf.onclick = () => this.onFortsetzen?.();
    // Leistungstest
    this.messEl = root.querySelector('#messflug');
    root.querySelector('#mess').onclick = () => this.onMess?.();
    root.querySelector('#mess-abbruch').onclick = () => this.onMessAus?.();
    root.querySelector('#mess-kopieren').onclick = async () => {
      // Zwischenablage kann abgelehnt werden (kein HTTPS, kein Fokus). Dann
      // bleibt der Text auf dem Bildschirm stehen – abschreiben geht immer.
      try {
        await navigator.clipboard.writeText(this.messText || '');
        root.querySelector('#mess-kopieren').textContent = 'Kopiert';
      } catch { root.querySelector('#mess-kopieren').textContent = 'Geht nicht – bitte abfotografieren'; }
    };
    this.hilfeZeile = root.querySelector('#menu .help');
    this.hilfeText = this.hilfeZeile.textContent;
  }

  /**
   * Einen Kalibrierschritt zeigen und auf Weiter (true) oder Abbrechen (false)
   * warten. `fehler` erscheint rot über den Knöpfen, etwa nach zu wenig Bewegung.
   */
  kalibSchritt(nummer, titel, text, fehler = null, { pruefen = false } = {}) {
    const q = (s) => this.kalibEl.querySelector(s);
    q('#kalib-schritt').textContent = `Gyroskop einrichten · Schritt ${nummer} von 2`;
    q('#kalib-titel').textContent = titel;
    q('#kalib-text').textContent = text;
    q('#kalib-fehler').hidden = !fehler;
    q('#kalib-fehler').textContent = fehler || '';
    q('#kalib-feld').hidden = !pruefen;
    q('#kalib-weiter').textContent = pruefen ? 'Stimmt' : 'Weiter';
    q('#kalib-abbruch').textContent = pruefen ? 'Nochmal' : 'Abbrechen';
    // „Stimmt“ gibt es erst, wenn der Punkt wirklich rechts und oben war –
    // sonst bestätigt man aus Ungeduld eine Kalibrierung, die im Spiel nichts tut.
    q('#kalib-weiter').disabled = pruefen;
    this.kalibEl.hidden = false;
    return new Promise((res) => { this._kalibAntwort = res; });
  }
  kalibAus() { this.kalibEl.hidden = true; this._kalibAntwort = null; this.kalibPunkt(0, 0); this.kalibMess(''); }

  /** „Stimmt“ freigeben, sobald die Prüfung beide Richtungen gesehen hat. */
  kalibStimmtFrei(frei) { this.kalibEl.querySelector('#kalib-weiter').disabled = !frei; }

  /** Rohe Sensorwerte anzeigen – die einzige Fernanzeige, die es gibt. */
  kalibMess(text) { this.kalibEl.querySelector('#kalib-mess').textContent = text; }

  /**
   * Prüfpunkt im dritten Schritt setzen. `x`/`y` in -1..1: x positiv = rechts,
   * y positiv = oben – genau so, wie das Spiel den Blick bewegen würde.
   */
  kalibPunkt(x, y) {
    const el = this.kalibEl.querySelector('#kalib-punkt');
    el.style.transform = `translate(${x * 42}%, ${-y * 42}%)`;
    // Rot, solange der Punkt in der Mitte klebt – sichtbar, sobald er sich bewegt
    el.classList.toggle('bewegt', Math.abs(x) > 0.05 || Math.abs(y) > 0.05);
  }

  /**
   * Zustand des Gyro-Knopfs nachziehen. Stärke und Umkehr stehen unter
   * "Bedienung anpassen" – im Menü ist im Querformat kein Platz dafür. Damit das
   * niemand suchen muss, sagt es die Hilfezeile, solange der Gyro an ist.
   */
  gyroStand(an, einst) {
    if (!this.gyroKnopf || this.gyroKnopf.disabled) return;
    if (einst) this.gyroEinst = einst;
    this.gyroKnopf.classList.toggle('an', !!an);
    this.gyroKnopf.textContent = an ? '🧭 Gyro an' : '🧭 Gyro aus';
    for (const achse of ['x', 'y']) {
      const k = this.umKnoepfe?.[achse];
      if (!k) continue;
      k.hidden = !an;
      k.classList.toggle('an', !!(achse === 'x' ? this.gyroEinst?.invertX : this.gyroEinst?.invertY));
    }
    if (this.gyroFeld) {
      this.gyroFeld.hidden = !an;
      if (einst) {
        this.gyroFeld.querySelector('#gyro-staerke').value = einst.staerke;
        this.gyroFeld.querySelector('#gyro-x').checked = einst.invertX;
        this.gyroFeld.querySelector('#gyro-y').checked = einst.invertY;
      }
    } else {
      // Bei Touch stehen die Regler woanders – dorthin verweisen
      this.hilfeZeile.innerHTML = an
        ? 'Gyroskop an · verkehrt herum? <b>↔ / ↕ antippen</b> · Stärke und neu kalibrieren: „Bedienung anpassen“'
        : this.hilfeText;
    }
  }

  setModus(m) {
    this.modus = m;
    try { localStorage.setItem(MODUS_KEY, m); } catch { /* privater Modus */ }
    for (const b of this.modusKnoepfe) b.classList.toggle('an', b.dataset.modus === m);
  }

  /** Anzeige für Domination aufbauen (einmal je Match). */
  domAufbauen(dom) {
    this.dom = dom;
    const wrap = this.root.querySelector('#dom');
    wrap.hidden = !dom;
    this.root.querySelector('#score').hidden = !!dom;
    if (!dom) return;
    const p = this.root.querySelector('#dom-punkte');
    p.innerHTML = dom.punkte.map(k => `
      <div class="kp" data-id="${k.id}">
        <b>${k.id}</b>
        <div class="kpbar"><i></i></div>
      </div>`).join('');
    this.kpEls = dom.punkte.map(k => {
      const el = p.querySelector(`.kp[data-id="${k.id}"]`);
      return { el, balken: el.querySelector('i') };
    });
    for (const t of TEAMS) {
      const el = this.root.querySelector('#dom-' + t.id);
      el.style.setProperty('--c', t.css);
    }
  }

  /** Punktestand und Kontrollpunkte nachziehen. */
  domUpdate(dom) {
    for (let i = 0; i < dom.punkte.length; i++) {
      const k = dom.punkte[i], { el, balken } = this.kpEls[i];
      const c = k.besitzer == null ? '#8a7f70' : TEAMS[k.besitzer].css;
      el.style.setProperty('--c', c);
      el.classList.toggle('umkaempft', k.umkaempft);
      // Balken zeigt, wie weit die laufende Eroberung ist
      balken.style.width = Math.round(k.fortschritt * 100) + '%';
      balken.style.background = k.wert < 0 ? TEAMS[0].css : k.wert > 0 ? TEAMS[1].css : '#8a7f70';
    }
    for (const t of TEAMS) {
      const el = this.root.querySelector('#dom-' + t.id);
      const wert = Math.floor(dom.stand[t.id]);
      el.innerHTML = `<span>${t.name}</span><b>${wert}</b>`;
      el.style.setProperty('--f', (wert / REGELN.ziel * 100) + '%');
    }
  }

  /** Endbildschirm. `null` blendet ihn aus. */
  ende(text, gewonnen) {
    const el = this.root.querySelector('#ende');
    el.hidden = text == null;
    if (text == null) return;
    el.innerHTML = `<div class="${gewonnen ? 'sieg' : 'niederlage'}">${text}<button id="weiter" type="button">Zurück ins Menü</button></div>`;
    el.querySelector('#weiter').onclick = () => this.onWeiter?.();
  }

  /** Beschriftung der Ton-Knöpfe nachziehen. */
  tonStand(an) {
    for (const b of this.tonKnoepfe) {
      b.textContent = an ? '🔊' : '🔇';
      b.classList.toggle('aus', !an);
    }
  }

  /** Fortschritt der Offline-Bereitschaft (0..1) im Menü. */
  offline(anteil) {
    const el = this.root.querySelector('#offline');
    el.hidden = false;
    const fertig = anteil >= 0.999;
    el.textContent = fertig ? 'Offline spielbar' : `Wird für offline vorbereitet … ${Math.round(anteil * 100)}%`;
    el.classList.toggle('fertig', fertig);
  }

  /** Ladeanzeige: Text zeigen, null blendet sie aus. */
  loading(text) {
    const el = this.root.querySelector('#loading');
    el.hidden = text == null;
    if (text != null) el.textContent = text;
  }
  /**
   * Bilder der Figuren in die Klassenkarten hängen. Kommen erst, wenn die
   * Modelle geladen sind – bis dahin bleibt der Platz leer statt zu springen.
   * @param {Record<string,string>} bilder Klassen-Id → Data-URL
   */
  klassenBilder(bilder) {
    for (const el of this.root.querySelectorAll('#classes .cls')) {
      const url = bilder[el.dataset.klasse];
      if (!url) continue;
      const f = el.querySelector('.figur');
      f.style.backgroundImage = `url(${url})`;
      f.classList.add('da');
    }
  }

  /** Einzeiler im Menü, etwa wenn die Grafik selbsttätig zurückgeschaltet hat. */
  hinweis(text) {
    const el = this.root.querySelector('#hinweis');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  showMenu(on) { this.root.querySelector('#menu').hidden = !on; this.root.querySelector('#play').hidden = on; }

  /** Läuft im Hintergrund eine angehaltene Runde? Dann gibt es den Rückweg. */
  pause(on) { if (this.fortsetzenKnopf) this.fortsetzenKnopf.hidden = !on; }

  /** Beschriftung des Zielhilfe-Knopfs. */
  zielhilfeStand(an) {
    const el = this.root.querySelector('#zielhilfe');
    if (el) el.textContent = an ? '🎯 Zielhilfe an' : '🎯 Zielhilfe aus';
  }

  /**
   * Beschriftung des Auflösungs-Knopfs. Die Zahl dahinter ist die **echte**,
   * schon mit der Bildschirmdichte gedeckelte – auf einem Rechner mit Dichte 1
   * stehen alle drei Stufen sonst da, als täten sie etwas.
   */
  bildpunkteStand(stand) {
    const el = this.root.querySelector('#bildpunkte');
    if (!el || !stand) return;
    const name = { sparsam: 'Sparsam', normal: 'Normal', scharf: 'Scharf' }[stand.stufe] || stand.stufe;
    const zahl = stand.wert.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
    el.textContent = `▦ ${name} ×${zahl}`;
  }

  /**
   * Wie die letzte Runde wirklich lief. Steht im Menü, sobald jemand pausiert –
   * der Testflug misst einen Kameraflug, diese Zeile misst das Spielen.
   */
  spielzahlen(text) {
    const el = this.root.querySelector('#spielzahlen');
    if (!el) return;
    el.textContent = text || '';
    el.hidden = !text;
  }

  /**
   * Fortschritt des Testflugs. Während der Messung steht nur eine Zeile da –
   * eine große Anzeige würde selbst Bildzeit kosten und die Messung verfälschen.
   */
  messLauf(schritt, text, anteil) {
    const q = (x) => this.messEl.querySelector(x);
    q('#mess-schritt').textContent = schritt;
    q('#mess-titel').textContent = 'Leistungstest läuft';
    q('#mess-text').textContent = `${text}  ·  ${Math.round(anteil * 100)} %`;
    q('#mess-tabelle').hidden = true;
    q('#mess-kopieren').hidden = true;
    q('#mess-abbruch').textContent = 'Abbrechen';
    this.messEl.hidden = false;
    this.messEl.classList.add('schlank');
  }

  /** Das Ergebnis: Tabelle zum Lesen, derselbe Text zum Kopieren. */
  messErgebnis(text) {
    const q = (x) => this.messEl.querySelector(x);
    this.messText = text;
    q('#mess-schritt').textContent = 'fertig';
    q('#mess-titel').textContent = 'Leistungstest';
    q('#mess-text').textContent = 'Der Abstand in Klammern sagt, was die Stufe bringt.';
    q('#mess-tabelle').textContent = text;
    q('#mess-tabelle').hidden = false;
    q('#mess-kopieren').hidden = false;
    q('#mess-kopieren').textContent = 'Zahlen kopieren';
    q('#mess-abbruch').textContent = 'Fertig';
    this.messEl.hidden = false;
    this.messEl.classList.remove('schlank');
  }

  messAus() { this.messEl.hidden = true; }
  hint(on) { this.root.querySelector('#hint').hidden = !on; }
  kill(text) {
    const el = document.createElement('div'); el.textContent = text; this.feed.prepend(el);
    setTimeout(() => el.remove(), 4000);
  }
  /**
   * Hitmarker am Fadenkreuz. Vier kurze Striche, die nach außen zeigen: weiß
   * für den Körper, gelb und größer für den Kopf, rot für den Abschuss. Ohne
   * diese Rückmeldung merkt man im Getümmel nicht, ob man überhaupt trifft.
   */
  trefferZeigen(p) {
    const el = this.root.querySelector('#marker');
    const t = p.trefferZeit || 0;
    el.hidden = t <= 0;
    if (t <= 0) return;
    el.dataset.art = p.trefferArt || 'körper';
    el.style.opacity = Math.min(1, t * 8);   // volle Deckkraft, nur das letzte Achtel blendet aus
  }

  /**
   * Keil in Richtung des Schützen. Gerechnet wird je Bild aus dessen Position
   * und dem eigenen Blickwinkel – ein einmal gemerkter Winkel zeigte nach der
   * ersten Drehung ins Leere.
   */
  schadenZeigen(p) {
    const el = this.root.querySelector('#woher');
    const t = p.schadenZeit || 0;
    el.hidden = t <= 0 || !p.schadenVon;
    if (el.hidden) return;
    const dx = p.schadenVon.x - p.pos.x, dz = p.schadenVon.z - p.pos.z;
    // Bildschirmwinkel: 0 = vorn. Der Blick zeigt bei yaw = 0 nach −z.
    const winkel = Math.atan2(dx, -dz) + p.yaw;
    el.style.transform = `translate(-50%,-50%) rotate(${winkel}rad)`;
    el.style.opacity = Math.min(1, t * 2);
  }

  update(p, bots, time) {
    const q = s => this.root.querySelector(s);
    q('#hpbar').style.width = (p.hp / p.cls.hp * 100) + '%';
    q('#hptxt').textContent = Math.ceil(p.hp);
    q('#ammo').textContent = p.weapon.reloading > 0 ? 'lädt…' : `${p.weapon.ammo} / ${p.weapon.def.mag}`;
    const s = p.special;
    q('#special').textContent = s.cool > 0 ? `Q in ${s.cool.toFixed(1)}s` : 'Q bereit';
    q('#special').classList.toggle('ready', s.cool === 0);
    q('#flash').style.opacity = p.flash || 0;
    this.trefferZeigen(p);
    this.schadenZeigen(p);
    const m = Math.floor(time / 60), sec = Math.floor(time % 60).toString().padStart(2, '0');
    if (this.dom) this.domUpdate(this.dom);
    else {
      const best = bots.reduce((a, b) => Math.max(a, b.kills), 0);
      q('#score').innerHTML = `<b>${p.kills}</b> Kills · Bester Bot ${best} · ${m}:${sec}`;
    }
    const d = q('#dead'); d.hidden = !p.dead;
    if (p.dead) d.textContent = `Erledigt. Zurück in ${Math.ceil(p.respawnIn)}…`;
  }
}
