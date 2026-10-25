// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE DRAFTING SYMBOL FOR EACH FINISH AND PRODUCT
 *
 * Construction drawings say what a thing is made of by how its cut is
 * hatched: the MATERIAL INDICATIONS of the US National CAD Standard (NCS,
 * Uniform Drawing System module 4, "Symbols"), as Architectural Graphic
 * Standards draws them, and the AutoCAD hatch of the same name in acad.pat
 * that a DXF carries. This is the catalogue of the ones a room's finishes and
 * treatments need; every palette item names one (`symbol`), and the CAD draws
 * it in its palette preview (CAD.Like.audio model/palette/materialSymbols.ts
 * keeps the drawings — the two lists share their ids).
 *
 * Each entry: `name` as the standard calls it, `acad` the nearest acad.pat
 * pattern (ANSI31–38 are the ANSI Y14.2 section linings: 31 iron, brick,
 * stone masonry; 32 steel; 34 plastic, rubber; 36 marble, slate, glass; 37
 * lead, zinc, sound, heat and electrical insulation), and `drawn` how a
 * section shows it. Acoustic treatments have no symbol of their own in the
 * standard; they are drawn as what they are built of — a porous panel is
 * batt or rigid insulation behind a fabric face, a QRD wells of wood — and
 * the catalogue says so.
 */
export const SYMBOLS = {
  batt: { name: 'Batt insulation', acad: 'INSUL', drawn: 'a continuous loop across the cavity, between two thin lines' },
  rigid: { name: 'Rigid insulation (board)', acad: 'ANSI37', drawn: 'crossed diagonals in each board-width cell' },
  foam: { name: 'Foam (open cell)', acad: 'AR-SAND', drawn: 'rigid insulation’s outline, a dense stipple inside' },
  concrete: { name: 'Concrete', acad: 'AR-CONC', drawn: 'random stipple with triangles for the aggregate' },
  cmu: { name: 'Concrete masonry unit (block)', acad: 'ANSI37', drawn: 'crossed 45° lines; cores shown where cut' },
  brick: { name: 'Brick', acad: 'ANSI31', drawn: '45° lines, closely spaced' },
  stone: { name: 'Stone, marble, slate', acad: 'ANSI36', drawn: '45° lines broken into dashes and dots' },
  tile: { name: 'Ceramic tile, terrazzo', acad: 'ANSI31', drawn: 'a thin layer, joints at intervals, 45° within' },
  gypsum: { name: 'Gypsum board, plaster', acad: 'AR-SAND', drawn: 'a fine stipple in a thin layer' },
  wood: { name: 'Wood, finish', acad: 'AR-PARQ1', drawn: 'grain lines along the piece' },
  blocking: { name: 'Wood, framing or blocking (rough)', acad: 'ANSI31', drawn: 'a single X through each member' },
  plywood: { name: 'Plywood', acad: 'ANSI31', drawn: 'laminations: parallel lines along the sheet' },
  glass: { name: 'Glass', acad: 'ANSI36', drawn: 'two or three thin parallel lines, the pane edge-on' },
  metal: { name: 'Steel and metal', acad: 'ANSI32', drawn: '45° lines in pairs; thin plate solid' },
  acoustic: { name: 'Acoustic ceiling tile', acad: 'AR-SAND', drawn: 'a stipple with the tile joints, on its grid' },
  carpet: { name: 'Carpet, resilient flooring', acad: 'FLEX', drawn: 'a wavy line in a thin layer on the floor' },
  fabric: { name: 'Fabric, curtain', acad: 'FLEX', drawn: 'a loose wave, its folds' },
  cork: { name: 'Cork', acad: 'CORK', drawn: 'stipple with short dashes' },
  rubber: { name: 'Rubber, plastic', acad: 'ANSI34', drawn: '45° lines alternating heavy and light' },
  earth: { name: 'Earth', acad: 'EARTH', drawn: 'short grouped strokes at right angles' },
  water: { name: 'Water', acad: 'LINE', drawn: 'broken horizontal ripples' },
  air: { name: 'Air space', acad: null, drawn: 'left empty' },
  qrd: { name: 'Diffuser, wells (QRD)', acad: null, drawn: 'not in the standard — wood fins with wells of stepped depths' },
  skyline: { name: 'Diffuser, blocks (2-D)', acad: null, drawn: 'not in the standard — wood blocks of stepped heights' },
  slat: { name: 'Slat resonator', acad: null, drawn: 'not in the standard — wood slats with gaps over batt insulation' },
  perforated: { name: 'Perforated panel resonator', acad: null, drawn: 'not in the standard — a holed board over batt insulation' },
  membrane: { name: 'Membrane (panel) absorber', acad: null, drawn: 'not in the standard — a limp sheet on a sealed cavity, insulation inside' },
  trap: { name: 'Bass trap, corner', acad: 'INSUL', drawn: 'batt insulation filling a corner triangle' },
  furniture: { name: 'Furniture, equipment', acad: null, drawn: 'not a section — drawn in plan as its outline' },
  opening: { name: 'Opening', acad: null, drawn: 'an X across the opening' },
};

/** The rules, first match wins: what a material's id, name, category or Acoustic X material field says it is. */
const RULES = [
  [/opening|void/, 'opening'],
  // a finish laid on something is drawn as the finish: parquet, carpet, linoleum, rubber or cork on concrete
  [/parquet|wood floor|floorboard/, 'wood'],
  [/acoustic (ceiling )?tile|ceiling tile|lay-?in/, 'acoustic'],
  [/carpet|linoleum|vinyl (floor|tile|sheet)|\brug\b/, 'carpet'],
  [/cork/, 'cork'],
  [/rubber|neoprene/, 'rubber'],
  [/qrd|diffus|omniff|diffract|flutter|pyramid|skyline/, (t) => (/skyline|block|blox|pyramid|2-?d/.test(t) ? 'skyline' : 'qrd')],
  [/slat/, 'slat'],
  [/perforat|perf\b|helmholtz/, 'perforated'],
  [/membrane|diaphragm|panel absorber|limp/, 'membrane'],
  [/trap|corner absorber/, 'trap'],
  [/cloud/, 'batt'],
  // fibreglass is insulation, not glass: a board when it is rigid or faced, a blanket otherwise
  [/fiber ?glass|fibre ?glass/, (t) => (/blanket|batt|loose/.test(t) ? 'batt' : 'rigid')],
  [/casing|trim/, 'wood'],
  [/glass|window|glazing/, 'glass'],
  [/concrete|cement/, (t) => (/block|cmu/.test(t) ? 'cmu' : 'concrete')],
  [/\bblock\b|cmu|cinder/, 'cmu'],
  [/brick/, 'brick'],
  [/marble|stone|slate|granite/, 'stone'],
  [/ceramic|terrazzo|tile floor|quarry/, 'tile'],
  [/plywood/, 'plywood'],
  [/gypsum|drywall|plaster|plasterboard/, 'gypsum'],
  [/foam|sonex|melamine|polyurethane/, 'foam'],
  [/fiberboard|fibreboard|rigid|board|af\d|ap,|ias/, 'rigid'],
  [/wool|mineral|batt|cellulose|porous|absorber|fluff/, 'batt'],
  [/curtain|drape|fabric|velour|banner/, 'fabric'],
  [/plastic/, 'rubber'],
  [/steel|metal|alumin|iron/, 'metal'],
  [/soil|earth|grass|snow|gravel/, 'earth'],
  [/water|pool/, 'water'],
  [/desk|console|table|couch|chair|rack|drum|amp\b|seat|furniture|instrument|piano/, 'furniture'],
  [/wood|timber|floor|door|panel/, 'wood'],
];

/** The symbol id for a material — { id, name, category, material? } — and, given, the product it is the face of. */
export function symbolOf(mat, product = null) {
  const text = [product?.id, product?.name, mat?.id, mat?.name, mat?.material, mat?.category].filter(Boolean).join(' ').toLowerCase();
  if (product && /desk|console|table|couch|chair|rack|drum|amp|piano|keyboard|organ|hammond|leslie/.test(text)) return 'furniture';
  for (const [re, id] of RULES) if (re.test(text)) return typeof id === 'function' ? id(text) : id;
  if (mat?.category === 'Furniture' || mat?.category === 'Instruments') return 'furniture';
  return mat?.category === 'Masonry' ? 'concrete' : 'gypsum';
}
