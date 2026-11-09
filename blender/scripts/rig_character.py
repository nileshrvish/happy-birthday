"""Rig the decimated Pooja mesh with a simple humanoid armature, custom capsule
skin weights, author six animation actions and export a GLB for Three.js.
Usage: blender -b --python rig_character.py -- <decimated.blend> <out.glb> <out.blend>
"""
import bpy, sys, math
from mathutils import Vector

src, out_glb, out_blend = sys.argv[-3], sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
mesh = bpy.data.objects["Pooja"]
V = [mesh.matrix_world @ v.co for v in mesh.data.vertices]


def centroid(xmin, xmax, zmin, zmax):
    pts = [v for v in V if xmin <= v.x <= xmax and zmin <= v.z <= zmax]
    n = max(1, len(pts))
    return Vector((sum(p.x for p in pts) / n, sum(p.y for p in pts) / n, sum(p.z for p in pts) / n))


cy = centroid(-0.15, 0.15, 0.9, 1.4).y
# Joints (Blender: +Z up, character faces -Y, character Right = -X)
J = {}
J['hip'] = Vector((-0.03, cy, 0.86))
J['waist'] = Vector((-0.03, cy, 1.05))
J['chest'] = Vector((-0.03, cy, 1.30))
J['neck'] = Vector((-0.02, cy, 1.52))
J['headb'] = Vector((-0.02, cy + 0.01, 1.60))
J['headt'] = Vector((-0.02, cy + 0.01, 1.90))
for s in 'RL':
    if s == 'R':
        sh = centroid(-0.30, -0.15, 1.38, 1.50); el = centroid(-0.32, -0.17, 1.17, 1.24); wr = centroid(-0.32, -0.15, 0.94, 1.00)
        lx = (-0.25, -0.03)
    else:
        sh = centroid(0.15, 0.30, 1.38, 1.50); el = centroid(0.15, 0.32, 1.17, 1.24); wr = centroid(0.14, 0.32, 0.98, 1.04)
        lx = (-0.03, 0.15)
    J['sh' + s], J['el' + s], J['wr' + s] = sh, el, wr
    J['ha' + s] = wr + (wr - el).normalized() * 0.12
    kn = centroid(lx[0], lx[1], 0.38, 0.45)
    an = centroid(lx[0], lx[1], 0.07, 0.12)
    J['th' + s] = Vector((kn.x, cy, 0.84))
    J['kn' + s] = Vector((kn.x, kn.y, 0.42))
    J['an' + s] = Vector((an.x, an.y, 0.09))
    J['to' + s] = Vector((an.x, an.y - 0.14, 0.03))
for k, v in J.items():
    print("J", k, tuple(round(c, 3) for c in v))

arm = bpy.data.armatures.new("PoojaRig")
rig = bpy.data.objects.new("PoojaRig", arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones


def bone(name, h, t, parent=None, connect=False):
    b = eb.new(name)
    b.head, b.tail = h, t
    if parent:
        b.parent = eb[parent]
        b.use_connect = connect
    return b


bone('root', Vector((0, cy, 0)), Vector((0, cy, 0.3)))
bone('hips', J['hip'], J['waist'], 'root')
bone('spine', J['waist'], J['chest'], 'hips', True)
bone('chest', J['chest'], J['neck'], 'spine', True)
bone('head', J['headb'], J['headt'], 'chest')
for s in 'RL':
    bone('upperarm.' + s, J['sh' + s], J['el' + s], 'chest')
    bone('forearm.' + s, J['el' + s], J['wr' + s], 'upperarm.' + s, True)
    bone('hand.' + s, J['wr' + s], J['ha' + s], 'forearm.' + s, True)
    bone('thigh.' + s, J['th' + s], J['kn' + s], 'hips')
    bone('shin.' + s, J['kn' + s], J['an' + s], 'thigh.' + s, True)
    bone('foot.' + s, J['an' + s], J['to' + s], 'shin.' + s, True)
bone('skirt', J['hip'], Vector((J['hip'].x, cy, 0.25)), 'hips')  # keeps kurta/dupatta with the body
for b in eb:  # keep local X close to world X so X rotation = pitch
    b.align_roll(Vector((0, -1, 0)) if abs(b.vector.normalized().z) > 0.5 else Vector((0, 0, 1)))
bpy.ops.object.mode_set(mode='OBJECT')

# ---- capsule skin weights ----
radius = {'hips': 0.15, 'spine': 0.14, 'chest': 0.14, 'head': 0.11, 'upperarm': 0.045, 'forearm': 0.04,
          'hand': 0.035, 'skirt': 0.10, 'thigh': 0.07, 'shin': 0.055, 'foot': 0.04}
segs = []
for b in arm.bones:
    if b.name == 'root':
        continue
    segs.append((b.name, rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local, radius[b.name.split('.')[0]]))


def segdist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


groups = {n: mesh.vertex_groups.new(name=n) for n, _, _, _ in segs}
for i, p in enumerate(V):
    ws = []
    for n, a, b, r in segs:
        d = max(0.0, segdist(p, a, b) - r)
        w = 1.0 / (d + 0.012) ** 4
        if n.split('.')[0] in ('thigh', 'shin', 'foot') and p.z > 0.2 and abs(p.x - (a.x + b.x) / 2) > 0.11:
            w *= 0.02  # dupatta / loose cloth must not follow the legs
        ws.append((w, n))
    ws.sort(reverse=True)
    ws = ws[:3]
    tot = sum(w for w, _ in ws)
    for w, n in ws:
        if w / tot > 0.02:
            groups[n].add([i], w / tot, 'REPLACE')
mesh.parent = rig
mod = mesh.modifiers.new("Armature", 'ARMATURE')
mod.object = rig

# ---- animations ----
pb = rig.pose.bones
for p in pb:
    p.rotation_mode = 'XYZ'
bpy.context.scene.render.fps = 24


def D(a):
    return math.radians(a)


def make_action(name, frames, keys):
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    step = 2 if frames > 20 else 1
    for f in list(range(0, frames, step)) + [frames]:
        t = f / frames
        for p in pb:
            p.rotation_euler = (0, 0, 0)
            p.location = (0, 0, 0)
        for bn, val in keys(t).items():
            if bn.endswith('@loc'):
                pb[bn[:-4]].location = val
            else:
                pb[bn].rotation_euler = (-D(val[0]), D(val[1]), D(val[2]))
        for p in pb:
            p.keyframe_insert('rotation_euler', frame=f)
            p.keyframe_insert('location', frame=f)
    act.use_fake_user = True
    tr = rig.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 0, act)
    rig.animation_data.action = None
    return act


S = lambda t, ph=0: math.sin(2 * math.pi * (t + ph))
C = lambda t, ph=0: math.cos(2 * math.pi * (t + ph))


def idle(t):
    b = S(t)
    return {'spine': (1.5 * b, 0, 0), 'chest': (1 * b, 0, 0.8 * S(t, 0.25)), 'head': (-1 * b, 2 * S(t, 0.1), 0),
            'upperarm.R': (1.5 * b, 0, 0), 'upperarm.L': (1.5 * b, 0, 0),
            'forearm.R': (-4, 0, 0), 'forearm.L': (-4, 0, 0), 'root@loc': (0, 0.004 * b, 0)}


def gait(amp_leg, amp_arm, knee, lean, bob, elbow):
    def f(t):
        s = S(t)
        return {'thigh.R': (-amp_leg * s, 0, 0), 'thigh.L': (amp_leg * s, 0, 0),
                'shin.R': (knee * max(0, C(t, 0.1)), 0, 0), 'shin.L': (knee * max(0, -C(t, 0.1)), 0, 0),
                'foot.R': (-10 * s, 0, 0), 'foot.L': (10 * s, 0, 0),
                'upperarm.R': (amp_arm * s, 0, 0), 'upperarm.L': (-amp_arm * s, 0, 0),
                'forearm.R': (-elbow - 8 * max(0, -s), 0, 0), 'forearm.L': (-elbow - 8 * max(0, s), 0, 0),
                'hips': (0, 4 * s, 0), 'spine': (-lean, 0, 0), 'chest': (0, -6 * s, 0),
                'root@loc': (0, bob * abs(C(t)), 0)}
    return f


def jump(t):
    k = math.sin(math.pi * t)
    return {'thigh.R': (-45 * k, 0, 0), 'thigh.L': (-30 * k, 0, 0), 'shin.R': (70 * k, 0, 0), 'shin.L': (55 * k, 0, 0),
            'upperarm.R': (-35 * k, 0, 0), 'upperarm.L': (-35 * k, 0, 0),
            'forearm.R': (-30 * k, 0, 0), 'forearm.L': (-30 * k, 0, 0), 'spine': (-8 * k, 0, 0)}


def collect(t):
    k = math.sin(math.pi * min(1, t * 1.4))
    return {'upperarm.R': (-95 * k, 0, 0), 'forearm.R': (-20 * k, 0, 0), 'hand.R': (-20 * k, 0, 0),
            'spine': (-12 * k, 0, 0), 'head': (-12 * k, 0, 0), 'thigh.R': (-10 * k, 0, 0), 'shin.R': (15 * k, 0, 0),
            'upperarm.L': (-20 * k, 0, 0)}


def celebrate(t):
    w = S(t * 2)
    return {'upperarm.R': (-160 + 10 * w, 0, 0), 'upperarm.L': (-160 - 10 * w, 0, 0),
            'forearm.R': (-15, 0, 0), 'forearm.L': (-15, 0, 0),
            'head': (8, 8 * w, 0), 'spine': (4, 0, 0), 'hips': (0, -4 * w, 0), 'root@loc': (0, 0.04 * abs(w), 0)}


make_action('Idle', 48, idle)
make_action('Walk', 26, gait(24, 16, 32, 4, 0.03, 10))
make_action('Run', 16, gait(34, 32, 60, 10, 0.06, 50))
make_action('Jump', 14, jump)
make_action('Collect', 30, collect)
make_action('Celebrate', 48, celebrate)

# The source FBX wires its texture into Emission; glTF needs it as Base Color.
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    tex = next((n for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
    if bsdf and tex:
        for l in list(nt.links):
            if l.to_node == bsdf and l.to_socket.name == 'Emission Color':
                nt.links.remove(l)
        nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Emission Strength'].default_value = 0.0
        bsdf.inputs['Roughness'].default_value = 0.8

for img in bpy.data.images:
    if img.size[0] > 1024:
        img.scale(1024, 1024)
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
mesh.select_set(True)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True,
                          export_image_format='JPEG', export_jpeg_quality=85, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_skins=True, export_yup=True,
                          export_force_sampling=True)
print("EXPORTED")

# ---- preview renders of key poses ----
scn = bpy.context.scene
scn.render.engine = 'BLENDER_WORKBENCH'
scn.display.shading.color_type = 'TEXTURE'
scn.render.resolution_x = 400
scn.render.resolution_y = 500
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scn.collection.objects.link(cam)
scn.camera = cam
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.3
cam.location = (4, -4, 1.0)
cam.rotation_euler = (D(90), 0, D(45))
for tr in rig.animation_data.nla_tracks:
    tr.mute = True
for nm, fr in [('Walk', 6), ('Run', 4), ('Jump', 7), ('Collect', 12), ('Celebrate', 6)]:
    rig.animation_data.action = bpy.data.actions[nm]
    scn.frame_set(fr)
    scn.render.filepath = out_blend.replace('.blend', '_' + nm + '.png')
    bpy.ops.render.render(write_still=True)
