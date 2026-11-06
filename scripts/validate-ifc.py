# Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
# MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
"""The IfcOpenShell check of an exported room (acoustics-2 VERIFY). Test-time only: IfcOpenShell is
LGPL and never vendored, never loaded by the page.

    python3 -I scripts/validate-ifc.py room.ifc [more.ifc ...]

prints one JSON object per file:
  schema            FILE_SCHEMA (IFC4X3_ADD2 for our export)
  statements        ifcopenshell.validate with express_rules=True: every schema and where-rule finding
  pset_problems     every Pset_ / Qto_ checked against the IFC4X3 templates (name, applicable entity,
                    property, IfcProperty class, measure, enumerator) and every APK_ set against its
                    declaration (DATABASE.server.BIM tools/ifc/apk_psets.py) by the BIM repo's oracle when
                    it is beside this app; any other set must be APK_*
  counts            entities per type the room is made of
  checks            the room's own shape: every IfcWall bounds an IfcSpace, every IfcSpace has
                    Qto_SpaceBaseQuantities.Height (and NetVolume once it has a body), every covering's material has
                    APK_AcousticMaterial whose tables are IfcFrequencyMeasure -> IfcNormalisedRatioMeasure
                    in [0, 1] (IfcRatioMeasure >= 0 for a datasheet quoting more), every speaker is typed SPEAKER, MirrorPair links are mutual and each pair's
                    x sums to 2 * MirrorAxisX, RT60 tables are IfcFrequencyMeasure -> IfcTimeMeasure > 0
Exit status 1 when any file has a statement, a Pset problem or a failed check.
"""
import json
import sys
from pathlib import Path

import ifcopenshell
import ifcopenshell.util.element as UE
import ifcopenshell.util.placement as UP
import ifcopenshell.validate

HERE = Path(__file__).resolve().parent
ORACLE = HERE.parents[5] / "PODS/POD.database/DATABASE.server.BIM/SRC/tools/ifc"


def _oracle():
    if (ORACLE / "oracle.py").exists():
        sys.path.insert(0, str(ORACLE))
        import oracle  # noqa: E402
        return oracle
    return None


def statements(f):
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, log, express_rules=True)
    return [str(s.get("message", s)) if isinstance(s, dict) else str(s) for s in log.statements]


def pset_problems(f):
    oracle = _oracle()
    out = []
    owners = []
    for rel in f.by_type("IfcRelDefinesByProperties"):
        for owner in rel.RelatedObjects:
            owners.append((rel.RelatingPropertyDefinition, owner))
    for t in f.by_type("IfcTypeObject"):
        for p in t.HasPropertySets or []:
            owners.append((p, t))
    for pdef, owner in owners:
        name = pdef.Name or ""
        if name.startswith("APK_"):
            # APK's own sets: declared, property by property, in the BIM repo's tools/ifc/apk_psets.py
            # (apk_psets_acoustic.py); without that repo beside this app only the room's checks below hold
            if oracle:
                out += oracle._check_set(pdef, owner)
            continue
        if not name.startswith(("Pset_", "Qto_")):
            out.append("%s: a set outside ISO must be named APK_*" % name)
            continue
        if oracle:
            out += oracle._check_set(pdef, owner)
    return out


def checks(f):
    bad = []
    spaces = f.by_type("IfcSpace")
    for s in spaces:
        q = UE.get_psets(s).get("Qto_SpaceBaseQuantities", {})
        # a space with no loop yet (an imported room whose walls never closed) has a height but no volume
        if not (q.get("Height", 0) > 0 and (q.get("NetVolume", 0) > 0 or s.Representation is None)):
            bad.append("space %s lacks NetVolume/Height" % s.Name)
    bounded = {r.RelatedBuildingElement.id() for r in f.by_type("IfcRelSpaceBoundary")}
    for w in f.by_type("IfcWall"):
        if w.id() not in bounded:
            bad.append("wall %s bounds no space" % w.Tag)
    for c in f.by_type("IfcCovering"):
        mat = ifcopenshell.util.element.get_material(c)
        if not mat:
            bad.append("covering %s has no material" % c.Name)
            continue
        props = [p for p in (mat.HasProperties or []) if p.Name == "APK_AcousticMaterial"]
        if not props:
            bad.append("covering %s: material %s has no APK_AcousticMaterial" % (c.Name, mat.Name))
            continue
        for p in props[0].Properties:
            if p.is_a("IfcPropertyTableValue") and p.Name in ("SoundAbsorption", "Scattering", "SoundAbsorptionExtended"):
                if any(not d.is_a("IfcFrequencyMeasure") for d in p.DefiningValues):
                    bad.append("%s.%s: defining values not IfcFrequencyMeasure" % (mat.Name, p.Name))
                # a fraction in [0, 1]; a datasheet's Sabine coefficients above 1 stay as they are, as IfcRatioMeasure >= 0
                if any(not ((d.is_a("IfcNormalisedRatioMeasure") and 0 <= d.wrappedValue <= 1) or (d.is_a("IfcRatioMeasure") and d.wrappedValue >= 0)) for d in p.DefinedValues):
                    bad.append("%s.%s: defined values not IfcNormalisedRatioMeasure in [0,1] (or IfcRatioMeasure >= 0)" % (mat.Name, p.Name))
    for e in f.by_type("IfcAudioVisualAppliance"):
        t = UE.get_type(e)
        if not t or t.PredefinedType != e.PredefinedType:
            bad.append("%s %s is not typed by a %s type" % (e.PredefinedType, e.Name, e.PredefinedType))
    # the Virtual Mirror: pairs name each other, and sit mirrored about the axis
    axis = None
    for s in spaces:
        sym = UE.get_psets(s).get("APK_Symmetry", {})
        if "MirrorAxisX" in sym:
            axis = sym["MirrorAxisX"]
    by_gid = {e.GlobalId: e for e in f.by_type("IfcAudioVisualAppliance")}
    for e in by_gid.values():
        twin = UE.get_psets(e).get("APK_SpeakerOccurrence", {}).get("MirrorPair")
        if not twin:
            continue
        o = by_gid.get(twin)
        if not o or UE.get_psets(o).get("APK_SpeakerOccurrence", {}).get("MirrorPair") != e.GlobalId:
            bad.append("MirrorPair of %s is not mutual" % e.Name)
        elif axis is not None:
            xa = UP.get_local_placement(e.ObjectPlacement)[0][3]
            xb = UP.get_local_placement(o.ObjectPlacement)[0][3]
            if abs(xa + xb - 2 * axis) > 0.1:
                bad.append("pair %s/%s is not mirrored about x = %s" % (e.Name, o.Name, axis))
    for s in spaces:
        res = [p for p in UE.get_psets(s, psets_only=True) if p == "APK_AcousticResult"]
        if not res:
            continue
        for d in s.IsDefinedBy:
            pd = getattr(d, "RelatingPropertyDefinition", None)
            if pd is None or pd.Name != "APK_AcousticResult":
                continue
            for p in pd.HasProperties:
                if p.is_a("IfcPropertyTableValue"):
                    if any(not d.is_a("IfcFrequencyMeasure") for d in p.DefiningValues) or any(not (v.is_a("IfcTimeMeasure") and v.wrappedValue > 0) for v in p.DefinedValues):
                        bad.append("%s is not Hz -> IfcTimeMeasure > 0" % p.Name)
    return bad


def main(paths):
    worst = 0
    for path in paths:
        f = ifcopenshell.open(path)
        st = statements(f)
        pp = pset_problems(f)
        ck = checks(f)
        counts = {}
        for e in f:
            counts[e.is_a()] = counts.get(e.is_a(), 0) + 1
        print(json.dumps({"file": path, "schema": f.schema_identifier, "statements": len(st), "first": st[:5],
                          "pset_problems": pp, "checks": ck, "oracle": bool(_oracle()),
                          "counts": {k: counts[k] for k in sorted(counts) if not k.startswith(("IfcCartesian", "IfcDirection", "IfcProperty", "IfcLocal", "IfcAxis"))}}))
        if st or pp or ck:
            worst = 1
    return worst


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
