// Decode XML/HTML character references. Feeds in the wild mix XML entities,
// numeric references and HTML named entities (which are technically invalid
// XML but very common), so we accept all of them.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  prime: '′', Prime: '″', times: '×', divide: '÷', minus: '−',
  pound: '£', euro: '€', cent: '¢', yen: '¥', dollar: '$', copy: '©', reg: '®', trade: '™',
  deg: '°', plusmn: '±', frac12: '½', frac14: '¼', frac34: '¾', sup2: '²', sup3: '³',
  iexcl: '¡', iquest: '¿', sect: '§', para: '¶', dagger: '†', Dagger: '‡', larr: '←', rarr: '→', uarr: '↑', darr: '↓', hearts: '♥',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë', Igrave: 'Ì', Iacute: 'Í', Icirc: 'Î', Iuml: 'Ï',
  ETH: 'Ð', Ntilde: 'Ñ', Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý', THORN: 'Þ', szlig: 'ß',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ', ccedil: 'ç',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  eth: 'ð', ntilde: 'ñ', ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', thorn: 'þ', yuml: 'ÿ',
  scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', oelig: 'œ', OElig: 'Œ',
  zwj: '‍', zwnj: '‌', lrm: '‎', rlm: '‏', shy: '­',
};

export function decodeEntities(str) {
  if (!str || str.indexOf('&') === -1) return str || '';
  return str.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
      return String.fromCodePoint(code);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, body) ? NAMED[body] : m;
  });
}
