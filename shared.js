/* BLOCKFEUER – gemeinsame Spieldaten (Server + Browser)
   Waffen, Aufsätze, Loadouts, Spielmodi, Karten, Raycasts, Kollision, Granatenphysik. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Shared = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------ Waffen
  // dmg: Körperschaden, head: Kopf-Multiplikator, rpm: Schuss/Minute, ads: Zielzeit (s),
  // spread: Grundstreuung (rad), move: Zusatzstreuung bei vollem Lauf, kick: Rückstoß pro Schuss (rad),
  // bloom: Streuungszuwachs pro Schuss, rk: Art des Nachladens (mag, shell, cyl)
  const WEAPONS = {
    pistol:   { name: 'P9 Pistole',   short: 'P9',       cls: 'pistol',  rk: 'mag',   dmg: 28,  head: 2.5, rpm: 420, auto: false, mag: 15, reload: 1.5, ads: 0.14, spread: 0.008,  move: 0.015, kick: 0.012, bloom: 0.004, pellets: 1, fs: 14, fe: 45,  fmin: 0.6,  speed: 1.0 },
    revolver: { name: 'R8 Revolver',  short: 'R8',       cls: 'pistol',  rk: 'cyl',   dmg: 58,  head: 2.4, rpm: 150, auto: false, mag: 6,  reload: 2.4, ads: 0.16, spread: 0.005,  move: 0.02,  kick: 0.045, bloom: 0.01,  pellets: 1, fs: 20, fe: 60,  fmin: 0.7,  speed: 1.0 },
    smg:      { name: 'Viper SMG',    short: 'Viper',    cls: 'smg',     rk: 'mag',   dmg: 20,  head: 2.4, rpm: 820, auto: true,  mag: 30, reload: 1.9, ads: 0.16, spread: 0.016,  move: 0.012, kick: 0.009, bloom: 0.002, pellets: 1, fs: 10, fe: 40,  fmin: 0.55, speed: 1.0 },
    shotgun:  { name: 'Breacher',     short: 'Breacher', cls: 'shotgun', rk: 'shell', dmg: 14,  head: 1.5, rpm: 80,  auto: false, mag: 7,  reload: 2.6, ads: 0.2,  spread: 0.055,  move: 0.01,  kick: 0.06,  bloom: 0,     pellets: 8, fs: 5,  fe: 22,  fmin: 0.2,  speed: 0.95, shell: 0.42 },
    m4:       { name: 'M4 Karabiner', short: 'M4',       cls: 'rifle',   rk: 'mag',   dmg: 30,  head: 3.4, rpm: 690, auto: true,  mag: 30, reload: 2.3, ads: 0.2,  spread: 0.005,  move: 0.045, kick: 0.011, bloom: 0.003, pellets: 1, fs: 25, fe: 70,  fmin: 0.75, speed: 0.95 },
    ak:       { name: 'AR-47',        short: 'AR-47',    cls: 'rifle',   rk: 'mag',   dmg: 35,  head: 4.0, rpm: 600, auto: true,  mag: 30, reload: 2.5, ads: 0.21, spread: 0.006,  move: 0.05,  kick: 0.015, bloom: 0.004, pellets: 1, fs: 25, fe: 70,  fmin: 0.8,  speed: 0.95 },
    lmg:      { name: 'Brute LMG',    short: 'Brute',    cls: 'lmg',     rk: 'mag',   dmg: 31,  head: 3.0, rpm: 760, auto: true,  mag: 80, reload: 4.2, ads: 0.3,  spread: 0.014,  move: 0.06,  kick: 0.010, bloom: 0.002, pellets: 1, fs: 25, fe: 70,  fmin: 0.75, speed: 0.85 },
    scout:    { name: 'Scout',        short: 'Scout',    cls: 'sniper',  rk: 'mag',   dmg: 78,  head: 3.0, rpm: 50,  auto: false, mag: 10, reload: 2.6, ads: 0.25, spread: 0.0008, move: 0.05,  kick: 0.03,  bloom: 0,     pellets: 1, fs: 80, fe: 120, fmin: 0.9,  speed: 0.97, scope: 26, noscope: 0.035, bolt: true },
    longbow:  { name: 'Longbow .50',  short: 'Longbow',  cls: 'sniper',  rk: 'mag',   dmg: 120, head: 3.0, rpm: 40,  auto: false, mag: 5,  reload: 3.2, ads: 0.32, spread: 0.0005, move: 0.09,  kick: 0.05,  bloom: 0,     pellets: 1, fs: 99, fe: 150, fmin: 0.95, speed: 0.86, scope: 16, noscope: 0.06, bolt: true },
    knife:    { name: 'Kampfmesser',  short: 'Messer',   cls: 'knife',   rk: 'none',  dmg: 55,  head: 1.0, rpm: 110, auto: true,  mag: 0,  reload: 0,   ads: 0.2,  spread: 0,      move: 0,     kick: 0,     bloom: 0,     pellets: 1, fs: 9,  fe: 10,  fmin: 1,    speed: 1.14, melee: true, range: 2.3 }
  };
  // Gun-Game-Leiter: jeder Kill = nächste Stufe, letzte Stufe = Messer-Kill zum Sieg
  const LADDER = ['pistol', 'revolver', 'smg', 'shotgun', 'm4', 'ak', 'lmg', 'scout', 'longbow', 'knife'];
  const PRIMARY = ['smg', 'shotgun', 'm4', 'ak', 'lmg', 'scout', 'longbow'];
  const SECONDARY = ['pistol', 'revolver'];
  const CLASS_NAME = { pistol: 'Pistole', smg: 'MP', shotgun: 'Schrotflinte', rifle: 'Sturmgewehr', lmg: 'MG', sniper: 'Scharfschütze', knife: 'Nahkampf' };

  // ---------------------------------------------------------------- Aufsätze
  const ATT = {
    sight: {
      iron:   { n: 'Kimme & Korn', d: 'Freie Sicht, leichter Zoom.', zoom: 1.15 },
      reddot: { n: 'Rotpunkt',     d: 'Klarer Leuchtpunkt, 1,3-fach.', zoom: 1.3, ads: 1.05 },
      holo:   { n: 'Holo',         d: 'Ring-Absehen, schnell im Ziel.', zoom: 1.25, ads: 0.95 },
      acog:   { n: 'ACOG 3,5×',    d: 'Für weite Distanzen, langsamer.', zoom: 2.4, ads: 1.3 },
      scope:  { n: 'Zielfernrohr', d: 'Starker Zoom, nur Scharfschützen.', zoom: 0, ads: 1.15 }
    },
    muzzle: {
      none: { n: 'Keine',         d: 'Standard.' },
      sup:  { n: 'Schalldämpfer', d: 'Leise, keine Leuchtspur, −15 % Reichweite.', range: 0.85, recoil: 0.95 },
      comp: { n: 'Kompensator',   d: '−25 % Rückstoß.', recoil: 0.75 }
    },
    under: {
      none:  { n: 'Keiner',        d: 'Standard.' },
      vgrip: { n: 'Vertikalgriff', d: '−20 % Rückstoß.', recoil: 0.8, ads: 1.05 },
      agrip: { n: 'Winkelgriff',   d: '30 % schneller zielen.', ads: 0.7 },
      laser: { n: 'Laser',         d: '−35 % Streuung aus der Hüfte. Der Strahl ist für alle sichtbar!', hip: 0.65 }
    },
    mag: {
      std:  { n: 'Standard',     d: 'Standardmagazin.' },
      ext:  { n: 'Erweitert',    d: '+50 % Munition, 15 % langsameres Nachladen.', mag: 1.5, reload: 1.15 },
      fast: { n: 'Schnellzieh',  d: '30 % schneller nachladen.', reload: 0.7 }
    }
  };
  const ATT_SLOTS = ['sight', 'muzzle', 'under', 'mag'];
  const ATT_SLOT_NAME = { sight: 'Visier', muzzle: 'Mündung', under: 'Unterlauf', mag: 'Magazin' };
  function compat(key) {
    const c = WEAPONS[key] && WEAPONS[key].cls;
    if (!c || c === 'knife') return null;
    if (c === 'pistol') return { sight: ['iron', 'reddot'], muzzle: ['none', 'sup', 'comp'], under: ['none', 'laser'], mag: ['std', 'ext', 'fast'] };
    if (c === 'shotgun') return { sight: ['iron', 'reddot', 'holo'], muzzle: ['none', 'comp'], under: ['none', 'vgrip', 'agrip', 'laser'], mag: ['std', 'ext', 'fast'] };
    if (c === 'sniper') return { sight: ['scope', 'acog', 'reddot'], muzzle: ['none', 'sup', 'comp'], under: ['none', 'vgrip', 'laser'], mag: ['std', 'ext', 'fast'] };
    return { sight: ['iron', 'reddot', 'holo', 'acog'], muzzle: ['none', 'sup', 'comp'], under: ['none', 'vgrip', 'agrip', 'laser'], mag: ['std', 'ext', 'fast'] };
  }
  // effektive Werte einer Waffe mit Aufsätzen
  function stats(key, a) {
    const w = WEAPONS[key];
    if (!w || w.melee) return { mag: 0, reload: 0, recoil: 1, ads: 0.2, hip: 1, range: 1, zoom: 1, sight: 'none', sup: false, overlay: false, laser: false };
    const c = compat(key); a = a || {};
    const pick = s => (c[s].indexOf(a[s]) >= 0 ? a[s] : c[s][0]);
    const sel = { sight: pick('sight'), muzzle: pick('muzzle'), under: pick('under'), mag: pick('mag') };
    let recoil = 1, ads = w.ads, reload = w.reload, mag = w.mag, hip = 1, range = 1;
    for (const s of ATT_SLOTS) {
      const o = ATT[s][sel[s]];
      if (o.recoil) recoil *= o.recoil;
      if (o.ads) ads *= o.ads;
      if (o.reload) reload *= o.reload;
      if (o.mag) mag = Math.round(mag * o.mag);
      if (o.hip) hip *= o.hip;
      if (o.range) range *= o.range;
    }
    const zoom = sel.sight === 'scope' ? 74 / w.scope : ATT.sight[sel.sight].zoom;
    return { mag, reload, recoil, ads, hip, range, zoom, sight: sel.sight, sup: sel.muzzle === 'sup', overlay: sel.sight === 'scope' || sel.sight === 'acog', laser: sel.under === 'laser', att: sel };
  }
  function sanitizeLoadout(lo) {
    lo = lo && typeof lo === 'object' ? lo : {};
    const out = { p: PRIMARY.indexOf(lo.p) >= 0 ? lo.p : 'm4', s: SECONDARY.indexOf(lo.s) >= 0 ? lo.s : 'pistol', att: {}, skin: {} };
    // Zombie-Modus: gekaufte Waffen (Primär anfangs keine, Sekundär Pistole)
    out.zp = PRIMARY.indexOf(lo.zp) >= 0 ? lo.zp : null; out.zs = SECONDARY.indexOf(lo.zs) >= 0 ? lo.zs : 'pistol';
    if (lo.skin && typeof lo.skin === 'object') for (const k of Object.keys(WEAPONS)) if (FINISHES[lo.skin[k]]) out.skin[k] = lo.skin[k];
    for (const k of Object.keys(WEAPONS)) {
      const c = compat(k); if (!c) continue;
      const a = lo.att && typeof lo.att === 'object' && lo.att[k] && typeof lo.att[k] === 'object' ? lo.att[k] : {};
      const def = { sight: k === 'm4' || k === 'smg' ? 'reddot' : c.sight[0], muzzle: 'none', under: 'none', mag: 'std' };
      out.att[k] = {};
      for (const s of ATT_SLOTS) out.att[k][s] = c[s].indexOf(a[s]) >= 0 ? a[s] : (c[s].indexOf(def[s]) >= 0 ? def[s] : c[s][0]);
    }
    return out;
  }
  function randomLoadout(rnd) {
    rnd = rnd || Math.random;
    const pickArr = a => a[Math.floor(rnd() * a.length) % a.length];
    const lo = { p: pickArr(PRIMARY), s: pickArr(SECONDARY), att: {} };
    for (const k of Object.keys(WEAPONS)) { const c = compat(k); if (!c) continue; lo.att[k] = {}; for (const s of ATT_SLOTS) lo.att[k][s] = pickArr(c[s]); }
    return sanitizeLoadout(lo);
  }

  // ------------------------------------------------------------------ Skins
  // Seltenheit: Name, Farbe, Gewicht in Prozent
  const RARITY = [
    { n: 'Gewöhnlich', c: '#9aa8b8', w: 55 }, { n: 'Selten', c: '#4b82ff', w: 25 }, { n: 'Episch', c: '#a855f7', w: 13 },
    { n: 'Legendär', c: '#ff3d6e', w: 5.5 }, { n: 'Mythisch', c: '#ffc531', w: 1.5 }
  ];
  // m: Muster im Shader (17 Tarn, 18 Streifen, 19 Metall, 20 Verlauf, 21 Karbon, 22 Galaxie)
  const FINISHES = {
    wald:    { n: 'Waldtarn',        r: 0, m: 17, c: [0.33, 0.39, 0.22], c2: [0.13, 0.15, 0.09] },
    sand:    { n: 'Wüstentarn',      r: 0, m: 17, c: [0.74, 0.63, 0.44], c2: [0.44, 0.35, 0.23] },
    urban:   { n: 'Stadttarn',       r: 0, m: 17, c: [0.58, 0.59, 0.61], c2: [0.24, 0.25, 0.27] },
    rost:    { n: 'Rost',            r: 0, m: 17, c: [0.55, 0.3, 0.15], c2: [0.27, 0.15, 0.09] },
    arktis:  { n: 'Arktis',          r: 1, m: 17, c: [0.9, 0.92, 0.95], c2: [0.5, 0.56, 0.64] },
    tiger:   { n: 'Tiger',           r: 1, m: 18, c: [0.92, 0.52, 0.1], c2: [0.07, 0.05, 0.04] },
    kobalt:  { n: 'Kobalt',          r: 1, m: 19, c: [0.16, 0.32, 0.8], c2: [0.05, 0.1, 0.3] },
    zebra:   { n: 'Zebra',           r: 1, m: 18, c: [0.93, 0.93, 0.9], c2: [0.06, 0.06, 0.07] },
    neon:    { n: 'Neonrausch',      r: 2, m: 18, c: [0.2, 1, 0.45], c2: [0.75, 0.1, 0.85] },
    sunset:  { n: 'Sonnenuntergang', r: 2, m: 20, c: [1, 0.58, 0.15], c2: [0.45, 0.1, 0.58] },
    karbon:  { n: 'Karbon',          r: 2, m: 21, c: [0.2, 0.2, 0.22], c2: [0.06, 0.06, 0.07] },
    ozean:   { n: 'Ozean',           r: 2, m: 20, c: [0.05, 0.62, 0.8], c2: [0.03, 0.1, 0.38] },
    drache:  { n: 'Drachenfeuer',    r: 3, m: 20, c: [1, 0.85, 0.2], c2: [0.8, 0.06, 0.02] },
    chrom:   { n: 'Chrom',           r: 3, m: 19, c: [0.88, 0.9, 0.93], c2: [0.38, 0.4, 0.44] },
    gold:    { n: 'Reines Gold',     r: 4, m: 19, c: [1, 0.78, 0.25], c2: [0.58, 0.38, 0.06] },
    galaxie: { n: 'Galaxie',         r: 4, m: 22, c: [0.07, 0.03, 0.16], c2: [0.6, 0.22, 0.9] }
  };
  // zieht einen zufälligen Skin, z. B. "ak:tiger". Messer-Skins gibt es nur ab Legendär.
  function rollSkin(rnd) {
    rnd = rnd || Math.random;
    let x = rnd() * 100, r = 0;
    while (r < RARITY.length - 1 && x >= RARITY[r].w) { x -= RARITY[r].w; r++; }
    const fs = Object.keys(FINISHES).filter(k => FINISHES[k].r === r);
    const pool = Object.keys(WEAPONS).filter(k => r >= 3 || k !== 'knife');
    return pool[Math.floor(rnd() * pool.length) % pool.length] + ':' + fs[Math.floor(rnd() * fs.length) % fs.length];
  }
  function skinInfo(id) {
    const p = String(id || '').split(':'), w = p[0], f = p[1];
    if (!WEAPONS[w] || !FINISHES[f]) return null;
    const F = FINISHES[f];
    return { id: w + ':' + f, w, f, F, r: F.r, rarity: RARITY[F.r], name: WEAPONS[w].short + ' | ' + F.n };
  }

  // ------------------------------------------------------------- Spielmodi
  const MODES = {
    gungame: { n: 'Gun Game', d: 'Zwei Kills = nächste Waffe. Messer-Kill auf der letzten Stufe gewinnt.', kpl: 2 },
    dm:      { n: 'Deathmatch', d: 'Freie Waffenwahl. Wer zuerst 40 Kills hat, gewinnt.', limit: 40 },
    zombies: { n: 'Zombies', d: 'Gemeinsam gegen Wellen von Zombies auf der Tankstelle. Kills bringen Coins – damit kauft ihr Waffen, Munition, Granaten, Medipacks und Geschütztürme (Taste B).', coop: true, map: 'tanke' },
    range:   { n: 'Schießstand', d: 'Alle Waffen ausprobieren und auf Zielscheiben schießen.', practice: true },
    ctp:     { n: 'Punkt erobern', d: 'Team Blau gegen Team Rot. Erobert den Punkt in der Mitte und haltet ihn – 1 Punkt pro Sekunde, 180 gewinnen.', limit: 180, teams: true, capTime: 7 }
  };
  // welche Waffe hält ein Spieler in einem Slot? 0 = Primär, 1 = Sekundär, 2 = Messer
  // ---------------------------------------------------------------- Zombies
  const ZTYPES = [
    { k: 'walker', n: 'Zombie', hp: 100, sp: 2.5, dmg: 14, coins: 10, s: 1 },
    { k: 'runner', n: 'Läufer', hp: 55, sp: 4.9, dmg: 9, coins: 15, s: 0.92 },
    { k: 'brute', n: 'Koloss', hp: 520, sp: 1.9, dmg: 34, coins: 60, s: 1.35 }
  ];
  const TURRETS = {
    mg:    { n: 'MG-Geschützturm', dmg: 22, rpm: 300, range: 24, life: 75 },
    heavy: { n: 'Schweres Geschütz', dmg: 120, rpm: 45, range: 45, life: 90 }
  };
  const ZSHOP = [
    { id: 'w:revolver', cat: 'Waffen', n: 'R8 Revolver', d: 'Sekundärwaffe, hoher Schaden', c: 200 },
    { id: 'w:smg', cat: 'Waffen', n: 'Viper SMG', d: 'Schnell, ideal gegen Läufer', c: 400 },
    { id: 'w:shotgun', cat: 'Waffen', n: 'Breacher', d: 'Schrotflinte für den Nahkampf', c: 500 },
    { id: 'w:scout', cat: 'Waffen', n: 'Scout', d: 'Scharfschützengewehr', c: 600 },
    { id: 'w:m4', cat: 'Waffen', n: 'M4 Karabiner', d: 'Allrounder', c: 750 },
    { id: 'w:ak', cat: 'Waffen', n: 'AR-47', d: 'Mehr Schaden, mehr Rückstoß', c: 800 },
    { id: 'w:longbow', cat: 'Waffen', n: 'Longbow .50', d: 'Durchschlagskraft gegen Kolosse', c: 1000 },
    { id: 'w:lmg', cat: 'Waffen', n: 'Brute LMG', d: '80 Schuss im Magazin', c: 1200 },
    { id: 'ammo', cat: 'Ausrüstung', n: 'Munition', d: 'Reserve aller Waffen auffüllen', c: 150 },
    { id: 'n:he', cat: 'Ausrüstung', n: 'HE-Granate', d: 'Flächenschaden (max. 4)', c: 150, max: 4 },
    { id: 'n:flash', cat: 'Ausrüstung', n: 'Blendgranate', d: 'Betäubt Zombies 4 s (max. 3)', c: 100, max: 3 },
    { id: 'med', cat: 'Ausrüstung', n: 'Medipack', d: 'Volle Gesundheit', c: 200 },
    { id: 'armor', cat: 'Ausrüstung', n: 'Schutzweste', d: 'Halbiert erlittenen Schaden (100 Punkte)', c: 300 },
    { id: 't:mg', cat: 'Stationär', n: 'MG-Geschützturm', d: 'Feuert 75 s automatisch, 24 m Reichweite', c: 900 },
    { id: 't:heavy', cat: 'Stationär', n: 'Schweres Geschütz', d: 'Langsam, sehr stark, 45 m, 90 s', c: 1500 }
  ];
  const TEAMS = [{ n: 'Blau', hue: 212, css: '#4f8dff' }, { n: 'Rot', hue: 4, css: '#ff4f45' }];
  function slotWeapon(mode, lvl, lo, slot) {
    if (slot === 2) return 'knife';
    if (mode === 'zombies') return slot === 0 ? (lo && lo.zp) || null : slot === 1 ? (lo && lo.zs) || 'pistol' : null;
    if (mode === 'gungame') return slot === 0 ? LADDER[Math.max(0, Math.min(LADDER.length - 1, lvl | 0))] : null;
    if (!lo) return slot === 0 ? 'm4' : 'pistol';
    return slot === 0 ? lo.p : slot === 1 ? lo.s : null;
  }

  const NADES = {
    he:    { name: 'HE-Granate',   fuse: 1.7, radius: 7.5, dmg: 115 },
    flash: { name: 'Blendgranate', fuse: 1.5 },
    smoke: { name: 'Rauchgranate', fuse: 1.9, duration: 15, radius: 3.0 }
  };
  const ZONE_MULT = [0, 1, 0.75]; // [Kopf -> Waffenwert, Körper, Beine]
  const PLAYER = { R: 0.3, H: 1.8, HC: 1.3, EYE: 1.62, EYEC: 1.12, STEP: 0.45, RUN: 6.2, JUMP: 6.8, G: 18 };

  // ------------------------------------------------------------------- Karten
  // Materialien (vom Shader als Muster gezeichnet)
  const MAT = { plain: 0, sand: 1, plaster: 2, brick: 3, concrete: 4, asphalt: 5, tiles: 6, wood: 7, metal: 8, glass: 9, stone: 10, roof: 11, grass: 12, lamp: 13, paint: 14, sky: 15, mark: 16 };
  let boxes = [], deco = [], props = [], hid = 0;
  const MAP = { id: '', name: '', boxes: boxes, deco: deco, props: props, spawns: [], items: [], HX: 0, HZ: 0, env: null };
  // h = 1: Kasten ist nur Ersatzgrafik – wird nicht gezeichnet, wenn die 3D-Modelle geladen sind (Kollision bleibt immer gleich)
  function mk(x0, z0, x1, z1, y0, y1, c, m) {
    const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), c: c, m: m || 0 };
    if (hid) b.h = 1;
    return b;
  }
  // Maße der Kenney-Stadtmodelle (Breite x, Höhe y, Tiefe z; Vorderseite zeigt nach -z)
  const KD = { 'a': [0.884, 1.293, 0.940], 'b': [0.970, 1.293, 0.940], 'c': [0.884, 0.893, 1.090], 'd': [0.840, 1.293, 0.900], 'e': [1.640, 0.893, 1.008], 'f': [0.840, 1.693, 1.030], 'g': [0.970, 1.693, 0.922], 'h': [0.884, 1.293, 1.008], 'i': [1.240, 1.680, 1.302], 'j': [2.084, 1.693, 1.340], 'k': [2.084, 1.470, 0.942], 'l': [1.370, 2.270, 1.402], 'm': [1.240, 3.150, 1.242], 'n': [2.320, 2.480, 1.820],
    'skyscraper-a': [1.360, 2.880, 1.360], 'skyscraper-b': [1.360, 4.480, 1.360], 'skyscraper-c': [1.280, 4.080, 1.388], 'skyscraper-d': [1.280, 5.470, 1.388], 'skyscraper-e': [1.295, 4.080, 1.242], 'parasol-a': [0.346, 0.450, 0.400], 'parasol-b': [0.346, 0.450, 0.400],
    'ld-a': [0.5, 2.0, 0.5], 'ld-b': [0.5, 2.225, 0.5], 'ld-c': [0.5, 2.25, 0.5], 'ld-d': [0.5, 1.75, 0.5], 'ld-e': [0.5, 1.8, 0.5], 'ld-f': [0.5, 2.0, 0.5], 'ld-g': [0.5, 2.0, 0.5], 'ld-h': [0.5, 2.1, 0.5], 'ld-i': [0.5, 1.775, 0.5], 'ld-j': [0.5, 1.75, 0.5], 'ld-k': [0.5, 1.55, 0.5], 'ld-l': [0.5, 1.85, 0.5], 'ld-m': [0.5, 1.975, 0.5], 'ld-wide-a': [1.0, 1.1, 0.5], 'ld-wide-b': [1.0, 1.15, 0.5] };
  const kname = k => k.startsWith('ld-') ? 'low-detail-building-' + k.slice(3) : k.startsWith('parasol') ? 'detail-' + k : 'building-' + k;
  function makeCtx() {
    const B = (x0, z0, x1, z1, y0, y1, c, m) => { boxes.push(mk(x0, z0, x1, z1, y0, y1, c, m)); };
    const D = (x0, z0, x1, z1, y0, y1, c, m) => { deco.push(mk(x0, z0, x1, z1, y0, y1, c, m)); };
    // punktsymmetrisch (180° gedreht) – macht die Karte für alle Seiten fair
    const S = (x0, z0, x1, z1, y0, y1, c, m, c2) => { B(x0, z0, x1, z1, y0, y1, c, m); B(-x0, -z0, -x1, -z1, y0, y1, c2 || c, m); };
    const SD = (x0, z0, x1, z1, y0, y1, c, m, c2) => { D(x0, z0, x1, z1, y0, y1, c, m); D(-x0, -z0, -x1, -z1, y0, y1, c2 || c, m); };
    // 3D-Modell: k = Kurzname, (x, z) = Mitte der Grundfläche, ry = Drehung, s = [sx, sy, sz], v = Farbvariante 0..2
    const P = (k, x, z, ry, s, v, o) => { props.push({ m: kname(k), x, y: (o && o.y) || 0, z, ry, s, v: v || 0, far: !!(o && o.far) }); };
    const SP = (k, x, z, ry, s, v, o, v2) => { P(k, x, z, ry, s, v, o); P(k, -x, -z, ry + Math.PI, s, v2 === undefined ? (v + 1) % 3 : v2, o); };
    const hide = on => { hid = on ? 1 : 0; };
    return { B, D, S, SD, P, SP, hide };
  }
  function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // ---------------------------------------------------- Karte 1: Wüstendorf
  function buildWueste(K) {
    const { B, S } = K, HX = 28, HZ = 20;
    const C = {
      sand: [0.78, 0.68, 0.49], wall: [0.86, 0.76, 0.57], wall2: [0.74, 0.62, 0.45], trim: [0.52, 0.42, 0.31],
      wood: [0.60, 0.43, 0.24], wood2: [0.50, 0.35, 0.19], stone: [0.62, 0.61, 0.58], metal: [0.36, 0.38, 0.42],
      blue: [0.20, 0.38, 0.62], red: [0.64, 0.23, 0.18], green: [0.24, 0.46, 0.31], roof: [0.45, 0.30, 0.24]
    };
    const P = MAT.plaster;
    B(-HX - 1, -HZ - 1, HX + 1, HZ + 1, -1, 0, C.sand, MAT.sand);
    B(-HX - 1, -HZ - 1, HX + 1, -HZ, 0, 7, C.wall, P);
    B(-HX - 1, HZ, HX + 1, HZ + 1, 0, 7, C.wall, P);
    B(-HX - 1, -HZ, -HX, HZ, 0, 7, C.wall, P);
    B(HX, -HZ, HX + 1, HZ, 0, 7, C.wall, P);
    S(8.6, -20, 9.4, -13, 0, 3.2, C.wall2, P);
    S(8.6, -13, 9.4, -10.5, 2.3, 3.2, C.trim, MAT.wood);
    S(8.6, -10.5, 9.4, 2, 0, 3.2, C.wall2, P);
    S(8.6, 2, 9.4, 5, 2.3, 3.2, C.trim, MAT.wood);
    S(8.6, 5, 9.4, 13.5, 0, 3.2, C.wall2, P);
    B(-1.6, -1.6, 1.6, 1.6, 0, 1.1, C.stone, MAT.stone);
    B(-0.5, -0.5, 0.5, 0.5, 1.1, 2.7, C.stone, MAT.stone);
    S(-6.5, -11, -0.5, -8.6, 0, 2.6, C.blue, MAT.metal, C.red);
    S(3, -6, 4.2, -4.8, 0, 1.1, C.wood, MAT.wood);
    S(4.2, -6, 5.4, -4.8, 0, 1.1, C.wood2, MAT.wood);
    S(3.6, -5.95, 4.8, -4.85, 1.1, 2.2, C.wood, MAT.wood);
    S(-3, -16, 3, -15.3, 0, 1.25, C.wall2, P);
    S(-7.6, 4, -6.4, 5.2, 0, 1.1, C.wood2, MAT.wood);
    S(23, -12, 28, 8, 2.3, 2.6, C.metal, MAT.metal);
    S(23, -12, 23.5, -11.5, 0, 2.3, C.trim, MAT.wood);
    S(23, -2.25, 23.5, -1.75, 0, 2.3, C.trim, MAT.wood);
    S(23, 7.5, 23.5, 8, 0, 2.3, C.trim, MAT.wood);
    S(23, -12, 23.25, -4, 2.6, 3.6, C.trim, MAT.wood);
    S(23, 0, 23.25, 8, 2.6, 3.6, C.trim, MAT.wood);
    S(23, -12, 28, -11.75, 2.6, 3.6, C.trim, MAT.wood);
    for (let i = 0; i < 9; i++) S(25, 8 + i * 0.55, 28, 8 + (i + 1) * 0.55, 0, 2.6 - (i + 1) * 0.26, C.stone, MAT.stone);
    S(13, -4, 15.4, 2, 0, 2.6, C.green, MAT.metal, C.blue);
    S(15.4, -1.2, 16.6, 0, 0, 1.1, C.wood, MAT.wood);
    S(17, 6, 21, 6.6, 0, 1.3, C.wall2, P);
    S(18.5, -9, 19.7, -7.8, 0, 1.1, C.wood, MAT.wood);
    S(19.7, -9, 20.9, -7.8, 0, 1.1, C.wood2, MAT.wood);
    S(13.5, -17, 14.7, -15.8, 0, 1.1, C.wood2, MAT.wood);
    S(12, 12, 15, 12.5, 0, 3.2, C.wall, P);
    S(17, 12, 20, 12.5, 0, 3.2, C.wall, P);
    S(15, 12, 17, 12.5, 2.3, 3.2, C.trim, MAT.wood);
    S(12, 12.5, 12.5, 14.5, 0, 3.2, C.wall, P);
    S(12, 16.5, 12.5, 20, 0, 3.2, C.wall, P);
    S(12, 14.5, 12.5, 16.5, 2.3, 3.2, C.trim, MAT.wood);
    S(19.5, 12.5, 20, 15, 0, 3.2, C.wall, P);
    S(19.5, 17, 20, 20, 0, 3.2, C.wall, P);
    S(19.5, 15, 20, 17, 0, 1.1, C.wall, P);
    S(19.5, 15, 20, 17, 2.1, 3.2, C.trim, MAT.wood);
    S(11.8, 11.8, 20.2, 20, 3.2, 3.5, C.roof, MAT.roof);
    S(17.6, 18.2, 19, 19.4, 0, 1.0, C.wood, MAT.wood);
    const sp = [[18, -16], [25.5, -16.5], [20.5, 3], [16, 16.5], [0, -18.2], [5.5, -1]];
    const spawns = [];
    for (const s of sp) { spawns.push([s[0], 1.5, s[1]]); spawns.push([-s[0], 1.5, -s[1]]); }
    return {
      HX, HZ, spawns, items: [[0, 1, -12.6], [0, 1, 12.6], [25.5, 3.6, -10], [-25.5, 3.6, 10]], point: [0, 0, 0, 4.2],
      env: { sun: [0.45, 0.8, 0.35], sunCol: [3.3, 2.95, 2.4], ambT: [0.32, 0.37, 0.48], ambB: [0.26, 0.21, 0.15], fog: [0.88, 0.82, 0.7], fogD: 0.009, skyZ: [0.26, 0.48, 0.8], skyH: [0.9, 0.84, 0.72], sunC: [1, 0.9, 0.7], clouds: 0.35 }
    };
  }

  // --------------------------------------------------- Karte 2: Altstadt
  function buildStadt(K) {
    const { B, S, SD, SP, hide } = K, HX = 46, HZ = 38;
    const C = {
      asphalt: [0.31, 0.31, 0.33], walk: [0.63, 0.61, 0.57], plaza: [0.68, 0.62, 0.53], stone: [0.66, 0.64, 0.6], stoneL: [0.78, 0.76, 0.72],
      brick: [0.6, 0.3, 0.22], brick2: [0.5, 0.33, 0.26], plY: [0.86, 0.76, 0.55], plW: [0.87, 0.85, 0.79], plB: [0.6, 0.67, 0.72], plR: [0.8, 0.52, 0.42], plG: [0.6, 0.7, 0.58],
      concrete: [0.64, 0.64, 0.62], trim: [0.92, 0.9, 0.84], glass: [0.15, 0.2, 0.26], wood: [0.55, 0.38, 0.22], floor: [0.52, 0.38, 0.25],
      metal: [0.42, 0.44, 0.47], grass: [0.32, 0.5, 0.24], hedge: [0.2, 0.38, 0.18], trunk: [0.36, 0.26, 0.18], leaves: [0.27, 0.47, 0.2],
      mark: [0.93, 0.93, 0.88], dark: [0.12, 0.12, 0.13], roofC: [0.45, 0.45, 0.46], lamp: [1, 0.85, 0.55], awnR: [0.68, 0.16, 0.14], awnG: [0.16, 0.42, 0.3], awnB: [0.16, 0.3, 0.55],
      orange: [0.8, 0.42, 0.14], cBlue: [0.18, 0.34, 0.56], cGreen: [0.22, 0.45, 0.3], sand: [0.72, 0.64, 0.48], dump: [0.18, 0.36, 0.24],
      cars: [[0.62, 0.12, 0.1], [0.15, 0.28, 0.55], [0.86, 0.86, 0.84], [0.88, 0.66, 0.1], [0.2, 0.21, 0.23], [0.3, 0.45, 0.32]]
    };
    const M = MAT;
    B(-HX - 1, -HZ - 1, HX + 1, HZ + 1, -1, 0, C.asphalt, M.asphalt);

    // Hilfsfunktionen für Fassaden (r = [x0, z0, x1, z1]); d0..d1 = Abstand nach außen
    const fbox = (fn, side, r, a, b, y0, y1, d0, d1, c, m) => {
      if (side === 'n') fn(a, r[1] - d1, b, r[1] - d0, y0, y1, c, m);
      else if (side === 's') fn(a, r[3] + d0, b, r[3] + d1, y0, y1, c, m);
      else if (side === 'w') fn(r[0] - d1, a, r[0] - d0, b, y0, y1, c, m);
      else fn(r[2] + d0, a, r[2] + d1, b, y0, y1, c, m);
    };
    const along = (side, r) => (side === 'n' || side === 's' ? [r[0], r[2]] : [r[1], r[3]]);
    function windows(r, h, o) {
      o = o || {};
      const sides = o.sides || ['n', 's', 'w', 'e'], fh = o.fh || 3.2, start = o.start === undefined ? 1 : o.start;
      const floors = Math.floor((h - 0.8) / fh), trim = o.trim || C.trim;
      for (const sd of sides) {
        const A = along(sd, r), L = A[1] - A[0], n = Math.max(1, Math.floor((L - 0.6) / 2.7)), sp = L / n, w = Math.min(1.25, sp - 0.8);
        for (let i = 0; i < n; i++) {
          const c = A[0] + sp * (i + 0.5);
          for (let f = start; f < floors; f++) {
            const y = f * fh + 0.95;
            fbox(SD, sd, r, c - w / 2, c + w / 2, y, y + 1.5, 0, 0.035, C.glass, M.glass);
            fbox(SD, sd, r, c - w / 2 - 0.12, c + w / 2 + 0.12, y - 0.14, y, 0, 0.13, trim, M.plaster);
            fbox(SD, sd, r, c - w / 2 - 0.12, c + w / 2 + 0.12, y + 1.5, y + 1.68, 0, 0.07, trim, M.plaster);
          }
          if (o.shop && o.shop.indexOf(sd) >= 0 && sp > 1.6) {
            const door = i % 3 === 1;
            if (door) fbox(SD, sd, r, c - 0.55, c + 0.55, 0, 2.3, 0, 0.04, C.wood, M.wood);
            else fbox(SD, sd, r, c - sp / 2 + 0.35, c + sp / 2 - 0.35, 0.55, 2.5, 0, 0.035, C.glass, M.glass);
            fbox(SD, sd, r, c - sp / 2, c + sp / 2, 2.75, 2.85, 0, 1.1, o.awn || C.awnR, M.plain);
          }
        }
      }
    }
    function block(r, h, c, m, o) {
      o = o || {};
      S(r[0], r[1], r[2], r[3], 0, h, c, m);
      SD(r[0] - 0.2, r[1] - 0.2, r[2] + 0.2, r[3] + 0.2, h - 0.45, h - 0.15, o.trim || C.trim, M.plaster);
      SD(r[0] - 0.06, r[1] - 0.06, r[2] + 0.06, r[3] + 0.06, 0, 0.55, C.stone, M.stone);
      if (o.roofbox) SD(r[0] + 1, r[1] + 1, r[0] + 3, r[1] + 2.4, h, h + 1.4, C.metal, M.metal);
      windows(r, h, o);
    }
    // begehbares Haus mit Türen, Fenstern, Zwischendecke und Treppe
    function house(r, o) {
      const x0 = r[0], z0 = r[1], x1 = r[2], z1 = r[3], t = 0.3, fh = o.fh || 3.4, F = o.floors || 1, c = o.c, m = o.m;
      const side = {
        n: { box: (a, b, y0, y1) => S(a, z0, b, z0 + t, y0, y1, c, m), A: [x0, x1] },
        s: { box: (a, b, y0, y1) => S(a, z1 - t, b, z1, y0, y1, c, m), A: [x0, x1] },
        w: { box: (a, b, y0, y1) => S(x0, a, x0 + t, b, y0, y1, c, m), A: [z0 + t, z1 - t] },
        e: { box: (a, b, y0, y1) => S(x1 - t, a, x1, b, y0, y1, c, m), A: [z0 + t, z1 - t] }
      };
      for (const sd of ['n', 's', 'w', 'e']) for (let f = 0; f < F; f++) {
        const yb = f * fh, yt = (f + 1) * fh;
        const ops = (o.open || []).filter(p => p.s === sd && (p.f || 0) === f).sort((p, q) => p.a - q.a);
        let cur = side[sd].A[0];
        for (const p of ops) {
          if (p.a > cur) side[sd].box(cur, p.a, yb, yt);
          if (p.y0 > 0) side[sd].box(p.a, p.b, yb, yb + p.y0);
          if (yb + p.y1 < yt) side[sd].box(p.a, p.b, yb + p.y1, yt);
          cur = p.b;
          if (p.y0 > 0) fbox(SD, sd, r, p.a - 0.08, p.b + 0.08, yb + p.y0 - 0.12, yb + p.y0, 0, 0.13, C.trim, M.plaster);
          fbox(SD, sd, r, p.a - 0.08, p.b + 0.08, yb + p.y1, yb + p.y1 + 0.16, 0, 0.07, C.trim, M.plaster);
        }
        if (cur < side[sd].A[1]) side[sd].box(cur, side[sd].A[1], yb, yt);
      }
      function solidRuns(sd, A) {
        const doors = (o.open || []).filter(p => p.s === sd && !(p.f || 0) && p.y0 === 0).sort((p, q) => p.a - q.a), out = [];
        let cur = A[0] - 0.06;
        for (const d of doors) { if (d.a > cur) out.push([cur, d.a]); cur = d.b; }
        if (cur < A[1] + 0.06) out.push([cur, A[1] + 0.06]);
        return out;
      }
      const ix0 = x0 + t, iz0 = z0 + t, ix1 = x1 - t, iz1 = z1 - t;
      S(ix0, iz0, ix1, iz1, 0, 0.05, o.floorC || C.floor, M.wood);
      const st = o.stairs;
      const slab = (y0, y1) => {
        const part = (a, b, cc, d) => { if (cc - a > 0.01 && d - b > 0.01) S(a, b, cc, d, y0, y1, o.floorC || C.floor, M.wood); };
        if (!st) return part(ix0, iz0, ix1, iz1);
        part(ix0, iz0, st.x0, iz1); part(st.x1, iz0, ix1, iz1); part(st.x0, iz0, st.x1, st.z0); part(st.x0, st.z1, st.x1, iz1);
      };
      for (let f = 1; f < F; f++) slab(f * fh - 0.25, f * fh);
      S(x0, z0, x1, z1, F * fh, F * fh + 0.3, C.roofC, M.concrete);
      for (const sd of ['n', 's', 'w', 'e']) {
        const A = along(sd, r);
        fbox(SD, sd, r, A[0] - 0.2, A[1] + 0.2, F * fh - 0.1, F * fh + 0.45, 0, 0.2, C.trim, M.plaster);
        for (const [a0, a1] of solidRuns(sd, A)) fbox(SD, sd, r, a0, a1, 0, 0.5, 0, 0.06, C.stone, M.stone);
      }
      if (st) for (let f = 0; f < F - 1; f++) stairs(st, f * fh, fh);
      for (const rl of o.rails || []) S(rl[0], rl[1], rl[2], rl[3], fh, fh + 1.0, C.metal, M.metal);
    }
    function stairs(st, yb, H) {
      const n = Math.ceil(H / 0.27), rise = H / n;
      for (let i = 0; i < n; i++) {
        const k0 = i / n, k1 = (i + 1) / n, top = yb + rise * (i + 1);
        const lz = (a, b, k) => a + (b - a) * k;
        if (st.dir === '+z') S(st.x0, lz(st.z0, st.z1, k0), st.x1, lz(st.z0, st.z1, k1), yb, top, C.stone, M.stone);
        else if (st.dir === '-z') S(st.x0, lz(st.z1, st.z0, k1), st.x1, lz(st.z1, st.z0, k0), yb, top, C.stone, M.stone);
        else if (st.dir === '+x') S(lz(st.x0, st.x1, k0), st.z0, lz(st.x0, st.x1, k1), st.z1, yb, top, C.stone, M.stone);
        else S(lz(st.x1, st.x0, k1), st.z0, lz(st.x1, st.x0, k0), st.z1, yb, top, C.stone, M.stone);
      }
    }
    function car(x, z, dirX, c) {
      const L = 2.15, W = 0.9;
      const R = (a0, b0, a1, b1, y0, y1, cc, m, deco) => {
        const f = deco ? SD : S;
        if (dirX) f(x + a0, z + b0, x + a1, z + b1, y0, y1, cc, m); else f(x + b0, z + a0, x + b1, z + a1, y0, y1, cc, m);
      };
      R(-L, -W, L, W, 0.32, 0.95, c, M.paint);
      R(-1.15, -W + 0.08, 0.85, W - 0.08, 0.95, 1.48, C.glass, M.glass);
      R(-1.05, -W + 0.1, 0.75, W - 0.1, 1.48, 1.55, c, M.paint, true);
      for (const a of [-1.35, 1.35]) for (const b of [-W - 0.02, W - 0.24]) R(a - 0.35, b, a + 0.35, b + 0.26, 0, 0.66, C.dark, M.plain, true);
      R(L, -W + 0.15, L + 0.03, -W + 0.45, 0.7, 0.85, [1, 0.95, 0.8], M.lamp, true);
      R(L, W - 0.45, L + 0.03, W - 0.15, 0.7, 0.85, [1, 0.95, 0.8], M.lamp, true);
      R(-L - 0.03, -W + 0.15, -L, -W + 0.45, 0.7, 0.85, [0.9, 0.1, 0.08], M.lamp, true);
      R(-L - 0.03, W - 0.45, -L, W - 0.15, 0.7, 0.85, [0.9, 0.1, 0.08], M.lamp, true);
    }
    function tree(x, z, y) {
      y = y || 0;
      S(x - 0.18, z - 0.18, x + 0.18, z + 0.18, y, y + 2.6, C.trunk, M.wood);
      SD(x - 1.4, z - 1.4, x + 1.4, z + 1.4, y + 2.4, y + 4.1, C.leaves, M.grass);
      SD(x - 0.95, z - 0.95, x + 0.95, z + 0.95, y + 4.1, y + 5.2, C.leaves, M.grass);
    }
    function lamp(x, z, y, dx, dz) {
      y = y || 0.15;
      S(x - 0.08, z - 0.08, x + 0.08, z + 0.08, y, y + 5, C.dark, M.metal);
      const ex = x + dx * 1.2, ez = z + dz * 1.2;
      SD(Math.min(x, ex) - 0.05, Math.min(z, ez) - 0.05, Math.max(x, ex) + 0.05, Math.max(z, ez) + 0.05, y + 4.9, y + 5.0, C.dark, M.metal);
      SD(ex - 0.25, ez - 0.25, ex + 0.25, ez + 0.25, y + 4.72, y + 4.9, C.lamp, M.lamp);
    }
    const walk = (x0, z0, x1, z1) => S(x0, z0, x1, z1, 0, 0.15, C.walk, M.tiles);
    // Häuserblock aus Kenney-Gebäuden: nebeneinander entlang der Straßenseite 'front' (n, s, w, e).
    // Kollision = ein Kasten je Gebäude (Grundfläche x Modellhöhe); die Kästen sind gleichzeitig die Ersatzgrafik.
    const RY = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };
    function kblock(r, front, list, v, c, m, o) {
      const ns = front === 'n' || front === 's', A0 = ns ? r[0] : r[1], L = (ns ? r[2] : r[3]) - A0, depth = ns ? r[3] - r[1] : r[2] - r[0];
      const sc = L / list.reduce((a, k) => a + KD[k][0], 0);
      let a = A0;
      list.forEach((k, i) => {
        const w = KD[k][0] * sc, h = KD[k][1] * sc, mid = a + w / 2;
        const rr = ns ? [a, r[1], a + w, r[3]] : [r[0], a, r[2], a + w];
        hide(true); block(rr, h, c, m, Object.assign({ sides: [front] }, o)); hide(false);
        SP(k, ns ? mid : (r[0] + r[2]) / 2, ns ? (r[1] + r[3]) / 2 : mid, RY[front], [sc, sc, depth / KD[k][2]], (v + i) % 3);
        a += w;
      });
    }

    // ---- Platz in der Mitte (selbstsymmetrisch -> B statt S)
    B(-11, -9, 11, 9, 0, 0.15, C.plaza, M.stone);
    B(-2, -2, 2, 2, 0.15, 0.75, C.stone, M.stone);
    B(-1.3, -1.3, 1.3, 1.3, 0.75, 2.3, C.stone, M.stone);
    B(-0.5, -0.5, 0.5, 0.5, 2.3, 6.4, C.stoneL, M.stone);
    K.D(-0.75, -0.75, 0.75, 0.75, 6.4, 6.9, [0.45, 0.36, 0.2], M.metal);
    S(5, -7.5, 8.5, -6.5, 0.15, 0.75, C.concrete, M.concrete);
    S(5.1, -7.4, 8.4, -6.6, 0.75, 1.25, C.hedge, M.grass);
    S(5, 6.5, 8.5, 7.5, 0.15, 0.75, C.concrete, M.concrete);
    S(5.1, 6.6, 8.4, 7.4, 0.75, 1.25, C.hedge, M.grass);
    S(7, -2.5, 7.6, 2.5, 0.15, 1.1, C.stone, M.stone);
    S(2.5, -6.2, 4.3, -5.7, 0.15, 0.6, C.wood, M.wood);
    tree(9.7, -7.8, 0.15);
    lamp(10.4, 3, 0.15, 0, -1);
    lamp(-3, -8.5, 0.15, 1, 0);

    // ---- Straßen und Gehwege (Osthälfte; Westhälfte entsteht durch Spiegelung)
    walk(11, -9, 24, -5); walk(30, -9, 46, -5); walk(11, 5, 24, 11); walk(30, 5, 46, 9);
    walk(22, -38, 24, -9); walk(30, -38, 32, -9); walk(22, 11, 24, 38); walk(30, 9, 32, 38);
    walk(3.5, -38, 5.5, -9); walk(-5.5, -38, -3.5, -9);
    walk(5.5, -10.5, 11, -9); walk(5.5, 9, 11, 11); walk(5.5, 22, 22, 25);
    for (let x = 12; x < 45; x += 3.2) if (x + 1.6 < 22 || x > 31) SD(x, -0.08, x + 1.6, 0.08, 0, 0.012, C.mark, M.mark);
    for (let z = -36; z < -9; z += 3.2) { SD(26.92, z, 27.08, z + 1.6, 0, 0.012, C.mark, M.mark); SD(-0.08, z, 0.08, z + 1.6, 0, 0.012, C.mark, M.mark); }
    for (let z = 10; z < 37; z += 3.2) SD(26.92, z, 27.08, z + 1.6, 0, 0.012, C.mark, M.mark);
    for (let z = -4.6; z < 4.6; z += 1) SD(20, z, 21.8, z + 0.5, 0, 0.012, C.mark, M.mark);
    for (let x = 24.4; x < 29.6; x += 1) SD(x, -8.8, x + 0.5, -7.2, 0, 0.012, C.mark, M.mark);
    car(16, -3.6, true, C.cars[0]);
    car(39, 3.5, true, C.cars[2]);
    // Lieferwagen
    S(18.6, 0.5, 23.6, 3.0, 0.4, 2.9, C.plW, M.metal);
    S(17, 0.6, 18.6, 2.9, 0.4, 1.3, C.cars[1], M.paint);
    S(17.15, 0.65, 18.4, 2.85, 1.3, 2.1, C.glass, M.glass);
    for (const a of [17.8, 21.8]) for (const b of [0.38, 2.82]) SD(a - 0.4, b, a + 0.4, b + 0.3, 0, 0.75, C.dark, M.plain);
    S(25, -0.3, 28.6, 0.3, 0, 0.9, C.concrete, M.concrete);
    car(25.4, -28, false, C.cars[1]);
    car(28.6, 16, false, C.cars[3]);
    car(1.6, -22, false, C.cars[5]);
    S(-3, -14, -0.6, -13.4, 0, 0.9, C.concrete, M.concrete);
    // Bushaltestelle
    S(34, 6.45, 38, 6.55, 0.15, 2.4, C.glass, M.glass);
    S(33.8, 5.3, 38.2, 6.6, 2.4, 2.55, C.metal, M.metal);
    S(34.5, 6.0, 37.5, 6.4, 0.15, 0.6, C.wood, M.wood);
    for (const x of [14, 33]) { lamp(x, -6.7, 0.15, 0, 1); lamp(x + 6, 6.7, 0.15, 0, -1); }
    lamp(23.4, -20, 0.15, 1, 0); lamp(23.4, 24, 0.15, 1, 0); lamp(4.9, -26, 0.15, -1, 0);

    // ---- Nordost-Viertel
    kblock([5.5, -38, 10.5, -29], 'w', ['i'], 2, C.brick2, M.brick, { shop: ['w'], awn: C.awnG });
    kblock([5.5, -29, 10.5, -21], 'w', ['b'], 1, C.plY, M.plaster, { shop: ['w'], awn: C.awnR });
    kblock([5.5, -21, 10.5, -15], 'w', ['f'], 0, C.plB, M.plaster, {});
    block([6, -14.5, 10, -10.5], 3.4, C.plR, M.plaster, { shop: ['w', 's'], awn: C.awnB, start: 9 });
    kblock([13, -38, 22, -28], 'e', ['l'], 2, C.brick, M.brick, {});
    S(10.6, -33, 11.5, -31, 0, 1.3, C.dump, M.metal);
    S(14, -26.8, 16.2, -25.6, 0, 1.3, C.dump, M.metal);
    S(19.5, -27.4, 20.7, -26.2, 0, 1.0, C.wood, M.wood);
    S(20.7, -27.4, 21.9, -26.2, 0, 1.0, C.wood, M.wood);
    S(20.1, -27.3, 21.3, -26.3, 1.0, 2.0, C.wood, M.wood);
    S(10.7, -19, 11.5, -18, 0, 1.0, C.wood, M.wood);
    // Wohnhaus (begehbar, 2 Stockwerke)
    house([13, -23, 22, -9], {
      floors: 2, fh: 3.4, c: C.plY, m: M.plaster,
      open: [
        { s: 's', a: 16, b: 17.6, f: 0, y0: 0, y1: 2.3 }, { s: 's', a: 13.8, b: 15, f: 0, y0: 1.0, y1: 2.2 }, { s: 's', a: 19.2, b: 20.4, f: 0, y0: 1.0, y1: 2.2 },
        { s: 's', a: 14, b: 15.2, f: 1, y0: 1.0, y1: 2.2 }, { s: 's', a: 16.4, b: 17.6, f: 1, y0: 1.0, y1: 2.2 }, { s: 's', a: 19.2, b: 20.4, f: 1, y0: 1.0, y1: 2.2 },
        { s: 'w', a: -15, b: -13.4, f: 0, y0: 0, y1: 2.3 }, { s: 'w', a: -20, b: -18.8, f: 1, y0: 1.0, y1: 2.2 }, { s: 'w', a: -13.5, b: -12.3, f: 1, y0: 1.0, y1: 2.2 },
        { s: 'e', a: -20.5, b: -19.3, f: 0, y0: 1.0, y1: 2.2 }, { s: 'e', a: -13, b: -11.8, f: 0, y0: 1.0, y1: 2.2 },
        { s: 'e', a: -21.4, b: -20.2, f: 1, y0: 1.0, y1: 2.2 }, { s: 'e', a: -16.5, b: -15.3, f: 1, y0: 1.0, y1: 2.2 }, { s: 'e', a: -12, b: -10.8, f: 1, y0: 1.0, y1: 2.2 },
        { s: 'n', a: 15, b: 16.2, f: 0, y0: 1.0, y1: 2.2 }, { s: 'n', a: 15, b: 16.2, f: 1, y0: 1.0, y1: 2.2 }, { s: 'n', a: 18, b: 19.2, f: 1, y0: 1.0, y1: 2.2 }
      ],
      stairs: { x0: 19.9, z0: -21.8, x1: 21.7, z1: -17.6, dir: '+z' },
      rails: [[19.75, -21.95, 19.9, -18.3], [19.75, -21.95, 21.7, -21.8]]
    });
    S(13.4, -22.6, 14.6, -21.4, 0.05, 1.15, C.wood, M.wood);
    S(15, -20.2, 16.6, -19.2, 3.4, 4.15, C.wood, M.wood);
    S(14, -10.2, 15.4, -9.7, 3.4, 4.0, C.sand, M.sand);
    S(16.3, -16.5, 17.5, -15.3, 0.05, 0.9, C.wood, M.wood);
    // Baustelle mit Gerüst
    kblock([32, -38, 46, -30], 's', ['k'], 1, C.concrete, M.concrete, { shop: ['s'], awn: C.awnB });
    kblock([39, -30, 46, -9], 'w', ['f', 'i', 'a'], 0, C.plW, M.plaster, { shop: ['w'], awn: C.awnG });
    S(32, -30, 32.3, -21, 0, 1.1, C.stone, M.stone);
    S(32, -17, 32.3, -9.6, 0, 1.1, C.stone, M.stone);
    S(32.3, -9.9, 36.4, -9.6, 0, 1.1, C.stone, M.stone);
    S(33, -28.5, 35.5, -22.5, 0, 2.6, C.orange, M.metal);
    S(33.1, -28, 35.4, -24, 2.6, 5.2, C.cBlue, M.metal);
    S(34, -19.5, 36.5, -13.5, 0, 2.6, C.cGreen, M.metal);
    S(33, -12, 34.2, -10.8, 0, 1.1, C.wood, M.wood);
    S(37.4, -28, 39, -16, 3.0, 3.2, C.wood, M.wood);
    for (const z of [-28, -22, -16.2]) S(37.4, z, 37.56, z + 0.16, 0, 3.0, C.metal, M.metal);
    S(37.4, -28, 37.5, -16.6, 3.2, 4.2, C.metal, M.metal);
    stairs({ x0: 37.6, z0: -16, x1: 39, z1: -11.4, dir: '-z' }, 0, 3.2);

    // ---- Südost-Viertel: Park, Café, Parkplatz
    S(5.5, 11, 22, 22, 0, 0.15, C.grass, M.grass);
    S(6.5, 12, 11, 12.6, 0.15, 1.2, C.hedge, M.grass);
    S(16, 20.4, 21, 21, 0.15, 1.2, C.hedge, M.grass);
    S(19.2, 12.4, 19.8, 16.5, 0.15, 1.2, C.hedge, M.grass);
    for (const p of [[12, 14.5], [15.75, 14.5], [12, 18.25], [15.75, 18.25]]) S(p[0], p[1], p[0] + 0.25, p[1] + 0.25, 0.15, 2.9, C.wood, M.wood);
    S(11.6, 14.1, 16.4, 19.1, 2.9, 3.15, [0.5, 0.3, 0.22], M.roof);
    SD(12.4, 14.9, 15.6, 18.3, 3.15, 3.5, [0.5, 0.3, 0.22], M.roof);
    tree(8, 15.2, 0.15); tree(19, 13.6, 0.15); tree(18.5, 18.6, 0.15); tree(8.8, 20, 0.15);
    S(7, 17, 8.8, 17.5, 0.15, 0.6, C.wood, M.wood);
    lamp(11.4, 21.5, 0.15, 1, 0);
    house([8, 25, 20, 36], {
      floors: 1, fh: 3.6, c: C.plR, m: M.plaster, floorC: [0.62, 0.55, 0.45],
      open: [
        { s: 'n', a: 13, b: 14.6, y0: 0, y1: 2.4 }, { s: 'n', a: 9, b: 12.2, y0: 0.9, y1: 2.6 }, { s: 'n', a: 15.6, b: 19.2, y0: 0.9, y1: 2.6 },
        { s: 'w', a: 27, b: 29.5, y0: 0.9, y1: 2.6 }, { s: 'w', a: 32, b: 33.4, y0: 0, y1: 2.4 },
        { s: 'e', a: 26.5, b: 29.5, y0: 0.9, y1: 2.6 }, { s: 'e', a: 31, b: 34.5, y0: 0.9, y1: 2.6 },
        { s: 's', a: 10, b: 11.4, y0: 0, y1: 2.4 }, { s: 's', a: 15, b: 17.5, y0: 0.9, y1: 2.6 }
      ]
    });
    SD(8.6, 24.0, 19.6, 25.0, 2.8, 2.9, C.awnR, M.plain);
    S(15.5, 32, 19.5, 33, 0.05, 1.1, C.wood, M.wood);
    S(10, 27, 11, 28, 0.05, 0.75, C.wood, M.wood);
    S(10, 30, 11, 31, 0.05, 0.75, C.wood, M.wood);
    S(13, 28.6, 14, 29.6, 0.05, 0.75, C.wood, M.wood);
    S(32, 9, 32.4, 13, 0, 0.8, C.stone, M.stone);
    S(32, 18, 32.4, 24, 0, 0.8, C.stone, M.stone);
    for (const x of [33, 35.6, 38.2, 40.8, 43.4]) { SD(x - 0.06, 9.8, x + 0.06, 14.6, 0, 0.012, C.mark, M.mark); SD(x - 0.06, 18.8, x + 0.06, 23.6, 0, 0.012, C.mark, M.mark); }
    car(34.3, 12.2, false, C.cars[0]); car(39.5, 12.2, false, C.cars[1]); car(44.7, 12.2, false, C.cars[2]);
    car(36.9, 21.2, false, C.cars[3]); car(42.1, 21.2, false, C.cars[4]);
    kblock([32, 26, 46, 38], 'n', ['j'], 2, C.brick, M.brick, { shop: ['n'], awn: C.awnR });

    // ---- Kartenrand als Häuserzeile (Osten + Norden; Westen + Süden durch Spiegelung)
    // Die Kästen bleiben als unsichtbare Wand; davor bzw. dahinter stehen die Kenney-Gebäude.
    hide(true);
    const rnd = seeded(7), facades = [[C.brick, M.brick], [C.plW, M.plaster], [C.concrete, M.concrete], [C.plB, M.plaster], [C.brick2, M.brick], [C.plG, M.plaster]];
    for (let z = -38; z < 38; z += 12.6) {
      const h = 11 + Math.floor(rnd() * 8), f = facades[Math.floor(rnd() * facades.length)], r = [46, z, 48, Math.min(38, z + 12.6)];
      S(r[0], r[1], r[2], r[3], 0, h, f[0], f[1]); SD(r[0] - 0.2, r[1], r[2], r[3], h - 0.45, h - 0.15, C.trim, M.plaster);
      windows(r, h, { sides: ['w'] });
    }
    for (let x = -46; x < 46; x += 11.5) {
      const h = 11 + Math.floor(rnd() * 8), f = facades[Math.floor(rnd() * facades.length)], r = [x, -40, Math.min(46, x + 11.5), -38];
      S(r[0], r[1], r[2], r[3], 0, h, f[0], f[1]); SD(r[0], r[1], r[2], r[3] + 0.2, h - 0.45, h - 0.15, C.trim, M.plaster);
      windows(r, h, { sides: ['s'] });
    }
    // Skyline in der Ferne (nur Optik)
    const sky = [];
    for (let i = 0; i < 22; i++) {
      const a = (i + 0.5) / 22 * Math.PI, rr = 78 + rnd() * 40, w = 10 + rnd() * 14, h = 20 + rnd() * 38;
      const x = Math.cos(a) * rr * 1.15, z = -Math.sin(a) * rr;
      const f = facades[Math.floor(rnd() * 3)];
      SD(x - w / 2, z - w / 2, x + w / 2, z + w / 2, -2, h, f[0].map(v => v * 0.85), M.sky);
      sky.push([x, z, w, h, a]);
    }
    hide(false);
    // Kenney-Häuserzeilen am Rand: Osten (Front nach Westen) und Norden (Front nach Süden)
    const ROW = ['a', 'b', 'd', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'g', 'f', 'i'];
    const rowR = seeded(21);
    function row(front, A0, A1, edge) {
      const list = []; let sum = 0, last = '';
      while (sum * 7.2 < A1 - A0) { let k; do k = ROW[Math.floor(rowR() * ROW.length)]; while (k === last); list.push(k); sum += KD[k][0]; last = k; }
      const sc = (A1 - A0) / sum;
      let a = A0;
      list.forEach((k, i) => {
        const w = KD[k][0] * sc, d = KD[k][2] * sc, mid = a + w / 2;
        if (front === 'w') SP(k, edge + d / 2, mid, RY.w, [sc, sc, sc], (i * 2 + 1) % 3);
        else SP(k, mid, edge - d / 2, RY.s, [sc, sc, sc], i % 3);
        a += w;
      });
    }
    row('w', -38, 38, 46);
    row('s', -46, 46, -38);
    SP('m', 51, -43, RY.s, [7.4, 7.4, 7.4], 2);
    // Skyline aus vereinfachten Kenney-Hochhäusern
    const LD = ['ld-a', 'ld-b', 'ld-c', 'ld-d', 'ld-e', 'ld-f', 'ld-g', 'ld-h', 'ld-i', 'ld-j', 'ld-k', 'ld-l', 'ld-m', 'ld-wide-a', 'ld-wide-b'];
    sky.forEach(([x, z, w, h, a], i) => {
      const k = LD[(i * 7) % LD.length], D3 = KD[k];
      SP(k, x, z, -a + Math.PI / 2, [w / D3[0], h / D3[1], w / D3[2] * (D3[0] > 0.9 ? 0.5 : 1)], i % 3, { far: true, y: -2 });
    });
    [[60, -62, 'skyscraper-b'], [-14, -68, 'skyscraper-d'], [82, -20, 'skyscraper-c'], [30, -74, 'skyscraper-e']].forEach(([x, z, k], i) => SP(k, x, z, RY.s, [8.5, 8.5, 8.5], i % 3, { far: true }));
    // Sonnenschirme auf dem Platz
    S(4.75, 4.15, 4.85, 4.25, 0.15, 2.4, C.dark, M.metal); S(4.0, 3.4, 5.6, 5.0, 0.15, 0.95, C.wood, M.wood);
    K.hide(true); SD(3.5, 2.9, 6.1, 5.5, 2.2, 2.6, C.awnR, M.plain); K.hide(false);
    SP('parasol-a', 4.8, 4.2, 0.4, [7.5, 6.2, 7.5], 0, { y: 0.15 }, 1);
    const spawnsHalf = [[11.9, -35], [35, -21], [43, -2], [27, -20], [17.5, -14], [12, 31.5], [40, 16.5], [-1.5, -32], [10.5, 17]];
    const spawns = [];
    for (const s of spawnsHalf) { spawns.push([s[0], 2.4, s[1]]); spawns.push([-s[0], 2.4, -s[1]]); }
    const items = [[17.5, 4.4, -20], [-17.5, 4.4, 20], [35.5, 1, -11], [-35.5, 1, 11], [0, 1, -7.5], [0, 1, 7.5]];
    return {
      HX, HZ, spawns, items, point: [0, 0.15, 0, 5.2],
      env: { sun: [-0.55, 0.6, 0.48], sunCol: [3.3, 2.65, 1.9], ambT: [0.27, 0.33, 0.46], ambB: [0.17, 0.15, 0.13], fog: [0.74, 0.75, 0.79], fogD: 0.0075, skyZ: [0.3, 0.5, 0.82], skyH: [0.86, 0.82, 0.78], sunC: [1, 0.82, 0.58], clouds: 0.5 }
    };
  }

  // ----------------------------------------------------- Karte 3: Schießstand
  // Schützenlinie bei z = 25, Bahnen nach -z (Zielscheiben bis 60 m), überdachter Stand dahinter
  function buildRange(K) {
    const { B, D } = K, HX = 14, HZ = 36, M = MAT;
    const C = { grass: [0.36, 0.52, 0.27], gravel: [0.66, 0.6, 0.5], conc: [0.66, 0.66, 0.64], wall: [0.58, 0.56, 0.52], wood: [0.55, 0.38, 0.22],
      dark: [0.16, 0.17, 0.19], earth: [0.45, 0.36, 0.26], y: [0.95, 0.78, 0.15], o: [0.95, 0.5, 0.12], r: [0.85, 0.18, 0.14], roof: [0.42, 0.43, 0.45], lamp: [1, 0.9, 0.7] };
    B(-HX - 1, -HZ - 1, HX + 1, HZ + 1, -1, 0, C.grass, M.grass);
    D(-13, -34, 13, 24.6, 0, 0.02, C.gravel, M.sand);
    B(-13, 24.6, 13, 35, 0, 0.12, C.conc, M.tiles);
    B(-14, -36, -13, 36, 0, 4.5, C.wall, M.concrete); B(13, -36, 14, 36, 0, 4.5, C.wall, M.concrete);
    B(-14, 35, 14, 36, 0, 4.5, C.wall, M.concrete);
    B(-14, -36, 14, -34, 0, 9, C.earth, M.sand);                     // Kugelfang
    for (let i = 0; i < 5; i++) B(-13, -34 + i * 0.9, 13, -33.1 + i * 0.9, 0, 6 - i * 1.3, C.earth, M.sand);
    B(-13, 24.6, 13, 25.2, 0.12, 1.08, C.wood, M.wood);               // Schützentisch
    for (const x of [-8.7, -4.35, 0, 4.35, 8.7]) B(x - 0.05, 25.2, x + 0.05, 28.2, 0.12, 2.3, C.dark, M.metal);
    B(-13.5, 24.4, 13.5, 35.5, 3.6, 3.9, C.roof, M.concrete);
    for (const x of [-12.8, -6.5, 6.5, 12.8]) B(x - 0.15, 24.45, x + 0.15, 24.75, 0.12, 3.6, C.dark, M.metal);
    for (const x of [-10.9, -6.5, -2.2, 2.2, 6.5, 10.9]) D(x - 0.6, 27, x + 0.6, 27.8, 3.55, 3.6, C.lamp, M.lamp);
    // Entfernungsmarken an den Seitenwänden: gelb 10 m, orange 25 m, rot 50 m
    [[15, C.y], [0, C.o], [-25, C.r]].forEach(([z, c]) => { D(-13, z - 0.3, -12.85, z + 0.3, 0, 4.5, c, M.paint); D(12.85, z - 0.3, 13, z + 0.3, 0, 4.5, c, M.paint); D(-12.9, z - 0.05, 12.9, z + 0.05, 0.02, 0.04, c, M.paint); });
    // Waffentische hinten im Stand
    B(-11, 32.4, -5, 33.4, 0.12, 1.0, C.wood, M.wood); B(5, 32.4, 11, 33.4, 0.12, 1.0, C.wood, M.wood);
    B(-1.2, 32.6, 1.2, 33.6, 0.12, 0.9, C.dark, M.metal);
    const spawns = [[-6.5, 1, 29.5], [0, 1, 29.5], [6.5, 1, 29.5], [-2.2, 1, 30.5], [2.2, 1, 30.5]];
    return { HX, HZ, spawns, items: [], range: { line: 25, targets: [[-7, 15], [0, 15], [7, 15], [-7, 0], [0, 0], [7, 0], [-7, -25], [0, -25], [7, -25]] },
      env: { sun: [-0.4, 0.75, 0.5], sunCol: [3.3, 2.85, 2.2], ambT: [0.3, 0.36, 0.48], ambB: [0.2, 0.19, 0.15], fog: [0.78, 0.82, 0.86], fogD: 0.006, skyZ: [0.28, 0.5, 0.84], skyH: [0.86, 0.85, 0.82], sunC: [1, 0.88, 0.66], clouds: 0.4 } };
  }

  // -------------------------------------------- Karte 4: Tankstelle (Zombies)
  function buildTanke(K) {
    const { B, D, P } = K, HX = 34, HZ = 26, M = MAT;
    const C = { asph: [0.24, 0.24, 0.26], grass: [0.27, 0.36, 0.2], walk: [0.5, 0.49, 0.46], wall: [0.82, 0.8, 0.74], red: [0.72, 0.14, 0.12], white: [0.9, 0.9, 0.88],
      glass: [0.16, 0.22, 0.28], dark: [0.13, 0.13, 0.15], metal: [0.4, 0.42, 0.45], fence: [0.5, 0.52, 0.55], wood: [0.5, 0.36, 0.22], sand: [0.6, 0.53, 0.38],
      rust: [0.45, 0.25, 0.14], lamp: [1, 0.86, 0.6], mark: [0.85, 0.82, 0.6], tree: [0.2, 0.3, 0.16], trunk: [0.3, 0.22, 0.15], barrel: [0.25, 0.42, 0.3] };
    B(-HX - 1, -HZ - 1, HX + 1, HZ + 1, -1, 0, C.grass, M.grass);
    B(-31, -23, 31, 23, 0, 0.03, C.asph, M.asphalt);
    // Zaun mit Lücken (dort kommen die Zombies herein)
    const gaps = { n: [-20, 10], s: [0, 18], w: [-10, 14], e: [-18, 0] };
    const fence = (axis, c, a0, a1, gs) => {
      let a = a0; const cuts = gs.map(g => [g - 1.6, g + 1.6]).sort((x, y) => x[0] - y[0]);
      for (const [g0, g1] of cuts.concat([[a1, a1]])) { if (g0 > a) { if (axis === 'x') B(a, c - 0.06, g0, c + 0.06, 0, 2.3, C.fence, M.metal); else B(c - 0.06, a, c + 0.06, g0, 0, 2.3, C.fence, M.metal); } a = Math.max(a, g1); }
    };
    fence('x', -23, -31, 31, gaps.n); fence('x', 23, -31, 31, gaps.s); fence('z', -31, -23, 23, gaps.w); fence('z', 31, -23, 23, gaps.e);
    for (let x = -31; x <= 31; x += 3.1) { D(x - 0.06, -23.1, x + 0.06, -22.9, 0, 2.5, C.metal, M.metal); D(x - 0.06, 22.9, x + 0.06, 23.1, 0, 2.5, C.metal, M.metal); }
    // Straße mit Markierung
    D(-31, 9.5, 31, 16.5, 0.03, 0.05, [0.2, 0.2, 0.22], M.asphalt);
    for (let x = -30; x < 30; x += 4) D(x, 12.9, x + 2, 13.1, 0.05, 0.06, C.mark, M.mark);
    // Tankstellen-Shop (begehbar, Tür vorne, Fenster mit Brüstung)
    const sx0 = -16, sx1 = -3, sz0 = -18, sz1 = -9, h = 3.4, t = 0.3;
    B(sx0, sz0, sx1, sz0 + t, 0, h, C.wall, M.plaster);
    B(sx0, sz0, sx0 + t, sz1, 0, h, C.wall, M.plaster); B(sx1 - t, sz0, sx1, sz1, 0, h, C.wall, M.plaster);
    B(sx0, sz1 - t, -12.5, sz1, 0, h, C.wall, M.plaster); B(-9, sz1 - t, -7.5, sz1, 0, h, C.wall, M.plaster); B(-4.8, sz1 - t, sx1, sz1, 0, h, C.wall, M.plaster);
    B(-12.5, sz1 - t, -9, sz1, 0, 1.0, C.wall, M.plaster); B(-12.5, sz1 - t, -9, sz1, 2.6, h, C.wall, M.plaster); D(-12.5, sz1 - 0.2, -9, sz1 - 0.1, 1.0, 2.6, C.glass, M.glass);
    B(-7.5, sz1 - t, -4.8, sz1, 2.4, h, C.wall, M.plaster);                 // Eingang (Tür offen)
    B(sx1 - t, -15, sx1, -12, 0, 1.0, C.wall, M.plaster);                 // Seitenfenster: Brüstung
    B(sx0 - 0.3, sz0 - 0.3, sx1 + 0.3, sz1 + 0.3, h, h + 0.35, C.red, M.paint);
    B(sx0 + 0.3, sz0 + 0.3, sx1 - 0.3, sz1 - 0.3, 0, 0.06, [0.6, 0.6, 0.58], M.tiles);
    B(-14.5, -16.5, -11, -15.6, 0.06, 1.05, C.red, M.paint);                // Theke
    for (const x of [-9.5, -6.5]) B(x - 0.4, -16.8, x + 0.4, -13.2, 0.06, 1.9, C.metal, M.metal); // Regale
    // Zapfsäulen mit Dach
    for (const [x, z] of [[3, -6], [15, -6], [3, 4], [15, 4]]) B(x - 0.25, z - 0.25, x + 0.25, z + 0.25, 0, 4.6, C.white, M.paint);
    B(1.5, -7.5, 16.5, 5.5, 4.6, 5.1, C.white, M.paint); B(1.4, -7.6, 16.6, 5.6, 5.1, 5.6, C.red, M.paint);
    for (const z of [-3.5, 1.5]) { B(4.5, z - 0.7, 13.5, z + 0.7, 0, 0.25, C.walk, M.concrete); for (const x of [6.5, 11.5]) B(x - 0.4, z - 0.3, x + 0.4, z + 0.3, 0.25, 1.75, C.red, M.paint); }
    for (const x of [3, 9, 15]) D(x - 1.2, -1.2, x + 1.2, -0.6, 4.55, 4.6, C.lamp, M.lamp);
    // Wracks, Sandsäcke, Fässer, Container
    const car = (x, z, c, rot) => { const L = rot ? [0.95, 2.1] : [2.1, 0.95]; B(x - L[0], z - L[1], x + L[0], z + L[1], 0.3, 0.95, c, M.paint); const T = rot ? [0.85, 1.1] : [1.1, 0.85]; B(x - T[0], z - T[1], x + T[0], z + T[1], 0.95, 1.45, C.glass, M.glass); };
    car(-22, 4, C.rust, false); car(22, -15, [0.25, 0.3, 0.45], true); car(-4, 13, [0.6, 0.55, 0.2], false); car(24, 14, C.rust, false);
    B(-27, -19, -21, -16.6, 0, 2.6, [0.2, 0.36, 0.5], M.metal);                     // Container
    for (const [x, z] of [[-5.5, -6.5], [-2.5, -6.5]]) B(x - 1.2, z - 0.4, x + 1.2, z + 0.4, 0, 1.0, C.sand, M.sand); // Sandsäcke vor dem Shop
    B(-17.5, -7, -15.5, -6.2, 0, 1.0, C.sand, M.sand); B(18, 8, 20.4, 8.8, 0, 1.0, C.sand, M.sand); B(-18, 18, -15.6, 18.8, 0, 1.0, C.sand, M.sand);
    for (const [x, z] of [[18.6, -1], [19.4, -0.2], [-20, 9], [8, 19], [27, -6], [-26, -6]]) B(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 0, 1.05, C.barrel, M.metal);
    B(6, 18, 12, 20.5, 0, 1.2, C.wood, M.wood); B(-26, 10, -23, 13, 0, 1.4, C.wood, M.wood);
    // Laternen
    for (const [x, z] of [[-24, 8], [-10, 8], [6, 8], [22, 8], [-24, -21], [26, 20]]) { B(x - 0.1, z - 0.1, x + 0.1, z + 0.1, 0, 5.2, C.dark, M.metal); D(x - 0.35, z - 0.35, x + 0.35, z + 0.35, 5.0, 5.2, C.lamp, M.lamp); }
    // Bäume außerhalb des Zauns
    for (const [x, z] of [[-33, -20], [-33, 0], [33, -10], [33, 8], [-12, 25], [14, -25], [26, 25], [-26, -25]]) { D(x - 0.2, z - 0.2, x + 0.2, z + 0.2, 0, 2.4, C.trunk, M.wood); D(x - 1.3, z - 1.3, x + 1.3, z + 1.3, 2.2, 4.4, C.tree, M.grass); }
    // Kulisse: Kenney-Häuser und Skyline hinter dem Zaun
    P('k', -14, -32, 0, [6, 6, 6], 2); P('a', 6, -31, 0, [7, 7, 7], 1); P('f', 22, -31.5, 0, [7, 7, 7], 0);
    P('j', 12, 33, Math.PI, [6.5, 6.5, 6.5], 0); P('i', -16, 33, Math.PI, [7, 7, 7], 2);
    [[-80, -60, 'ld-b'], [-40, -85, 'ld-e'], [10, -90, 'ld-h'], [60, -75, 'ld-a'], [90, -20, 'ld-m'], [85, 45, 'ld-c'], [30, 90, 'ld-wide-a'], [-50, 80, 'ld-k'], [-95, 20, 'ld-f']].forEach(([x, z, k], i) =>
      P(k, x, z, Math.atan2(x, z), [20, 18 + (i % 3) * 6, 20], i % 3, { far: true, y: -2 }));
    const spawns = [[-6, 1, -12], [-11, 1, -12], [-4, 1, -4], [9, 1, -1], [9, 1, 2], [-8, 1, 2]];
    const zsp = [[-20, -25.5], [10, -25.5], [0, 25.5], [18, 25.5], [-33.5, -10], [-33.5, 14], [33.5, -18], [33.5, 0]];
    return { HX, HZ, spawns, items: [], zspawns: zsp,
      env: { sun: [0.75, 0.22, -0.45], sunCol: [2.3, 1.25, 0.75], ambT: [0.2, 0.2, 0.33], ambB: [0.12, 0.1, 0.12], fog: [0.27, 0.23, 0.3], fogD: 0.02, skyZ: [0.12, 0.13, 0.3], skyH: [0.62, 0.36, 0.3], sunC: [1, 0.55, 0.3], clouds: 0.55 } };
  }

  const MAPS = {
    stadt:  { n: 'Altstadt', d: 'Große Stadtkarte mit Häusern, Straßen und Platz', build: buildStadt },
    wueste: { n: 'Wüstendorf', d: 'Kleine, schnelle Karte', build: buildWueste },
    range:  { n: 'Schießstand', d: 'Übungsplatz mit Zielscheiben', build: buildRange, hidden: true },
    tanke:  { n: 'Tankstelle', d: 'Verlassene Tankstelle in der Dämmerung (Zombies)', build: buildTanke, hidden: true }
  };
  function groundAt(x, y, z) {
    const r = rayBoxes(x, y, z, 0, -1, 0, 40);
    return r ? y - r.t : 0;
  }
  function setMap(id) {
    if (!MAPS[id]) id = 'stadt';
    boxes = []; deco = []; props = []; hid = 0;
    const res = MAPS[id].build(makeCtx());
    hid = 0;
    MAP.id = id; MAP.name = MAPS[id].n; MAP.boxes = boxes; MAP.deco = deco; MAP.props = props;
    MAP.HX = res.HX; MAP.HZ = res.HZ; MAP.point = res.point; MAP.range = res.range || null; MAP.zspawns = res.zspawns || null;
    const env = res.env, l = Math.hypot(env.sun[0], env.sun[1], env.sun[2]);
    env.sun = env.sun.map(v => v / l);
    MAP.env = env;
    MAP.spawns = res.spawns.map(s => [s[0], groundAt(s[0], s[1], s[2]), s[2]]);
    MAP.items = res.items.map(s => [s[0], groundAt(s[0], s[1], s[2]), s[2]]);
    return MAP;
  }

  // -------------------------------------------------------------- Geometrie
  // Strahl gegen alle Map-Boxen. Liefert {t, ax, sg} (Achse/Vorzeichen der Normalen) oder null.
  function rayBoxes(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, bax = -1, bsg = 0;
    const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      let t1 = (b.x0 - ox) * ix, t2 = (b.x1 - ox) * ix, tmin, tmax, ax = 0, sg;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sg = 1; } else sg = -1;
      tmin = t1; tmax = t2;
      t1 = (b.y0 - oy) * iy; t2 = (b.y1 - oy) * iy;
      let sy; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sy = 1; } else sy = -1;
      if (t1 > tmin) { tmin = t1; ax = 1; sg = sy; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
      t1 = (b.z0 - oz) * iz; t2 = (b.z1 - oz) * iz;
      let sz; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; sz = 1; } else sz = -1;
      if (t1 > tmin) { tmin = t1; ax = 2; sg = sz; }
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax || tmin < 0 || tmin >= best) continue;
      best = tmin; bax = ax; bsg = sg;
    }
    return bax < 0 ? null : { t: best, ax: bax, sg: bsg };
  }
  function rayAABB(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    let tmin = -Infinity, tmax = Infinity, t1, t2;
    dx = dx || 1e-9; dy = dy || 1e-9; dz = dz || 1e-9;
    t1 = (x0 - ox) / dx; t2 = (x1 - ox) / dx; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    t1 = (y0 - oy) / dy; t2 = (y1 - oy) / dy; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    t1 = (z0 - oz) / dz; t2 = (z1 - oz) / dz; if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
    if (tmin > tmax || tmax < 0) return -1;
    return tmin < 0 ? 0 : tmin;
  }
  // Strahl gegen Spieler-Hitboxen. p = Fußposition. Liefert {t, zone} (0 Kopf, 1 Körper, 2 Beine) oder null.
  function rayPlayer(ox, oy, oz, dx, dy, dz, p, crouch) {
    const h = crouch ? PLAYER.HC : PLAYER.H, legTop = crouch ? 0.5 : 0.78, headBot = h - 0.34;
    let best = null;
    let t = rayAABB(ox, oy, oz, dx, dy, dz, p[0] - 0.17, p[1] + headBot, p[2] - 0.17, p[0] + 0.17, p[1] + h, p[2] + 0.17);
    if (t >= 0) best = { t: t, zone: 0 };
    t = rayAABB(ox, oy, oz, dx, dy, dz, p[0] - 0.3, p[1] + legTop, p[2] - 0.3, p[0] + 0.3, p[1] + headBot, p[2] + 0.3);
    if (t >= 0 && (!best || t < best.t - 0.05)) best = { t: t, zone: 1 };
    t = rayAABB(ox, oy, oz, dx, dy, dz, p[0] - 0.25, p[1], p[2] - 0.25, p[0] + 0.25, p[1] + legTop, p[2] + 0.25);
    if (t >= 0 && (!best || t < best.t - 0.05)) best = { t: t, zone: 2 };
    return best;
  }
  function losClear(a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) return true;
    return !rayBoxes(a[0], a[1], a[2], dx / d || 1e-9, dy / d || 1e-9, dz / d || 1e-9, d - 0.05);
  }
  function segSphere(a, b, c, r) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const l2 = dx * dx + dy * dy + dz * dz;
    let t = l2 > 0 ? ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy + (c[2] - a[2]) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a[0] + dx * t - c[0], py = a[1] + dy * t - c[1], pz = a[2] + dz * t - c[2];
    return px * px + py * py + pz * pz < r * r;
  }
  function collide(x, y, z, h, r) {
    r = r || PLAYER.R;
    let res = null;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1 && y + h > b.y0 && y < b.y1) {
        if (!res) res = { top: b.y1, bot: b.y0, box: b };
        else { if (b.y1 > res.top) res.top = b.y1; if (b.y0 < res.bot) res.bot = b.y0; }
      }
    }
    return res;
  }
  function pointSolid(x, y, z, r) {
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    return false;
  }
  // Granate (oder anderes Kleinteil) einen Schritt simulieren; deterministisch für Server und Client
  function stepNade(g, dt, R) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps, p = g.p, v = g.v;
    R = R || 0.09;
    for (let s = 0; s < steps; s++) {
      v[1] -= 16 * h;
      for (let a = 0; a < 3; a++) {
        const old = p[a];
        p[a] += v[a] * h;
        if (pointSolid(p[0], p[1], p[2], R)) {
          p[a] = old;
          const sp = Math.abs(v[a]);
          v[a] = -v[a] * 0.42;
          const o1 = (a + 1) % 3, o2 = (a + 2) % 3;
          v[o1] *= 0.82; v[o2] *= 0.82;
          if (a === 1 && sp < 1.2) { v[1] = 0; v[0] *= 0.9; v[2] *= 0.9; }
          g.bounced = sp > 1.5 ? (g.bounced || 0) + 1 : g.bounced;
        }
      }
    }
  }
  function falloff(w, dist, rangeMul) {
    const m = rangeMul || 1, fs = w.fs * m, fe = w.fe * m;
    if (dist <= fs) return 1;
    if (dist >= fe) return w.fmin;
    return 1 - (1 - w.fmin) * (dist - fs) / (fe - fs);
  }
  function zoneMult(w, zone) { return zone === 0 ? w.head : ZONE_MULT[zone] || 1; }

  setMap('stadt');

  return {
    RARITY, FINISHES, rollSkin, skinInfo, TEAMS,
    ZTYPES, TURRETS, ZSHOP,
    WEAPONS, LADDER, PRIMARY, SECONDARY, CLASS_NAME, ATT, ATT_SLOTS, ATT_SLOT_NAME, NADES, PLAYER, MODES, MAPS, MAT, MAP,
    compat, stats, sanitizeLoadout, randomLoadout, slotWeapon, setMap, groundAt,
    rayBoxes, rayPlayer, losClear, segSphere, collide, pointSolid, stepNade, falloff, zoneMult
  };
});
