// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { renderMarkdown, slug } from '../js/acoustx/markdown.js';

test('headings, lists, tables, links and math come out as the help window needs them', () => {
  const html = renderMarkdown('# A title\n\nSome **bold** and *it* with `x<y` and $c = f\\lambda$.\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | $\\lvert x \\rvert$ |\n\n$$\nT = 0.161V/A\n$$\n\nSee [ch 3](03-modal-response.md#the-math).');
  assert.match(html, /<h1 id="a-title">A title<\/h1>/);
  assert.match(html, /<b>bold<\/b> and <i>it<\/i>/);
  assert.match(html, /<code>x&lt;y<\/code>/);
  assert.match(html, /<span class="math" data-tex="c = f\\lambda">/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<table><thead><tr><th>a<\/th><th>b<\/th><\/tr><\/thead><tbody><tr><td>1<\/td>/);
  assert.match(html, /<div class="math display" data-tex="T = 0.161V\/A">/);
  assert.match(html, /<a href="03-modal-response.md#the-math" data-href="03-modal-response.md#the-math">ch 3<\/a>/);
  assert.equal(slug('3 · Modal Response'), '3--modal-response');
});

test('no markup gets through from a chapter', () => {
  assert.doesNotMatch(renderMarkdown('<script>alert(1)</script> and <img src=x onerror=y>'), /<script|<img/);
});

test('every documentation chapter renders, with its math kept whole', () => {
  for (const dir of ['Documentation/acoustic-x', 'Documentation/acoustics'])
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const md = readFileSync(`${dir}/${f}`, 'utf8');
      const html = renderMarkdown(md);
      assert.ok(html.length > md.length * 0.5, `${f} rendered short`);
      // every display block opened is closed: no stray $$ left in the text
      assert.doesNotMatch(html.replace(/data-tex="[^"]*"/g, ''), /\$\$/, `${f}: unclosed $$`);
    }
});
