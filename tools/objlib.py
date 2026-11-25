import re, math
def lin2srgb(c):
    return [ (12.92*v if v <= 0.0031308 else 1.055*v**(1/2.4)-0.055) for v in c ]
def load_mtl(path):
    mats, cur = {}, None
    for line in open(path):
        p = line.split()
        if not p: continue
        if p[0] == 'newmtl': cur = p[1]; mats[cur] = [0.5,0.5,0.5]
        elif p[0] == 'Kd' and cur: mats[cur] = [float(x) for x in p[1:4]]
    return mats
def load_obj(path):
    V, tris = [], []   # tris: (i0,i1,i2, mat)
    mats = {}
    mat = None
    for line in open(path):
        p = line.split()
        if not p: continue
        if p[0] == 'mtllib': mats = load_mtl(path.rsplit('/',1)[0] + '/' + p[1])
        elif p[0] == 'v': V.append([float(x) for x in p[1:4]])
        elif p[0] == 'usemtl': mat = p[1]
        elif p[0] == 'f':
            idx = [int(t.split('/')[0]) - 1 for t in p[1:]]
            for k in range(1, len(idx)-1): tris.append((idx[0], idx[k], idx[k+1], mat))
    return V, tris, mats
def components(V, tris):
    # Dreiecke über gemeinsame Vertexpositionen verbinden
    key = lambda v: (round(v[0],4), round(v[1],4), round(v[2],4))
    vid = {}
    canon = [vid.setdefault(key(v), len(vid)) for v in V]
    parent = list(range(len(vid)))
    def find(a):
        while parent[a] != a: parent[a] = parent[parent[a]]; a = parent[a]
        return a
    for t in tris:
        a, b, c = find(canon[t[0]]), find(canon[t[1]]), find(canon[t[2]])
        parent[b] = a; parent[find(c)] = find(a)
    comp = {}
    out = []
    for t in tris:
        r = find(canon[t[0]]); out.append(comp.setdefault(r, len(comp)))
    return out, len(comp)
