import { chapters } from '../story/dialogue.js';
import { shayari } from '../story/shayari.js';
import { letter } from '../story/birthdayLetter.js';
import { isTouch } from '../components/Input.js';

const $ = (s) => document.querySelector(s);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PETAL_SVG = '<svg viewBox="0 0 24 24"><path d="M12 22C6 17 5 9 8.5 3.5L12 6.5l3.5-3C19 9 18 17 12 22z"/></svg>';

export class UI {
  constructor() {
    this.hud = $('#hud');
    const tracker = $('#petal-tracker .petals');
    tracker.innerHTML = PETAL_SVG.repeat(5);
    this.petalIcons = [...tracker.querySelectorAll('svg')];
    this.prompt = $('#prompt');
    this.toastEl = $('#area-toast');
    this.caption = $('#caption');
    this.fadeEl = $('#fade');
    if (isTouch) $('#prompt kbd').textContent = '✋';
  }

  setLoading(p) { $('#load-bar').style.width = `${Math.round(p * 100)}%`; }
  hideLoading() { const l = $('#loading'); l.style.opacity = 0; setTimeout(() => l.classList.add('hidden'), 1000); }

  showTitle(onStart) {
    const t = $('#title');
    t.classList.remove('hidden');
    $('#start-btn').onclick = () => { t.style.opacity = 0; setTimeout(() => t.classList.add('hidden'), 1200); onStart(); };
  }

  showHUD(on) {
    this.hud.classList.toggle('hidden', !on);
    $('#touch').classList.toggle('hidden', !(on && isTouch));
  }

  showControlsHelp() {
    const el = $('#controls-help');
    el.textContent = isTouch
      ? 'Left stick: move · Drag: look · ✋ when it glows'
      : 'WASD move · Mouse look (click to lock) · Shift walk · E interact';
    el.classList.remove('hidden');
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; setTimeout(() => el.classList.add('hidden'), 1000); }, 9000);
  }

  setPetals(n, pop = -1) {
    this.petalIcons.forEach((s, i) => {
      s.classList.toggle('on', i < n);
      if (i === pop) { s.classList.add('pop'); setTimeout(() => s.classList.remove('pop'), 700); }
    });
    $('#petal-count').textContent = `${n} / 5`;
  }

  setObjective(text) { $('#objective').textContent = text ? `✿ ${text}` : ''; $('#objective').style.opacity = text ? 0.92 : 0; }

  setPrompt(p) {
    if (!p) { this.prompt.classList.add('hidden'); $('#btn-act').classList.remove('ready'); return; }
    this.prompt.classList.toggle('hidden', isTouch && !p.locked);
    this.prompt.classList.toggle('locked', !!p.locked);
    this.prompt.querySelector('span').textContent = p.label;
    $('#btn-act').classList.toggle('ready', !p.locked);
  }

  toast(title, sub) {
    this.toastEl.innerHTML = `${title}<small>${sub || ''}</small>`;
    this.toastEl.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toastEl.classList.remove('show'), 3800);
  }

  async captionLine(text, hold = 3000) {
    this.caption.textContent = text;
    this.caption.classList.add('show');
    await sleep(hold);
    this.caption.classList.remove('show');
    await sleep(1200);
  }

  fade(on, dark = false, ms = 1000) {
    this.fadeEl.classList.toggle('dark', dark);
    this.fadeEl.style.transition = `opacity ${ms}ms`;
    this.fadeEl.style.opacity = on ? 1 : 0;
    return sleep(ms);
  }

  /** Story chapter card: shayari lines revealed one by one. */
  async showStory(id) {
    const ch = chapters.find((c) => c.id === id);
    const el = $('#story');
    el.querySelector('.chapter-kicker').textContent = `Petal ${id} of 5`;
    el.querySelector('.chapter-title').textContent = `Chapter ${id} — ${ch.title}`;
    const sh = el.querySelector('.shayari');
    const btn = el.querySelector('.story-next');
    sh.innerHTML = shayari[id].map((l) => `<p>${l}</p>`).join('');
    btn.classList.add('hidden');
    el.classList.remove('hidden');
    let skip = false;
    const skipper = () => (skip = true);
    el.addEventListener('pointerdown', skipper);
    await sleep(skip ? 0 : 600);
    for (const p of sh.querySelectorAll('p')) { await sleep(skip ? 120 : 1100); p.classList.add('show'); }
    el.removeEventListener('pointerdown', skipper);
    await sleep(500);
    btn.classList.remove('hidden');
    await new Promise((res) => {
      const done = () => { removeEventListener('keydown', key); res(); };
      const key = (e) => { if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') done(); };
      btn.onclick = done;
      addEventListener('keydown', key);
    });
    el.classList.add('hidden');
  }

  // ------------------------------------------------------------ finale text
  finaleShow(sel, html) {
    const f = $('#finale');
    f.classList.remove('hidden');
    const el = f.querySelector(sel);
    if (html !== undefined) el.innerHTML = html;
    el.classList.remove('gone');
    requestAnimationFrame(() => el.classList.add('show'));
    return el;
  }
  finaleHide(sel) {
    const el = $('#finale').querySelector(sel);
    el.classList.remove('show');
    setTimeout(() => el.classList.add('gone'), 1800);
  }
  finaleReset() {
    const f = $('#finale');
    f.querySelectorAll(':scope > *').forEach((e) => e.classList.remove('show', 'gone'));
    f.querySelectorAll('.f-lead,.f-name,.f-nick,.f-shayari,.f-bday').forEach((e) => e.classList.add('gone'));
    $('#open-letter').classList.add('hidden');
    f.classList.remove('hidden');
  }
  finaleEnd() { $('#finale').classList.add('hidden'); }

  async waitLetterButton() {
    const b = $('#open-letter');
    b.classList.remove('hidden', 'gone');
    requestAnimationFrame(() => b.classList.add('show'));
    await new Promise((r) => (b.onclick = r));
  }

  async showLetter({ onExplore, onReplay }) {
    const el = $('#letter');
    el.querySelector('.l-title').textContent = letter.title;
    const body = el.querySelector('.l-body');
    body.innerHTML = letter.paragraphs.map((p) => `<p>${p}</p>`).join('');
    el.querySelector('.l-closing').textContent = letter.closing;
    el.querySelector('.l-sign').textContent = letter.signature;
    el.classList.remove('hidden');
    el.scrollTop = 0;
    $('#btn-explore').onclick = () => { el.classList.add('hidden'); onExplore(); };
    $('#btn-replay').onclick = () => onReplay();
    const ps = [...body.querySelectorAll('p')];
    for (const p of ps) { await sleep(650); p.classList.add('show'); }
  }
}
