// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE SPEAKER IS THE LIBRARY PART (acoustics-3). Every preset box is a part in
 * DATABASE.server.BIM (speakerParts.js maps key → part), and the part is the
 * truth: makeSpeaker() takes its figures from GET <BIM API>/parts/<maker>/<model>
 * — the part's APK_LoudspeakerType, its maker and its cabinet — and, when the
 * library does not answer (a static host, offline), from the same part as
 * speakerParts.js SPEAKER_LIBRARY holds it (written from the library; ROAD-3598
 * answer 8: no preset list is read). The API is same-origin
 * /api/bim unless the page sets window.APK_BIM_API.
 *
 * The saved room embeds each part's own IFC type (GET …/parts/<id>.ifc, as
 * EDITORS.PowerChain does) rather than a stub: loadPartTypes() fetches the
 * .ifc twins the room's speakers name, roomToIfc(model, { types }) copies them in.
 *
 * Both caches are per page: a part read once is not asked for again; a part
 * that did not answer is remembered as absent (null) until clearSpeakerLibrary().
 */

export const bimApi = () => String(globalThis.APK_BIM_API || '/api/bim').replace(/\/$/, '');

/** The URL of a part (ids are <maker>/<model>, lower-case words and dashes); `ext` '.ifc' for its type. */
export function partUrl(pid, ext = '', base = bimApi()) {
  const [maker, model] = String(pid).split('/');
  return `${base}/parts/${encodeURIComponent(maker)}/${encodeURIComponent(model)}${ext}`;
}

const specs = new Map(); // part id → speaker spec (specFromPart) | null when the library did not answer
const types = new Map(); // part id → the part's .ifc text | null

const num = (v) => {
  const x = v && typeof v === 'object' && 'value' in v ? v.value : v;
  return typeof x === 'number' && Number.isFinite(x) ? x : undefined;
};
const word = (v) => (typeof v === 'string' && v.trim() ? v : undefined);
const flag = (v) => (typeof v === 'boolean' ? v : undefined);
const metres = (mm) => (num(mm) > 0 ? +(num(mm) / 1000).toFixed(4) : undefined);

/**
 * The speaker fields (devices.js SPEAKER_SPEC) a BIM part states, from its JSON
 * (apk.bim.part/1): APK_LoudspeakerType, the maker, the cabinet in mm → m. Only
 * what the part says is returned; the caller's preset fills the rest.
 */
export function specFromPart(part) {
  if (!part || typeof part !== 'object') return null;
  const L = part.ifc?.psets?.APK_LoudspeakerType ?? {};
  const phys = part.physical ?? {};
  const spec = {
    sensitivity: num(L.Sensitivity),
    maxSpl: num(L.MaxSpl),
    fLow: num(L.FrequencyLow),
    fHigh: num(L.FrequencyHigh),
    fCross: num(L.CrossoverFrequency),
    lowpass: num(L.LowPass),
    omniBelow: num(L.OmniBelow),
    hCov: num(L.CoverageHorizontal),
    vCov: num(L.CoverageVertical),
    pattern: word(L.Pattern),
    driver: word(L.Driver),
    litres: num(L.EnclosureVolume),
    centerHeight: metres(L.CentreHeight),
    wooferHeight: metres(L.WooferHeight),
    nearField: flag(L.NearField),
    midField: flag(L.MidField),
    mainMonitor: flag(L.MainMonitor),
    maker: word(part.manufacturer),
    w: metres(phys.width_mm),
    h: metres(phys.height_mm),
    d: metres(phys.depth_mm),
  };
  // a cabinet is its three sides or none: boxSize() draws from all three or from the litres
  if (!(spec.w && spec.h && spec.d)) {
    for (const k of ['w', 'h', 'd']) delete spec[k];
  }
  const out = Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== undefined));
  if (word(part.name)) out.name = part.name; // what a box placed by part id alone is called
  return out;
}

/** The library's spec of a part, read already (loadSpeakerParts), or null: then speakerParts.js's copy holds. */
export function partSpec(pid) {
  return (pid && specs.get(String(pid))) || null;
}

/** Has the library been asked about this part (answered or not)? */
export const partAsked = (pid) => specs.has(String(pid));

async function getText(url, accept, fetchFn) {
  try {
    const r = await fetchFn(url, { headers: { Accept: accept } });
    return r.ok ? await r.text() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Read the parts from the library (each once a page) → { found: [pid], missing: [pid] }.
 * Never throws: a part the library does not answer for stays the preset it was.
 */
export async function loadSpeakerParts(ids, { fetchFn = globalThis.fetch, base = bimApi() } = {}) {
  const found = [];
  const missing = [];
  for (const pid of [...new Set([...ids].filter(Boolean).map(String))].sort()) {
    if (!specs.has(pid)) {
      const text = typeof fetchFn === 'function' ? await getText(partUrl(pid, '', base), 'application/json', fetchFn) : null;
      let part = null;
      try { part = text ? JSON.parse(text) : null; } catch (_) { part = null; }
      specs.set(pid, part && String(part.id ?? pid) === pid ? specFromPart(part) : null);
    }
    (specs.get(pid) ? found : missing).push(pid);
  }
  return { found, missing };
}

/** The part ids a room model's speakers name, sorted. */
export function partIdsOf(model) {
  return [...new Set((model?.speakers ?? []).map((s) => s.part).filter(Boolean).map(String))].sort();
}

/**
 * The .ifc types of the parts a room's speakers name (GET …/parts/<id>.ifc, each once a page)
 * → { types: {pid: text}, missing: [pid] }, for roomToIfc(model, { types }). Never throws.
 */
export async function loadPartTypes(model, { fetchFn = globalThis.fetch, base = bimApi() } = {}) {
  const missing = [];
  const out = {};
  for (const pid of partIdsOf(model)) {
    if (!types.has(pid)) {
      const text = typeof fetchFn === 'function' ? await getText(partUrl(pid, '.ifc', base), 'model/step, application/x-step', fetchFn) : null;
      types.set(pid, text && /^\s*ISO-10303-21;/.test(text) ? text : null);
    }
    if (types.get(pid)) out[pid] = types.get(pid);
    else missing.push(pid);
  }
  return { types: out, missing };
}

/** Forget what the library said (tests; a page that switched BIM API). */
export function clearSpeakerLibrary() {
  specs.clear();
  types.clear();
}
