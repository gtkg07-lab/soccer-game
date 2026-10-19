'use strict';
// ===== 効果音（Web Audio で合成。音声ファイル不要） =====
const Sfx = {
  ctx: null, master: null, on: true, crowdGain: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      // 観客のざわめき
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
      this.crowdGain = this.ctx.createGain(); this.crowdGain.gain.value = 0.045;
      src.connect(f); f.connect(this.crowdGain); this.crowdGain.connect(this.master); src.start();
    } catch (e) { this.ctx = null; }
  },
  setOn(v) { this.on = v; if (this.master) this.master.gain.value = v ? 0.55 : 0; },
  ok() { return this.ctx && this.on; },
  noise(dur, type, freq, gain, q, freqTo) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q || 1;
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  tone(freq, dur, type, gain, freqTo, delay) {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (freqTo) o.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  kick(sp) { this.tone(140, 0.12, 'sine', Math.min(0.5, 0.15 + sp * 0.012), 50); this.noise(0.05, 'highpass', 2000, 0.12); },
  bounce() { this.tone(110, 0.06, 'sine', 0.08, 60); },
  whistle(n) { for (let i = 0; i < n; i++) { this.tone(2900, i === n - 1 ? 0.55 : 0.22, 'square', 0.06, 2800, i * 0.32); } },
  cutin() { this.noise(0.6, 'bandpass', 300, 0.35, 1, 4000); this.tone(220, 0.5, 'sawtooth', 0.12, 880); },
  special(elem) {
    this.noise(0.9, 'lowpass', 3000, 0.5, 1, 200); this.tone(90, 0.8, 'sawtooth', 0.25, 40);
    if (elem === 'thunder') this.noise(0.3, 'highpass', 3000, 0.4);
    if (elem === 'wind') this.noise(1.0, 'bandpass', 800, 0.35, 4, 2400);
  },
  whoosh() { this.noise(0.4, 'bandpass', 500, 0.35, 2, 3000); },
  boom() { this.tone(70, 0.7, 'sine', 0.6, 30); this.noise(0.7, 'lowpass', 1200, 0.5, 1, 100); },
  hit() { this.tone(160, 0.15, 'square', 0.12, 60); this.noise(0.12, 'lowpass', 1500, 0.25); },
  clash() { this.noise(1.9, 'bandpass', 600, 0.4, 1, 2500); this.tone(110, 1.9, 'sawtooth', 0.15, 220); },
  save() { this.tone(300, 0.15, 'square', 0.12, 150); this.noise(0.2, 'lowpass', 2000, 0.3); },
  tackle() { this.noise(0.15, 'lowpass', 900, 0.3); this.tone(120, 0.1, 'sine', 0.2, 60); },
  slide() { this.noise(0.4, 'bandpass', 1500, 0.2, 1, 400); },
  goal() {
    this.noise(3.0, 'bandpass', 900, 0.5, 0.5, 600);
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'square', 0.08, null, i * 0.12));
    if (this.crowdGain) { const t = this.ctx.currentTime; this.crowdGain.gain.setValueAtTime(0.2, t); this.crowdGain.gain.exponentialRampToValueAtTime(0.045, t + 4); }
  },
  menu() { this.tone(880, 0.08, 'square', 0.06); },
};

// ===== 画面・メニュー =====
const $ = id => document.getElementById(id);
const UI = {
  cb: null, timer: null, opts: { halfLen: 180, diff: 1 },
  show(id, v) { $(id).classList.toggle('hidden', !v); },
  openSkillMenu(p) {
    if (G.freeze || G.phase !== 'play' || !p) return;
    if (!$('skillMenu').classList.contains('hidden')) { this.closeMenu(); return; }
    const list = skillOptions(p);
    if (!list.length) { this.toast(G.ball.owner === p ? '使える必殺技がない' : '相手に近づいてから使おう'); return; }
    this.buildMenu(`${p.d.name} の必殺技`, list.map(o => ({ sk: o.sk, ok: o.ok, why: o.why })), sk => {
      const again = skillOptions(p).find(o => o.sk === sk && o.ok);
      if (again) useSkill(p, sk); else this.toast('タイミングを逃した！');
    }, null, 0.08, 5);
  },
  keeperMenu(K, opts, cb) {
    const T = teamOf(K);
    const items = opts.map(sk => ({ sk, ok: T.gauge >= sk.cost, why: 'ゲージ不足' }));
    items.push({ plain: true, label: 'ふつうにキャッチ', ok: true });
    this.buildMenu('必殺シュートが来た！ キーパー技は？', items, cb, cb, 0.03, 3.5);
  },
  buildMenu(title, items, onPick, onCancel, scale, timeout) {
    const box = $('skillMenu');
    box.querySelector('.smTitle').textContent = title;
    const cards = box.querySelector('.cards'); cards.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'card' + (it.ok ? '' : ' off');
      if (it.plain) {
        b.innerHTML = `<div class="cn">${it.label}</div><div class="ci">ゲージを使わない</div>`;
        b.style.setProperty('--ec', '#8892b0');
      } else {
        const E = ELEM[it.sk.elem];
        b.style.setProperty('--ec', E.color);
        b.innerHTML = `<div class="ce">${E.name}</div><div class="cn">${it.sk.name}</div>` +
          `<div class="ci">${SKILL_TYPE_NAME[it.sk.type]}${it.sk.power ? ' ・ 威力 ' + it.sk.power : ''}</div>` +
          `<div class="cc">ゲージ ${it.sk.cost}${it.ok ? '' : ' ・ ' + it.why}</div>`;
      }
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (!it.ok) { Sfx.tone(200, 0.1, 'square', 0.05); return; }
        Sfx.menu();
        const cb = this.cb; this.cb = null;
        this.closeMenu();
        if (cb) cb(it.plain ? null : it.sk);
      });
      cards.appendChild(b);
    }
    this.cb = onPick; this.cancelCb = onCancel;
    box.classList.remove('hidden');
    G.timeScale = scale;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.closeMenu(), timeout * 1000);
    Sfx.menu();
  },
  closeMenu() {
    clearTimeout(this.timer);
    const box = $('skillMenu');
    if (!box || box.classList.contains('hidden')) return;
    box.classList.add('hidden');
    G.timeScale = 1;
    const cc = this.cancelCb; this.cancelCb = null; this.cb = null;
    if (cc) cc(null);
  },
  toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => t.classList.add('hidden'), 1400);
  },
  startMatch() {
    Sfx.init();
    try {
      const el = document.documentElement;
      if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) { /* iPhone は非対応 */ }
    G.demo = false;
    newMatch({ halfLen: this.opts.halfLen, diff: this.opts.diff });
    ['title', 'result', 'pauseScr', 'howto'].forEach(id => this.show(id, false));
    this.show('hud', true);
    this.syncAuto();
  },
  toTitle() {
    G.paused = false; this.closeMenu();
    ['result', 'pauseScr', 'hud', 'pad', 'autoBadge', 'howto'].forEach(id => this.show(id, false));
    this.show('title', true);
    startDemo();
  },
  syncAuto() {
    $('btnAuto').innerHTML = `AUTO <b>${G.auto ? 'ON' : 'OFF'}</b>`;
    $('btnAuto').classList.toggle('on', G.auto);
    this.show('pad', !G.auto);
    this.show('autoBadge', G.auto);
  },
  showResult() {
    const a = G.teams[0].score, b = G.teams[1].score;
    $('resScore').textContent = `${a} - ${b}`;
    $('resMsg').textContent = a > b ? '勝利！' : a < b ? '敗北…' : '引き分け';
    $('resMsg').className = a > b ? 'win' : a < b ? 'lose' : '';
    this.closeMenu();
    this.show('pad', false); this.show('autoBadge', false);
    this.show('result', true);
  },
  frame: 0,
  updatePad() {
    if (++this.frame % 6) return;
    const p = G.ctrl; if (!p || G.auto) return;
    const atk = G.ball.owner === p;
    const set = (id, txt) => { const s = $(id).firstElementChild; if (s.textContent !== txt) s.textContent = txt; };
    const thr = isThrowing(p);
    set('bPass', atk ? (thr ? 'スロー' : 'パス') : '切替');
    set('bFly', thr ? '高く\nスロー' : 'フライ\nパス');
    set('bShoot', atk ? (thr ? '高く\nスロー' : p.gk || p.mustPass ? 'ロング' : 'シュート') : 'スライ\nディング');
    $('bFly').classList.toggle('dim', !atk);
    const ready = G.phase === 'play' && skillOptions(p).some(o => o.ok);
    $('bSkill').classList.toggle('ready', ready);
  },
};

// ===== 入力（仮想スティック・ボタン・キーボード） =====
function setupInput() {
  const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
  let sid = null, ox = 0, oy = 0;
  const R0 = 56;
  const setStick = (dx, dy) => {
    const l = Math.hypot(dx, dy), m = Math.min(1, l / R0);
    const nx = l ? dx / l : 0, ny = l ? dy / l : 0;
    knob.style.transform = `translate(${nx * m * R0}px, ${ny * m * R0}px)`;
    Input.jx = nx * m; Input.jy = -ny * m; // 画面の上 = 奥（+y）
  };
  zone.addEventListener('pointerdown', e => {
    if (sid !== null) return;
    sid = e.pointerId; ox = e.clientX; oy = e.clientY;
    const zr = zone.getBoundingClientRect();
    base.style.left = (ox - zr.left - 70) + 'px'; base.style.top = (oy - zr.top - 70) + 'px';
    base.classList.add('active');
    zone.setPointerCapture(e.pointerId);
    setStick(0, 0); e.preventDefault();
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === sid) { setStick(e.clientX - ox, e.clientY - oy); e.preventDefault(); } });
  const end = e => { if (e.pointerId !== sid) return; sid = null; setStick(0, 0); base.classList.remove('active'); base.style.left = ''; base.style.top = ''; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);

  for (const b of document.querySelectorAll('.gbtn')) {
    const act = b.dataset.act;
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.classList.add('down');
      if (act === 'dash') Input.dash = true;
      else if (act === 'skill') UI.openSkillMenu(G.ctrl);
      else if (act === 'pass' || act === 'fly') passDown(act === 'fly');
      else Input.actions.push(act);
    });
    const up = () => {
      b.classList.remove('down');
      if (act === 'dash') Input.dash = false;
      if (act === 'pass' || act === 'fly') passUp(act === 'fly');
    };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
  // キーボード（PC用）
  const keys = {};
  const kstick = () => {
    if (sid !== null) return;
    Input.jx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    Input.jy = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
    const l = Math.hypot(Input.jx, Input.jy); if (l > 1) { Input.jx /= l; Input.jy /= l; }
  };
  addEventListener('keydown', e => {
    if (G.demo) return;
    if (keys[e.code]) return; keys[e.code] = true; kstick();
    if (e.code === 'KeyJ') passDown(false);
    if (e.code === 'KeyU') passDown(true);
    if (e.code === 'KeyK') Input.actions.push('shoot');
    if (e.code === 'KeyL') UI.openSkillMenu(G.ctrl);
    if (e.code === 'ShiftLeft' || e.code === 'Space') Input.dash = true;
    if (e.code === 'KeyP') toggleAuto();
    if (/^Digit[1-4]$/.test(e.code)) {
      const cards = document.querySelectorAll('#skillMenu:not(.hidden) .card');
      const c = cards[+e.code.slice(5) - 1]; if (c) c.dispatchEvent(new PointerEvent('pointerdown'));
    }
    if (e.code === 'Escape') togglePause();
  });
  addEventListener('keyup', e => {
    keys[e.code] = false; kstick();
    if (e.code === 'KeyJ') passUp(false);
    if (e.code === 'KeyU') passUp(true);
    if (e.code === 'ShiftLeft' || e.code === 'Space') Input.dash = false;
  });
}
// パス／フライパス：ボールを持っていれば押している間に強さを溜め、離したら蹴る
function passDown(fly) {
  const p = G.ctrl;
  if (!G.auto && p && G.ball.owner === p) Input.charge = { fly, t0: performance.now() };
  else if (!fly) Input.actions.push('pass');
}
function passUp(fly) {
  const ch = Input.charge;
  if (!ch || ch.fly !== fly) return;
  Input.actions.push({ a: 'kickpass', fly, power: passPower() });
  Input.charge = null;
}
function toggleAuto() {
  if (G.demo || !G.ball) return;
  G.auto = !G.auto;
  UI.closeMenu();
  if (!G.auto) { const n = G.teams[0].near[0]; G.ctrl = G.ball.owner && G.ball.owner.team === 0 ? G.ball.owner : (n ? n.p : G.teams[0].players[9]); }
  Input.actions.length = 0;
  UI.syncAuto();
}
function togglePause() {
  if (G.demo || G.phase === 'fulltime') return;
  G.paused = !G.paused;
  if (G.paused) UI.closeMenu();
  UI.show('pauseScr', G.paused);
}

// ===== タイトル画面などのボタン =====
function setupScreens() {
  const seg = (id, key, conv) => {
    const btns = $(id).querySelectorAll('button');
    btns.forEach(b => b.addEventListener('click', () => {
      btns.forEach(x => x.classList.remove('sel')); b.classList.add('sel');
      UI.opts[key] = conv(b.dataset.v);
    }));
  };
  seg('optTime', 'halfLen', v => +v);
  seg('optDiff', 'diff', v => +v);
  $('btnStart').addEventListener('click', () => UI.startMatch());
  $('btnHow').addEventListener('click', () => UI.show('howto', true));
  $('btnHowClose').addEventListener('click', () => UI.show('howto', false));
  $('btnAuto').addEventListener('click', toggleAuto);
  $('btnPause').addEventListener('click', togglePause);
  $('btnResume').addEventListener('click', togglePause);
  $('btnPauseHow').addEventListener('click', () => UI.show('howto', true));
  $('btnSound').addEventListener('click', () => { Sfx.setOn(!Sfx.on); $('btnSound').textContent = `効果音：${Sfx.on ? 'ON' : 'OFF'}`; });
  $('btnQuit').addEventListener('click', () => UI.toTitle());
  $('btnAgain').addEventListener('click', () => UI.startMatch());
  $('btnResTitle').addEventListener('click', () => UI.toTitle());
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden && !G.demo && !G.paused && G.phase !== 'fulltime') togglePause(); });
}

// タイトル画面の背景で CPU 同士の試合を流す
function startDemo() {
  newMatch({ halfLen: 9999, diff: 1, auto: true });
  G.demo = true;
}

// ===== メインループ =====
let lastT = performance.now();
function frame(now) {
  const rdt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  try {
    update(rdt);
    render();
    if (!G.demo) UI.updatePad();
  } catch (e) { showErr(e); }
  requestAnimationFrame(frame);
}
function showErr(e) {
  const el = $('err'); if (!el) return;
  el.textContent = 'エラー: ' + (e && (e.stack || e.message) || e);
  el.style.display = 'block';
}
addEventListener('error', e => showErr(e.error || e.message));

addEventListener('DOMContentLoaded', () => {
  renderInit($('cv'));
  setupInput();
  setupScreens();
  const q = new URLSearchParams(location.search);
  if (q.has('demo')) {
    // 動作確認用：すぐ試合を始める
    UI.opts.halfLen = +(q.get('len') || 180);
    UI.startMatch();
    if (!q.has('manual')) { G.auto = true; UI.syncAuto(); }
    // 動作確認用：指定秒数ぶん早送り（until=cutin/clash でその場面で止める）
    const warp = +(q.get('warp') || 0), until = q.get('until');
    for (let i = 0; i < warp * 60; i++) {
      update(1 / 60);
      if (until && G.freeze && G.freeze.type === until && G.freeze.t > +(q.get('ft') || 0.5)) break;
      if (until === 'goal' && G.phase === 'goal' && G.phaseT > 0.8) break;
      if (until === 'dash' && G.players.some(p => p.state === 'dash' && !p.dashTarget && p.dashT > +(q.get('dt') || 0.4))) break;
      if (until === 'special' && G.ball.special && G.ball.special.trav > +(q.get('tr') || 8) && !G.freeze) break;
    }
    if (q.has('throw')) { G.phase = 'play'; setRestart('throw', 0, 8, (q.get('throw') === 'far' ? 1 : -1) * (W - 0.5)); for (let i = 0; i < 80; i++) update(1 / 60); }
    if (q.has('guide')) { G.phase = 'play'; Input.jx = 0.9; Input.jy = 0.3; Input.charge = { fly: q.get('guide') === 'fly', t0: performance.now() - 250 }; for (let i = 0; i < 2; i++) update(1 / 60); }
    if (q.has('menu')) { G.phase = 'play'; UI.openSkillMenu(G.ctrl); }
    if (q.has('stop')) G.paused = true;
  } else {
    UI.show('title', true);
    startDemo();
  }
  requestAnimationFrame(frame);
});
