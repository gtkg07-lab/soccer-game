'use strict';
// ===== 試合の進行・物理・AI・必殺技 =====
const L = PITCH.L, W = PITCH.W;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rnd = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const G = {
  phase: 'title', phaseT: 0, t: 0, clock: 0, half: 1, halfLen: 180, diff: 1,
  teams: [], players: [], ball: null, ctrl: null, auto: false, cpuOnly: false,
  timeScale: 1, freeze: null, paused: false,
  cam: { x: 0, y: 0, zoom: 1 }, shake: 0, flash: 0, flashColor: '#fff', banner: null,
  pass: null, shotPlan: null, restart: null, protectT: 0, switchT: 0, possTeam: 0,
  lastKicker: null, scorer: null, kickoffTeam: 0, resultShown: false,
};
const Input = { jx: 0, jy: 0, dash: false, actions: [], charge: null };

const teamOf = p => G.teams[p.team];
const userControls = p => !G.auto && p.team === 0 && p === G.ctrl;
function addGauge(T, v) { T.gauge = clamp(T.gauge + v, 0, 100); }
function banner(text, sub, color, dur, big) { G.banner = { text, sub, color, dur: dur || 1.4, t: 0, big }; }
function nearestOppDist(p) { let m = 99; for (const q of G.teams[1 - p.team].players) { const d = dist(p, q); if (d < m) m = d; } return m; }

// ===== 試合開始 =====
function newMatch(opt) {
  G.halfLen = opt.halfLen; G.diff = opt.diff; G.auto = !!opt.auto; G.cpuOnly = !!opt.cpuOnly;
  G.teams = TEAMS.map((d, i) => ({ id: i, d, side: i === 0 ? 1 : -1, gauge: 30, score: 0, players: [], near: [] }));
  G.players = [];
  for (const T of G.teams) {
    T.d.players.forEach((pd, idx) => {
      const p = { id: G.players.length, team: T.id, d: pd, idx, gk: idx === 0, home: FORMATION[idx],
        x: 0, y: 0, z: 0, vz: 0, vx: 0, vy: 0, dvx: 0, dvy: 0, fx: T.side, fy: 0,
        state: 'run', st: 0, kickCd: 0, kickAnim: 0, run: Math.random() * 6, decide: 0, holdT: 0, waitT: 0, gkHold: 0,
        dashDx: 0, dashDy: 0, dashTarget: null, dashSk: null, mustPass: false };
      T.players.push(p); G.players.push(p);
    });
  }
  G.ball = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null, special: null, spin: 0, trail: [] };
  G.half = 1; G.clock = 0; G.t = 0; G.freeze = null; G.timeScale = 1; G.paused = false; G.resultShown = false;
  G.cam = { x: 0, y: 0, zoom: 1 };
  FX.clear();
  setupKickoff(0);
}

function setupKickoff(ti) {
  const b = G.ball;
  for (const p of G.players) {
    const s = teamOf(p).side;
    let x = p.home.x * L * 0.9, y = p.home.y * W * 0.85;
    x = Math.min(x, -1.5);
    if (p.team !== ti) x = Math.min(x, -10);
    Object.assign(p, { x: x * s, y, vx: 0, vy: 0, dvx: 0, dvy: 0, z: 0, vz: 0, state: 'run', st: 0, fx: s, fy: 0, kickCd: 0, gkHold: 0, waitT: 0, mustPass: false });
  }
  const T = G.teams[ti];
  const k = T.players[9], k2 = T.players[10];
  k.x = -T.side * 0.4; k.y = 0; k2.x = -T.side * 1.0; k2.y = 7;
  Object.assign(b, { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null, special: null, lastTouch: null });
  b.trail.length = 0;
  giveBall(k, true);
  k.waitT = 0.3;
  G.pass = null; G.shotPlan = null; G.protectT = 0; G.possTeam = ti;
  G.phase = 'kickoff'; G.phaseT = 0;
  G.ctrl = ti === 0 ? k : G.teams[0].players[9];
  Input.actions.length = 0;
  banner(G.half === 1 ? 'KICK OFF' : '後半 KICK OFF', null, '#ffe14d', 1.3);
  Sfx.whistle(1);
}

// ===== ボールの受け渡し =====
function giveBall(p, quiet) {
  const b = G.ball, prev = b.lastTouch, T = teamOf(p);
  if (!quiet) {
    if (prev === p.team && G.pass && G.pass.team === p.team) addGauge(T, 3);
    else if (prev != null && prev !== p.team) addGauge(T, 5);
  }
  b.owner = p; b.special = null; b.lastTouch = p.team; b.trail.length = 0;
  G.pass = null; G.shotPlan = null; G.possTeam = p.team;
  p.holdT = 0; p.decide = 0.15 + Math.random() * 0.3;
  if (p.team === 0 && !G.auto) G.ctrl = p;
}
function releaseBall(p) {
  const b = G.ball;
  b.owner = null; b.special = null;
  b.x = p.x + p.fx * 0.55; b.y = p.y + p.fy * 0.55; b.z = 0.12;
  b.lastTouch = p.team; p.kickCd = 0.4; p.kickAnim = 0.3; p.mustPass = false;
  G.lastKicker = p; G.shotPlan = null; G.pass = null;
}
function kick(p, vx, vy, vz) {
  releaseBall(p);
  const b = G.ball; b.vx = vx; b.vy = vy; b.vz = vz;
  Sfx.kick(Math.hypot(vx, vy));
}

// ===== パス =====
function laneBlock(ax, ay, bx, by, oppTeam) {
  let c = 0; const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  for (const q of G.teams[oppTeam].players) {
    const u = ((q.x - ax) * dx + (q.y - ay) * dy) / l2;
    if (u < 0.08 || u > 0.95) continue;
    const d = Math.hypot(q.x - (ax + dx * u), q.y - (ay + dy * u));
    if (d < 1.0 + u * 1.8) c++;
  }
  return c;
}
// スティック方向にいる味方を選ぶ
function pickPassTarget(p, dx, dy) {
  const hasDir = Math.hypot(dx, dy) > 0.3;
  let nx = p.fx, ny = p.fy;
  if (hasDir) { const l = Math.hypot(dx, dy); nx = dx / l; ny = dy / l; }
  let best = null, bs = -1e9;
  for (const t of teamOf(p).players) {
    if (t === p) continue;
    const rx = t.x - p.x, ry = t.y - p.y, d = Math.hypot(rx, ry);
    if (d < 3 || d > 60) continue;
    const cos = (rx * nx + ry * ny) / d;
    const sc = cos * 4 - d * 0.035 - laneBlock(p.x, p.y, t.x, t.y, 1 - p.team) * 0.6 + (t.gk ? -3 : 0);
    if (sc > bs) { bs = sc; best = t; }
  }
  return best;
}
function bestPassOption(p) {
  const s = teamOf(p).side;
  let best = null, bs = -1e9;
  for (const t of teamOf(p).players) {
    if (t === p || t.gk || t.state === 'down') continue;
    const d = dist(p, t); if (d < 5 || d > 45) continue;
    const gain = (t.x - p.x) * s;
    const open = Math.min(8, nearestOppDist(t));
    const lane = laneBlock(p.x, p.y, t.x, t.y, 1 - p.team);
    const sc = gain * 0.12 + open * 0.45 - lane * 2.5 - Math.max(0, d - 30) * 0.15;
    if (sc > bs) { bs = sc; best = t; }
  }
  return best ? { t: best, score: bs } : null;
}
function doPass(p, t, forceLob) {
  const d0 = dist(p, t), lead = 0.25 + d0 / 30;
  const tx = clamp(t.x + t.vx * lead, -L + 1, L - 1), ty = clamp(t.y + t.vy * lead, -W + 1, W - 1);
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
  const acc = p.team === 1 ? DIFF[G.diff].pass : 1;
  const err = (Math.random() - 0.5) * 0.07 / acc;
  const ca = Math.cos(err), sa = Math.sin(err);
  const ux = (dx * ca - dy * sa) / d, uy = (dx * sa + dy * ca) / d;
  const lob = forceLob || d > 30 || (d > 14 && laneBlock(p.x, p.y, tx, ty, 1 - p.team) > 0);
  if (lob) { const T = 0.75 + d / 26; kick(p, ux * d / T, uy * d / T, 4.9 * T); }
  else { const v0 = Math.min(34, 0.9 * d + 7); kick(p, ux * v0, uy * v0, 0); }
  G.pass = { team: p.team, receiver: t, tx, ty, until: G.t + 3.5 };
  if (p.team === 0 && !G.auto) G.ctrl = t;
}

// ===== ユーザーのパス（イーフト式：パス＝グラウンダー、フライパス＝浮き球。押す長さで強さ） =====
function passPower() {
  const ch = Input.charge; if (!ch) return 0;
  return clamp((performance.now() - ch.t0) / 450, 0, 1);
}
// スローインで投げようとしているか
const isThrowing = p => !!(p && p.mustPass && G.ball.owner === p && G.restart && G.restart.type === 'throw');
const THROW_Z = 2.05;
// 投げる球の滞空時間と上向きの速さ（頭の上から投げて、目標地点に落ちる）
function throwParams(d, high) {
  const T = high ? 0.85 + d / 24 : 0.45 + d / 34;
  return { T, vz: (4.9 * T * T - THROW_Z) / T };
}
function throwBall(p, dx, dy, d, high) {
  const { T, vz } = throwParams(d, high);
  p.fx = dx; p.fy = dy;
  kick(p, dx * d / T, dy * d / T, vz);
  const b = G.ball; b.x = p.x + dx * 0.3; b.y = p.y + dy * 0.3; b.z = THROW_Z;
  p.kickAnim = 0; p.throwAnim = 0.35;
  // 低い位置を通るところにいる相手だけが触れられる
  const blockers = [];
  for (const q of G.teams[1 - p.team].players) {
    for (let i = 0; i <= 20; i++) {
      const u = i / 20, t = u * T, z = THROW_Z + vz * t - 4.9 * t * t;
      if (z > 2.3) continue;
      if (Math.hypot(q.x - (b.x + dx * d * u), q.y - (b.y + dy * d * u)) < 1.6) { blockers.push(q); break; }
    }
  }
  return blockers;
}
// スティックの方向に飛ぶ軌道を決める（表示と実際のキックで同じ計算を使う）
function planUserPass(p, fly, power) {
  let nx = Input.jx, ny = Input.jy, l = Math.hypot(nx, ny);
  if (l < 0.3) { nx = p.fx; ny = p.fy; l = Math.hypot(nx, ny) || 1; }
  nx /= l; ny /= l;
  const thr = isThrowing(p);
  const want = thr ? (fly ? 12 + power * 14 : 5 + power * 12) : fly ? 15 + power * 35 : 7 + power * 30;
  let best = null, bs = 1e9;
  for (const t of teamOf(p).players) {
    if (t === p || t.state === 'down') continue;
    const tx = t.x + t.vx * 0.4, ty = t.y + t.vy * 0.4;
    const rx = tx - p.x, ry = ty - p.y, d = Math.hypot(rx, ry);
    if (d < 3) continue;
    const along = rx * nx + ry * ny;
    if (along < 2 || along / d < 0.8) continue;
    const perp = Math.abs(rx * ny - ry * nx);
    const sc = perp * 1.5 + Math.abs(along - want) * 0.35 + (t.gk ? 25 : 0);
    if (sc < bs) { bs = sc; best = { t, tx, ty, along, perp, d }; }
  }
  let dx = nx, dy = ny, d, recv = null;
  if (best) {
    recv = best.t;
    // 狙いが味方にほぼ向いていれば、その味方の足元へ吸いつける
    if (Math.atan2(best.perp, best.along) < 0.22) { dx = (best.tx - p.x) / best.d; dy = (best.ty - p.y) / best.d; d = best.d; }
    else d = best.along;
  } else d = want;
  // ピッチの外に出ないように距離を詰める
  let tmax = 60;
  if (dx > 1e-3) tmax = Math.min(tmax, (L - 0.6 - p.x) / dx); else if (dx < -1e-3) tmax = Math.min(tmax, (-L + 0.6 - p.x) / dx);
  if (dy > 1e-3) tmax = Math.min(tmax, (W - 0.6 - p.y) / dy); else if (dy < -1e-3) tmax = Math.min(tmax, (-W + 0.6 - p.y) / dy);
  d = clamp(Math.min(d, tmax - (fly || thr ? 5 : 2)), 3, thr ? 26 : 55);
  const ex = p.x + dx * d, ey = p.y + dy * d;
  if (!recv) {
    let bd = 1e9;
    for (const t of teamOf(p).players) { if (t === p || t.gk) continue; const q = Math.hypot(t.x - ex, t.y - ey); if (q < bd) { bd = q; recv = t; } }
  }
  const tp = thr ? throwParams(d, fly) : null;
  const T = thr ? tp.T : fly ? 0.8 + d / 26 : 0;
  return { dx, dy, d, ex, ey, recv, fly, T, thr, vz: thr ? tp.vz : 4.9 * T, z0: thr ? THROW_Z : 0, room: Math.max(0.5, tmax - d) };
}
function doUserPass(p, fly, power) {
  const pl = planUserPass(p, fly, power);
  p.fx = pl.dx; p.fy = pl.dy;
  const sx = p.x + pl.dx * 0.55, sy = p.y + pl.dy * 0.55;
  const opp = G.teams[1 - p.team].players;
  let blockers = [];
  if (pl.thr) {
    blockers = throwBall(p, pl.dx, pl.dy, pl.d, fly);
    G.pass = { team: p.team, receiver: pl.recv, tx: pl.ex, ty: pl.ey, dx: pl.dx, dy: pl.dy, until: G.t + 6, user: true, fly: true, blockers };
    if (pl.recv && p.team === 0 && !G.auto) G.ctrl = pl.recv;
    return;
  } else if (fly) {
    const T = pl.T, vh = pl.d / T;
    kick(p, pl.dx * vh, pl.dy * vh, 4.9 * T);
    // 低い位置（離れ際と落下点）でだけ相手が触れられる
    for (const q of opp) {
      for (let i = 0; i <= 20; i++) {
        const u = i / 20, t = u * T, z = 4.9 * T * t - 4.9 * t * t;
        if (z > 2.3) continue;
        if (Math.hypot(q.x - (sx + pl.dx * pl.d * u), q.y - (sy + pl.dy * pl.d * u)) < 1.6) { blockers.push(q); break; }
      }
    }
  } else {
    // 受け手が間に合う速さにする
    const r = pl.recv;
    const tr = r ? Math.hypot(r.x - pl.ex, r.y - pl.ey) / (8.2 * r.d.spd) + 0.25 : 0;
    let varr = 7;
    for (; varr > 1.6; varr -= 0.4) { const v0 = 0.9 * pl.d + varr; if (Math.log(v0 / varr) / 0.9 >= tr) break; }
    varr = Math.max(0.8, Math.min(varr, pl.room * 0.9));
    const v0 = Math.min(40, 0.9 * pl.d + varr);
    kick(p, pl.dx * v0, pl.dy * v0, 0);
    // 軌道の線上（＋止まるまでの少し先）にいる相手だけが奪える
    const len = pl.d + varr / 0.9;
    for (const q of opp) {
      const u = (q.x - sx) * pl.dx + (q.y - sy) * pl.dy;
      if (u < -0.5 || u > len + 0.5) continue;
      if (Math.abs((q.x - sx) * pl.dy - (q.y - sy) * pl.dx) < 1.3) blockers.push(q);
    }
  }
  const b = G.ball; b.x = sx; b.y = sy;
  if (!fly) b.z = 0;
  G.pass = { team: p.team, receiver: pl.recv, tx: pl.ex, ty: pl.ey, dx: pl.dx, dy: pl.dy, until: G.t + 6, user: true, fly, blockers };
  if (pl.recv && p.team === 0 && !G.auto) G.ctrl = pl.recv;
}
// 受け手は軌道上の落下点・到達点へ走り、ボールが来たら取りにいく
function receiveMove(p) {
  const b = G.ball, ps = G.pass;
  const db = Math.hypot(b.x - p.x, b.y - p.y);
  let passed = false;
  if (ps.dx != null) passed = (b.x - ps.tx) * ps.dx + (b.y - ps.ty) * ps.dy > -0.5;
  if (db < 6 || passed) moveTo(p, b.x + b.vx * 0.12, b.y + b.vy * 0.12, 1.3);
  else moveTo(p, ps.tx, ps.ty, 1.3);
}

// ===== 通常シュート =====
function doShoot(p, aimY) {
  const T = teamOf(p), gx = T.side * L;
  let ty = aimY != null ? aimY * 3.0 : (Math.random() < 0.5 ? -1 : 1) * rnd(1.2, 3.0);
  const d0 = Math.hypot(gx - p.x, ty - p.y);
  const err = (0.03 + d0 * 0.0028) / p.d.shot;
  ty += (Math.random() + Math.random() - 1) * err * d0;
  const tz = rnd(0.25, 1.9) + (d0 > 25 ? 0.3 : 0);
  const spd = rnd(24, 29) * p.d.shot;
  const dx = gx - p.x, dy = ty - p.y, dh = Math.hypot(dx, dy), Tt = dh / spd;
  const vz = (tz - 0.12 + 4.9 * Tt * Tt) / Tt;
  kick(p, dx / dh * spd, dy / dh * spd, vz);
  planSave(p, gx, ty, tz, Tt, spd);
  addGauge(T, 2);
}
// キーパーが止められるかを先に決めておく
function planSave(p, gx, ty, tz, Tt, spd) {
  const K = G.teams[1 - p.team].players[0];
  const onTarget = Math.abs(ty) < PITCH.goalW - 0.1 && tz < PITCH.goalH;
  const frac = clamp(Math.abs(K.x - p.x) / Math.max(1, Math.abs(gx - p.x)), 0, 1);
  const tK = Tt * frac;
  const yAtK = p.y + (ty - p.y) * frac;
  const vz0 = (tz - 0.12 + 4.9 * Tt * Tt) / Tt;
  const zAtK = 0.12 + vz0 * tK - 4.9 * tK * tK;
  const dLat = Math.abs(yAtK - K.y);
  const reach = 0.9 + Math.min(2.9, 5.2 * Math.max(0, tK - 0.12));
  const rating = K.team === 1 ? DIFF[G.diff].gk : 0.74;
  let pr = dLat > reach ? 0.02 : rating * clamp(1.08 - Math.pow(dLat / reach, 2) * 0.75, 0, 1);
  pr -= (spd - 25) * 0.012; if (zAtK > 2.0) pr -= 0.1;
  const saved = onTarget ? Math.random() < pr : (dLat < 1.0 && Math.random() < 0.5);
  G.shotPlan = { K, saved, catchIt: saved && dLat < 1.3 && spd < 27 && zAtK < 1.9, y: yAtK, z: zAtK,
    tDive: G.t + Math.max(0, tK - 0.42), dived: false, team: p.team };
}

// ===== 必殺技 =====
function comboPartner(p) {
  if (!p.d.partner) return null;
  const q = teamOf(p).players.find(q => q.d.n === p.d.partner);
  return q && dist(p, q) < 24 && q.state !== 'down' ? q : null;
}
// 今この選手が使える技の一覧（メニュー用）
function skillOptions(p) {
  const T = teamOf(p), b = G.ball, res = [];
  if (b.owner === p && p.mustPass) return res;
  const hasBall = b.owner === p;
  for (const k of p.d.skills) {
    const sk = SKILLS[k];
    let ok = T.gauge >= sk.cost, why = ok ? '' : 'ゲージ不足';
    if (sk.type === 'shoot') {
      if (!hasBall) continue;
      if (Math.abs(T.side * L - p.x) > 40) { ok = false; why = 'ゴールが遠い'; }
      if (sk.combo && !comboPartner(p)) { ok = false; why = '相方が遠い'; }
    } else if (sk.type === 'dribble') {
      if (!hasBall) continue;
    } else if (sk.type === 'tackle') {
      if (hasBall) continue;
      const o = b.owner;
      if (!o || o.team === p.team || dist(o, p) > 8) { ok = false; why = '相手が遠い'; }
    } else continue;
    res.push({ sk, ok, why });
  }
  return res;
}
function useSkill(p, sk) {
  const T = teamOf(p), b = G.ball;
  if (T.gauge < sk.cost || G.freeze) return false;
  if (b.owner === p && p.mustPass) return false;
  if (sk.type === 'shoot') {
    if (b.owner !== p) return false;
    const partner = sk.combo ? comboPartner(p) : null;
    if (sk.combo && !partner) return false;
    addGauge(T, -sk.cost);
    startFreeze({ type: 'cutin', dur: sk.combo ? 1.7 : 1.35, p, sk, partner, onEnd: () => launchSpecial(p, sk, partner) });
  } else if (sk.type === 'dribble') {
    if (b.owner !== p) return false;
    addGauge(T, -sk.cost);
    startFreeze({ type: 'cutin', dur: 0.95, p, sk, onEnd: () => startDash(p, sk) });
  } else if (sk.type === 'tackle') {
    const o = b.owner;
    if (!o || o.team === p.team || dist(o, p) > 8) return false;
    addGauge(T, -sk.cost);
    startFreeze({ type: 'cutin', dur: 0.95, p, sk, onEnd: () => startTackleSkill(p, sk) });
  } else return false;
  Sfx.cutin();
  return true;
}
function startFreeze(f) {
  f.t = 0; G.freeze = f; G.timeScale = 1;
  UI.closeMenu();
}

// 必殺シュート発射
function launchSpecial(p, sk, partner) {
  const b = G.ball, T = teamOf(p);
  if (b.owner !== p) return;
  releaseBall(p);
  const gx = T.side * (L + 0.6);
  const ty = (Math.random() < 0.5 ? -1 : 1) * rnd(0.6, 2.8), tz = rnd(0.5, 1.8);
  const ox = b.x, oy = b.y, oz = 0.5;
  const dx = gx - ox, dy = ty - oy, d = Math.hypot(dx, dy);
  // 遠いほど威力が落ちる
  const far = 1 - Math.max(0, d - 16) * 0.012;
  const power = (sk.combo ? sk.power : sk.power * (0.85 + 0.15 * p.d.shot)) * far;
  const s = { sk, team: p.team, power, ox, oy, oz, tx: gx, ty, tz, dist: d, trav: 0, ux: dx / d, uy: dy / d,
    spd: sk.fx === 'meteor' ? 27 : 32, K: G.teams[1 - p.team].players[0], kicker: p };
  s.blocker = findBlocker(s, 1 - p.team);
  b.special = s; b.z = oz; b.trail.length = 0;
  p.vz = 5; if (partner) partner.vz = 5;
  G.shake = 0.7; G.flash = 0.7; G.flashColor = ELEM[sk.elem].light;
  FX.burst(b.x, b.y, 0.6, sk.fx, 70);
  Sfx.special(sk.elem);
}
const ARC = { fire: 1.2, phoenix: 3, thunder: 4, wind: 0.8, earth: 1.5, meteor: 7 };
function findBlocker(s, team) {
  let best = null, bu = 2;
  const dx = s.tx - s.ox, dy = s.ty - s.oy, l2 = dx * dx + dy * dy;
  for (const q of G.teams[team].players) {
    if (q.gk || q.state === 'down') continue;
    const u = ((q.x - s.ox) * dx + (q.y - s.oy) * dy) / l2;
    if (u < 0.12 || u > 0.85) continue;
    const d = Math.hypot(q.x - (s.ox + dx * u), q.y - (s.oy + dy * u));
    if (d < 2.8 && u < bu) { bu = u; best = q; }
  }
  return best ? { q: best, u: bu } : null;
}
function updateSpecial(dt) {
  const b = G.ball, s = b.special;
  s.trav += s.spd * dt;
  const u = s.trav / s.dist;
  const px = b.x, py = b.y;
  b.x = s.ox + (s.tx - s.ox) * u;
  b.y = s.oy + (s.ty - s.oy) * u + (s.sk.fx === 'wind' ? Math.sin(u * Math.PI * 3) * 1.4 * (1 - u) : 0);
  b.z = s.oz + (s.tz - s.oz) * Math.min(1, u) + Math.sin(Math.min(1, u) * Math.PI) * (ARC[s.sk.fx] || 1);
  b.vx = (b.x - px) / Math.max(dt, 1e-4); b.vy = (b.y - py) / Math.max(dt, 1e-4); b.vz = 0;
  b.spin += dt * 40;
  FX.trail(b, dt);
  if (u >= 1.05) { b.special = null; b.vx = s.ux * s.spd * 0.6; b.vy = s.uy * s.spd * 0.6; return; }
  if (s.blocker && !s.blockDone && u >= s.blocker.u) { s.blockDone = true; doBlock(s); return; }
  const remain = Math.abs(s.tx - b.x);
  if (!s.kDecided && remain < 15) { s.kDecided = true; decideKeeper(s); return; }
  if (s.kDecided && !s.clashDone && remain <= Math.abs(s.tx - s.K.x) + 0.4) { s.clashDone = true; startClash(s); }
}
function doBlock(s) {
  const q = s.blocker.q, T = teamOf(q), b = G.ball;
  const sk = q.d.skills.map(k => SKILLS[k]).find(k => k.type === 'block' && T.gauge >= k.cost);
  const pr = q.team === 1 ? DIFF[G.diff].skill : 0.85;
  if (sk && Math.random() < pr) {
    addGauge(T, -sk.cost);
    q.x = b.x + s.ux * 1.2; q.y = b.y;
    startFreeze({ type: 'cutin', dur: 1.0, p: q, sk, onEnd: () => applyBlock(s, q, sk) });
    Sfx.cutin();
  } else if (dist(q, b) < 2.5) {
    // 体で止めにいくが吹き飛ばされる
    q.state = 'down'; q.st = 1.2; q.vx = s.ux * 8; q.vy = s.uy * 8;
    s.power -= 6; FX.text(q.x, q.y, 2.4, '-6', '#ff8a8a'); FX.burst(b.x, b.y, b.z, s.sk.fx, 20);
    Sfx.hit();
  }
}
function applyBlock(s, q, sk) {
  const b = G.ball;
  FX.shield(b.x, b.y, 0, sk.elem, 1.0, sk.elem === 'earth' ? 'pillar' : 'block');
  FX.burst(b.x, b.y, b.z, sk.fx, 50);
  const red = Math.round(sk.power * elemBonus(sk.elem, s.sk.elem));
  s.power -= red;
  FX.text(b.x, b.y, b.z + 2.5, `-${red}`, '#ff8a8a');
  G.shake = 0.5; Sfx.boom();
  if (s.power < 45) {
    b.special = null; b.vx = -s.ux * 6; b.vy = rnd(-5, 5); b.vz = 5; b.lastTouch = q.team;
    banner('ブロック！', `${q.d.name}が止めた`, ELEM[sk.elem].light, 1.3);
    addGauge(teamOf(q), 6);
  } else {
    s.spd *= 0.9;
  }
}
function decideKeeper(s) {
  const K = s.K, T = teamOf(K);
  const opts = K.d.skills.map(k => SKILLS[k]).filter(k => k.type === 'keeper');
  const afford = opts.filter(k => T.gauge >= k.cost);
  if (!afford.length) return;
  if (K.team === 0 && !G.auto) {
    UI.keeperMenu(K, opts, sk => { if (sk && T.gauge >= sk.cost && G.ball.special === s) useKeeperSkill(s, K, sk); });
    return;
  }
  afford.sort((a, c) => c.power * elemBonus(c.elem, s.sk.elem) - a.power * elemBonus(a.elem, s.sk.elem));
  const pr = K.team === 1 ? DIFF[G.diff].skill : 0.85;
  if (Math.random() < pr) useKeeperSkill(s, K, afford[0]);
}
function useKeeperSkill(s, K, sk) {
  addGauge(teamOf(K), -sk.cost);
  s.ksk = sk;
  startFreeze({ type: 'cutin', dur: 1.15, p: K, sk, onEnd: () => FX.shield(K.x, K.y, 0, sk.elem, 2.6, 'keeper') });
  Sfx.cutin();
}
function startClash(s) {
  const K = s.K, ksk = s.ksk, b = G.ball;
  const kr = K.team === 1 ? DIFF[G.diff].gk : 0.74;
  let kp = (ksk ? ksk.power : 58 + kr * 20) * elemBonus(ksk && ksk.elem, s.sk.elem);
  let sp = s.power * elemBonus(s.sk.elem, ksk && ksk.elem);
  kp *= rnd(0.93, 1.07); sp *= rnd(0.93, 1.07);
  const win = sp > kp;
  K.y = clamp(b.y, -PITCH.goalW, PITCH.goalW); K.state = 'run';
  G.shake = 0.8;
  Sfx.clash();
  startFreeze({ type: 'clash', dur: 2.1, s, ksk, K, sp: Math.round(sp), kp: Math.round(kp), win, onEnd: () => {
    if (win) {
      K.state = 'down'; K.st = 1.6; K.vx = s.ux * 7; K.vy = s.uy * 3;
      FX.burst(b.x, b.y, b.z, s.sk.fx, 60); G.shake = 0.6; Sfx.boom();
    } else {
      giveBall(K); K.gkHold = 1.6;
      addGauge(teamOf(K), 10);
      FX.burst(b.x, b.y, b.z, ksk ? ksk.fx : 'wind', 50);
      FX.ring(K.x, K.y, 0.1, '#ffffff', 8, 0.6);
      banner('ストップ！', `${K.d.name}がキャッチ！`, ksk ? ELEM[ksk.elem].light : '#ffffff', 1.3);
      Sfx.save();
    }
  } });
}
function startDash(p, sk) {
  let dx, dy;
  if (userControls(p) && Math.hypot(Input.jx, Input.jy) > 0.3) { dx = Input.jx; dy = Input.jy; }
  else { const gx = teamOf(p).side * L; dx = gx - p.x; dy = -p.y * 0.3; }
  const l = Math.hypot(dx, dy) || 1;
  p.state = 'dash'; p.st = 0.55; p.dashDx = dx / l; p.dashDy = dy / l; p.dashSk = sk; p.dashTarget = null; p.dashHit = [];
  FX.burst(p.x, p.y, 1, sk.fx, 30);
  Sfx.whoosh();
}
function startTackleSkill(p, sk) {
  const o = G.ball.owner;
  if (!o || o.team === p.team) return;
  p.state = 'dash'; p.st = 0.45; p.dashTarget = o; p.dashSk = sk; p.dashHit = [];
  Sfx.whoosh();
}
function startSlide(p, dx, dy) {
  if (p.state !== 'run') return;
  let l = Math.hypot(dx, dy);
  if (l < 0.3) { dx = G.ball.x - p.x; dy = G.ball.y - p.y; l = Math.hypot(dx, dy) || 1; }
  p.state = 'slide'; p.st = 0.5; p.dashDx = dx / l; p.dashDy = dy / l; p.slideHit = false;
  p.fx = p.dashDx; p.fy = p.dashDy;
  Sfx.slide();
}

// ===== 選手の移動 =====
function maxSpd(p, sprint) {
  let v = (sprint ? 8.6 : 6.6) * p.d.spd;
  if (p.team === 1) v *= DIFF[G.diff].spd;
  if (G.ball.owner === p) v *= 0.9;
  return v;
}
function moveTo(p, tx, ty, urg) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 0.3) { p.dvx = 0; p.dvy = 0; return; }
  const sp = Math.min(maxSpd(p, urg > 1.05) * Math.min(1, urg), d * 2.4);
  p.dvx = dx / d * sp; p.dvy = dy / d * sp;
}
function movePlayers(dt) {
  const b = G.ball;
  for (const p of G.players) {
    p.kickCd -= dt; p.kickAnim -= dt; p.waitT -= dt; if (p.throwAnim > 0) p.throwAnim -= dt;
    if (p.gkHold > 0) p.gkHold -= dt;
    if (p.z > 0 || p.vz > 0) { p.vz -= 14 * dt; p.z += p.vz * dt; if (p.z < 0) { p.z = 0; p.vz = 0; } }
    if (p.state !== 'run') p.st -= dt;
    switch (p.state) {
      case 'down': {
        const f = Math.exp(-4 * dt); p.vx *= f; p.vy *= f;
        if (p.st <= 0) p.state = 'run';
        break;
      }
      case 'slide': {
        const sp = 10 * (0.3 + Math.max(0, p.st) / 0.5);
        p.vx = p.dashDx * sp; p.vy = p.dashDy * sp;
        const o = b.owner;
        if (!p.slideHit && o && o.team !== p.team && dist(p, o) < 1.5 && !(o.gk && o.gkHold > 0)) {
          p.slideHit = true;
          if (Math.random() < 0.72) {
            b.owner = null; b.vx = p.dashDx * 8 + rnd(-2, 2); b.vy = p.dashDy * 8 + rnd(-2, 2); b.vz = 1.5;
            b.lastTouch = p.team; o.kickCd = 0.6; o.state = 'down'; o.st = 0.9; G.pass = null;
            Sfx.tackle();
          }
        } else if (!b.owner && !b.special && dist(p, b) < 1.3 && b.z < 0.6 && p.kickCd <= 0) {
          b.vx = p.dashDx * 9; b.vy = p.dashDy * 9; b.lastTouch = p.team; p.kickCd = 0.3;
        }
        if (p.st <= 0) { p.state = 'down'; p.st = 0.35; }
        break;
      }
      case 'dash': {
        const E = ELEM[p.dashSk.elem];
        if (p.dashTarget) {
          const o = p.dashTarget, d = dist(p, o);
          const dx = (o.x - p.x) / (d || 1), dy = (o.y - p.y) / (d || 1);
          p.vx = dx * 22; p.vy = dy * 22; p.fx = dx; p.fy = dy;
          if (d < 1.1) {
            if (b.owner === o) {
              o.state = 'down'; o.st = 1.6; o.vx = dx * 6; o.vy = dy * 6;
              giveBall(p);
              FX.burst(o.x, o.y, 1, p.dashSk.fx, 50); G.shake = 0.5;
              banner('奪った！', p.d.name, E.light, 1.1);
              Sfx.boom();
            }
            p.state = 'run'; p.dashTarget = null;
          }
        } else {
          p.vx = p.dashDx * 19; p.vy = p.dashDy * 19; p.fx = p.dashDx; p.fy = p.dashDy;
          for (const q of G.teams[1 - p.team].players) {
            if (q.gk || p.dashHit.includes(q) || dist(p, q) > 3.4) continue;
            p.dashHit.push(q); q.state = 'down'; q.st = 1.6;
            const l = dist(p, q) || 1; q.vx = (q.x - p.x) / l * 7; q.vy = (q.y - p.y) / l * 7;
            FX.burst(q.x, q.y, 1, p.dashSk.fx, 18);
            Sfx.hit();
          }
        }
        if (Math.random() < dt * 40) FX.ghost(p, E.color);
        FX.add({ type: 'glow', x: p.x, y: p.y, z: 0.8 + Math.random(), vx: -p.vx * 0.2, vy: -p.vy * 0.2, vz: 1, life: 0.4, size: 0.7, c1: E.light, c2: E.color });
        if (p.st <= 0) { p.state = 'run'; p.dashTarget = null; }
        break;
      }
      case 'dive': {
        p.vx = 0; p.vy = p.diveVy;
        if (p.st <= 0) { p.state = 'down'; p.st = 0.5; }
        break;
      }
      default: {
        const a = Math.min(1, dt * 7);
        p.vx += (p.dvx - p.vx) * a; p.vy += (p.dvy - p.vy) * a;
      }
    }
    p.x = clamp(p.x + p.vx * dt, -L - 4, L + 4);
    p.y = clamp(p.y + p.vy * dt, -W - 3, W + 3);
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 0.4 && (p.state === 'run' || p.state === 'cele')) {
      const a = Math.min(1, dt * 10);
      p.fx += (p.vx / sp - p.fx) * a; p.fy += (p.vy / sp - p.fy) * a;
      const l = Math.hypot(p.fx, p.fy) || 1; p.fx /= l; p.fy /= l;
    }
    p.run += sp * dt * 1.9;
  }
}

// ===== ボールの物理 =====
function updateBall(dt) {
  const b = G.ball;
  if (b.owner) {
    const o = b.owner;
    if (isThrowing(o)) {
      b.x = o.x + o.fx * 0.1; b.y = o.y + o.fy * 0.1; b.z = THROW_Z; b.vx = b.vy = b.vz = 0;
      return;
    }
    const off = o.gk && o.gkHold > 0 ? 0.3 : 0.62 + 0.1 * Math.sin(o.run * 2);
    const tx = o.x + o.fx * off, ty = o.y + o.fy * off;
    const a = Math.min(1, dt * 18);
    b.x += (tx - b.x) * a; b.y += (ty - b.y) * a;
    b.z = o.gk && o.gkHold > 0 ? 1.1 : 0;
    b.vx = o.vx; b.vy = o.vy; b.vz = 0;
    b.spin += Math.hypot(o.vx, o.vy) * dt * 2;
    return;
  }
  if (b.special) { updateSpecial(dt); return; }
  const prevX = b.x;
  b.vz -= 9.8 * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (b.z <= 0) {
    b.z = 0;
    if (b.vz < -2) {
      // ユーザーのフライパスは着地点で止まりやすくする
      const damp = G.pass && G.pass.user && G.pass.fly ? 0.22 : 0.85;
      b.vz = -b.vz * (damp < 0.5 ? 0.3 : 0.45); b.vx *= damp; b.vy *= damp; Sfx.bounce();
    } else b.vz = 0;
  }
  if (b.z === 0 && b.vz === 0) {
    const f = Math.exp(-0.9 * dt); b.vx *= f; b.vy *= f;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < 0.4) { b.vx = 0; b.vy = 0; }
  }
  b.spin += Math.hypot(b.vx, b.vy) * dt * 2;
  if (b.trail.length) b.trail.length = 0;
  // ゴールネット
  if (G.phase === 'goal') {
    const e = Math.sign(b.x);
    if (Math.abs(b.x) > L + PITCH.goalD - 0.2) { b.x = e * (L + PITCH.goalD - 0.2); b.vx *= -0.15; b.vy *= 0.5; }
    if (Math.abs(b.x) > L) { b.y = clamp(b.y, -PITCH.goalW + 0.2, PITCH.goalW - 0.2); b.z = Math.min(b.z, PITCH.goalH - 0.2); }
  }
  // キーパーのセーブ判定
  const plan = G.shotPlan;
  if (plan) {
    const K = plan.K;
    if ((prevX - K.x) * (b.x - K.x) <= 0) {
      G.shotPlan = null;
      if (plan.saved && K.state !== 'down') {
        K.y = clamp(b.y - Math.sign(b.y - K.y) * 0.3, -4, 4);
        if (plan.catchIt) {
          giveBall(K); K.gkHold = 1.4;
          FX.text(K.x, K.y, 2.6, 'キャッチ！', '#ffffff');
        } else {
          b.vx = -b.vx * 0.3; b.vy = rnd(-9, 9); b.vz = rnd(2, 5); b.lastTouch = K.team;
          FX.text(K.x, K.y, 2.6, 'セーブ！', '#ffffff');
        }
        addGauge(teamOf(K), 8);
        Sfx.save();
      }
    }
  }
}

// ===== ボールを拾う・奪う =====
function checkPossession() {
  const b = G.ball;
  if (b.owner || b.special || b.z > 2.4) return;
  let best = null, bd = 1e9;
  for (const p of G.players) {
    if (p.kickCd > 0 || p.state === 'down' || p.state === 'dive' || p.state === 'slide') continue;
    const ps = G.pass;
    if (ps && ps.user && p.team !== ps.team && !ps.blockers.includes(p)) continue;
    const inBox = p.gk && Math.abs(p.x) > L - 17 && Math.abs(p.y) < 20.5;
    const reach = inBox ? 1.5 : 0.95;
    if (!inBox && b.z > 1.2) continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d < reach && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const sp = Math.hypot(b.vx, b.vy);
  const ownPass = G.pass && G.pass.user && G.pass.team === best.team;
  if (!best.gk && !ownPass && sp > 21 && Math.random() < 0.5) {
    b.vx *= -0.25; b.vy = b.vy * 0.3 + rnd(-3, 3); b.vz = 2; best.kickCd = 0.3; b.lastTouch = best.team;
    return;
  }
  giveBall(best);
  if (best.gk) best.gkHold = 1.2;
}
function checkTackles(dt) {
  const b = G.ball, o = b.owner;
  if (!o || o.state === 'dash' || G.protectT > 0 || (o.gk && o.gkHold > 0)) return;
  for (const p of G.teams[1 - o.team].players) {
    if (p.state !== 'run' || p.gk) continue;
    if (dist(p, o) > 1.1) continue;
    let rate = p.team === 1 ? DIFF[G.diff].tackle * 1.1 : (userControls(p) ? 1.5 : 1.0);
    if (Math.random() < rate * dt) {
      if (Math.random() < 0.55) giveBall(p);
      else {
        b.owner = null; b.vx = (p.x - o.x) * 2 + rnd(-3, 3); b.vy = (p.y - o.y) * 2 + rnd(-3, 3);
        b.lastTouch = p.team; o.kickCd = 0.5; p.kickCd = 0.1;
      }
      o.state = 'down'; o.st = 0.35;
      Sfx.tackle();
      return;
    }
  }
}

// ===== ライン外・ゴール =====
function checkOut() {
  const b = G.ball;
  if (Math.abs(b.x) > L) {
    const e = Math.sign(b.x);
    if (Math.abs(b.y) < PITCH.goalW && b.z < PITCH.goalH) { goal(e); return; }
    const att = G.teams.find(T => T.side === e).id, def = 1 - att;
    if (b.lastTouch === def) setRestart('corner', att, e * (L - 0.3), Math.sign(b.y || 1) * (W - 0.3));
    else setRestart('goalkick', def, e * (L - 5.5), 0);
    return;
  }
  if (Math.abs(b.y) > W) setRestart('throw', b.lastTouch === 0 ? 1 : 0, clamp(b.x, -L + 1, L - 1), Math.sign(b.y) * (W - 0.5));
}
function goal(e) {
  const T = G.teams.find(T => T.side === e), b = G.ball;
  T.score++;
  G.phase = 'goal'; G.phaseT = 0;
  const lk = G.lastKicker;
  G.scorer = lk && lk.team === T.id ? lk : null;
  if (b.owner) b.owner = null;
  if (b.special) { b.special = null; b.vx *= 0.5; b.vy *= 0.5; }
  G.shotPlan = null; G.pass = null;
  G.kickoffTeam = 1 - T.id;
  banner('GOAL!!', G.scorer ? `${G.scorer.d.n} ${G.scorer.d.name}` : 'オウンゴール', T.id === 0 ? '#5ab0ff' : '#d27bff', 2.6, true);
  G.flash = 0.8; G.flashColor = '#fff'; G.shake = 0.6;
  FX.confetti(e * (L - 8), 0);
  FX.burst(b.x, b.y, 1, 'fire', 40);
  Sfx.goal();
  UI.closeMenu();
}
const RESTART_NAME = { throw: 'スローイン', corner: 'コーナーキック', goalkick: 'ゴールキック' };
function setRestart(type, team, x, y) {
  const b = G.ball;
  Object.assign(b, { owner: null, special: null, x, y, z: 0, vx: 0, vy: 0, vz: 0 });
  b.trail.length = 0;
  G.phase = 'dead'; G.phaseT = 0; G.pass = null; G.shotPlan = null; G.possTeam = team;
  const T = G.teams[team];
  const taker = type === 'goalkick' ? T.players[0]
    : T.players.filter(p => !p.gk).sort((a, c) => Math.hypot(a.x - x, a.y - y) - Math.hypot(c.x - x, c.y - y))[0];
  G.restart = { type, team, x, y, taker };
  banner(RESTART_NAME[type], null, '#ffffff', 1.0);
  Sfx.whistle(1);
  UI.closeMenu();
}
function stepDead(dt) {
  computeRoles();
  const r = G.restart;
  for (const p of G.players) {
    if (p.state !== 'run') continue;
    if (p === r.taker) moveTo(p, r.x, r.y, 1.4);
    else if (p.gk) aiKeeper(p, dt);
    else { const [tx, ty] = formationTarget(p); moveTo(p, tx, ty, 1.1); }
  }
  movePlayers(dt);
  if (G.phaseT > 1.1) {
    const t = r.taker;
    t.x = r.x; t.y = r.y; t.vx = t.vy = 0; t.state = 'run';
    t.fx = -Math.sign(r.x) * 0.5; t.fy = r.type === 'goalkick' ? 0 : -Math.sign(r.y);
    if (r.type === 'goalkick') t.fx = -Math.sign(r.x);
    const l = Math.hypot(t.fx, t.fy) || 1; t.fx /= l; t.fy /= l;
    giveBall(t, true);
    t.waitT = 0.7; t.mustPass = true; t.holdT = 0;
    G.ball.x = r.x; G.ball.y = r.y;
    G.protectT = 1.5;
    G.phase = 'play'; G.phaseT = 0;
  }
}
function stepGoal(dt) {
  updateBall(dt);
  const sc = G.scorer, b = G.ball;
  for (const p of G.players) {
    if (p.state !== 'run' && p.state !== 'cele') continue;
    if (sc && p === sc) { p.state = 'cele'; moveTo(p, Math.sign(b.x) * 44, Math.sign(p.y || 1) * 28, 1.2); }
    else if (sc && p.team === sc.team && !p.gk) moveTo(p, sc.x - sc.fx * 2 + (p.idx % 3 - 1) * 1.5, sc.y - sc.fy * 2 + (p.idx % 2 ? 1.5 : -1.5), 1.2);
    else { p.dvx *= 0.9; p.dvy *= 0.9; }
  }
  movePlayers(dt);
  if (G.phaseT > 3.3) {
    for (const p of G.players) if (p.state === 'cele') p.state = 'run';
    setupKickoff(G.kickoffTeam);
  }
}
function endHalf() {
  UI.closeMenu();
  if (G.half === 1) {
    G.phase = 'halftime'; G.phaseT = 0;
    banner('前半終了', 'HALF TIME', '#ffffff', 2.8, true);
    Sfx.whistle(2);
  } else {
    G.phase = 'fulltime'; G.phaseT = 0;
    banner('試合終了', 'FULL TIME', '#ffffff', 2.8, true);
    Sfx.whistle(3);
  }
}

// ===== AI =====
function computeRoles() {
  const b = G.ball;
  for (const T of G.teams) {
    T.near = T.players.filter(p => !p.gk && p.state !== 'down')
      .map(p => ({ p, d: Math.hypot(p.x - b.x, p.y - b.y) })).sort((a, c) => a.d - c.d);
  }
}
function formationTarget(p) {
  const T = teamOf(p), s = T.side, b = G.ball, h = p.home;
  const bx = b.x * s, by = b.y;
  const poss = G.possTeam === p.team;
  let x = h.x * 40 + bx * 0.5 + (poss ? 9 : -3);
  const pos = p.d.pos;
  if (pos === 'DF' && !poss) x = Math.min(x, bx - 4);
  if (pos === 'FW' && poss) x = Math.max(x, Math.min(bx + 3, 38));
  x = clamp(x, -48, 44);
  let y = h.y * 27 * (poss ? 1.1 : 0.85) + by * 0.35;
  if (poss && pos !== 'DF') { x += Math.sin(G.t * 0.7 + p.idx * 1.7) * 3; y += Math.cos(G.t * 0.5 + p.idx) * 3; }
  y = clamp(y, -32, 32);
  return [x * s, y];
}
function aiKeeper(K, dt) {
  const T = teamOf(K), s = T.side, gx = -s * L, b = G.ball;
  if (K.state !== 'run') return;
  if (b.owner === K) {
    K.dvx = 0; K.dvy = 0;
    if (K.holdT > 1.3 && K.waitT <= 0) {
      const opt = bestPassOption(K) || { t: T.players[2] };
      doPass(K, opt.t, dist(K, opt.t) > 25);
    }
    return;
  }
  const sp = b.special;
  if (sp && sp.K === K) { K.dvx = 0; K.dvy = clamp((sp.ty - K.y) * 4, -9, 9); return; }
  const plan = G.shotPlan;
  if (plan && plan.K === K) {
    if (!plan.dived && G.t >= plan.tDive) {
      plan.dived = true;
      const target = plan.saved ? plan.y : plan.y - Math.sign(plan.y - K.y || 1) * 1.3;
      const dy = target - K.y;
      if (Math.abs(dy) > 0.8) {
        K.state = 'dive'; K.st = 0.6; K.diveVy = dy / 0.42; K.diveDir = Math.sign(dy) * -s;
        K.vz = plan.z > 1.2 ? 3.5 : 1.5;
      }
    } else moveTo(K, K.x, clamp(plan.y, -3, 3) * 0.5, 1.3);
    return;
  }
  const rel = (b.x - gx) * s;
  if (!b.owner && rel < 16 && Math.abs(b.y) < 20 && b.z < 2.5 && G.phase === 'play') {
    const n = T.near[0] ? T.near[0].d : 99;
    if (dist(K, b) < n + 2 || rel < 6) { moveTo(K, b.x + b.vx * 0.2, b.y + b.vy * 0.2, 1.3); return; }
  }
  const near = Math.hypot(b.x - gx, b.y) < 28;
  const depth = near ? 2.4 : 1.4;
  const ky = clamp(b.y * (near ? 0.22 : 0.1), -3, 3);
  moveTo(K, gx + s * depth, ky, 1.0);
}
function aiCarrier(p, dt) {
  const T = teamOf(p), s = T.side, gx = s * L;
  if (p.waitT > 0) { p.dvx = 0; p.dvy = 0; return; }
  if (p.mustPass) {
    let t;
    if (G.restart && G.restart.type === 'corner') {
      t = T.players.filter(q => !q.gk && q !== p).sort((a, c) => Math.hypot(a.x - s * (L - 11), a.y) - Math.hypot(c.x - s * (L - 11), c.y))[0];
      doPass(p, t, true);
    } else {
      const o = bestPassOption(p); t = o ? o.t : T.players[5];
      if (isThrowing(p)) {
        let dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d; d = Math.min(d, 24);
        throwBall(p, dx, dy, d, d > 14);
        G.pass = { team: p.team, receiver: t, tx: p.x + dx * d, ty: p.y + dy * d, until: G.t + 4 };
      } else doPass(p, t, G.restart && G.restart.type === 'goalkick');
    }
    return;
  }
  p.decide -= dt;
  const dg = Math.hypot(gx - p.x, p.y);
  const press = nearestOppDist(p);
  if (p.decide <= 0) {
    p.decide = 0.25 + Math.random() * 0.2;
    if (p.x * s > 27 && Math.abs(p.y) < 18) {
      const sks = p.d.skills.map(k => SKILLS[k]).filter(k => k.type === 'shoot' && T.gauge >= k.cost && (!k.combo || comboPartner(p)));
      sks.sort((a, c) => c.power - a.power);
      const pr = p.team === 1 ? DIFF[G.diff].skill : 0.7;
      if (sks.length && dg < 26 && Math.random() < pr) { useSkill(p, sks[0]); return; }
      if (dg < 17 || Math.random() < 0.3) { doShoot(p, null); return; }
    }
    if (press < 2.6 && Math.random() < 0.25) {
      const ds = p.d.skills.map(k => SKILLS[k]).find(k => k.type === 'dribble' && T.gauge >= k.cost + 35);
      if (ds) { useSkill(p, ds); return; }
    }
    const opt = bestPassOption(p);
    if (opt) {
      if ((press < 2.4 && Math.random() < 0.75) ||
          (opt.score > 3.5 && p.holdT > 0.8 && Math.random() < 0.35) ||
          (p.holdT > 3.5 && Math.random() < 0.4)) { doPass(p, opt.t); return; }
    }
  }
  // ドリブル（前の相手をよける）
  let dx = gx - p.x, dy = (dg < 22 ? -p.y * 0.8 : clamp(p.y * 0.6, -9, 9) - p.y);
  let l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  let clear = true;
  for (const q of G.teams[1 - p.team].players) {
    const rx = q.x - p.x, ry = q.y - p.y, d = Math.hypot(rx, ry);
    if (d > 7 || d < 0.01) continue;
    const ahead = (rx * dx + ry * dy) / d; if (ahead < 0.2) continue;
    clear = clear && d > 5;
    const dot = rx * dx + ry * dy;
    let ax = -(rx - dot * dx), ay = -(ry - dot * dy);
    const al = Math.hypot(ax, ay);
    if (al < 0.05) { ax = -dy; ay = dx; } else { ax /= al; ay /= al; }
    const w = (7 - d) / 7 * ahead * 1.4;
    dx += ax * w; dy += ay * w;
  }
  if (Math.abs(p.y) > 29) dy -= Math.sign(p.y) * 0.8;
  l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  moveTo(p, p.x + dx * 5, p.y + dy * 5, clear ? 1.3 : 1.0);
}
function aiOutfield(p, dt) {
  const b = G.ball, T = teamOf(p), s = T.side;
  const ownPoss = b.owner ? b.owner.team === p.team : null;
  const manual = p.team === 0 && !G.auto;
  if (G.pass && G.pass.receiver === p && !b.owner) { receiveMove(p); return; }
  if (!b.owner && !(G.pass && G.pass.team === p.team)) {
    const first = T.near[0] && T.near[0].p;
    let chaser = first;
    if (manual) {
      const c = G.ctrl;
      chaser = first !== c && first && c && T.near[0].d < dist(c, b) - 3 ? first : null;
    }
    if (p === chaser) {
      const t = Math.min(1.2, dist(p, b) / 8);
      moveTo(p, b.x + b.vx * t, b.y + b.vy * t, 1.3);
      return;
    }
  }
  if (ownPoss === false) {
    const o = b.owner;
    const first = T.near[0] && T.near[0].p, second = T.near[1] && T.near[1].p;
    let presser = first, cover = second;
    if (manual) { presser = null; cover = first === G.ctrl ? second : first; }
    if (p === presser) {
      moveTo(p, o.x + o.vx * 0.3 - s * 0.6, o.y + o.vy * 0.3, 1.25);
      const d = dist(p, o);
      if (G.protectT <= 0 && !(o.gk && o.gkHold > 0)) {
        const ts = p.d.skills.map(k => SKILLS[k]).find(k => k.type === 'tackle' && T.gauge >= k.cost + 20);
        const pr = p.team === 1 ? DIFF[G.diff].skill : 0.7;
        if (ts && d < 6 && Math.random() < 0.3 * pr * dt) { useSkill(p, ts); return; }
        if (d < 2.8 && d > 1.2 && Math.random() < 0.5 * dt) startSlide(p, o.x - p.x, o.y - p.y);
      }
      return;
    }
    if (p === cover) {
      const gxo = -s * L, vx = gxo - o.x, vy = -o.y, l = Math.hypot(vx, vy) || 1;
      moveTo(p, o.x + vx / l * 5, o.y + vy / l * 5, 1.1);
      return;
    }
  }
  const [tx, ty] = formationTarget(p);
  const d = Math.hypot(tx - p.x, ty - p.y);
  moveTo(p, tx, ty, d > 10 ? 1.15 : d > 3 ? 0.85 : 0.5);
}

// ===== 操作 =====
function userMove(p) {
  if (p.mustPass && p.waitT > -4) { p.dvx = 0; p.dvy = 0; return; }
  const l = Math.hypot(Input.jx, Input.jy);
  if (l > 0.15) {
    const sp = maxSpd(p, Input.dash) * Math.min(1, l);
    p.dvx = Input.jx / l * sp; p.dvy = Input.jy / l * sp;
  } else { p.dvx = 0; p.dvy = 0; }
}
function switchCtrl() {
  const near = G.teams[0].near;
  const n = near.find(e => e.p !== G.ctrl);
  if (n) G.ctrl = n.p;
}
function handleAction(a) {
  const p = G.ctrl, b = G.ball;
  if (!p || p.state !== 'run') return;
  const has = b.owner === p;
  if (a && a.a === 'kickpass') {
    if (has) doUserPass(p, a.fly, a.power);
  } else if (a === 'pass') {
    if (!has && !(G.pass && G.pass.team === 0) && !(b.owner && b.owner.team === 0)) switchCtrl();
  } else if (a === 'shoot') {
    if (has) {
      if (p.gk || p.mustPass) doUserPass(p, true, 0.6);
      else doShoot(p, Math.abs(Input.jy) > 0.3 ? Input.jy : null);
    } else if (!b.owner || b.owner.team !== 0) startSlide(p, Input.jx, Input.jy);
  } else if (a === 'skill') {
    UI.openSkillMenu(p);
  }
}
function updateControlSwitch(dt) {
  if (G.auto) return;
  const b = G.ball;
  if (b.owner && b.owner.team === 0) { G.ctrl = b.owner; return; }
  if (G.pass && G.pass.team === 0) return;
  if (!G.ctrl || G.ctrl.gk) { const n = G.teams[0].near[0]; if (n) G.ctrl = n.p; return; }
  G.switchT -= dt;
  if (G.switchT <= 0) {
    G.switchT = 0.5;
    const n = G.teams[0].near[0] && G.teams[0].near[0].p;
    if (n && n !== G.ctrl) {
      const dc = dist(G.ctrl, b), dn = dist(n, b);
      if (dc > 9 && dn < dc - 5) G.ctrl = n;
    }
  }
}

// ===== 1フレームの進行 =====
function step(dt) {
  G.clock += dt;
  if (G.clock >= G.halfLen) { endHalf(); return; }
  G.protectT -= dt;
  for (const T of G.teams) addGauge(T, dt * 0.6);
  computeRoles();
  updateControlSwitch(dt);
  const acts = Input.actions.splice(0);
  if (!G.auto) for (const a of acts) { handleAction(a); if (G.freeze) break; }
  const b = G.ball;
  for (const p of G.players) {
    if (p.state !== 'run') continue;
    if (userControls(p) && G.pass && G.pass.receiver === p && !b.owner) receiveMove(p);
    else if (userControls(p) && !(b.owner === p && (p.gk || p.mustPass) && p.holdT > 4)) userMove(p);
    else if (p.gk) aiKeeper(p, dt);
    else if (b.owner === p) aiCarrier(p, dt);
    else aiOutfield(p, dt);
    if (G.phase !== 'play') return;
  }
  movePlayers(dt);
  updateBall(dt);
  if (G.phase !== 'play') return;
  checkPossession();
  checkTackles(dt);
  checkOut();
  if (b.owner) b.owner.holdT += dt;
  if (G.pass && G.t > G.pass.until) G.pass = null;
}
function updateCamera(rdt) {
  const b = G.ball;
  let tx = b.x, ty = b.y;
  if (b.special) tx += b.special.ux * 6;
  G.cam.x += (clamp(tx, -L + 20, L - 20) - G.cam.x) * Math.min(1, rdt * (b.special ? 7 : 2.6));
  let cy = clamp(ty * 0.75, -20, 12);
  let zt = b.special ? 1.12 : G.phase === 'goal' ? 1.08 : 1;
  // 手前のタッチライン付近は少し引いて映す
  if (ty < -16) zt = Math.min(zt, 1 - clamp((-ty - 16) / 16, 0, 1) * 0.18);
  // スローインなどのリスタートはコート全体を映す
  if (G.phase === 'dead' || (G.phase === 'play' && b.owner && b.owner.mustPass)) {
    const near = (G.restart ? G.restart.y : b.y) < 0;
    zt = 0.74; cy = near ? -17 : 8;
  }
  G.cam.y += (cy - G.cam.y) * Math.min(1, rdt * 2.5);
  G.cam.zoom += (zt - G.cam.zoom) * Math.min(1, rdt * 2);
}
function update(rdt) {
  if (G.phase === 'title' || G.paused || !G.ball) return;
  FX.update(rdt * (G.freeze ? 0.5 : Math.max(0.15, G.timeScale)));
  G.shake = Math.max(0, G.shake - rdt * 1.5);
  G.flash = Math.max(0, G.flash - rdt * 2.2);
  if (G.banner) { G.banner.t += rdt; if (G.banner.t > G.banner.dur) G.banner = null; }
  if (G.freeze) {
    const f = G.freeze; f.t += rdt;
    if (f.t >= f.dur) { G.freeze = null; if (f.onEnd) f.onEnd(); }
    updateCamera(rdt);
    return;
  }
  const dt = rdt * G.timeScale;
  G.t += dt; G.phaseT += dt;
  switch (G.phase) {
    case 'kickoff':
      for (const p of G.players) { p.dvx = 0; p.dvy = 0; }
      movePlayers(dt); updateBall(dt);
      Input.actions.length = 0;
      if (G.phaseT > 1.3) G.phase = 'play';
      break;
    case 'play': step(dt); break;
    case 'dead': stepDead(dt); break;
    case 'goal': stepGoal(dt); break;
    case 'halftime':
      if (G.phaseT > 3) { G.half = 2; G.clock = 0; for (const T of G.teams) addGauge(T, 10); setupKickoff(1); }
      break;
    case 'fulltime':
      if (G.phaseT > 2.6 && !G.resultShown) { G.resultShown = true; UI.showResult(); }
      break;
  }
  updateCamera(rdt);
}
