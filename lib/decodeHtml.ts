// Decode provider text without inserting it into the DOM as HTML.
const ENTITIES: Record<string, string> = {
  amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
  hellip: '…', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
  euro: '€', pound: '£', yen: '¥', cent: '¢',
};

export function decodeHtml(value: string): string {
  let result = value;
  // Some feeds escape their entities twice. Bound the work for untrusted input.
  for (let pass = 0; pass < 3; pass++) {
    const decoded = result.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi, (entity, code: string) => {
      if (!code.startsWith('#')) return Object.hasOwn(ENTITIES, code) ? ENTITIES[code] : entity;
      const hex = code[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (point <= 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) return entity;
      return String.fromCodePoint(point);
    });
    if (decoded === result) break;
    result = decoded;
  }
  return result;
}
