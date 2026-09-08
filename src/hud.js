import { CLASSES } from './classes.js';
import { TOUCH } from './device.js';

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="loading" hidden></div>
      <div id="hochkant">Bitte das Gerät quer halten</div>
      <div id="menu">
        <h1>Crash Corps</h1>
        <p class="sub">Wähl deine Klasse. Dann rein.</p>
        <div id="classes"></div>
        ${TOUCH ? '<button id="anpassen" type="button">Bedienung anpassen</button>' : ''}
        <p class="help">${TOUCH
          ? 'Links ziehen zum Laufen · rechts wischen zum Umsehen · FEUER halten · ⤒ springen · R nachladen · Q Spezial'
          : 'WASD laufen · Shift sprinten · Leertaste springen · Klick schießen · R nachladen · Q Spezial · Esc Menü'}</p>
      </div>
      <div id="play" hidden>
        <div id="cross"></div>
        <div id="flash"></div>
        <div id="feed"></div>
        <div id="score"></div>
        <div id="bottom">
          <div id="hp"><div id="hpbar"></div><span id="hptxt"></span></div>
          <div id="ammo"></div>
          <div id="special"></div>
        </div>
        <div id="dead" hidden></div>
        <div id="hint" hidden>Klick ins Bild, um die Maus zu fangen</div>
        <button id="pause" type="button" title="Menü">II</button>
      </div>`;
    const list = root.querySelector('#classes');
    for (const c of Object.values(CLASSES)) {
      const el = document.createElement('button');
      el.className = 'cls'; el.style.setProperty('--c', '#' + c.color.toString(16).padStart(6, '0'));
      el.innerHTML = `<b>${c.name}</b><span>${c.tagline}</span><small>${c.hp} HP · Tempo ${c.speed}</small>`;
      el.onclick = () => this.onPick?.(c.id);
      list.append(el);
    }
    root.querySelector('#pause').onclick = () => this.onPause?.();
    const anp = root.querySelector('#anpassen');
    if (anp) anp.onclick = () => this.onCustomize?.();
    this.feed = root.querySelector('#feed');
    this.feedItems = [];
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
    const best = bots.reduce((a, b) => Math.max(a, b.kills), 0);
    q('#score').innerHTML = `<b>${p.kills}</b> Kills · Bester Bot ${best} · ${m}:${sec}`;
    const d = q('#dead'); d.hidden = !p.dead;
    if (p.dead) d.textContent = `Erledigt. Zurück in ${Math.ceil(p.respawnIn)}…`;
  }
}
