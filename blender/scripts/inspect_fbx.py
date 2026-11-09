import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=sys.argv[-1])
for o in bpy.data.objects:
    info = o.type
    if o.type=='MESH': info += f" verts={len(o.data.vertices)} polys={len(o.data.polygons)} mats={[m.name for m in o.data.materials]} dims={tuple(round(d,3) for d in o.dimensions)}"
    if o.type=='ARMATURE': info += f" bones={len(o.data.bones)} {[b.name for b in o.data.bones][:60]}"
    print("OBJ", o.name, info, "parent=", o.parent.name if o.parent else None, "scale", tuple(o.scale))
print("ACTIONS", [(a.name, a.frame_range[:]) for a in bpy.data.actions])
print("IMAGES", [(i.name, i.size[:]) for i in bpy.data.images])
