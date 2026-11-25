"""Kleiner glTF-2.0-Leser (.gltf mit data-URI/externer .bin und .glb) für die Asset-Aufbereitung.
   - static_tris(): alle Dreiecke einer Szene in Modellkoordinaten, Farben aus Textur (UV) bzw. Materialfarbe
   - skinned(): Bindepose + Gelenke + abgetastete Animationen (für die Zombies)"""
import json, struct, base64, os, io
import numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def lin2srgb(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(np.maximum(c, 0), 1 / 2.4) - 0.055)

class GLTF:
    def __init__(self, path):
        self.dir = os.path.dirname(path)
        raw = open(path, 'rb').read()
        if raw[:4] == b'glTF':
            ln = struct.unpack('<I', raw[12:16])[0]
            self.j = json.loads(raw[20:20 + ln])
            off = 20 + ln
            blen = struct.unpack('<I', raw[off:off + 4])[0]
            self.bufs = [raw[off + 8:off + 8 + blen]]
        else:
            self.j = json.loads(raw)
            self.bufs = [self._uri(b['uri']) for b in self.j['buffers']]
        self._img = {}

    def _uri(self, uri):
        if uri.startswith('data:'): return base64.b64decode(uri.split(',', 1)[1])
        return open(os.path.join(self.dir, uri), 'rb').read()

    def acc(self, i):
        a = self.j['accessors'][i]; bv = self.j['bufferViews'][a['bufferView']]
        dt = CT[a['componentType']]; n = NC[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0); isz = np.dtype(dt).itemsize * n
        buf = self.bufs[bv['buffer']]
        if stride and stride != isz:
            out = np.empty((a['count'], n), dtype=dt)
            for k in range(a['count']): out[k] = np.frombuffer(buf, dt, n, off + k * stride)
        else:
            out = np.frombuffer(buf, dt, a['count'] * n, off).reshape(a['count'], n).copy()
        if a.get('normalized'):
            out = out.astype(np.float64) / {np.uint8: 255, np.uint16: 65535, np.int8: 127, np.int16: 32767}[dt]
        return out

    def image(self, ti):
        tex = self.j['textures'][ti]; ii = tex['source']
        if ii not in self._img:
            im = self.j['images'][ii]
            data = self.bufs[self.j['bufferViews'][im['bufferView']]['buffer']][self.j['bufferViews'][im['bufferView']].get('byteOffset', 0):][:self.j['bufferViews'][im['bufferView']]['byteLength']] if 'bufferView' in im else self._uri(im['uri'])
            self._img[ii] = np.asarray(Image.open(io.BytesIO(data)).convert('RGB'), dtype=np.float64) / 255
        return self._img[ii]

    # ------------------------------------------------------------ Knoten
    def local(self, n, trs=None):
        node = self.j['nodes'][n]
        if trs is None and 'matrix' in node: return np.array(node['matrix'], dtype=np.float64).reshape(4, 4).T
        t, r, s = trs if trs else (node.get('translation', [0, 0, 0]), node.get('rotation', [0, 0, 0, 1]), node.get('scale', [1, 1, 1]))
        x, y, z, w = r
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M = np.eye(4); M[:3, :3] = R * np.array(s); M[:3, 3] = t
        return M

    def worlds(self, local_fn=None):
        W = {}; par = {}
        for i, n in enumerate(self.j['nodes']):
            for c in n.get('children', []): par[c] = i
        def w(i):
            if i in W: return W[i]
            L = local_fn(i) if local_fn else self.local(i)
            W[i] = (w(par[i]) @ L) if i in par else L
            return W[i]
        for i in range(len(self.j['nodes'])): w(i)
        return W

    # ------------------------------------------------- Farben je Vertex
    def colors(self, prim, uv_for):
        mat = self.j['materials'][prim['material']] if 'material' in prim else {}
        pbr = mat.get('pbrMetallicRoughness', {})
        fac = np.array(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3])
        return fac, pbr.get('baseColorTexture', {}).get('index')

    def prim_data(self, prim):
        a = prim['attributes']
        P = self.acc(a['POSITION']).astype(np.float64)
        I = self.acc(prim['indices']).reshape(-1).astype(np.int64) if 'indices' in prim else np.arange(len(P))
        fac, ti = self.colors(prim, None)
        col = np.tile(lin2srgb(fac), (len(P), 1))
        UV = self.acc(a['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in a else None
        if 'COLOR_0' in a:
            vc = self.acc(a['COLOR_0'])[:, :3].astype(np.float64)
            if vc.max() > 1.001: vc = vc / 255
            col = col * lin2srgb(vc)
        return P, I, UV, col, ti

    def sample(self, ti, uv):
        img = self.image(ti); h, w = img.shape[:2]
        x = (np.floor((uv[:, 0] % 1.0) * w).astype(int)) % w; y = (np.floor((uv[:, 1] % 1.0) * h).astype(int)) % h
        return img[y, x]

def static_tris(path):
    """Alle Dreiecke (N,3,3), Farben (N,3,3) sRGB – Texturen pro Dreiecksecke, leicht zur Mitte gezogen."""
    g = GLTF(path); W = g.worlds()
    TP, TC = [], []
    for ni, node in enumerate(g.j['nodes']):
        if 'mesh' not in node: continue
        M = W[ni]
        for prim in g.j['meshes'][node['mesh']]['primitives']:
            if prim.get('mode', 4) != 4: continue
            P, I, UV, col, ti = g.prim_data(prim)
            Pw = (np.c_[P, np.ones(len(P))] @ M.T)[:, :3]
            T = I.reshape(-1, 3)
            tri = Pw[T]
            if ti is not None and UV is not None:
                uvt = UV[T]; c = uvt.mean(axis=1, keepdims=True); uvs = uvt + (c - uvt) * 0.05
                tc = g.sample(ti, uvs.reshape(-1, 2)).reshape(-1, 3, 3) * col[T]
            else: tc = col[T]
            TP.append(tri); TC.append(tc)
    return np.concatenate(TP), np.clip(np.concatenate(TC), 0, 1)

def _quat_slerp(a, b, t):
    d = np.dot(a, b)
    if d < 0: b = -b; d = -d
    if d > 0.9995: q = a + (b - a) * t; return q / np.linalg.norm(q)
    th = np.arccos(d); s = np.sin(th)
    return (np.sin((1 - t) * th) * a + np.sin(t * th) * b) / s

def skinned(path, clips, fps=15):
    """Skinned-Mesh: Vertices (Bindepose), Normalen, Farben, Gelenk-Indizes (umnummeriert auf benutzte), Gewichte,
       Indizes, und je Clip die Gelenkmatrizen (3x4) pro Frame."""
    g = GLTF(path); j = g.j
    skin = j['skins'][0]; joints = skin['joints']
    IBM = g.acc(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1).astype(np.float64)
    Ps, Ns, Cs, Js, Ws, Is = [], [], [], [], [], []; base = 0
    for ni, node in enumerate(j['nodes']):
        if 'mesh' not in node or 'skin' not in node: continue
        for prim in j['meshes'][node['mesh']]['primitives']:
            P, I, UV, col, ti = g.prim_data(prim)
            a = prim['attributes']
            N = g.acc(a['NORMAL']).astype(np.float64)
            if ti is not None and UV is not None: col = g.sample(ti, UV) * col
            Jt = g.acc(a['JOINTS_0']).astype(np.int64); Wt = g.acc(a['WEIGHTS_0']).astype(np.float64)
            if Wt.max() > 1.001: Wt = Wt / 255
            Ps.append(P); Ns.append(N); Cs.append(col); Js.append(Jt); Ws.append(Wt); Is.append(I + base); base += len(P)
    P = np.concatenate(Ps); N = np.concatenate(Ns); C = np.clip(np.concatenate(Cs), 0, 1); J = np.concatenate(Js); Wt = np.concatenate(Ws); I = np.concatenate(Is)
    Wt = Wt / np.maximum(Wt.sum(1, keepdims=True), 1e-6)
    used = sorted(set(J[Wt > 1e-4].tolist())); remap = {u: k for k, u in enumerate(used)}
    J2 = np.vectorize(lambda x: remap.get(x, 0))(J); Wt[np.vectorize(lambda x: x not in remap)(J)] = 0
    anims = {a['name']: a for a in j.get('animations', [])}
    out = {}
    for name, (clip, loop) in clips.items():
        an = anims.get(clip)
        if not an: continue
        ch = {}
        for c in an['channels']:
            s = an['samplers'][c['sampler']]
            ch[(c['target']['node'], c['target']['path'])] = (g.acc(s['input']).reshape(-1), g.acc(s['output']).astype(np.float64), s.get('interpolation', 'LINEAR'))
        dur = max(v[0][-1] for v in ch.values())
        n = max(2, int(round(dur * fps)) + (0 if loop else 1))
        frames = []
        for f in range(n):
            t = min(dur, f / fps) if not loop else (f / n) * dur
            def lf(i):
                node = j['nodes'][i]
                trs = [list(node.get('translation', [0, 0, 0])), list(node.get('rotation', [0, 0, 0, 1])), list(node.get('scale', [1, 1, 1]))]
                if 'matrix' in node and not any((i, p) in ch for p in ('translation', 'rotation', 'scale')): return g.local(i)
                for k, p in enumerate(('translation', 'rotation', 'scale')):
                    if (i, p) not in ch: continue
                    ts, vs, interp = ch[(i, p)]
                    if interp == 'CUBICSPLINE': vs = vs.reshape(len(ts), 3, -1)[:, 1]
                    if t <= ts[0]: v = vs[0]
                    elif t >= ts[-1]: v = vs[-1]
                    else:
                        q = np.searchsorted(ts, t) - 1; u = (t - ts[q]) / max(ts[q + 1] - ts[q], 1e-9)
                        if interp == 'STEP': v = vs[q]
                        elif p == 'rotation': v = _quat_slerp(vs[q], vs[q + 1], u)
                        else: v = vs[q] + (vs[q + 1] - vs[q]) * u
                    trs[k] = list(v)
                return g.local(i, trs)
            Wm = g.worlds(lf)
            mats = np.array([(Wm[joints[u]] @ IBM[u])[:3, :] for u in used])  # (J,3,4)
            frames.append(mats)
        out[name] = {'frames': np.array(frames), 'loop': loop, 'dur': float(dur)}
    return {'P': P, 'N': N, 'C': C, 'J': J2, 'W': Wt, 'I': I, 'joints': len(used), 'clips': out}
