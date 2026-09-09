import { CLASSES } from './classes.js';
import { TOUCH } from './device.js';
import { TEAMS, REGELN } from './domination.js';

const MODUS_KEY = 'crashcorps.modus';

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="loading" hidden></div>
      <div id="hochkant">Bitte das Gerät quer halten</div>
      <div id="menu">
        <h1>Crash Corps</h1>
        <p class="sub">Wähl Modus und Klasse. Dann rein.</p>
        <div id="modi">
          <button type="button" data-modus="deathmatch">Deathmatch<small>Jeder gegen jeden</small></button>
          <button type="button" data-modus="domination">Domination<small>3 Punkte, 3 gegen 3</small></button>
        </div>
        <div id="classes"></div>
        <div id="menuknoepfe">
          ${TOUCH ? '<button id="anpassen" type="button">Bedienung anpassen</button>' : ''}
          ${TOUCH ? '<button id="gyro" type="button" title="Gyroskop">🧭</button>' : ''}
          <button id="ton" type="button" title="Ton an/aus (M)"></button>
        </div>
        <p id="offline" hidden></p>
        <p class="help">${TOUCH
          ? 'Links ziehen zum Laufen · rechts wischen zum Umsehen · FEUER halten · ⤒ springen · R nachladen · Q Spezial'
          : 'WASD laufen · Shift sprinten · Leertaste springen · Klick schießen · R nachladen · Q Spezial · M Ton · Esc Menü'}</p>
      </div>
      <div id="play" hidden>
        <div id="cross"></div>
        <div id="flash"></div>
        <div id="feed"></div>
        <div id="score"></div>
        <div id="dom" hidden>
          <div class="teamstand" id="dom-0"></div>
          <div id="dom-punkte"></div>
          <div class="teamstand" id="dom-1"></div>
        </div>
        <div id="ende" hidden></div>
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
      el.innerHTML = `<b>${c.name}</b><span>${c.tagline}</span><small>${c.hp} HP · Tempo ${c.speed}</small>`;
      el.onclick = () => this.onPick?.(c.id);
      list.append(el);
    }
    root.querySelector('#pause').onclick = () => this.onPause?.();
    this._gyroAufbauen(root);
    // Zwei Knöpfe, ein Schalter: einer im Menü, einer während des Matches
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
    knopf.onclick = async () => {
      const an = await this.onGyro?.();
      this.gyroStand(an);
      if (an === false && this.gyroAbgelehnt) {
        knopf.textContent = '🧭 geht nicht';
        knopf.disabled = true;
      }
    };
    this.gyroKnopf = knopf;
  }

  /** Zustand des Gyro-Knopfs nachziehen. Stärke und Umkehr stehen unter "Bedienung anpassen". */
  gyroStand(an) {
    if (!this.gyroKnopf) return;
    this.gyroKnopf.classList.toggle('an', !!an);
    this.gyroKnopf.textContent = an ? '🧭 an' : '🧭 aus';
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
  showMenu(on) { this.root.querySelector('#menu').hidden = !on; this.root.querySelector('#play').hidden = on; }
  hint(on) { this.root.querySelector('#hint').hidden = !on; }
  kill(text) {
    const el = document.createElement('div'); el.textContent = text; this.feed.prepend(el);
    setTimeout(() => el.remove(), 4000);
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
