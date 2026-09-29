// "What does this QR do?" — a plain-English summary plus safety checks that run in the browser (no lookups).
// describe(parsed, text) -> { icon, head, flags: [{ level: 'danger'|'warn'|'info'|'ok', text }] }
// head/flag text may contain **bold** markers; the UI renders them as text, never as HTML.
(function (root) {
  const SHORTENERS = new Set(['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'cutt.ly', 'rebrand.ly', 'ow.ly', 's.id', 'shorturl.at', 'tiny.cc', 'rb.gy', 'qrco.de', 'bit.do', 'buff.ly', 'lnkd.in', 'tinyurl.is', 'shorturl.asia', 'v.gd', 'u.to', 'qr.net', 'bl.ink', 'short.io', 'l.ead.me']);
  const BRANDS = ['paypal', 'google', 'microsoft', 'apple', 'amazon', 'facebook', 'instagram', 'whatsapp', 'netflix', 'linkedin', 'outlook', 'office365', 'icloud', 'sbi', 'hdfc', 'icici', 'axisbank', 'kotak', 'paytm', 'phonepe', 'gpay', 'razorpay', 'binance', 'coinbase', 'dhl', 'fedex', 'bluedart', 'irctc', 'incometax', 'epfo', 'uidai', 'aadhaar'];
  const RISKY_TLDS = new Set(['zip', 'mov', 'xyz', 'top', 'click', 'country', 'gq', 'tk', 'ml', 'cf', 'ga', 'cam', 'rest', 'work', 'loan', 'buzz', 'icu', 'monster', 'sbs', 'cfd']);
  const FILE_EXT = /\.(apk|exe|msi|dmg|pkg|scr|bat|cmd|vbs|jar|ps1)$/i;

  // ponytail: last-two-labels heuristic (+ co.in style), not the full public-suffix list; good enough to name the real owner.
  function registrable(host) {
    const l = host.toLowerCase().replace(/\.$/, '').split('.');
    if (l.length <= 2) return l.join('.');
    const tld = l[l.length - 1], sld = l[l.length - 2];
    return tld.length === 2 && ['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'nic', 'res', 'gen', 'ltd', 'plc'].includes(sld) ? l.slice(-3).join('.') : l.slice(-2).join('.');
  }

  function linkFlags(u, raw) {
    const f = [], host = u.hostname.toLowerCase(), reg = registrable(host);
    if (/^[a-z][\w+.-]*:\/\/[^/?#]*@/i.test(raw))
      f.push({ level: 'danger', text: `The link hides its real destination: everything before “@” is ignored. It actually goes to **${host}**.` });
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('['))
      f.push({ level: 'danger', text: 'Goes to a bare IP address instead of a website name, a common phishing trick.' });
    if (host.split('.').some(p => p.startsWith('xn--')))
      f.push({ level: 'danger', text: 'The website name uses look-alike letters (punycode “xn--”). It may be imitating another site.' });
    const words = host.split(/[.-]/); // whole words only: "pineapple.com" is not Apple
    const brand = BRANDS.find(b => words.includes(b) && reg.split('.')[0] !== b);
    if (brand) f.push({ level: 'danger', text: `Mentions “${brand}” but the site actually belongs to **${reg}**.` });
    if (SHORTENERS.has(reg) || SHORTENERS.has(host))
      f.push({ level: 'warn', text: `Shortened link (${host}). The real destination stays hidden until you open it.` });
    if (FILE_EXT.test(u.pathname))
      f.push({ level: 'warn', text: `Downloads an app or program (${u.pathname.match(FILE_EXT)[0]}). Only install files from sources you trust.` });
    if (RISKY_TLDS.has(host.split('.').pop()))
      f.push({ level: 'warn', text: `Uncommon domain ending “.${host.split('.').pop()}”, often used by throwaway sites.` });
    if (u.protocol === 'http:') f.push({ level: 'warn', text: 'Not encrypted (http, not https). Don’t enter passwords or payment details there.' });
    if (raw.length > 300) f.push({ level: 'info', text: `Very long link (${raw.length} characters), which can hide tracking or tricks.` });
    if (!f.length) f.push({ level: 'ok', text: `No red flags found. Owner of the site: **${reg}**. Only open it if that’s what you expected.` });
    return f;
  }

  function describe(p, text) {
    if (!p) return null;
    const flags = [];
    const get = label => (p.fields.find(f => f.label === label) || {}).value || '';
    let icon = '▦', head;

    if (/^\s*javascript:/i.test(text) || /(^|[^\w])javascript:/i.test(text))
      flags.push({ level: 'danger', text: 'Contains a “javascript:” link, which can run code in your browser. Don’t open it.' });

    if (/^(bitcoin|ethereum|litecoin|dogecoin|monero|solana):/i.test(text)) {
      const [, coin, addr] = text.match(/^(\w+):([^?]*)/);
      icon = '₿'; head = `Crypto payment request (${coin.toLowerCase()}) to **${addr.slice(0, 12)}…${addr.slice(-6)}**`;
      flags.push({ level: 'warn', text: 'Crypto payments can’t be reversed. Check the full address with the person you’re paying.' });
    } else if (p.format === 'url') {
      let u; try { u = new URL(text); } catch { }
      if (u && u.protocol === 'upi:') {
        const pa = get('Payee UPI ID'), pn = get('Payee name'), am = get('Amount'), cu = get('Currency') || 'INR';
        icon = '₹';
        head = `Payment request: pays **${pn || pa || 'unknown payee'}**` + (am ? ` **${cu === 'INR' ? '₹' : cu + ' '}${am}**` : ', and you enter the amount');
        if (!pa) flags.push({ level: 'danger', text: 'No payee UPI ID in this code. Don’t pay with it.' });
        else flags.push({ level: 'warn', text: `Before paying, check that the UPI ID **${pa}**${pn ? ` and the name “${pn}”` : ''} match who you expect. Stickers with a swapped QR are a common scam.` });
      } else if (u) {
        icon = '🔗'; head = `Opens a web page on **${u.hostname}**`;
        flags.push(...linkFlags(u, text));
      }
    } else if (p.format === 'scheme') {
      const k = p.meta.kind, first = p.fields[0].value;
      if (k === 'tel') { icon = '☎'; head = `Calls **${first}**`; }
      else if (k === 'sms' || k === 'smsto') {
        icon = '✉'; head = `Starts a text message to **${first}**`;
        flags.push({ level: 'info', text: 'Your phone fills in the message; nothing is sent until you tap Send. Be wary of short “premium” numbers.' });
      } else if (k === 'mailto') { icon = '✉'; head = `Starts an email to **${first}**`; }
      else if (k === 'geo') { icon = '⌖'; head = `Opens a map at **${first}, ${p.fields[1].value}**`; }
    } else if (p.format === 'mecard' && /^WIFI:/i.test(text)) {
      const t = (get('Security') || 'nopass').toUpperCase();
      icon = '📶'; head = `Joins the Wi-Fi network **${get('Network name') || '(no name)'}**` + (t === 'NOPASS' ? ' (open, no password)' : ` (${t})`);
      if (t === 'NOPASS') flags.push({ level: 'warn', text: 'Open network: anyone nearby can see unencrypted traffic.' });
      else if (t === 'WEP') flags.push({ level: 'warn', text: 'WEP security is outdated and easy to break. Use WPA2 or WPA3.' });
      if (get('Password')) flags.push({ level: 'info', text: 'Anyone who scans this code gets the Wi-Fi password.' });
    } else if (p.format === 'mecard' && /^MATMSG:/i.test(text)) {
      icon = '✉'; head = `Starts an email to **${get('To')}**`;
    } else if (p.format === 'vcard' || p.format === 'mecard') {
      const name = get('Full name') || get('Name') || get('Name (structured)').replace(/;+/g, ' ').trim();
      const org = get('Organisation');
      icon = '👤'; head = `Saves a contact: **${name || 'unnamed'}**` + (org ? ` at ${org}` : '');
    } else if (p.format === 'text') {
      const v = text.trim();
      head = /^[\w\-/]{3,40}$/.test(v) && /\d/.test(v) ? `An identifier: **${v}**` : `Plain text, ${v.length} characters`;
      icon = 'T';
    } else {
      const n = p.fields.length;
      const id = p.fields.find(f => /\bID\b|\b(number|code|tag)\b/i.test(f.label) && f.value);
      icon = '☰'; head = `A data record with **${n} field${n === 1 ? '' : 's'}**` + (id ? `, ${id.label} **${id.value}**` : '');
    }

    // Links hidden inside data records still deserve a check.
    if (!['url'].includes(p.format)) for (const f of p.fields) {
      if (/^https?:\/\//i.test(f.value)) { try { linkFlags(new URL(f.value), f.value).filter(x => x.level !== 'ok').forEach(x => flags.push({ ...x, text: `${f.label}: ${x.text}` })); } catch { } }
    }
    return { icon, head, flags };
  }

  root.QRInsights = { describe, registrable };
})(typeof window !== 'undefined' ? window : globalThis);
