#!/usr/bin/env node
/* BLOCKFEUER – eigener Spielserver (optional; keine Abhängigkeiten, nur Node.js >= 18)
   Für GitHub Pages wird er NICHT gebraucht – dort hostet ein Browser das Spiel (siehe README.md).
   Start:  node server.js            -> http://localhost:3000
           node server.js --tunnel   -> zusätzlich öffentlicher Link über cloudflared
   Umgebungsvariablen: PORT (3000), BOTS (Bots beim Start, Standard 2), BOT_SKILL (0 leicht, 1 mittel, 2 schwer),
                       MAP (stadt | wueste), MODE (gungame | dm) */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const { spawn } = require('child_process');
const S = require('./shared.js');
const GameHost = require('./host.js');

const PORT = +process.env.PORT || 3000;
const host = GameHost.create({
  map: process.env.MAP, mode: process.env.MODE, bots: process.env.BOTS, botSkill: process.env.BOT_SKILL,
  log: s => console.log(s)
});

// ---------------------------------------------------------------- HTTP
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.bin': 'application/octet-stream', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUBLIC = new Set(['index.html', 'game.js', 'shared.js', 'host.js', 'net.js', 'assets/models.json', 'assets/models.bin', 'assets/zombies.bin']);
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('blockfeuer-server'); }
  if (url === '/') url = '/index.html';
  const rel = url.slice(1);
  if (!PUBLIC.has(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
  fs.readFile(path.join(__dirname, rel), (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'Cache-Control': rel.startsWith('assets/') ? 'max-age=3600' : 'no-cache' });
    res.end(data);
  });
});

// ----------------------------------------------------------- WebSocket
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
function frame(op, data) {
  const len = data.length; let h;
  if (len < 126) { h = Buffer.allocUnsafe(2); h[1] = len; }
  else if (len < 65536) { h = Buffer.allocUnsafe(4); h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.allocUnsafe(10); h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(len, 6); }
  h[0] = 0x80 | op;
  return Buffer.concat([h, data]);
}
server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  const conn = {
    socket, buf: null, frag: null, fragLen: 0, open: true, player: null,
    sendRaw(buf) {
      if (!this.open) return;
      if (socket.writableLength > 1 << 20) return this.kill(); // hängt hoffnungslos hinterher
      socket.write(buf);
    },
    sendText(txt) { this.sendRaw(frame(1, Buffer.from(txt))); },
    send(obj) { this.sendText(JSON.stringify(obj)); },
    kill() { if (!this.open) return; this.open = false; socket.destroy(); host.close(this); }
  };
  socket.on('data', d => { conn.buf = conn.buf && conn.buf.length ? Buffer.concat([conn.buf, d]) : d; try { parseFrames(conn); } catch (e) { conn.kill(); } });
  socket.on('close', () => conn.kill());
  socket.on('error', () => conn.kill());
});
function parseFrames(conn) {
  for (;;) {
    const b = conn.buf;
    if (!b || b.length < 2) return;
    const fin = b[0] & 0x80, op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; if (b.readUInt32BE(2)) return conn.kill(); len = b.readUInt32BE(6); off = 10; }
    if (len > 65536 || !masked) return conn.kill();
    if (b.length < off + 4 + len) return;
    const payload = Buffer.allocUnsafe(len);
    for (let i = 0; i < len; i++) payload[i] = b[off + 4 + i] ^ b[off + (i & 3)];
    conn.buf = b.subarray(off + 4 + len);
    if (op === 8) return conn.kill();
    if (op === 9) { conn.sendRaw(frame(10, payload)); continue; }
    if (op === 10) continue;
    if (op === 1 || op === 2) { conn.frag = [payload]; conn.fragLen = len; }
    else if (op === 0 && conn.frag) { conn.frag.push(payload); conn.fragLen += len; if (conn.fragLen > 65536) return conn.kill(); }
    else continue;
    if (fin) {
      const txt = (conn.frag.length === 1 ? conn.frag[0] : Buffer.concat(conn.frag)).toString('utf8');
      conn.frag = null;
      let msg; try { msg = JSON.parse(txt); } catch (e) { continue; }
      host.message(conn, msg);
      if (!conn.open) return;
    }
  }
}

// ----------------------------------------------------------------- Start
function banner(lines) {
  const w = Math.max(...lines.map(l => l.length)) + 4;
  console.log('\n+' + '-'.repeat(w) + '+');
  for (const l of lines) console.log('|  ' + l + ' '.repeat(w - l.length - 2) + '|');
  console.log('+' + '-'.repeat(w) + '+\n');
}
function startTunnel() {
  const local = path.join(__dirname, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  const bin = fs.existsSync(local) ? local : 'cloudflared';
  let found = false, failed = false;
  let cf;
  try { cf = spawn(bin, ['tunnel', '--url', 'http://localhost:' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { return tunnelHelp(); }
  const onData = d => {
    const m = String(d).match(/https:\/\/(?!api\.)[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !found) { found = true; banner(['INTERNET-LINK fuer deine Freunde:', '', m[0], '', '(gilt, solange dieses Fenster offen ist)']); }
  };
  cf.stdout.on('data', onData); cf.stderr.on('data', onData);
  cf.on('error', () => { if (!failed) { failed = true; tunnelHelp(); } });
  cf.on('exit', code => { if (!failed && !found) console.log('cloudflared wurde beendet (Code ' + code + ') - kein Internet-Link verfuegbar.'); });
  const stop = () => { try { cf.kill(); } catch (e) { /* egal */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
  console.log('Starte Tunnel ueber cloudflared ...');
}
function tunnelHelp() {
  console.log('Hinweis: "cloudflared" wurde nicht gefunden - das Spiel laeuft nur im lokalen Netzwerk.');
  console.log('Fuer einen Internet-Link cloudflared installieren (siehe README.md) und neu starten.\n');
}
server.listen(PORT, '0.0.0.0', () => {
  const lines = ['BLOCKFEUER laeuft!  Karte: ' + S.MAPS[host.mapId].n + ', Modus: ' + S.MODES[host.mode].n, '', 'Du selbst:        http://localhost:' + PORT];
  const nets = os.networkInterfaces();
  for (const k of Object.keys(nets)) for (const n of nets[k] || []) {
    if (n.family === 'IPv4' && !n.internal) lines.push('Gleiches WLAN:    http://' + n.address + ':' + PORT);
  }
  banner(lines);
  host.start();
  if (process.argv.includes('--tunnel')) startTunnel();
});
