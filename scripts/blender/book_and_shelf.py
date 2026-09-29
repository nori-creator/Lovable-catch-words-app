"""
CatchWords の本棚の 3D 部品を Blender で作って GLB に書き出す。

  python book_and_shelf.py <出力フォルダ>   （bpy = Blender 4.5 を Python の部品として使う）

作る物（寸法はメートル。A5 判の上製本＝ハードカバーに合わせる）:
  - Case    … 裏表紙＋丸い背（1つの物）。ボール紙の厚み 2.5mm、角は丸める
  - Front   … 表表紙（**開くため別の物**。原点＝蝶番＝背の付け根）
  - Block   … 本文の紙の束。表紙より 3mm 小さい（「チリ」）。小口はわずかに凹む
  - Band    … 花布（背の上下の飾りの布）
  - Shelf   … 木の棚（板・背板・側板）。角を丸める
  - 木目のテクスチャ（Blender の手続き型の木目を焼き付け: wood.jpg）

本物らしさの要: 表紙と本文の段差（チリ）、背の丸み、蝶番の溝（ミゾ）、角の丸み。
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector

out = sys.argv[-1] if len(sys.argv) > 1 else "."
os.makedirs(out, exist_ok=True)

H, W, T = 0.210, 0.148, 0.040          # 高さ・幅・厚み（A5 の写真集。台紙が厚いので 40mm）
BOARD = 0.0025                           # ボール紙
SQUARE = 0.003                           # チリ
JOINT = 0.006                            # 蝶番の溝の幅

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def bevel(obj, width=0.0012, segs=3):
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = width
    m.segments = segs
    m.limit_method = "ANGLE"
    return m

def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)

def box(name, sx, sy, sz, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return o

def uv_cube(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.cube_project(cube_size=0.21)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)

def uv_planar(obj, fn):
    """頂点の位置から UV を決める（fn(co) -> (u, v)）。文字や写真の向きを揃えるため。"""
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = fn(co)

def shade_smooth(obj, angle=35):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    obj.select_set(False)

# 座標: x = 幅（小口の方が +x）、y = 厚み（表表紙が -y）、z = 高さ。背は x=0。
# ---- 表表紙（原点を蝶番に置く） -------------------------------------------
# 表表紙は -y 側（glTF に書き出すと three.js の +z＝見る人の側になる）。
front = box("Front", W - JOINT, BOARD, H, ((W - JOINT) / 2 + JOINT, -T / 2 + BOARD / 2, 0))
bevel(front, 0.0011)
apply_all(front)
# 原点を蝶番（x=JOINT, y=T/2-BOARD/2）へ
bpy.context.view_layer.objects.active = front
scene.cursor.location = (JOINT, -T / 2 + BOARD / 2, 0)
front.select_set(True)
bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
front.select_set(False)
# 原点＝蝶番なので、ローカルの x は 0（蝶番）〜 W-JOINT（小口）。表紙の絵は x-z に貼る。
uv_planar(front, lambda co: (co.x / (W - JOINT), co.z / H + 0.5))
shade_smooth(front)

# ---- 裏表紙＋丸い背 --------------------------------------------------------
back = box("BackBoard", W - JOINT, BOARD, H, ((W - JOINT) / 2 + JOINT, T / 2 - BOARD / 2, 0))
# 背: 半円の殻（外側の半径 = T/2）を bmesh で作る
bm = bmesh.new()
R_OUT, R_IN, SEG = T / 2, T / 2 - BOARD, 24
rings = []
for zi, z in enumerate((-H / 2, H / 2)):
    ring_o, ring_i = [], []
    for i in range(SEG + 1):
        a = math.pi / 2 + math.pi * i / SEG     # +y から -x を回って -y へ
        # 背は少しだけ平たい（本物の丸背は真円でない）
        ring_o.append(bm.verts.new((math.cos(a) * R_OUT * 0.55 + 0.0005, math.sin(a) * R_OUT, z)))
        ring_i.append(bm.verts.new((math.cos(a) * R_IN * 0.55 + 0.0005, math.sin(a) * R_IN, z)))
    rings.append((ring_o, ring_i))
(o0, i0), (o1, i1) = rings
for i in range(SEG):
    bm.faces.new((o0[i], o0[i + 1], o1[i + 1], o1[i]))
    bm.faces.new((i0[i + 1], i0[i], i1[i], i1[i + 1]))
for i in range(SEG):
    bm.faces.new((o0[i + 1], o0[i], i0[i], i0[i + 1]))
    bm.faces.new((o1[i], o1[i + 1], i1[i + 1], i1[i]))
# 背と板を繋ぐ蝶番の溝（少し凹んだ帯）
spine_mesh = bpy.data.meshes.new("Spine")
bm.to_mesh(spine_mesh)
bm.free()
spine = bpy.data.objects.new("Spine", spine_mesh)
scene.collection.objects.link(spine)
hinge_b = box("HingeB", JOINT + 0.0006, BOARD * 0.7, H, (JOINT / 2 + 0.0003, T / 2 - BOARD * 0.35 - 0.0004, 0))
hinge_f = box("HingeF", JOINT + 0.0006, BOARD * 0.7, H, (JOINT / 2 + 0.0003, -T / 2 + BOARD * 0.35 + 0.0004, 0))
for o in (back, hinge_b):
    bevel(o, 0.0011)
    apply_all(o)
# 裏表紙（＋裏の蝶番）と背（＋表の蝶番）は**別の物**にする: 背には文字を押すので
# 専用の UV（弧に沿って u、高さで v）を持たせる。
bpy.ops.object.select_all(action="DESELECT")
for o in (back, hinge_b):
    o.select_set(True)
bpy.context.view_layer.objects.active = back
bpy.ops.object.join()
case = bpy.context.active_object
case.name = "Case"
uv_planar(case, lambda co: (co.x / W, co.z / H + 0.5))
shade_smooth(case, 40)
bpy.ops.object.select_all(action="DESELECT")
for o in (spine, hinge_f):
    o.select_set(True)
bpy.context.view_layer.objects.active = spine
bpy.ops.object.join()
spine = bpy.context.active_object
spine.name = "Spine"
def spine_uv(co):
    # 背の弧: 角度 a = atan2(y, -x) が -π/2（表側）〜 +π/2（裏側）。u は表側が 0。
    # 蝶番の帯は端に寄せる（文字は真ん中にしか置かない）。
    if co.x > 0.0012:
        return (0.0 if co.y < 0 else 1.0, co.z / H + 0.5)
    a = math.atan2(co.y, -co.x)
    return (0.5 + a / math.pi, co.z / H + 0.5)
uv_planar(spine, spine_uv)
shade_smooth(spine, 60)

# ---- 本文（紙の束） ---------------------------------------------------------
block = box("Block", W - SQUARE - 0.0015, T - 2 * BOARD - 0.0006, H - 2 * SQUARE,
            ((W - SQUARE - 0.0015) / 2 + 0.0015, 0, 0))
# 小口の凹み（丸背の本は小口がわずかに凹む）: 前の面の頂点を y に応じて内へ
me = block.data
for v in me.vertices:
    if v.co.x > (W - SQUARE) * 0.95:
        v.co.x -= 0.0022 * (1 - (2 * v.co.y / (T - 2 * BOARD)) ** 2)
sub = block.modifiers.new("sub", "SUBSURF")
sub.levels = 1
bevel(block, 0.0006, 2)
apply_all(block)
uv_cube(block)
shade_smooth(block, 50)

# ---- 花布 -------------------------------------------------------------------
bands = []
for z in (H / 2 - SQUARE - 0.0006, -H / 2 + SQUARE + 0.0006):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.0012, depth=T - 2 * BOARD - 0.001,
                                        location=(0.0022, 0, z), rotation=(math.pi / 2, 0, 0), vertices=12)
    b = bpy.context.active_object
    bands.append(b)
bpy.ops.object.select_all(action="DESELECT")
for b in bands:
    b.select_set(True)
bpy.context.view_layer.objects.active = bands[0]
bpy.ops.object.join()
band = bpy.context.active_object
band.name = "Band"
shade_smooth(band, 80)

# ---- 棚（1段） --------------------------------------------------------------
SW, SD, ST = 0.40, 0.20, 0.018           # 棚の幅・奥行き・板厚（スマホの縦の画面に2段で収まる幅）
SH = 0.26                                # 1段の内寸の高さ
parts = [
    box("ShelfBoard", SW, SD, ST, (0, 0, -ST / 2)),
    box("ShelfTop", SW, SD, ST, (0, 0, SH + ST / 2)),
    box("ShelfLeft", ST, SD, SH + 2 * ST, (-SW / 2 - ST / 2, 0, SH / 2)),
    box("ShelfRight", ST, SD, SH + 2 * ST, (SW / 2 + ST / 2, 0, SH / 2)),
]
for p in parts:
    bevel(p, 0.0025, 3)
    apply_all(p)
# 背板は +y（奥）。glTF では -z＝見る人から遠い側になる。
back_panel = box("ShelfBack", SW, 0.006, SH, (0, SD / 2 - 0.003, SH / 2))
bpy.ops.object.select_all(action="DESELECT")
for p in parts:
    p.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
shelf = bpy.context.active_object
shelf.name = "Shelf"
uv_cube(shelf)
shade_smooth(shelf, 40)
uv_cube(back_panel)

# 棚の木目を焼き付けるための手続き型の木の材質（Cycles の Bake で画像に）
def wood_bake(path, size=1024):
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 8
    scene.cycles.device = "CPU"
    img = bpy.data.images.new("wood", size, size)
    mat = bpy.data.materials.new("WoodBake")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    outn = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    # 木目は板の長さ方向（U）に流れる。V 方向に細かく、U 方向に長く伸ばす。
    mapn = nt.nodes.new("ShaderNodeMapping")
    mapn.inputs["Scale"].default_value = (0.22, 1.6, 1.0)
    mapn.inputs["Location"].default_value = (0.0, -0.9, 0.0)   # 年輪の中心を板の外へ＝山形の杢
    warp = nt.nodes.new("ShaderNodeTexNoise")          # 年輪のゆるい揺らぎ
    warp.inputs["Scale"].default_value = 1.4
    warp.inputs["Detail"].default_value = 3.0
    warpmix = nt.nodes.new("ShaderNodeMix")
    warpmix.data_type = "VECTOR"
    warpmix.inputs["Factor"].default_value = 0.32
    wave = nt.nodes.new("ShaderNodeTexWave")           # 年輪（筋）
    wave.wave_type = "RINGS"
    wave.rings_direction = "SPHERICAL"
    wave.wave_profile = "SAW"          # 年輪は片側が急（晩材の濃い細線）
    wave.inputs["Scale"].default_value = 7.0
    wave.inputs["Distortion"].default_value = 3.0
    wave.inputs["Detail"].default_value = 4.0
    wave.inputs["Detail Scale"].default_value = 0.8
    pmap = nt.nodes.new("ShaderNodeMapping")           # 導管（細かい点の筋）
    pmap.inputs["Scale"].default_value = (2.0, 260.0, 1.0)
    pores = nt.nodes.new("ShaderNodeTexNoise")
    pores.inputs["Scale"].default_value = 3.0
    pores.inputs["Detail"].default_value = 2.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.60
    ramp.color_ramp.elements[0].color = (0.30, 0.155, 0.072, 1)    # 早材（明るい木肌・線形の色）
    ramp.color_ramp.elements[1].position = 0.92
    ramp.color_ramp.elements[1].color = (0.14, 0.068, 0.030, 1)    # 晩材（濃い細線）
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "FLOAT"
    mix.inputs["Factor"].default_value = 0.30
    img_node = nt.nodes.new("ShaderNodeTexImage")
    img_node.image = img
    nt.links.new(tc.outputs["UV"], mapn.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], warp.inputs["Vector"])
    nt.links.new(mapn.outputs["Vector"], warpmix.inputs["A"])
    nt.links.new(warp.outputs["Color"], warpmix.inputs["B"])
    nt.links.new(warpmix.outputs["Result"], wave.inputs["Vector"])
    nt.links.new(tc.outputs["UV"], pmap.inputs["Vector"])
    nt.links.new(pmap.outputs["Vector"], pores.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], mix.inputs["A"])
    nt.links.new(pores.outputs["Fac"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], ramp.inputs["Fac"])
    # 導管の細い筋を色に掛ける（明るさ 0.82〜1.0）＋板全体のゆるい濃淡
    pr = nt.nodes.new("ShaderNodeMapRange")
    pr.inputs["To Min"].default_value = 0.80
    pr.inputs["To Max"].default_value = 1.04
    nt.links.new(pores.outputs["Fac"], pr.inputs["Value"])
    tone = nt.nodes.new("ShaderNodeTexNoise")
    tone.inputs["Scale"].default_value = 0.8
    tr = nt.nodes.new("ShaderNodeMapRange")
    tr.inputs["To Min"].default_value = 0.86
    tr.inputs["To Max"].default_value = 1.10
    nt.links.new(tc.outputs["UV"], tone.inputs["Vector"])
    nt.links.new(tone.outputs["Fac"], tr.inputs["Value"])
    m1 = nt.nodes.new("ShaderNodeMix")
    m1.data_type = "RGBA"
    m1.blend_type = "MULTIPLY"
    m1.inputs["Factor"].default_value = 1.0
    m2 = nt.nodes.new("ShaderNodeMix")
    m2.data_type = "RGBA"
    m2.blend_type = "MULTIPLY"
    m2.inputs["Factor"].default_value = 1.0
    nt.links.new(ramp.outputs["Color"], m1.inputs[6])
    nt.links.new(pr.outputs["Result"], m1.inputs[7])
    nt.links.new(m1.outputs[2], m2.inputs[6])
    nt.links.new(tr.outputs["Result"], m2.inputs[7])
    nt.links.new(m2.outputs[2], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], outn.inputs["Surface"])
    nt.nodes.active = img_node
    bpy.ops.mesh.primitive_plane_add(size=1)
    plane = bpy.context.active_object
    plane.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT")
    plane.select_set(True)
    bpy.context.view_layer.objects.active = plane
    bpy.ops.object.bake(type="EMIT")
    img.filepath_raw = path
    img.file_format = "JPEG"
    img.save()
    bpy.data.objects.remove(plane)

wood_bake(os.path.join(out, "wood.jpg"))

# 書き出し（材質は three.js 側で付ける。名前で探す）
for name, objs in (("book.glb", (front, case, spine, block, band)), ("shelf.glb", (shelf, back_panel))):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, name), use_selection=True,
                              export_format="GLB", export_materials="NONE",
                              export_yup=True, export_apply=True)
print("done", os.listdir(out))
