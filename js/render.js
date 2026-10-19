'use strict';
// ===== 描画：疑似3Dカメラ（イーフト風の斜め見下ろし） =====
const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif';
const TITLE_FONT = '"Dela Gothic One","Hiragino Sans","Noto Sans JP",sans-serif';
const R = { cv: null, ctx: null, W: 0, H: 0, dpr: 1, f: 1, cy: 0, sx: 0, sy: 0, safeL: 0, safeR: 0,
  C: { x: 0, y: 0, z: 0, cos: 1, sin: 0 } };
const CAM = { th: 27 * Math.PI / 180, dist: 44 };

function renderInit(cv) {
  R.cv = cv; R.ctx = cv.getContext('2d');
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));
}
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  R.dpr = dpr; R.W = innerWidth; R.H = innerHeight;
  R.cv.width = Math.round(R.W * dpr); R.cv.height = Math.round(R.H * dpr);
  R.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const probe = document.getElementById('safe');
  if (probe) {
    const cs = getComputedStyle(probe);
    R.safeL = parseFloat(cs.paddingLeft) || 0; R.safeR = parseFloat(cs.paddingRight) || 0;
  }
}

function setupCamera() {
  const z = G.cam.zoom || 1, th = CAM.th, D = CAM.dist / z;
  const C = R.C;
  C.x = G.cam.x; C.y = G.cam.y - D * Math.cos(th); C.z = D * Math.sin(th);
  C.cos = Math.cos(th); C.sin = Math.sin(th);
  R.f = Math.max(R.W, R.H * 1.7) * 1.02;
  R.cy = R.H * 0.54;
  R.sx = (Math.random() - 0.5) * G.shake * 16;
  R.sy = (Math.random() - 0.5) * G.shake * 16;
}
// ワールド座標 → 画面座標（k は 1m あたりのピクセル数）
function P(x, y, z) {
  const C = R.C;
  const dx = x - C.x, dy = y - C.y, dz = (z || 0) - C.z;
  const dep = dy * C.cos - dz * C.sin;
  if (dep < 0.3) return null;
  const up = dy * C.sin + dz * C.cos;
  const k = R.f / dep;
  return { x: R.W / 2 + dx * k + R.sx, y: R.cy - up * k + R.sy, k };
}
function hash(n) { n = (n << 13) ^ n; return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff); }
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeIn = t => t * t * t;

// カメラより手前（画面外）にはみ出す部分を切り取る
const NEAR = 0.6;
function depthOf(x, y, z) { const C = R.C; return (y - C.y) * C.cos - ((z || 0) - C.z) * C.sin - NEAR; }
function clipSeg(a, b) {
  const da = depthOf(a[0], a[1], a[2]), db = depthOf(b[0], b[1], b[2]);
  if (da < 0 && db < 0) return null;
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, (p[2] || 0) + ((q[2] || 0) - (p[2] || 0)) * t];
  if (da < 0) a = lerp(a, b, da / (da - db));
  else if (db < 0) b = lerp(a, b, da / (da - db));
  return [a, b];
}
// 折れ線（ライン用）
function polyW(c, pts) {
  c.beginPath();
  for (let i = 0; i + 1 < pts.length; i++) {
    const sg = clipSeg(pts[i], pts[i + 1]); if (!sg) continue;
    const a = P(sg[0][0], sg[0][1], sg[0][2]), b = P(sg[1][0], sg[1][1], sg[1][2]);
    if (!a || !b) continue;
    c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
  }
}
// 塗りつぶし多角形
function fillW(c, pts) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const da = depthOf(a[0], a[1], a[2]), db = depthOf(b[0], b[1], b[2]);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t]); }
  }
  if (out.length < 3) return;
  c.beginPath();
  out.forEach((q, i) => { const s = P(q[0], q[1], q[2]); if (!s) return; i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); });
  c.closePath(); c.fill();
}
function lineW(c, x1, y1, z1, x2, y2, z2) {
  const sg = clipSeg([x1, y1, z1], [x2, y2, z2]); if (!sg) return;
  const a = P(sg[0][0], sg[0][1], sg[0][2]), b = P(sg[1][0], sg[1][1], sg[1][2]); if (!a || !b) return;
  c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
}

// ===== 背景（スタンド・看板） =====
const CROWD = ['#d9d9e6', '#2f4fff', '#ffffff', '#ff4d6d', '#ffd23f', '#1d5cff', '#7a7a90', '#c04dff', '#0e1a3a', '#f4a3b8'];
function drawStadium(c) {
  const g = c.createLinearGradient(0, 0, 0, R.H * 0.6);
  g.addColorStop(0, '#070b1f'); g.addColorStop(1, '#16224a');
  c.fillStyle = g; c.fillRect(0, 0, R.W, R.H);
  // 照明の光
  c.globalCompositeOperation = 'lighter';
  for (const lx of [-0.35, 0.35]) {
    const sx = R.W * (0.5 + lx) - (G.cam.x * 2) % 60;
    const rg = c.createRadialGradient(sx, R.H * 0.02, 0, sx, R.H * 0.02, R.H * 0.5);
    rg.addColorStop(0, 'rgba(180,200,255,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, R.W, R.H * 0.6);
  }
  c.globalCompositeOperation = 'source-over';
  const x0 = R.C.x - 90, x1 = R.C.x + 90;
  const t = G.t;
  const excite = G.phase === 'goal' ? 1 : (G.ball.special ? 0.6 : 0.15);
  for (let k = 15; k >= 0; k--) {
    const y = W + 6 + k * 2.6, z = 1.2 + k * 1.55;
    const a = P(x0, y, z), b = P(x1, y, z), a2 = P(x0, y + 2.6, z + 1.55), b2 = P(x1, y + 2.6, z + 1.55);
    if (!a || !b || !a2 || !b2) continue;
    const shade = 20 + k * 2;
    c.fillStyle = `rgb(${shade},${shade + 4},${shade + 18})`;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(b2.x, b2.y); c.lineTo(a2.x, a2.y); c.closePath(); c.fill();
    // 観客（同じ列は同じ奥行きなので横方向は一次式で計算）
    const row = P(R.C.x, y + 1.3, z + 0.9); if (!row) continue;
    const kk = row.k, sz = Math.max(1, 0.55 * kk);
    const start = Math.floor(x0 / 0.75);
    for (let i = start; i < start + 240; i++) {
      const wx = i * 0.75;
      const h = hash(i * 97 + k * 1013);
      const sxp = R.W / 2 + (wx - R.C.x) * kk + R.sx;
      if (sxp < -5 || sxp > R.W + 5) continue;
      const jump = excite * Math.max(0, Math.sin(t * 9 + (h % 100))) * 0.35 * kk;
      c.fillStyle = CROWD[h % CROWD.length];
      c.fillRect(sxp, row.y - jump - ((h >> 5) % 3) * 0.1 * kk, sz, sz * 1.2);
    }
  }
  // 屋根の影
  c.fillStyle = 'rgba(0,0,10,0.55)';
  const top = P(R.C.x, W + 6 + 16 * 2.6, 1.2 + 16 * 1.55);
  if (top) c.fillRect(0, 0, R.W, Math.max(0, top.y));
  // 看板
  const yb = W + 3;
  const pa = P(R.C.x, yb, 0), pb = P(R.C.x, yb, 1.0);
  if (pa && pb) {
    const kk = pa.k;
    const ADS = [['#1d5cff', 'SUPER SKILL ELEVEN'], ['#d81b60', '必殺技で勝て！'], ['#111', 'HYPER DIMENSION'], ['#ff8a00', '超次元サッカー']];
    const startI = Math.floor((R.C.x - 70) / 14);
    for (let i = startI; i < startI + 11; i++) {
      const wx = i * 14;
      const sx = R.W / 2 + (wx - R.C.x) * kk + R.sx, w = 14 * kk;
      const ad = ADS[((i % 4) + 4) % 4];
      c.fillStyle = ad[0]; c.fillRect(sx, pb.y, w - 1, pa.y - pb.y);
      c.fillStyle = '#fff'; c.font = `900 ${Math.max(6, (pa.y - pb.y) * 0.6)}px ${FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(ad[1], sx + w / 2, (pa.y + pb.y) / 2);
    }
  }
}

// ===== ピッチ =====
function drawPitch(c) {
  // 外周の芝
  c.fillStyle = '#1f6a2c';
  fillW(c, [[-L - 12, -W - 30], [L + 12, -W - 30], [L + 12, W + 3], [-L - 12, W + 3]]);
  // 芝目のしま模様
  const n = 20, sw = (2 * L) / n;
  for (let i = 0; i < n; i++) {
    c.fillStyle = i % 2 ? '#2f8c3c' : '#2a8036';
    const xa = -L + i * sw, xb = xa + sw;
    fillW(c, [[xa, -W - 2], [xb, -W - 2], [xb, W + 1.5], [xa, W + 1.5]]);
  }
  // 照明のムラ
  const vg = c.createRadialGradient(R.W / 2, R.H * 0.6, R.H * 0.1, R.W / 2, R.H * 0.6, R.W * 0.8);
  vg.addColorStop(0, 'rgba(255,255,255,0.05)'); vg.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = vg; c.fillRect(0, 0, R.W, R.H);
  // ライン
  c.strokeStyle = 'rgba(255,255,255,0.88)'; c.lineWidth = 2; c.lineJoin = 'round';
  polyW(c, [[-L, -W], [L, -W], [L, W], [-L, W], [-L, -W]]);
  lineW(c, 0, -W, 0, 0, W, 0);
  c.stroke();
  const circle = (cx, cy, r, a0, a1, cond) => {
    c.beginPath(); let first = true;
    for (let i = 0; i <= 48; i++) {
      const a = a0 + (a1 - a0) * i / 48, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (cond && !cond(x, y)) { first = true; continue; }
      const s = P(x, y, 0); if (!s) continue;
      if (first) { c.moveTo(s.x, s.y); first = false; } else c.lineTo(s.x, s.y);
    }
    c.stroke();
  };
  circle(0, 0, 9.15, 0, Math.PI * 2);
  for (const e of [-1, 1]) {
    polyW(c, [[e * L, -20.16], [e * (L - 16.5), -20.16], [e * (L - 16.5), 20.16], [e * L, 20.16]]); c.stroke();
    polyW(c, [[e * L, -9.16], [e * (L - 5.5), -9.16], [e * (L - 5.5), 9.16], [e * L, 9.16]]); c.stroke();
    circle(e * (L - 11), 0, 9.15, 0, Math.PI * 2, (x) => Math.abs(x) < L - 16.5);
    for (const f of [-1, 1]) circle(e * L, f * W, 1, 0, Math.PI * 2, (x, y) => Math.abs(x) <= L && Math.abs(y) <= W);
    const ps = P(e * (L - 11), 0, 0); if (ps) { c.fillStyle = '#fff'; c.beginPath(); c.arc(ps.x, ps.y, 2, 0, 7); c.fill(); }
  }
  const cs = P(0, 0, 0); if (cs) { c.fillStyle = '#fff'; c.beginPath(); c.arc(cs.x, cs.y, 2, 0, 7); c.fill(); }
}

function drawGoal(c, e) {
  const gw = PITCH.goalW, gh = PITCH.goalH, gd = PITCH.goalD, gx = e * L, bx = e * (L + gd);
  // ネット
  c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= 14; i++) { const y = -gw + i * (2 * gw / 14); lineW(c, bx, y, 0, bx, y, gh * 0.85); lineW(c, bx, y, gh * 0.85, gx, y, gh); }
  for (let j = 0; j <= 5; j++) { const z = j * gh * 0.85 / 5; lineW(c, bx, -gw, z, bx, gw, z); }
  for (const f of [-1, 1]) {
    for (let i = 0; i <= 4; i++) { const x = gx + (bx - gx) * i / 4; lineW(c, x, f * gw, 0, x, f * gw, gh - (gh * 0.15) * i / 4); }
    for (let j = 0; j <= 5; j++) { const z = j * gh / 5; lineW(c, gx, f * gw, z, bx, f * gw, Math.min(z, gh * 0.85)); }
  }
  c.stroke();
  // ポスト
  const p0 = P(gx, 0, 0); const lw = p0 ? Math.max(2, 0.12 * p0.k) : 2;
  c.strokeStyle = '#fff'; c.lineWidth = lw; c.lineCap = 'round';
  c.beginPath();
  lineW(c, gx, -gw, 0, gx, -gw, gh); lineW(c, gx, -gw, gh, gx, gw, gh); lineW(c, gx, gw, gh, gx, gw, 0);
  c.stroke();
  c.lineCap = 'butt';
}

// ===== 選手 =====
function lookOf(p) {
  const T = TEAMS[p.team];
  return { shirt: p.gk ? T.gkShirt : T.shirt, accent: T.accent, shorts: T.shorts, socks: p.gk ? T.gkShirt : T.socks,
    hair: T.hair, skin: p.d.n % 3 === 0 ? '#c98d5f' : '#f0c7a0', num: p.d.n };
}
// 足元 (x,y) に高さ s(px/m) の人型を描く
function drawFigure(c, x, y, s, look, pose) {
  c.save(); c.translate(x, y);
  if (pose.rot) c.rotate(pose.rot);
  if (pose.flip < 0) c.scale(-1, 1);
  if (pose.alpha != null) c.globalAlpha = pose.alpha;
  const tint = pose.tint;
  const col = v => tint || v;
  const amp = pose.moving ? 0.32 * (pose.side == null ? 1 : 0.35 + 0.65 * pose.side) : 0;
  const sw = Math.sin(pose.run || 0) * amp;
  const bob = pose.moving ? -Math.abs(Math.sin(pose.run || 0)) * 0.05 * s : 0;
  c.translate(0, bob);
  c.lineCap = 'round';
  const hipY = -0.9 * s, shY = -1.42 * s;
  const leg = (hx, fx, fy, front) => {
    const kx = (hx + fx) / 2 + 0.07 * s, ky = (hipY + fy) / 2;
    c.strokeStyle = col(look.skin); c.lineWidth = 0.13 * s;
    c.beginPath(); c.moveTo(hx, hipY); c.lineTo(kx, ky); c.stroke();
    c.strokeStyle = col(look.socks); c.lineWidth = 0.12 * s;
    c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy); c.stroke();
    c.fillStyle = col('#151515');
    c.beginPath(); c.ellipse(fx + 0.06 * s, fy - 0.02 * s, 0.12 * s, 0.06 * s, 0, 0, 7); c.fill();
  };
  const arm = (hx, hy) => {
    c.strokeStyle = col(look.shirt); c.lineWidth = 0.1 * s;
    c.beginPath(); c.moveTo(0, shY + 0.05 * s); c.lineTo((hx) * 0.5, (shY + hy) / 2); c.stroke();
    c.strokeStyle = col(look.skin); c.lineWidth = 0.085 * s;
    c.beginPath(); c.moveTo(hx * 0.5, (shY + hy) / 2); c.lineTo(hx, hy); c.stroke();
  };
  const armsUp = pose.arms === 'up';
  // 奥の腕・脚
  if (armsUp) arm(-0.3 * s, -2.0 * s); else arm(-sw * 0.9 * s, -0.98 * s);
  leg(-0.04 * s, -sw * s, 0, false);
  // 胴体
  c.fillStyle = col(look.shorts);
  c.fillRect(-0.17 * s, -1.02 * s, 0.34 * s, 0.24 * s);
  c.fillStyle = col(look.shirt);
  c.beginPath();
  if (c.roundRect) c.roundRect(-0.2 * s, shY - 0.04 * s, 0.4 * s, 0.56 * s, 0.07 * s); else c.rect(-0.2 * s, shY - 0.04 * s, 0.4 * s, 0.56 * s);
  c.fill();
  if (!tint) {
    c.fillStyle = look.accent;
    c.fillRect(-0.2 * s, shY + 0.16 * s, 0.4 * s, 0.07 * s);
    if (s > 26) {
      c.fillStyle = look.accent; c.font = `900 ${0.2 * s}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(look.num, 0, shY + 0.36 * s);
    }
  }
  // 手前の脚（キック時は前に振り上げ）
  if (pose.kick > 0) {
    const k = Math.sin(Math.min(1, pose.kick) * Math.PI);
    leg(0.04 * s, (0.15 + 0.4 * k) * s, -0.45 * k * s, true);
  } else leg(0.04 * s, sw * s, 0, true);
  if (armsUp) arm(0.3 * s, -2.0 * s); else arm(sw * 0.9 * s, -0.98 * s);
  // 頭
  c.fillStyle = col(look.skin);
  c.beginPath(); c.arc(0.02 * s, -1.62 * s, 0.135 * s, 0, 7); c.fill();
  c.fillStyle = col(look.hair);
  c.beginPath(); c.arc(0.0, -1.66 * s, 0.14 * s, Math.PI * 0.95, Math.PI * 2.15); c.fill();
  // ツンツン髪（超次元っぽさ）
  c.beginPath();
  c.moveTo(-0.13 * s, -1.68 * s); c.lineTo(-0.2 * s, -1.86 * s); c.lineTo(-0.05 * s, -1.76 * s);
  c.lineTo(0.0, -1.92 * s); c.lineTo(0.06 * s, -1.76 * s); c.lineTo(0.16 * s, -1.82 * s); c.lineTo(0.13 * s, -1.66 * s);
  c.fill();
  c.restore();
}

function playerPose(p) {
  const sp = Math.hypot(p.vx, p.vy);
  const pose = { run: p.run, moving: sp > 0.5, flip: p.fx >= 0 ? 1 : -1, side: Math.abs(p.fx), kick: p.kickAnim > 0 ? 1 - p.kickAnim / 0.3 : 0 };
  if (p.state === 'down') { pose.rot = 1.45 * pose.flip; pose.moving = false; }
  else if (p.state === 'slide') { pose.rot = -0.95 * pose.flip; pose.moving = false; pose.kick = 0.5; }
  else if (p.state === 'dive') { pose.rot = (p.diveDir || 1) * 1.25; pose.moving = false; pose.arms = 'up'; pose.flip = 1; }
  else if (p.state === 'cele') { pose.arms = 'up'; }
  if (p.gk && G.ball.owner === p) pose.arms = 'up';
  return pose;
}

function drawShadow(c, x, y, r) {
  const s = P(x, y, 0); if (!s) return;
  c.fillStyle = 'rgba(0,0,0,0.32)';
  c.beginPath(); c.ellipse(s.x, s.y, r * s.k, r * s.k * 0.32, 0, 0, 7); c.fill();
}

function drawPlayer(c, p) {
  const s = P(p.x, p.y, p.z); if (!s) return;
  const pose = playerPose(p);
  // 必殺技発動中のオーラ
  if (p.state === 'dash' && p.dashSk) {
    const E = ELEM[p.dashSk.elem];
    c.globalCompositeOperation = 'lighter';
    const rg = c.createRadialGradient(s.x, s.y - s.k, 0, s.x, s.y - s.k, s.k * 1.6);
    rg.addColorStop(0, E.light); rg.addColorStop(0.4, E.color); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(s.x - s.k * 2, s.y - s.k * 3, s.k * 4, s.k * 4);
    c.globalCompositeOperation = 'source-over';
  }
  drawFigure(c, s.x, s.y, s.k, lookOf(p), pose);
}

function drawBall(c, b) {
  const s = P(b.x, b.y, b.z + 0.11); if (!s) return;
  const r = Math.max(2.6, 0.17 * s.k);
  const sp = b.special;
  if (sp) { FX.drawSpecialBall(c, b, s, r); return; }
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(s.x, s.y, r, 0, 7); c.fill();
  c.fillStyle = '#222';
  const a = b.spin || 0;
  for (let i = 0; i < 3; i++) {
    const ang = a + i * 2.1;
    c.beginPath(); c.arc(s.x + Math.cos(ang) * r * 0.5, s.y + Math.sin(ang) * r * 0.5, r * 0.28, 0, 7); c.fill();
  }
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
  c.beginPath(); c.arc(s.x, s.y, r, 0, 7); c.stroke();
}

// ===== エフェクト =====
const FX = {
  list: [],
  add(o) { o.t = 0; o.vx = o.vx || 0; o.vy = o.vy || 0; o.vz = o.vz || 0; o.g = o.g || 0; this.list.push(o); if (this.list.length > 900) this.list.shift(); return o; },
  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const o = l[i]; o.t += dt;
      if (o.t >= o.life) { l.splice(i, 1); continue; }
      o.vz -= o.g * dt;
      o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
      if (o.drag) { const f = Math.exp(-o.drag * dt); o.vx *= f; o.vy *= f; o.vz *= f; }
      if (o.z < 0 && o.g) { o.z = 0; o.vz *= -0.35; o.vx *= 0.6; o.vy *= 0.6; }
    }
  },
  clear() { this.list.length = 0; },
  burst(x, y, z, fx, n) {
    const E = ELEM[FX.elemOf(fx)];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = 4 + Math.random() * 14, up = (Math.random() - 0.3) * 10;
      this.add({ type: 'glow', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: up, drag: 2.5, life: 0.35 + Math.random() * 0.45, size: 0.3 + Math.random() * 0.6, c1: E.light, c2: E.color });
    }
    for (let i = 0; i < n / 2; i++) {
      const a = Math.random() * 6.283, sp = 8 + Math.random() * 18;
      this.add({ type: 'spark', x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (Math.random() - 0.2) * 14, drag: 3, life: 0.3 + Math.random() * 0.3, color: E.light });
    }
    if (fx === 'earth' || fx === 'meteor') this.rocks(x, y, z, n / 3);
    if (fx === 'thunder') for (let i = 0; i < 3; i++) this.bolt(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, z);
    this.ring(x, y, Math.max(0.05, z * 0.2), E.color, 6, 0.5);
  },
  rocks(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = 3 + Math.random() * 9;
      this.add({ type: 'rock', x, y, z: z + 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 4 + Math.random() * 9, g: 22, life: 1.0 + Math.random() * 0.6, size: 0.15 + Math.random() * 0.35, rot: Math.random() * 6 });
    }
  },
  ring(x, y, z, color, size, life) { this.add({ type: 'ring', x, y, z, life: life || 0.5, size: size || 5, color }); },
  bolt(x, y, z) { this.add({ type: 'bolt', x, y, z, life: 0.22, seed: Math.random() * 1000 }); },
  ghost(p, color) {
    this.add({ type: 'ghost', x: p.x, y: p.y, z: p.z, life: 0.35, look: lookOf(p), pose: playerPose(p), color });
  },
  shield(x, y, z, elem, life, kind) { this.add({ type: 'shield', x, y, z, life, elem, kind }); },
  confetti(x, y) {
    const cols = ['#ff4d6d', '#ffd23f', '#2fe0c0', '#1d5cff', '#fff', '#c04dff'];
    for (let i = 0; i < 160; i++) {
      this.add({ type: 'confetti', x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 20, z: 10 + Math.random() * 10,
        vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3, vz: 0, g: 2.2, drag: 1.2, life: 3 + Math.random() * 2, color: cols[i % cols.length], rot: Math.random() * 6 });
    }
  },
  text(x, y, z, text, color) { this.add({ type: 'text', x, y, z, vz: 2.2, life: 1.3, text, color: color || '#fff' }); },
  elemOf(fx) { return fx === 'phoenix' ? 'fire' : fx === 'meteor' ? 'earth' : fx; },

  // 必殺シュート中のボールから出るエフェクト
  trail(b, dt) {
    const s = b.special; if (!s) return;
    const E = ELEM[s.sk.elem], fx = s.sk.fx;
    b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 18) b.trail.shift();
    const n = Math.ceil(dt * 120);
    for (let i = 0; i < n; i++) {
      const j = () => (Math.random() - 0.5);
      if (fx === 'fire' || fx === 'phoenix' || fx === 'meteor') {
        this.add({ type: 'glow', x: b.x + j() * 0.6, y: b.y + j() * 0.6, z: b.z + j() * 0.6, vx: -s.ux * 6 + j() * 4, vy: -s.uy * 6 + j() * 4, vz: 2 + Math.random() * 3, drag: 2, life: 0.35 + Math.random() * 0.35, size: fx === 'phoenix' ? 1.3 : fx === 'meteor' ? 1.5 : 0.9, c1: '#fff3b0', c2: fx === 'meteor' ? '#ff6a00' : E.color });
      } else if (fx === 'wind') {
        const a = s.trav * 1.5 + i;
        this.add({ type: 'glow', x: b.x, y: b.y + Math.cos(a) * 0.9, z: b.z + Math.sin(a) * 0.9, vx: -s.ux * 3, vy: Math.cos(a) * 2, vz: Math.sin(a) * 2, drag: 1, life: 0.4, size: 0.3, c1: E.light, c2: E.color });
      } else if (fx === 'thunder') {
        this.add({ type: 'spark', x: b.x, y: b.y, z: b.z, vx: j() * 20, vy: j() * 20, vz: j() * 20, drag: 4, life: 0.2, color: Math.random() < 0.5 ? '#fff' : E.color });
      } else if (fx === 'earth') {
        this.add({ type: 'glow', x: b.x + j(), y: b.y + j(), z: b.z + j(), vx: -s.ux * 4, vy: j() * 2, vz: 1, drag: 2, life: 0.5, size: 0.9, c1: E.light, c2: E.color });
      }
    }
    if (fx === 'wind' && Math.random() < dt * 20) this.ring(b.x, b.y, b.z, E.color, 2.2, 0.35);
    if (fx === 'thunder' && Math.random() < dt * 14) this.bolt(b.x, b.y, b.z);
    if ((fx === 'earth' || fx === 'meteor') && Math.random() < dt * 12) this.rocks(b.x, b.y, b.z, 2);
  },

  drawSpecialBall(c, b, s, r) {
    const sp = b.special, E = ELEM[sp.sk.elem], fx = sp.sk.fx, t = G.t;
    c.globalCompositeOperation = 'lighter';
    // 軌跡
    if (b.trail.length > 2) {
      for (let i = 1; i < b.trail.length; i++) {
        const a = P(b.trail[i - 1].x, b.trail[i - 1].y, b.trail[i - 1].z + 0.11), q = P(b.trail[i].x, b.trail[i].y, b.trail[i].z + 0.11);
        if (!a || !q) continue;
        const u = i / b.trail.length;
        c.strokeStyle = E.color; c.globalAlpha = u * 0.8; c.lineWidth = r * 3.2 * u;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(q.x, q.y); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = r * 1.1 * u;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(q.x, q.y); c.stroke();
      }
      c.globalAlpha = 1;
    }
    const big = fx === 'meteor' ? 3.4 : fx === 'phoenix' ? 2.6 : 2.2;
    const rg = c.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 6 * big);
    rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.15, E.light); rg.addColorStop(0.45, E.color); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.globalAlpha = 0.85 + Math.sin(t * 60) * 0.15;
    c.beginPath(); c.arc(s.x, s.y, r * 6 * big, 0, 7); c.fill();
    c.globalAlpha = 1;
    if (fx === 'phoenix') {
      // 炎の翼
      const flap = Math.sin(t * 18) * 0.5;
      for (const side of [-1, 1]) {
        const wg = c.createLinearGradient(s.x, s.y, s.x + side * s.k * 2.6, s.y - s.k * 1.5);
        wg.addColorStop(0, '#fff3b0'); wg.addColorStop(0.5, '#ff7a1a'); wg.addColorStop(1, 'rgba(255,40,0,0)');
        c.fillStyle = wg;
        c.beginPath();
        c.moveTo(s.x, s.y);
        c.quadraticCurveTo(s.x + side * s.k * 1.4, s.y - s.k * (1.8 + flap), s.x + side * s.k * 3.0, s.y - s.k * (1.0 + flap));
        c.quadraticCurveTo(s.x + side * s.k * 1.6, s.y - s.k * 0.4, s.x + side * s.k * 0.3, s.y + s.k * 0.2);
        c.fill();
      }
    }
    if (fx === 'wind') {
      c.strokeStyle = E.light; c.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        c.beginPath(); c.ellipse(s.x, s.y, s.k * (0.6 + i * 0.35), s.k * (0.25 + i * 0.12), t * 12 + i, 0, 5); c.stroke();
      }
    }
    c.globalCompositeOperation = 'source-over';
    // 本体
    if (fx === 'meteor') {
      c.fillStyle = '#3a2412'; c.beginPath(); c.arc(s.x, s.y, r * 2.4, 0, 7); c.fill();
      c.strokeStyle = '#ff8a1d'; c.lineWidth = 2; c.stroke();
    } else {
      c.fillStyle = '#fff'; c.beginPath(); c.arc(s.x, s.y, r * 1.15, 0, 7); c.fill();
    }
  },

  draw(c) {
    for (const o of this.list) {
      const u = o.t / o.life;
      if (o.type === 'text') continue;
      const s = P(o.x, o.y, o.z); if (!s) continue;
      switch (o.type) {
        case 'glow': {
          c.globalCompositeOperation = 'lighter';
          const r = Math.max(1, o.size * s.k * (1 - u * 0.5));
          c.globalAlpha = (1 - u) * 0.6;
          c.fillStyle = u < 0.2 ? o.c1 : o.c2;
          c.beginPath(); c.arc(s.x, s.y, r, 0, 7); c.fill();
          break;
        }
        case 'spark': {
          c.globalCompositeOperation = 'lighter';
          const e = P(o.x - o.vx * 0.03, o.y - o.vy * 0.03, o.z - o.vz * 0.03); if (!e) break;
          c.globalAlpha = 1 - u; c.strokeStyle = o.color; c.lineWidth = 2;
          c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(e.x, e.y); c.stroke();
          break;
        }
        case 'rock': {
          c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, (1 - u) * 3);
          const r = o.size * s.k;
          c.save(); c.translate(s.x, s.y); c.rotate(o.rot + o.t * 5);
          c.fillStyle = '#6b4320'; c.fillRect(-r, -r, r * 2, r * 1.6);
          c.fillStyle = '#a06a35'; c.fillRect(-r, -r, r * 1.2, r * 0.7);
          c.restore();
          break;
        }
        case 'ring': {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - u;
          const r = o.size * (0.3 + u) * s.k;
          c.strokeStyle = o.color; c.lineWidth = 3 * (1 - u) + 1;
          c.beginPath(); c.ellipse(s.x, s.y, r, r * 0.35, 0, 0, 7); c.stroke();
          break;
        }
        case 'bolt': {
          c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - u;
          const top = P(o.x + Math.sin(o.seed) * 4, o.y + 3, o.z + 28);
          if (!top) break;
          const pts = [[top.x, top.y]];
          const segs = 9;
          for (let i = 1; i < segs; i++) {
            const k = i / segs;
            pts.push([top.x + (s.x - top.x) * k + (Math.random() - 0.5) * 30, top.y + (s.y - top.y) * k]);
          }
          pts.push([s.x, s.y]);
          for (const [w, col] of [[9, 'rgba(255,220,60,0.5)'], [3, '#fff']]) {
            c.strokeStyle = col; c.lineWidth = w;
            c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const q of pts) c.lineTo(q[0], q[1]); c.stroke();
          }
          break;
        }
        case 'ghost': {
          c.globalCompositeOperation = 'lighter';
          const pose = Object.assign({}, o.pose, { tint: o.color, alpha: (1 - u) * 0.6 });
          drawFigure(c, s.x, s.y, s.k, o.look, pose);
          break;
        }
        case 'shield': this.drawShield(c, o, s, u); break;
        case 'confetti': {
          c.globalCompositeOperation = 'source-over'; c.globalAlpha = Math.min(1, (1 - u) * 3);
          c.save(); c.translate(s.x, s.y); c.rotate(o.rot + o.t * 6);
          c.fillStyle = o.color; c.fillRect(-0.1 * s.k, -0.05 * s.k * Math.abs(Math.sin(o.t * 8)), 0.2 * s.k, 0.1 * s.k);
          c.restore();
          o.vx += Math.sin(o.t * 3 + o.rot) * 0.05;
          break;
        }
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },
  drawShield(c, o, s, u) {
    const E = ELEM[o.elem];
    const appear = Math.min(1, o.t / 0.15), fade = u > 0.8 ? (1 - u) / 0.2 : 1;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = appear * fade;
    if (o.kind === 'pillar') {
      // 地面からせり上がる岩の柱
      const h = 3.2 * Math.min(1, o.t / 0.2);
      for (const dy of [-1.4, 0, 1.4]) {
        const a = P(o.x, o.y + dy, 0), b2 = P(o.x, o.y + dy, h * (dy === 0 ? 1.15 : 0.85)); if (!a || !b2) continue;
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#7a4d22'; c.fillRect(a.x - 0.5 * a.k, b2.y, 1.0 * a.k, a.y - b2.y);
        c.fillStyle = '#b07a3d'; c.fillRect(a.x - 0.5 * a.k, b2.y, 0.35 * a.k, a.y - b2.y);
      }
    } else {
      // 光のバリア
      const R0 = (o.kind === 'keeper' ? 2.6 : 1.8) * s.k;
      const cy = s.y - (o.kind === 'keeper' ? 1.2 : 1.0) * s.k;
      const rg = c.createRadialGradient(s.x, cy, 0, s.x, cy, R0);
      rg.addColorStop(0, 'rgba(255,255,255,0.05)'); rg.addColorStop(0.7, E.color + '66'); rg.addColorStop(1, E.light);
      c.fillStyle = rg;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283 + Math.PI / 6; const px = s.x + Math.cos(a) * R0 * 0.75, py = cy + Math.sin(a) * R0; i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.fill();
      c.strokeStyle = E.light; c.lineWidth = 3; c.stroke();
      // 六角形の模様
      c.lineWidth = 1; c.strokeStyle = E.color;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(s.x - R0 * 0.7, cy + i * R0 * 0.3); c.lineTo(s.x + R0 * 0.7, cy + i * R0 * 0.3 + Math.sin(G.t * 10 + i) * 4); c.stroke(); }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },
  drawTexts(c) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const o of this.list) {
      if (o.type !== 'text') continue;
      const s = P(o.x, o.y, o.z); if (!s) continue;
      const u = o.t / o.life;
      c.globalAlpha = 1 - Math.max(0, u - 0.6) / 0.4;
      c.font = `${Math.round(16 + 8 * Math.max(0, 0.2 - o.t) * 5)}px ${TITLE_FONT}`;
      c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText(o.text, s.x, s.y);
      c.fillStyle = o.color; c.fillText(o.text, s.x, s.y);
    }
    c.globalAlpha = 1;
  },
};

// ===== メイン描画 =====
function render() {
  const c = R.ctx;
  if (!G.ball) { c.fillStyle = '#070b1f'; c.fillRect(0, 0, R.W, R.H); return; }
  setupCamera();
  drawStadium(c);
  drawPitch(c);
  drawGoal(c, G.cam.x < 0 ? 1 : -1);
  drawGoal(c, G.cam.x < 0 ? -1 : 1);
  drawPassGuide(c);
  // 影
  for (const p of G.players) drawShadow(c, p.x, p.y, p.state === 'down' || p.state === 'dive' ? 0.9 : 0.42);
  const b = G.ball;
  drawShadow(c, b.x, b.y, b.special ? 0.5 : 0.2);
  // 奥から順に描く
  const ents = G.players.slice();
  ents.push(b);
  ents.sort((a, q) => q.y - a.y);
  for (const e of ents) {
    if (e === b) drawBall(c, b); else drawPlayer(c, e);
  }
  FX.draw(c);
  drawCursor(c);
  FX.drawTexts(c);
  if (G.demo) return;
  drawHUD(c);
  if (G.freeze) {
    if (G.freeze.type === 'cutin') drawCutin(c, G.freeze);
    else if (G.freeze.type === 'clash') drawClash(c, G.freeze);
  }
  if (G.flash > 0) {
    c.globalAlpha = Math.min(1, G.flash) * 0.7; c.fillStyle = G.flashColor || '#fff';
    c.fillRect(0, 0, R.W, R.H); c.globalAlpha = 1;
  }
  drawBanner(c);
  if (G.timeScale < 0.5 && !G.freeze) {
    // スローモーション中の演出
    c.fillStyle = 'rgba(20,0,40,0.25)'; c.fillRect(0, 0, R.W, R.H);
  }
}

// パスの軌道ガイド（自分がボールを持っている間ずっと表示）
function drawPassGuide(c) {
  if (G.auto || G.demo || G.freeze) return;
  const p = G.ctrl, b = G.ball;
  // パス中は残りの軌道と到達点を表示
  if (G.pass && G.pass.user && !b.owner && G.pass.receiver) {
    const e = P(G.pass.tx, G.pass.ty, 0);
    if (e) { c.strokeStyle = 'rgba(255,225,77,0.8)'; c.lineWidth = 2; c.beginPath(); c.ellipse(e.x, e.y, 0.9 * e.k, 0.3 * e.k, 0, 0, 7); c.stroke(); }
    return;
  }
  if (!p || b.owner !== p || (G.phase !== 'play' && G.phase !== 'kickoff')) return;
  const ch = Input.charge;
  const fly = ch ? ch.fly : false, power = passPower();
  const pl = planUserPass(p, fly, power);
  const sx = p.x + pl.dx * 0.55, sy = p.y + pl.dy * 0.55;
  const a = ch ? 0.95 : 0.5;
  c.save();
  c.lineCap = 'round';
  if (fly) {
    // 放物線と地面の影
    c.setLineDash([2, 6]); c.strokeStyle = `rgba(255,255,255,${a * 0.5})`; c.lineWidth = 2;
    polyW(c, [[sx, sy, 0], [pl.ex, pl.ey, 0]]); c.stroke();
    c.setLineDash([]);
    c.beginPath(); let first = true;
    for (let i = 0; i <= 24; i++) {
      const u = i / 24, t = u * pl.T, z = 4.9 * pl.T * t - 4.9 * t * t;
      const q = P(sx + pl.dx * pl.d * u, sy + pl.dy * pl.d * u, z); if (!q) continue;
      if (first) { c.moveTo(q.x, q.y); first = false; } else c.lineTo(q.x, q.y);
    }
    c.strokeStyle = `rgba(120,220,255,${a})`; c.lineWidth = 3; c.stroke();
  } else {
    c.strokeStyle = `rgba(255,225,77,${a})`; c.lineWidth = 3;
    polyW(c, [[sx, sy, 0.05], [pl.ex, pl.ey, 0.05]]); c.stroke();
    // 矢印
    const e = P(pl.ex, pl.ey, 0.05), m = P(pl.ex - pl.dx * 1.2 - pl.dy * 0.6, pl.ey - pl.dy * 1.2 + pl.dx * 0.6, 0.05), n = P(pl.ex - pl.dx * 1.2 + pl.dy * 0.6, pl.ey - pl.dy * 1.2 - pl.dx * 0.6, 0.05);
    if (e && m && n) { c.fillStyle = `rgba(255,225,77,${a})`; c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(m.x, m.y); c.lineTo(n.x, n.y); c.closePath(); c.fill(); }
  }
  // 到達点と受け手
  const e = P(pl.ex, pl.ey, 0);
  if (e) { c.strokeStyle = fly ? `rgba(120,220,255,${a})` : `rgba(255,225,77,${a})`; c.lineWidth = 2; c.beginPath(); c.ellipse(e.x, e.y, 1.0 * e.k, 0.33 * e.k, 0, 0, 7); c.stroke(); }
  if (pl.recv) {
    const r = P(pl.recv.x, pl.recv.y, 0);
    if (r) { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2; c.beginPath(); c.ellipse(r.x, r.y, 0.7 * r.k, 0.24 * r.k, 0, 0, 7); c.stroke(); }
  }
  // 強さゲージ（押している間）
  if (ch) {
    const f = P(p.x, p.y, 0);
    if (f) {
      const w = 54, h = 7, x = f.x - w / 2, y = f.y + 22;
      c.fillStyle = 'rgba(0,0,0,0.7)'; c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.fillStyle = fly ? '#78dcff' : '#ffe14d'; c.fillRect(x, y, w * Math.max(0.04, power), h);
    }
  }
  c.restore();
}

function drawCursor(c) {
  if (G.auto || !G.ctrl || G.phase === 'title') return;
  const p = G.ctrl;
  const s = P(p.x, p.y, p.z + 2.35); if (!s) return;
  const sz = Math.max(6, 0.28 * s.k);
  c.fillStyle = '#ffe14d'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
  const bob = Math.sin(G.t * 8) * 2;
  c.beginPath(); c.moveTo(s.x - sz, s.y - sz * 1.2 + bob); c.lineTo(s.x + sz, s.y - sz * 1.2 + bob); c.lineTo(s.x, s.y + bob); c.closePath(); c.fill(); c.stroke();
  const f = P(p.x, p.y - 0.4, 0); if (!f) return;
  c.font = `bold 11px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'top';
  c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeText(p.d.name, f.x, f.y + 4);
  c.fillStyle = '#fff'; c.fillText(p.d.name, f.x, f.y + 4);
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
}

function drawHUD(c) {
  const x = 10 + R.safeL, y = 8;
  const T0 = G.teams[0], T1 = G.teams[1];
  c.textBaseline = 'middle';
  // スコアボード
  rrect(c, x, y, 232, 28, 6); c.fillStyle = 'rgba(5,10,30,0.82)'; c.fill();
  c.fillStyle = T0.d.shirt; c.fillRect(x + 6, y + 7, 6, 14);
  c.fillStyle = T1.d.accent; c.fillRect(x + 128, y + 7, 6, 14);
  c.font = `bold 11px ${FONT}`; c.fillStyle = '#fff'; c.textAlign = 'left';
  c.fillText(T0.d.short, x + 16, y + 14);
  c.fillText(T1.d.short, x + 138, y + 14);
  c.font = `900 15px ${FONT}`; c.textAlign = 'center';
  c.fillText(`${T0.score} - ${T1.score}`, x + 95, y + 14);
  const min = Math.min(45, Math.floor(G.clock / G.halfLen * 45)) + (G.half - 1) * 45;
  const sec = Math.floor((G.clock / G.halfLen * 45 * 60) % 60);
  c.fillStyle = '#ffe14d'; c.font = `bold 12px ${FONT}`;
  c.fillText(`${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`, x + 205, y + 14);
  // 必殺ゲージ
  gauge(c, x, y + 33, T0, '#36a2ff');
  gauge(c, x + 120, y + 33, T1, '#c04dff');
}
function gauge(c, x, y, T, color) {
  const w = 112, h = 13;
  rrect(c, x, y, w, h, 4); c.fillStyle = 'rgba(5,10,30,0.8)'; c.fill();
  const v = T.gauge / 100;
  const ready = T.gauge >= 30;
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, color); g.addColorStop(1, ready ? '#ffe14d' : color);
  c.fillStyle = g;
  rrect(c, x + 2, y + 2, (w - 4) * v, h - 4, 3); c.fill();
  if (ready) { c.globalAlpha = 0.25 + 0.25 * Math.sin(G.t * 8); c.fillStyle = '#fff'; rrect(c, x + 2, y + 2, (w - 4) * v, h - 4, 3); c.fill(); c.globalAlpha = 1; }
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 1;
  for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + w * i / 4, y + 2); c.lineTo(x + w * i / 4, y + h - 2); c.stroke(); }
  c.font = `bold 9px ${FONT}`; c.fillStyle = '#fff'; c.textAlign = 'left';
  c.fillText(`必殺 ${Math.floor(T.gauge)}`, x + 4, y + h / 2 + 0.5);
}

function drawBanner(c) {
  const bn = G.banner; if (!bn) return;
  const t = bn.t, u = t / bn.dur;
  const pop = t < 0.15 ? 0.4 + easeOut(t / 0.15) * 0.8 : 1.2 - Math.min(0.2, (t - 0.15)) ;
  const alpha = u > 0.85 ? (1 - u) / 0.15 : 1;
  c.save();
  c.globalAlpha = alpha;
  c.translate(R.W / 2, R.H * 0.4); c.scale(pop, pop);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const size = bn.big ? Math.min(R.H * 0.22, R.W * 0.12) : Math.min(R.H * 0.11, R.W * 0.07);
  c.font = `${size}px ${TITLE_FONT}`;
  c.lineWidth = size * 0.14; c.strokeStyle = '#000'; c.lineJoin = 'round';
  c.strokeText(bn.text, 0, 0);
  const g = c.createLinearGradient(0, -size / 2, 0, size / 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, bn.color || '#ffe14d'); g.addColorStop(1, bn.color || '#ff8a00');
  c.fillStyle = g; c.fillText(bn.text, 0, 0);
  if (bn.sub) {
    c.font = `bold ${size * 0.3}px ${FONT}`;
    c.lineWidth = 4; c.strokeText(bn.sub, 0, size * 0.75);
    c.fillStyle = '#fff'; c.fillText(bn.sub, 0, size * 0.75);
  }
  c.restore();
}

// ===== カットイン =====
function drawCutin(c, f) {
  const W0 = R.W, H0 = R.H, t = f.t, dur = f.dur;
  const E = ELEM[f.sk.elem], T = TEAMS[f.p.team];
  const inT = Math.min(1, t / 0.2), out = Math.max(0, (t - (dur - 0.2)) / 0.2);
  c.save();
  c.fillStyle = `rgba(0,0,0,${0.62 * Math.min(1, t / 0.1) * (1 - out)})`; c.fillRect(0, 0, W0, H0);
  const cx = W0 * 0.5, cy = H0 * 0.48;
  // 集中線
  c.globalCompositeOperation = 'lighter';
  let seed = Math.floor(t * 24) * 7919;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  c.strokeStyle = E.color;
  for (let i = 0; i < 44; i++) {
    const a = rnd() * 6.283, r0 = H0 * (0.42 + rnd() * 0.25);
    c.globalAlpha = 0.25 + rnd() * 0.3; c.lineWidth = 1 + rnd() * 3;
    c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * W0, cy + Math.sin(a) * W0); c.stroke();
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  // 帯
  const bh = H0 * 0.38, by = cy - bh / 2;
  const off = (1 - easeOut(inT)) * W0 * 1.3 - easeIn(out) * W0 * 1.3;
  c.translate(off, 0);
  const g = c.createLinearGradient(0, 0, W0, 0);
  g.addColorStop(0, E.dark); g.addColorStop(0.45, E.color); g.addColorStop(1, E.dark);
  c.fillStyle = g;
  c.beginPath(); c.moveTo(-60, by + bh * 0.14); c.lineTo(W0 + 60, by - bh * 0.1); c.lineTo(W0 + 60, by + bh * 0.88); c.lineTo(-60, by + bh * 1.1); c.closePath(); c.fill();
  c.strokeStyle = E.light; c.lineWidth = 4;
  c.beginPath(); c.moveTo(-60, by + bh * 0.14); c.lineTo(W0 + 60, by - bh * 0.1); c.stroke();
  c.beginPath(); c.moveTo(-60, by + bh * 1.1); c.lineTo(W0 + 60, by + bh * 0.88); c.stroke();
  // 属性の大きな文字
  c.font = `${bh * 1.0}px ${TITLE_FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = 'rgba(255,255,255,0.13)'; c.fillText(E.name, W0 * 0.85, cy);
  // 選手
  const s = bh * 0.5;
  const pose = { run: t * 16, moving: f.sk.type !== 'keeper', flip: 1, kick: f.sk.type === 'shoot' ? Math.min(1, t * 1.6) : 0, arms: f.sk.type === 'keeper' || f.sk.type === 'block' ? 'up' : null };
  c.globalCompositeOperation = 'lighter';
  const ag = c.createRadialGradient(W0 * 0.17, by + bh * 0.55, 0, W0 * 0.17, by + bh * 0.55, bh * 0.75);
  ag.addColorStop(0, E.light); ag.addColorStop(0.5, E.color + '88'); ag.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = ag; c.fillRect(0, by - bh * 0.3, W0 * 0.4, bh * 1.6);
  c.globalCompositeOperation = 'source-over';
  drawFigure(c, W0 * 0.17, by + bh * 1.02, s, lookOf(f.p), pose);
  if (f.partner) drawFigure(c, W0 * 0.07, by + bh * 1.05, s * 0.85, lookOf(f.partner), Object.assign({}, pose, { kick: 0 }));
  // 技名
  const pop = 1 + Math.max(0, 0.28 - t) * 3;
  let size = bh * 0.27;
  c.font = `${size}px ${TITLE_FONT}`;
  const tw = c.measureText(f.sk.name).width;
  if (tw > W0 * 0.6) { size *= W0 * 0.6 / tw; c.font = `${size}px ${TITLE_FONT}`; }
  c.save(); c.translate(W0 * 0.6, cy + bh * 0.04); c.scale(pop, pop);
  c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = '#000'; c.strokeText(f.sk.name, 0, 0);
  const tg = c.createLinearGradient(0, -size / 2, 0, size / 2);
  tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.55, E.light); tg.addColorStop(1, E.color);
  c.fillStyle = tg; c.fillText(f.sk.name, 0, 0);
  c.restore();
  c.font = `bold ${Math.round(bh * 0.09)}px ${FONT}`; c.fillStyle = '#fff';
  c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,0.7)';
  const who = `${T.short}  ${f.p.d.n}  ${f.p.d.name}` + (f.partner ? ` ＆ ${f.partner.d.name}` : '');
  c.strokeText(who, W0 * 0.6, by + bh * 0.16); c.fillText(who, W0 * 0.6, by + bh * 0.16);
  const info = `${E.name}属性 ・ ${SKILL_TYPE_NAME[f.sk.type]}技` + (f.sk.power ? ` ・ 威力 ${f.sk.power}` : '');
  c.strokeText(info, W0 * 0.6, by + bh * 0.82); c.fillText(info, W0 * 0.6, by + bh * 0.82);
  c.restore();
}

// ===== シュート vs キーパー のぶつかり合い =====
function drawClash(c, f) {
  const W0 = R.W, H0 = R.H, t = f.t;
  const E1 = ELEM[f.s.sk.elem], E2 = f.ksk ? ELEM[f.ksk.elem] : { color: '#9fb4ff', light: '#ffffff', dark: '#1d2b66' };
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(0, 0, W0, H0);
  // 攻撃側を左、キーパーを右に描く
  let m = 0.5 + Math.sin(t * 31) * 0.012 + Math.sin(t * 7) * 0.035;
  if (t > 1.2) { const k = easeIn(Math.min(1, (t - 1.2) / 0.5)); m += (f.win ? 1 : -1) * k * 0.55; }
  const mx = W0 * m, cy = H0 * 0.56, bh = H0 * 0.16;
  c.globalCompositeOperation = 'lighter';
  const beam = (x0, x1, E, dir) => {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(dir > 0 ? 0 : 1, 'rgba(0,0,0,0)'); g.addColorStop(dir > 0 ? 1 : 0, E.color);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x0, cy - bh * 0.3);
    const n = 14;
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; c.lineTo(x, cy - bh * (0.3 + 0.7 * (dir > 0 ? i / n : 1 - i / n)) - Math.random() * 10); }
    for (let i = n; i >= 0; i--) { const x = x0 + (x1 - x0) * i / n; c.lineTo(x, cy + bh * (0.3 + 0.7 * (dir > 0 ? i / n : 1 - i / n)) + Math.random() * 10); }
    c.closePath(); c.fill();
    c.fillStyle = E.light; c.globalAlpha = 0.7;
    c.fillRect(Math.min(x0, x1), cy - 3, Math.abs(x1 - x0), 6);
    c.globalAlpha = 1;
  };
  beam(0, mx, E1, 1); beam(W0, mx, E2, -1);
  const rg = c.createRadialGradient(mx, cy, 0, mx, cy, bh * 2.2);
  rg.addColorStop(0, '#fff'); rg.addColorStop(0.3, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = rg; c.beginPath(); c.arc(mx, cy, bh * 2.2, 0, 7); c.fill();
  c.strokeStyle = '#fff'; c.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * 6.283, r = bh * (0.6 + Math.random() * 1.6);
    c.beginPath(); c.moveTo(mx, cy); c.lineTo(mx + Math.cos(a) * r, cy + Math.sin(a) * r); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  // 数値
  const lab = (x, align, name, val, E) => {
    c.textAlign = align; c.textBaseline = 'middle';
    c.font = `bold ${Math.round(H0 * 0.045)}px ${FONT}`; c.lineWidth = 4; c.strokeStyle = '#000';
    c.strokeText(name, x, H0 * 0.2); c.fillStyle = '#fff'; c.fillText(name, x, H0 * 0.2);
    const shown = Math.round(val * Math.min(1, t / 0.6));
    c.font = `${Math.round(H0 * 0.13)}px ${TITLE_FONT}`; c.lineWidth = 8;
    c.strokeText(shown, x, H0 * 0.32); c.fillStyle = E.light; c.fillText(shown, x, H0 * 0.32);
  };
  lab(W0 * 0.06 + R.safeL, 'left', f.s.sk.name, f.sp, E1);
  lab(W0 * 0.94 - R.safeR, 'right', f.ksk ? f.ksk.name : 'キャッチ', f.kp, E2);
  c.textAlign = 'center';
  c.font = `${Math.round(H0 * 0.08)}px ${TITLE_FONT}`; c.lineWidth = 6; c.strokeStyle = '#000';
  c.strokeText('VS', W0 / 2, H0 * 0.3); c.fillStyle = '#ffe14d'; c.fillText('VS', W0 / 2, H0 * 0.3);
  if (t > 1.55) {
    const txt = f.win ? '突破！！' : 'ストップ！！';
    const sz = Math.round(H0 * 0.15);
    c.font = `${sz}px ${TITLE_FONT}`; c.lineWidth = 10;
    c.strokeText(txt, W0 / 2, H0 * 0.82); c.fillStyle = f.win ? E1.light : E2.light; c.fillText(txt, W0 / 2, H0 * 0.82);
  }
  c.restore();
}
