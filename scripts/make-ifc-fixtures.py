# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""Write the architect's-IFC fixtures tests/ifc.test.mjs opens (acoustics-5). Dev-only: IfcOpenShell
(LGPL) makes them, the committed .ifc files are what the tests read, and nothing here ships.

    cd /tmp && python3 -I <app>/scripts/make-ifc-fixtures.py

  tests/fixtures/cad_spine.ifc       the BIM repo's prototypes/cad_spine.py output, unchanged (IFC4): an
                                     IfcSpace with no geometry, one wall with a FootPrint line, a typed
                                     speaker at (4000, 3000, 1200) mm
  tests/fixtures/architect-room.ifc  what Revit / ArchiCAD / Bonsai hand over (IFC4X3_ADD2, METRES): a
                                     6 x 4.5 m room at an offset storey placement, its footprint an extruded
                                     IfcArbitraryClosedProfileDef, Qto height 2.8 m, four walls with Axis
                                     lines bounding it (IfcRelSpaceBoundary), a layered brick/plaster wall,
                                     a concrete slab with carpet on it, a gypsum ceiling, and a speaker aimed
                                     at 225 deg tilted down 10 deg
"""
import math
import os
import runpy
import shutil
import tempfile
from pathlib import Path

import numpy as np
import ifcopenshell
import ifcopenshell.api as A

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "tests" / "fixtures"
SPINE = HERE.parents[5] / "PODS/POD.database/DATABASE.server.BIM/SRC/tools/ifc/prototypes/cad_spine.py"


def cad_spine():
    with tempfile.TemporaryDirectory() as d:
        cwd = os.getcwd()
        os.chdir(d)
        try:
            runpy.run_path(str(SPINE), run_name="__main__")
        finally:
            os.chdir(cwd)
        shutil.copy(Path(d) / "cadspine.ifc", OUT / "cad_spine.ifc")


def architect_room():
    f = A.run("project.create_file", version="IFC4X3_ADD2")
    p = A.run("root.create_entity", f, ifc_class="IfcProject", name="Architect job 42")
    A.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    model = A.run("context.add_context", f, context_type="Model")
    body = A.run("context.add_context", f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=model)
    axis = A.run("context.add_context", f, context_type="Model", context_identifier="Axis", target_view="GRAPH_VIEW", parent=model)
    site = A.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    bld = A.run("root.create_entity", f, ifc_class="IfcBuilding", name="Studios")
    st = A.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="Level 1")
    sp = A.run("root.create_entity", f, ifc_class="IfcSpace", name="1.04", predefined_type="INTERNAL")
    sp.LongName = "Mix Room"
    A.run("aggregate.assign_object", f, relating_object=p, products=[site])
    A.run("aggregate.assign_object", f, relating_object=site, products=[bld])
    A.run("aggregate.assign_object", f, relating_object=bld, products=[st])
    A.run("aggregate.assign_object", f, relating_object=st, products=[sp])
    for e in (site, bld):
        A.run("geometry.edit_object_placement", f, product=e)
    m = np.eye(4)
    m[0, 3], m[1, 3], m[2, 3] = 10.0, 20.0, 3.5  # the storey sits 10 m, 20 m out and 3.5 m up
    A.run("geometry.edit_object_placement", f, product=st, matrix=m)
    A.run("geometry.edit_object_placement", f, product=sp, matrix=m)
    pts = [(0.0, 0.0), (6.0, 0.0), (6.0, 4.5), (0.0, 4.5)]
    poly = f.createIfcPolyline([f.createIfcCartesianPoint(q) for q in pts + [pts[0]]])
    prof = f.createIfcArbitraryClosedProfileDef("AREA", None, poly)
    solid = f.createIfcExtrudedAreaSolid(prof, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0))), f.createIfcDirection((0.0, 0.0, 1.0)), 2.8)
    A.run("geometry.assign_representation", f, product=sp, representation=f.createIfcShapeRepresentation(body, "Body", "SweptSolid", [solid]))
    q = A.run("pset.add_qto", f, product=sp, name="Qto_SpaceBaseQuantities")
    A.run("pset.edit_qto", f, qto=q, properties={"Height": 2.8, "NetFloorArea": 27.0, "NetVolume": 75.6})

    brick = A.run("material.add_material", f, name="Brick, common", category="brick")
    plaster = A.run("material.add_material", f, name="Gypsum plaster", category="plaster")
    concrete = A.run("material.add_material", f, name="Concrete C30/37", category="concrete")
    carpet = A.run("material.add_material", f, name="Carpet, heavy on felt", category="finish")
    board = A.run("material.add_material", f, name="Plasterboard 12.5", category="gypsum")
    mystery = A.run("material.add_material", f, name="Product XYZ-9", category="")
    lset = A.run("material.add_material_set", f, name="Brick + plaster", set_type="IfcMaterialLayerSet")
    for mat, t in ((plaster, 0.015), (brick, 0.215)):
        layer = A.run("material.add_layer", f, layer_set=lset, material=mat)
        layer.LayerThickness = t
    for i, (a, b) in enumerate(zip(pts, pts[1:] + pts[:1])):
        w = A.run("root.create_entity", f, ifc_class="IfcWall", name="W%d" % (i + 1), predefined_type="SOLIDWALL")
        A.run("geometry.edit_object_placement", f, product=w, matrix=m)
        A.run("spatial.assign_container", f, relating_structure=st, products=[w])
        line = f.createIfcPolyline([f.createIfcCartesianPoint(a), f.createIfcCartesianPoint(b)])
        A.run("geometry.assign_representation", f, product=w, representation=f.createIfcShapeRepresentation(axis, "Axis", "Curve2D", [line]))
        f.createIfcRelSpaceBoundary(ifcopenshell.guid.new(), None, None, None, sp, w, None, "PHYSICAL", "INTERNAL")
        if i == 0:
            A.run("material.assign_material", f, products=[w], type="IfcMaterialLayerSet", material=lset)
        elif i == 1:
            A.run("material.assign_material", f, products=[w], material=mystery)
        else:
            A.run("material.assign_material", f, products=[w], material=board)
    slab = A.run("root.create_entity", f, ifc_class="IfcSlab", name="Floor", predefined_type="FLOOR")
    A.run("spatial.assign_container", f, relating_structure=st, products=[slab])
    A.run("material.assign_material", f, products=[slab], material=concrete)
    f.createIfcRelSpaceBoundary(ifcopenshell.guid.new(), None, None, None, sp, slab, None, "PHYSICAL", "INTERNAL")
    rug = A.run("root.create_entity", f, ifc_class="IfcCovering", name="Carpet", predefined_type="FLOORING")
    A.run("material.assign_material", f, products=[rug], material=carpet)
    f.createIfcRelCoversBldgElements(ifcopenshell.guid.new(), None, None, None, slab, [rug])
    ceil = A.run("root.create_entity", f, ifc_class="IfcCovering", name="Ceiling", predefined_type="CEILING")
    A.run("material.assign_material", f, products=[ceil], material=board)
    f.createIfcRelCoversSpaces(ifcopenshell.guid.new(), None, None, None, sp, [ceil])

    t = A.run("root.create_entity", f, ifc_class="IfcAudioVisualApplianceType", name="genelec/8351", predefined_type="SPEAKER")
    A.run("project.assign_declaration", f, definitions=[t], relating_context=p)
    spk = A.run("root.create_entity", f, ifc_class="IfcAudioVisualAppliance", name="L", predefined_type="SPEAKER")
    A.run("type.assign_type", f, related_objects=[spk], relating_type=t)
    a, tl = math.radians(225), math.radians(-10)
    x = np.array([math.cos(tl) * math.cos(a), math.cos(tl) * math.sin(a), math.sin(tl)])
    z = np.array([-math.sin(tl) * math.cos(a), -math.sin(tl) * math.sin(a), math.cos(tl)])
    mm = np.eye(4)
    mm[:3, 0], mm[:3, 1], mm[:3, 2] = x, np.cross(z, x), z
    mm[:3, 3] = (1.5, 3.4, 1.25)
    A.run("geometry.edit_object_placement", f, product=spk, matrix=m @ mm)
    A.run("spatial.assign_container", f, relating_structure=sp, products=[spk])
    f.write(str(OUT / "architect-room.ifc"))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    cad_spine()
    architect_room()
    print("wrote", sorted(p.name for p in OUT.glob("*.ifc")))
