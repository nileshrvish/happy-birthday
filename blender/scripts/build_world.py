"""Petal's Birthday Adventure - Blender world & asset builder (Blender 4.5).

Builds every reusable environment asset (stylized anime look, low poly, game-ready),
organizes them into collections, lays out the five-area world from
src/environments/layout.json (as linked instances), saves
blender/Petals_Birthday_World.blend and exports GLBs to public/assets/models/.

Run:  npm run assets
  or  blender -b --factory-startup --python blender/scripts/build_world.py
"""
import bpy, bmesh, json, math, os, random
from mathutils import Vector, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_MODELS = os.path.join(ROOT, 'public', 'assets', 'models')
LAYOUT = json.load(open(os.path.join(ROOT, 'src', 'environments', 'layout.json'), encoding='utf-8'))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- collections
COLL = {}
for name in ['ENVIRONMENT', 'TERRAIN', 'VEGETATION', 'WATER', 'ARCHITECTURE', 'PROPS',
             'COLLECTIBLES', 'VFX', 'LIGHTING', 'CAMERAS']:
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    COLL[name] = c


# ---------------------------------------------------------------- materials
def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]


M = {}


def mat(name, hexcol, rough=0.85, metal=0.0, emit=None, strength=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = srgb(hexcol)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = srgb(emit)
        b.inputs['Emission Strength'].default_value = strength
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.blend_method = 'BLEND'
    M[name] = m
    return m


# palette from the asset-pack reference sheets
mat('blossom', '#FF8FC7', 0.9); mat('blossom_deep', '#FF6FB3', 0.9); mat('blossom_light', '#FFC4E1', 0.9)
mat('bark', '#8B5E3C', 0.95); mat('bark_light', '#A8724A', 0.95)
mat('leaf', '#7ED957', 0.9); mat('leaf_deep', '#3FA66A', 0.9); mat('moss', '#79C25A', 0.95)
mat('rock', '#A39FB8', 0.95); mat('rock_dark', '#7E7896', 0.95)
mat('grass_top', '#8BD66A', 0.95)
mat('flower_pink', '#FF8FC7', 0.8); mat('flower_white', '#FFF2F8', 0.8); mat('flower_yellow', '#FFD447', 0.8)
mat('flower_lav', '#B99BFF', 0.8); mat('flower_blue', '#7DB8FF', 0.8); mat('flower_orange', '#FF7A3D', 0.8)
mat('torii_red', '#D94B4B', 0.7); mat('roof_blue', '#6B7FD7', 0.6); mat('wood_light', '#C98A4B', 0.8)
mat('wood_dark', '#8B5E3C', 0.85); mat('paper', '#F8EBD9', 0.9); mat('stone', '#BDB8C9', 0.95)
mat('gold', '#F5C451', 0.35, 0.8); mat('black', '#2A2433', 0.7)
mat('lamp_glow', '#FFE2A0', 0.5, emit='#FFC870', strength=4.0)
mat('magic_glow', '#FFB3D9', 0.4, emit='#FF8FC7', strength=3.0)
mat('crystal', '#C9B6FF', 0.2, emit='#B99BFF', strength=2.5)
mat('glass', '#BFE6FF', 0.1, emit='#9FD8FF', strength=0.6, alpha=0.45)
mat('wall_terracotta', '#D9895B', 0.9); mat('wall_yellow', '#F2C94C', 0.9); mat('wall_pink', '#E89BB5', 0.9)
mat('wall_trim', '#FFF2E0', 0.9); mat('sandstone', '#E0A96D', 0.9); mat('door', '#6B3E2E', 0.8)
mat('window', '#3D4F8C', 0.5); mat('booth_red', '#D94B6E', 0.5)
mat('cake_cream', '#FFF2F8', 0.8); mat('cake_pink', '#FF9FCB', 0.8); mat('candle', '#FFF7E0', 0.6, emit='#FFD27A', strength=1.0)
mat('ribbon_gold', '#F5C451', 0.4, 0.5); mat('gift_lav', '#B99BFF', 0.7); mat('gift_pink', '#FF6FB3', 0.7)
mat('balloon', '#FF6FB3', 0.25); mat('string', '#EEE6F5', 0.9)
mat('cloud', '#FFFFFF', 1.0); mat('lily', '#4FAF68', 0.8)
mat('petal', '#FF9ACD', 0.5, emit='#FF6FB3', strength=0.8)
mat('firefly', '#FFF3A0', 0.5, emit='#FFE066', strength=6.0)


# ---------------------------------------------------------------- helpers
def deselect():
    for o in bpy.context.selected_objects:
        o.select_set(False)


def add(kind, mname, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), **kw):
    getattr(bpy.ops.mesh, 'primitive_' + kind + '_add')(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.append(M[mname])
    return o


def box(mname, loc, size, rot=(0, 0, 0)):
    return add('cube', mname, loc, rot, (size[0] / 2, size[1] / 2, size[2] / 2))


def cyl(mname, loc, r, depth, verts=8, rot=(0, 0, 0), r2=None):
    if r2 is not None:
        return add('cone', mname, loc, rot, vertices=verts, radius1=r, radius2=r2, depth=depth)
    return add('cylinder', mname, loc, rot, vertices=verts, radius=r, depth=depth)


def ico(mname, loc, r, sub=1, scale=(1, 1, 1)):
    o = add('ico_sphere', mname, loc, (0, 0, 0), scale, subdivisions=sub, radius=r)
    return o


def jitter(o, amt, seed=0.0, freq=1.2):
    off = Vector((seed * 3.1, seed * 7.3, seed * 1.7))
    for v in o.data.vertices:
        v.co += noise.noise_vector(v.co * freq + off) * amt


def moss_top(o, thresh=0.55):
    """Second material slot = moss on upward-facing faces."""
    o.data.materials.append(M['moss'])
    for p in o.data.polygons:
        p.material_index = 1 if p.normal.z > thresh else 0


def finish(parts, name, coll, smooth=False):
    deselect()
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    o.data.name = name
    for p in o.data.polygons:
        p.use_smooth = smooth
    for c in o.users_collection:
        c.objects.unlink(o)
    COLL[coll].objects.link(o)
    ASSETS[name] = o
    return o


ASSETS = {}


def curved_roof(size, height, flare, mname, z0, thick=0.18, cuts=10):
    """Japanese-style hip roof: concave sides, lifted corners."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=cuts, y_subdivisions=cuts, size=2)
    o = bpy.context.active_object
    for v in o.data.vertices:
        x, y = v.co.x, v.co.y
        m = max(abs(x), abs(y))
        z = height * (1 - m) ** 1.6 + flare * (abs(x) * abs(y)) ** 3
        v.co = Vector((x * size, y * size, z0 + z))
    mod = o.modifiers.new('s', 'SOLIDIFY')
    mod.thickness = thick
    bpy.ops.object.modifier_apply(modifier='s')
    o.data.materials.append(M[mname])
    return o


rng = random.Random(7)

# ================================================================ TERRAIN
# floating island underside (top radius 1, top at z=0) - scaled per island in game
bpy.ops.mesh.primitive_cone_add(vertices=28, radius1=1.0, radius2=0.04, depth=1.0, end_fill_type='NOTHING')
o = bpy.context.active_object
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.subdivide(number_cuts=5)
bpy.ops.object.mode_set(mode='OBJECT')
for v in o.data.vertices:
    t = 0.5 - v.co.z  # 0 at top .. 1 bottom
    v.co.z = -t * 1.0
    ang = math.atan2(v.co.y, v.co.x)
    rr = Vector((v.co.x, v.co.y, 0)).length
    bump = 1 + 0.12 * noise.noise(Vector((math.cos(ang) * 2, math.sin(ang) * 2, t * 3)))
    v.co.x, v.co.y = math.cos(ang) * rr * bump, math.sin(ang) * rr * bump
    v.co.z += 0.08 * noise.noise(Vector((v.co.x * 3, v.co.y * 3, 5)))
    if t < 0.02:
        v.co.z = 0.0
o.data.materials.append(M['rock'])
o.data.materials.append(M['moss'])
o.data.materials.append(M['rock_dark'])
for p in o.data.polygons:
    zc = p.center.z
    p.material_index = 1 if zc > -0.12 else (2 if zc < -0.6 else 0)
finish([o], 'island_base', 'TERRAIN')

# rocks (purple-grey, chunky, mossy tops)
def rock(name, scale, seed, sub=1, amt=0.25):
    r = ico('rock', (0, 0, scale[2] * 0.45), 1.0, sub, scale)
    jitter(r, amt, seed, 1.4)
    moss_top(r, 0.6)
    return finish([r], name, 'TERRAIN')


rock('rock_a', (0.9, 0.8, 0.7), 1)
rock('rock_b', (1.2, 1.0, 0.9), 2)
rock('rock_flat', (1.3, 1.0, 0.35), 3, amt=0.15)
t1 = ico('rock', (0, 0, 1.2), 1.0, 1, (0.6, 0.55, 1.5)); jitter(t1, 0.2, 4); moss_top(t1, 0.5)
t2 = ico('rock', (0.6, 0.3, 0.5), 1.0, 1, (0.45, 0.45, 0.7)); jitter(t2, 0.15, 5); moss_top(t2, 0.5)
finish([t1, t2], 'rock_tall', 'TERRAIN')
for i in range(3):
    s = 0.25 + i * 0.12
    f = ico('rock', (0, 0, s * 0.3), 1, 1, (s * 1.2, s, s * 0.6)); jitter(f, 0.06, 10 + i, 3)
    finish([f], 'stone_tile_%d' % i, 'TERRAIN')
# stone platform / path piece
sp = cyl('stone', (0, 0, 0.08), 1.0, 0.16, 10); jitter(sp, 0.05, 20, 2)
finish([sp], 'stone_platform', 'TERRAIN')

# ================================================================ VEGETATION
def cherry_tree(name, h, crown, seed, n_clumps=9):
    r = random.Random(seed)
    parts = []
    trunk = cyl('bark', (0, 0, h * 0.5), 0.32 * crown, h, 8, r2=0.16 * crown)
    for v in trunk.data.vertices:  # gentle anime S-curve
        k = v.co.z / h
        v.co.x += math.sin(k * 2.6) * 0.35 * crown
    parts.append(trunk)
    # roots flare
    parts.append(cyl('bark', (0, 0, 0.15), 0.55 * crown, 0.3, 8, r2=0.3 * crown))
    for i in range(3):  # main branches
        a = i * 2.1 + r.random()
        b = cyl('bark', (0, 0, 0), 0.14 * crown, 2.2 * crown, 6, r2=0.06 * crown)
        b.rotation_euler = (0.9, 0, a)
        b.location = (math.sin(2.6) * 0.35 * crown + math.cos(a) * 0.5 * crown, math.sin(a) * 0.5 * crown, h * 0.85)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=False)
        parts.append(b)
    for i in range(n_clumps):
        a = r.random() * math.tau
        d = r.uniform(0.3, 1.0) * 2.2 * crown
        z = h + 0.6 * crown + r.uniform(-0.3, 1.0) * crown - d * 0.25
        s = r.uniform(1.0, 1.5) * crown
        c = ico(r.choice(['blossom', 'blossom', 'blossom_deep', 'blossom_light']),
                (math.cos(a) * d + 0.3 * crown, math.sin(a) * d, z), s, 2, (1, 1, 0.8))
        jitter(c, 0.22 * s, seed + i, 1.6)
        parts.append(c)
    top = ico('blossom', (0.3 * crown, 0, h + 1.6 * crown), 1.5 * crown, 2, (1, 1, 0.75)); jitter(top, 0.3, seed + 50)
    parts.append(top)
    return finish(parts, name, 'VEGETATION', smooth=True)


cherry_tree('tree_cherry', 3.2, 1.0, 11)
cherry_tree('tree_cherry_small', 2.2, 0.7, 12, 6)
cherry_tree('tree_cherry_hero', 7.0, 2.6, 13, 16)

# regular green tree
parts = [cyl('bark', (0, 0, 1.4), 0.28, 2.8, 8, r2=0.14)]
for i, (x, y, z, s) in enumerate([(0, 0, 3.6, 1.6), (0.9, 0.3, 3.1, 1.1), (-0.8, -0.4, 3.2, 1.15), (0.1, -0.9, 3.0, 1.0), (0, 0.8, 3.3, 1.0), (0.2, 0.1, 4.4, 1.0)]):
    c = ico('leaf' if i % 2 else 'leaf_deep', (x, y, z), s, 2); jitter(c, 0.22 * s, 30 + i, 1.5); parts.append(c)
finish(parts, 'tree_green', 'VEGETATION', smooth=True)

# bushes
def bush(name, flowers):
    ps = []
    for i, (x, y, s) in enumerate([(0, 0, 0.7), (0.55, 0.2, 0.5), (-0.5, -0.15, 0.55), (0.1, -0.45, 0.45)]):
        b = ico('leaf_deep' if i % 2 else 'leaf', (x, y, s * 0.75), s, 1); jitter(b, 0.12, 40 + i, 2); ps.append(b)
    if flowers:
        rr = random.Random(5)
        for i in range(14):
            a = rr.random() * math.tau; e = rr.uniform(0.15, 1.2)
            p = Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e))) * 0.7
            ps.append(ico(flowers, (p.x, p.y, p.z + 0.5), 0.11, 0))
    return finish(ps, name, 'VEGETATION', smooth=False)


bush('bush_green', None)
bush('bush_pink', 'flower_pink')
bush('bush_white', 'flower_white')

# grass clump (instanced en masse in the game)
ps = []
for i in range(6):
    a = i / 6 * math.tau
    g = cyl('grass_top', (math.cos(a) * 0.08, math.sin(a) * 0.08, 0.22), 0.05, 0.45, 3, r2=0.0)
    g.rotation_euler = (math.cos(a) * 0.35, math.sin(a) * 0.35, 0)
    ps.append(g)
o = finish(ps, 'grass', 'VEGETATION')
bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def flower_clump(name, m):
    ps = [ico('leaf_deep', (0, 0, 0.08), 0.16, 0, (1, 1, 0.6))]
    for i in range(4):
        a = i * 1.7
        ps.append(cyl('leaf_deep', (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.16), 0.012, 0.32, 3))
        f = ico(m, (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.34), 0.07, 0, (1, 1, 0.45))
        ps.append(f)
        ps.append(ico('flower_yellow' if m != 'flower_yellow' else 'flower_orange', (math.cos(a) * 0.1, math.sin(a) * 0.1, 0.365), 0.025, 0))
    return finish(ps, name, 'VEGETATION')


flower_clump('flower_pink', 'flower_pink')
flower_clump('flower_white', 'flower_white')
flower_clump('flower_yellow', 'flower_yellow')
flower_clump('flower_blue', 'flower_blue')
ps = []
for i in range(5):
    a = i * 1.26
    x, y = math.cos(a) * 0.1, math.sin(a) * 0.1
    ps.append(cyl('leaf_deep', (x, y, 0.2), 0.012, 0.4, 3))
    ps.append(cyl('flower_lav', (x, y, 0.47), 0.035, 0.22, 5, r2=0.01))
finish(ps, 'lavender', 'VEGETATION')
# vines / leaf sprig
ps = []
for i in range(5):
    l = ico('leaf', (0, 0.05 * i, -0.18 * i), 0.09, 0, (1.4, 0.4, 0.8)); ps.append(l)
ps.append(cyl('leaf_deep', (0, 0.1, -0.36), 0.012, 0.8, 3))
finish(ps, 'vine', 'VEGETATION')

# ================================================================ WATER (meshes; animated water surfaces are shaders in-game)
lp = cyl('lily', (0, 0, 0.01), 0.35, 0.02, 10)
for v in lp.data.vertices:  # notch
    if v.co.x > 0.2 and abs(v.co.y) < 0.12:
        v.co.x = 0.05
lb = ico('flower_pink', (0.05, 0.05, 0.08), 0.09, 1, (1, 1, 0.7))
finish([lp, lb], 'lily_pad', 'WATER')
wr = ico('rock', (0, 0, 0.1), 0.5, 1, (1.2, 1, 0.45)); jitter(wr, 0.08, 60); moss_top(wr, 0.7)
finish([wr], 'water_rock', 'WATER')

# ================================================================ ARCHITECTURE
# torii gate
ps = [cyl('torii_red', (-1.6, 0, 1.9), 0.17, 3.8, 10), cyl('torii_red', (1.6, 0, 1.9), 0.17, 3.8, 10),
      cyl('black', (-1.6, 0, 0.15), 0.24, 0.3, 10), cyl('black', (1.6, 0, 0.15), 0.24, 0.3, 10),
      box('torii_red', (0, 0, 3.15), (4.0, 0.22, 0.22))]
top = box('black', (0, 0, 3.85), (4.8, 0.36, 0.22))
for v in top.data.vertices:
    v.co.z += (abs(v.co.x) / 2.4) ** 2 * 0.25
ps += [top, box('torii_red', (0, 0, 3.65), (4.4, 0.3, 0.2)), box('torii_red', (0, 0, 3.4), (0.25, 0.2, 0.5))]
finish(ps, 'torii', 'ARCHITECTURE')

# stone lantern (toro)
ps = [cyl('stone', (0, 0, 0.1), 0.35, 0.2, 6), cyl('stone', (0, 0, 0.6), 0.12, 0.8, 8),
      cyl('stone', (0, 0, 1.05), 0.32, 0.12, 6), box('lamp_glow', (0, 0, 1.3), (0.38, 0.38, 0.38)),
      cyl('stone', (0, 0, 1.6), 0.5, 0.25, 6, r2=0.08), ico('stone', (0, 0, 1.78), 0.08, 1)]
for x, y in [(0.2, 0), (-0.2, 0), (0, 0.2), (0, -0.2)]:
    ps.append(box('stone', (x, y, 1.3), (0.06 if x == 0 else 0.06, 0.06, 0.38)))
finish(ps, 'lantern_stone', 'ARCHITECTURE')
# wooden lantern post
ps = [box('wood_dark', (0, 0, 0.9), (0.14, 0.14, 1.8)), box('wood_dark', (0, 0, 1.85), (0.4, 0.4, 0.06)),
      box('lamp_glow', (0, 0, 2.05), (0.32, 0.32, 0.36)), cyl('wood_dark', (0, 0, 2.35), 0.32, 0.18, 4, r2=0.04, rot=(0, 0, math.pi / 4))]
finish(ps, 'lantern_wood', 'ARCHITECTURE')
# street lamp (Mau)
ps = [cyl('black', (0, 0, 1.6), 0.06, 3.2, 8), cyl('black', (0, 0, 0.1), 0.18, 0.2, 8),
      box('black', (0.35, 0, 3.15), (0.75, 0.06, 0.06)), cyl('lamp_glow', (0.68, 0, 2.95), 0.12, 0.28, 8),
      cyl('black', (0.68, 0, 3.12), 0.18, 0.1, 8, r2=0.05)]
finish(ps, 'lamp_post', 'ARCHITECTURE')

# Japanese-inspired pavilion (B1 Garden Pavilion)
ps = [box('stone', (0, 0, 0.3), (7.4, 7.4, 0.6)), box('wood_light', (0, 0, 0.66), (6.6, 6.6, 0.12))]
for i in range(3):
    ps.append(box('stone', (0, -3.7 - 0.35 * i - 0.2, 0.5 - i * 0.2), (2.6, 0.4, 0.2 + 0.0)))
for x in (-2.9, 2.9):
    for y in (-2.9, 2.9):
        ps.append(cyl('torii_red', (x, y, 2.1), 0.17, 2.8, 8))
for x in (-2.9, 0, 2.9):
    if x != 0:
        ps.append(cyl('torii_red', (x, 0, 2.1), 0.15, 2.8, 8))
        ps.append(cyl('torii_red', (0, x, 2.1), 0.15, 2.8, 8))
for y in (-2.9, 2.9):
    ps.append(box('wood_dark', (0, y, 3.45), (6.2, 0.25, 0.3)))
    ps.append(box('wood_dark', (y, 0, 3.45), (0.25, 6.2, 0.3)))
for s in (-1, 1):  # railings (front left open for entrance)
    ps.append(box('torii_red', (s * 2.9, 0, 1.15), (0.1, 5.8, 0.1)))
    ps.append(box('torii_red', (0, 2.9, 1.15), (5.8, 0.1, 0.1)))
ps.append(curved_roof(4.6, 1.6, 0.7, 'roof_blue', 3.55))
ps.append(box('wood_dark', (0, 0, 4.9), (1.8, 1.8, 0.7)))
ps.append(curved_roof(1.8, 0.9, 0.35, 'roof_blue', 5.2, 0.12, 6))
ps.append(ico('gold', (0, 0, 6.25), 0.2, 1))
ps.append(cyl('gold', (0, 0, 6.0), 0.05, 0.6, 6))
for x, y in [(-2.9, -2.9), (2.9, -2.9), (-2.9, 2.9), (2.9, 2.9)]:
    ps.append(box('lamp_glow', (x * 1.05, y * 1.05, 3.1), (0.28, 0.28, 0.4)))
finish(ps, 'pavilion', 'ARCHITECTURE')

# wooden gazebo (hexagonal) - Garden of Memories
ps = [cyl('stone', (0, 0, 0.2), 4.0, 0.4, 6), cyl('wood_light', (0, 0, 0.44), 3.7, 0.08, 6)]
for i in range(6):
    a = i / 6 * math.tau + math.pi / 6
    x, y = math.cos(a) * 3.3, math.sin(a) * 3.3
    ps.append(cyl('wood_dark', (x, y, 1.9), 0.13, 2.9, 8))
    if i in (1, 3, 5):  # rails on alternate sides, openings for paths
        b = box('wood_light', ((x + math.cos(a + math.pi / 3) * 3.3) / 2, (y + math.sin(a + math.pi / 3) * 3.3) / 2, 0.95),
                (3.3, 0.1, 0.1), rot=(0, 0, a + math.pi / 3 + math.pi / 2))
        ps.append(b)
r = cyl('roof_blue', (0, 0, 4.15), 4.3, 1.9, 6, r2=0.15)
for v in r.data.vertices:
    if v.co.z < 3.5:
        v.co.z += 0.25
ps.append(r)
ps.append(cyl('wood_dark', (0, 0, 3.3), 4.1, 0.15, 6))
ps.append(ico('gold', (0, 0, 5.25), 0.22, 1))
for i in range(6):
    a = i / 6 * math.tau + math.pi / 6
    ps.append(box('lamp_glow', (math.cos(a) * 3.6, math.sin(a) * 3.6, 2.95), (0.22, 0.22, 0.32)))
finish(ps, 'gazebo', 'ARCHITECTURE')

# Indian-inspired town houses (Mau)
def house(name, wall):
    ps = [box(wall, (0, 0, 1.9), (4.4, 4.0, 3.8)),
          box('wall_trim', (0, 0, 3.85), (4.8, 4.4, 0.18)),
          box('wall_trim', (0, 0, 0.12), (4.6, 4.2, 0.24))]
    for i in range(7):  # parapet crenellations
        x = -2.2 + i * 0.733
        ps.append(box(wall, (x, -2.1, 4.1), (0.35, 0.18, 0.4)))
        ps.append(box(wall, (x, 2.1, 4.1), (0.35, 0.18, 0.4)))
    # front faces -Y : door with arch
    ps.append(box('door', (0, -2.02, 1.0), (1.1, 0.1, 2.0)))
    ps.append(cyl('door', (0, -2.02, 2.0), 0.55, 0.1, 12, rot=(math.pi / 2, 0, 0)))
    ps.append(box('wall_trim', (0, -2.06, 2.62), (1.5, 0.08, 0.14)))
    for x in (-1.5, 1.5):
        ps.append(box('window', (x, -2.02, 2.2), (0.7, 0.08, 0.9)))
        ps.append(box('wall_trim', (x, -2.06, 1.7), (0.9, 0.2, 0.08)))
        ps.append(box('wood_dark', (x - 0.48, -2.06, 2.2), (0.12, 0.08, 1.0)))
        ps.append(box('wood_dark', (x + 0.48, -2.06, 2.2), (0.12, 0.08, 1.0)))
    ps.append(box('wall_trim', (0, -2.35, 2.9), (4.4, 0.7, 0.1)))  # chhajja ledge
    ps.append(box('stone', (0, -2.4, 0.1), (1.6, 0.8, 0.2)))  # step
    return finish(ps, name, 'ARCHITECTURE')


house('house_a', 'wall_terracotta')
house('house_b', 'wall_yellow')
house('house_c', 'wall_pink')

# chhatri (Indian garden pavilion)
ps = [box('sandstone', (0, 0, 0.25), (3.2, 3.2, 0.5))]
for x in (-1.2, 1.2):
    for y in (-1.2, 1.2):
        ps.append(cyl('sandstone', (x, y, 1.55), 0.13, 2.1, 8))
ps.append(box('sandstone', (0, 0, 2.7), (3.0, 3.0, 0.2)))
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1.3, location=(0, 0, 2.8))
d = bpy.context.active_object
bm = bmesh.new(); bm.from_mesh(d.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context='VERTS')
bm.to_mesh(d.data); bm.free()
bpy.ops.object.transform_apply(location=True)
d.data.materials.append(M['wall_trim'])
ps += [d, cyl('gold', (0, 0, 4.3), 0.06, 0.5, 6), ico('gold', (0, 0, 4.15), 0.14, 1)]
finish(ps, 'chhatri', 'ARCHITECTURE')

# bridge modules (game assembles them along an arch)
finish([box('wood_light', (0, 0, -0.06), (1.0, 0.42, 0.12))], 'bridge_plank', 'ARCHITECTURE')
finish([box('stone', (0, 0, -0.12), (1.0, 0.62, 0.24))], 'bridge_stone', 'ARCHITECTURE')
finish([cyl('torii_red', (0, 0, 0.55), 0.08, 1.1, 8), cyl('gold', (0, 0, 1.13), 0.1, 0.08, 8), ico('gold', (0, 0, 1.2), 0.07, 0)],
       'bridge_post', 'ARCHITECTURE')
finish([box('torii_red', (0, 0, 0), (1.0, 0.08, 0.1))], 'bridge_rail', 'ARCHITECTURE')

# ================================================================ PROPS
ps = [box('wood_light', (0, 0, 0.45), (1.8, 0.5, 0.08)), box('wood_dark', (-0.75, 0, 0.22), (0.1, 0.45, 0.44)),
      box('wood_dark', (0.75, 0, 0.22), (0.1, 0.45, 0.44)), box('wood_light', (0, 0.23, 0.8), (1.8, 0.06, 0.35)),
      box('wood_dark', (-0.75, 0.24, 0.62), (0.08, 0.06, 0.4)), box('wood_dark', (0.75, 0.24, 0.62), (0.08, 0.06, 0.4))]
finish(ps, 'bench', 'PROPS')
ps = [box('wood_light', (0, 0, 0.46), (0.5, 0.5, 0.06))]
for x in (-0.21, 0.21):
    for y in (-0.21, 0.21):
        ps.append(box('wood_dark', (x, y, 0.23), (0.06, 0.06, 0.46)))
ps += [box('wood_dark', (-0.21, 0.21, 0.75), (0.06, 0.06, 0.6)), box('wood_dark', (0.21, 0.21, 0.75), (0.06, 0.06, 0.6)),
       box('wood_light', (0, 0.22, 0.88), (0.48, 0.04, 0.25))]
finish(ps, 'chair', 'PROPS')
ps = [cyl('wall_terracotta', (0, 0, 0.25), 0.3, 0.5, 10, r2=0.22), cyl('wall_terracotta', (0, 0, 0.52), 0.34, 0.08, 10)]
for i in range(6):
    a = i * 1.05
    ps.append(ico('flower_pink' if i % 2 else 'flower_yellow', (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.68), 0.1, 1))
ps.append(ico('leaf_deep', (0, 0, 0.6), 0.25, 1, (1, 1, 0.5)))
finish(ps, 'flower_pot', 'PROPS')
# signboard: board front faces -Y, text plane added in game at (0,-0.07,2.0) size 1.9x0.75
ps = [box('wood_dark', (-0.85, 0, 1.1), (0.12, 0.12, 2.2)), box('wood_dark', (0.85, 0, 1.1), (0.12, 0.12, 2.2)),
      box('wood_light', (0, 0, 2.0), (2.1, 0.1, 0.85)), cyl('wood_dark', (0, 0, 2.55), 1.25, 0.3, 4, r2=0.05, rot=(0, 0, math.pi / 4))]
finish(ps, 'signboard', 'PROPS')
# magical phone booth - door faces -Y
ps = [box('booth_red', (0, 0, 0.08), (1.4, 1.4, 0.16))]
for x in (-0.62, 0.62):
    for y in (-0.62, 0.62):
        ps.append(box('booth_red', (x, y, 1.3), (0.16, 0.16, 2.45)))
for s in (-1, 1):
    ps.append(box('glass', (s * 0.62, 0, 1.3), (0.05, 1.1, 2.2)))
ps.append(box('glass', (0, 0.62, 1.3), (1.1, 0.05, 2.2)))
ps.append(box('glass', (0, -0.62, 1.3), (1.1, 0.05, 2.2)))
for z in (0.6, 1.3, 2.0):
    ps.append(box('booth_red', (0, -0.64, z), (1.1, 0.06, 0.06)))
ps += [box('booth_red', (0, 0, 2.6), (1.5, 1.5, 0.25)), box('lamp_glow', (0, -0.76, 2.6), (0.9, 0.04, 0.18)),
       curved_roof(0.8, 0.35, 0.1, 'booth_red', 2.72, 0.08, 4), ico('magic_glow', (0, 0, 3.15), 0.13, 1),
       box('black', (0, 0.5, 1.4), (0.35, 0.12, 0.5)), box('black', (0.1, 0.42, 1.55), (0.08, 0.08, 0.25))]
finish(ps, 'phone_booth', 'PROPS')
# glowing diary on pedestal
ps = [cyl('stone', (0, 0, 0.5), 0.3, 1.0, 8), cyl('stone', (0, 0, 1.03), 0.42, 0.08, 8),
      box('magic_glow', (-0.17, 0, 1.12), (0.32, 0.46, 0.05), rot=(0, 0.12, 0)),
      box('magic_glow', (0.17, 0, 1.12), (0.32, 0.46, 0.05), rot=(0, -0.12, 0)),
      box('paper', (-0.16, 0, 1.15), (0.29, 0.42, 0.04), rot=(0, 0.12, 0)),
      box('paper', (0.16, 0, 1.15), (0.29, 0.42, 0.04), rot=(0, -0.12, 0)),
      box('ribbon_gold', (0.05, -0.05, 1.17), (0.02, 0.5, 0.01))]
finish(ps, 'diary', 'PROPS')
# birthday cake
ps = [cyl('stone', (0, 0, 0.45), 0.5, 0.9, 10), cyl('wall_trim', (0, 0, 0.93), 0.7, 0.06, 16),
      cyl('cake_pink', (0, 0, 1.15), 0.6, 0.38, 20), cyl('cake_cream', (0, 0, 1.5), 0.45, 0.32, 20),
      cyl('cake_pink', (0, 0, 1.8), 0.3, 0.28, 20)]
for i in range(10):
    a = i / 10 * math.tau
    ps.append(ico('cake_cream', (math.cos(a) * 0.6, math.sin(a) * 0.6, 1.34), 0.07, 1))
    ps.append(ico('blossom_deep', (math.cos(a) * 0.45, math.sin(a) * 0.45, 1.66), 0.05, 1))
for i in range(5):
    a = i / 5 * math.tau
    ps.append(cyl('candle', (math.cos(a) * 0.17, math.sin(a) * 0.17, 2.04), 0.025, 0.2, 6))
    ps.append(ico('lamp_glow', (math.cos(a) * 0.17, math.sin(a) * 0.17, 2.17), 0.035, 1, (1, 1, 1.6)))
finish(ps, 'cake', 'PROPS')
ps = [box('gift_pink', (0, 0, 0.3), (0.6, 0.6, 0.6)), box('ribbon_gold', (0, 0, 0.3), (0.62, 0.12, 0.62)),
      box('ribbon_gold', (0, 0, 0.3), (0.12, 0.62, 0.62)), ico('ribbon_gold', (0.08, 0, 0.65), 0.1, 1, (1, 0.5, 0.6)),
      ico('ribbon_gold', (-0.08, 0, 0.65), 0.1, 1, (1, 0.5, 0.6))]
finish(ps, 'gift', 'PROPS')
ps = [ico('balloon', (0, 0, 2.6), 0.32, 2, (1, 1, 1.2)), cyl('balloon', (0, 0, 2.2), 0.05, 0.08, 6, r2=0.0),
      cyl('string', (0, 0, 1.1), 0.008, 2.2, 3)]
finish(ps, 'balloon', 'PROPS', smooth=True)
# sky lantern (floating lantern for kingdom)
finish([cyl('lamp_glow', (0, 0, 0.25), 0.18, 0.5, 8, r2=0.24)], 'sky_lantern', 'PROPS')
# bunting flag
finish([cyl('blossom_deep', (0, 0, -0.18), 0.2, 0.02, 3, rot=(math.pi / 2, 0, 0))], 'bunting_flag', 'PROPS')

# ================================================================ COLLECTIBLES
def petal_mesh(name, mname, length=0.6, width=0.34):
    bm = bmesh.new()
    pts = []
    N = 18
    for i in range(N + 1):
        t = i / N  # 0..1 along outline from tip-left to tip-right around
        a = math.pi * t
        # teardrop with notched tip (sakura petal)
        y = (1 - math.cos(a)) / 2 * length
        x = math.sin(a) * width * (0.5 + 0.5 * math.sin(a * 0.9))
        pts.append((x, y))
    outline = [(0, 0)] + pts[1:]
    right = [(x, y) for x, y in outline]
    left = [(-x, y) for x, y in reversed(outline[1:-1])]
    poly = right + left
    tip = (0, length * 0.9)  # notch
    poly = [p for p in poly if not (abs(p[0]) < 0.03 and p[1] > length * 0.95)] + [tip]
    poly.sort(key=lambda p: math.atan2(p[1] - length * 0.45, p[0]))
    verts = [bm.verts.new((x, y, 0.12 * (x / width) ** 2 + 0.15 * (y / length) ** 2)) for x, y in poly]
    f = bm.faces.new(verts)
    bmesh.ops.triangulate(bm, faces=[f])
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    o.data.materials.append(M[mname])
    deselect(); bpy.context.view_layer.objects.active = o; o.select_set(True)
    return finish([o], name, 'COLLECTIBLES', smooth=True)


petal_mesh('petal', 'petal')
finish([ico('flower_yellow', (0, 0, 0), 0.12, 2, (1, 1, 0.6))], 'flower_center', 'COLLECTIBLES', smooth=True)
c1 = ico('crystal', (0, 0, 0.9), 0.4, 0, (0.7, 0.7, 1.6)); c2 = ico('crystal', (0.35, 0.1, 0.45), 0.25, 0, (0.7, 0.7, 1.5))
finish([c1, c2, ico('rock', (0, 0, 0.1), 0.5, 1, (1, 1, 0.35))], 'memory_stone', 'COLLECTIBLES')

# ================================================================ VFX helpers
finish([ico('firefly', (0, 0, 0), 0.05, 1)], 'firefly', 'VFX')
ps = []
for i, (x, y, s) in enumerate([(0, 0, 2.2), (1.9, 0.3, 1.6), (-1.9, -0.2, 1.7), (0.8, 1.0, 1.4), (-0.9, -1.0, 1.3)]):
    c = ico('cloud', (x, y, 0), s, 2, (1, 1, 0.6)); jitter(c, 0.25, 70 + i); ps.append(c)
finish(ps, 'cloud', 'VFX', smooth=True)

# ---------------------------------------------------------------- lay out library grid (for browsing the .blend)
x = 0
for name, o in ASSETS.items():
    o.location = (x, 40, 0)
    x += max(4, o.dimensions.x + 2)

# ================================================================ ENVIRONMENT layout (linked duplicates)
def g2b(x, y, z):  # game (x, y-up, z) -> blender (x, -z, y)
    return (x, -z, y)


isl = {i['id']: i for i in LAYOUT['islands']}
env = COLL['ENVIRONMENT']


def inst(name, loc, rot_z=0.0, scale=1.0, sx=None):
    src = ASSETS[name]
    o = bpy.data.objects.new(name + '_inst', src.data)
    o.location = loc
    o.rotation_euler = (0, 0, rot_z)
    o.scale = sx if sx else (scale, scale, scale)
    env.objects.link(o)
    return o


for i in LAYOUT['islands']:
    cx, cz = i['c']
    r = i['r']
    inst('island_base', g2b(cx, i['h'], cz), 0, sx=(r, r, r * 1.1))
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=r, fill_type='NGON', location=g2b(cx, i['h'] + 0.02, cz))
    top = bpy.context.active_object
    top.name = 'ground_' + i['id']
    top.data.materials.append(M['grass_top'])
    for c in top.users_collection:
        c.objects.unlink(top)
    env.objects.link(top)
    for p in LAYOUT['props'].get(i['id'], []):
        name, dx, dz, rot, sc = p
        inst(name, g2b(cx + dx, i['h'], cz + dz), math.radians(rot), sc)

for b in LAYOUT['bridges']:
    A, B = isl[b['a']], isl[b['b']]
    a = Vector((A['c'][0], A['c'][1])); c = Vector((B['c'][0], B['c'][1]))
    d = (c - a).normalized()
    def irr(i, ang):  # same irregular radius as src/environments/Terrain.js
        return i['r'] * (1 + 0.07 * math.sin(3 * ang + i['seed']) + 0.045 * math.sin(5 * ang + i['seed'] * 2.3))
    p0 = a + d * (irr(A, math.atan2(d.y, d.x)) - 2.5); p1 = c - d * (irr(B, math.atan2(-d.y, -d.x)) - 2.5)
    L = (p1 - p0).length
    n = int(L / 0.5)
    rz = math.atan2(-d.x, -d.y)  # local +Y follows the bridge direction (blender: x, -z)
    piece = 'bridge_stone' if b['type'] == 'stone' else 'bridge_plank'
    for k in range(n + 1):
        t = k / n
        p = p0.lerp(p1, t)
        h = A['h'] + (B['h'] - A['h']) * t + b['arch'] * math.sin(math.pi * t)
        inst(piece, g2b(p.x, h, p.y), rz, sx=(b['width'], 1.2, 1))

# ================================================================ LIGHTING / CAMERAS
sun = bpy.data.objects.new('Sun_Sunset', bpy.data.lights.new('Sun_Sunset', 'SUN'))
sun.data.color = (1.0, 0.75, 0.6); sun.data.energy = 3.5
sun.rotation_euler = (math.radians(60), 0, math.radians(-40))
COLL['LIGHTING'].objects.link(sun)
world = bpy.data.worlds.new('SunsetSky'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = srgb('#F7A8C8')
cam = bpy.data.objects.new('Cam_Overview', bpy.data.cameras.new('Cam_Overview'))
cam.location = (110, 60, 110); cam.rotation_euler = (math.radians(58), 0, math.radians(125))
cam.data.clip_end = 2000
COLL['CAMERAS'].objects.link(cam)
scene.camera = cam

# ================================================================ save + export
blend_path = os.path.join(ROOT, 'blender', 'Petals_Birthday_World.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print('SAVED', blend_path)


def export(objs, path):
    deselect()
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_animations=False, export_materials='EXPORT')


# reset library objects to origin for export
for o in ASSETS.values():
    o.location = (0, 0, 0)
export(list(ASSETS.values()), os.path.join(OUT_MODELS, 'environment_assets.glb'))
for name, o in ASSETS.items():
    export([o], os.path.join(OUT_MODELS, 'props', name + '.glb'))
print('EXPORTED', len(ASSETS), 'assets')
