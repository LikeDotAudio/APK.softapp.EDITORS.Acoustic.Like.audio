// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/**
 * THE VALIDATOR BOTH SIDES OF A CONTRACT RUN
 *
 * A small, dependency-free JSON Schema checker: enough of draft 2020-12 for
 * the schemas in this directory and no more — `type`, `const`, `enum`,
 * `required`, `properties`, `additionalProperties`, `items`, `minItems`,
 * `maxItems`, `minimum`, `anyOf` and local `$ref`s (`#/$defs/<name>`). A
 * keyword it does not know is an error, so a schema can never quietly ask for
 * more than is being checked.
 *
 * It is shipped WITH the contract, so the supplier (this repo, under vitest)
 * and every consumer (a host softapp's node:test) check the same samples with
 * the same code. Vendor this whole directory; do not reimplement it.
 *
 *   import { validate, validateMessage } from './validate.mjs';
 *   validate(schema, value)                    → [] or ['$.a.b: why', …]
 *   validateMessage(schema, 'toCad', message)  → the same, picking the
 *                                                 schema's `$defs['toCad.<type>']`
 *
 * Run it (`node contract/validate.mjs`) and it checks every contract beside
 * it: each `<name>@<n>/` directory's samples.json against its *.schema.json.
 * A direction (`toCad`, `toHost`, `toEditor` — any samples key with
 * `$defs['<key>.<type>']`) must carry exactly one valid sample of every type;
 * any other key is checked against the `$defs` entry of that name, or must fit
 * at least one of them. Exit 0 when every sample fits, 1 otherwise. Imported
 * (a test, a browser), it does nothing on its own.
 */

const KNOWN = new Set([
  '$schema', '$id', '$ref', '$defs', '$comment', 'title', 'description', 'examples',
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'maxItems', 'minimum', 'exclusiveMinimum', 'anyOf',
]);

const typeOf = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
};
const isType = (v, t) => {
  const actual = typeOf(v);
  return actual === t || (t === 'number' && actual === 'integer');
};

function resolveRef(root, ref) {
  const m = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!m || !root.$defs || !(m[1] in root.$defs)) throw new Error(`unresolvable $ref ${ref}`);
  return root.$defs[m[1]];
}

function check(root, schema, value, path, out) {
  if (schema === true || schema === undefined) return;
  if (schema === false) { out.push(`${path}: not allowed`); return; }
  for (const k of Object.keys(schema)) if (!KNOWN.has(k) && !k.startsWith('x-')) throw new Error(`validate.mjs does not implement "${k}" (at ${path})`);
  if (schema.$ref) check(root, resolveRef(root, schema.$ref), value, path, out);
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => isType(value, t))) { out.push(`${path}: expected ${types.join(' | ')}, got ${typeOf(value)}`); return; }
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) out.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) out.push(`${path}: expected one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`);
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) out.push(`${path}: below ${schema.minimum}`);
  if (schema.exclusiveMinimum !== undefined && typeof value === 'number' && value <= schema.exclusiveMinimum) out.push(`${path}: not above ${schema.exclusiveMinimum}`);
  if (schema.anyOf) {
    const fits = schema.anyOf.some((s) => { const o = []; check(root, s, value, path, o); return o.length === 0; });
    if (!fits) out.push(`${path}: matches none of anyOf`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${path}: more than ${schema.maxItems} items`);
    if (schema.items !== undefined) value.forEach((v, i) => check(root, schema.items, v, `${path}[${i}]`, out));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) out.push(`${path}: missing "${k}"`);
    const props = schema.properties ?? {};
    for (const [k, v] of Object.entries(value)) {
      if (k in props) check(root, props[k], v, `${path}.${k}`, out);
      else if (schema.additionalProperties !== undefined) check(root, schema.additionalProperties, v, `${path}.${k}`, out);
    }
  }
}

/** Everything wrong with `value` against `schema` (a root schema, so its `$defs` resolve). Empty when it fits. */
export function validate(schema, value, root = schema) {
  const out = [];
  check(root, schema, value, '$', out);
  return out;
}

/** A message of `direction` ('toCad' | 'toHost'), checked against its type's definition. An unknown type is itself an error. */
export function validateMessage(schema, direction, message) {
  const type = message && typeof message === 'object' ? message.type : undefined;
  const def = schema.$defs?.[`${direction}.${type}`];
  if (!def) return [`$.type: ${JSON.stringify(type)} is not a ${direction} message of ${schema['x-protocol'] ?? 'this protocol'}`];
  return validate(def, message, schema);
}

/** The message types a direction carries, from the schema's `$defs` keys. */
export function messageTypes(schema, direction) {
  return Object.keys(schema.$defs ?? {}).filter((k) => k.startsWith(`${direction}.`)).map((k) => k.slice(direction.length + 1)).sort();
}

/** Every problem with one contract directory's samples (see the header). */
export function checkSamples(schema, samples) {
  const out = [];
  const defs = schema.$defs ?? {};
  for (const [key, value] of Object.entries(samples)) {
    if (key.startsWith('$')) continue;
    const types = messageTypes(schema, key);
    if (types.length && Array.isArray(value)) {
      const seen = value.map((m) => m?.type).sort();
      if (JSON.stringify(seen) !== JSON.stringify(types)) out.push(`${key}: samples ${JSON.stringify(seen)} are not one of each of ${JSON.stringify(types)}`);
      for (const m of value) for (const e of validateMessage(schema, key, m)) out.push(`${key}.${m?.type}: ${e}`);
    } else if (key in defs) {
      for (const e of validate(defs[key], value, schema)) out.push(`${key}: ${e}`);
    } else if (!Object.values(defs).some((d) => validate(d, value, schema).length === 0)) {
      out.push(`${key}: fits none of the schema's $defs`);
    }
  }
  for (const dir of Object.keys(defs).map((k) => k.split('.')[0]).filter((d, i, a) => a.indexOf(d) === i)) {
    if (messageTypes(schema, dir).length && !(dir in samples)) out.push(`${dir}: no samples for this direction`);
  }
  return out;
}

if (typeof process !== 'undefined' && process.argv?.[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const here = dirname((await import('node:url')).fileURLToPath(import.meta.url));
  let bad = 0;
  for (const dir of readdirSync(here, { withFileTypes: true }).filter((d) => d.isDirectory() && /@\d+$/.test(d.name))) {
    const path = join(here, dir.name);
    const schemaFile = readdirSync(path).find((f) => f.endsWith('.schema.json'));
    if (!schemaFile || !existsSync(join(path, 'samples.json'))) { console.log(`  FAIL ${dir.name}: needs a *.schema.json and a samples.json`); bad++; continue; }
    const schema = JSON.parse(readFileSync(join(path, schemaFile), 'utf8'));
    const samples = JSON.parse(readFileSync(join(path, 'samples.json'), 'utf8'));
    const problems = checkSamples(schema, samples);
    const n = Object.entries(samples).filter(([k]) => !k.startsWith('$')).reduce((a, [, v]) => a + (Array.isArray(v) ? v.length : 1), 0);
    if (problems.length) { bad++; console.log(`  FAIL ${dir.name}`); for (const p of problems) console.log(`       ${p}`); }
    else console.log(`  ok   ${dir.name}: ${n} sample(s) fit ${schemaFile}`);
  }
  process.exit(bad ? 1 : 0);
}
