import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeHtml } from './support/decode-html.mjs';

test('decodes decimal and hexadecimal headline characters', () => {
  assert.equal(decodeHtml('It&#x2019;s Apple&#039;s turn &#8212; now'), 'It’s Apple\'s turn — now');
  assert.equal(decodeHtml('&#X201C;Growth&#x201D; &#128640;'), '“Growth” 🚀');
});
test('decodes named and double-escaped entities', () => {
  assert.equal(decodeHtml('&ldquo;AT&amp;T&rdquo;&nbsp;&ndash; &pound;5'), '“AT&T” – £5');
  assert.equal(decodeHtml('It&amp;#x2019;s a test &amp;amp; more'), 'It’s a test & more');
});
test('preserves unknown, malformed and invalid Unicode entities without throwing', () => {
  const input = '&unknown; &constructor; &#x110000; &#55296; &#0; &#xZZ; &#39';
  assert.equal(decodeHtml(input), input);
});
test('preserves ordinary Unicode, URLs and literal comparison signs', () => {
  const input = 'Türkiye’s growth > 3% — https://example.test/?a=1&b=2';
  assert.equal(decodeHtml(input), input);
});
test('returns markup as inert text rather than creating DOM elements', () => {
  assert.equal(decodeHtml('&lt;script&gt;alert(1)&lt;/script&gt;'), '<script>alert(1)</script>');
});
