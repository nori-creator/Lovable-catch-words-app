"""
Pro の「撮った物を 3D で手に入れる」の **Blender の仕上げの段**（オーナー指示 2026-09-28 R14
「3DのモデリングはBlenderや先ほど送ったgithubの情報をもとに開発をすすめて。まだ実装しない」）。

添付の GitHub（ahujasid「Camera to 3D」, MIT）の流れは:
  写真 → Gemini で背景を抜く → Tripo3D で形（先に粗い形・次に色付き）→ Blender へ送る
その最後の「Blender へ送る」を、**アプリで配れる形に整える段**としてここに置く。
Tripo の返す GLB はそのままだと
  ・原点が物の中心から外れていて、回すと物が円を描いてぶれる
  ・大きさがまちまち（数 cm〜数 m）で、画面に置くたびに寄り・引きが変わる
  ・面の数が多い（数万〜十数万）と、スマホで回す時に重い
  ・複数の部品に分かれ、影の付き方が部品ごとにずれる
ので、ここで揃える。

  python object3d_clean.py <入力.glb> <出力.glb> [--faces 12000] [--height 1.0]
  python object3d_clean.py --demo <出力.glb>     # 見本（タピオカミルクティー）を Blender で作る

やること（順番どおり）:
  1. 読み込み、メッシュを1つに合わせる（材質は残す）
  2. 面が多ければ減らす（Decimate。形の輪郭を保つ collapse）
  3. 下の真ん中を原点にする（回しても軸がぶれない・床に立つ）
  4. いちばん長い辺を --height（既定 1.0）に合わせる
  5. なめらかな陰影（角度で分ける Auto Smooth 相当）
  6. GLB に書き出す（Draco で形を圧縮。three.js の DRACOLoader で読む）

本番には**まだ入れない**。サーバ（Supabase の Edge Function など）では Blender を動かせない
ので、本番にするときは「保存の直後に別の仕事の箱（キュー）で動かす」形になる — 手順は
`docs/object3d-pipeline.md`。
"""
import bpy, bmesh, math, sys, os
from mathutils import Vector


def args():
    a = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else sys.argv[1:]
    opt = {"faces": 12000, "height": 1.0, "demo": False, "draco": True}
    pos = []
    i = 0
    while i < len(a):
        if a[i] == "--faces":
            opt["faces"] = int(a[i + 1]); i += 2
        elif a[i] == "--height":
            opt["height"] = float(a[i + 1]); i += 2
        elif a[i] == "--demo":
            opt["demo"] = True; i += 1
        elif a[i] == "--no-draco":
            opt["draco"] = False; i += 1
        else:
            pos.append(a[i]); i += 1
    return opt, pos


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def mat(name, color, rough=0.5, metal=0.0, alpha=1.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if alpha < 1.0:
        p.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND" if hasattr(m, "blend_method") else None
    if transmission and "Transmission Weight" in p.inputs:
        p.inputs["Transmission Weight"].default_value = transmission
    return m


def demo_bubble_tea():
    """見本: 透明なカップ・ミルクティー・黒い粒・ふた・ストロー。Tripo の出力の代わり。"""
    parts = []
    # カップ（少し下すぼまりの円筒、上が開いている）
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.30, radius2=0.36, depth=1.0, end_fill_type="NOTHING")
    cup = bpy.context.object
    cup.name = "Cup"
    cup.data.materials.append(mat("Cup", (0.95, 0.97, 1.0), rough=0.05, alpha=0.35, transmission=0.9))
    mod = cup.modifiers.new("thick", "SOLIDIFY"); mod.thickness = 0.012
    parts.append(cup)
    # 中のミルクティー
    bpy.ops.mesh.primitive_cone_add(vertices=64, radius1=0.285, radius2=0.335, depth=0.82, location=(0, 0, -0.08))
    tea = bpy.context.object
    tea.name = "Tea"
    tea.data.materials.append(mat("Tea", (0.78, 0.55, 0.36), rough=0.35))
    parts.append(tea)
    # 黒い粒（タピオカ）— 底にランダムに
    import random
    random.seed(7)
    pearl = mat("Pearl", (0.06, 0.04, 0.03), rough=0.2)
    for k in range(26):
        r = random.uniform(0, 0.22)
        a = random.uniform(0, math.tau)
        z = -0.46 + random.uniform(0, 0.16)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=0.05, location=(r * math.cos(a), r * math.sin(a), z))
        o = bpy.context.object
        o.data.materials.append(pearl)
        parts.append(o)
    # ふた（ドーム）
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=16, radius=0.37, location=(0, 0, 0.5))
    lid = bpy.context.object
    lid.name = "Lid"
    bm = bmesh.new(); bm.from_mesh(lid.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.001], context="VERTS")
    bm.to_mesh(lid.data); bm.free()
    lid.scale.z = 0.35
    lid.data.materials.append(mat("Lid", (0.98, 0.98, 1.0), rough=0.1, alpha=0.5, transmission=0.8))
    parts.append(lid)
    # ストロー（少し傾けた青い筒）
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.045, depth=1.3, location=(0.08, 0, 0.45), rotation=(0, math.radians(8), 0))
    straw = bpy.context.object
    straw.name = "Straw"
    straw.data.materials.append(mat("Straw", (0.2, 0.45, 0.95), rough=0.3))
    parts.append(straw)
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = cup
    # 修飾（厚み）を形に確定してから合わせる
    for o in parts:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def join_meshes():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("メッシュがありません")
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # 親子関係の変形を形に焼き付けてから合わせる（部品ごとの傾きがずれない）
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    # 使われていない空の入れ物は消す
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    return obj


def faces(obj):
    return len(obj.data.polygons)


def decimate(obj, target):
    n = faces(obj)
    if n <= target:
        return n
    mod = obj.modifiers.new("dec", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = max(0.02, target / n)
    mod.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return faces(obj)


def normalize(obj, height):
    # 下の真ん中を原点に。three.js の上は +Y、Blender の上は +Z（GLB 書き出しで直る）
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    mx = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    size = mx - mn
    longest = max(size.x, size.y, size.z) or 1.0
    s = height / longest
    center_bottom = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    obj.location -= center_bottom
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
    obj.scale = (s, s, s)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return tuple(round(v * s, 3) for v in size)


def smooth(obj):
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    except Exception:
        bpy.ops.object.shade_smooth()


def export(path, draco):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    kw = dict(filepath=path, export_format="GLB", use_selection=False, export_apply=True)
    if draco:
        kw.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
    bpy.ops.export_scene.gltf(**kw)


def main():
    opt, pos = args()
    reset()
    if opt["demo"]:
        out = pos[0] if pos else "demo.glb"
        demo_bubble_tea()
    else:
        if len(pos) < 2:
            raise SystemExit(__doc__)
        src, out = pos[0], pos[1]
        bpy.ops.import_scene.gltf(filepath=src)
    obj = join_meshes()
    before = faces(obj)
    after = decimate(obj, opt["faces"])
    size = normalize(obj, opt["height"])
    smooth(obj)
    export(out, opt["draco"])
    kb = os.path.getsize(out) / 1024
    print(f"faces {before} -> {after}, size {size} m, {kb:.0f} KB -> {out}")


main()
