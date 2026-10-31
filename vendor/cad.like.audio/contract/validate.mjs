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
 */

const KNOWN = new Set([
  '$schema', '$id', '$ref', '$defs', '$comment', 'title', 'description', 'examples',
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'maxItems', 'minimum', 'anyOf',
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
