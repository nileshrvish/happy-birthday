import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=sys.argv[-2])
o = [x for x in bpy.data.objects if x.type=='MESH'][0]
o.name = "Pooja"
bpy.context.view_layer.objects.active = o
o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
m = o.modifiers.new("dec", 'DECIMATE'); m.ratio = 0.03
bpy.ops.object.modifier_apply(modifier="dec")
print("POLYS", len(o.data.polygons))
# move feet to origin
import mathutils
zs=[v.co.z for v in o.data.vertices]; xs=[v.co.x for v in o.data.vertices]; ys=[v.co.y for v in o.data.vertices]
print("BOUNDS", min(xs),max(xs),min(ys),max(ys),min(zs),max(zs))
bpy.ops.wm.save_as_mainfile(filepath=sys.argv[-1])
# render front + side
scn=bpy.context.scene
scn.render.engine='BLENDER_WORKBENCH'; scn.display.shading.color_type='TEXTURE'
scn.render.resolution_x=512; scn.render.resolution_y=768
cam=bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); scn.collection.objects.link(cam); scn.camera=cam
cam.data.type='ORTHO'; cam.data.ortho_scale=2.1
cz=(min(zs)+max(zs))/2
for name,loc,rot in [("front",(0,-5,cz),(1.5708,0,0)),("side",(5,0,cz),(1.5708,0,1.5708))]:
    cam.location=loc; cam.rotation_euler=rot
    scn.render.filepath=sys.argv[-1].replace(".blend",f"_{name}.png")
    bpy.ops.render.render(write_still=True)
