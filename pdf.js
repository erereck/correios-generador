(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CorreiosPdf = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const A4 = { width: 595.28, height: 841.89 };

  function sanitize(value) {
    return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }

  function formatDatePtBr(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return sanitize(iso);
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function joinNatural(items) {
    const clean = items.map(sanitize).filter(Boolean);
    if (clean.length <= 1) return clean[0] || '';
    if (clean.length === 2) return `${clean[0]} e ${clean[1]}`;
    return `${clean.slice(0, -1).join(', ')} e ${clean.at(-1)}`;
  }

  function personDocs(person) {
    const rg = sanitize(person.rg);
    const cpf = sanitize(person.cpf);
    if (rg) return `do RG ${rg} e do CPF ${cpf}`;
    return `do CPF ${cpf}`;
  }

  function buildAuthorizationText(data) {
    const recipient = data.recipient || {};
    const collector = data.collector || {};
    const tracking = (data.tracking || []).map(sanitize).filter(Boolean);
    const recipientWord = recipient.gender === 'm' ? 'portador' : 'portadora';
    const collectorWord = collector.gender === 'f' ? 'portadora' : 'portador';
    const collectorArticle = collector.gender === 'f' ? 'a' : 'o';
    const isPlural = tracking.length !== 1;
    const packagePhrase = isPlural ? 'as encomendas que estão destinadas' : 'a encomenda que está destinada';
    const trackingPhrase = isPlural ? 'com os seguintes números de rastreio' : 'com o seguinte número de rastreio';

    return `Eu ${sanitize(recipient.name)}, ${recipientWord} ${personDocs(recipient)}, autorizo ${collectorArticle} ${sanitize(collector.name)}, ${collectorWord} ${personDocs(collector)}, a receber ${packagePhrase} a mim, aguardando retirada nesta agência dos Correios, ${trackingPhrase} ${joinNatural(tracking)}, no dia ${formatDatePtBr(data.date)}.`;
  }

  function cp1252Byte(ch) {
    const code = ch.charCodeAt(0);
    if (code <= 0x7f || (code >= 0xa0 && code <= 0xff)) return code;
    const map = {
      0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
      0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
      0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
      0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
      0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
      0x017e: 0x9e, 0x0178: 0x9f
    };
    return map[code] ?? 0x3f;
  }

  function bytes(str) {
    const out = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) out[i] = cp1252Byte(str[i]);
    return out;
  }

  function concat(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }

  function escapePdfLiteral(text) {
    return sanitize(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  function estimatedCharWidth(ch, fontSize) {
    if (ch === ' ') return fontSize * 0.28;
    if ('ilI.,:;!|\'`'.includes(ch)) return fontSize * 0.24;
    if ('mwMW@%&'.includes(ch)) return fontSize * 0.78;
    if (/[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9]/.test(ch)) return fontSize * 0.58;
    return fontSize * 0.49;
  }

  function estimatedTextWidth(text, fontSize) {
    return [...text].reduce((sum, ch) => sum + estimatedCharWidth(ch, fontSize), 0);
  }

  function wrapText(text, maxWidth, fontSize) {
    const words = sanitize(text).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || estimatedTextWidth(candidate, fontSize) <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function padOffset(n) {
    return String(n).padStart(10, '0');
  }

  function createAuthorizationPdfBytes(data) {
    const fontSize = 15;
    const leading = 22.5;
    const marginX = 68;
    const maxWidth = A4.width - marginX * 2;
    const text = buildAuthorizationText(data);
    const lines = wrapText(text, maxWidth, fontSize);

    const operators = [
      'BT',
      '/F1 15 Tf',
      `${leading.toFixed(2)} TL`,
      `${marginX} 758 Td`,
      ...lines.flatMap((line, index) => index === 0 ? [`(${escapePdfLiteral(line)}) Tj`] : ['T*', `(${escapePdfLiteral(line)}) Tj`]),
      'ET',
      '0.75 w',
      `${marginX} 137 m`,
      `${(A4.width - marginX).toFixed(2)} 137 l`,
      'S',
      ''
    ].join('\n');

    const contentBytes = bytes(operators);
    const objects = [
      bytes('<< /Type /Catalog /Pages 2 0 R >>'),
      bytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
      bytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.width} ${A4.height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`),
      bytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),
      concat([bytes(`<< /Length ${contentBytes.length} >>\nstream\n`), contentBytes, bytes('endstream')])
    ];

    const header = bytes('%PDF-1.4\n%âãÏÓ\n');
    const parts = [header];
    const offsets = [0];
    let cursor = header.length;

    objects.forEach((obj, i) => {
      offsets.push(cursor);
      const wrapped = concat([bytes(`${i + 1} 0 obj\n`), obj, bytes('\nendobj\n')]);
      parts.push(wrapped);
      cursor += wrapped.length;
    });

    const xrefOffset = cursor;
    const xrefLines = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f '];
    for (let i = 1; i <= objects.length; i++) xrefLines.push(`${padOffset(offsets[i])} 00000 n `);
    const trailer = bytes(`${xrefLines.join('\n')}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
    parts.push(trailer);
    return concat(parts);
  }

  return { buildAuthorizationText, createAuthorizationPdfBytes, formatDatePtBr, joinNatural, wrapText };
});
