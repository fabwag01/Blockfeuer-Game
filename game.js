/* BLOCKFEUER – Browser-Client: Renderer (WebGL ohne Bibliotheken), Schatten, Bewegung, Waffen mit Aufsätzen,
   Zielen über Visier, Loadout, Nachladeanimationen, HUD, Netzwerk, Sound */
(() => {
'use strict';
const S = window.Shared, { WEAPONS, LADDER, NADES, PLAYER, MAP, ATT, MODES, MAPS } = S;
const $ = id => document.getElementById(id);
const canvas = $('c');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
const now = () => performance.now() / 1000;
const rnd = (a, b) => a + Math.random() * (b - a);
const store = {
  get(k, d) { try { const v = localStorage.getItem('bf_' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('bf_' + k, v); } catch (e) { /* egal */ } }
};
const parseJ = s => { try { return JSON.parse(s); } catch (e) { return null; } };
const SET = {
  sens: clamp(parseFloat(store.get('sens', '1')) || 1, 0.2, 3),
  fov: clamp(parseFloat(store.get('fov', '74')) || 74, 60, 100),
  vol: (() => { const v = parseFloat(store.get('vol', '0.6')); return v >= 0 && v <= 1 ? v : 0.6; })(),
  q: ['hoch', 'mittel', 'niedrig'].indexOf(store.get('q', 'hoch')) >= 0 ? store.get('q', 'hoch') : 'hoch',
  adsHold: store.get('ads', 'halten') !== 'umschalten'
};
let savedLo = S.sanitizeLoadout(parseJ(store.get('lo', 'null')));
const NADE_KEYS = ['he', 'flash', 'smoke'];
const VMS = 0.72; // Maßstab der eigenen Waffe im Bild

// =========================================================== Mathematik
const M = {
  ident() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]); },
  ortho(l, r, b, t, n, f) { return new Float32Array([2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]); },
  lookAt(e, c, up) {
    let f = [c[0] - e[0], c[1] - e[1], c[2] - e[2]]; let l = Math.hypot(f[0], f[1], f[2]); f = f.map(v => v / l);
    let s = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]; l = Math.hypot(s[0], s[1], s[2]); s = s.map(v => v / l);
    const u = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0,
      -(s[0] * e[0] + s[1] * e[1] + s[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1]);
  },
  trans(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
  rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
  rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  // parent * T(c) * S(s)
  box(p, cx, cy, cz, sx, sy, sz, o) {
    o = o || new Float32Array(16);
    for (let r = 0; r < 4; r++) {
      const a = p[r], b = p[4 + r], c = p[8 + r];
      o[r] = a * sx; o[4 + r] = b * sy; o[8 + r] = c * sz;
      o[12 + r] = a * cx + b * cy + c * cz + p[12 + r];
    }
    return o;
  },
  pt(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
};
function basis(yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), sy = Math.sin(yaw), cy = Math.cos(yaw);
  return { f: [-sy * cp, sp, -cy * cp], r: [cy, 0, -sy], u: [sy * sp, cp, cy * sp] };
}
function hsl(h, s, l) {
  const f = n => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}

// ================================================================ WebGL
const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance' });
if (!gl) { $('err').textContent = 'Dein Browser unterstützt kein WebGL – bitte Chrome, Edge oder Firefox verwenden.'; return; }
function shader(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(vs, fs, attrs) {
  const p = gl.createProgram();
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
  attrs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const inf = gl.getActiveUniform(p, i); u[inf.name] = gl.getUniformLocation(p, inf.name); }
  return { p, u };
}
const PREC = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
const PW = program(`
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aMA;
uniform mat4 uVP, uM, uL;
uniform vec4 uSkin; // Waffen-Modelle: x = Skin-Material (0 = aus), yzw = Skin-Farbe
varying vec3 vW, vN, vC; varying vec2 vMA; varying vec4 vL; varying vec3 vO, vNo;
void main(){
  vec4 w = uM * vec4(aPos, 1.0);
  vO = aPos * vec3(length(uM[0].xyz), length(uM[1].xyz), length(uM[2].xyz)); vNo = aNor;
  vec3 n = (uM * vec4(aNor, 0.0)).xyz;
  vW = w.xyz; vN = n; vC = aCol; vMA = aMA;
  if (aMA.y < -150.0) { // lackierbarer Teil eines Waffenmodells
    vMA.y = -100.0;
    if (uSkin.x > 0.5) { float l = dot(aCol, vec3(0.3, 0.59, 0.11)); vC = uSkin.yzw * clamp(0.42 + l * 1.7, 0.5, 1.35); vMA.x = uSkin.x; }
  }
  vL = uL * vec4(w.xyz + normalize(n) * 0.06, 1.0);
  gl_Position = uVP * w;
}`, PREC + `
varying vec3 vW, vN, vC; varying vec2 vMA; varying vec4 vL; varying vec3 vO, vNo;
uniform vec3 uCol2;
uniform vec3 uCam, uSun, uSunCol, uAmbT, uAmbB, uFog, uSkyZ, uSkyH;
uniform float uFogD, uEmis, uAlpha, uShadowOn, uShade, uSMS;
uniform vec4 uFlash;
uniform sampler2D uSM;
` + NOISE + `
float unpackD(vec4 c){ return dot(c, vec4(1.0, 1.0 / 255.0, 1.0 / 65025.0, 1.0 / 16581375.0)); }
float sm(vec2 uv, float z){ return step(z, unpackD(texture2D(uSM, uv))); }
float shadowF(){
  if (uShadowOn < 0.5) return uShade;
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float z = p.z - 0.0005, o = uSMS;
  return (sm(p.xy + vec2(-o, -o), z) + sm(p.xy + vec2(o, -o), z) + sm(p.xy + vec2(-o, o), z) + sm(p.xy + vec2(o, o), z)) * 0.25;
}
vec3 surf(vec3 c, float m, vec3 P, vec3 N, out float spec, out float emis){
  spec = 0.0; emis = 0.0;
  vec3 an = abs(N);
  vec2 uv = an.y > 0.5 ? P.xz : (an.x > 0.5 ? vec2(P.z, P.y) : vec2(P.x, P.y));
  if (m < 0.5) return c;
  float n1 = vn(uv * 1.3), n2 = vn(uv * 7.0);
  if (m < 1.5) return c * (0.9 + 0.14 * n1 + 0.06 * n2);
  if (m < 2.5) { float dirt = an.y < 0.5 ? (1.0 - smoothstep(0.0, 1.4, P.y)) * 0.12 : 0.0; return c * (0.88 + 0.14 * n1 + 0.05 * n2 - dirt); }
  if (m < 3.5) { vec2 b = uv / vec2(0.5, 0.2); float row = floor(b.y); b.x += mod(row, 2.0) * 0.5; vec2 f = fract(b);
    float br = step(0.08, f.y) * step(0.04, f.x); float hv = h21(vec2(floor(b.x), row));
    return mix(vec3(0.62, 0.6, 0.56) * (0.9 + 0.1 * n2), c * (0.78 + 0.34 * hv) * (0.92 + 0.1 * n2), br); }
  if (m < 4.5) { vec2 f = fract(uv / vec2(3.0, 1.5)); float e = min(min(f.x, 1.0 - f.x) * 3.0, min(f.y, 1.0 - f.y) * 1.5);
    return c * (0.84 + 0.22 * vn(uv * 0.5 + 3.0)) * (0.86 + 0.14 * smoothstep(0.0, 0.03, e)) * (0.95 + 0.06 * n2); }
  if (m < 5.5) return c * (0.82 + 0.22 * n1) * (0.9 + 0.18 * h21(floor(uv * 30.0))) * (0.92 + 0.12 * vn(uv * 0.15));
  if (m < 6.5) { vec2 f = fract(uv / 0.6); float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    return c * (0.9 + 0.12 * h21(floor(uv / 0.6))) * (0.8 + 0.2 * smoothstep(0.0, 0.04, e)) * (0.94 + 0.08 * n2); }
  if (m < 7.5) { float pl = floor(uv.y / 0.22); float fy = fract(uv.y / 0.22);
    float g = vn(vec2(uv.x * 0.9 + pl * 7.0, uv.y * 25.0));
    return c * (0.8 + 0.25 * g) * (0.84 + 0.16 * smoothstep(0.0, 0.06, min(fy, 1.0 - fy))) * (0.9 + 0.16 * h21(vec2(pl, 3.0))); }
  if (m < 8.5) { spec = 0.3; float cor = an.y > 0.5 ? 1.0 : 0.86 + 0.14 * sin((an.x > 0.5 ? P.z : P.x) * 30.0); return c * cor * (0.9 + 0.15 * n1); }
  if (m < 9.5) { spec = 1.0; return c; }
  if (m < 10.5) { vec2 b = uv / vec2(1.0, 0.5); b.x += mod(floor(b.y), 2.0) * 0.5; vec2 f = fract(b); float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y) * 0.5);
    return c * (0.84 + 0.22 * h21(floor(b))) * (0.76 + 0.24 * smoothstep(0.0, 0.025, e)) * (0.93 + 0.09 * n2); }
  if (m < 11.5) { float r = fract(uv.y / 0.3); return c * (0.74 + 0.26 * smoothstep(0.0, 0.35, r)) * (0.9 + 0.15 * h21(vec2(floor(uv.x / 0.25), floor(uv.y / 0.3)))); }
  if (m < 12.5) return c * (0.72 + 0.4 * vn(uv * 2.5)) * (0.88 + 0.16 * n2);
  if (m < 13.5) { emis = 1.0; return c; }
  if (m < 14.5) { spec = 0.6; return c; }
  if (m < 15.5) { vec2 w = uv / vec2(2.2, 3.0); vec2 f = fract(w);
    float win = an.y > 0.5 ? 0.0 : step(0.28, f.x) * step(f.x, 0.72) * step(0.3, f.y) * step(f.y, 0.78);
    float lit = step(0.8, h21(floor(w)));
    emis = win * lit * 0.6;
    return mix(c * (0.9 + 0.1 * n1), mix(vec3(0.14, 0.17, 0.22), vec3(1.0, 0.8, 0.5), lit), win); }
  return c * (0.86 + 0.14 * n2);
}
// Waffen-Skins: Muster in Objektkoordinaten, damit sie mit der Waffe mitwandern
vec3 skinSurf(vec3 c, float m, out float spec, out float emis){
  spec = 0.0; emis = 0.0;
  vec3 an = abs(vNo);
  vec2 uv = an.y > 0.5 ? vO.xz : (an.x > 0.5 ? vO.zy : vO.xy);
  vec3 c2 = uCol2;
  if (m < 17.5) { float n = vn(uv * 16.0) + 0.5 * vn(uv * 38.0 + 7.0); vec3 c3 = mix(c, c2, 0.5); return n > 0.95 ? c2 : (n > 0.72 ? c3 : c); }
  if (m < 18.5) { float st = sin((uv.x + uv.y * 0.55) * 70.0 + vn(uv * 9.0) * 5.0); spec = 0.15; return st > 0.35 ? c2 : c; }
  if (m < 19.5) { spec = 0.95; return mix(c, c2, 0.3 * vn(vec2(uv.x * 4.0, uv.y * 120.0))); }
  if (m < 20.5) { float k = 0.5 + 0.5 * sin(vO.z * 9.0 + vO.y * 14.0 + vn(uv * 6.0) * 2.0); spec = 0.35; emis = (c.r > 0.9 && c2.r > 0.7) ? 0.12 : 0.0; return mix(c2, c, k); }
  if (m < 21.5) { vec2 g = floor(uv * 90.0), f = fract(uv * 90.0); float w = mod(g.x + g.y, 2.0) > 0.5 ? f.x : f.y; spec = 0.5; return mix(c2, c, 0.35 + 0.65 * smoothstep(0.1, 0.9, w)); }
  float star = step(0.985, h21(floor(uv * 160.0))), neb = vn(uv * 7.0) * vn(uv * 15.0 + 3.0);
  emis = star; spec = 0.4;
  return mix(c, c2, smoothstep(0.15, 0.6, neb)) + vec3(star);
}
vec3 aces(vec3 x){ return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main(){
  vec3 N = normalize(vN);
  float spec, emis;
  vec3 base = vMA.x > 16.5 ? skinSurf(vC, vMA.x, spec, emis) : surf(vC, vMA.x, vW, N, spec, emis);
  vec3 alb = pow(base, vec3(2.2));
  float ndl = max(dot(N, uSun), 0.0);
  float sh = shadowF();
  float ao = vMA.y < -50.0 ? 1.0 : (vMA.y < -0.5 ? 0.72 : mix(0.55, 1.0, smoothstep(0.0, 1.3, vW.y - vMA.y)));
  vec3 V = normalize(uCam - vW);
  vec3 amb = mix(uAmbB, uAmbT, N.y * 0.5 + 0.5);
  vec3 col = alb * (amb * ao + uSunCol * ndl * sh);
  if (spec > 0.0) {
    vec3 H = normalize(V + uSun);
    vec3 R = reflect(-V, N);
    vec3 env = pow(mix(uSkyH, uSkyZ, clamp(R.y, 0.0, 1.0)), vec3(2.2)) * (R.y < 0.0 ? 0.35 : 1.0);
    float fv = 1.0 - max(dot(N, V), 0.0);
    if (spec > 0.9 && spec < 0.99) { // Metall: Spiegelung in der eigenen Farbe
      col = col * 0.45 + alb * env * 1.3 + alb * uSunCol * pow(max(dot(N, H), 0.0), 60.0) * sh * 1.4;
    } else {
      col += uSunCol * pow(max(dot(N, H), 0.0), spec > 0.9 ? 140.0 : 40.0) * sh * spec * 0.5;
      float fr = spec > 0.9 ? 0.25 + 0.6 * fv * fv * fv : spec * 0.4 * fv * fv * fv * fv;
      col = mix(col, env, fr);
    }
  }
  if (uFlash.w > 0.0) { vec3 L = uFlash.xyz - vW; float d2 = dot(L, L); col += alb * vec3(1.0, 0.72, 0.38) * uFlash.w * max(dot(N, L * inversesqrt(d2 + 0.0001)), 0.0) / (1.0 + d2 * 0.35); }
  col = mix(col, alb * 2.4, max(emis, uEmis));
  col = pow(aces(col), vec3(1.0 / 2.2));
  float d = length(vW - uCam);
  col = mix(col, uFog, (1.0 - exp(-d * d * uFogD * uFogD)) * (1.0 - uEmis * 0.5));
  gl_FragColor = vec4(col, uAlpha);
}`, ['aPos', 'aNor', 'aCol', 'aMA']);
const PSH = program(
  'attribute vec3 aPos; uniform mat4 uL, uM; void main(){ gl_Position = uL * uM * vec4(aPos, 1.0); }',
  PREC + 'vec4 pk(float d){ vec4 e = fract(vec4(1.0, 255.0, 65025.0, 16581375.0) * d); return e - e.yzww * vec4(1.0 / 255.0, 1.0 / 255.0, 1.0 / 255.0, 0.0); }' +
  'void main(){ gl_FragColor = pk(gl_FragCoord.z); }', ['aPos']);
const PS = program(
  'attribute vec2 aQ; varying vec2 v; void main(){ v = aQ; gl_Position = vec4(aQ, 0.9999, 1.0); }',
  PREC + 'varying vec2 v; uniform vec3 uF, uR, uU, uSun, uZ, uH, uSC; uniform float uT, uCl;' + NOISE + `
void main(){ vec3 d = normalize(uF + v.x * uR + v.y * uU); float h = d.y;
  vec3 col = mix(uH, uZ, pow(clamp(h, 0.0, 1.0), 0.55));
  if (h < 0.0) col = uH * mix(1.0, 0.82, clamp(-h * 3.0, 0.0, 1.0));
  float s = max(dot(d, uSun), 0.0);
  if (h > 0.0) { vec2 p = d.xz / (h + 0.1) * 1.4 + vec2(uT * 0.012, uT * 0.004);
    float cl = smoothstep(1.0 - uCl * 0.9, 1.15 - uCl * 0.6, vn(p) * 0.55 + vn(p * 2.3) * 0.3 + vn(p * 5.1) * 0.15);
    vec3 cc = mix(vec3(1.0), uSC, 0.35) * (0.85 + 0.25 * s);
    col = mix(col, cc, cl * smoothstep(0.0, 0.2, h) * 0.85); }
  col += uSC * (pow(s, 600.0) * 2.0 + pow(s, 9.0) * 0.14);
  gl_FragColor = vec4(col, 1.0); }`, ['aQ']);
const PB = program(
  'attribute vec2 aQ; uniform mat4 uVP; uniform vec3 uC, uR, uU; uniform float uS; varying vec2 v;' +
  'void main(){ v = aQ; gl_Position = uVP * vec4(uC + (uR * aQ.x + uU * aQ.y) * uS, 1.0); }',
  PREC + 'varying vec2 v; uniform vec4 uCol; uniform float uSoft;' +
  'void main(){ float r = length(v); float a = 1.0 - smoothstep(uSoft, 1.0, r); gl_FragColor = vec4(uCol.rgb, uCol.a * a); }',
  ['aQ']);

// ---------------------------------------------------- Weltgeometrie
const FACES = (x0, y0, z0, x1, y1, z1) => [
  [1, 0, 0, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [-1, 0, 0, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]],
  [0, 1, 0, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, -1, 0, [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]],
  [0, 0, 1, [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [0, 0, -1, [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]]
];
const worldBuf = gl.createBuffer();
let solidVerts = 0, allVerts = 0;
// ------------------------------------------- 3D-Modelle (Kenney City Kit, Quaternius Gun Pack)
// assets/models.bin: 20 Byte je Vertex (f32 x,y,z | i8 Normale | u8 Flag | u8 r,g,b | 0), danach 2 Farbvarianten der Stadt
const MD = { ok: false, json: null, dv: null, gbuf: null, guns: {}, acc: {} };
function loadModels() {
  const base = window.BF_ASSETS || 'assets/', bar = $('loadbar');
  if (window.BF_ASSETS_JS) { // Variante als Skript (für Umgebungen, die keine .bin-Dateien ausliefern)
    bar.style.width = '40%';
    return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = window.BF_ASSETS_JS; sc.onload = res; sc.onerror = () => rej(new Error('Skript')); document.head.appendChild(sc); })
      .then(() => { const M = window.BF_MODELS, raw = atob(M.bin), u = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); initModels(M.json, u.buffer); })
      .catch(e => console.warn('3D-Modelle nicht geladen, nutze Ersatzgrafik:', e && e.message))
      .then(() => { bar.style.width = '100%'; bar.style.opacity = '0'; });
  }
  const bin = fetch(base + 'models.bin').then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const total = +r.headers.get('content-length') || 0;
    if (!r.body || !r.body.getReader || !total) return r.arrayBuffer();
    // Fortschrittsbalken; Teile sammeln (Content-Length kann bei komprimierter Auslieferung kleiner sein)
    const rd = r.body.getReader(), parts = []; let got = 0;
    const pump = () => rd.read().then(({ done, value }) => {
      if (done) { const out = new Uint8Array(got); let o = 0; for (const c of parts) { out.set(c, o); o += c.length; } return out.buffer; }
      parts.push(value); got += value.length; bar.style.width = Math.min(100, got / total * 100).toFixed(1) + '%';
      return pump();
    });
    return pump();
  });
  return Promise.all([fetch(base + 'models.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }), bin])
    .then(([j, b]) => { initModels(j, b); })
    .catch(e => console.warn('3D-Modelle nicht geladen, nutze Ersatzgrafik:', e && e.message))
    .then(() => { bar.style.width = '100%'; bar.style.opacity = '0'; });
}
function initModels(j, b) {
  const dv = new DataView(b), n = j.cityStart, data = new Float32Array(n * 11);
  for (let i = 0, o = 0; i < n; i++) {
    const q = i * 20, flag = dv.getUint8(q + 15);
    data[o++] = dv.getFloat32(q, true); data[o++] = dv.getFloat32(q + 4, true); data[o++] = dv.getFloat32(q + 8, true);
    data[o++] = dv.getInt8(q + 12) / 127; data[o++] = dv.getInt8(q + 13) / 127; data[o++] = dv.getInt8(q + 14) / 127;
    data[o++] = dv.getUint8(q + 16) / 255; data[o++] = dv.getUint8(q + 17) / 255; data[o++] = dv.getUint8(q + 18) / 255;
    data[o++] = 14; data[o++] = flag ? -200 : -100;
  }
  MD.gbuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, MD.gbuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  MD.json = j; MD.dv = dv; MD.acc = j.acc;
  for (const k in j.guns) {
    const G = GUN[k], g = j.guns[k], m = g.meta; if (!G) continue;
    MD.guns[k] = g.parts;
    G.bbox = m.bbox; G.grip = m.grip;
    if (k === 'knife') continue;
    Object.assign(G, { sightY: m.sightY, irz: m.irz, rail: m.rail, muz: m.muz, under: m.under, hand: m.hand, magB: m.magB, scopeY: m.scopeY, magC: m.magC, cylC: m.cylC, magSize: m.magSize });
  }
  MD.ok = true;
}
// Ausschnitt [Start, Anzahl] aus dem Modellpuffer zeichnen (Würfelpuffer danach wiederherstellen)
function drawMesh(m, r, emis, F) {
  if (!r) return;
  gl.uniformMatrix4fv(curProg.u.uM, false, m);
  gl.bindBuffer(gl.ARRAY_BUFFER, MD.gbuf);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
  if (curProg === PW) {
    emis = emis || 0;
    if (emis !== curEmis) { gl.uniform1f(PW.u.uEmis, emis); curEmis = emis; }
    if (curAlpha !== 1) { gl.uniform1f(PW.u.uAlpha, 1); curAlpha = 1; }
    gl.enableVertexAttribArray(1);
    gl.uniform4f(PW.u.uSkin, F ? F.m : 0, F ? F.c[0] : 0, F ? F.c[1] : 0, F ? F.c[2] : 0);
    gl.enableVertexAttribArray(2); gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
  }
  gl.drawArrays(gl.TRIANGLES, r[0], r[1]);
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  if (curProg === PW) { gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3); }
}
// Stadtmodell in die Weltgeometrie schreiben (gedreht, skaliert, Farbvariante)
function writeProp(data, o, p, far) {
  const e = MD.json.city[p.m]; if (!e) return o;
  const dv = MD.dv, cs = MD.json.cityStart, vo = p.v ? MD.json.varOffset[p.v - 1] : 0;
  const cx = (e.min[0] + e.max[0]) / 2, cz = (e.min[2] + e.max[2]) / 2, y0 = e.min[1];
  const c = Math.cos(p.ry), s = Math.sin(p.ry), sx = p.s[0], sy = p.s[1], sz = p.s[2];
  for (let i = e.r[0], end = e.r[0] + e.r[1]; i < end; i++) {
    const q = i * 20;
    const X = (dv.getFloat32(q, true) - cx) * sx, Y = (dv.getFloat32(q + 4, true) - y0) * sy, Z = (dv.getFloat32(q + 8, true) - cz) * sz;
    let nx = dv.getInt8(q + 12) / sx, ny = dv.getInt8(q + 13) / sy, nz = dv.getInt8(q + 14) / sz;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let r, g, b;
    if (vo) { const k = vo + (i - cs) * 4; r = dv.getUint8(k); g = dv.getUint8(k + 1); b = dv.getUint8(k + 2); }
    else { r = dv.getUint8(q + 16); g = dv.getUint8(q + 17); b = dv.getUint8(q + 18); }
    data[o++] = p.x + X * c + Z * s; data[o++] = p.y + Y; data[o++] = p.z - X * s + Z * c;
    data[o++] = nx * c + nz * s; data[o++] = ny; data[o++] = -nx * s + nz * c;
    data[o++] = r / 255; data[o++] = g / 255; data[o++] = b / 255;
    data[o++] = b > 150 && b > r + 30 && g > r ? 9 : 0; // Fensterglas spiegelt
    data[o++] = far || ny > 0.7 ? -100 : (ny < -0.7 ? -1 : p.y);
  }
  return o;
}
function buildWorld() {
  const on = MD.ok, vis = b => !(on && b.h);
  const boxes = MAP.boxes.filter(vis), deco = MAP.deco.filter(vis), props = on ? MAP.props || [] : [];
  let nv = (boxes.length + deco.length) * 36;
  for (const p of props) { const e = MD.json.city[p.m]; if (e) nv += e.r[1]; }
  const data = new Float32Array(nv * 11);
  let o = 0;
  const box = (b, isDeco) => {
    for (const f of FACES(b.x0, b.y0, b.z0, b.x1, b.y1, b.z1)) {
      if (f[1] === -1 && b.y0 <= 0.01) continue;
      const ao = f[1] === 1 ? -100 : f[1] === -1 ? -1 : (isDeco ? -100 : b.y0);
      for (const v of [f[3], f[4], f[5], f[3], f[5], f[6]]) {
        data[o++] = v[0]; data[o++] = v[1]; data[o++] = v[2]; data[o++] = f[0]; data[o++] = f[1]; data[o++] = f[2];
        data[o++] = b.c[0]; data[o++] = b.c[1]; data[o++] = b.c[2]; data[o++] = b.m; data[o++] = ao;
      }
    }
  };
  // Reihenfolge: Schatten werfende Teile zuerst (Kästen, Gebäude), dann Deko und Ferne
  for (const b of boxes) box(b, false);
  for (const p of props) if (!p.far) o = writeProp(data, o, p, false);
  solidVerts = o / 11;
  for (const b of deco) box(b, true);
  for (const p of props) if (p.far) o = writeProp(data, o, p, true);
  allVerts = o / 11;
  gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf);
  gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, o), gl.STATIC_DRAW);
}
const cubeData = [];
for (const f of FACES(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5)) for (const v of [f[3], f[4], f[5], f[3], f[5], f[6]]) cubeData.push(v[0], v[1], v[2], f[0], f[1], f[2]);
const cubeBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeData), gl.STATIC_DRAW);
const quadBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
const IDENT = M.ident(), TMP = new Float32Array(16);

// ------------------------------------------------------- Schattenkarte
const SH = { size: 0, tex: null, fb: null, rb: null, L: M.ident(), on: false };
function setupShadow() {
  if (SH.tex) { gl.deleteTexture(SH.tex); gl.deleteFramebuffer(SH.fb); gl.deleteRenderbuffer(SH.rb); SH.tex = null; }
  SH.size = SET.q === 'hoch' ? 2048 : SET.q === 'mittel' ? 1024 : 0;
  SH.on = false;
  if (!SH.size) return;
  SH.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, SH.tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SH.size, SH.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  SH.rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, SH.rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, SH.size, SH.size);
  SH.fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, SH.fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, SH.tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, SH.rb);
  SH.on = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function setupLight() {
  const s = MAP.env.sun, c = [0, 6, 0], e = [s[0] * 150, 6 + s[1] * 150, s[2] * 150];
  const view = M.lookAt(e, c, Math.abs(s[1]) > 0.95 ? [0, 0, 1] : [0, 1, 0]);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const pad = MD.ok && MAP.props && MAP.props.length ? 9 : 3, top = MD.ok && MAP.props && MAP.props.length ? 30 : 24;
  for (const x of [-MAP.HX - pad, MAP.HX + pad]) for (const y of [-1, top]) for (const z of [-MAP.HZ - pad, MAP.HZ + pad]) {
    const p = M.pt(view, x, y, z);
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); }
  }
  SH.L = M.mul(M.ortho(mn[0], mx[0], mn[1], mx[1], -mx[2] - 1, -mn[2] + 1), view);
}

// -------------------------------------------------------- Zeichnen
let curProg = PW, curEmis = -1, curAlpha = -1;
function drawBox(m, col, emis, alpha, mat) {
  gl.uniformMatrix4fv(curProg.u.uM, false, m);
  if (curProg === PW) {
    emis = emis || 0; alpha = alpha === undefined ? 1 : alpha;
    if (emis !== curEmis) { gl.uniform1f(PW.u.uEmis, emis); curEmis = emis; }
    if (alpha !== curAlpha) { gl.uniform1f(PW.u.uAlpha, alpha); curAlpha = alpha; }
    gl.vertexAttrib3f(2, col[0], col[1], col[2]);
    gl.vertexAttrib2f(3, mat || 0, -100);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 36);
}
function part(parent, p, emis, dx, dy, dz) { drawBox(M.box(parent, p[0] + (dx || 0), p[1] + (dy || 0), p[2] + (dz || 0), p[3], p[4], p[5], TMP), p[6], emis, 1, p[8] || 0); }

// ====================================================== Waffenmodelle
const K = {
  dark: [0.13, 0.13, 0.15], dark2: [0.21, 0.21, 0.24], steel: [0.56, 0.58, 0.61], steel2: [0.42, 0.44, 0.48], wood: [0.46, 0.29, 0.15], olive: [0.31, 0.35, 0.22],
  gold: [0.96, 0.76, 0.2], skin: [0.86, 0.66, 0.5], green: [0.2, 0.33, 0.19], gray: [0.62, 0.64, 0.62], tan: [0.6, 0.52, 0.38], black: [0.06, 0.06, 0.07],
  glass: [0.35, 0.6, 0.8], glove: [0.2, 0.19, 0.17], brass: [0.85, 0.65, 0.25], shell: [0.7, 0.12, 0.1], red: [1, 0.12, 0.08], pants: [0.24, 0.26, 0.28], vest: [0.28, 0.3, 0.24]
};
// Teile: [cx, cy, cz, sx, sy, sz, Farbe, Tag]  – Lauf zeigt nach -z, Ursprung am Griff
// sightY: Visierlinie Kimme/Korn, irz: z der Kimme, rail: [y, z] Schiene für Optiken, muz: [y, z] Mündung,
// under: [y, z] Unterlauf-Halterung, hand: linke Hand, grip: rechte Hand, magB: Unterkante Magazin
const GUN = {
  pistol: { parts: [[0, 0.035, -0.07, 0.034, 0.04, 0.2, K.dark2, 'slide'], [0, 0.005, -0.06, 0.03, 0.026, 0.17, K.dark], [0, -0.05, 0.012, 0.032, 0.11, 0.05, K.dark],
    [0, -0.06, 0.012, 0.024, 0.1, 0.04, K.black, 'mag'], [0, 0.061, -0.16, 0.006, 0.012, 0.008, K.black, 'slide'], [0, 0.061, 0.02, 0.02, 0.012, 0.008, K.black, 'irear']],
    sightY: 0.066, irz: 0.02, rail: [0.055, -0.04], muz: [0.035, -0.17], under: [-0.008, -0.11], hand: [-0.012, -0.075, 0.03], grip: [-0.05, 0.015], magB: [-0.11, 0.012] },
  revolver: { parts: [[0, 0.04, -0.15, 0.026, 0.032, 0.2, K.steel], [0, 0.03, -0.02, 0.04, 0.065, 0.08, K.steel], [0, 0.028, -0.02, 0.054, 0.054, 0.06, K.steel2, 'cyl'],
    [0, -0.05, 0.045, 0.032, 0.1, 0.045, K.wood], [0, 0.064, -0.24, 0.006, 0.016, 0.01, K.black], [0, 0.066, 0.0, 0.018, 0.012, 0.01, K.black, 'irear']],
    sightY: 0.072, irz: 0.0, rail: [0.056, -0.12], muz: [0.04, -0.25], under: [0.024, -0.16], hand: [-0.012, -0.07, 0.06], grip: [-0.05, 0.05], magB: [0.028, -0.02] },
  smg: { parts: [[0, 0.02, -0.08, 0.05, 0.08, 0.32, K.dark2], [0, 0.03, -0.3, 0.022, 0.022, 0.12, K.black], [0, -0.1, -0.07, 0.03, 0.16, 0.045, K.dark, 'mag'],
    [0, 0.02, 0.15, 0.03, 0.04, 0.18, K.dark], [0, -0.06, 0.04, 0.03, 0.08, 0.04, K.dark], [0.03, 0.04, -0.12, 0.015, 0.015, 0.03, K.black, 'bolt'],
    [0, 0.075, -0.2, 0.006, 0.03, 0.01, K.black], [0, 0.075, 0.04, 0.024, 0.03, 0.01, K.black, 'irear']],
    sightY: 0.09, irz: 0.04, rail: [0.06, -0.06], muz: [0.03, -0.36], under: [-0.02, -0.2], hand: [0, -0.05, -0.2], grip: [-0.06, 0.04], magB: [-0.18, -0.07] },
  shotgun: { parts: [[0, 0.045, -0.34, 0.036, 0.036, 0.62, K.dark2], [0, 0.005, -0.32, 0.028, 0.028, 0.5, K.dark], [0, 0.0, -0.3, 0.054, 0.05, 0.2, K.wood, 'pump'],
    [0, 0.02, 0.0, 0.05, 0.09, 0.24, K.dark], [0, -0.012, 0.25, 0.04, 0.075, 0.24, K.wood], [0, -0.06, 0.07, 0.03, 0.08, 0.04, K.dark],
    [0, 0.069, -0.64, 0.008, 0.012, 0.008, K.steel], [0, 0.07, -0.06, 0.02, 0.014, 0.01, K.black, 'irear']],
    sightY: 0.076, irz: -0.06, rail: [0.065, -0.02], muz: [0.045, -0.65], under: [-0.025, -0.3], hand: [0, -0.04, -0.3], grip: [-0.06, 0.07], magB: [-0.03, 0.0] },
  m4: { parts: [[0, 0.02, -0.05, 0.05, 0.09, 0.36, K.dark2], [0, 0.03, -0.33, 0.056, 0.06, 0.26, K.dark], [0, 0.035, -0.52, 0.022, 0.022, 0.2, K.black],
    [0, -0.1, -0.07, 0.032, 0.16, 0.065, K.dark, 'mag'], [0, 0.01, 0.24, 0.04, 0.08, 0.2, K.dark], [0, -0.06, 0.06, 0.03, 0.09, 0.04, K.dark],
    [0, 0.072, -0.15, 0.022, 0.012, 0.4, K.black], [0, 0.085, -0.43, 0.008, 0.05, 0.01, K.black], [0, 0.092, 0.06, 0.026, 0.026, 0.03, K.black, 'irear'],
    [0, 0.068, 0.1, 0.03, 0.01, 0.03, K.black, 'bolt']],
    sightY: 0.105, irz: 0.06, rail: [0.078, -0.1], muz: [0.035, -0.62], under: [0, -0.34], hand: [0, -0.03, -0.34], grip: [-0.06, 0.06], magB: [-0.18, -0.07] },
  ak: { parts: [[0, 0.02, -0.05, 0.05, 0.085, 0.38, K.dark2], [0, 0.022, -0.32, 0.054, 0.058, 0.22, K.wood], [0, 0.065, -0.3, 0.03, 0.02, 0.24, K.dark],
    [0, 0.035, -0.54, 0.022, 0.022, 0.22, K.black], [0, -0.085, -0.08, 0.03, 0.12, 0.06, K.dark, 'mag'], [0, -0.17, -0.11, 0.03, 0.08, 0.06, K.dark, 'mag'],
    [0, 0, 0.26, 0.04, 0.075, 0.24, K.wood], [0, -0.06, 0.07, 0.03, 0.08, 0.04, K.wood], [0, 0.075, -0.62, 0.008, 0.035, 0.01, K.black],
    [0, 0.08, -0.14, 0.024, 0.025, 0.02, K.black, 'irear'], [0.03, 0.04, -0.02, 0.02, 0.015, 0.02, K.steel, 'bolt']],
    sightY: 0.092, irz: -0.14, rail: [0.0625, -0.04], muz: [0.035, -0.65], under: [-0.008, -0.32], hand: [0, -0.03, -0.3], grip: [-0.06, 0.07], magB: [-0.21, -0.11] },
  lmg: { parts: [[0, 0.02, -0.08, 0.065, 0.11, 0.5, K.dark2], [0, 0.035, -0.58, 0.03, 0.03, 0.5, K.black], [0, -0.1, -0.12, 0.12, 0.13, 0.15, K.olive, 'mag'],
    [0, 0.085, -0.08, 0.06, 0.02, 0.2, K.dark, 'cover'], [0, 0.01, 0.28, 0.045, 0.09, 0.24, K.dark], [0, -0.06, 0.09, 0.03, 0.08, 0.04, K.dark],
    [0, -0.05, -0.7, 0.09, 0.012, 0.012, K.steel], [0, 0.09, -0.8, 0.01, 0.08, 0.01, K.black], [0, 0.1, 0.1, 0.026, 0.06, 0.02, K.black, 'irear']],
    sightY: 0.128, irz: 0.1, rail: [0.095, -0.02], muz: [0.035, -0.83], under: [-0.03, -0.42], hand: [0, -0.05, -0.42], grip: [-0.06, 0.09], magB: [-0.165, -0.12] },
  scout: { parts: [[0, 0.02, -0.05, 0.045, 0.07, 0.42, K.olive], [0, 0.035, -0.55, 0.02, 0.02, 0.6, K.black], [0.035, 0.03, 0.04, 0.04, 0.015, 0.015, K.steel, 'bolt'],
    [0, -0.05, -0.06, 0.03, 0.06, 0.06, K.black, 'mag'], [0, 0, 0.27, 0.04, 0.085, 0.26, K.olive], [0, -0.05, 0.06, 0.028, 0.08, 0.045, K.olive]],
    sightY: 0.07, irz: -0.05, rail: [0.055, -0.05], muz: [0.035, -0.85], under: [-0.015, -0.3], hand: [0, -0.04, -0.3], grip: [-0.05, 0.06], magB: [-0.08, -0.06] },
  longbow: { parts: [[0, 0.02, -0.05, 0.06, 0.085, 0.5, K.tan], [0, 0.035, -0.68, 0.03, 0.03, 0.78, K.black], [0, 0.035, -1.08, 0.05, 0.045, 0.1, K.black],
    [0.04, 0.03, 0.06, 0.05, 0.018, 0.018, K.steel, 'bolt'], [0, -0.07, -0.08, 0.035, 0.08, 0.08, K.black, 'mag'], [0, 0, 0.3, 0.05, 0.1, 0.28, K.tan],
    [0, -0.07, 0.07, 0.035, 0.1, 0.05, K.dark]],
    sightY: 0.08, irz: -0.06, rail: [0.0625, -0.06], muz: [0.035, -1.13], under: [-0.025, -0.4], hand: [0, -0.05, -0.4], grip: [-0.07, 0.07], magB: [-0.11, -0.08] },
  knife: { parts: [[0, 0.03, -0.17, 0.008, 0.042, 0.2, K.gold], [0, 0.005, -0.03, 0.026, 0.03, 0.1, K.dark], [0, 0.01, -0.085, 0.012, 0.07, 0.014, K.gold]],
    grip: [0.005, -0.03] },
  he: { parts: [[0, 0, -0.04, 0.075, 0.09, 0.075, K.green], [0, 0.06, -0.04, 0.035, 0.03, 0.035, K.steel]], grip: [-0.02, -0.04] },
  flash: { parts: [[0, 0, -0.04, 0.06, 0.11, 0.06, K.gray], [0, 0.07, -0.04, 0.035, 0.03, 0.035, K.steel], [0, 0.0, -0.04, 0.064, 0.02, 0.064, [0.3, 0.5, 0.9]]], grip: [-0.02, -0.04] },
  smoke: { parts: [[0, 0, -0.04, 0.065, 0.13, 0.065, K.olive], [0, 0.08, -0.04, 0.035, 0.03, 0.035, K.steel], [0, 0.02, -0.04, 0.069, 0.02, 0.069, K.gray]], grip: [-0.02, -0.04] }
};
// Magazingröße für fallengelassene Magazine
for (const k in GUN) {
  const ms = GUN[k].parts.filter(p => p[7] === 'mag');
  if (!ms.length) continue;
  let y0 = 9, y1 = -9;
  for (const p of ms) { y0 = Math.min(y0, p[1] - p[4] / 2); y1 = Math.max(y1, p[1] + p[4] / 2); }
  GUN[k].magSize = [ms[0][3], y1 - y0, ms[0][5]];
}
// Optiken: Teile relativ zur Schiene (y über Schiene, z relativ zur Schienenmitte)
const OPTIC = {
  reddot: { y: 0.036, parts: [[0, 0.008, 0, 0.028, 0.016, 0.05, K.dark], [-0.019, 0.036, -0.01, 0.006, 0.042, 0.014, K.dark2], [0.019, 0.036, -0.01, 0.006, 0.042, 0.014, K.dark2], [0, 0.059, -0.01, 0.044, 0.007, 0.014, K.dark2]], lens: [0, 0.036, -0.01, 0.032, 0.04, 0.002] },
  holo: { y: 0.047, parts: [[0, 0.012, 0.01, 0.042, 0.024, 0.09, K.dark], [-0.027, 0.047, -0.02, 0.007, 0.05, 0.03, K.dark2], [0.027, 0.047, -0.02, 0.007, 0.05, 0.03, K.dark2], [0, 0.074, -0.02, 0.06, 0.008, 0.032, K.dark2]], lens: [0, 0.047, -0.02, 0.046, 0.046, 0.002] },
  acog: { y: 0.042, parts: [[0, 0.01, 0, 0.03, 0.02, 0.06, K.dark], [0, 0.042, 0, 0.046, 0.046, 0.15, K.dark2], [0, 0.042, -0.09, 0.056, 0.056, 0.04, K.dark2], [0, 0.042, 0.085, 0.05, 0.05, 0.025, K.dark]], lens: [0, 0.042, -0.111, 0.044, 0.044, 0.002] },
  scope: { y: 0.048, parts: [[0, 0.012, -0.06, 0.02, 0.024, 0.02, K.dark], [0, 0.012, 0.06, 0.02, 0.024, 0.02, K.dark], [0, 0.048, 0, 0.034, 0.034, 0.3, K.black], [0, 0.048, -0.17, 0.05, 0.05, 0.07, K.black], [0, 0.048, 0.15, 0.044, 0.044, 0.05, K.black]], lens: [0, 0.048, -0.206, 0.042, 0.042, 0.002] }
};
function sightY(key, sight) { const G = GUN[key]; if (sight === 'scope' && G.scopeY !== undefined && MD.guns[key]) return G.scopeY; return sight === 'iron' || !OPTIC[sight] ? G.sightY : G.rail[0] + OPTIC[sight].y; }
// Längsausdehnung (für Vorschau und Glückspaket)
function gunZR(k) {
  const G = GUN[k]; if (MD.guns[k] && G.bbox) return [G.bbox[2], G.bbox[5]];
  let z0 = 0, z1 = 0; for (const p of G.parts) { z0 = Math.min(z0, p[2] - p[5] / 2); z1 = Math.max(z1, p[2] + p[5] / 2); }
  return [z0, z1];
}
const T4 = (P, x, y, z) => M.mul(P, M.trans(x, y, z));
// 3D-Modell einer Waffe zeichnen; bewegliche Teile (Magazin, Schlitten, Pumpe, Trommel) mit den Animationswerten
function drawGunMesh(P, key, att, an, emis, F, optic) {
  const pr = MD.guns[key], G = GUN[key];
  drawMesh(P, pr.main, emis, F);
  for (const tag of ['slide', 'pump', 'cyl', 'mag']) {
    if (!pr[tag]) continue;
    const o = an[tag]; if (o === 'hide') continue;
    let m = o ? T4(P, o[0], o[1], o[2]) : P;
    if (tag === 'mag' && att && att.mag === 'ext' && G.magC) { // längeres Magazin: nach unten strecken
      const top = G.magC[1] + G.magSize[1] / 2;
      m = M.mul(M.box(m, 0, top, 0, 1, 1.4, 1), M.trans(0, -top, 0));
    }
    drawMesh(m, pr[tag], emis, F);
    if (tag === 'mag' && att && att.mag === 'fast' && G.magSize) drawMesh(T4(m, G.magSize[0] + 0.006, 0, 0), pr.mag, emis, F);
  }
  if (pr.irear && !optic) drawMesh(P, pr.irear, emis, F);
  if (pr.scope && optic === 'scope') drawMesh(P, pr.scope, emis, F);
}
function sightZ(key, sight) { const G = GUN[key]; return sight === 'iron' || !OPTIC[sight] ? G.irz : G.rail[1] + 0.05; }
function muzzleZ(key, att) { const G = GUN[key]; if (!G.muz) return 0; return G.muz[1] - (att && att.muzzle === 'sup' ? (WEAPONS[key].cls === 'pistol' ? 0.12 : 0.18) : att && att.muzzle === 'comp' ? 0.06 : 0); }
function handPos(key, att) {
  const G = GUN[key]; if (!G.hand) return null;
  if (att && att.under === 'vgrip') return [0, G.under[0] - 0.06, G.under[1]];
  if (att && att.under === 'agrip') return [0, G.under[0] - 0.04, G.under[1] + 0.01];
  return G.hand.slice();
}
// zeichnet eine Waffe samt Aufsätzen. an: Tag -> [dx,dy,dz] oder 'hide'. lenses: Liste für transparente Gläser
const SKINNABLE = new Set([K.dark2, K.dark, K.wood, K.olive, K.tan, K.steel, K.steel2, K.gold]);
function drawWeapon(P, key, att, an, emis, lenses, skin) {
  const G = GUN[key]; if (!G) return;
  an = an || {};
  const F = skin ? S.FINISHES[skin] : null;
  if (F && curProg === PW) gl.uniform3fv(PW.u.uCol2, F.c2);
  const mesh = !!MD.guns[key];
  let optic = att && att.sight && att.sight !== 'iron' ? att.sight : null;
  if (mesh && !att && MD.guns[key].scope) optic = 'scope';
  if (mesh) drawGunMesh(P, key, att, an, emis, F, optic);
  else for (const p of G.parts) {
    const tag = p[7];
    if (tag === 'irear' && optic) continue;
    const o = tag ? an[tag] : null;
    if (o === 'hide') continue;
    let cy = p[1], sy = p[4];
    if (tag === 'irear') { // Kimme als offene Kerbe aus zwei Seitenteilen
      for (const sx of [-1, 1]) drawBox(M.box(P, p[0] + sx * (p[3] / 2 - 0.004), cy, p[2], 0.008, sy, p[5], TMP), p[6], emis);
      continue;
    }
    if (tag === 'mag' && att && att.mag === 'ext') { cy -= p[4] * 0.2; sy *= 1.4; }
    const sk = F && SKINNABLE.has(p[6]);
    drawBox(M.box(P, p[0] + (o ? o[0] : 0), cy + (o ? o[1] : 0), p[2] + (o ? o[2] : 0), p[3], sy, p[5], TMP), sk ? F.c : p[6], emis, 1, sk ? F.m : 0);
    if (tag === 'mag' && att && att.mag === 'fast') drawBox(M.box(P, p[0] + p[3] + 0.006 + (o ? o[0] : 0), cy + (o ? o[1] : 0), p[2] + (o ? o[2] : 0), p[3], sy, p[5], TMP), K.olive, emis);
  }
  if (!att) return;
  if (optic && !(mesh && optic === 'scope' && MD.guns[key].scope)) {
    const O = OPTIC[optic], ry = G.rail[0], rz = G.rail[1];
    for (const p of O.parts) drawBox(M.box(P, p[0], ry + p[1], rz + p[2], p[3], p[4], p[5], TMP), p[6], emis);
    if (lenses) lenses.push(M.box(P, O.lens[0], ry + O.lens[1], rz + O.lens[2], O.lens[3], O.lens[4], O.lens[5]));
    else drawBox(M.box(P, O.lens[0], ry + O.lens[1], rz + O.lens[2], O.lens[3], O.lens[4], O.lens[5], TMP), [0.2, 0.3, 0.38], emis, 1, 9);
  }
  const my = G.muz[0], mz = G.muz[1], pistol = WEAPONS[key].cls === 'pistol', A = MD.ok ? MD.acc : null;
  if (att.muzzle === 'sup' && A && A.sup) { const k = (pistol ? 0.12 : 0.18) / (A.sup_box[2] - A.sup_box[5]) * -1; drawMesh(M.box(P, 0, my, mz + 0.004, k, k, k, TMP), A.sup, emis); }
  else if (att.muzzle === 'sup') drawBox(M.box(P, 0, my, mz - (pistol ? 0.06 : 0.09), pistol ? 0.032 : 0.04, pistol ? 0.032 : 0.04, pistol ? 0.12 : 0.18, TMP), K.black, emis);
  else if (att.muzzle === 'comp') { drawBox(M.box(P, 0, my, mz - 0.03, 0.036, 0.036, 0.06, TMP), K.steel2, emis); drawBox(M.box(P, 0, my + 0.019, mz - 0.03, 0.02, 0.004, 0.04, TMP), K.black, emis); }
  const pump = key === 'shotgun' && an.pump && an.pump !== 'hide' ? an.pump[2] : 0, uy = G.under[0], uz = G.under[1] + pump;
  if (att.under === 'vgrip' && A && A.vgrip) { const k = 0.11 / (A.vgrip_box[4] - A.vgrip_box[1]); drawMesh(M.box(P, 0, uy + 0.004, uz, k, k, k, TMP), A.vgrip, emis); }
  else if (att.under === 'vgrip') drawBox(M.box(P, 0, uy - 0.06, uz, 0.03, 0.1, 0.035, TMP), K.black, emis);
  else if (att.under === 'agrip') drawBox(M.box(P, 0, uy - 0.025, uz + 0.01, 0.03, 0.04, 0.08, TMP), K.black, emis);
  else if (att.under === 'laser') {
    if (A && A.laser) {
      const L = pistol ? 0.06 : 0.08, k = L / (A.laser_box[5] - A.laser_box[2]), hy = (A.laser_box[4] - A.laser_box[1]) * k;
      drawMesh(M.box(P, 0, uy + 0.004, uz, k, k, k, TMP), A.laser, emis);
      drawBox(M.box(P, 0, uy + 0.004 - hy * 0.55, uz - L / 2 - 0.001, 0.012, 0.012, 0.004, TMP), K.red, 1);
    } else {
      drawBox(M.box(P, 0, uy - 0.02, uz, pistol ? 0.026 : 0.03, pistol ? 0.026 : 0.03, pistol ? 0.05 : 0.07, TMP), K.dark2, emis);
      drawBox(M.box(P, 0, uy - 0.02, uz - (pistol ? 0.026 : 0.036), 0.012, 0.012, 0.004, TMP), K.red, 1);
    }
  }
}
const NADE_COL = { he: K.green, flash: K.gray, smoke: K.olive };

// ================================================================ Sound
const Snd = (() => {
  let ac = null, master = null, nb = null;
  const GUNS = { pistol: [0.16, 2600, 0.6, 150], revolver: [0.3, 1800, 0.95, 90], smg: [0.11, 3200, 0.5, 170], shotgun: [0.42, 1300, 1.1, 70], m4: [0.17, 2800, 0.68, 125], ak: [0.22, 2000, 0.82, 95], lmg: [0.2, 1700, 0.78, 85], scout: [0.45, 2300, 0.95, 100], longbow: [0.85, 1200, 1.3, 55] };
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ac.createGain(); master.gain.value = SET.vol;
    const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
    nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  function setVol(v) { if (master) master.gain.value = v; }
  function out(pos, maxD) {
    let g = 1, pan = 0;
    if (pos) {
      const dx = pos[0] - cam.p[0], dy = pos[1] - cam.p[1], dz = pos[2] - cam.p[2], d = Math.hypot(dx, dy, dz);
      const k = d / (maxD || 60); if (k >= 1) return null;
      g = (1 - k) * (1 - k) / (1 + d * 0.06);
      if (d > 0.5) pan = clamp((dx * cam.r[0] + dz * cam.r[2]) / d, -1, 1) * 0.75;
    }
    const gn = ac.createGain(); gn.gain.value = g;
    if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; gn.connect(p); p.connect(master); } else gn.connect(master);
    return gn;
  }
  function noise(dest, t0, dur, f0, f1, gain, type) {
    const s = ac.createBufferSource(); s.buffer = nb; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = type || 'lowpass';
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
  }
  function tone(dest, t0, dur, f0, f1, gain, type) {
    const o = ac.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  const A = fn => (...a) => { if (!ac || ac.state !== 'running') return; try { fn(ac.currentTime, ...a); } catch (e) { /* egal */ } };
  const clk = (t, f0, f1, g, d) => noise(out(), t, d || 0.035, f0, f1, g, 'bandpass');
  return {
    init, setVol,
    shot: A((t, key, pos, sup) => {
      const o = out(pos, sup ? 30 : 120); if (!o) return; const p = GUNS[key] || GUNS.pistol;
      if (sup) { noise(o, t, 0.09, 1600, 400, p[2] * 0.45, 'lowpass'); noise(o, t, 0.03, 3500, 1800, p[2] * 0.25, 'bandpass'); return; }
      noise(o, t, p[0], p[1] * 2.2, p[1] * 0.25, p[2], 'lowpass'); tone(o, t, p[0] * 0.6, p[3] * 2, p[3] * 0.5, p[2] * 0.9, 'triangle');
      noise(o, t, 0.03, 6000, 3000, p[2] * 0.5, 'highpass');
    }),
    knife: A((t, pos) => { const o = out(pos, 20); if (o) noise(o, t, 0.16, 900, 4500, 0.35, 'bandpass'); }),
    magout: A(t => { clk(t, 2200, 1200, 0.35); clk(t + 0.05, 900, 500, 0.25, 0.05); }),
    magin: A(t => { clk(t, 1800, 900, 0.45, 0.04); clk(t + 0.06, 3200, 2000, 0.35); }),
    charge: A(t => { clk(t, 2600, 1500, 0.4); clk(t + 0.12, 3600, 2400, 0.45); }),
    shellIn: A(t => { clk(t, 1400, 700, 0.35, 0.05); clk(t + 0.05, 2600, 1600, 0.2); }),
    pump: A(t => { clk(t, 1200, 600, 0.45, 0.06); clk(t + 0.14, 1600, 800, 0.5, 0.06); }),
    bolt: A(t => { clk(t, 2400, 1400, 0.4); clk(t + 0.18, 2000, 1100, 0.4); clk(t + 0.3, 3000, 2000, 0.35); }),
    cylOpen: A(t => clk(t, 2800, 1800, 0.35)),
    cylClose: A(t => { clk(t, 3000, 1600, 0.45); }),
    dry: A(t => clk(t, 4000, 3000, 0.2, 0.02)),
    ads: A(t => noise(out(), t, 0.12, 700, 1600, 0.06, 'bandpass')),
    click: A(t => { noise(out(), t, 0.025, 4000, 2500, 0.2, 'highpass'); }),
    tink: A((t, pos) => { const o = out(pos, 12); if (o) tone(o, t, 0.04, rnd(3500, 5200), 3000, 0.04, 'sine'); }),
    hit: A((t, hs) => { const o = out(); tone(o, t, 0.07, hs ? 1900 : 1250, hs ? 1500 : 900, 0.22, 'square'); if (hs) tone(o, t + 0.05, 0.12, 2600, 2400, 0.16, 'sine'); }),
    kill: A(t => { const o = out(); tone(o, t, 0.09, 660, 660, 0.2, 'triangle'); tone(o, t + 0.09, 0.16, 990, 990, 0.2, 'triangle'); }),
    level: A(t => { const o = out();[523, 659, 784, 1047].forEach((f, i) => tone(o, t + 0.07 * i, 0.14, f, f, 0.16, 'triangle')); }),
    hurt: A(t => { const o = out(); noise(o, t, 0.12, 700, 250, 0.5, 'lowpass'); tone(o, t, 0.1, 180, 90, 0.3, 'sine'); }),
    death: A(t => { const o = out(); tone(o, t, 0.5, 220, 55, 0.35, 'sawtooth'); noise(o, t, 0.4, 600, 100, 0.4); }),
    step: A((t, pos, g) => { const o = out(pos, 26); if (o) noise(o, t, 0.06, 500, 180, g || 0.25, 'lowpass'); }),
    throw_: A((t, pos) => { const o = out(pos, 25); if (o) noise(o, t, 0.2, 600, 2500, 0.2, 'bandpass'); }),
    bounce: A((t, pos) => { const o = out(pos, 30); if (o) tone(o, t, 0.05, 900, 500, 0.15, 'square'); }),
    boom: A((t, pos) => { const o = out(pos, 160); if (!o) return; noise(o, t, 1.1, 1400, 60, 1.6); tone(o, t, 0.5, 110, 30, 1.2, 'sine'); noise(o, t, 0.08, 7000, 2000, 0.8, 'highpass'); }),
    flash: A((t, pos, blind) => { const o = out(pos, 120); if (o) { noise(o, t, 0.25, 5000, 800, 1.0); tone(o, t, 0.1, 2000, 300, 0.5, 'square'); } if (blind > 0.2) tone(out(), t, 1 + blind * 2.2, 3400, 3300, 0.12 * blind, 'sine'); }),
    hiss: A((t, pos) => { const o = out(pos, 50); if (o) noise(o, t, 2.2, 3500, 1800, 0.35, 'bandpass'); }),
    heal: A(t => { const o = out(); tone(o, t, 0.12, 520, 780, 0.2, 'sine'); tone(o, t + 0.1, 0.2, 780, 1040, 0.2, 'sine'); }),
    tick: A(t => { const o = out(); tone(o, t, 0.03, 1900, 1400, 0.09, 'square'); }),
    pack: A(t => { const o = out(); noise(o, t, 0.5, 300, 2000, 0.2, 'bandpass'); tone(o, t + 0.1, 0.3, 440, 660, 0.12, 'triangle'); }),
    reveal: A((t, r) => {
      const o = out(), base = [392, 440, 523, 587, 659][r] || 392, n = 3 + r;
      for (let i = 0; i < n; i++) tone(o, t + 0.09 * i, 0.4, base * Math.pow(1.26, i), base * Math.pow(1.26, i), 0.14 + 0.03 * r, 'triangle');
      if (r >= 3) noise(o, t, 1.2, 8000, 3000, 0.12, 'highpass');
    }),
    win: A(t => { const o = out();[392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(o, t + 0.12 * i, 0.3, f, f, 0.18, 'triangle')); })
  };
})();

// =========================================================== Spielzustand
const cam = { p: [0, 12, 30], r: [1, 0, 0], yaw: 0, pitch: -0.3 };
const players = new Map();
let myId = 0, joined = false, gameState = 'play', ws = null, rtt = 0, botSkill = 1;
let mapId = 'stadt', mode = 'gungame', dmLimit = 25;
const me = {
  p: [0, 0, 0], v: [0, 0, 0], yaw: 0, pitch: 0, onGround: true, crouch: false, alive: false, everSpawned: false, hp: 100, lvl: 0,
  slot: 0, lastSlot: 2, ammo: [0, 0], reload: null, nextFire: 0, switchT: 0, fireT: -9, cycleDone: true, swingT: -9, throwT: -9, autoBack: 0,
  nades: { he: 1, flash: 1, smoke: 1 }, adsWant: false, ads: 0, bloom: 0, recoilAcc: 0, visY: 0, eyeH: PLAYER.EYE,
  deadAt: 0, killerId: 0, loAt: 0, flashUntil: 0, flashDur: 1, shake: 0, stepPh: 0, bob: 0, protUntil: 0, spreadNow: 0, swayX: 0, swayY: 0,
  lo: savedLo, vmShade: 1
};
let items = MAP.items.map(() => true);
let nades = [], smokes = [], parts = [], tracers = [], decals = [], objs = [];
const keys = new Set();
let mouseDown = false, mouseEdge = false, locked = false, softLock = false, chatOpen = false, showSB = false, mouseX = 0.5;
const LO = { open: false, mode: 'spawn', draft: null, edit: null };
const PK = { open: false, phase: 'closed', reel: [], win: 0, item: null, t0: 0, dur: 6.2, dist: 0, lastIdx: -1, doneAt: 0 };
let inv = (parseJ(store.get('inv', '[]')) || []).filter(id => S.skinInfo(id));
function invAdd(id) { inv.push(id); store.set('inv', JSON.stringify(inv)); }
function invCount(id) { let n = 0; for (const x of inv) if (x === id) n++; return n; }

function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function curKey(slot) { slot = slot === undefined ? me.slot : slot; return slot >= 3 ? null : S.slotWeapon(mode, me.lvl, me.lo, slot); }
const stCache = new Map();
function stOf(key, lo) {
  lo = lo || me.lo;
  const a = lo.att[key], id = key + JSON.stringify(a || '');
  let s = stCache.get(id); if (!s) { s = S.stats(key, a); stCache.set(id, s); }
  return s;
}
function eyePos() { return [me.p[0], me.visY + me.eyeH, me.p[2]]; }
function overlayNow() { const k = curKey(); return !!(k && me.alive && me.ads > 0.9 && stOf(k).overlay); }

function addPlayer(i) {
  const c = hsl(i.hue, 0.62, 0.46);
  const p = { id: i.id, name: i.name, lvl: i.lvl, kills: i.kills, deaths: i.deaths, alive: i.alive, bot: i.bot, hue: i.hue, ping: i.ping || 0, lo: i.lo ? S.sanitizeLoadout(i.lo) : S.sanitizeLoadout(null),
    col: c, colD: [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55], css: 'hsl(' + i.hue + ',70%,55%)',
    snaps: [], pos: [0, -50, 0], yaw: 0, pitch: 0, fl: 0, slot: 0, phase: 0, speed: 0, prev: null, deadAt: -9, fireT: -9, protUntil: 0, rl: 0 };
  players.set(p.id, p); return p;
}
function setSlot(n, t) {
  if (!me.alive || n === me.slot) return;
  if (n >= 3) { if (me.nades[NADE_KEYS[n - 3]] <= 0) return; }
  else { if (!curKey(n)) return; if (n === 2 && curKey(0) === 'knife') return; }
  me.lastSlot = me.slot; me.slot = n; me.switchT = t; me.reload = null; me.autoBack = 0; me.ads = 0;
  if (!SET.adsHold) me.adsWant = false;
  me.nextFire = Math.max(me.nextFire, t + 0.3);
  Snd.click();
}
function setLevel(lvl, t) {
  me.lvl = lvl;
  const k = curKey(0);
  me.ammo[0] = stOf(k).mag; me.reload = null; me.bloom = 0; me.ads = 0;
  me.slot = 0; me.switchT = t; me.nextFire = t + 0.3;
  buildLadder();
}
function resetMe(p, yaw, lvl, lo, t) {
  me.lo = S.sanitizeLoadout(lo || savedLo);
  me.p = [p[0], p[1], p[2]]; me.v = [0, 0, 0]; me.yaw = yaw; me.pitch = 0; me.onGround = true; me.crouch = false;
  me.alive = true; me.everSpawned = true; me.hp = 100; me.visY = p[1]; me.eyeH = PLAYER.EYE; me.nades = { he: 1, flash: 1, smoke: 1 };
  me.recoilAcc = 0; me.flashUntil = 0; me.shake = 0; me.protUntil = t + 1.8; me.loAt = 0; me.adsWant = false; me.ads = 0;
  me.lastSlot = mode === 'dm' ? 1 : 2;
  const k1 = curKey(1);
  me.ammo[1] = k1 ? stOf(k1).mag : 0;
  setLevel(lvl, t);
  $('sub').textContent = '';
}

// ============================================================== Netzwerk
// Verbindung: eigener Server (WebSocket), Host im eigenen Browser (GitHub Pages) oder Beitritt per Code
let NETKIND = '', connecting = false;
const joinParam = (new URLSearchParams(location.search).get('join') || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
function connect(name, how, code) {
  connecting = true; menuBusy(how);
  const opts = { map: mapId, mode, bots: how === 'local' ? 4 : 2, log: s => console.log('[Host] ' + s) };
  const p = how === 'server' ? Net.server() : how === 'join' ? Net.join(code) : how === 'host' ? Net.host(opts) : Net.local(opts);
  p.then(sock => {
    ws = sock;
    ws.onopen = () => { connecting = false; send({ t: 'join', name, lo: savedLo }); refreshInvite(); };
    ws.onclose = () => {
      connecting = false; menuBusy(null);
      const who = Net.mode === 'join' ? 'zum Host' : Net.mode === 'server' ? 'zum Server' : '';
      if (joined) { joined = false; players.clear(); closeLoadout(); showMenu('Verbindung ' + who + ' verloren.' + (Net.mode === 'join' ? ' Der Host hat das Spiel vielleicht beendet.' : ' Seite neu laden, um wieder beizutreten.')); }
      else if (!$('err').textContent) $('err').textContent = 'Keine Verbindung ' + (who || 'möglich') + '.';
    };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } const h = NET[m.t]; if (h) h(m, now()); };
  }, err => { connecting = false; menuBusy(null); $('err').textContent = err && err.message || 'Verbindung fehlgeschlagen.'; });
}
function menuBusy(how) {
  const txt = { host: 'Erstelle Spiel und verbinde mit dem Online-Dienst …', join: 'Verbinde mit dem Spiel deines Freundes …', local: 'Starte Spiel …', server: 'Verbinde …' };
  $('netinfo').textContent = how ? txt[how] || '' : '';
  for (const id of ['play', 'hostbtn', 'solobtn', 'joinbtn']) $(id).disabled = !!how;
}
function setupMenu(kind) {
  NETKIND = kind;
  const srv = kind === 'server', off = !!window.BF_OFFLINE;
  $('play').style.display = srv ? '' : 'none';
  $('p2p').style.display = srv ? 'none' : '';
  $('linkbox').style.display = srv ? '' : 'none';
  if (off) { $('hostbtn').style.display = 'none'; document.querySelector('.joinrow').style.display = 'none'; $('solobtn').className = 'go'; $('solobtn').textContent = 'Spielen'; }
  if (joinParam && !srv && !off) {
    $('joincode').value = joinParam; $('joinbtn').className = 'go'; $('hostbtn').className = '';
    $('netinfo').textContent = 'Du wurdest eingeladen – Namen eingeben und „Beitreten“ drücken.';
  }
  refreshInvite();
}
function refreshInvite() {
  const l = Net.inviteLink(), srv = NETKIND === 'server';
  $('invite').textContent = srv ? location.origin + '/' : '';
  $('invite2').textContent = l || (Net.mode === 'local' ? 'Noch offline – „Online stellen“ drücken, dann kommen Freunde per Link dazu.' : '');
  $('copy2').style.display = l ? '' : 'none';
  $('online2').style.display = Net.mode === 'local' && !Net.online && !window.BF_OFFLINE ? '' : 'none';
  $('linkbox2').style.display = window.BF_OFFLINE ? 'none' : '';
}
function gunPos(pl) {
  const b = basis(pl.yaw, pl.pitch), y = pl.pos[1] + ((pl.fl & 1) ? 0.82 : 1.3);
  return [pl.pos[0] + b.f[0] * 0.75 + b.r[0] * 0.12, y + b.f[1] * 0.75, pl.pos[2] + b.f[2] * 0.75 + b.r[2] * 0.12];
}
function applyCfg(map, md, limit) {
  mapId = MAPS[map] ? map : 'stadt'; mode = MODES[md] ? md : 'gungame'; dmLimit = limit || 25;
  S.setMap(mapId); buildWorld(); setupLight();
  nades = []; smokes = []; decals = []; objs = []; tracers = []; items = MAP.items.map(() => true);
  $('mapsel').value = mapId; $('modesel').value = mode;
  buildLadder();
  if (LO.open) renderLoadout();
}
const NET = {
  welcome(m, t) {
    applyCfg(m.map, m.mode, m.limit);
    myId = m.id; joined = true; gameState = m.state; botSkill = m.skill; $('skill').value = botSkill;
    players.clear(); m.players.forEach(addPlayer);
    for (const q of m.pos) { const p = players.get(q[0]); if (p) { p.pos = [q[1], q[2], q[3]]; p.yaw = q[4]; p.snaps = [{ t, p: p.pos.slice(), yaw: q[4], pitch: 0, fl: 0, slot: 0 }]; } }
    items = m.items.map(v => !!v);
    smokes = m.smokes.map(s => mkSmoke(s.p, t - (NADES.smoke.duration - s.left)));
    $('menu').classList.remove('on'); $('hud').style.display = 'block';
    chatLine(null, 'Willkommen! Esc = Menü (Karte, Modus, Bots, Grafik).');
    menuBusy(null); refreshInvite();
    if (Net.mode === 'host' && Net.code) chatLine(null, 'Dein Spiel ist online. Code: ' + Net.code + ' – Einladungslink im Menü (Esc).');
    openLoadout('spawn');
    if (gameState === 'end') announce('Runde vorbei', 'Die nächste startet gleich', 4);
  },
  cfg(m) { applyCfg(m.map, m.mode, m.limit); },
  full() { $('err').textContent = 'Der Server ist voll.'; },
  join(m) { addPlayer(m.p); chatLine(null, m.p.name + ' ist beigetreten'); },
  leave(m) { const p = players.get(m.id); if (p) { chatLine(null, p.name + ' hat das Spiel verlassen'); players.delete(m.id); } },
  snap(m, t) {
    for (const e of m.l) {
      if (e[0] === myId) continue;
      const p = players.get(e[0]); if (!p) continue;
      p.snaps.push({ t, p: [e[1], e[2], e[3]], yaw: e[4], pitch: e[5], fl: e[6], slot: e[7] });
      if (p.snaps.length > 30) p.snaps.shift();
    }
  },
  spawn(m, t) {
    const p = players.get(m.id); if (!p) return;
    p.alive = true; p.lvl = m.lvl; p.protUntil = t + 1.8; p.prev = null; p.lo = S.sanitizeLoadout(m.lo);
    if (m.id === myId) { resetMe(m.p, m.yaw, m.lvl, m.lo, t); if (LO.open && LO.mode === 'spawn') closeLoadout(); }
    else { p.snaps = [{ t, p: m.p.slice(), yaw: m.yaw, pitch: 0, fl: 0, slot: 0 }]; p.pos = m.p.slice(); p.yaw = m.yaw; }
  },
  shot(m, t) {
    const p = players.get(m.id); if (!p || !p.alive) return;
    p.fireT = t; p.protUntil = 0;
    if (m.w === 'knife') { Snd.knife(p.pos); return; }
    const g = gunPos(p);
    for (const e of m.e) { if (!m.s) addTracer(g, e); impactFx(e, null); }
    Snd.shot(m.w, g, !!m.s);
    if (!m.s) { parts.push({ p: g.slice(), v: [0, 0, 0], life: 0.05, max: 0.05, s0: 0.35, s1: 0.5, c: [1, 0.85, 0.45], a: 0.9, add: true, soft: 0.1, g: 0 }); setFlash(g, t, 0.7); }
    const w = WEAPONS[m.w];
    if (w && w.rk === 'mag' && !w.bolt) { const b = basis(p.yaw, p.pitch); ejectCasing(g, b, [0, 0, 0], false); }
  },
  dmg(m) {
    const lost = me.hp - m.hp; me.hp = m.hp;
    fx.vign = clamp(0.35 + lost / 60, 0, 1); me.shake = Math.max(me.shake, 0.25);
    if (m.fp) { fx.dirYaw = Math.atan2(-(m.fp[0] - me.p[0]), -(m.fp[2] - me.p[2])); fx.dir = 1; }
    Snd.hurt();
  },
  hp(m) { me.hp = m.hp; if (m.heal) { Snd.heal(); announce('+50 HP', 'Medipack', 1.2); } },
  hitc(m) {
    fx.hit = 1; fx.dmgNum = 1; $('dmgnum').textContent = '-' + m.dmg; $('hit').className = 'hud' + (m.z === 0 ? ' hs' : '');
    Snd.hit(m.z === 0);
  },
  kill(m, t) {
    const k = players.get(m.k), v = players.get(m.v);
    if (v) { v.alive = false; v.deadAt = t; v.lvl = m.vl; v.deaths = m.vd; v.kills = m.vk; }
    if (k) { k.lvl = m.kl; k.kills = m.kk; }
    feed(k, v, m.w, m.hs, m.k === myId || m.v === myId);
    if (v) for (let i = 0; i < 10; i++) parts.push({ p: [v.pos[0], v.pos[1] + 1.1, v.pos[2]], v: [rnd(-2, 2), rnd(0.5, 3.5), rnd(-2, 2)], life: 0.6, max: 0.6, s0: 0.09, s1: 0.04, c: [0.6, 0.03, 0.03], a: 0.95, soft: 0.5, g: 9 });
    if (m.v === myId) {
      me.alive = false; me.deadAt = t; me.killerId = m.k; me.adsWant = false; me.ads = 0; me.reload = null; me.hp = 0; mouseDown = false; me.loAt = t + 1.4;
      const lost = mode === 'gungame' && m.vl < me.lvl; me.lvl = m.vl; buildLadder();
      Snd.death();
      announce(k && k !== v ? 'Getötet von ' + k.name : 'Selbst ausgeschaltet', lost ? 'Eine Stufe verloren!' : (m.w === 'he' ? 'HE-Granate' : (WEAPONS[m.w] || {}).name || ''), 2.4);
    }
    if (m.k === myId && m.v !== myId) {
      Snd.kill();
      if (mode === 'gungame' && m.kl > me.lvl) {
        setLevel(m.kl, t); Snd.level();
        const last = m.kl === LADDER.length - 1;
        announce(last ? 'Letzte Stufe!' : 'Stufe ' + (m.kl + 1), last ? 'Ein Messer-Kill zum Sieg' : WEAPONS[LADDER[m.kl]].name, 2.2);
      } else if (v) announce('Kill', v.name + (mode === 'dm' ? '  ·  ' + m.kk + '/' + dmLimit : ''), 1.4);
    }
  },
  nade(m, t) { nades.push({ id: m.id, k: m.k, p: m.o.slice(), v: m.v.slice(), t0: t, spin: Math.random() * 6, bounced: 0 }); Snd.throw_(m.o); },
  boom(m, t) {
    const i = nades.findIndex(n => n.id === m.id); if (i >= 0) nades.splice(i, 1);
    const p = m.p, d = Math.hypot(p[0] - cam.p[0], p[1] - cam.p[1], p[2] - cam.p[2]);
    if (m.k === 'he') {
      Snd.boom(p); me.shake = Math.max(me.shake, clamp(1.4 - d / 14, 0, 1.2)); setFlash([p[0], p[1] + 0.5, p[2]], t, 6);
      parts.push({ p: [p[0], p[1] + 0.4, p[2]], v: [0, 0, 0], life: 0.16, max: 0.16, s0: 1, s1: 5, c: [1, 0.92, 0.6], a: 1, add: true, soft: 0.2, g: 0 });
      for (let i = 0; i < 14; i++) parts.push({ p: [p[0], p[1] + 0.3, p[2]], v: [rnd(-6, 6), rnd(1, 8), rnd(-6, 6)], life: rnd(0.3, 0.6), max: 0.6, s0: rnd(0.5, 1), s1: 0.1, c: [1, rnd(0.4, 0.7), 0.1], a: 0.9, add: true, soft: 0.2, g: 6 });
      for (let i = 0; i < 12; i++) parts.push({ p: [p[0] + rnd(-1, 1), p[1] + rnd(0.2, 1.2), p[2] + rnd(-1, 1)], v: [rnd(-1.5, 1.5), rnd(0.6, 2.4), rnd(-1.5, 1.5)], life: rnd(1.2, 2.4), max: 2.4, s0: 0.8, s1: rnd(2, 3.2), c: [0.22, 0.2, 0.19], a: 0.6, soft: 0.25, g: -0.3 });
      for (let i = 0; i < 10; i++) parts.push({ p: [p[0], p[1] + 0.2, p[2]], v: [rnd(-8, 8), rnd(3, 10), rnd(-8, 8)], life: 0.9, max: 0.9, s0: 0.07, s1: 0.05, c: [0.3, 0.25, 0.2], a: 1, soft: 0.6, g: 16 });
    } else if (m.k === 'flash') {
      setFlash([p[0], p[1] + 0.3, p[2]], t, 12);
      parts.push({ p: [p[0], p[1] + 0.2, p[2]], v: [0, 0, 0], life: 0.12, max: 0.12, s0: 2, s1: 7, c: [1, 1, 1], a: 1, add: true, soft: 0.1, g: 0 });
      let blind = 0;
      if (me.alive && joined) {
        const e = eyePos(), fp = [p[0], p[1] + 0.2, p[2]];
        if (S.losClear(e, fp) && !inSmoke(e, fp, t)) {
          const b = basis(me.yaw, me.pitch), dd = Math.max(d, 0.1);
          const dot = ((fp[0] - e[0]) * b.f[0] + (fp[1] - e[1]) * b.f[1] + (fp[2] - e[2]) * b.f[2]) / dd;
          blind = clamp(1.25 - d / 26, 0, 1) * (dot > 0.25 ? 1 : dot > -0.3 ? 0.55 : 0.25);
          if (blind > 0.05) { me.flashDur = 0.6 + blind * 3.2; me.flashUntil = Math.max(me.flashUntil, t + me.flashDur); }
        }
      }
      Snd.flash(p, blind);
    } else if (m.k === 'smoke') { smokes.push(mkSmoke([p[0], p[1] + 1.2, p[2]], t)); Snd.hiss(p); }
  },
  item(m) { items[m.id] = !!m.on; },
  win(m, t) {
    gameState = 'end'; me.adsWant = false; fx.msgUntil = 0;
    const rows = [...players.values()].sort((a, b) => mode === 'dm' ? b.kills - a.kills : (b.lvl - a.lvl || b.kills - a.kills)).slice(0, 3);
    const el = $('win'); el.textContent = '';
    mk('h1', '', m.id === myId ? 'Du gewinnst!' : m.name + ' gewinnt!', el);
    mk('p', '', m.mode === 'dm' ? dmLimit + ' Kills – Runde beendet' : 'Messer-Kill – Runde beendet', el);
    const ol = mk('ol', '', '', el);
    rows.forEach((p, i) => mk('li', '', (i + 1) + '.  ' + p.name + '  ·  ' + (mode === 'dm' ? '' : 'Stufe ' + (p.lvl + 1) + '  ·  ') + p.kills + ' Kills', ol));
    mk('p', '', '', el).id = 'wincd';
    el.style.display = 'flex'; fx.winUntil = t + m.ms / 1000;
    Snd.win();
  },
  pack(m) {
    PK.reel = m.reel; PK.win = m.win; PK.item = m.item;
    setTimeout(openPack, 1600);
  },
  reset() {
    gameState = 'play'; $('win').style.display = 'none'; nades = []; smokes = []; decals = []; items = items.map(() => true);
    for (const p of players.values()) { p.lvl = 0; p.kills = 0; p.deaths = 0; p.alive = false; p.deadAt = -9; }
    me.lvl = 0; buildLadder();
    $('feed').textContent = ''; announce('Neue Runde', MODES[mode].n + ' · ' + MAPS[mapId].n, 2);
  },
  chat(m) { if (!m.id) return chatLine(null, m.m); const p = players.get(m.id); chatLine(p ? p.name : '?', m.m); },
  pings(m) { for (const e of m.l) { const p = players.get(e[0]); if (p) p.ping = e[1]; } },
  pong(m) { rtt = performance.now() - m.c; },
  skill(m) { botSkill = m.n; $('skill').value = m.n; }
};
setInterval(() => { if (joined) send({ t: 'ping', c: performance.now(), rtt }); }, 2000);

// ============================================================== Effekte
const fx = { hit: 0, dmgNum: 0, vign: 0, dir: 0, dirYaw: 0, msgUntil: 0, winUntil: 0, vmFlash: -9, lightT: -9, lightP: [0, 0, 0], lightI: 0 };
function setFlash(p, t, i) { fx.lightT = t; fx.lightP = p.slice(); fx.lightI = i; }
function mkSmoke(p, t0) {
  const puffs = [];
  for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * 2.3; puffs.push({ o: [Math.cos(a) * r, rnd(-1.0, 1.3), Math.sin(a) * r], s: rnd(1.5, 2.3), ph: Math.random() * 6, c: rnd(0.68, 0.8) }); }
  puffs.push({ o: [0, 0, 0], s: 2.4, ph: 0, c: 0.74 });
  return { p, t0, puffs };
}
function smokeFade(s, t) { const age = t - s.t0, D = NADES.smoke.duration; return age < 0 || age > D ? 0 : Math.min(1, age / 0.5) * (age > D - 2.5 ? (D - age) / 2.5 : 1); }
function inSmoke(a, b, t) { for (const s of smokes) if (smokeFade(s, t) > 0.4 && S.segSphere(a, b, s.p, NADES.smoke.radius * 0.9)) return true; return false; }
function addTracer(a, b) {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1.5) return;
  if (tracers.length > 80) tracers.shift();
  tracers.push({ a: a.slice(), d: [d[0] / len, d[1] / len, d[2] / len], len, t0: now() });
}
function impactFx(p, hit) {
  if (hit) { if (decals.length > 120) decals.shift(); decals.push({ p: p.slice(), ax: hit.ax }); }
  for (let i = 0; i < 3; i++) parts.push({ p: p.slice(), v: [rnd(-1, 1), rnd(0.3, 1.8), rnd(-1, 1)], life: 0.35, max: 0.35, s0: 0.06, s1: 0.22, c: [0.75, 0.68, 0.55], a: 0.55, soft: 0.3, g: 3 });
}
function bloodFx(p) { for (let i = 0; i < 5; i++) parts.push({ p: p.slice(), v: [rnd(-1.5, 1.5), rnd(0, 2), rnd(-1.5, 1.5)], life: 0.35, max: 0.35, s0: 0.08, s1: 0.03, c: [0.65, 0.04, 0.04], a: 0.95, soft: 0.5, g: 8 }); }
// Hülsen und Magazine: fallen auf den Boden darunter, springen einmal und bleiben liegen
function addObj(p, v, size, col, life) {
  if (objs.length > 70) objs.shift();
  objs.push({ p: p.slice(), v, size, col, life, max: life, ry: Math.random() * 6, rx: 0, spin: rnd(-14, 14), gy: S.groundAt(p[0], p[1], p[2]), bounces: 0 });
}
function ejectCasing(pos, b, vel, shell) {
  const v = [b.r[0] * rnd(1.8, 2.8) + b.u[0] * rnd(1, 2) + vel[0] * 0.8, b.r[1] * rnd(1.8, 2.8) + b.u[1] * rnd(1, 2) + 0.6, b.r[2] * rnd(1.8, 2.8) + b.u[2] * rnd(1, 2) + vel[2] * 0.8];
  addObj(pos, v, shell ? [0.022, 0.022, 0.06] : [0.012, 0.012, 0.03], shell ? K.shell : K.brass, 6);
}
function stepObjs(dt) {
  for (let i = objs.length - 1; i >= 0; i--) {
    const o = objs[i]; o.life -= dt;
    if (o.life <= 0) { objs.splice(i, 1); continue; }
    if (o.rest) continue;
    o.v[1] -= 16 * dt;
    o.p[0] += o.v[0] * dt; o.p[1] += o.v[1] * dt; o.p[2] += o.v[2] * dt;
    o.ry += o.spin * dt; o.rx += o.spin * 0.7 * dt;
    const floor = o.gy + o.size[1] / 2;
    if (o.p[1] <= floor) {
      o.p[1] = floor;
      if (o.bounces < 1 && Math.abs(o.v[1]) > 1.2) { o.v[1] = -o.v[1] * 0.35; o.v[0] *= 0.5; o.v[2] *= 0.5; o.spin *= 0.5; o.bounces++; if (o.size[2] < 0.05) Snd.tink(o.p); }
      else { o.rest = true; o.rx = Math.round(o.rx / (Math.PI / 2)) * (Math.PI / 2); }
    }
  }
}

// ================================================================ Waffen
function vmWorldPos(fwd, right, down) {
  const e = eyePos(), b = basis(me.yaw, me.pitch);
  return [e[0] + b.f[0] * fwd + b.r[0] * right - b.u[0] * down, e[1] + b.f[1] * fwd + b.r[1] * right - b.u[1] * down, e[2] + b.f[2] * fwd + b.r[2] * right - b.u[2] * down];
}
function fireGun(t, key, w, st) {
  me.ammo[me.slot]--; me.nextFire = t + 60 / w.rpm; me.fireT = t; me.cycleDone = false; fx.vmFlash = t; me.protUntil = 0;
  const eye = eyePos(), b = basis(me.yaw, me.pitch), a = me.ads;
  const ends = [], hits = [];
  const mz = vmWorldPos(0.75, 0.16 * (1 - a), 0.12 * (1 - a) + 0.05 * a);
  const spread = me.spreadNow;
  for (let i = 0; i < w.pellets; i++) {
    const an = Math.random() * 6.283, r = spread * (Math.random() + Math.random()) * 0.7;
    let dx = b.f[0] + (b.r[0] * Math.cos(an) + b.u[0] * Math.sin(an)) * r, dy = b.f[1] + (b.u[1] * Math.sin(an)) * r, dz = b.f[2] + (b.r[2] * Math.cos(an) + b.u[2] * Math.sin(an)) * r;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const mh = S.rayBoxes(eye[0], eye[1], eye[2], dx, dy, dz, 300);
    let best = mh ? mh.t : 300, hit = null, zone = 1;
    for (const p of players.values()) {
      if (p.id === myId || !p.alive) continue;
      const rr = S.rayPlayer(eye[0], eye[1], eye[2], dx, dy, dz, p.pos, p.fl & 1);
      if (rr && rr.t < best) { best = rr.t; hit = p; zone = rr.zone; }
    }
    const end = [eye[0] + dx * best, eye[1] + dy * best, eye[2] + dz * best];
    ends.push(end.map(v => Math.round(v * 100) / 100));
    if (hit) { hits.push({ id: hit.id, z: zone, p: end }); bloodFx(end); } else if (mh) impactFx(end, mh);
    if (!st.sup) addTracer(mz, end);
  }
  const kick = w.kick * st.recoil * (1 - 0.2 * a) * rnd(0.8, 1.2);
  me.pitch = clamp(me.pitch + kick, -1.55, 1.55); me.recoilAcc += kick;
  me.yaw += w.kick * st.recoil * 0.4 * rnd(-1, 1) + (w.auto ? Math.sin(t * 2.2) * w.kick * 0.25 : 0);
  me.bloom = Math.min(me.bloom + w.bloom, w.bloom * 9);
  Snd.shot(key, null, st.sup);
  if (!st.sup) setFlash(mz, t, 1.6);
  if (w.rk === 'mag' && !w.bolt) ejectCasing(vmWorldPos(0.3, 0.12, 0.06), b, me.v, false);
  send({ t: 'shot', w: me.slot, o: eye, e: ends, hits });
}
function knifeAttack(t, w) {
  me.nextFire = t + 60 / w.rpm; me.swingT = t; me.protUntil = 0;
  Snd.knife();
  const eye = eyePos(); let best = null;
  for (const off of [0, -0.14, 0.14, -0.28, 0.28]) {
    const b = basis(me.yaw + off, me.pitch);
    const mh = S.rayBoxes(eye[0], eye[1], eye[2], b.f[0], b.f[1], b.f[2], w.range);
    const lim = mh ? mh.t : w.range;
    for (const p of players.values()) {
      if (p.id === myId || !p.alive) continue;
      const rr = S.rayPlayer(eye[0], eye[1], eye[2], b.f[0], b.f[1], b.f[2], p.pos, p.fl & 1);
      if (rr && rr.t < lim && (!best || rr.t < best.t)) best = { t: rr.t, id: p.id, p: [eye[0] + b.f[0] * rr.t, eye[1] + b.f[1] * rr.t, eye[2] + b.f[2] * rr.t] };
    }
    if (best) break;
  }
  if (best) bloodFx(best.p);
  send({ t: 'shot', w: me.slot, o: eye, e: [], hits: best ? [{ id: best.id, z: 1, p: best.p }] : [] });
}
function throwNade(t, k) {
  if (me.nades[k] <= 0) return;
  me.nades[k]--; me.nextFire = t + 0.5; me.throwT = t; me.autoBack = t + 0.35; me.protUntil = 0;
  const eye = eyePos(), b = basis(me.yaw, me.pitch);
  let o = [eye[0] + b.f[0] * 0.45 + b.r[0] * 0.15, eye[1] + b.f[1] * 0.45 - 0.08, eye[2] + b.f[2] * 0.45 + b.r[2] * 0.15];
  if (S.pointSolid(o[0], o[1], o[2], 0.12)) o = eye;
  const v = [b.f[0] * 19 + me.v[0] * 0.6, b.f[1] * 19 + 3.6 + Math.max(0, me.v[1]) * 0.4, b.f[2] * 19 + me.v[2] * 0.6];
  send({ t: 'nade', k, o, v });
}
function startReload(t) {
  if (me.slot > 1) return;
  const key = curKey(); if (!key) return;
  const w = WEAPONS[key]; if (w.melee) return;
  const st = stOf(key);
  if (me.reload || me.ammo[me.slot] >= st.mag) return;
  const empty = me.ammo[me.slot] === 0;
  const r = { key, slot: me.slot, t0: t, kind: w.rk, empty, ev: {} };
  if (w.rk === 'shell') { r.per = w.shell * st.reload / w.reload; r.next = t + 0.38 + r.per; }
  else r.dur = st.reload * (w.rk === 'mag' && !empty ? 0.82 : 1);
  me.reload = r;
  if (!SET.adsHold) me.adsWant = false;
}
function dropMag(key) {
  const G = GUN[key]; if (!G.magSize) return;
  const b = basis(me.yaw, me.pitch), p = vmWorldPos(0.35, 0.1, 0.3);
  addObj(p, [me.v[0] * 0.5 + b.r[0] * 0.3, -1.2, me.v[2] * 0.5 + b.r[2] * 0.3], G.magSize.map(v => v * 1.1), K.dark, 10);
  if (MD.guns[key] && MD.guns[key].mag && G.magC) objs[objs.length - 1].mesh = key;
}
function reloadTick(t) {
  const r = me.reload; if (!r) return;
  if (r.slot !== me.slot) { me.reload = null; return; }
  const cap = stOf(r.key).mag;
  if (r.kind === 'shell') {
    if (r.endAt) { if (r.pumpAt && t >= r.pumpAt) { r.pumpAt = 0; Snd.pump(); } if (t >= r.endAt) me.reload = null; return; }
    if (t >= r.next) {
      if (me.ammo[r.slot] < cap) { me.ammo[r.slot]++; Snd.shellIn(); }
      if (me.ammo[r.slot] >= cap) { r.endAt = t + 0.45; if (r.empty) r.pumpAt = t + 0.12; }
      else r.next += r.per;
    }
    return;
  }
  const k = (t - r.t0) / r.dur, u = k * (r.kind === 'mag' && !r.empty ? 0.76 : 1);
  const ev = (name, at, fn) => { if (u >= at && !r.ev[name]) { r.ev[name] = 1; fn(); } };
  if (r.kind === 'mag') {
    ev('out', 0.13, () => { Snd.magout(); dropMag(r.key); });
    ev('in', 0.6, () => Snd.magin());
    if (r.empty) ev('ch', 0.77, () => Snd.charge());
  } else if (r.kind === 'cyl') {
    ev('open', 0.08, () => Snd.cylOpen());
    ev('ej', 0.26, () => { const b = basis(me.yaw, me.pitch), p = vmWorldPos(0.3, 0.06, 0.12); for (let i = 0; i < 6; i++) addObj(p, [rnd(-0.5, 0.5), rnd(-1.5, 0), rnd(-0.5, 0.5)], [0.012, 0.012, 0.03], K.brass, 6); void b; });
    ev('in', 0.64, () => Snd.magin());
    ev('close', 0.82, () => Snd.cylClose());
  }
  if (k >= 1) { me.ammo[r.slot] = cap; me.reload = null; }
}
function weaponTick(t, dt) {
  const key = curKey(), w = key ? WEAPONS[key] : null, st = key ? stOf(key) : null;
  // Zielen (ADS)
  const canAds = me.alive && w && !w.melee && !me.reload && t >= me.switchT + 0.2 && gameState === 'play' && locked;
  const rate = 1 / Math.max(0.05, st ? st.ads : 0.2), prev = me.ads;
  me.ads = clamp(me.ads + (canAds && me.adsWant ? rate : -rate * 1.4) * dt, 0, 1);
  if (prev < 0.05 && me.ads >= 0.05) Snd.ads();
  // Streuung für Schuss + Fadenkreuz
  if (w && !w.melee) {
    const sp = Math.hypot(me.v[0], me.v[2]) / PLAYER.RUN, a = me.ads;
    let s = w.spread + me.bloom + w.move * clamp((sp - 0.3) / 0.6, 0, 1) * (1 - 0.5 * a);
    if (!me.onGround) s += w.move * 1.4 + 0.03;
    if (w.cls === 'sniper') s += w.noscope * (1 - smooth(a));
    s *= lerp(st.hip, 1, a) * (1 - (w.cls === 'shotgun' ? 0.25 : 0.7) * a);
    if (me.crouch && me.onGround) s *= 0.75;
    me.spreadNow = s;
  } else me.spreadNow = 0.004;
  me.bloom = Math.max(0, me.bloom - dt * 0.07);
  if (t - me.fireT > 0.14 && me.recoilAcc > 0) { const dec = me.recoilAcc * (1 - Math.exp(-7 * dt)); me.pitch -= dec * 0.7; me.recoilAcc -= dec; if (me.recoilAcc < 0.0005) me.recoilAcc = 0; }
  // Repetieren nach dem Schuss (Pumpe / Kammerstängel)
  if (w && !me.cycleDone && t - me.fireT > 0.22 * 60 / w.rpm && (w.bolt || key === 'shotgun') && me.ammo[me.slot] > 0) {
    me.cycleDone = true;
    if (key === 'shotgun') { Snd.pump(); ejectCasing(vmWorldPos(0.3, 0.1, 0.06), basis(me.yaw, me.pitch), me.v, true); }
    else { Snd.bolt(); ejectCasing(vmWorldPos(0.25, 0.1, 0.02), basis(me.yaw, me.pitch), me.v, false); }
  }
  if (!me.alive || gameState !== 'play') { mouseEdge = false; return; }
  if (me.autoBack && t >= me.autoBack) { me.autoBack = 0; me.slot = me.lastSlot < 3 && curKey(me.lastSlot) ? me.lastSlot : 0; me.switchT = t; me.nextFire = Math.max(me.nextFire, t + 0.25); }
  reloadTick(t);
  const edge = mouseEdge; mouseEdge = false;
  if (!locked || chatOpen) return;
  if (!w) { if (edge && t >= me.nextFire && !me.autoBack) throwNade(t, NADE_KEYS[me.slot - 3]); return; }
  if (t < me.nextFire) return;
  if (w.melee) { if (mouseDown) knifeAttack(t, w); return; }
  if (me.reload) { if (me.reload.kind === 'shell' && edge && me.ammo[me.slot] > 0 && !me.reload.endAt) me.reload.endAt = t + 0.25; return; }
  if (me.ammo[me.slot] <= 0) { if (edge) { Snd.dry(); startReload(t); } return; }
  if (w.auto ? mouseDown : edge) fireGun(t, key, w, st);
}

// ============================================================== Bewegung
function accel(wx, wz, wish, a, dt) {
  const cur = me.v[0] * wx + me.v[2] * wz, add = wish - cur;
  if (add <= 0) return;
  const k = Math.min(a * wish * dt, add);
  me.v[0] += wx * k; me.v[2] += wz * k;
}
function moveAxis(a, dt, h) {
  const old = me.p[a];
  me.p[a] = old + me.v[a] * dt;
  const c = S.collide(me.p[0], me.p[1], me.p[2], h);
  if (!c) return;
  const up = c.top - me.p[1];
  if (me.onGround && up > 0 && up <= PLAYER.STEP + 0.001 && !S.collide(me.p[0], c.top, me.p[2], h)) { me.p[1] = c.top; return; }
  me.p[a] = old; me.v[a] = 0;
}
function moveMe(t, dt) {
  const key = curKey(), w = key ? WEAPONS[key] : null;
  const typing = chatOpen || !locked;
  const down = c => !typing && keys.has(c);
  let sp = PLAYER.RUN * (w ? w.speed : 1);
  const walking = down('ShiftLeft') || down('ShiftRight');
  if (walking) sp *= 0.52;
  if (me.crouch) sp *= 0.42;
  sp *= 1 - 0.32 * me.ads;
  const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw);
  let wx = 0, wz = 0;
  if (down('KeyW') || down('ArrowUp')) { wx -= sy; wz -= cy; }
  if (down('KeyS') || down('ArrowDown')) { wx += sy; wz += cy; }
  if (down('KeyD') || down('ArrowRight')) { wx += cy; wz -= sy; }
  if (down('KeyA') || down('ArrowLeft')) { wx -= cy; wz += sy; }
  const wl = Math.hypot(wx, wz); if (wl > 0) { wx /= wl; wz /= wl; }
  let jumped = false;
  if (me.onGround) {
    const speed = Math.hypot(me.v[0], me.v[2]);
    if (speed > 0.02) { const k = Math.max(0, speed - Math.max(speed, 2.5) * 9 * dt) / speed; me.v[0] *= k; me.v[2] *= k; } else { me.v[0] = 0; me.v[2] = 0; }
    if (wl > 0) accel(wx, wz, sp, 11, dt);
    if (down('Space')) { me.v[1] = PLAYER.JUMP; me.onGround = false; jumped = true; }
  } else if (wl > 0) accel(wx, wz, Math.min(sp, 0.9), 45, dt);
  me.v[1] -= PLAYER.G * dt;
  if (down('KeyC')) me.crouch = true;
  else if (me.crouch && !S.collide(me.p[0], me.p[1], me.p[2], PLAYER.H)) me.crouch = false;
  const h = me.crouch ? PLAYER.HC : PLAYER.H;
  const wasGround = me.onGround && !jumped;
  moveAxis(0, dt, h); moveAxis(2, dt, h);
  me.p[1] += me.v[1] * dt;
  const c = S.collide(me.p[0], me.p[1], me.p[2], h);
  if (c) {
    if (me.v[1] <= 0) { me.p[1] = c.top; me.onGround = true; } else me.p[1] = c.bot - h - 0.001;
    me.v[1] = 0;
  } else {
    me.onGround = false;
    if (wasGround && me.v[1] <= 0) { // Treppen hinunter am Boden bleiben
      const c2 = S.collide(me.p[0], me.p[1] - PLAYER.STEP, me.p[2], h);
      if (c2 && c2.top <= me.p[1] + 0.001) { me.p[1] = c2.top; me.onGround = true; me.v[1] = 0; }
    }
  }
  if (me.p[1] < -5) { me.p[1] = 0.2; me.v[1] = 0; }
  me.visY = me.onGround ? lerp(me.visY, me.p[1], Math.min(1, dt * 16)) : me.p[1];
  if (Math.abs(me.visY - me.p[1]) > 1) me.visY = me.p[1];
  me.eyeH = lerp(me.eyeH, me.crouch ? PLAYER.EYEC : PLAYER.EYE, Math.min(1, dt * 14));
  const hs = Math.hypot(me.v[0], me.v[2]);
  if (me.onGround && hs > 1) { me.bob += hs * dt * 1.9; me.stepPh += hs * dt; if (me.stepPh > 3.3) { me.stepPh = 0; if (!walking && !me.crouch) Snd.step(null, 0.16); } }
}

// ================================================================ Eingabe
function setLocked(v) {
  locked = v;
  if (!v) { keys.clear(); mouseDown = false; showSB = false; closeChat(); }
  updateScreens();
}
function lockMouse() {
  if (!joined || LO.open) return;
  let req = null;
  try { req = canvas.requestPointerLock(); } catch (e) { req = null; }
  if (req && req.catch) req.catch(() => enterSoft());
  setTimeout(() => { if (joined && !locked && !LO.open && document.pointerLockElement !== canvas) enterSoft(); }, 450);
}
// Ersatz, falls der Browser die Maus nicht einfangen darf: Sicht folgt der Maus, am Bildrand dreht sie weiter
function enterSoft() { if (locked || LO.open || !joined) return; softLock = true; setLocked(true); }
function releaseMouse() { softLock = false; if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock(); setLocked(false); }
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { softLock = false; setLocked(true); }
  else if (!softLock) setLocked(false);
});
document.addEventListener('mousemove', e => {
  mouseX = e.clientX / Math.max(1, innerWidth);
  if (!locked || !joined) return;
  const k = 0.0022 * SET.sens * (curFov / SET.fov);
  me.yaw -= e.movementX * k; me.pitch = clamp(me.pitch - e.movementY * k, -1.55, 1.55);
  me.swayX = clamp(me.swayX - e.movementX * 0.00018, -0.03, 0.03); me.swayY = clamp(me.swayY + e.movementY * 0.00018, -0.03, 0.03);
});
canvas.addEventListener('mousedown', e => {
  if (!joined || LO.open) return;
  if (!locked) { lockMouse(); return; }
  if (e.button === 0) { mouseDown = true; mouseEdge = true; }
  if (e.button === 2) me.adsWant = SET.adsHold ? true : !me.adsWant;
});
window.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2 && SET.adsHold) me.adsWant = false; });
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('wheel', e => {
  if (!locked || !me.alive) return;
  const order = [0, 1, 2, 3, 4, 5].filter(s => s >= 3 ? me.nades[NADE_KEYS[s - 3]] > 0 : !!curKey(s) && !(s === 2 && curKey(0) === 'knife'));
  const i = Math.max(0, order.indexOf(me.slot)); setSlot(order[(i + (e.deltaY > 0 ? 1 : order.length - 1)) % order.length], now());
}, { passive: true });
window.addEventListener('keydown', e => {
  if (e.target === $('chatin') || e.target === $('name')) return;
  if (!joined) return;
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (PK.open) {
    if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { if (PK.phase === 'ready') startSpin(); else if (PK.phase === 'done') closePack(); }
    return;
  }
  if (LO.open) {
    if ((e.code === 'Space' || e.code === 'Enter') && LO.mode === 'spawn' && !e.repeat) confirmLoadout();
    if (e.code === 'Escape' && LO.mode === 'edit') { closeLoadout(); updateScreens(); }
    return;
  }
  if (softLock && e.code === 'Escape') { releaseMouse(); return; }
  if (!locked || e.repeat) return;
  keys.add(e.code);
  const t = now();
  switch (e.code) {
    case 'Digit1': setSlot(0, t); break;
    case 'Digit2': setSlot(mode === 'dm' ? 1 : 2, t); break;
    case 'Digit3': setSlot(2, t); break;
    case 'Digit4': setSlot(3, t); break;
    case 'Digit5': setSlot(4, t); break;
    case 'Digit6': setSlot(5, t); break;
    case 'KeyG': { const s = [3, 4, 5].find(s => me.nades[NADE_KEYS[s - 3]] > 0 && s !== me.slot); if (s) setSlot(s, t); break; }
    case 'KeyQ': setSlot(me.lastSlot, t); break;
    case 'KeyR': startReload(t); break;
    case 'Tab': showSB = true; renderSB(); break;
    case 'Enter': case 'KeyT': openChat(); e.preventDefault(); break;
  }
});
window.addEventListener('keyup', e => { keys.delete(e.code); if (e.code === 'Tab') showSB = false; });
window.addEventListener('blur', () => { keys.clear(); mouseDown = false; showSB = false; });

function openChat() { chatOpen = true; keys.clear(); mouseDown = false; const c = $('chatin'); c.style.display = 'block'; c.value = ''; c.focus(); }
function closeChat() { chatOpen = false; const c = $('chatin'); c.style.display = 'none'; c.blur(); }
$('chatin').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { const v = $('chatin').value.trim(); if (v) send({ t: 'chat', m: v }); closeChat(); }
  else if (e.code === 'Escape') closeChat();
});
function mk(tag, cls, txt, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; if (parent) parent.appendChild(e); return e; }
function chatLine(who, txt) {
  const d = mk('div');
  if (who) mk('b', '', who + ': ', d);
  d.appendChild(document.createTextNode(txt));
  if (!who) d.style.color = '#9aa3ad';
  const log = $('chatlog'); log.appendChild(d);
  while (log.children.length > 7) log.removeChild(log.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 12000);
}

// ================================================================= Menüs
function updateScreens() { const p = joined && !locked && !LO.open && !PK.open; $('pause').classList.toggle('on', p); if (p) refreshPause(); }
function showMenu(err) { $('hud').style.display = 'none'; $('pause').classList.remove('on'); $('menu').classList.add('on'); $('err').textContent = err || ''; if (document.exitPointerLock) document.exitPointerLock(); }
function startGame(how) {
  const name = $('name').value.trim() || 'Spieler';
  store.set('name', name); $('err').textContent = '';
  Snd.init();
  if (connecting || (ws && ws.readyState <= 1)) return;
  if (!NETKIND) return;
  if (!how) how = NETKIND === 'server' ? 'server' : window.BF_OFFLINE ? 'local' : $('joincode').value.trim() ? 'join' : 'host';
  connect(name, how, $('joincode').value);
}
$('name').value = store.get('name', '');
$('name').addEventListener('keydown', e => { if (e.code === 'Enter') startGame(); });
$('joincode').addEventListener('keydown', e => { if (e.code === 'Enter') startGame('join'); });
$('play').addEventListener('click', () => startGame('server'));
$('hostbtn').addEventListener('click', () => startGame('host'));
$('solobtn').addEventListener('click', () => startGame('local'));
$('joinbtn').addEventListener('click', () => startGame('join'));
$('online2').addEventListener('click', () => {
  $('online2').disabled = true; $('invite2').textContent = 'Verbinde mit dem Online-Dienst …';
  Net.goOnline().then(code => { $('online2').disabled = false; refreshInvite(); chatLine(null, 'Dein Spiel ist online. Code: ' + code + ' – Link unten im Menü teilen.'); },
    err => { $('online2').disabled = false; refreshInvite(); $('invite2').textContent = err.message; });
});
Promise.race([Net.detect(), new Promise(r => setTimeout(() => r(false), 2500))]).then(srv => setupMenu(srv ? 'server' : 'p2p'));
$('resume').addEventListener('click', () => { Snd.init(); lockMouse(); });
$('editlo').addEventListener('click', () => openLoadout('edit'));
function copyLink(btn) {
  const l = Net.inviteLink() || location.origin + '/';
  const ok = () => { btn.textContent = 'Kopiert ✓'; setTimeout(() => btn.textContent = 'Kopieren', 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(l).then(ok, () => { });
}
$('copy').addEventListener('click', () => copyLink($('copy'))); $('copy2').addEventListener('click', () => copyLink($('copy2')));
for (const k in MAPS) mk('option', '', MAPS[k].n, $('mapsel')).value = k;
for (const k in MODES) mk('option', '', MODES[k].n, $('modesel')).value = k;
$('sens').value = SET.sens; $('vol').value = SET.vol; $('fov').value = SET.fov; $('qual').value = SET.q; $('adsmode').value = SET.adsHold ? 'halten' : 'umschalten';
function refreshPause() {
  $('sensv').textContent = SET.sens.toFixed(2); $('volv').textContent = Math.round(SET.vol * 100) + '%'; $('fovv').textContent = SET.fov + '°';
  $('botn').textContent = [...players.values()].filter(p => p.bot).length + '';
}
$('sens').addEventListener('input', e => { SET.sens = +e.target.value; store.set('sens', SET.sens); refreshPause(); });
$('fov').addEventListener('input', e => { SET.fov = +e.target.value; store.set('fov', SET.fov); refreshPause(); });
$('vol').addEventListener('input', e => { SET.vol = +e.target.value; store.set('vol', SET.vol); Snd.setVol(SET.vol); refreshPause(); });
$('qual').addEventListener('change', e => { SET.q = e.target.value; store.set('q', SET.q); setupShadow(); });
$('adsmode').addEventListener('change', e => { SET.adsHold = e.target.value === 'halten'; store.set('ads', e.target.value); me.adsWant = false; });
$('applycfg').addEventListener('click', () => send({ t: 'cfg', map: $('mapsel').value, mode: $('modesel').value }));
$('botadd').addEventListener('click', () => { send({ t: 'bot', n: 1 }); setTimeout(refreshPause, 250); });
$('botdel').addEventListener('click', () => { send({ t: 'bot', n: -1 }); setTimeout(refreshPause, 250); });
$('skill').addEventListener('change', e => send({ t: 'skill', n: +e.target.value }));

// ---------------------------------------------------------------- Loadout
function editKeys() { return mode === 'gungame' ? LADDER.filter(k => k !== 'knife') : [LO.draft.p, LO.draft.s]; }
// ----------------------------------------------------------- Glückspaket
const css = c => 'rgb(' + c.map(v => Math.round(clamp(v, 0, 1) * 255)).join(',') + ')';
function finishCss(F) {
  const c = css(F.c), c2 = css(F.c2), c3 = css(F.c.map((v, i) => (v + F.c2[i]) / 2));
  switch (F.m) {
    case 17: return 'radial-gradient(circle at 22% 30%, ' + c2 + ' 0 17%, transparent 18%), radial-gradient(circle at 72% 62%, ' + c2 + ' 0 21%, transparent 22%), radial-gradient(circle at 45% 82%, ' + c3 + ' 0 15%, transparent 16%), radial-gradient(circle at 85% 15%, ' + c3 + ' 0 14%, transparent 15%), ' + c;
    case 18: return 'repeating-linear-gradient(118deg, ' + c + ' 0 9px, ' + c2 + ' 9px 15px)';
    case 19: return 'linear-gradient(135deg, ' + c2 + ', ' + c + ' 38%, #fffc 50%, ' + c + ' 62%, ' + c2 + ')';
    case 20: return 'linear-gradient(100deg, ' + c + ', ' + c2 + ')';
    case 21: return 'repeating-conic-gradient(' + c + ' 0 25%, ' + c2 + ' 0 50%) 0 0 / 8px 8px';
    default: return 'radial-gradient(1px 1px at 20% 30%, #fff, transparent), radial-gradient(1px 1px at 70% 60%, #fff, transparent), radial-gradient(1.5px 1.5px at 40% 75%, #fff, transparent), radial-gradient(circle at 60% 40%, ' + c2 + ', ' + c + ' 70%)';
  }
}
function skinCard(id, parent) {
  const inf = S.skinInfo(id), d = mk('div', 'pcard', '', parent);
  d.style.setProperty('--rc', inf.rarity.c);
  mk('div', 'sw', '', d).style.background = finishCss(inf.F);
  mk('b', '', WEAPONS[inf.w].short, d); mk('small', '', inf.F.n, d);
  return d;
}
function openPack() {
  if (!PK.reel.length) return;
  PK.open = true; PK.phase = 'ready'; PK.lastIdx = -1;
  releaseMouse(); closeChat(); if (LO.open) closeLoadout();
  $('hud').style.display = 'none'; $('pause').classList.remove('on');
  const reel = $('reel'); reel.textContent = ''; reel.style.transform = 'translateX(0px)';
  for (const id of PK.reel) skinCard(id, reel);
  $('pkresult').textContent = ''; $('pkresult').style.color = '';
  $('pksub').textContent = 'Glückwunsch zum Sieg! Darin steckt ein zufälliger Waffen-Skin.';
  $('pkopen').style.display = ''; $('pkequip').style.display = 'none'; $('pkclose').style.display = 'none';
  $('pack').classList.add('on');
  Snd.pack();
}
function startSpin() {
  if (PK.phase !== 'ready') return;
  Snd.init();
  PK.phase = 'spin'; PK.t0 = now(); PK.lastIdx = -1;
  const wrapW = $('reelwrap').clientWidth, cw = 138;
  PK.dist = PK.win * cw + 66 - wrapW / 2 + rnd(-52, 52);
  $('pkopen').style.display = 'none'; $('pksub').textContent = 'Viel Glück …';
}
function packTick(t) {
  if (PK.phase !== 'spin') return;
  const k = clamp((t - PK.t0) / PK.dur, 0, 1), e = 1 - Math.pow(1 - k, 4), x = PK.dist * e;
  $('reel').style.transform = 'translateX(' + (-x).toFixed(1) + 'px)';
  const idx = Math.floor((x + $('reelwrap').clientWidth / 2) / 138);
  if (idx !== PK.lastIdx) { PK.lastIdx = idx; Snd.tick(); }
  if (k >= 1) {
    PK.phase = 'done'; PK.doneAt = t;
    const inf = S.skinInfo(PK.item);
    invAdd(PK.item);
    const cards = $('reel').children; if (cards[PK.win]) cards[PK.win].classList.add('won');
    $('pkresult').textContent = inf.name; $('pkresult').style.color = inf.rarity.c;
    $('pksub').textContent = inf.rarity.n + ' · neu in deinem Inventar (' + invCount(PK.item) + '×)';
    $('pkequip').style.display = ''; $('pkequip').textContent = 'Ausrüsten'; $('pkclose').style.display = '';
    Snd.reveal(inf.r);
  }
}
function closePack() {
  PK.open = false; PK.phase = 'closed';
  $('pack').classList.remove('on');
  if (joined) $('hud').style.display = 'block';
  if (joined && me.alive) lockMouse(); else updateScreens();
}
$('pkopen').addEventListener('click', startSpin);
$('pkclose').addEventListener('click', closePack);
$('pkequip').addEventListener('click', () => {
  const inf = S.skinInfo(PK.item); if (!inf) return;
  savedLo.skin[inf.w] = inf.f; store.set('lo', JSON.stringify(savedLo)); send({ t: 'lo', lo: savedLo });
  $('pkequip').textContent = 'Ausgerüstet ✓ (ab nächstem Spawn)';
});
function openLoadout(m) {
  LO.open = true; LO.mode = m; LO.draft = S.sanitizeLoadout(JSON.parse(JSON.stringify(savedLo)));
  const k = mode === 'gungame' ? LADDER[Math.min(me.lvl, LADDER.length - 2)] : LO.draft.p;
  LO.edit = k;
  releaseMouse(); closeChat();
  $('pause').classList.remove('on');
  $('loadout').classList.add('on'); $('lopreview').style.display = 'block'; $('hud').style.display = 'none';
  $('spawn').textContent = m === 'spawn' ? 'Spawnen' : 'Speichern';
  renderLoadout();
}
function closeLoadout() { LO.open = false; $('loadout').classList.remove('on'); $('lopreview').style.display = 'none'; if (joined) $('hud').style.display = 'block'; }
function confirmLoadout() {
  savedLo = S.sanitizeLoadout(LO.draft); store.set('lo', JSON.stringify(savedLo));
  send({ t: 'lo', lo: savedLo });
  const spawnMode = LO.mode === 'spawn';
  closeLoadout();
  if (spawnMode) { send({ t: 'ready' }); Snd.init(); lockMouse(); }
  else updateScreens();
}
$('spawn').addEventListener('click', confirmLoadout);
$('loall').addEventListener('click', () => {
  const src = LO.draft.att[LO.edit]; if (!src) return;
  for (const k in LO.draft.att) { const c = S.compat(k); for (const s of S.ATT_SLOTS) if (c[s].indexOf(src[s]) >= 0) LO.draft.att[k][s] = src[s]; }
  renderLoadout();
  $('loall').textContent = 'Übernommen ✓'; setTimeout(() => $('loall').textContent = 'Aufsätze auf alle Waffen', 1200);
});
function weaponCard(parent, k, sel, onClick) {
  const w = WEAPONS[k], b = mk('button', 'wcard' + (sel ? ' sel' : ''), '', parent);
  mk('b', '', w.name, b); mk('small', '', S.CLASS_NAME[w.cls] + ' · ' + w.dmg + (w.pellets > 1 ? '×' + w.pellets : '') + ' Schaden', b);
  b.addEventListener('click', onClick);
}
function statBars(parent, k, a) {
  const w = WEAPONS[k], base = S.stats(k, {}), st = S.stats(k, a), grid = mk('div', 'bars', '', parent);
  const rows = [
    ['Schaden', (w.dmg * w.pellets) / 130, (w.dmg * w.pellets) / 130, w.dmg * w.pellets + ''],
    ['Feuerrate', w.rpm / 900, w.rpm / 900, w.rpm + '/min'],
    ['Reichweite', w.fe * base.range / 150, w.fe * st.range / 150, Math.round(w.fe * st.range) + ' m'],
    ['Kontrolle', 1 - w.kick * base.recoil / 0.065, 1 - w.kick * st.recoil / 0.065, Math.round((1 - st.recoil) * 100) ? Math.round((1 - st.recoil) * 100) + ' %' : '–'],
    ['Zielzeit', 1 - base.ads / 0.55, 1 - st.ads / 0.55, Math.round(st.ads * 1000) + ' ms'],
    ['Nachladen', 1 - base.reload / 5, 1 - st.reload / 5, st.reload.toFixed(1) + ' s'],
    ['Magazin', base.mag / 120, st.mag / 120, st.mag + '']
  ];
  for (const r of rows) {
    mk('span', '', r[0], grid);
    const bar = mk('div', 'bar', '', grid);
    mk('u', '', '', bar).style.width = clamp(r[1], 0.03, 1) * 100 + '%';
    const i = mk('i', '', '', bar); i.style.width = clamp(r[2], 0.03, 1) * 100 + '%';
    if (r[2] > r[1] + 0.005) i.style.background = 'var(--green)'; else if (r[2] < r[1] - 0.005) i.style.background = 'var(--red)';
    mk('span', 'mono', r[3], grid);
  }
}
function renderLoadout() {
  const d = LO.draft, body = $('lobody'); body.textContent = '';
  $('losub').textContent = MODES[mode].n + ' · ' + MAPS[mapId].n + (LO.mode === 'edit' ? ' · gilt ab dem nächsten Spawn' : '');
  if (mode === 'dm') {
    mk('h3', '', 'Primärwaffe', body);
    const c1 = mk('div', 'cards', '', body);
    for (const k of S.PRIMARY) weaponCard(c1, k, d.p === k, () => { d.p = k; LO.edit = k; renderLoadout(); });
    mk('h3', '', 'Sekundärwaffe', body);
    const c2 = mk('div', 'cards', '', body);
    for (const k of S.SECONDARY) weaponCard(c2, k, d.s === k, () => { d.s = k; LO.edit = k; renderLoadout(); });
  } else mk('div', 'sub', 'Gun Game: Deine Stufe bestimmt die Waffe. Rüste hier die Aufsätze für jede Stufe aus.', body);
  const ks = editKeys(); if (ks.indexOf(LO.edit) < 0 && LO.edit !== 'knife') LO.edit = ks[0];
  mk('h3', '', 'Aufsätze', body);
  const chips = mk('div', 'chips', '', body);
  for (const k of ks.concat(ks.indexOf('knife') < 0 ? ['knife'] : [])) mk('button', LO.edit === k ? 'sel' : '', WEAPONS[k].short, chips).addEventListener('click', () => { LO.edit = k; renderLoadout(); });
  const k = LO.edit, c = S.compat(k), a = d.att[k] || {};
  if (c) for (const slot of S.ATT_SLOTS) {
    const row = mk('div', 'attrow', '', body); mk('span', '', S.ATT_SLOT_NAME[slot], row);
    const right = mk('div', '', '', row), opts = mk('div', 'opts', '', right);
    for (const o of c[slot]) mk('button', 'opt' + (a[slot] === o ? ' sel' : ''), ATT[slot][o].n, opts).addEventListener('click', () => { a[slot] = o; renderLoadout(); });
    mk('div', 'attdesc', ATT[slot][a[slot]].d, right);
  }
  {
    const row = mk('div', 'attrow', '', body); mk('span', '', 'Skin', row);
    const right = mk('div', '', '', row), opts = mk('div', 'opts', '', right);
    const owned = [...new Set(inv.filter(id => id.startsWith(k + ':')))];
    const cur = d.skin[k];
    mk('button', 'opt' + (!cur ? ' sel' : ''), 'Standard', opts).addEventListener('click', () => { delete d.skin[k]; renderLoadout(); });
    for (const id of owned) {
      const inf = S.skinInfo(id), n = invCount(id);
      const b = mk('button', 'opt skinopt' + (cur === inf.f ? ' sel' : ''), '', opts);
      mk('i', 'sw', '', b).style.background = finishCss(inf.F);
      b.appendChild(document.createTextNode(inf.F.n + (n > 1 ? ' ×' + n : '')));
      b.style.borderBottomColor = inf.rarity.c;
      b.addEventListener('click', () => { d.skin[k] = inf.f; renderLoadout(); });
    }
    mk('div', 'attdesc', cur ? S.FINISHES[cur].n + ' · ' + S.RARITY[S.FINISHES[cur].r].n : owned.length ? '' : 'Noch keine Skins für diese Waffe – gewinne eine Runde für ein Glückspaket!', right);
  }
  mk('h3', '', 'Werte: ' + WEAPONS[k].name, body);
  if (c) statBars(body, k, a);
  $('lpname').textContent = WEAPONS[k].name + (d.skin[k] ? ' | ' + S.FINISHES[d.skin[k]].n : '');
  $('lpatt').textContent = !c ? '' : S.ATT_SLOTS.map(s => ATT[s][a[s]].n).filter((n, i) => i === 0 || (n !== 'Keine' && n !== 'Keiner' && n !== 'Standard')).join(' · ');
}

// =================================================================== HUD
function announce(big, small, dur) {
  const el = $('msg'); el.textContent = big;
  if (small) mk('small', '', small, el);
  el.style.opacity = 1; fx.msgUntil = now() + (dur || 2);
}
function feed(k, v, w, hs, mine) {
  const d = mk('div', mine ? 'me' : '');
  const a = mk('span', '', k && k !== v ? k.name : '', d); if (k) a.style.color = k.css;
  mk('span', 'w', '[' + (w === 'he' ? 'HE' : (WEAPONS[w] ? WEAPONS[w].short : w)) + ']', d);
  if (hs) mk('span', 'hs', 'KOPF', d);
  const b = mk('span', '', v ? v.name : '?', d); if (v) b.style.color = v.css;
  const f = $('feed'); f.appendChild(d);
  while (f.children.length > 6) f.removeChild(f.firstChild);
  setTimeout(() => { if (d.parentNode) d.parentNode.removeChild(d); }, 6000);
}
function buildLadder() {
  const el = $('ladder'); el.textContent = '';
  el.style.display = mode === 'gungame' ? 'flex' : 'none';
  LADDER.forEach((k, i) => mk('span', i < me.lvl ? 'done' : i === me.lvl ? 'cur' : '', WEAPONS[k].short, el));
}
function renderSB() {
  const el = $('sb'); el.textContent = '';
  const h = mk('h2', '', MODES[mode].n.toUpperCase(), el);
  mk('span', '', players.size + ' Spieler · ' + MAPS[mapId].n + ' · ' + (mode === 'dm' ? 'Ziel: ' + dmLimit + ' Kills' : 'Ziel: Stufe ' + LADDER.length + ' + Messer-Kill'), h);
  const tb = mk('table', '', '', el), hr = mk('tr', '', '', tb);
  const cols = mode === 'dm' ? [['SPIELER', ''], ['KILLS', 'n'], ['TODE', 'n'], ['K/D', 'n'], ['PING', 'n']] : [['SPIELER', ''], ['STUFE', ''], ['KILLS', 'n'], ['TODE', 'n'], ['PING', 'n']];
  cols.forEach(c => mk('th', c[1], c[0], hr));
  [...players.values()].sort((a, b) => mode === 'dm' ? (b.kills - a.kills || a.deaths - b.deaths) : (b.lvl - a.lvl || b.kills - a.kills || a.deaths - b.deaths)).forEach(p => {
    const tr = mk('tr', (p.id === myId ? 'me ' : '') + (p.alive ? '' : 'dead'), '', tb);
    const n = mk('td', '', '', tr); mk('span', 'dot', '', n).style.background = p.css; n.appendChild(document.createTextNode(p.name + (p.alive ? '' : '  ✝')));
    const vals = mode === 'dm' ? [p.kills, p.deaths, (p.kills / Math.max(1, p.deaths)).toFixed(2), p.bot ? 'BOT' : p.ping] : [p.kills, p.deaths, p.bot ? 'BOT' : p.ping];
    if (mode !== 'dm') mk('td', 'lv', (p.lvl + 1) + ' · ' + WEAPONS[LADDER[p.lvl]].short, tr);
    vals.forEach(v => mk('td', 'n mono', String(v), tr));
  });
}
const hc = {}; let sbTimer = 0, fpsN = 0, fpsT = 0, fps = 0;
function setTxt(id, v) { if (hc[id] !== v) { hc[id] = v; $(id).textContent = v; } }
function setDisp(id, v) { if (hc['d' + id] !== v) { hc['d' + id] = v; $(id).style.display = v; } }
function setOp(id, v) { v = Math.round(v * 100) / 100; if (hc['o' + id] !== v) { hc['o' + id] = v; $(id).style.opacity = v; } }
function hud(t, dt) {
  const key = curKey(), w = key ? WEAPONS[key] : null, st = key ? stOf(key) : null, a = me.ads;
  if (hc.hp !== me.hp) { hc.hp = me.hp; $('hpnum').firstChild.nodeValue = Math.max(0, Math.round(me.hp)); const b = $('hpbar').firstElementChild; b.style.width = clamp(me.hp, 0, 100) + '%'; b.style.background = me.hp > 50 ? 'var(--green)' : me.hp > 25 ? 'var(--acc)' : 'var(--red)'; }
  const am = w ? (w.melee ? '–' : me.ammo[me.slot]) : me.nades[NADE_KEYS[me.slot - 3]];
  if (hc.am !== am) { hc.am = am; $('ammo').firstChild.nodeValue = am; }
  setTxt('wname', w ? w.name : NADES[NADE_KEYS[me.slot - 3]].name);
  setTxt('watt', w && !w.melee ? S.ATT_SLOTS.map(s => ATT[s][st.att[s]].n).filter((n, i) => i === 0 || (n !== 'Keine' && n !== 'Keiner' && n !== 'Standard')).join(' · ') : '');
  const ns = me.slot + ':' + me.nades.he + me.nades.flash + me.nades.smoke;
  if (hc.ns !== ns) { hc.ns = ns; [...$('nades').children].forEach((el, i) => { el.className = (me.slot === i + 3 ? 'sel ' : '') + (me.nades[NADE_KEYS[i]] > 0 ? '' : 'empty'); }); }
  setDisp('reload', me.reload && me.alive ? 'block' : 'none');
  // Fadenkreuz / Absehen
  const showCross = me.alive && gameState === 'play' && !(w && w.cls === 'sniper');
  setDisp('cross', showCross ? 'block' : 'none');
  setOp('cross', clamp(1 - a * 3, 0, 1));
  if (showCross) { const gap = Math.round(3 + Math.tan(me.spreadNow) / Math.tan(curFov * Math.PI / 360) * innerHeight / 2); if (hc.gap !== gap) { hc.gap = gap; $('cross').style.setProperty('--gap', gap + 'px'); } }
  const ov = overlayNow();
  setDisp('scope', ov && st.sight === 'scope' ? 'block' : 'none');
  setDisp('acog', ov && st.sight === 'acog' ? 'block' : 'none');
  setOp('rdot', me.alive && st && st.sight === 'reddot' ? clamp((a - 0.6) / 0.35, 0, 1) : 0);
  setOp('holo', me.alive && st && st.sight === 'holo' ? clamp((a - 0.6) / 0.35, 0, 1) : 0);
  fx.hit = Math.max(0, fx.hit - dt * 4); setOp('hit', fx.hit);
  fx.dmgNum = Math.max(0, fx.dmgNum - dt * 1.6); setOp('dmgnum', Math.min(1, fx.dmgNum * 2)); $('dmgnum').style.transform = 'translateY(' + (-(1 - fx.dmgNum) * 26) + 'px)';
  fx.vign = Math.max(me.alive && me.hp < 30 ? 0.3 : 0, fx.vign - dt * 1.2); setOp('vign', fx.vign);
  fx.dir = Math.max(0, fx.dir - dt * 0.9); setOp('dmgdir', Math.min(1, fx.dir * 2));
  if (fx.dir > 0) $('dmgdir').style.transform = 'rotate(' + (-(fx.dirYaw - me.yaw)) + 'rad)';
  const fl = me.alive ? clamp((me.flashUntil - t) / (me.flashDur * 0.55), 0, 1) : 0; setOp('flash', fl);
  let so = 0; for (const s of smokes) { const d = Math.hypot(cam.p[0] - s.p[0], cam.p[1] - s.p[1], cam.p[2] - s.p[2]); so = Math.max(so, clamp((NADES.smoke.radius - d) / 0.8, 0, 1) * smokeFade(s, t) * 0.94); }
  setOp('smokeov', so);
  if (t > fx.msgUntil) setOp('msg', Math.max(0, 1 - (t - fx.msgUntil) * 3));
  if (!me.alive && gameState === 'play' && me.everSpawned) setTxt('sub', LO.open ? '' : 'Respawn in ' + Math.max(0, 2.5 - (t - me.deadAt)).toFixed(1) + ' s');
  else setTxt('sub', t < me.protUntil && me.alive ? 'Spawnschutz' : '');
  if (gameState === 'end') { const c = $('wincd'); if (c) c.textContent = 'Nächste Runde in ' + Math.max(0, Math.ceil(fx.winUntil - t)) + ' s'; }
  let lead = null;
  for (const p of players.values()) if (!lead || (mode === 'dm' ? p.kills > lead.kills : (p.lvl > lead.lvl || (p.lvl === lead.lvl && p.kills > lead.kills)))) lead = p;
  const mine = players.get(myId), myKills = mine ? mine.kills : 0;
  setTxt('topbar', (mode === 'dm' ? 'Kills ' + myKills + '/' + dmLimit : 'Stufe ' + (me.lvl + 1) + '/' + LADDER.length) +
    (lead ? '   ·   Führt: ' + (lead.id === myId ? 'DU' : lead.name) + ' (' + (mode === 'dm' ? lead.kills + ' Kills' : 'Stufe ' + (lead.lvl + 1)) + ')' : ''));
  let tag = '';
  if (me.alive && fl < 0.3) {
    const e = eyePos(), b = basis(me.yaw, me.pitch); let bd = 0.045;
    for (const p of players.values()) {
      if (p.id === myId || !p.alive) continue;
      const c = [p.pos[0], p.pos[1] + 1.1, p.pos[2]], dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2], d = Math.hypot(dx, dy, dz);
      if (d > 70 || d < 0.1) continue;
      const ang = Math.acos(clamp((dx * b.f[0] + dy * b.f[1] + dz * b.f[2]) / d, -1, 1));
      if (ang < Math.max(bd, Math.atan(0.5 / d)) && S.losClear(e, c) && !inSmoke(e, c, t)) { bd = ang; tag = p.name + (mode === 'dm' ? '  ·  ' + p.kills + ' Kills' : '  ·  Stufe ' + (p.lvl + 1)); }
    }
  }
  if (hc.tag !== tag) { hc.tag = tag; const el = $('tag'); if (tag) el.textContent = tag; el.style.opacity = tag ? 1 : 0; }
  setDisp('sb', showSB && gameState !== 'end' ? 'block' : 'none');
  if (showSB && t > sbTimer) { sbTimer = t + 0.5; renderSB(); }
  if (LO.open) {
    const left = me.everSpawned ? Math.max(0, me.deadAt + 2.5 - t) : 0;
    setTxt('locount', LO.mode === 'edit' ? 'Esc = zurück' : gameState === 'end' ? 'Die Runde endet gleich …' : left > 0 ? 'Spawn möglich in ' + left.toFixed(1) + ' s' : 'Leertaste = Spawnen');
  }
  fpsN++; if (t - fpsT > 0.5) { fps = Math.round(fpsN / (t - fpsT)); fpsN = 0; fpsT = t; setTxt('stats', fps + ' FPS  ·  ' + Math.round(rtt) + ' ms'); }
}

// ============================================================== Rendern
function resize() {
  const dpr0 = window.devicePixelRatio || 1, dpr = SET.q === 'hoch' ? Math.min(dpr0, 2) : SET.q === 'mittel' ? Math.min(dpr0, 1) : 0.75;
  const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}
function viewMatrix(e, b) {
  const r = b.r, u = b.u, f = b.f;
  return new Float32Array([r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0,
    -(r[0] * e[0] + r[1] * e[1] + r[2] * e[2]), -(u[0] * e[0] + u[1] * e[1] + u[2] * e[2]), f[0] * e[0] + f[1] * e[1] + f[2] * e[2], 1]);
}
function remoteKey(p) { return p.slot >= 3 ? NADE_KEYS[p.slot - 3] : (S.slotWeapon(mode, p.lvl, p.lo, p.slot) || 'knife'); }
function drawPlayer(p, t) {
  const dead = !p.alive; let base;
  if (dead) {
    const age = t - p.deadAt; if (age > 3.5 || age < 0) return;
    const k = Math.min(1, age / 0.4);
    base = M.mul(M.mul(M.trans(p.pos[0], p.pos[1] + 0.13 * k, p.pos[2]), M.rotY(p.yaw)), M.rotX(k * k * 1.5));
  } else base = M.mul(M.trans(p.pos[0], p.pos[1], p.pos[2]), M.rotY(p.yaw));
  const cr = (p.fl & 1) && !dead, off = cr ? -0.5 : 0, em = t < p.protUntil && !dead ? 0.45 : 0;
  const hip = cr ? 0.3 : 0.76, sw = dead ? 0 : Math.sin(p.phase) * Math.min(1, p.speed / 5) * 0.75;
  for (const s of [-1, 1]) {
    const lm = M.mul(M.mul(base, M.trans(s * 0.11, hip, 0)), M.rotX(sw * s));
    drawBox(M.box(lm, 0, -hip / 2 + 0.06, 0, 0.17, hip - 0.1, 0.19, TMP), K.pants, em);
    drawBox(M.box(lm, 0, -hip + 0.06, -0.03, 0.19, 0.12, 0.26, TMP), K.dark, em);
  }
  drawBox(M.box(base, 0, 1.07 + off, 0, 0.46, 0.62, 0.25, TMP), p.col, em);
  drawBox(M.box(base, 0, 1.12 + off, 0, 0.5, 0.42, 0.3, TMP), K.vest, em);
  drawBox(M.box(base, -0.1, 1.05 + off, -0.16, 0.12, 0.14, 0.04, TMP), K.dark2, em);
  drawBox(M.box(base, 0.1, 1.05 + off, -0.16, 0.12, 0.14, 0.04, TMP), K.dark2, em);
  drawBox(M.box(base, 0, 1.1 + off, 0.2, 0.34, 0.38, 0.12, TMP), p.colD, em);
  drawBox(M.box(base, 0, 0.8 + off, 0, 0.48, 0.08, 0.27, TMP), K.dark, em);
  const pitch = dead ? 0 : p.pitch;
  const hm = M.mul(M.mul(base, M.trans(0, 1.4 + off, 0)), M.rotX(pitch * 0.6));
  drawBox(M.box(hm, 0, 0.17, 0, 0.26, 0.27, 0.26, TMP), K.skin, em);
  drawBox(M.box(hm, 0, 0.3, 0.01, 0.31, 0.12, 0.31, TMP), p.colD, em);
  drawBox(M.box(hm, 0, 0.245, -0.12, 0.3, 0.03, 0.08, TMP), p.colD, em);
  drawBox(M.box(hm, 0, 0.19, -0.135, 0.2, 0.05, 0.01, TMP), K.black, em);
  const rec = dead ? 0 : Math.max(0, 1 - (t - p.fireT) * 9) * 0.06;
  let am = M.mul(M.mul(base, M.trans(0, 1.3 + off, 0)), M.rotX(pitch));
  if (p.rl > 0.01) am = M.mul(M.mul(am, M.rotZ(0.5 * p.rl)), M.rotX(-0.35 * p.rl + Math.sin(t * 9) * 0.05 * p.rl));
  drawBox(M.box(am, -0.22, -0.04, -0.2 + rec, 0.11, 0.11, 0.46, TMP), p.col, em);
  drawBox(M.box(am, 0.2, -0.04, -0.24 + rec, 0.11, 0.11, 0.5, TMP), p.col, em);
  if (!dead) {
    const key = remoteKey(p);
    drawWeapon(M.mul(am, M.trans(0.1, -0.02, -0.5 + rec)), key, p.lo && p.lo.att[key], null, em, null, p.lo && p.lo.skin && p.lo.skin[key]);
  }
}
// Pose und Animation der eigenen Waffe
function vmPose(t) {
  const key = curKey(), mk_ = key || NADE_KEYS[me.slot - 3], G = GUN[mk_], st = key ? stOf(key) : null, w = key ? WEAPONS[key] : null;
  const P = { x: 0.16, y: -0.16, z: -0.4, rx: 0, ry: 0, rz: 0 }, an = {};
  let hand = key ? handPos(key, st && st.att) : null, gripHide = false;
  const a = smooth(me.ads);
  if (st && a > 0 && !w.melee) { P.x = lerp(P.x, 0, a); P.y = lerp(P.y, -sightY(key, st.sight) * VMS, a); P.z = lerp(P.z, -0.24 - sightZ(key, st.sight) * VMS, a); }
  const hs = Math.hypot(me.v[0], me.v[2]) / PLAYER.RUN, bobK = 1 - 0.85 * a;
  P.x += Math.sin(me.bob) * 0.008 * hs * bobK + me.swayX * (1 - 0.8 * a);
  P.y += Math.abs(Math.cos(me.bob)) * 0.009 * hs * bobK + me.swayY * (1 - 0.8 * a);
  if (!me.onGround) P.y += clamp(me.v[1] * 0.004, -0.03, 0.03) * bobK;
  const sw = smooth((t - me.switchT) / 0.3);
  P.y -= (1 - sw) * 0.3; P.rx -= (1 - sw) * 0.7;
  const kick = Math.max(0, 1 - (t - me.fireT) * 10);
  if (w && !w.melee) { P.z += 0.045 * kick * (1 - 0.5 * a) * (st ? st.recoil : 1); P.rx += 0.07 * kick * (1 - 0.6 * a); }
  // Schlitten bleibt hinten, wenn die Pistole leer ist
  if (key === 'pistol' && me.ammo[me.slot] === 0) an.slide = [0, 0, 0.035];
  else if (key === 'pistol' && kick > 0.4) an.slide = [0, 0, 0.035 * kick];
  // Repetieren
  if (w && (w.bolt || key === 'shotgun') && me.fireT > 0 && !me.reload) {
    const iv = 60 / w.rpm, ph = (t - me.fireT) / iv;
    if (ph > 0.2 && ph < 0.75) {
      const c = Math.sin(seg(ph, 0.2, 0.75) * Math.PI);
      if (key === 'shotgun') { an.pump = [0, 0, 0.1 * c]; if (hand) hand[2] += 0.1 * c; }
      else { an.bolt = [0, 0.01 * c, 0.07 * c]; P.rz += 0.12 * c * (1 - a); }
    }
  }
  const r = me.reload;
  if (r && r.kind === 'mag' && G) {
    const k = clamp((t - r.t0) / r.dur, 0, 1), u = k * (r.empty ? 1 : 0.76);
    const tin = smooth(seg(u, 0, 0.12)), tout = r.empty ? smooth(seg(u, 0.88, 1)) : smooth(seg(u, 0.66, 0.76)), tilt = tin * (1 - tout);
    P.rz += 0.62 * tilt; P.rx += 0.05 * tilt; P.ry += 0.25 * tilt; P.y += 0.06 * tilt; P.x -= 0.07 * tilt;
    let mdy = 0, hide = false;
    if (u >= 0.12 && u < 0.28) mdy = -0.42 * Math.pow(seg(u, 0.12, 0.28), 2);
    else if (u >= 0.28 && u < 0.44) hide = true;
    else if (u >= 0.44 && u < 0.62) mdy = -0.3 * (1 - smooth(seg(u, 0.44, 0.6)));
    if (hide) an.mag = 'hide'; else if (mdy) an.mag = [0, mdy, 0];
    const mb = G.magB, atMag = [0, mb[0] - 0.02 + (hide ? -0.45 : mdy), mb[1] + 0.01];
    const hk = u < 0.1 ? smooth(seg(u, 0.03, 0.1)) : u < 0.62 ? 1 : 1 - smooth(seg(u, 0.62, 0.72));
    if (hand) hand = lerp3(hand, atMag, hk); else hand = atMag;
    if (r.empty && u > 0.74 && u < 0.9) {
      const c = Math.sin(seg(u, 0.74, 0.9) * Math.PI);
      an.bolt = [0, 0, 0.06 * c]; P.rx += 0.06 * c; P.z += 0.02 * c;
    }
    if (key === 'pistol' && r.empty) an.slide = u < 0.8 ? [0, 0, 0.035] : [0, 0, 0.035 * (1 - seg(u, 0.8, 0.86))];
  } else if (r && r.kind === 'shell') {
    const up = smooth(seg(t - r.t0, 0, 0.3)), down = r.endAt ? smooth(seg(t, r.endAt - 0.4, r.endAt - 0.05)) : 0, tilt = up * (1 - down);
    P.rz -= 0.55 * tilt; P.rx += 0.12 * tilt; P.y -= 0.03 * tilt;
    const port = [0, G.magB[0] - 0.03, G.magB[1] + 0.02], low = [0.06, -0.32, 0.12];
    if (!r.endAt) {
      const ph = 1 - clamp((r.next - t) / r.per, 0, 1);
      const dn = ph < 0.4 ? smooth(ph / 0.4) : ph < 0.82 ? 1 - smooth((ph - 0.4) / 0.42) : 0;
      const hp = lerp3(port, low, dn); hp[2] -= ph > 0.82 ? (ph - 0.82) / 0.18 * 0.05 : 0;
      hand = lerp3(hand, hp, up);
    } else if (r.empty) {
      const c = Math.sin(seg(t, r.endAt - 0.33, r.endAt - 0.05) * Math.PI);
      an.pump = [0, 0, 0.1 * c]; if (hand) hand[2] += 0.1 * c;
    }
  } else if (r && r.kind === 'cyl') {
    const k = clamp((t - r.t0) / r.dur, 0, 1);
    const open = smooth(seg(k, 0.05, 0.18)) * (1 - smooth(seg(k, 0.78, 0.88)));
    an.cyl = [-0.058 * open, 0, 0];
    const up = smooth(seg(k, 0.18, 0.28)) * (1 - smooth(seg(k, 0.36, 0.46)));
    P.rx += 0.8 * up; P.rz += 0.35 * open; P.y += 0.04 * open; P.x -= 0.04 * open;
    const cylP = G.cylC ? [-0.07, G.cylC[1], G.cylC[2]] : [-0.07, 0.028, 0.02], low = [-0.05, -0.3, 0.1];
    const hk = smooth(seg(k, 0.4, 0.58)) * (1 - smooth(seg(k, 0.72, 0.8)));
    hand = lerp3(hand, lerp3(low, cylP, hk), smooth(seg(k, 0.36, 0.45)) * (1 - smooth(seg(k, 0.8, 0.92))));
  }
  if (key === 'knife') {
    const k = (t - me.swingT) / 0.28; hand = null;
    if (k >= 0 && k < 1) { const s = Math.sin(k * Math.PI); P.ry = s * 1.1; P.x -= s * 0.2; P.z -= s * 0.18; P.rz = -s * 0.6; }
    P.x += 0.04;
  }
  if (!key) {
    const k = (t - me.throwT) / 0.3;
    if (k >= 0 && k < 1.2) { P.z -= Math.sin(clamp(k, 0, 1) * Math.PI) * 0.3; P.y += k * 0.1; if (k > 0.35) gripHide = true; }
    P.y += 0.02;
  }
  return { key, mk: mk_, G, st, P, an, hand, hide: gripHide };
}
function drawArm(m, hp, sleeve, right) {
  drawBox(M.box(m, hp[0], hp[1], hp[2], 0.06, 0.06, 0.08, TMP), K.glove);
  drawBox(M.box(m, hp[0] + (right ? 0.012 : -0.07), hp[1] - (right ? 0.06 : 0.05), hp[2] + (right ? 0.2 : 0.17), 0.075, 0.075, right ? 0.34 : 0.32, TMP), sleeve);
}
function drawViewmodel(t, camW, lenses) {
  if (!me.alive || overlayNow()) return null;
  const V = vmPose(t), P = V.P;
  if (V.hide || !V.G) return null;
  let m = M.mul(camW, M.trans(P.x, P.y, P.z));
  if (P.rx) m = M.mul(m, M.rotX(P.rx)); if (P.ry) m = M.mul(m, M.rotY(P.ry)); if (P.rz) m = M.mul(m, M.rotZ(P.rz));
  m = M.box(m, 0, 0, 0, VMS, VMS, VMS);
  const att = V.st ? V.st.att : null;
  drawWeapon(m, V.mk, att, V.an, 0, lenses, me.lo.skin && me.lo.skin[V.mk]);
  const mine = players.get(myId), sleeve = mine ? mine.col : K.dark2, gr = V.G.grip || [-0.05, 0.03];
  drawArm(m, [0, gr[0], gr[1]], sleeve, true);
  if (V.hand) drawArm(m, V.hand, sleeve, false);
  if (V.key && V.key !== 'knife' && t - fx.vmFlash < 0.045 && !V.st.sup) return M.pt(m, 0, V.G.muz[0], muzzleZ(V.key, att) - 0.05);
  return null;
}
function drawPreview(t, camW, asp, lenses) {
  if (!LO.open || innerWidth < 900) return;
  const k = LO.edit, a = LO.draft.att[k];
  const ds = 1.0, x = Math.tan(28 * Math.PI / 180) * ds * asp * 0.42;
  let m = M.mul(camW, M.trans(x, -0.04, -ds));
  m = M.mul(m, M.rotY(-Math.PI / 2 + Math.sin(t * 0.6) * 0.45));
  m = M.mul(m, M.rotX(0.12));
  let [z0, z1] = gunZR(k);
  z0 = Math.min(z0, muzzleZ(k, a));
  const sc = clamp(0.5 / (z1 - z0), 0.4, 1.3);
  m = M.box(m, 0, 0, -(z0 + z1) / 2 * sc, sc, sc, sc);
  drawWeapon(m, k, a, null, 0, lenses, LO.draft.skin && LO.draft.skin[k]);
}
// Glückspaket: Kiste bzw. gezogene Waffe groß in der Bildmitte
function drawShowcase(t, camW, lenses) {
  let m = M.mul(camW, M.trans(0, 0.1, -1.05));
  if (PK.phase !== 'done') {
    const shake = PK.phase === 'spin' ? Math.sin(t * 40) * 0.02 * (1 - clamp((t - PK.t0) / PK.dur, 0, 1)) : 0;
    m = M.mul(M.mul(m, M.rotY(t * 0.8 + shake * 4)), M.rotX(0.25 + Math.sin(t * 1.3) * 0.06 + shake));
    const gold = [1, 0.78, 0.25];
    drawBox(M.box(m, 0, 0, 0, 0.34, 0.22, 0.22, TMP), [0.14, 0.15, 0.18], 0, 1, 14);
    drawBox(M.box(m, 0, 0.115, 0, 0.36, 0.02, 0.24, TMP), [0.2, 0.21, 0.25], 0, 1, 14);
    for (const x of [-0.12, 0.12]) drawBox(M.box(m, x, 0, 0, 0.03, 0.235, 0.235, TMP), gold, 0, 1, 14);
    drawBox(M.box(m, 0, 0, 0, 0.345, 0.03, 0.235, TMP), gold, 0, 1, 14);
    drawBox(M.box(m, 0, 0.02, -0.115, 0.06, 0.07, 0.02, TMP), [1, 0.9, 0.5], 0.8);
    return;
  }
  const inf = S.skinInfo(PK.item); if (!inf) return;
  const k = inf.w, a = savedLo.att[k] || null;
  const [z0, z1] = gunZR(k);
  const sc = clamp(0.62 / (z1 - z0), 0.4, 1.6), age = t - PK.doneAt, pop = 0.6 + 0.4 * smooth(age / 0.5);
  m = M.mul(m, M.rotY(-Math.PI / 2 + Math.sin(t * 0.7) * 0.5));
  m = M.mul(m, M.rotX(0.1));
  m = M.box(m, 0, 0, -(z0 + z1) / 2 * sc * pop, sc * pop, sc * pop, sc * pop);
  drawWeapon(m, k, a, null, 0, lenses, inf.f);
}
let lastT = now(), curFov = SET.fov;
function frame() {
  requestAnimationFrame(frame);
  const t = now(); let dt = t - lastT; lastT = t; if (dt > 0.05) dt = 0.05; if (dt <= 0) return;
  // --- Simulation
  for (const p of players.values()) {
    if (p.id === myId) { p.pos = me.p; p.yaw = me.yaw; p.alive = me.alive; continue; }
    const s = p.snaps, rt = t - 0.1;
    while (s.length > 2 && s[1].t <= rt) s.shift();
    if (s.length && p.alive) {
      const a = s[0], b = s[1] || s[0], k = b.t > a.t ? clamp((rt - a.t) / (b.t - a.t), 0, 1) : 1;
      p.pos = [lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k)];
      let dy = b.yaw - a.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
      p.yaw = a.yaw + dy * k; p.pitch = lerp(a.pitch, b.pitch, k); p.fl = b.fl; p.slot = b.slot;
      p.rl = clamp(p.rl + ((p.fl & 8) ? 5 : -5) * dt, 0, 1);
      if (p.prev) { const sp = Math.hypot(p.pos[0] - p.prev[0], p.pos[2] - p.prev[2]) / dt; p.speed = lerp(p.speed, sp, 0.2); const ph = p.phase; p.phase += p.speed * dt * 2.1; if (p.speed > 4.2 && Math.floor(ph / Math.PI) !== Math.floor(p.phase / Math.PI)) Snd.step(p.pos, 0.3); }
      p.prev = p.pos;
    }
  }
  if (joined) {
    if (me.alive && gameState === 'play') moveMe(t, dt); else me.v = [0, 0, 0];
    weaponTick(t, dt);
    netSend(t);
    if (!me.alive && me.loAt && t >= me.loAt && !PK.open) { me.loAt = 0; if (!LO.open) openLoadout('spawn'); }
    if (PK.open) packTick(t);
    if (softLock && locked) { const e = 0.12; let r = 0; if (mouseX < e) r = (e - mouseX) / e; else if (mouseX > 1 - e) r = -(mouseX - (1 - e)) / e; me.yaw += r * 2.6 * dt; }
  }
  me.swayX *= Math.exp(-dt * 8); me.swayY *= Math.exp(-dt * 8);
  for (let i = nades.length - 1; i >= 0; i--) { const n = nades[i], b0 = n.bounced; S.stepNade(n, dt); if (n.bounced !== b0) Snd.bounce(n.p); if (t - n.t0 > 4) nades.splice(i, 1); }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } p.v[1] -= p.g * dt; p.p[0] += p.v[0] * dt; p.p[1] += p.v[1] * dt; p.p[2] += p.v[2] * dt; }
  if (parts.length > 500) parts.splice(0, parts.length - 500);
  stepObjs(dt);
  for (let i = smokes.length - 1; i >= 0; i--) if (t - smokes[i].t0 > NADES.smoke.duration) smokes.splice(i, 1);
  me.shake = Math.max(0, me.shake - dt * 2.2);

  // --- Kamera
  resize();
  const W = canvas.width, H = canvas.height, asp = W / H;
  let eye, yaw, pitch;
  const key = curKey(), st = key && me.alive ? stOf(key) : null;
  curFov = SET.fov / (st ? lerp(1, st.zoom, smooth(me.ads)) : 1);
  if (joined && me.everSpawned) {
    if (me.alive) { eye = eyePos(); yaw = me.yaw; pitch = me.pitch; }
    else {
      const age = t - me.deadAt, k = smooth(age / 0.8);
      eye = [me.p[0], me.p[1] + lerp(me.eyeH, 0.45, k), me.p[2]];
      const kp = players.get(me.killerId);
      if (kp && kp.id !== myId && kp.alive) { let ty = Math.atan2(-(kp.pos[0] - me.p[0]), -(kp.pos[2] - me.p[2])) - me.yaw; while (ty > Math.PI) ty -= 2 * Math.PI; while (ty < -Math.PI) ty += 2 * Math.PI; me.yaw += ty * Math.min(1, dt * 3); }
      yaw = me.yaw; pitch = lerp(me.pitch, 0.1, k);
    }
    yaw += (Math.random() - 0.5) * me.shake * 0.05; pitch += (Math.random() - 0.5) * me.shake * 0.05;
  } else { const a = t * 0.05, R = MAP.HX * 0.9; eye = [Math.sin(a) * R, MAP.HX * 0.42, Math.cos(a) * R * 0.85]; yaw = a; pitch = -0.38; }
  const b = basis(yaw, pitch), fovR = curFov * Math.PI / 180;
  cam.p = eye; cam.r = b.r; cam.yaw = yaw; cam.pitch = pitch;
  const proj = M.persp(fovR, asp, 0.06, 500), view = viewMatrix(eye, b), vp = M.mul(proj, view);
  const env = MAP.env, sun = env.sun;
  const flashI = Math.max(0, 1 - (t - fx.lightT) / 0.07) * fx.lightI;
  // --- Schattenpass
  const shadows = SH.on && SET.q !== 'niedrig';
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
  if (shadows) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, SH.fb); gl.viewport(0, 0, SH.size, SH.size);
    gl.clearColor(1, 1, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(PSH.p); curProg = PSH;
    gl.uniformMatrix4fv(PSH.u.uL, false, SH.L); gl.uniformMatrix4fv(PSH.u.uM, false, IDENT);
    gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf);
    gl.enableVertexAttribArray(0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
    gl.drawArrays(gl.TRIANGLES, 0, solidVerts);
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    for (const p of players.values()) if (p.id !== myId || !me.alive) { if (p.id === myId) continue; drawPlayer(p, t); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  gl.viewport(0, 0, W, H);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  // --- Himmel
  gl.disable(gl.DEPTH_TEST); gl.useProgram(PS.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.enableVertexAttribArray(0); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const th = Math.tan(fovR / 2);
  gl.uniform3fv(PS.u.uF, b.f); gl.uniform3f(PS.u.uR, b.r[0] * th * asp, b.r[1] * th * asp, b.r[2] * th * asp); gl.uniform3f(PS.u.uU, b.u[0] * th, b.u[1] * th, b.u[2] * th);
  gl.uniform3fv(PS.u.uSun, sun); gl.uniform3fv(PS.u.uZ, env.skyZ); gl.uniform3fv(PS.u.uH, env.skyH); gl.uniform3fv(PS.u.uSC, env.sunC);
  gl.uniform1f(PS.u.uT, t); gl.uniform1f(PS.u.uCl, env.clouds);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // --- Welt
  gl.enable(gl.DEPTH_TEST); gl.useProgram(PW.p); curProg = PW; curEmis = curAlpha = -1;
  gl.uniformMatrix4fv(PW.u.uVP, false, vp); gl.uniformMatrix4fv(PW.u.uL, false, SH.L);
  gl.uniform3fv(PW.u.uCam, eye); gl.uniform3fv(PW.u.uSun, sun); gl.uniform3fv(PW.u.uSunCol, env.sunCol); gl.uniform3fv(PW.u.uAmbT, env.ambT); gl.uniform3fv(PW.u.uAmbB, env.ambB);
  gl.uniform3fv(PW.u.uFog, env.fog); gl.uniform1f(PW.u.uFogD, env.fogD); gl.uniform3fv(PW.u.uSkyZ, env.skyZ); gl.uniform3fv(PW.u.uSkyH, env.skyH);
  gl.uniform4f(PW.u.uFlash, fx.lightP[0], fx.lightP[1], fx.lightP[2], flashI);
  gl.uniform1f(PW.u.uShadowOn, shadows ? 1 : 0); gl.uniform1f(PW.u.uShade, 1); gl.uniform1f(PW.u.uSMS, shadows ? 0.75 / SH.size : 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, shadows ? SH.tex : null); gl.uniform1i(PW.u.uSM, 0);
  gl.uniformMatrix4fv(PW.u.uM, false, IDENT); gl.uniform1f(PW.u.uEmis, 0); gl.uniform1f(PW.u.uAlpha, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, worldBuf); gl.enableVertexAttribArray(1); gl.enableVertexAttribArray(2); gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 44, 12);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 44, 24); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 44, 36);
  gl.drawArrays(gl.TRIANGLES, 0, allVerts);
  // --- bewegliche Objekte
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  curEmis = curAlpha = -1;
  for (const p of players.values()) if (p.id !== myId) drawPlayer(p, t);
  for (let i = 0; i < items.length; i++) {
    if (!items[i] || !MAP.items[i]) continue; const ip = MAP.items[i];
    const m = M.mul(M.trans(ip[0], ip[1] + 0.45 + Math.sin(t * 2 + i) * 0.08, ip[2]), M.rotY(t * 1.2));
    drawBox(M.box(m, 0, 0, 0, 0.42, 0.28, 0.42, TMP), [0.95, 0.95, 0.95], 0.35);
    drawBox(M.box(m, 0, 0, 0, 0.3, 0.3, 0.1, TMP), [0.1, 0.75, 0.2], 0.6); drawBox(M.box(m, 0, 0, 0, 0.1, 0.3, 0.3, TMP), [0.1, 0.75, 0.2], 0.6);
    drawBox(M.box(m, 0, 0, 0, 0.44, 0.1, 0.1, TMP), [0.1, 0.75, 0.2], 0.6); drawBox(M.box(m, 0, 0, 0, 0.1, 0.1, 0.44, TMP), [0.1, 0.75, 0.2], 0.6);
  }
  for (const n of nades) { const m = M.mul(M.mul(M.trans(n.p[0], n.p[1], n.p[2]), M.rotY(n.spin + t * 9)), M.rotX(t * 7)); drawBox(M.box(m, 0, 0, 0, 0.12, 0.16, 0.12, TMP), NADE_COL[n.k], 0.1); }
  for (const o of objs) {
    const m = M.mul(M.mul(M.trans(o.p[0], o.p[1], o.p[2]), M.rotY(o.ry)), M.rotX(o.rx));
    if (o.mesh) { const c = GUN[o.mesh].magC; drawMesh(M.box(m, -c[0] * 1.1, -c[1] * 1.1, -c[2] * 1.1, 1.1, 1.1, 1.1, TMP), MD.guns[o.mesh].mag, 0, null); }
    else drawBox(M.box(m, 0, 0, 0, o.size[0], o.size[1], o.size[2], TMP), o.col, 0, 1, 14);
  }
  for (const d of decals) drawBox(M.box(IDENT, d.p[0], d.p[1], d.p[2], d.ax === 0 ? 0.012 : 0.07, d.ax === 1 ? 0.012 : 0.07, d.ax === 2 ? 0.012 : 0.07, TMP), K.black, 0.8);
  // Leuchtspuren
  const beam = (a, d, len, wd, col, alpha) => {
    let ux = -d[2], uz = d[0]; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
    const vx = d[1] * uz, vy = d[2] * ux - d[0] * uz, vz = -d[1] * ux;
    TMP.set([ux * wd, 0, uz * wd, 0, vx * wd, vy * wd, vz * wd, 0, d[0] * len, d[1] * len, d[2] * len, 0, a[0] + d[0] * len / 2, a[1] + d[1] * len / 2, a[2] + d[2] * len / 2, 1]);
    drawBox(TMP, col, 1, alpha);
  };
  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i], head = (t - tr.t0) * 260, tail = Math.max(0, head - 9);
    if (tail >= tr.len) { tracers.splice(i, 1); continue; }
    const h2 = Math.min(head, tr.len);
    beam([tr.a[0] + tr.d[0] * tail, tr.a[1] + tr.d[1] * tail, tr.a[2] + tr.d[2] * tail], tr.d, h2 - tail, 0.014, [1, 0.9, 0.55], 1);
  }
  // Laser
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
  const dots = [];
  const laserFrom = (o, d) => {
    const h = S.rayBoxes(o[0], o[1], o[2], d[0], d[1], d[2], 80); let L = h ? h.t : 80;
    for (const p of players.values()) { if (!p.alive || (p.id === myId)) continue; const r = S.rayPlayer(o[0], o[1], o[2], d[0], d[1], d[2], p.pos, p.fl & 1); if (r && r.t < L && r.t > 0.3) L = r.t; }
    beam(o, d, L, 0.006, [1, 0.1, 0.06], 0.55);
    if (L < 80) dots.push({ p: [o[0] + d[0] * L - d[0] * 0.03, o[1] + d[1] * L - d[1] * 0.03, o[2] + d[2] * L - d[2] * 0.03], s: 0.05, c: [1, 0.15, 0.1], a: 1, soft: 0.1, add: true });
  };
  if (me.alive && st && st.laser && me.slot <= 1 && !me.reload && joined) { const bb = basis(me.yaw, me.pitch); laserFrom(vmWorldPos(0.55, 0.13 * (1 - me.ads), 0.16 * (1 - me.ads) + 0.06 * me.ads), bb.f); }
  for (const p of players.values()) {
    if (p.id === myId || !p.alive || p.slot > 1) continue;
    const k = remoteKey(p); if (!WEAPONS[k] || WEAPONS[k].melee || !p.lo || !stOf(k, p.lo).laser || p.rl > 0.3) continue;
    const bb = basis(p.yaw, p.pitch), g = gunPos(p); laserFrom([g[0] - bb.u[0] * 0.05, g[1] - bb.u[1] * 0.05, g[2] - bb.u[2] * 0.05], bb.f);
  }
  // Partikel / Rauch
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const bb = dots;
  for (const p of parts) { const k = 1 - p.life / p.max; bb.push({ p: p.p, s: lerp(p.s0, p.s1, k), c: p.c, a: p.a * (1 - k * k), soft: p.soft, add: p.add }); }
  for (const s of smokes) {
    const age = t - s.t0, grow = Math.min(1, age / 1.3), fade = smokeFade(s, t);
    for (const q of s.puffs) bb.push({ p: [s.p[0] + q.o[0] * grow + Math.sin(t * 0.4 + q.ph) * 0.15, s.p[1] + q.o[1] * grow, s.p[2] + q.o[2] * grow + Math.cos(t * 0.35 + q.ph) * 0.15], s: q.s * (0.35 + 0.65 * grow), c: [q.c, q.c + 0.01, q.c - 0.01], a: 0.9 * fade, soft: 0.45 });
  }
  if (bb.length) {
    for (const q of bb) q.d = (q.p[0] - eye[0]) * b.f[0] + (q.p[1] - eye[1]) * b.f[1] + (q.p[2] - eye[2]) * b.f[2];
    bb.sort((x, y) => y.d - x.d);
    drawBillboards(bb, vp, b);
  }
  // --- eigene Waffe bzw. Vorschau im Loadout
  if (joined) {
    gl.disable(gl.BLEND); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.useProgram(PW.p); curProg = PW;
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    const vmFov = (56 - 10 * smooth(me.ads)) * Math.PI / 180, vmVP = M.mul(M.persp(vmFov, asp, 0.02, 10), view);
    gl.uniformMatrix4fv(PW.u.uVP, false, vmVP); curEmis = curAlpha = -1;
    // Liegt die eigene Position im Schatten? (CPU-Strahl Richtung Sonne)
    const inShade = S.rayBoxes(eye[0], eye[1], eye[2], sun[0], sun[1], sun[2], 120) ? 0.3 : 1;
    me.vmShade = lerp(me.vmShade, inShade, Math.min(1, dt * 6));
    gl.uniform1f(PW.u.uShadowOn, 0); gl.uniform1f(PW.u.uShade, LO.open || PK.open ? 1 : me.vmShade); gl.uniform1f(PW.u.uFogD, 0);
    const camW = new Float32Array([b.r[0], b.r[1], b.r[2], 0, b.u[0], b.u[1], b.u[2], 0, -b.f[0], -b.f[1], -b.f[2], 0, eye[0], eye[1], eye[2], 1]);
    const lenses = [];
    if (PK.open) drawShowcase(t, camW, lenses);
    else if (LO.open) drawPreview(t, camW, asp, lenses);
    const mz = LO.open || PK.open ? null : drawViewmodel(t, camW, lenses);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    for (const L of lenses) drawBox(L, [0.45, 0.65, 0.8], 0, 0.22, 9);
    if (mz) drawBillboards([{ p: mz, s: 0.07 + Math.random() * 0.04, c: [1, 0.85, 0.45], a: 0.95, soft: 0.15, add: true }], vmVP, b);
    hud(t, dt);
  }
  gl.depthMask(true);
}
function drawBillboards(list, vp, b) {
  gl.useProgram(PB.p);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.disableVertexAttribArray(1); gl.disableVertexAttribArray(2); gl.disableVertexAttribArray(3);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(PB.u.uVP, false, vp); gl.uniform3fv(PB.u.uR, b.r); gl.uniform3fv(PB.u.uU, b.u);
  let add = null;
  for (const q of list) {
    if (!!q.add !== add) { add = !!q.add; gl.blendFunc(gl.SRC_ALPHA, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA); }
    gl.uniform3fv(PB.u.uC, q.p); gl.uniform1f(PB.u.uS, q.s); gl.uniform4f(PB.u.uCol, q.c[0], q.c[1], q.c[2], q.a); gl.uniform1f(PB.u.uSoft, q.soft);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(PW.p); curProg = PW;
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf); gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
}
let lastSend = 0;
function netSend(t) {
  if (!me.alive || t - lastSend < 1 / 30) return;
  lastSend = t;
  const r = v => Math.round(v * 100) / 100;
  send({ t: 's', p: [r(me.p[0]), r(me.p[1]), r(me.p[2])], y: Math.round(me.yaw * 1000) / 1000, x: Math.round(me.pitch * 1000) / 1000, f: (me.crouch ? 1 : 0) | (me.ads > 0.5 ? 2 : 0) | (me.onGround ? 0 : 4) | (me.reload ? 8 : 0), w: me.slot });
}
window.addEventListener('error', e => { if (!joined) $('err').textContent = 'Fehler: ' + e.message; });

// Start
applyCfg('stadt', 'gungame', 25);
setupShadow();
loadModels().then(() => { if (MD.ok) { buildWorld(); setupLight(); } });
// Testzugriff für die Konsole
window.BF = { me, players, LO, PK, NET, SH, gl, PW, MD, GUN, verts: () => [solidVerts, allVerts], setT: (k, v) => { me[k] = v; }, state: () => ({ joined, gameState, locked, softLock, myId, mode, mapId }), send, debugLock(v) { setLocked(v); }, startReload, openLoadout, confirmLoadout, stOf, cam, startGame };
requestAnimationFrame(frame);
})();
