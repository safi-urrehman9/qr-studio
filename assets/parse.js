// Payload parser/serializer: text <-> { format, fields[], meta }.
// serialize(parse(t)) reproduces t for every format except JSON whitespace
// and URL percent-encoding (the UI re-uses the original text when nothing changed).
(function (root) {
  const splitEsc = (s, sep) => { // split on unescaped sep
    const out = []; let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[++i]; continue; }
      if (s[i] === sep) { out.push(cur); cur = ''; } else cur += s[i];
    }
    out.push(cur); return out;
  };
  const unesc = s => s.replace(/\\(.)/g, (_, c) => (c === 'n' || c === 'N') ? '\n' : c);
  const escMe = s => s.replace(/([\\;])/g, '\\$1'); // only what the ;-structure needs; escaping , and : breaks real scanners
  const escVc = s => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

  const humanize = k => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim()
    .replace(/^./, c => c.toUpperCase()).replace(/\b(id|url|uid)\b/gi, m => m.toUpperCase());

  const MECARD_LABELS = { N: 'Name', TEL: 'Phone', EMAIL: 'Email', ADR: 'Address', ORG: 'Organisation', NOTE: 'Note', URL: 'Website', BDAY: 'Birthday', NICKNAME: 'Nickname' };
  const WIFI_LABELS = { T: 'Security', S: 'Network name', P: 'Password', H: 'Hidden' };
  const MATMSG_LABELS = { TO: 'To', SUB: 'Subject', BODY: 'Body' };
  const UPI_LABELS = { pa: 'Payee UPI ID', pn: 'Payee name', am: 'Amount', cu: 'Currency', tn: 'Note', tr: 'Reference', mc: 'Merchant code', tid: 'Transaction ID', url: 'Info link' };
  const SCHEME_PARAM_LABELS = { subject: 'Subject', body: 'Message', cc: 'CC', bcc: 'BCC', q: 'Place', z: 'Zoom' };
  // Encode for a query string but keep @ : / , readable (some UPI apps reject %40).
  const qEnc = s => encodeURIComponent(s).replace(/%(40|3A|2F|2C)/gi, (m) => decodeURIComponent(m));
  const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; } };
  const VCARD_LABELS = { FN: 'Full name', N: 'Name (structured)', TEL: 'Phone', EMAIL: 'Email', ORG: 'Organisation', TITLE: 'Job title', ADR: 'Address', URL: 'Website', NOTE: 'Note', BDAY: 'Birthday', ROLE: 'Role', UID: 'Unique ID' };

  // Guess a label from the value alone (used when the payload carries no keys).
  function guessLabel(v) {
    v = v.trim();
    if (/^[^@\s]+@[^@\s]+\.\w+$/.test(v)) return 'Email';
    if (/^https?:\/\//i.test(v)) return 'Link';
    if (/^\d{4}-\d{2}-\d{2}$|^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(v)) return 'Date';
    if (/^\+?[\d\s()-]{7,}$/.test(v) && v.replace(/\D/g, '').length >= 7) return 'Phone';
    if (/^[A-Z]{0,8}[-_/]?\d{2,}$/i.test(v) || (/\d/.test(v) && /[A-Z]/i.test(v) && !/\s/.test(v))) return 'ID';
    if (/^\p{Lu}[\p{L}.'-]*(\s+\p{Lu}[\p{L}.'-]*)+$/u.test(v)) return 'Name';
    return 'Field';
  }
  function uniqueLabels(fields) {
    const seen = {};
    fields.forEach((f, i) => {
      if (f.label === 'Field') f.label = 'Field ' + (i + 1);
      const n = seen[f.label] = (seen[f.label] || 0) + 1;
      if (n > 1) f.label += ' ' + n;
    });
    return fields;
  }

  const KEY_RE = /^[\p{L}_][\p{L}\p{N} _.\-/#]{0,39}$/u;
  // "  key : value" -> {pre, key, sep, value}
  function kvPart(p) {
    const m = p.match(/^(\s*)([^:=]+?)(\s*[:=]\s*)(.*)$/s);
    return m && KEY_RE.test(m[2]) ? { pre: m[1], key: m[2], sep: m[3], value: m[4] } : null;
  }

  const FORMATS = [
    {
      id: 'json', name: 'JSON',
      parse(t) {
        if (!/^\s*\{/.test(t)) return null;
        let o; try { o = JSON.parse(t); } catch { return null; }
        if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
        const indent = (t.match(/\n([ \t]+)"/) || [])[1];
        return {
          meta: { indent },
          fields: Object.entries(o).map(([k, v]) => ({
            key: k, label: humanize(k),
            kind: v === null ? 'null' : typeof v === 'object' ? 'json' : typeof v,
            value: v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v),
          })),
        };
      },
      serialize(fields, meta) {
        const o = {};
        for (const f of fields) {
          let v = f.value;
          if (f.kind === 'number' && v.trim() !== '' && !isNaN(v)) v = Number(v);
          else if (f.kind === 'boolean' && /^(true|false)$/.test(v)) v = v === 'true';
          else if (f.kind === 'null' && v === '') v = null;
          else if (f.kind === 'json') { try { v = JSON.parse(v); } catch { } }
          o[f.key] = v;
        }
        return JSON.stringify(o, null, meta.indent);
      },
    },
    {
      id: 'vcard', name: 'vCard contact',
      parse(t) {
        if (!/^BEGIN:VCARD/i.test(t.trim())) return null;
        const nl = t.includes('\r\n') ? '\r\n' : '\n';
        const lines = t.trim().replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
        const version = (lines.find(l => /^VERSION:/i.test(l)) || 'VERSION:3.0').slice(8);
        const fields = lines.filter(l => !/^(BEGIN|END|VERSION):/i.test(l) && l.includes(':')).map(l => {
          const i = l.indexOf(':'), key = l.slice(0, i), base = key.split(';')[0].toUpperCase();
          const raw = base === 'N' || base === 'ADR'; // keep ; structure visible
          const type = (key.match(/TYPE=([^;:]+)/i) || [])[1];
          return { key, raw, value: raw ? l.slice(i + 1) : unesc(l.slice(i + 1)),
            label: (VCARD_LABELS[base] || humanize(base.toLowerCase())) + (type ? ` (${type.toLowerCase()})` : '') };
        });
        return { meta: { nl, version }, fields };
      },
      serialize(fields, meta) {
        return ['BEGIN:VCARD', 'VERSION:' + meta.version,
          ...fields.map(f => f.key + ':' + (f.raw ? f.value : escVc(f.value))), 'END:VCARD'].join(meta.nl);
      },
    },
    {
      id: 'mecard', name: 'MECARD / Wi-Fi / email',
      parse(t) {
        const m = t.match(/^(MECARD|WIFI|MATMSG|BIZCARD):([\s\S]*)$/i);
        if (!m) return null;
        const scheme = m[1].toUpperCase();
        const labels = scheme === 'WIFI' ? WIFI_LABELS : scheme === 'MATMSG' ? MATMSG_LABELS : MECARD_LABELS;
        const fields = [];
        for (const p of splitEsc(m[2], ';')) {
          const i = p.indexOf(':');
          // Unescaped ';' inside a value (common from sloppy generators): glue it back on, don't drop it.
          if (i < 0) { if (p && fields.length) fields[fields.length - 1].value += ';' + unesc(p); continue; }
          const key = p.slice(0, i);
          fields.push({ key, label: labels[key.toUpperCase()] || humanize(key), value: unesc(p.slice(i + 1)) });
        }
        return { meta: { scheme: m[1] }, fields, name: { WIFI: 'Wi-Fi network', MATMSG: 'Email message', MECARD: 'MECARD contact', BIZCARD: 'Business card' }[scheme] };
      },
      serialize: (fields, meta) => meta.scheme + ':' + fields.map(f => f.key + ':' + escMe(f.value)).join(';') + ';;',
    },
    {
      id: 'url', name: 'Link',
      parse(t) {
        if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(t)) return null;
        let u; try { u = new URL(t); } catch { return null; }
        const q = t.indexOf('?'), h = t.indexOf('#');
        const base = t.slice(0, q >= 0 ? q : h >= 0 ? h : t.length);
        const upi = u.protocol === 'upi:';
        const fields = [{ key: '', label: upi ? 'Payment link' : 'Link', value: base, fixed: true }];
        u.searchParams.forEach((v, k) => fields.push({ key: k, label: (upi && UPI_LABELS[k.toLowerCase()]) || humanize(k), value: v }));
        return { meta: { hash: u.hash }, fields, name: upi ? 'UPI payment' : undefined };
      },
      serialize(fields, meta) {
        const [base, ...params] = fields;
        const qs = params.map(f => qEnc(f.key) + '=' + qEnc(f.value)).join('&');
        return base.value + (qs ? '?' + qs : '') + meta.hash;
      },
    },
    {
      // Phone-action links: tel:, mailto:, sms:, SMSTO:, geo:
      id: 'scheme', name: 'Action link',
      parse(t) {
        const m = t.match(/^(tel|mailto|smsto|sms|geo):([\s\S]*)$/i);
        if (!m) return null;
        const scheme = m[1], kind = scheme.toLowerCase(), rest = m[2], fx = (label, value) => ({ key: '', label, value, fixed: true });
        if (kind === 'tel') return { meta: { scheme, kind }, name: 'Phone call', fields: [fx('Phone', rest)] };
        if (kind === 'smsto') { // ZXing style SMSTO:number:message
          const i = rest.indexOf(':');
          return { meta: { scheme, kind }, name: 'Text message', fields: [fx('Phone', i < 0 ? rest : rest.slice(0, i)), fx('Message', i < 0 ? '' : rest.slice(i + 1))] };
        }
        const q = rest.indexOf('?'), target = q < 0 ? rest : rest.slice(0, q);
        const params = q < 0 ? [] : rest.slice(q + 1).split('&').filter(Boolean).map(p => { const j = p.indexOf('='); return [dec(j < 0 ? p : p.slice(0, j)), dec(j < 0 ? '' : p.slice(j + 1))]; });
        let head;
        if (kind === 'geo') { const [lat = '', ...lon] = target.split(','); head = [fx('Latitude', lat), fx('Longitude', lon.join(','))]; }
        else head = [fx(kind === 'mailto' ? 'To' : 'Phone', dec(target))];
        return { meta: { scheme, kind }, name: { mailto: 'Email', sms: 'Text message', geo: 'Map location' }[kind],
          fields: [...head, ...params.map(([k, v]) => ({ key: k, label: SCHEME_PARAM_LABELS[k.toLowerCase()] || humanize(k), value: v }))] };
      },
      serialize(fields, meta) {
        const { scheme, kind } = meta, fixed = fields.filter(f => f.fixed), params = fields.filter(f => !f.fixed);
        if (kind === 'tel') return scheme + ':' + fixed[0].value;
        if (kind === 'smsto') return scheme + ':' + fixed[0].value + ':' + fixed[1].value;
        const target = kind === 'geo' ? fixed[0].value + ',' + fixed[1].value : fixed[0].value;
        const qs = params.map(f => encodeURIComponent(f.key) + '=' + encodeURIComponent(f.value)).join('&');
        return scheme + ':' + target + (qs ? '?' + qs : '');
      },
    },
    {
      // key:value or key=value pairs, one per line or joined by | ; & tab ,
      id: 'kv', name: 'Key–value pairs',
      parse(t) {
        const nl = t.includes('\r\n') ? '\r\n' : '\n';
        // Single line: try inline delimiters before treating it as one "key: value".
        for (const d of t.includes('\n') ? [nl] : ['&', '|', ';', '\t', ',', nl]) {
          const parts = t.split(d).filter(p => p.trim() !== '' || d !== nl);
          if (parts.length < (d === nl ? 1 : 2)) continue;
          const kvs = parts.map(kvPart);
          if (kvs.every(Boolean)) {
            if (d === '&') kvs.forEach(k => { k.key = decodeURIComponent(k.key); k.value = decodeURIComponent(k.value.replace(/\+/g, ' ')); });
            return { meta: { d }, fields: kvs.map(k => ({ ...k, label: humanize(k.key) })),
              name: d === nl ? 'Key–value lines' : d === '&' ? 'Query string' : `Key–value pairs (${d === '\t' ? 'tab' : d})` };
          }
        }
        return null;
      },
      serialize(fields, meta) {
        const enc = meta.d === '&' ? encodeURIComponent : s => s;
        const sep = (fields.find(f => f.sep) || { sep: meta.d === '&' ? '=' : ': ' }).sep;
        return fields.map((f, i) => (f.pre ?? (i && meta.d === ',' ? ' ' : '')) + enc(f.key) + (f.sep ?? sep) + enc(f.value)).join(meta.d);
      },
    },
    {
      id: 'delimited', name: 'Delimited values',
      parse(t) {
        if (t.includes('\n')) return null;
        let best = null;
        for (const d of ['|', ';', '\t', ',', '~', '#']) {
          const parts = t.split(d);
          if (parts.length >= 2 && parts.every(p => p.trim()) && (!best || parts.length > best.parts.length)) best = { d, parts };
        }
        if (!best) return null;
        return { meta: { d: best.d }, name: `Delimited values (${best.d === '\t' ? 'tab' : best.d})`,
          fields: uniqueLabels(best.parts.map((v, i) => ({ key: String(i), label: guessLabel(v), value: v }))) };
      },
      serialize: (fields, meta) => fields.map(f => f.value).join(meta.d),
    },
    {
      id: 'text', name: 'Plain text',
      parse: t => ({ meta: {}, fields: [{ key: '', label: guessLabel(t) === 'Field' ? 'Text' : guessLabel(t), value: t }] }),
      serialize: fields => fields.map(f => f.value).join(' '),
    },
  ];

  const byId = Object.fromEntries(FORMATS.map(f => [f.id, f]));

  function parse(text) {
    for (const f of FORMATS) {
      const r = f.parse(text);
      if (r) return { format: f.id, formatName: r.name || f.name, meta: r.meta, fields: r.fields };
    }
  }
  const serialize = p => byId[p.format].serialize(p.fields, p.meta);

  // Keyed formats accept user-added fields; delimited/text take positional ones.
  const keyed = p => ['json', 'vcard', 'mecard', 'url', 'kv', 'scheme'].includes(p.format);
  // Formats whose structure has no room for extra fields.
  const canAddField = p => p.format !== 'text' && !(p.format === 'scheme' && ['tel', 'smsto'].includes(p.meta.kind));

  // Increment the last digit run, keeping zero-padding: EMP-0099 +1 -> EMP-0100
  function bump(value, k) {
    const m = [...value.matchAll(/\d+/g)].pop();
    if (!m) return value + k;
    const n = String(BigInt(m[0]) + BigInt(k)).padStart(m[0].length, '0');
    return value.slice(0, m.index) + n + value.slice(m.index + m[0].length);
  }

  // Which field most likely holds the unique ID?
  function idFieldIndex(fields) {
    const score = f => (/\d/.test(f.value) ? 1 : -9) + (/\b(id|no|num|number|code|serial|uid|roll|badge|member|emp)\b/i.test(f.label + ' ' + f.key) ? 5 : 0)
      + (guessLabel(f.value) === 'ID' ? 2 : 0) - (guessLabel(f.value) === 'Phone' ? 3 : 0);
    let best = 0;
    fields.forEach((f, i) => { if (score(f) > score(fields[best])) best = i; });
    return best;
  }

  // Minimal RFC4180 CSV reader (quotes, escaped quotes, CRLF).
  function parseCSV(s) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }
  const csvCell = v => /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;

  root.QRPayload = { parse, serialize, keyed, canAddField, bump, idFieldIndex, guessLabel, humanize, parseCSV, csvCell };
})(typeof window !== 'undefined' ? window : globalThis);
