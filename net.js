/* BLOCKFEUER – Verbindungen
   - Eigener Node-Server (server.js): normale WebSocket-Verbindung.
   - GitHub Pages / statisches Hosting: Ein Browser ist Host (host.js läuft dort), Freunde verbinden sich
     per WebRTC über PeerJS (nur zum Verbindungsaufbau wird der öffentliche PeerJS-Server benutzt).
   Alle Varianten liefern ein WebSocket-ähnliches Objekt: { readyState, send(str), close(), onopen, onmessage, onclose } */
window.Net = (() => {
  'use strict';
  const PEER_SRC = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js';
  const PREFIX = 'blockfeuer-v1-';
  const TIMEOUT = 12000;
  const st = { host: null, peer: null, code: '', peers: new Set(), mode: '' };

  // läuft ein eigener BLOCKFEUER-Server hinter dieser Seite?
  function detect() {
    if (window.BF_OFFLINE || location.protocol === 'file:') return Promise.resolve(false);
    return fetch('health', { cache: 'no-store' }).then(r => (r.ok ? r.text() : '')).then(t => t === 'blockfeuer-server').catch(() => false);
  }
  function fake() { return { readyState: 0, onopen: null, onmessage: null, onclose: null, send() { }, close() { } }; }
  function fire(ws, ev, arg) { const f = ws['on' + ev]; if (f) try { f(arg); } catch (e) { console.error(e); } }
  function shutClient(ws) { if (ws.readyState === 3) return; ws.readyState = 3; fire(ws, 'close'); }

  // ------------------------------------------------------------ eigener Server
  function server() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    st.mode = 'server';
    return Promise.resolve(new WebSocket(proto + '://' + location.host));
  }

  // ------------------------------------------------- Host im eigenen Browser
  function ensureHost(opts) {
    if (!st.host) { st.host = window.GameHost.create(opts || {}); st.host.start(); }
    return st.host;
  }
  function loopback(h) {
    const ws = fake();
    const conn = {
      open: true, player: null,
      sendText(s) { if (this.open) Promise.resolve().then(() => { if (ws.readyState === 1) fire(ws, 'message', { data: s }); }); },
      send(o) { this.sendText(JSON.stringify(o)); },
      kill() { if (!this.open) return; this.open = false; h.close(this); shutClient(ws); }
    };
    ws.send = s => { if (!conn.open) return; let m; try { m = JSON.parse(s); } catch (e) { return; } Promise.resolve().then(() => h.message(conn, m)); };
    ws.close = () => conn.kill();
    setTimeout(() => { ws.readyState = 1; fire(ws, 'open'); }, 0);
    return ws;
  }
  function local(opts) { st.mode = 'local'; return Promise.resolve(loopback(ensureHost(opts))); }

  // ------------------------------------------------------------------ PeerJS
  let peerLib = null;
  function loadPeer() {
    if (peerLib) return peerLib;
    peerLib = new Promise((res, rej) => {
      const got = () => (window.peerjs && window.peerjs.Peer) || window.Peer;
      if (got()) return res(got());
      const s = document.createElement('script');
      s.src = PEER_SRC; s.async = true;
      s.onload = () => (got() ? res(got()) : rej(new Error('PeerJS fehlt')));
      s.onerror = () => { peerLib = null; rej(new Error('Die Online-Bibliothek (PeerJS) konnte nicht geladen werden. Internetverbindung prüfen.')); };
      document.head.appendChild(s);
    });
    return peerLib;
  }
  function code5() { const a = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = ''; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  const errText = e => {
    const t = e && e.type;
    if (t === 'peer-unavailable') return 'Kein Spiel mit diesem Code gefunden – ist der Host noch online?';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Der Verbindungsdienst (PeerJS) ist gerade nicht erreichbar. Gleich nochmal versuchen.';
    if (t === 'browser-incompatible') return 'Dieser Browser unterstützt kein WebRTC.';
    return (e && e.message) || 'Verbindung fehlgeschlagen.';
  };

  // Spiel online stellen: der lokale Host nimmt Verbindungen von Freunden an
  function goOnline(opts) {
    const h = ensureHost(opts);
    if (st.peer && st.code) return Promise.resolve(st.code);
    return loadPeer().then(Peer => new Promise((res, rej) => {
      const attempt = n => {
        const c = code5(), p = new Peer(PREFIX + c, { debug: 0 });
        let opened = false;
        p.on('open', () => { opened = true; st.peer = p; st.code = c; res(c); });
        p.on('connection', dc => accept(h, dc));
        p.on('error', e => {
          if (opened) { console.warn('PeerJS:', e && e.type); return; }
          try { p.destroy(); } catch (x) { /* egal */ }
          if (e && e.type === 'unavailable-id' && n < 5) attempt(n + 1); else rej(new Error(errText(e)));
        });
        p.on('disconnected', () => { if (!p.destroyed) setTimeout(() => { try { if (!p.destroyed && p.disconnected) p.reconnect(); } catch (x) { /* egal */ } }, 1500); });
      };
      attempt(0);
    }));
  }
  function accept(h, dc) {
    const conn = {
      open: false, dead: false, player: null, last: Date.now(),
      sendText(s) {
        if (!this.open) return;
        const ch = dc.dataChannel;
        if (ch && ch.bufferedAmount > (1 << 20)) return this.kill(); // hängt hoffnungslos hinterher
        try { dc.send(s); } catch (e) { this.kill(); }
      },
      send(o) { this.sendText(JSON.stringify(o)); },
      kill() { if (this.dead) return; this.dead = true; this.open = false; st.peers.delete(this); try { dc.close(); } catch (e) { /* egal */ } h.close(this); }
    };
    dc.on('open', () => { conn.open = true; conn.last = Date.now(); st.peers.add(conn); });
    dc.on('data', d => {
      conn.last = Date.now();
      let m = d;
      if (typeof d === 'string') { try { m = JSON.parse(d); } catch (e) { return; } }
      h.message(conn, m);
    });
    dc.on('close', () => conn.kill());
    dc.on('error', () => conn.kill());
  }
  // Freunde, die sich nicht mehr melden (Tab geschlossen), nach kurzer Zeit entfernen
  setInterval(() => { const t = Date.now(); for (const c of [...st.peers]) if (t - c.last > TIMEOUT) c.kill(); }, 2000);

  function host(opts) { st.mode = 'host'; return goOnline(opts).then(() => loopback(st.host)); }

  function join(code) {
    code = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!code) return Promise.reject(new Error('Bitte einen Spiel-Code eingeben.'));
    st.mode = 'join';
    return loadPeer().then(Peer => new Promise((res, rej) => {
      const p = new Peer({ debug: 0 }), ws = fake();
      let ok = false, last = Date.now(), watch = 0;
      const fail = e => { if (ok) { shutClient(ws); } else rej(new Error(errText(e))); clearInterval(watch); try { p.destroy(); } catch (x) { /* egal */ } };
      const timer = setTimeout(() => { if (!ok) fail(new Error('Der Host antwortet nicht. Code richtig? Läuft das Spiel beim Host noch?')); }, 20000);
      p.on('error', fail);
      p.on('open', () => {
        const dc = p.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
        dc.on('open', () => {
          ok = true; clearTimeout(timer); ws.readyState = 1; last = Date.now();
          ws.send = s => { if (ws.readyState === 1) try { dc.send(s); } catch (e) { fail(e); } };
          ws.close = () => fail();
          watch = setInterval(() => { if (Date.now() - last > TIMEOUT) fail(); }, 2000);
          res(ws);
          setTimeout(() => fire(ws, 'open'), 0);
        });
        dc.on('data', d => { last = Date.now(); fire(ws, 'message', { data: typeof d === 'string' ? d : JSON.stringify(d) }); });
        dc.on('close', () => fail());
        dc.on('error', e => fail(e));
      });
    }));
  }

  function inviteLink() {
    if (st.mode === 'server') return location.origin + '/';
    if (!st.code) return '';
    return location.origin + location.pathname + '?join=' + st.code;
  }
  return {
    detect, server, local, host, join, goOnline, inviteLink,
    get mode() { return st.mode; }, get code() { return st.code; }, get online() { return !!st.code; },
    peerCount: () => st.peers.size
  };
})();
