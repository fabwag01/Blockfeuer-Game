"""Rechnet die Asset-Pakete in ein kompaktes Format für BLOCKFEUER um.
   Aufruf: python3 tools/build_assets.py <Ultimate_Gun_Pack-Ordner> <kenney_city-kit-commercial-Ordner> assets
   Benötigt Python 3 und Pillow (pip install pillow).
   Ausgabe: assets/models.bin (Vertexdaten) + assets/models.json (Index, Waffen-Metadaten).
   Vertex (20 Byte): f32 x,y,z | i8 nx,ny,nz | u8 flag | u8 r,g,b | u8 0
   Waffen: Lauf zeigt nach -z, Ursprung am Griff, Länge in Spieleinheiten. Stadt: Originalmaße."""
import sys, json, struct, math, os, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gltflib import static_tris, skinned
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from objlib import load_obj, lin2srgb, components
from PIL import Image
if len(sys.argv) < 4: sys.exit(__doc__)
SRC_G = os.path.join(sys.argv[1], 'OBJ') + '/'
SRC_C = os.path.join(sys.argv[2], 'Models') + '/'
OUT = sys.argv[3]
GUNS = {
  # file, Ziellänge, Griffpunkt (Originalkoordinaten x,y) bzw. Griff-Komponenten, Teile nach Komponenten,
  # handPt: linke Hand (Original x,y), railC: Komponenten der Montageschiene, irz: Augenabstand Kimme (Abstand Auge–Waffe beim Zielen)
  'pistol':   dict(file='Pistol_1', len=0.26, grip=[0], slide=[3, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18], railC=[7], twohand=[-0.012, -0.08, 0.075], irz=0.1),
  'revolver': dict(file='Revolver_2', len=0.30, grip=[0, 11], cyl=[2], railC=[5], twohand=[-0.012, -0.075, 0.07], irz=0.07),
  'smg':      dict(file='SubmachineGun_2', len=0.62, grip=[2], gripPt=[0.05, 0.1], mag=[5], handPt=[1.45, 0.42], railC=list(range(12, 24)), irz=0.1),
  'shotgun':  dict(file='Shotgun_3', len=1.0, gripPt=[0.12, -0.08], pump=[1], handPt=[2.1, -0.14], railC=[2], irz=0.06),
  'm4':       dict(file='AssaultRifle2_1', len=0.92, grip=[0], mag=[3], handPt=[1.75, 0.46], railC=list(range(10, 18)), irear=[9], irz=0.08),
  'ak':       dict(file='AssaultRifle_2', len=0.92, grip=[1], mag=[3], handPt=[1.95, 0.36], railC=[11], irz=0.11),
  'lmg':      dict(file='Bullpup_1', len=0.86, grip=[28], mag=[27], handPt=[2.03, 0.04], railC=list(range(2, 22)), irz=0.1),
  'scout':    dict(file='SniperRifle_6', len=1.15, gripPt=[0.0, -0.12], scope=[2], handPt=[1.6, 0.02], railC=list(range(3, 16)), irz=-0.05),
  'longbow':  dict(file='SniperRifle_3', len=1.3, gripPt=[0.05, -0.05], scope=[1], handPt=[1.7, 0.1], railC=list(range(2, 15)), irz=-0.06),
  'knife':    dict(file='Accessories/Bayonet', len=0.3, grip=[0]),
}
GRIP_OFF = (-0.055, 0.06)   # Griffpunkt liegt im Spiel bei y=-0.055, z=+0.06 (wie bei den Kastenmodellen)
ACC = { 'sup': 'Accessories/Silencer_1', 'vgrip': 'Accessories/Grip', 'laser': 'Accessories/Flashlight' }
NOSKIN = {'Black', 'Glass'}

verts = bytearray()
nverts = 0
def emit(tris, flagfn=None):
    """tris: Liste von (p0,p1,p2, color(sRGB 0..1), flag)"""
    global verts, nverts
    start = nverts
    for p0, p1, p2, col, flag in tris:
        ux, uy, uz = p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]
        vx, vy, vz = p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]
        n = [uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx]; l = math.sqrt(sum(c*c for c in n)) or 1
        n = [int(round(c/l*127)) for c in n]
        cols = col if isinstance(col[0], (list, tuple)) else [col, col, col]
        for p, c in zip((p0, p1, p2), cols):
            verts += struct.pack('<fffbbbBBBBB', p[0], p[1], p[2], n[0], n[1], n[2], flag, *[max(0, min(255, int(round(v*255)))) for v in c[:3]], 0)
            nverts += 1
    return [start, nverts - start]

def gun_tris(name, rot=True):
    V, tris, mats = load_obj(SRC_G + name + '.obj')
    comp, nc = components(V, tris)
    return V, tris, mats, comp

out = {'version': 2, 'guns': {}, 'acc': {}, 'city': {}}
R4 = lambda v: round(v, 4)
for key, cfg in GUNS.items():
    V, tris, mats, comp = gun_tris(cfg['file'])
    xs = [v[0] for v in V]; L = max(xs) - min(xs); s = cfg['len'] / L
    cb = {}
    for i, t in enumerate(tris):
        b = cb.setdefault(comp[i], [1e9, 1e9, 1e9, -1e9, -1e9, -1e9])
        for j in t[:3]:
            for k in range(3): b[k] = min(b[k], V[j][k]); b[k+3] = max(b[k+3], V[j][k])
    if 'gripPt' in cfg: gx, gy = cfg['gripPt']
    else:
        g = [cb[c] for c in cfg['grip']]
        x0 = min(b[0] for b in g); x1 = max(b[3] for b in g); y0 = min(b[1] for b in g); y1 = max(b[4] for b in g)
        gx, gy = (x0 + x1) / 2 + (x1 - x0) * 0.12, y1 - (y1 - y0) * 0.3
    OFF = (0.005, -0.03) if key == 'knife' else GRIP_OFF
    T = lambda v: [v[2] * s, (v[1] - gy) * s + OFF[0], -(v[0] - gx) * s + OFF[1]]
    part_of = {}
    for nm in ('mag', 'cyl', 'pump', 'slide', 'scope', 'irear'):
        for c in cfg.get(nm, []): part_of[c] = nm
    names = ('main', 'mag', 'cyl', 'pump', 'slide', 'scope', 'irear')
    groups = {n: [] for n in names}
    for i, t in enumerate(tris):
        mat = t[3]; col = lin2srgb(mats.get(mat, [0.3]*3))
        col = [min(1, c * 1.18 + 0.03) for c in col]
        flag = 0 if (mat in NOSKIN or mat.startswith('Black')) else 1
        groups[part_of.get(comp[i], 'main')].append((T(V[t[0]]), T(V[t[1]]), T(V[t[2]]), col, flag))
    parts = {}
    for nm in names:
        if groups[nm]: parts[nm] = emit(groups[nm])
    pts = lambda cs: [T(V[j]) for i, t in enumerate(tris) if comp[i] in cs for j in t[:3]]
    scope = set(cfg.get('scope', []))
    PV = [T(v) for v in V]
    nonscope = [T(V[j]) for i, t in enumerate(tris) if comp[i] not in scope for j in t[:3]]
    bb = [R4(min(p[k] for p in PV)) for k in range(3)] + [R4(max(p[k] for p in PV)) for k in range(3)]
    meta = {'bbox': bb, 'grip': [OFF[0], OFF[1]], 'scale': R4(s)}
    if key != 'knife':
        zmin = min(p[2] for p in nonscope)
        front = [p for p in nonscope if p[2] < zmin + 0.012]
        meta['muz'] = [R4(sum(p[1] for p in front) / len(front)), R4(zmin)]
        meta['sightY'] = R4(max(p[1] for p in nonscope))
        meta['irz'] = cfg['irz']
        rp = pts(set(cfg['railC']))
        meta['rail'] = [R4(max(p[1] for p in rp)), R4((min(p[2] for p in rp) + max(p[2] for p in rp)) / 2)]
        if scope:
            sp = pts(scope)
            meta['scopeY'] = R4((min(p[1] for p in sp) + max(p[1] for p in sp)) / 2)
        if 'twohand' in cfg:
            meta['hand'] = cfg['twohand']
            meta['under'] = [R4(meta['muz'][0] - 0.035), R4(meta['muz'][1] * 0.55 + GRIP_OFF[1] * 0.45)]
        else:
            hx, hy = cfg['handPt']; hp = T([hx, hy, 0])
            meta['under'] = [R4(hp[1]), R4(hp[2])]
            meta['hand'] = [0, R4(hp[1] - 0.025), R4(hp[2])]
        for nm in ('mag', 'pump', 'cyl'):
            if cfg.get(nm):
                mp = pts(set(cfg[nm]))
                c = [R4((min(p[k] for p in mp) + max(p[k] for p in mp)) / 2) for k in range(3)]
                meta[nm + 'C'] = c
                if nm == 'mag':
                    meta['magB'] = [R4(min(p[1] for p in mp)), c[2]]
                    meta['magSize'] = [R4(max(p[k] for p in mp) - min(p[k] for p in mp)) for k in range(3)]
                elif nm == 'pump': meta['magB'] = [R4(min(p[1] for p in mp)), R4(max(p[2] for p in mp) + 0.04)]
                else: meta['magB'] = [c[1], c[2]]
        if 'magB' not in meta: meta['magB'] = [R4(min(p[1] for p in nonscope if abs(p[2] - GRIP_OFF[1]) < 0.15) + 0.03), R4(GRIP_OFF[1] - 0.1)]
    out['guns'][key] = {'parts': parts, 'meta': meta}
    print(key.ljust(9), cfg['file'].ljust(22), {k: v[1] // 3 for k, v in parts.items()}, json.dumps(meta))

# Zubehör: Ursprung am Montagepunkt, in Originaleinheiten * 0.17 (wird je Waffe nachskaliert)
for key, f in ACC.items():
    V, tris, mats = load_obj(SRC_G + f + '.obj')
    xs = [v[0] for v in V]; ys = [v[1] for v in V]
    if key == 'sup': o = [min(xs), sum(ys) / len(ys), 0]; T = lambda v: [v[2], v[1] - o[1], -(v[0] - o[0])]
    elif key == 'vgrip': o = [(min(xs) + max(xs)) / 2, max(ys), 0]; T = lambda v: [v[2], v[1] - o[1], -(v[0] - o[0])]
    else: o = [(min(xs) + max(xs)) / 2, max(ys), 0]; T = lambda v: [v[2], v[1] - o[1], -(v[0] - o[0])]
    g = []
    for t in tris:
        col = [min(1, c * 1.18 + 0.03) for c in lin2srgb(mats.get(t[3], [0.3]*3))]
        g.append((T(V[t[0]]), T(V[t[1]]), T(V[t[2]]), col, 0))
    out['acc'][key] = emit(g)
    PV = [T(v) for v in V]
    out['acc'][key + '_box'] = [round(min(p[k] for p in PV), 4) for k in range(3)] + [round(max(p[k] for p in PV), 4) for k in range(3)]

# Stadt: GLB lesen, Textur pro Vertex abtasten (3 Farbvarianten)
texs = [Image.open(SRC_C + p).convert('RGB') for p in ('GLB format/Textures/colormap.png', 'Textures/variation-a.png', 'Textures/variation-b.png')]
TW, TH = texs[0].size
pix = [t.load() for t in texs]
def sample(k, u, v):
    x = int((u % 1.0) * TW) % TW; y = int((v % 1.0) * TH) % TH
    return [c / 255 for c in pix[k][x, y]]
def read_acc(j, b, ai):
    a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]
    off = 20 + struct.unpack('<I', b[12:16])[0] + 8 + bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    fmt = {5126: 'f', 5123: 'H', 5125: 'I', 5121: 'B'}[a['componentType']]
    sz = struct.calcsize(fmt); stride = bv.get('byteStride', sz * n)
    return [struct.unpack_from('<' + fmt * n, b, off + i * stride) for i in range(a['count'])]
varcols = [bytearray(), bytearray()]
city_start = nverts
import glob
for f in sorted(glob.glob(SRC_C + 'GLB format/*.glb')):
    name = os.path.basename(f)[:-4]
    if name.startswith('detail-awning') or name.startswith('detail-overhang'): continue
    b = open(f, 'rb').read(); ln = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + ln])
    node = j['nodes'][0]
    assert 'matrix' not in node and 'rotation' not in node, name
    tr = node.get('translation', [0, 0, 0]); sc = node.get('scale', [1, 1, 1])
    g = []; vc = [[], []]
    for p in j['meshes'][node['mesh']]['primitives']:
        P = [[v[k] * sc[k] + tr[k] for k in range(3)] for v in read_acc(j, b, p['attributes']['POSITION'])]
        UV = read_acc(j, b, p['attributes']['TEXCOORD_0'])
        I = [i[0] for i in read_acc(j, b, p['indices'])] if 'indices' in p else list(range(len(P)))
        for t in range(0, len(I), 3):
            ids = I[t:t + 3]
            cu = sum(UV[i][0] for i in ids) / 3; cv = sum(UV[i][1] for i in ids) / 3
            uvs = [(UV[i][0] + (cu - UV[i][0]) * 0.03, UV[i][1] + (cv - UV[i][1]) * 0.03) for i in ids]
            cols = [[sample(k, u, v) for (u, v) in uvs] for k in range(3)]
            g.append((P[ids[0]], P[ids[1]], P[ids[2]], cols[0], 0))
            vc[0].extend(cols[1]); vc[1].extend(cols[2])
    vb = len(varcols[0]) // 4
    rng = emit(g)
    for k in range(2):
        for c in vc[k]: varcols[k] += bytes([max(0, min(255, int(round(v * 255)))) for v in c] + [0])
    PV = [v for t in g for v in t[:3]]
    out['city'][name] = {'r': rng, 'vb': vb, 'min': [round(min(p[k] for p in PV), 4) for k in range(3)], 'max': [round(max(p[k] for p in PV), 4) for k in range(3)]}

# ------------------------------------------------ weitere Requisiten (optional, wenn Pakete angegeben)
# Aufruf mit zusätzlichen Ordnern: --zombie DIR --nature DIR --kaykit DIR --furniture DIR --roads DIR
import argparse, numpy as np
ap = argparse.ArgumentParser(); [ap.add_argument('--' + k) for k in ('zombie', 'nature', 'kaykit', 'furniture', 'roads')]
args = ap.parse_args(sys.argv[4:])
from objlib import load_obj
PROPS = {
  'zk': (args.zombie, 'Environment/glTF/{}.gltf', ['Barrel', 'Container_Red', 'Container_Green', 'Pallet', 'Pallet_Broken', 'TrafficCone_1', 'TrafficCone_2', 'TrafficBarrier_1',
         'PlasticBarrier', 'TrashBag_1', 'Wheels_Stack', 'Wheel', 'WaterTower', 'StreetLights', 'FireHydrant', 'CinderBlock', 'Blood_1', 'Blood_2', 'Blood_3'] ),
  'zv': (args.zombie, 'Vehicles/glTF/{}.gltf', ['Vehicle_Pickup', 'Vehicle_Sports', 'Vehicle_Truck']),
  'kk': (args.kaykit, 'Assets/gltf/{}.gltf', ['car_hatchback', 'car_police', 'car_sedan', 'car_stationwagon', 'car_taxi', 'trafficlight_B', 'dumpster', 'firehydrant']),
  'nt': (args.nature, 'OBJ/{}.obj', ['CommonTree_3', 'CommonTree_4', 'BirchTree_1', 'BirchTree_2', 'PineTree_1', 'PineTree_2', 'CommonTree_Dead_2', 'BirchTree_Dead_1',
         'Bush_1', 'Bush_2', 'Rock_1', 'Rock_2', 'Rock_3', 'Rock_Moss_2', 'Cactus_1', 'Cactus_2', 'Cactus_3', 'PalmTree_1', 'PalmTree_2', 'Flowers', 'Plant_1', 'Plant_2', 'TreeStump', 'WoodLog']),
  'fu': (args.furniture, 'Models/GLTF format/{}.glb', ['bedDouble', 'loungeSofa', 'tableCoffee', 'table', 'tableRound', 'chair', 'chairCushion', 'bookcaseOpen',
         'kitchenCabinet', 'kitchenFridgeLarge', 'kitchenStove', 'kitchenSink', 'kitchenBar', 'kitchenCoffeeMachine', 'computerScreen', 'televisionModern',
         'cabinetTelevision', 'lampSquareFloor', 'pottedPlant', 'rugRectangle', 'rugRound', 'stoolBar', 'trashcan', 'cardboardBoxClosed', 'cardboardBoxOpen']),
  'rd': (args.roads, 'Models/GLTF format/{}.glb', ['light_curved', 'construction_light']),
}
nprops = 0
for pre, (base, pat, names) in PROPS.items():
    if not base: continue
    for nm in names:
        path = os.path.join(base, pat.format(nm))
        if not os.path.exists(path): print('fehlt:', path); continue
        if path.endswith('.obj'):
            V, tris, mats = load_obj(path)
            TP = np.array([[V[t[0]], V[t[1]], V[t[2]]] for t in tris], dtype=np.float64)
            TC = np.array([[lin2srgb(mats.get(t[3], [0.5] * 3))] * 3 for t in tris], dtype=np.float64)
        else:
            TP, TC = static_tris(path)
        g = [(list(TP[i, 0]), list(TP[i, 1]), list(TP[i, 2]), [list(TC[i, 0]), list(TC[i, 1]), list(TC[i, 2])], 0) for i in range(len(TP))]
        rng = emit(g)
        out['city'][pre + ':' + nm] = {'r': rng, 'min': [round(float(v), 4) for v in TP.reshape(-1, 3).min(0)], 'max': [round(float(v), 4) for v in TP.reshape(-1, 3).max(0)]}
        nprops += len(TP)
print('weitere Requisiten: Dreiecke', nprops)
out['cityStart'] = city_start; out['cityCount'] = nverts - city_start
out['nverts'] = nverts
out['varOffset'] = [len(verts), len(verts) + len(varcols[0])]
os.makedirs(OUT, exist_ok=True)
open(OUT + '/models.bin', 'wb').write(bytes(verts) + bytes(varcols[0]) + bytes(varcols[1]))
# ------------------------------------------- animierte Zombies (Skinning, eigene Datei zombies.bin)
if args.zombie:
    ZD = os.path.join(args.zombie, 'Characters/glTF/')
    ZM = { # Typ: Modell, Zielhöhe (m), Clips
      'basic':   ('Zombie_Basic', 1.78, {'walk': ('Walk', True), 'run': ('Run', True), 'attack': ('Punch', True), 'death': ('Death', False), 'hit': ('HitReact', False)}),
      'chubby':  ('Zombie_Chubby', 1.82, {'walk': ('Walk', True), 'run': ('Run', True), 'attack': ('Punch', True), 'death': ('Death', False), 'hit': ('HitReact', False)}),
      'ribcage': ('Zombie_Ribcage', 1.62, {'walk': ('Walk', True), 'run': ('Run', True), 'attack': ('Run', True), 'death': ('Death', False), 'hit': ('HitReact', False)}),
      'arm':     ('Zombie_Arm', 2.4, {'walk': ('Walk', True), 'run': ('Run', True), 'attack': ('Punch', True), 'death': ('Death', False), 'hit': ('HitReact', False)}),
    }
    zb = bytearray(); zj = {}
    for k, (fn, height, clips) in ZM.items():
        s = skinned(ZD + fn + '.gltf', clips, fps=15)
        P = s['P']; sc = height / (P[:, 1].max() - P[:, 1].min())
        while len(zb) % 4: zb += b'\0'
        vo = len(zb)
        for i in range(len(P)):
            n = s['N'][i] / (np.linalg.norm(s['N'][i]) or 1)
            zb += struct.pack('<fffbbbBBBBB', *[float(v) for v in P[i]], *[int(round(v * 127)) for v in n], 0, *[max(0, min(255, int(round(v * 255)))) for v in s['C'][i]], 0)
            zb += bytes([int(v) for v in s['J'][i]]) + bytes([max(0, min(255, int(round(v * 255)))) for v in s['W'][i]])
        io_ = len(zb); zb += s['I'].astype('<u2').tobytes()
        while len(zb) % 4: zb += b'\0'
        cl = {}
        for cn, c in s['clips'].items():
            co = len(zb); zb += c['frames'].astype('<f4').tobytes()
            cl[cn] = {'o': co, 'n': int(c['frames'].shape[0]), 'loop': c['loop'], 'fps': 15}
        zj[k] = {'vo': vo, 'nv': len(P), 'io': io_, 'ni': int(len(s['I'])), 'nj': s['joints'], 'scale': round(sc, 5), 'clips': cl}
        print('Zombie', k, 'Vertices', len(P), 'Gelenke', s['joints'], {cn: c['n'] for cn, c in cl.items()})
    open(OUT + '/zombies.bin', 'wb').write(bytes(zb))
    out['zombies'] = zj
    print('zombies.bin', len(zb) // 1024, 'KB')
json.dump(out, open(OUT + '/models.json', 'w'), separators=(',', ':'))
print('Vertices', nverts, 'Stadt', nverts - city_start, 'Datei', os.path.getsize(OUT + '/models.bin') // 1024, 'KB')
