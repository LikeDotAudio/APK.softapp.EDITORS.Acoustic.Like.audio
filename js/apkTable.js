// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// THE ONE TABLE (ROAD-3494). Every table this app draws is an APKTable
// (vendor/apk-table, held to /FrontEnd/shared by check.sh webshared), so any
// script reaches it as APKTable.get('<id>'). Two shapes:
//   tableHtml()     — a table in an HTML string this page writes itself (the
//                     wall builder's cards, the help chapters): APKTable.markup(),
//                     adopted when it lands (call APKTable.scan(root) to have it now).
//   tableSnapshot() — a table for a document opened outside this page (the
//                     printed report): drawn by APKTable.create, every cell text,
//                     and handed over as that drawn table's markup.

const T = () => {
  const t = globalThis.APKTable;
  if (!t) throw new Error('vendor/apk-table/apk-table.js is not loaded');
  return t;
};

/** A table as markup: `head` and `body` are the inner HTML of its thead / tbody,
 *  already escaped by the caller. */
export function tableHtml(id, { className = '', head = '', body = '', sortable } = {}) {
  const o = { id, className, head, body };
  if (sortable !== undefined) o.sortable = sortable;
  return T().markup(o);
}

/** Upgrade the tables just written into `root`, now rather than on the next tick. */
export function standIn(root) {
  const t = globalThis.APKTable;
  return t && root ? t.scan(root) : [];
}

/** A table drawn by APKTable as text cells, returned as its markup and forgotten. */
export function tableSnapshot(id, head, rows) {
  const host = globalThis.document.createElement('div');
  const width = Math.max(head ? head.length : 0, ...rows.map((r) => r.length));
  const columns = Array.from({ length: width }, (_, i) => ({ key: `c${i}`, label: head && head[i] !== undefined ? String(head[i]) : '' }));
  const handle = T().create(host, {
    id, editable: false, sortable: false, toolbar: false, columns,
    rows: rows.map((r) => Object.fromEntries(r.map((v, i) => [`c${i}`, v ?? '']))),
  });
  const html = handle.el.outerHTML;
  handle.destroy();
  return html;
}
