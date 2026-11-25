/* BLOCKFEUER – Spiellogik des Hosts (autoritativ: Treffer, Leben, Stufen, Bots, Runden)
   Läuft im Node-Server (server.js) und – für GitHub Pages – direkt im Browser des Hosts.
   Verbindungen sind einfache Objekte: { open, player, send(obj), sendText(str), kill() } */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./shared.js'));
  else root.GameHost = factory(root.Shared);
})(typeof self !== 'undefined' ? self : this, function (S) {
'use strict';
const { WEAPONS, LADDER, NADES, PLAYER, MAP } = S;
const TICK = 30, MAX_PLAYERS = 12, MAX_BOTS = 8;
const RESPAWN_MS = 2500, PROTECT_MS = 1800, ROUND_END_MS = 9000, ITEM_RESPAWN_MS = 20000;
const FINAL = LADDER.length - 1;

function create(opts) {
  opts = opts || {};
  const log = opts.log || (() => { });
  let mapId = S.MAPS[opts.map] ? opts.map : 'stadt';
  let mode = S.MODES[opts.mode] ? opts.mode : 'gungame';
  if (S.MODES[mode].map) mapId = S.MODES[mode].map;
  else if (S.MAPS[mapId].hidden && !S.MODES[mode].practice) mapId = 'stadt';
  S.setMap(mapId);
  const players = new Map();
  let nextId = 1, nextNadeId = 1;
  // Ablauf: 'lobby' (Einstellungen, Warten) -> 'play' -> 'end' (Siegerbildschirm) -> zurück in die Lobby
let state = (opts.lobby === false || S.MODES[mode].practice) ? 'play' : 'lobby', roundEndsAt = 0;
let leaderId = 0; // wer die Lobby steuert: der erste Mensch (beim Browser-Host also der Host selbst)
  let nades = [], smokes = [], items = [];
  let botSkill = Math.max(0, Math.min(2, opts.botSkill === undefined ? 1 : +opts.botSkill | 0));
  const BOT_NAMES = ['Bot Alfred', 'Bot Berta', 'Bot Clemens', 'Bot Dora', 'Bot Emil', 'Bot Frieda', 'Bot Gustl', 'Bot Hansi'];
  const SKILLS = [{ err: 0.13, react: 1000, burst: 4 }, { err: 0.085, react: 680, burst: 6 }, { err: 0.05, react: 430, burst: 9 }];
  const DM_LIMIT = S.MODES.dm.limit, CTP_LIMIT = S.MODES.ctp.limit, KPL = S.MODES.gungame.kpl;
  const teamMode = () => !!S.MODES[mode].teams;
  const zMode = () => mode === 'zombies';
const mate = (a, b) => a && b && a !== b && ((teamMode() && a.team === b.team) || zMode());
  // Eroberungspunkt: owner/cap = Team (-1 = keins), prog 0..1, Punkte je Team
  let cp = { owner: -1, cap: -1, prog: 0, score: [0, 0], n: [0, 0] };
  function resetCP() { cp = { owner: -1, cap: -1, prog: 0, score: [0, 0], n: [0, 0] }; }
  function teamCount(tm) { let n = 0; for (const p of players.values()) if (p.team === tm) n++; return n; }
  function pickTeam() { return teamCount(0) <= teamCount(1) ? 0 : 1; }
  function setTeams() { // nach Moduswechsel ausgleichen: abwechselnd Menschen, dann Bots
    const list = [...players.values()].sort((a, b) => (a.bot - b.bot) || (a.id - b.id));
    list.forEach((p, i) => { p.team = i % 2; p.hue = teamMode() ? S.TEAMS[p.team].hue : (p.id * 137) % 360; });
    broadcast({ t: 'teams', l: list.map(p => [p.id, p.team, p.hue]) });
  }

  const now = () => Date.now();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
  const num = v => typeof v === 'number' && isFinite(v);
  const vec = v => Array.isArray(v) && v.length === 3 && num(v[0]) && num(v[1]) && num(v[2]);
  const r2 = v => Math.round(v * 100) / 100;
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const humans = () => { let n = 0; for (const p of players.values()) if (!p.bot) n++; return n; };
  const bots = () => [...players.values()].filter(p => p.bot);
  const weaponOf = (p, slot) => S.slotWeapon(mode, p.lvl, p.lo, slot);
  function resetItems() { items = MAP.items.map((p, i) => ({ id: i, p, on: true, backAt: 0 })); }
  resetItems();

  function broadcast(obj, except) {
    const txt = JSON.stringify(obj);
    for (const p of players.values()) if (p.conn && p !== except) p.conn.sendText(txt);
  }
  function info(p) { return { id: p.id, name: p.name, lvl: p.lvl, prog: p.prog, kills: p.kills, deaths: p.deaths, alive: p.alive, bot: p.bot, hue: p.hue, team: p.team, ping: p.ping, lo: p.lo }; }

  function makePlayer(name, conn, bot) {
    const p = {
      id: nextId++, name, conn, bot: !!bot, p: [0, 0, 0], yaw: 0, pitch: 0, fl: 0, slot: 0,
      hp: 100, alive: false, ready: !!bot, lvl: 0, prog: 0, team: 0, kills: 0, deaths: 0, respawnAt: 0, lastShot: {}, lastNade: 0,
      hist: [], protUntil: 0, ping: 0, nades: { he: 1, flash: 1, smoke: 1 }, ai: null,
      lo: bot ? S.randomLoadout() : S.sanitizeLoadout(null), loNext: null
    };
    p.team = pickTeam();
    p.hue = teamMode() ? S.TEAMS[p.team].hue : (p.id * 137) % 360;
    players.set(p.id, p);
    return p;
  }
  function uniqueName(name) {
    const taken = new Set([...players.values()].map(p => p.name));
    if (!taken.has(name)) return name;
    for (let i = 2; i < 99; i++) if (!taken.has(name + ' ' + i)) return name + ' ' + i;
    return name + ' ' + nextId;
  }
  function spawnPlayer(p) {
    // Spawnpunkt mit größtem Abstand zu lebenden Gegnern (zufällig unter den besten drei)
    // Team-Modus: Blau startet im Osten, Rot im Westen, nie direkt am Punkt
    const P = MAP.point;
    const pool = teamMode() ? MAP.spawns.filter(s => ((s[0] + s[2] * 0.01 >= 0) ? 0 : 1) === p.team && (!P || Math.hypot(s[0] - P[0], s[2] - P[2]) > P[3] + 3)) : MAP.spawns;
    const scored = pool.map(s => {
      let d = 999;
      for (const q of players.values()) if (q !== p && q.alive && !mate(q, p)) d = Math.min(d, Math.hypot(q.p[0] - s[0], q.p[2] - s[2]));
      return { s, d };
    }).sort((a, b) => b.d - a.d);
    const s = scored[Math.floor(Math.random() * Math.min(3, scored.length))].s;
    if (p.bot) p.lo = S.randomLoadout();
    else if (p.loNext) p.lo = p.loNext;
    p.p = [s[0], s[1], s[2]];
    p.yaw = Math.atan2(s[0], s[2]); p.pitch = 0; p.fl = 0; p.slot = 0;
    p.hp = 100; p.alive = true; p.ready = false; p.protUntil = now() + PROTECT_MS; p.hist = [];
    if (!zMode() || !p.zNades) p.nades = { he: 1, flash: 1, smoke: zMode() ? 0 : 1 };
    if (zMode()) p.zNades = true;
    if (p.bot) resetAI(p);
    broadcast({ t: 'spawn', id: p.id, p: p.p.map(r2), yaw: r2(p.yaw), lvl: p.lvl, lo: p.lo, nd: p.nades });
  }

  function applyDamage(victim, attacker, dmg, wkey, zone, from) {
    if (!victim.alive || state !== 'play' || dmg <= 0) return;
    if (mate(attacker, victim)) return;
    const t = now();
    if (t < victim.protUntil) return;
    dmg = Math.round(dmg);
    if (victim.armor > 0) { const a = Math.min(victim.armor, Math.round(dmg * 0.5)); victim.armor -= a; dmg -= a; }
    victim.hp -= dmg;
    if (victim.conn) victim.conn.send({ t: 'dmg', hp: Math.max(0, victim.hp), ar: victim.armor || 0, from: attacker ? attacker.id : 0, fp: from });
    if (attacker && attacker.conn && attacker !== victim) attacker.conn.send({ t: 'hitc', id: victim.id, dmg, z: zone, kill: victim.hp <= 0 });
    if (victim.bot && attacker && attacker !== victim && victim.ai) { victim.ai.alert = attacker.id; victim.ai.alertUntil = t + 3000; }
    if (victim.hp <= 0) kill(victim, attacker, wkey, zone === 0);
  }
  function kill(victim, attacker, wkey, hs) {
    victim.alive = false; victim.deaths++; victim.hp = 0; victim.respawnAt = now() + RESPAWN_MS; victim.ready = victim.bot;
    if (zMode()) { victim.respawnAt = Infinity; victim.ready = true; victim.armor = 0; }
    let win = false;
    if (attacker && attacker !== victim) {
      attacker.kills++;
      if (mode === 'gungame') {
        const fin = attacker.lvl >= FINAL;
        if (wkey === 'knife') {
          if (fin) win = true; else { attacker.lvl++; attacker.prog = 0; }
          if (victim.lvl > 0) victim.lvl--;            // Messer-Kill klaut dem Opfer eine Stufe
          victim.prog = 0;
        } else if (!fin && ++attacker.prog >= KPL) { attacker.lvl++; attacker.prog = 0; }
      } else if (mode === 'dm' && attacker.kills >= DM_LIMIT) win = true;
      if (attacker.alive) {
        attacker.hp = Math.min(100, attacker.hp + 30);
        if (attacker.conn) attacker.conn.send({ t: 'hp', hp: attacker.hp });
        if (attacker.bot) { const k = weaponOf(attacker, 0); attacker.ai.mag = S.stats(k, attacker.lo.att[k]).mag; attacker.ai.reloadUntil = 0; }
      }
    } else if (attacker === victim) {                  // Selbstmord kostet eine Stufe bzw. einen Kill
      if (mode === 'gungame') { if (victim.prog > 0) victim.prog = 0; else if (victim.lvl > 0) victim.lvl--; } else victim.kills = Math.max(0, victim.kills - 1);
    }
    broadcast({
      t: 'kill', k: attacker ? attacker.id : 0, v: victim.id, w: wkey, hs: !!hs,
      kl: attacker ? attacker.lvl : 0, vl: victim.lvl, kp: attacker ? attacker.prog : 0, vp: victim.prog, kk: attacker ? attacker.kills : 0, vk: victim.kills, vd: victim.deaths
    });
    if (win) endRound(attacker);
  }
  function endRound(winner) {
    state = 'end'; roundEndsAt = now() + ROUND_END_MS;
    nades = [];
    if (typeof winner === 'number') { // Team-Sieg: jeder Mensch im Siegerteam bekommt ein Glückspaket
      broadcast({ t: 'win', id: 0, team: winner, name: 'Team ' + S.TEAMS[winner].n, ms: ROUND_END_MS, mode, score: cp.score.map(Math.floor) });
      log('Runde gewonnen von Team ' + S.TEAMS[winner].n);
      for (const p of players.values()) if (p.team === winner) openPack(p);
      return;
    }
    broadcast({ t: 'win', id: winner.id, name: winner.name, ms: ROUND_END_MS, mode });
    log('Runde gewonnen von ' + winner.name);
    openPack(winner);
  }
  // Belohnung: Glückspaket mit zufälligem Waffen-Skin (nur für Menschen)
  function openPack(winner) {
    if (!winner.conn) return;
    const reel = [];
    for (let i = 0; i < 56; i++) reel.push(S.rollSkin());
    const win = 48, item = reel[win], info = S.skinInfo(item);
    winner.conn.send({ t: 'pack', reel, win, item });
    log('Glückspaket für ' + winner.name + ': ' + info.name + ' (' + info.rarity.n + ')');
    setTimeout(() => broadcast({ t: 'chat', id: 0, m: winner.name + ' hat ' + info.name + ' (' + info.rarity.n + ') aus dem Glückspaket gezogen!' }), 7500);
  }
  function resetRound() {
    state = 'play'; nades = []; smokes = [];
    resetItems(); resetCP(); if (zMode()) zReset();
    const back = [];
    for (const p of players.values()) {
      if (p.bot || p.alive || p.ready) back.push(p);
      p.lvl = 0; p.prog = 0; p.kills = 0; p.deaths = 0; p.alive = false; p.ready = p.bot;
      p.coins = 500; p.armor = 0; p.zOut = false; p.zNades = false; p.respawnAt = 0; if (p.lo) { p.lo.zp = null; p.lo.zs = 'pistol'; } if (p.loNext) { p.loNext.zp = null; p.loNext.zs = 'pistol'; }
    }
    broadcast({ t: 'reset' });
    for (const p of back) spawnPlayer(p);
  }
  function lobbyMsg() { return { t: 'lobby', host: leaderId, map: mapId, mode, skill: botSkill, bots: bots().length, maxBots: MAX_BOTS, state }; }
function fixLeader() {
  const l = players.get(leaderId);
  if (l && !l.bot) return;
  const h = [...players.values()].find(p => !p.bot);
  leaderId = h ? h.id : 0;
}
function goLobby() {
  state = 'lobby'; nades = []; smokes = []; resetCP(); zReset(); Z.phase = 'off';
  for (const p of players.values()) { p.alive = false; p.ready = p.bot; }
  broadcast({ t: 'tolobby' });
  broadcast(lobbyMsg());
}
function cfgMsg() { return { t: 'cfg', map: mapId, mode, limit: mode === 'ctp' ? CTP_LIMIT : DM_LIMIT, kpl: KPL }; }

  // ------------------------------------------------------------ Nachrichten
  function onMessage(conn, m) {
    const pl = conn.player;
    if (!pl) {
      if (m.t !== 'join') return;
      if (players.size - bots().length >= MAX_PLAYERS) { conn.send({ t: 'full' }); return conn.kill(); }
      const name = String(m.name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16) || 'Spieler';
      const p = makePlayer(uniqueName(name), conn, false);
    if (!players.get(leaderId) || players.get(leaderId).bot) leaderId = p.id;
      p.lo = p.loNext = S.sanitizeLoadout(m.lo);
      conn.player = p;
      while (players.size > MAX_PLAYERS && bots().length) removeBot();
      conn.send(Object.assign(cfgMsg(), {
        t: 'welcome', id: p.id, state, skill: botSkill, host: leaderId,
        players: [...players.values()].map(info),
        pos: [...players.values()].filter(q => q.alive).map(q => [q.id, q.p[0], q.p[1], q.p[2], q.yaw]),
        items: items.map(i => i.on ? 1 : 0),
        smokes: smokes.map(s => ({ p: s.p, left: (s.until - now()) / 1000 }))
      }));
      broadcast({ t: 'join', p: info(p) }, p);
    if (state === 'lobby') setTeams();
    broadcast(lobbyMsg());
      log('+ ' + p.name + ' ist beigetreten (' + humans() + ' Spieler, ' + bots().length + ' Bots)');
      return;
    }
    const t = now();
    switch (m.t) {
      case 's': {
        if (!pl.alive || !vec(m.p) || !num(m.y) || !num(m.x)) return;
        pl.p[0] = Math.max(-MAP.HX, Math.min(MAP.HX, m.p[0]));
        pl.p[1] = Math.max(-1, Math.min(30, m.p[1]));
        pl.p[2] = Math.max(-MAP.HZ, Math.min(MAP.HZ, m.p[2]));
        pl.yaw = m.y; pl.pitch = Math.max(-1.6, Math.min(1.6, m.x));
        pl.fl = m.f & 15; pl.slot = Math.max(0, Math.min(5, m.w | 0));
        pl.hist.push({ t, x: pl.p[0], y: pl.p[1], z: pl.p[2] });
        while (pl.hist.length && t - pl.hist[0].t > 900) pl.hist.shift();
        break;
      }
      case 'shot': {
        if (!pl.alive || state !== 'play') return;
        const slot = m.w === 1 ? 1 : m.w === 2 ? 2 : 0;
        const key = weaponOf(pl, slot);
        if (!key) return;
        const w = WEAPONS[key], st = S.stats(key, pl.lo.att[key]);
        if (t - (pl.lastShot[key] || 0) < 60000 / w.rpm * 0.7) return;
        pl.lastShot[key] = t; pl.protUntil = 0;
        const eye = [pl.p[0], pl.p[1] + ((pl.fl & 1) ? PLAYER.EYEC : PLAYER.EYE), pl.p[2]];
        const o = vec(m.o) && dist3(m.o, eye) < 3 ? m.o : eye;
        const ends = Array.isArray(m.e) ? m.e.filter(vec).slice(0, w.pellets).map(e => e.map(r2)) : [];
        broadcast({ t: 'shot', id: pl.id, e: ends, w: key, s: st.sup ? 1 : 0 }, pl);
        if (!Array.isArray(m.hits)) return;
        const acc = new Map();
        for (const h of m.hits.slice(0, w.pellets)) {
          if (!h || !vec(h.p)) continue;
          if (h.zid) { // Treffer auf einen Zombie
            const z = Z.list.find(q => q.id === h.zid); if (!z) continue;
            if (Math.hypot(h.p[0] - z.p[0], h.p[2] - z.p[2]) > 2.4 * z.s || h.p[1] < z.p[1] - 0.5 || h.p[1] > z.p[1] + 2.6 * z.s) continue;
            const d = dist3(o, h.p);
            if (w.melee && d > w.range + 1.2) continue;
            if (!S.losClear(o, h.p) && d > 0.8) { const k = Math.max(0, (d - 0.6) / d); if (!S.losClear(o, [o[0] + (h.p[0] - o[0]) * k, o[1] + (h.p[1] - o[1]) * k, o[2] + (h.p[2] - o[2]) * k])) continue; }
            const zone = h.z === 0 ? 0 : h.z === 2 ? 2 : 1;
            zDamage(z, pl, w.dmg * S.zoneMult(w, zone) * S.falloff(w, d, st.range), zone);
            continue;
          }
          const tg = players.get(h.id);
          if (!tg || !tg.alive || tg === pl) continue;
          const zone = h.z === 0 ? 0 : h.z === 2 ? 2 : 1;
          // Plausibilität: Trefferpunkt nahe einer jüngsten Position des Ziels, in Reichweite, Sichtlinie frei
          let near = false;
          const chk = e => Math.hypot(h.p[0] - e.x, h.p[2] - e.z) < 1.6 && h.p[1] > e.y - 0.4 && h.p[1] < e.y + 2.3;
          if (chk({ x: tg.p[0], y: tg.p[1], z: tg.p[2] })) near = true;
          else for (const e of tg.hist) if (chk(e)) { near = true; break; }
          if (!near) continue;
          const d = dist3(o, h.p);
          if (w.melee && d > w.range + 1.2) continue;
          if (!S.losClear(o, [h.p[0], h.p[1], h.p[2]]) && d > 0.6) {
            const k = Math.max(0, (d - 0.45) / d);
            if (!S.losClear(o, [o[0] + (h.p[0] - o[0]) * k, o[1] + (h.p[1] - o[1]) * k, o[2] + (h.p[2] - o[2]) * k])) continue;
          }
          const dmg = w.dmg * S.zoneMult(w, zone) * S.falloff(w, d, st.range);
          const a = acc.get(tg) || { dmg: 0, zone: 2 };
          a.dmg += dmg; a.zone = Math.min(a.zone, zone);
          acc.set(tg, a);
        }
        for (const [tg, a] of acc) applyDamage(tg, pl, a.dmg, key, a.zone, eye);
        break;
      }
      case 'nade': {
        if (!pl.alive || state !== 'play' || !NADES[m.k] || !vec(m.o) || !vec(m.v)) return;
        if (pl.nades[m.k] <= 0 || t - pl.lastNade < 400) return;
        const eye = [pl.p[0], pl.p[1] + PLAYER.EYE, pl.p[2]];
        if (dist3(m.o, eye) > 3) return;
        if (Math.hypot(m.v[0], m.v[1], m.v[2]) > 32) return;
        pl.nades[m.k]--; pl.lastNade = t; pl.protUntil = 0;
        throwNade(pl, m.k, m.o.slice(), m.v.slice());
        break;
      }
      case 'lo': { pl.loNext = S.sanitizeLoadout(m.lo); pl.loNext.zp = pl.lo.zp; pl.loNext.zs = pl.lo.zs; if (S.MODES[mode].practice) pl.lo = pl.loNext; break; }
      case 'zbuy': { if (zMode() && state === 'play') zBuy(pl, String(m.id || '')); break; }
      // ---- Lobby (nur der Lobby-Leiter)
      case 'lset': {
        if (pl.id !== leaderId || state !== 'lobby') return;
        let changed = false;
        if (S.MAPS[m.map] && !S.MAPS[m.map].hidden && m.map !== mapId) { mapId = m.map; changed = true; }
        if (S.MODES[m.mode] && !S.MODES[m.mode].practice && m.mode !== mode) { mode = m.mode; changed = true; }
        if (S.MODES[mode].map && mapId !== S.MODES[mode].map) { mapId = S.MODES[mode].map; changed = true; }
        if (!S.MODES[mode].map && S.MAPS[mapId].hidden) { mapId = 'stadt'; changed = true; }
        if (num(m.skill)) { botSkill = Math.max(0, Math.min(2, m.skill | 0)); broadcast({ t: 'skill', n: botSkill }); }
        if (num(m.bots)) { const n = Math.max(0, Math.min(MAX_BOTS, m.bots | 0)); while (bots().length < n && players.size < MAX_PLAYERS) addBot(); while (bots().length > n) removeBot(); }
        if (changed) { S.setMap(mapId); buildGrid(); resetItems(); broadcast(cfgMsg()); }
        setTeams();
        broadcast(lobbyMsg());
        break;
      }
      case 'start': {
        if (pl.id !== leaderId || state !== 'lobby') return;
        setTeams();
        if (zMode()) while (bots().length) removeBot();   // Zombies: nur Menschen, gemeinsam
        state = 'play';
        broadcast({ t: 'start' });
        broadcast({ t: 'chat', id: 0, m: S.MODES[mode].n + ' auf ' + S.MAPS[mapId].n + ' – los geht\'s!' });
        resetRound();
        if (zMode()) for (const q of players.values()) if (q.conn) q.conn.send({ t: 'coins', c: q.coins });
        log('Spiel gestartet: ' + S.MODES[mode].n + ' auf ' + S.MAPS[mapId].n);
        break;
      }
      case 'tolobby': { if (pl.id === leaderId && state !== 'lobby' && !S.MODES[mode].practice) goLobby(); break; }
      case 'ready': { if (!pl.alive) pl.ready = true; break; }
      case 'cfg': {
        if (pl.id !== leaderId) return;
        const nm = S.MAPS[m.map] ? m.map : mapId, nmo = S.MODES[m.mode] ? m.mode : mode;
        mapId = nm; mode = nmo;
        S.setMap(mapId); buildGrid(); setTeams();
        for (const p of players.values()) if (p.alive) p.ready = true;
        broadcast(cfgMsg());
        broadcast({ t: 'chat', id: 0, m: pl.name + ' startet ' + S.MODES[mode].n + ' auf ' + S.MAPS[mapId].n });
        resetRound();
        log('Karte: ' + S.MAPS[mapId].n + ', Modus: ' + S.MODES[mode].n);
        break;
      }
      case 'chat': {
        const txt = String(m.m || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
        if (txt) broadcast({ t: 'chat', id: pl.id, m: txt });
        break;
      }
      case 'bot': { if (pl.id !== leaderId) return; if (m.n > 0) addBot(); else removeBot(); broadcast(lobbyMsg()); break; }
      case 'skill': {
        if (pl.id !== leaderId) return;
        botSkill = Math.max(0, Math.min(2, m.n | 0));
        broadcast({ t: 'skill', n: botSkill });
        break;
      }
      case 'ping': {
        if (num(m.rtt)) pl.ping = Math.max(0, Math.min(999, Math.round(m.rtt)));
        conn.send({ t: 'pong', c: m.c });
        break;
      }
    }
  }
  function onClose(conn) {
    const p = conn.player;
    if (!p || !players.has(p.id)) return;
    players.delete(p.id);
    broadcast({ t: 'leave', id: p.id });
    log('- ' + p.name + ' hat das Spiel verlassen');
    fixLeader();
    if (humans() === 0) { if (S.MODES[mode].practice) { state = 'play'; resetRound(); } else goLobby(); }
    else { if (state === 'lobby') setTeams(); broadcast(lobbyMsg()); }
  }
  function throwNade(owner, k, o, v) {
    const n = { id: nextNadeId++, k, p: o, v, owner: owner.id, boomAt: now() + NADES[k].fuse * 1000 };
    nades.push(n);
    broadcast({ t: 'nade', id: n.id, k, o: o.map(r2), v: v.map(r2), owner: owner.id });
  }
  function explode(n) {
    broadcast({ t: 'boom', id: n.id, k: n.k, p: n.p.map(r2) });
    if (n.k === 'smoke') smokes.push({ p: [n.p[0], n.p[1] + 1.2, n.p[2]], until: now() + NADES.smoke.duration * 1000 });
    if (n.k === 'he') {
      const owner = players.get(n.owner) || null;
      const src = [n.p[0], n.p[1] + 0.2, n.p[2]];
      for (const q of [...players.values()]) {
        if (!q.alive) continue;
        const chest = [q.p[0], q.p[1] + 0.95, q.p[2]], head = [q.p[0], q.p[1] + 1.6, q.p[2]];
        const d = dist3(src, chest);
        if (d > NADES.he.radius) continue;
        if (!S.losClear(src, chest) && !S.losClear(src, head)) continue;
        applyDamage(q, owner, NADES.he.dmg * (1 - d / NADES.he.radius), 'he', 1, src);
      }
      for (const z of [...Z.list]) { const d = dist3(src, [z.p[0], z.p[1] + 1, z.p[2]]); if (d < NADES.he.radius * 1.1 && S.losClear(src, [z.p[0], z.p[1] + 1, z.p[2]])) zDamage(z, owner, NADES.he.dmg * 1.6 * (1 - d / (NADES.he.radius * 1.1)), 1); }
    }
    if (n.k === 'flash') for (const z of Z.list) { if (dist3(n.p, z.p) < 11 && S.losClear([n.p[0], n.p[1] + 0.3, n.p[2]], [z.p[0], z.p[1] + 1.5, z.p[2]])) z.stun = now() + 4000; }
  }

  // ------------------------------------------------------------------ Bots
  const CELL = 0.5;
  let GW = 0, GH = 0, blocked = new Uint8Array(0), bfsPrev = new Int32Array(0), bfsQ = new Int32Array(0);
  function buildGrid() {
    GW = Math.round(2 * MAP.HX / CELL); GH = Math.round(2 * MAP.HZ / CELL);
    blocked = new Uint8Array(GW * GH); bfsPrev = new Int32Array(GW * GH); bfsQ = new Int32Array(GW * GH);
    const r = 0.38;
    for (let gz = 0; gz < GH; gz++) for (let gx = 0; gx < GW; gx++) {
      const cx = -MAP.HX + (gx + 0.5) * CELL, cz = -MAP.HZ + (gz + 0.5) * CELL;
      for (const b of MAP.boxes) {
        if (b.y0 < 1.75 && b.y1 > 0.2 && cx + r > b.x0 && cx - r < b.x1 && cz + r > b.z0 && cz - r < b.z1) { blocked[gz * GW + gx] = 1; break; }
      }
    }
  }
  buildGrid();
  const cellOf = (x, z) => {
    const gx = Math.floor((x + MAP.HX) / CELL), gz = Math.floor((z + MAP.HZ) / CELL);
    if (gx < 0 || gz < 0 || gx >= GW || gz >= GH) return -1;
    return gz * GW + gx;
  };
  const isBlocked = (x, z) => { const c = cellOf(x, z); return c < 0 || blocked[c] === 1; };
  const cellPos = c => [-MAP.HX + ((c % GW) + 0.5) * CELL, -MAP.HZ + (Math.floor(c / GW) + 0.5) * CELL];
  function nearestFree(c) {
    if (c >= 0 && !blocked[c]) return c;
    if (c < 0) return -1;
    const cx = c % GW, cz = Math.floor(c / GW);
    for (let r = 1; r < 8; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= GW || z >= GH) continue;
      if (!blocked[z * GW + x]) return z * GW + x;
    }
    return -1;
  }
  function walkLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let i = 1; i <= n; i++) { const k = i / n; if (isBlocked(ax + (bx - ax) * k, az + (bz - az) * k)) return false; }
    return true;
  }
  function findPath(sx, sz, tx, tz) {
    const s = nearestFree(cellOf(sx, sz)), t = nearestFree(cellOf(tx, tz));
    if (s < 0 || t < 0) return null;
    bfsPrev.fill(-2);
    let qh = 0, qt = 0; bfsQ[qt++] = t; bfsPrev[t] = -1;
    while (qh < qt) {
      const c = bfsQ[qh++];
      if (c === s) break;
      const cx = c % GW, cz = (c - cx) / GW;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= GW || z >= GH) continue;
        const n = z * GW + x;
        if (blocked[n] || bfsPrev[n] !== -2) continue;
        if (dx && dz && (blocked[cz * GW + x] || blocked[z * GW + cx])) continue;
        bfsPrev[n] = c; bfsQ[qt++] = n;
      }
    }
    if (bfsPrev[s] === -2) return null;
    const raw = []; let c = s;
    while (bfsPrev[c] >= 0) { c = bfsPrev[c]; raw.push(cellPos(c)); }
    const out = []; let cur = [sx, sz], i = 0;
    if (isBlocked(sx, sz)) cur = cellPos(s);
    while (i < raw.length) {
      let j = i;
      for (let k = Math.min(raw.length - 1, i + 30); k > i; k--) if (walkLine(cur[0], cur[1], raw[k][0], raw[k][1])) { j = k; break; }
      out.push(raw[j]); cur = raw[j]; i = j + 1;
    }
    return out;
  }
  function resetAI(b) {
    const k = weaponOf(b, 0);
    b.ai = { path: null, pi: 0, target: 0, reactAt: 0, nextFire: 0, mag: S.stats(k, b.lo.att[k]).mag, reloadUntil: 0, burst: 0, strafe: 1, strafeUntil: 0, repathAt: 0, scanAt: 0, visible: false, alert: 0, alertUntil: 0 };
  }
  function addBot() {
    if (bots().length >= MAX_BOTS || players.size >= MAX_PLAYERS) return;
    const used = new Set([...players.values()].map(p => p.name));
    const name = BOT_NAMES.find(n => !used.has(n)) || 'Bot ' + nextId;
    const b = makePlayer(name, null, true);
    resetAI(b);
    broadcast({ t: 'join', p: info(b) });
    if (state === 'play') spawnPlayer(b);
  }
  function removeBot() {
    const bs = bots(); if (!bs.length) return;
    const b = bs[bs.length - 1];
    players.delete(b.id);
    broadcast({ t: 'leave', id: b.id });
  }
  function canSee(b, q) {
    const eye = [b.p[0], b.p[1] + PLAYER.EYE, b.p[2]], tgt = [q.p[0], q.p[1] + ((q.fl & 1) ? 0.8 : 1.2), q.p[2]];
    if (!S.losClear(eye, tgt)) return false;
    for (const s of smokes) if (S.segSphere(eye, tgt, s.p, NADES.smoke.radius)) return false;
    return true;
  }
  function botMove(b, tx, tz, speed, dt) {
    const dx = tx - b.p[0], dz = tz - b.p[2], d = Math.hypot(dx, dz);
    if (d < 1e-4) return true;
    const st = Math.min(d, speed * dt), nx = b.p[0] + dx / d * st, nz = b.p[2] + dz / d * st;
    let ok = true;
    if (!isBlocked(nx, nz)) { b.p[0] = nx; b.p[2] = nz; }
    else if (!isBlocked(nx, b.p[2])) b.p[0] = nx;
    else if (!isBlocked(b.p[0], nz)) b.p[2] = nz;
    else ok = false;
    if (ok) b.p[1] = S.groundAt(b.p[0], b.p[1] + 0.5, b.p[2]);
    return ok;
  }
  function botFollow(b, speed, dt) {
    const ai = b.ai;
    if (!ai.path || ai.pi >= ai.path.length) return false;
    const wp = ai.path[ai.pi];
    if (!botMove(b, wp[0], wp[1], speed, dt)) { ai.path = null; return false; }
    if (Math.hypot(wp[0] - b.p[0], wp[1] - b.p[2]) < 0.25) ai.pi++;
    return true;
  }
  function turnTo(b, yaw, pitch, rate, dt) {
    let dy = yaw - b.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    const k = Math.min(1, rate * dt);
    b.yaw += dy * k; b.pitch += (pitch - b.pitch) * k;
    return Math.abs(dy) * (1 - k);
  }
  function botFire(b, tg, t) {
    const key = weaponOf(b, 0), w = WEAPONS[key], ai = b.ai, sk = SKILLS[botSkill], st = S.stats(key, b.lo.att[key]);
    const eye = [b.p[0], b.p[1] + PLAYER.EYE, b.p[2]];
    const headshot = Math.random() < 0.06;
    const aim = [tg.p[0], tg.p[1] + ((tg.fl & 1) ? (headshot ? 1.15 : 0.75) : (headshot ? 1.62 : 1.15)), tg.p[2]];
    let dx = aim[0] - eye[0], dy = aim[1] - eye[1], dz = aim[2] - eye[2];
    const d = Math.hypot(dx, dy, dz); dx /= d; dy /= d; dz /= d;
    b.protUntil = 0;
    let rx = -dz, rz = dx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ends = [], acc = new Map();
    const ex = gauss() * sk.err, ey = gauss() * sk.err * 0.7;
    for (let i = 0; i < w.pellets; i++) {
      const sx = ex + gauss() * (w.spread + 0.004), sy = ey + gauss() * (w.spread + 0.004);
      let vx = dx + rx * sx, vy = dy + sy, vz = dz + rz * sx; // "oben" = Weltachse reicht als Näherung
      const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
      const mh = S.rayBoxes(eye[0], eye[1], eye[2], vx, vy, vz, 200);
      let best = mh ? mh.t : 200, hit = null, zone = 1;
      for (const q of players.values()) {
        if (q === b || !q.alive) continue;
        const r = S.rayPlayer(eye[0], eye[1], eye[2], vx, vy, vz, q.p, q.fl & 1);
        if (r && r.t < best) { best = r.t; hit = q; zone = r.zone; }
      }
      ends.push([r2(eye[0] + vx * best), r2(eye[1] + vy * best), r2(eye[2] + vz * best)]);
      if (hit) {
        const a = acc.get(hit) || { dmg: 0, zone: 2 };
        a.dmg += w.dmg * S.zoneMult(w, zone) * S.falloff(w, best, st.range); a.zone = Math.min(a.zone, zone);
        acc.set(hit, a);
      }
    }
    broadcast({ t: 'shot', id: b.id, e: ends, w: key, s: st.sup ? 1 : 0 });
    ai.mag--;
    const iv = 60000 / w.rpm;
    ai.nextFire = t + (w.auto ? iv : iv * rnd(1.5, 2.3));
  // Feuerstöße statt Dauerfeuer, danach kurz neu zielen
  if (w.auto && ++ai.burst >= sk.burst) { ai.burst = 0; ai.nextFire = t + rnd(380, 750); }
    if (ai.mag <= 0) { ai.reloadUntil = t + st.reload * 1000; ai.mag = st.mag; }
    for (const [q, a] of acc) applyDamage(q, b, a.dmg, key, a.zone, eye);
  }
  function botTick(b, t, dt) {
    const ai = b.ai, key = weaponOf(b, 0), w = WEAPONS[key], sk = SKILLS[botSkill];
    b.fl = t < ai.reloadUntil ? 8 : 0;
    if (t >= ai.scanAt) {
      ai.scanAt = t + 140 + Math.random() * 60;
      let best = null, bd = 1e9;
      for (const q of players.values()) {
        if (q === b || !q.alive || t < q.protUntil || mate(q, b)) continue;
        const d = dist3(b.p, q.p);
        if (d > 70) continue;
        const ang = Math.atan2(-(q.p[0] - b.p[0]), -(q.p[2] - b.p[2]));
        let da = ang - b.yaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        const alerted = ai.alert === q.id && t < ai.alertUntil;
        if (Math.abs(da) > 1.45 && d > 5 && !alerted) continue;
        if (!canSee(b, q)) continue;
        const score = d - (alerted ? 15 : 0);
        if (score < bd) { bd = score; best = q; }
      }
      if (best) { if (ai.target !== best.id || !ai.visible) ai.reactAt = t + sk.react * rnd(0.8, 1.3); ai.target = best.id; ai.visible = true; }
      else ai.visible = false;
    }
    const tg = ai.visible ? players.get(ai.target) : null;
    const speed = PLAYER.RUN * 0.86 * (w.speed || 1);
    if (tg && tg.alive) {
      const dx = tg.p[0] - b.p[0], dz = tg.p[2] - b.p[2], dy = (tg.p[1] + 1.1) - (b.p[1] + PLAYER.EYE);
      const d = Math.hypot(dx, dz);
      const off = turnTo(b, Math.atan2(-dx, -dz), Math.atan2(dy, d), 8, dt);
      if (w.melee) {
        if (d > 1.5) { if (!botMove(b, tg.p[0], tg.p[2], speed, dt)) chase(b, tg, t, speed, dt, true); }
        if (d < 1.9 && Math.abs(tg.p[1] - b.p[1]) < 1.6 && t >= ai.nextFire) {
          ai.nextFire = t + 60000 / w.rpm * rnd(1.1, 1.5);
          b.protUntil = 0;
          broadcast({ t: 'shot', id: b.id, e: [], w: 'knife', s: 0 });
          applyDamage(tg, b, w.dmg, 'knife', 1, [b.p[0], b.p[1] + PLAYER.EYE, b.p[2]]);
        }
      } else {
        const pref = key === 'shotgun' ? 7 : (key === 'smg' || key === 'pistol') ? 13 : w.scope ? 30 : 20;
        if (d > pref) { if (!botMove(b, tg.p[0], tg.p[2], speed, dt)) chase(b, tg, t, speed, dt, false); }
        else {
          if (t > ai.strafeUntil) { ai.strafe = Math.random() < 0.5 ? -1 : 1; ai.strafeUntil = t + rnd(500, 1400); }
          const px = -dz / (d || 1) * ai.strafe, pz = dx / (d || 1) * ai.strafe;
          if (!botMove(b, b.p[0] + px * 2, b.p[2] + pz * 2, speed * 0.7, dt)) ai.strafe = -ai.strafe;
        }
        if (t >= ai.reactAt && t >= ai.nextFire && t >= ai.reloadUntil && off < 0.2) botFire(b, tg, t);
      }
      ai.path = null;
      return;
    }
    if (!ai.path || ai.pi >= ai.path.length || t >= ai.repathAt) {
      let goal = null;
      if (teamMode() && MAP.point && !w.melee && Math.random() < 0.7) { const P = MAP.point; goal = [P[0] + rnd(-P[3], P[3]) * 0.6, P[2] + rnd(-P[3], P[3]) * 0.6]; }
      else if (w.melee || Math.random() < 0.75) {
        let bd = 1e9;
        for (const q of players.values()) { if (q === b || !q.alive || mate(q, b)) continue; const d = dist3(b.p, q.p); if (d < bd) { bd = d; goal = [q.p[0], q.p[2]]; } }
      }
      if (!goal) { const s = MAP.spawns[Math.floor(Math.random() * MAP.spawns.length)]; goal = [s[0], s[2]]; }
      ai.path = findPath(b.p[0], b.p[2], goal[0], goal[1]); ai.pi = 0;
      ai.repathAt = t + (w.melee ? 900 : 2600) + Math.random() * 600;
    }
    const px = b.p[0], pz = b.p[2];
    if (botFollow(b, speed, dt)) {
      const mx = b.p[0] - px, mz = b.p[2] - pz;
      if (Math.hypot(mx, mz) > 1e-4) turnTo(b, Math.atan2(-mx, -mz), 0, 8, dt);
    }
  }
  function chase(b, tg, t, speed, dt, fast) {
    const ai = b.ai;
    if (!ai.path || ai.pi >= ai.path.length || t >= ai.repathAt) {
      ai.path = findPath(b.p[0], b.p[2], tg.p[0], tg.p[2]); ai.pi = 0; ai.repathAt = t + (fast ? 600 : 1500);
    }
    botFollow(b, speed, dt);
  }

  // ------------------------------------------------------------------ Tick
  function cpTick(dt) {
    const P = MAP.point, n = [0, 0];
    for (const p of players.values()) if (p.alive && Math.hypot(p.p[0] - P[0], p.p[2] - P[2]) < P[3] && Math.abs(p.p[1] - P[1]) < 3) n[p.team]++;
    cp.n = n;
    const only = n[0] && !n[1] ? 0 : n[1] && !n[0] ? 1 : -1, rate = 1 / S.MODES.ctp.capTime;
    if (only >= 0 && only !== cp.owner) {
      if (cp.cap !== only) { cp.prog = Math.max(0, cp.prog - rate * 2 * dt); if (cp.prog === 0) cp.cap = only; }
      else cp.prog += rate * dt * Math.min(2, 1 + 0.35 * (n[only] - 1));
      if (cp.cap === only && cp.prog >= 1) {
        cp.owner = only; cp.cap = -1; cp.prog = 0;
        broadcast({ t: 'chat', id: 0, m: 'Team ' + S.TEAMS[only].n + ' hat den Punkt erobert!' });
        broadcast({ t: 'cpcap', team: only });
      }
    } else if (only < 0 && !n[0] && !n[1]) cp.prog = Math.max(0, cp.prog - rate * 0.5 * dt);
    else if (only >= 0 && only === cp.owner) cp.prog = Math.max(0, cp.prog - rate * dt);
    if (!cp.prog && only < 0) cp.cap = -1;
    if (cp.owner >= 0) {
      cp.score[cp.owner] += dt;
      if (cp.score[cp.owner] >= CTP_LIMIT) { cp.score[cp.owner] = CTP_LIMIT; endRound(cp.owner); }
    }
  }
  // ------------------------------------------------------------- Zombies
  // Wellen: Pause (Kaufen) -> Welle (Zombies kommen durch die Zaunlücken) -> Pause ... bis alle Spieler tot sind
  let Z = { phase: 'off', wave: 0, next: 0, toSpawn: 0, spawnAt: 0, list: [], nid: 1, turrets: [], tid: 1, kills: 0 };
  function zReset() { Z = { phase: 'break', wave: 0, next: now() + 12000, toSpawn: 0, spawnAt: 0, list: [], nid: 1, turrets: [], tid: 1, kills: 0 }; }
  const living = () => [...players.values()].filter(p => p.alive);
  function coins(p, n) { if (!p || p.bot || !n) return; p.coins = Math.max(0, (p.coins || 0) + n); if (p.conn) p.conn.send({ t: 'coins', c: p.coins, add: n }); }
  function zSpawn(t) {
    const sp = MAP.zspawns[Math.floor(Math.random() * MAP.zspawns.length)], w = Z.wave;
    const r = Math.random();
    const type = w >= 5 && r < 0.07 + w * 0.006 ? 2 : w >= 3 && r < 0.3 + w * 0.01 ? 1 : 0, T = S.ZTYPES[type];
    const hp = Math.round(T.hp * (1 + (w - 1) * 0.15));
    Z.list.push({ id: Z.nid++, type, s: T.s, p: [sp[0] + rnd(-1, 1), 0, sp[1] + rnd(-1, 1)], yaw: 0, hp, max: hp, sp: T.sp * (1 + Math.min(0.35, w * 0.025)) * rnd(0.9, 1.1), dmg: T.dmg * (1 + w * 0.04), path: null, pi: 0, repath: 0, atk: t + 600, stun: 0, tgt: 0 });
  }
  function zDamage(z, by, dmg, zone) {
    if (!Z.list.includes(z) || dmg <= 0) return;
    dmg = Math.round(dmg); z.hp -= dmg;
    const kill = z.hp <= 0;
    if (by && by.conn) by.conn.send({ t: 'hitc', id: -z.id, dmg, z: zone, kill });
    if (by && !kill) coins(by, 1);
    if (!kill) return;
    Z.list.splice(Z.list.indexOf(z), 1); Z.kills++;
    const T = S.ZTYPES[z.type], c = T.coins + (zone === 0 ? 5 : 0);
    if (by) { by.kills++; coins(by, c); }
    broadcast({ t: 'zdie', id: z.id, by: by ? by.id : 0, hs: zone === 0, c, p: z.p.map(r2), type: z.type });
  }
  function zBuy(p, id) {
    const it = S.ZSHOP.find(i => i.id === id), no = why => p.conn && p.conn.send({ t: 'zbuy', ok: false, id, why });
    if (!it) return;
    if ((p.coins || 0) < it.c) return no('Nicht genug Coins');
    if (!p.alive && id !== 'ammo') return no('Erst in der nächsten Pause wieder dabei');
    const [kind, arg] = id.split(':');
    if (kind === 'w') { if (S.SECONDARY.indexOf(arg) >= 0) p.lo.zs = arg; else p.lo.zp = arg; if (p.loNext) { p.loNext.zp = p.lo.zp; p.loNext.zs = p.lo.zs; } }
    else if (kind === 'n') { if ((p.nades[arg] || 0) >= it.max) return no('Du trägst schon das Maximum'); p.nades[arg] = (p.nades[arg] || 0) + 1; }
    else if (kind === 'med') { if (p.hp >= 100) return no('Du bist schon voll geheilt'); p.hp = 100; if (p.conn) p.conn.send({ t: 'hp', hp: 100, heal: 1 }); }
    else if (kind === 'armor') { if ((p.armor || 0) >= 100) return no('Weste ist noch intakt'); p.armor = 100; }
    else if (kind === 't') {
      if (Z.turrets.filter(u => u.owner === p.id).length >= 2) return no('Höchstens 2 Geschütze pro Spieler');
      const f = [-Math.sin(p.yaw), -Math.cos(p.yaw)], pos = [p.p[0] + f[0] * 1.4, 0, p.p[2] + f[1] * 1.4];
      if (S.pointSolid(pos[0], p.p[1] + 0.6, pos[2], 0.35)) return no('Hier ist kein Platz – such dir eine freie Stelle');
      pos[1] = S.groundAt(pos[0], p.p[1] + 1, pos[2]);
      const T = S.TURRETS[arg];
      Z.turrets.push({ id: Z.tid++, k: arg, p: pos, yaw: p.yaw, owner: p.id, until: now() + T.life * 1000, next: 0 });
    }
    p.coins -= it.c;
    if (p.conn) p.conn.send({ t: 'zbuy', ok: true, id, coins: p.coins, lo: p.lo, nades: p.nades, armor: p.armor || 0 });
    broadcast({ t: 'chat', id: 0, m: p.name + ' kauft ' + it.n }, p);
  }
  function zTick(t, dt) {
    if (Z.phase === 'off') zReset();
    const alive = living(), humansIn = [...players.values()].filter(p => !p.bot);
    // Alle tot -> Spiel vorbei
    if (Z.phase === 'wave' && humansIn.length && !alive.length) {
      Z.phase = 'over'; state = 'end'; roundEndsAt = t + ROUND_END_MS;
      broadcast({ t: 'win', id: 0, zombie: true, wave: Z.wave, kills: Z.kills, name: 'Die Zombies', ms: ROUND_END_MS, mode });
      log('Zombies: Welle ' + Z.wave + ' erreicht');
      if (Z.wave >= 5) for (const p of humansIn) openPack(p); // Belohnung ab Welle 5
      return;
    }
    if (Z.phase === 'break' && t >= Z.next) {
      Z.wave++; Z.phase = 'wave';
      Z.toSpawn = 5 + Z.wave * 4 + (humansIn.length - 1) * 3;
      Z.spawnAt = t + 500;
      broadcast({ t: 'zwave', n: Z.wave, count: Z.toSpawn });
    }
    if (Z.phase === 'wave') {
      if (Z.toSpawn > 0 && t >= Z.spawnAt && Z.list.length < 14 + humansIn.length * 3) { zSpawn(t); Z.toSpawn--; Z.spawnAt = t + Math.max(350, 1500 - Z.wave * 80) * rnd(0.6, 1.3); }
      if (!Z.toSpawn && !Z.list.length) { // Welle geschafft
        Z.phase = 'break'; Z.next = t + 20000;
        const bonus = 100 + Z.wave * 25;
        for (const p of humansIn) { coins(p, bonus); p.zOut = false; if (!p.alive) { p.respawnAt = 0; p.ready = true; } else { p.hp = 100; if (p.conn) p.conn.send({ t: 'hp', hp: 100, heal: 1 }); } }
        broadcast({ t: 'zbreak', n: Z.wave, ms: 20000, bonus });
      }
    }
    // Zombies bewegen und angreifen
    for (const z of Z.list) {
      if (t < z.stun) continue;
      let tg = null, bd = 1e9;
      for (const p of alive) { const d = Math.hypot(p.p[0] - z.p[0], p.p[2] - z.p[2]) + Math.abs(p.p[1] - z.p[1]) * 2; if (d < bd) { bd = d; tg = p; } }
      if (!tg) continue;
      const dx = tg.p[0] - z.p[0], dz = tg.p[2] - z.p[2], d = Math.hypot(dx, dz);
      const reach = 1.15 * z.s;
      if (d < reach && Math.abs(tg.p[1] - z.p[1]) < 1.6) {
        z.yaw = Math.atan2(-dx, -dz);
        if (t >= z.atk) { z.atk = t + 1100; broadcast({ t: 'zatk', id: z.id }); applyDamage(tg, null, z.dmg, 'zombie', 1, [z.p[0], z.p[1] + 1.4, z.p[2]]); }
        continue;
      }
      const step = z.sp * dt;
      let moved = false;
      if (d < 9 && Math.abs(tg.p[1] - z.p[1]) < 1 && walkLine(z.p[0], z.p[2], tg.p[0], tg.p[2])) { moved = botMove(z, tg.p[0], tg.p[2], z.sp, dt); z.path = null; }
      else {
        if (!z.path || z.pi >= z.path.length || t >= z.repath || z.tgt !== tg.id) { z.path = findPath(z.p[0], z.p[2], tg.p[0], tg.p[2]); z.pi = 0; z.repath = t + rnd(700, 1300); z.tgt = tg.id; }
        if (z.path && z.pi < z.path.length) { const wp = z.path[z.pi]; moved = botMove(z, wp[0], wp[1], z.sp, dt); if (Math.hypot(wp[0] - z.p[0], wp[1] - z.p[2]) < 0.3) z.pi++; if (!moved) z.path = null; }
        else if (!isBlocked(z.p[0], z.p[2]) || true) { moved = botMove(z, tg.p[0], tg.p[2], z.sp, dt); } // außerhalb des Rasters: direkt hin
      }
      void step;
      if (moved) { const nx = tg.p[0] - z.p[0], nz = tg.p[2] - z.p[2]; const want = Math.atan2(-nx, -nz); let dy = want - z.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; z.yaw += dy * Math.min(1, dt * 6); }
    }
    // Abstand halten, damit sie nicht in einem Punkt verschmelzen
    for (let i = 0; i < Z.list.length; i++) for (let j = i + 1; j < Z.list.length; j++) {
      const a = Z.list[i], b = Z.list[j], dx = b.p[0] - a.p[0], dz = b.p[2] - a.p[2], d = Math.hypot(dx, dz), m = 0.55 * (a.s + b.s);
      if (d < m && d > 1e-4) { const k = (m - d) * 0.5 / d; if (!isBlocked(a.p[0] - dx * k, a.p[2] - dz * k)) { a.p[0] -= dx * k; a.p[2] -= dz * k; } if (!isBlocked(b.p[0] + dx * k, b.p[2] + dz * k)) { b.p[0] += dx * k; b.p[2] += dz * k; } }
    }
    // Geschütztürme
    for (const u of [...Z.turrets]) {
      if (t >= u.until) { Z.turrets.splice(Z.turrets.indexOf(u), 1); broadcast({ t: 'tgone', id: u.id }); continue; }
      const T = S.TURRETS[u.k], eye = [u.p[0], u.p[1] + 1.05, u.p[2]];
      let best = null, bd = T.range;
      for (const z of Z.list) { const c = [z.p[0], z.p[1] + 1.2 * z.s, z.p[2]], d = dist3(eye, c); if (d < bd && S.losClear(eye, c)) { bd = d; best = z; } }
      if (!best) continue;
      u.yaw = Math.atan2(-(best.p[0] - u.p[0]), -(best.p[2] - u.p[2]));
      if (t < u.next) continue;
      u.next = t + 60000 / T.rpm;
      const owner = players.get(u.owner) || null, hs = Math.random() < 0.15;
      const hit = [best.p[0], best.p[1] + (hs ? 1.65 : 1.15) * best.s, best.p[2]];
      broadcast({ t: 'tshot', id: u.id, e: hit.map(r2), k: u.k });
      zDamage(best, owner, T.dmg * (hs ? 1.8 : 1), hs ? 0 : 1);
    }
  }
  let lastPing = 0;
  function tick() {
    if (humans() === 0 || state === 'lobby') return;
    const t = now(), dt = 1 / TICK;
    if (state === 'end') { if (t >= roundEndsAt) goLobby(); }
    else {
      for (const p of [...players.values()]) {
        if (!p.alive) { if (t >= p.respawnAt && (p.bot || p.ready) && !(zMode() && p.zOut)) spawnPlayer(p); continue; }
        if (p.bot) {
          botTick(p, t, dt);
          p.hist.push({ t, x: p.p[0], y: p.p[1], z: p.p[2] });
          while (p.hist.length && t - p.hist[0].t > 900) p.hist.shift();
        }
      }
      for (let i = nades.length - 1; i >= 0; i--) {
        const n = nades[i];
        S.stepNade(n, dt);
        if (t >= n.boomAt) { nades.splice(i, 1); explode(n); }
      }
      for (let i = smokes.length - 1; i >= 0; i--) if (t >= smokes[i].until) smokes.splice(i, 1);
      if (teamMode() && MAP.point && state === 'play') cpTick(dt);
      if (zMode() && state === 'play') zTick(t, dt);
      for (const it of items) {
        if (!it.on) { if (t >= it.backAt) { it.on = true; broadcast({ t: 'item', id: it.id, on: 1 }); } continue; }
        for (const p of players.values()) {
          if (!p.alive || p.hp >= 100) continue;
          if (Math.hypot(p.p[0] - it.p[0], p.p[2] - it.p[2]) < 1.1 && Math.abs(p.p[1] - it.p[1]) < 1.5) {
            p.hp = Math.min(100, p.hp + 50); it.on = false; it.backAt = t + ITEM_RESPAWN_MS;
            broadcast({ t: 'item', id: it.id, on: 0, by: p.id });
            if (p.conn) p.conn.send({ t: 'hp', hp: p.hp, heal: 1 });
            break;
          }
        }
      }
    }
    const l = [];
    for (const p of players.values()) if (p.alive) l.push([p.id, r2(p.p[0]), r2(p.p[1]), r2(p.p[2]), Math.round(p.yaw * 1000) / 1000, Math.round(p.pitch * 1000) / 1000, p.fl, p.slot]);
    const snap = { t: 'snap', l };
    if (zMode()) {
      snap.zs = [Z.wave, Z.phase === 'wave' ? 1 : Z.phase === 'break' ? 2 : 0, Z.toSpawn + Z.list.length, Math.max(0, Math.ceil((Z.next - t) / 1000))];
      snap.z = Z.list.map(z => [z.id, r2(z.p[0]), r2(z.p[1]), r2(z.p[2]), Math.round(z.yaw * 100) / 100, z.type, Math.round(z.hp / z.max * 100), t < z.stun ? 1 : 0]);
      snap.tu = Z.turrets.map(u => [u.id, r2(u.p[0]), r2(u.p[1]), r2(u.p[2]), Math.round(u.yaw * 100) / 100, u.k === 'heavy' ? 1 : 0, Math.ceil((u.until - t) / 1000), u.owner]);
    }
    if (teamMode()) snap.cp = [cp.owner, cp.cap, Math.round(cp.prog * 100), Math.floor(cp.score[0]), Math.floor(cp.score[1]), cp.n[0], cp.n[1]];
    broadcast(snap);
    if (t - lastPing > 2000) { lastPing = t; broadcast({ t: 'pings', l: [...players.values()].map(p => [p.id, p.ping]) }); }
  }


  let timer = null;
  function start() { if (!timer) timer = setInterval(() => { try { tick(); } catch (e) { log('Fehler im Tick: ' + (e && e.stack || e)); } }, 1000 / TICK); }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  const nb = Math.max(0, Math.min(MAX_BOTS, opts.bots === undefined ? 2 : +opts.bots | 0));
  for (let i = 0; i < nb; i++) addBot();
  return {
    message(conn, m) { if (m && typeof m === 'object') { try { onMessage(conn, m); } catch (e) { log('Fehler in Nachricht: ' + (e && e.stack || e)); } } },
    close(conn) { onClose(conn); },
    start, stop, tick, addBot, removeBot,
    get mapId() { return mapId; }, get mode() { return mode; },
    humans, bots: () => bots().length
  };
}
return { create, TICK, MAX_PLAYERS, MAX_BOTS };
});
