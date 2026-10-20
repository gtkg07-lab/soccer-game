'use strict';
// ===== ピッチ寸法（m） =====
const PITCH = { L: 52.5, W: 34, goalW: 3.66, goalH: 2.44, goalD: 2.0 };

// ===== 属性：炎 > 風 > 雷 > 大地 > 炎 =====
const ELEM = {
  fire:    { name: '炎',   color: '#ff5a1f', light: '#ffd34d', dark: '#7a1200' },
  wind:    { name: '風',   color: '#22e0bd', light: '#d6fff6', dark: '#00524a' },
  thunder: { name: '雷',   color: '#ffd92e', light: '#ffffff', dark: '#5e4a00' },
  earth:   { name: '大地', color: '#d08a3a', light: '#ffe2b0', dark: '#4f2b00' },
};
const BEATS = { fire: 'wind', wind: 'thunder', thunder: 'earth', earth: 'fire' };
function elemBonus(a, b) {
  if (!a || !b) return 1;
  if (BEATS[a] === b) return 1.2;
  if (BEATS[b] === a) return 0.85;
  return 1;
}

// ===== 必殺技 =====
// type: shoot / dribble / tackle / block / keeper
const SKILLS = {
  inferno:    { name: '紅蓮インフェルノ',     type: 'shoot',   elem: 'fire',    power: 90,  cost: 40, fx: 'fire' },
  phoenix:    { name: 'ツインフェニックス',   type: 'shoot',   elem: 'fire',    power: 125, cost: 65, fx: 'phoenix', combo: true },
  raiden:     { name: '迅雷ライトニング',     type: 'shoot',   elem: 'thunder', power: 88,  cost: 38, fx: 'thunder' },
  tempest:    { name: 'テンペストスパイラル', type: 'shoot',   elem: 'wind',    power: 82,  cost: 34, fx: 'wind' },
  gaia:       { name: 'ガイアブレイカー',     type: 'shoot',   elem: 'earth',   power: 86,  cost: 36, fx: 'earth' },
  meteor:     { name: 'ダークメテオ',         type: 'shoot',   elem: 'earth',   power: 95,  cost: 45, fx: 'meteor' },
  blackstorm: { name: 'ブラックストーム',     type: 'shoot',   elem: 'wind',    power: 88,  cost: 40, fx: 'wind' },
  hellfire:   { name: 'ヘルフレア',           type: 'shoot',   elem: 'fire',    power: 84,  cost: 36, fx: 'fire' },
  // 新しい軌道のシュート（curve＝大きく曲がる / drop＝空から急降下 / triple＝分身して3つに見える）
  cyclone:    { name: 'サイクロンカーブ',     type: 'shoot',   elem: 'wind',    power: 86,  cost: 36, fx: 'wind',    path: 'curve' },
  skyfall:    { name: '天雷サンダーフォール', type: 'shoot',   elem: 'thunder', power: 94,  cost: 44, fx: 'thunder', path: 'drop' },
  tripleblaze:{ name: 'トリプルブレイズ',     type: 'shoot',   elem: 'fire',    power: 87,  cost: 38, fx: 'fire',    path: 'triple' },
  grandspear: { name: 'グランドスピアー',     type: 'shoot',   elem: 'earth',   power: 89,  cost: 40, fx: 'earth',   path: 'curve' },
  darkphantom:{ name: 'ダークファントム',     type: 'shoot',   elem: 'thunder', power: 90,  cost: 42, fx: 'thunder', path: 'triple' },
  nemesis:    { name: 'ネメシスカーブ',       type: 'shoot',   elem: 'wind',    power: 88,  cost: 40, fx: 'wind',    path: 'curve' },
  mirage:     { name: 'ミラージュステップ',   type: 'dribble', elem: 'wind',    power: 80, cost: 20, fx: 'wind' },
  flamedash:  { name: 'フレイムダッシュ',     type: 'dribble', elem: 'fire',    power: 82, cost: 22, fx: 'fire' },
  shadowstep: { name: 'シャドウステップ',     type: 'dribble', elem: 'thunder', power: 81, cost: 22, fx: 'thunder' },
  earthwalk:  { name: 'アースウォーカー',     type: 'dribble', elem: 'earth',   power: 79, cost: 22, fx: 'earth' },
  galerush:   { name: 'ゲイルラッシュ',       type: 'dribble', elem: 'wind',    power: 83, cost: 24, fx: 'wind' },
  spark:      { name: 'スパークスライダー',   type: 'tackle',  elem: 'thunder', power: 78, cost: 20, fx: 'thunder' },
  quake:      { name: 'アースクエイク',       type: 'tackle',  elem: 'earth',   power: 80, cost: 22, fx: 'earth' },
  blazetackle:{ name: 'ブレイズタックル',     type: 'tackle',  elem: 'fire',    power: 81, cost: 22, fx: 'fire' },
  stormsnatch:{ name: 'ストームスナッチ',     type: 'tackle',  elem: 'wind',    power: 77, cost: 20, fx: 'wind' },
  pillar:     { name: 'ストーンピラー',       type: 'block',   elem: 'earth',   power: 40, cost: 25, fx: 'earth' },
  thundernet: { name: 'サンダーネット',       type: 'block',   elem: 'thunder', power: 35, cost: 22, fx: 'thunder' },
  firewall:   { name: 'フレイムウォール',     type: 'block',   elem: 'fire',    power: 38, cost: 24, fx: 'fire' },
  galebarrier:{ name: 'ゲイルバリア',         type: 'block',   elem: 'wind',    power: 36, cost: 22, fx: 'wind' },
  atlas:      { name: 'アトラスシールド',     type: 'keeper',  elem: 'earth',   power: 95, cost: 35, fx: 'earth' },
  vortex:     { name: 'ボルテックスキャッチ', type: 'keeper',  elem: 'wind',    power: 88, cost: 30, fx: 'wind' },
  abyss:      { name: 'アビスハンド',         type: 'keeper',  elem: 'thunder', power: 92, cost: 35, fx: 'thunder' },
  flamehand:  { name: 'フレイムハンド',       type: 'keeper',  elem: 'fire',    power: 90, cost: 32, fx: 'fire' },
  nebula:     { name: 'ダークネビュラ',       type: 'keeper',  elem: 'wind',    power: 89, cost: 32, fx: 'wind' },
  // 合体キーパー技（GK と相方の DF が近くにいるときだけ）
  twinwall:   { name: 'ツインギガウォール',   type: 'keeper',  elem: 'earth',   power: 122, cost: 55, fx: 'earth', combo: true },
  abyssgate:  { name: 'アビスゲート',         type: 'keeper',  elem: 'thunder', power: 118, cost: 55, fx: 'thunder', combo: true },
};
const SKILL_TYPE_NAME = { shoot: 'シュート', dribble: 'ドリブル', tackle: 'タックル', block: 'ブロック', keeper: 'キーパー' };

// ===== フォーメーション 4-4-2（攻撃方向を +x とした正規化座標。y は -1 が手前） =====
const FORMATION = [
  { x: -0.96, y: 0 },
  { x: -0.66, y: -0.62 }, { x: -0.70, y: -0.2 }, { x: -0.70, y: 0.2 }, { x: -0.66, y: 0.62 },
  { x: -0.25, y: -0.62 }, { x: -0.32, y: -0.18 }, { x: -0.32, y: 0.18 }, { x: -0.25, y: 0.62 },
  { x: 0.12, y: -0.2 }, { x: 0.12, y: 0.2 },
];

// ===== チーム =====
// spd: 走力倍率 / shot: キック力倍率 / partner: 連携技の相方の背番号
const TEAMS = [
  {
    name: '疾風イレブン', short: 'HAYATE',
    shirt: '#1d5cff', accent: '#ffffff', shorts: '#ffffff', socks: '#1d5cff',
    gkShirt: '#19c37d', hair: '#2a1a10',
    players: [
      { n: 1,  name: '守山 剛',   pos: 'GK', spd: 1.0,  shot: 1.0,  skills: ['atlas', 'vortex', 'flamehand', 'twinwall'], partner: 2 },
      { n: 2,  name: '岩城 大地', pos: 'DF', spd: 0.97, shot: 0.95, skills: ['pillar', 'earthwalk'] },
      { n: 3,  name: '雷堂 翔',   pos: 'DF', spd: 1.0,  shot: 0.95, skills: ['spark', 'galebarrier'] },
      { n: 4,  name: '石田 守',   pos: 'DF', spd: 0.96, shot: 0.95, skills: ['pillar', 'quake'] },
      { n: 5,  name: '風見 涼',   pos: 'DF', spd: 1.03, shot: 0.95, skills: ['stormsnatch', 'galebarrier'] },
      { n: 6,  name: '早瀬 颯',   pos: 'MF', spd: 1.06, shot: 1.0,  skills: ['mirage', 'galerush', 'cyclone'] },
      { n: 7,  name: '天城 蓮',   pos: 'MF', spd: 1.02, shot: 1.05, skills: ['tempest', 'cyclone', 'mirage'] },
      { n: 8,  name: '火野 烈',   pos: 'MF', spd: 1.0,  shot: 1.05, skills: ['tripleblaze', 'flamedash', 'blazetackle', 'firewall'] },
      { n: 9,  name: '鳴神 迅',   pos: 'MF', spd: 1.07, shot: 1.05, skills: ['raiden', 'skyfall', 'shadowstep'] },
      { n: 10, name: '紅 焔',     pos: 'FW', spd: 1.05, shot: 1.15, skills: ['inferno', 'tripleblaze', 'phoenix', 'flamedash'], partner: 11 },
      { n: 11, name: '朱雀 光',   pos: 'FW', spd: 1.08, shot: 1.1,  skills: ['raiden', 'skyfall', 'phoenix', 'galerush'], partner: 10 },
    ],
  },
  {
    name: 'ダーク・オメガ', short: 'OMEGA',
    shirt: '#2b0f45', accent: '#c04dff', shorts: '#14081f', socks: '#c04dff',
    gkShirt: '#ff8a1d', hair: '#d8d8e8',
    players: [
      { n: 1,  name: '冥王 ゴルド', pos: 'GK', spd: 1.0,  shot: 1.0,  skills: ['abyss', 'nebula', 'abyssgate'], partner: 4 },
      { n: 2,  name: '鉄 ガイ',     pos: 'DF', spd: 0.97, shot: 0.95, skills: ['thundernet', 'blazetackle'] },
      { n: 3,  name: '影山 獄',     pos: 'DF', spd: 1.0,  shot: 0.95, skills: ['quake'] },
      { n: 4,  name: '黒鋼 ザン',   pos: 'DF', spd: 0.96, shot: 0.95, skills: ['thundernet', 'quake'] },
      { n: 5,  name: '夜叉 ヴォル', pos: 'DF', spd: 1.02, shot: 0.95, skills: ['spark', 'galebarrier'] },
      { n: 6,  name: 'ネクロ',      pos: 'MF', spd: 1.04, shot: 1.0,  skills: ['shadowstep', 'stormsnatch'] },
      { n: 7,  name: '闇乃 カイ',   pos: 'MF', spd: 1.02, shot: 1.05, skills: ['gaia', 'grandspear', 'earthwalk'] },
      { n: 8,  name: 'ルシフ',      pos: 'MF', spd: 1.0,  shot: 1.05, skills: ['hellfire', 'firewall'] },
      { n: 9,  name: '虚空 レイ',   pos: 'MF', spd: 1.05, shot: 1.0,  skills: ['darkphantom', 'galerush'] },
      { n: 10, name: 'ゼノ',        pos: 'FW', spd: 1.06, shot: 1.15, skills: ['meteor', 'darkphantom', 'shadowstep'] },
      { n: 11, name: '黒崎 冥',     pos: 'FW', spd: 1.07, shot: 1.1,  skills: ['blackstorm', 'nemesis', 'galerush'] },
    ],
  },
];

// ===== 難易度（CPU の強さ） =====
const DIFF = [
  { name: 'かんたん', spd: 0.9,  tackle: 0.6, skill: 0.45, gk: 0.6,  pass: 0.8 },
  { name: 'ふつう',   spd: 1.0,  tackle: 1.0, skill: 0.75, gk: 0.72, pass: 1.0 },
  { name: 'むずかしい', spd: 1.07, tackle: 1.5, skill: 0.92, gk: 0.82, pass: 1.15 },
];

// ===== 覚醒ドリブル：ゲージが100のときだけ。100消費して敵（GK以外）を全員ノックバック =====
const ULT = {};
for (const k in SKILLS) {
  const sk = SKILLS[k];
  if (sk.type === 'dribble') ULT[k] = Object.assign({}, sk, { name: sk.name + '・極', cost: 100, ultimate: true, base: k });
}
