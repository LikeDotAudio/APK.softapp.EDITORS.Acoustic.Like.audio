// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
/** Small form builders, so every parameter in the inspector is one line. */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const row = (label, ...controls) => h('label', { class: 'row' }, h('span', {}, label), ...controls);

export function num(value, onChange, { step = 0.01, min, max, unit = '' } = {}) {
  const input = h('input', { type: 'number', step, min, max, value: Number.isFinite(value) ? +(+value).toFixed(4) : '' });
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) onChange(v);
  });
  return unit ? h('span', { class: 'unit' }, input, h('em', {}, unit)) : input;
}

export function text(value, onChange) {
  const input = h('input', { type: 'text', value: value ?? '' });
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

export function select(value, options, onChange) {
  const el = h('select', {});
  for (const o of options) {
    if (o.group) {
      const g = h('optgroup', { label: o.group });
      for (const x of o.items) g.append(h('option', { value: x.value, selected: String(x.value) === String(value) }, x.label));
      el.append(g);
    } else el.append(h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label));
  }
  el.addEventListener('change', () => onChange(el.value));
  return el;
}

export function check(value, onChange, label = '') {
  const input = h('input', { type: 'checkbox', checked: !!value });
  input.addEventListener('change', () => onChange(input.checked));
  return label ? h('label', { class: 'check' }, input, label) : input;
}

export function slider(value, min, max, step, onInput) {
  const input = h('input', { type: 'range', min, max, step, value });
  input.addEventListener('input', () => onInput(parseFloat(input.value)));
  return input;
}

export const button = (label, onClick, attrs = {}) => h('button', { ...attrs, onclick: onClick }, label);

export function download(name, data, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
