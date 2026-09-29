const Q = window.QRPayload, I = window.QRInsights;
const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const rich = s => s.split('**').map((t, i) => i % 2 ? el('b', { textContent: t }) : document.createTextNode(t)); // **bold**, never HTML
const escapeHtml = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']; // keep non-ASCII names intact

let P = null;          // parsed payload {format, formatName, meta, fields}
let original = null;   // text of a code the user opened (not a template), for "changes" and reset
let idIdx = 0;         // field that holds the unique ID
let sourceVersion = 0; // QR version of the code that was read
let csvRows = null, logo = null, bulkRows = [];

let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2400); }

// Tabs: each tablist toggles the panes named in data-pane.
for (const list of document.querySelectorAll('[role=tablist]')) {
  const tabs = [...list.querySelectorAll('[role=tab]')];
  for (const t of tabs) t.onclick = () => {
    tabs.forEach(b => { b.ariaSelected = String(b === t); $(b.dataset.pane).hidden = b !== t; });
    list.dispatchEvent(new CustomEvent('tabchange', { detail: t.dataset.pane }));
  };
}
const selectTab = (listId, pane) => document.querySelector(`#${listId} [data-pane="${pane}"]`).click();

// ---------- Templates ----------
const TEMPLATES = {
  'Employee ID': 'ACME-EMP-00123',
  'ID card data': 'ACME|EMP00123|Priya Sharma|Engineering|2027-03-31',
  'Key–value': 'Name: Priya Sharma\nEmployee ID: EMP-00123\nDepartment: Engineering\nValid till: 2027-03-31',
  'JSON': '{"org":"ACME","member_id":"M-0457","name":"Priya Sharma","tier":"Gold"}',
  'Website': 'https://example.org/verify?id=STU-2024-0081&campus=north',
  'Wi-Fi': 'WIFI:T:WPA;S:ACME-Guest;P:welcome123;;',
  'Contact': 'BEGIN:VCARD\nVERSION:3.0\nFN:Priya Sharma\nORG:ACME Corp\nTITLE:Engineer\nTEL;TYPE=CELL:+91 98765 43210\nEMAIL:priya@example.com\nEND:VCARD',
  'UPI payment': 'upi://pay?pa=yourname@okbank&pn=Your%20Shop&am=100&cu=INR',
  'Email': 'mailto:hello@example.org?subject=Hello',
  'Phone call': 'tel:+919876543210',
  'Location': 'geo:12.9716,77.5946',
};
const SAFETY_EXAMPLES = {
  'Fake login link': 'http://paypal.com.account-verify.xyz/login',
  'Short link': 'https://bit.ly/parking-pay-now',
  'Payment code': 'upi://pay?pa=ravi.stores@okicici&pn=Ravi%20Stores&am=250&cu=INR',
  'Normal link': 'https://www.wikipedia.org/',
};

// ---------- Tool pages: same app, different starting point ----------
const pick = (...names) => Object.fromEntries(names.map(n => [n, TEMPLATES[n]]));
// sections: which cards show, in order (numbered 1..n). quietFlags: creating your own code, so skip "before you pay" style warnings.
const TOOLS = {
  'qr-code-reader':         { sections: ['open', 'inside', 'output', 'series'] },
  'edit-qr-code':           { sections: ['open', 'inside', 'output', 'series'] },
  'qr-code-safety-checker': { sections: ['open', 'inside'], readOnly: true, insideTitle: 'What this code does', templates: SAFETY_EXAMPLES, templatesLabel: 'Try an example:' },
  'bulk-qr-code-reader':    { sections: ['open', 'inside', 'output'], dropTitle: 'Drop many QR images here' },
  'bulk-qr-code-generator': { sections: ['inside', 'output', 'series', 'open'], preload: 'Key–value', templates: pick('Key–value', 'ID card data', 'JSON', 'Employee ID', 'Website'), openTitle: 'Or start from a QR code you already have' },
  'wifi-qr-code-generator': { sections: ['inside', 'output', 'open'], preload: 'Wi-Fi', templates: {}, quietFlags: true, openTitle: 'Or open an existing Wi-Fi QR code' },
  'upi-qr-code-generator':  { sections: ['inside', 'output', 'open'], preload: 'UPI payment', templates: {}, quietFlags: true, openTitle: 'Or open an existing payment QR code' },
  'vcard-qr-code-generator':{ sections: ['inside', 'output', 'open'], preload: 'Contact', templates: {}, quietFlags: true, openTitle: 'Or open an existing contact QR code' },
};
const tool = TOOLS[document.body.dataset.tool] || TOOLS['qr-code-reader'];
{
  const templates = tool.templates || TEMPLATES;
  const box = document.querySelector('.examples');
  box.hidden = !Object.keys(templates).length;
  if (tool.templatesLabel) box.firstElementChild.textContent = tool.templatesLabel;
  for (const [name, text] of Object.entries(templates))
    box.append(el('button', { className: 'chip', textContent: name,
      onclick: () => { $('src').hidden = true; sourceVersion = 0; $('ver').value = 0; load(text, { template: true }); } }));
  document.body.classList.toggle('read-only', !!tool.readOnly);
  if (tool.insideTitle) $('insideTitle').textContent = tool.insideTitle;
  const cards = { open: 'openCard', inside: 'insideCard', output: 'outputCard', series: 'series' };
  for (const [name, id] of Object.entries(cards)) {
    const i = tool.sections.indexOf(name), card = $(id);
    card.hidden = i < 0;
    card.style.order = i * 10; // grid/flex order; also orders cards when stacked on phones
    if (i >= 0) card.querySelector('.step').textContent = i + 1;
  }
  $('bulk').style.order = tool.sections.indexOf('open') * 10 + 1; // bulk results sit right under "open"
  if (tool.openTitle) $('openTitle').textContent = tool.openTitle;
  if (tool.dropTitle) document.querySelector('#drop strong').textContent = tool.dropTitle;
  document.body.classList.toggle('no-output', !tool.sections.includes('output'));
}

// ---------- 1. Open: files, paste, camera ----------
async function decodeImage(src) { // File/Blob -> jsQR result or null
  const url = URL.createObjectURL(src);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, 1600 / Math.max(img.width, img.height)); // jsQR doesn't need 12MP
    const c = el('canvas', { width: Math.max(1, Math.round(img.width * s)), height: Math.max(1, Math.round(img.height * s)) });
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { url, r: jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' }) };
  } catch { return { url, r: null }; }
}

function showDecoded(r, imgSrc, from) {
  $('srcImg').src = imgSrc; $('src').hidden = false;
  if (!r) { $('decodeInfo').innerHTML = '<span class="err">No QR code found in this image.</span> Try a sharper, straighter, closer photo, or crop around the code.'; return; }
  if (!r.data && r.binaryData?.length) { $('decodeInfo').innerHTML = '<span class="warn">This code holds binary data, not text,</span> so it can’t be edited here.'; return; }
  sourceVersion = r.version; $('ver').value = r.version;
  $('decodeInfo').textContent = `Read ${r.data.length} characters from ${from} · QR version ${r.version}. New codes keep this size.`;
  load(r.data, { fromCode: true });
  document.querySelector('#insight').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function openFiles(list) {
  const files = [...list].filter(f => f.type.startsWith('image/'));
  if (!files.length) return toast('Please choose an image file (PNG, JPG, screenshot…).');
  if (files.length === 1) { const { url, r } = await decodeImage(files[0]); return showDecoded(r, url, files[0].name || 'the image'); }
  $('bulk').hidden = false; $('bulkCount').textContent = files.length; bulkRows = []; $('bulkRows').replaceChildren();
  for (const [i, f] of files.entries()) {
    $('bulkInfo').textContent = `Reading ${i + 1} of ${files.length}…`;
    const { url, r } = await decodeImage(f);
    URL.revokeObjectURL(url);
    bulkRows.push({ file: f.name, text: r?.data || null, version: r?.version || 0 });
    if (i % 4 === 3) await new Promise(res => setTimeout(res)); // keep the page responsive
  }
  renderBulk();
  $('bulk').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderBulk() {
  const ok = bulkRows.filter(r => r.text).length;
  $('bulkInfo').innerHTML = `${ok} of ${bulkRows.length} images had a readable QR code.` + (ok < bulkRows.length ? ' <span class="warn">Rows marked “not found” need a clearer photo.</span>' : '');
  $('bulkRows').replaceChildren(...bulkRows.map(row => {
    const p = row.text && Q.parse(row.text);
    return el('tr', {},
      el('td', { textContent: row.file }),
      el('td', { className: 'content', title: row.text || '', textContent: row.text ? (row.text.length > 120 ? row.text.slice(0, 120) + '…' : row.text) : '' },
        row.text ? '' : el('span', { className: 'err', textContent: 'not found' })),
      el('td', { textContent: p ? p.formatName : '' }),
      el('td', {}, row.text ? el('button', { textContent: 'Edit', onclick: () => {
        $('src').hidden = true; sourceVersion = row.version; $('ver').value = row.version; load(row.text, { fromCode: true });
        document.querySelector('#insight').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }) : ''));
  }));
}
$('bulkCsv').onclick = () => {
  const csv = 'file,status,type,contents\n' + bulkRows.map(r => [r.file, r.text ? 'ok' : 'not found', r.text ? Q.parse(r.text).formatName : '', r.text || ''].map(Q.csvCell).join(',')).join('\n') + '\n';
  download(URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), 'decoded-qr-codes.csv');
};
$('bulkClose').onclick = () => { $('bulk').hidden = true; };

$('drop').onclick = () => $('file').click();
$('drop').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } };
$('file').onchange = e => { openFiles(e.target.files); e.target.value = ''; };
$('drop').ondragover = e => { e.preventDefault(); $('drop').classList.add('over'); };
$('drop').ondragleave = () => $('drop').classList.remove('over');
$('drop').ondrop = e => { e.preventDefault(); $('drop').classList.remove('over'); openFiles(e.dataTransfer.files); };
document.addEventListener('paste', e => { if (e.clipboardData.files.length) { e.preventDefault(); openFiles(e.clipboardData.files); } });

// Camera: scan frames with jsQR until a code appears.
let stream = null, camTimer = 0;
const camSay = (t, cls = 'muted') => { $('camStatus').className = cls; $('camStatus').textContent = t; document.querySelector('.cam').hidden = cls !== 'muted'; }; // no empty black box on errors
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) return camSay('This browser can’t use the camera here. Upload a photo instead.', 'warn');
  camSay('Starting camera…');
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false }); }
  catch (e) { return camSay(e.name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in your browser’s site settings, or upload a photo instead.' : 'No camera found. Upload a photo instead.', 'warn'); }
  const v = $('video'); v.srcObject = stream; await v.play().catch(() => {});
  camSay('Point the camera at a QR code. It reads automatically.');
  const c = el('canvas'), ctx = c.getContext('2d', { willReadFrequently: true });
  const tick = () => {
    if (!stream) return;
    if (v.readyState >= 2 && v.videoWidth) {
      const s = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height);
      const r = jsQR(d.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
      if (r && (r.data || r.binaryData?.length)) {
        navigator.vibrate?.(60);
        const shot = c.toDataURL('image/jpeg', .8);
        stopCamera(); selectTab('openTabs', 'paneUpload');
        showDecoded(r, shot, 'the camera'); toast('QR code read ✓');
        return;
      }
    }
    camTimer = setTimeout(tick, 120); // ~8 scans/s is plenty and saves battery
  };
  tick();
}
function stopCamera() { stream?.getTracks().forEach(t => t.stop()); stream = null; clearTimeout(camTimer); $('video').srcObject = null; }
$('openTabs').addEventListener('tabchange', e => e.detail === 'paneCamera' ? startCamera() : stopCamera());
$('camStop').onclick = () => selectTab('openTabs', 'paneUpload');
document.addEventListener('visibilitychange', () => { if (document.hidden && stream) selectTab('openTabs', 'paneUpload'); });

// ---------- 2. Inside: fields, insight, changes ----------
// fromCode: text came from a real QR (enables "changes" + reset). template: user picked an example.
// Neither (page preload): no AI, so a generator page doesn't download the model before anyone asks.
function load(text, { fromCode = false, template = false } = {}) {
  original = fromCode ? text : null;
  $('raw').value = text;
  P = text ? Q.parse(text) : null;
  idIdx = P ? Q.idFieldIndex(P.fields) : 0;
  renderFields(); refresh(); prefillRange();
  if (fromCode || template) nameFields(false);
}
$('raw').oninput = () => { // raw edits re-parse, keeping the chosen ID field if it still exists
  const keep = idIdx; P = $('raw').value ? Q.parse($('raw').value) : null;
  idIdx = P && keep < P.fields.length ? keep : P ? Q.idFieldIndex(P.fields) : 0;
  renderFields(); refresh();
};
function fieldsChanged() { $('raw').value = Q.serialize(P); refresh(); }
function refresh() { renderQR(); renderInsight(); renderChanges(); }

function renderInsight() {
  const d = P && I.describe(P, $('raw').value);
  $('insight').hidden = !d;
  if (!d) return;
  $('insIcon').textContent = d.icon;
  $('insHead').replaceChildren(...rich(d.head));
  if (tool.quietFlags) d.flags = d.flags.filter(f => f.level === 'danger');
  $('insFlags').replaceChildren(...d.flags.map(f => el('li', { className: 'flag ' + f.level },
    el('span', { textContent: { danger: '⛔', warn: '⚠', info: 'ℹ', ok: '✓' }[f.level], ariaHidden: 'true' }), el('span', {}, ...rich(f.text)))));
  $('insight').className = 'insight' + (d.flags.some(f => f.level === 'danger') ? ' is-danger' : d.flags.some(f => f.level === 'warn') ? ' is-warn' : '');
}

// Field-level diff against the text as first opened: keyed formats match by key, others by position.
function diff() {
  if (!P || original == null || $('raw').value === original) return [];
  const O = Q.parse(original);
  if (!O || O.format !== P.format) return [{ type: 'format' }];
  const keyed = Q.keyed(P);
  const ids = fields => { const seen = {}; return fields.map((f, i) => !keyed || f.fixed ? 'i' + i : f.key + '#' + (seen[f.key] = (seen[f.key] || 0) + 1)); };
  const oi = ids(O.fields), ni = ids(P.fields), out = [];
  P.fields.forEach((f, i) => {
    const j = oi.indexOf(ni[i]);
    if (j < 0) out.push({ type: 'added', i, label: f.label, to: f.value });
    else if (O.fields[j].value !== f.value) out.push({ type: 'changed', i, label: f.label, from: O.fields[j].value, to: f.value });
  });
  O.fields.forEach((f, j) => { if (!ni.includes(oi[j])) out.push({ type: 'removed', label: P.fields[j]?.label && !keyed ? P.fields[j].label : f.label, from: f.value }); });
  return out.length ? out : [{ type: 'format' }];
}
function renderChanges() {
  const d = diff();
  $('changes').hidden = !d.length;
  document.querySelectorAll('.kv').forEach((row, i) => row.classList.toggle('is-changed', d.some(c => c.i === i)));
  if (!d.length) return;
  const n = d.filter(c => c.type !== 'format').length;
  $('changesSummary').replaceChildren(...rich(n ? `✎ **${n} change${n > 1 ? 's' : ''}** from the original code` : '✎ Only the layout of the text changed; the values are the same'));
  const short = s => s.length > 40 ? s.slice(0, 40) + '…' : s || '(empty)';
  $('changesList').replaceChildren(...d.filter(c => c.type !== 'format').map(c => el('li', {},
    el('b', { textContent: c.label + ': ' }),
    ...(c.type === 'changed' ? [el('del', { textContent: short(c.from) }), ' → ', el('ins', { textContent: short(c.to) })]
      : c.type === 'added' ? ['added ', el('ins', { textContent: short(c.to) })] : ['removed ', el('del', { textContent: short(c.from) })]))));
}
$('reset').onclick = () => { load(original, { fromCode: true }); toast('Back to the original code'); };

function renderFields() {
  const box = $('fields');
  box.replaceChildren();
  $('fieldsEmpty').hidden = !!P; $('format').hidden = !P; $('idHint').hidden = !P || P.fields.length < 2;
  $('addField').hidden = !P || !Q.canAddField(P);
  if (!P) return;
  $('format').textContent = P.formatName;
  const keyed = Q.keyed(P);
  P.fields.forEach((f, i) => {
    const label = el('input', { className: 'kv-label', value: f.label, ariaLabel: 'Field name', oninput: e => { f.label = e.target.value; f.ai = null; } });
    const labelCell = el('div', {}, label);
    if (keyed && !f.fixed) labelCell.append(el('input', { className: 'kv-key', value: f.key, title: 'Key stored inside the QR', ariaLabel: 'Key stored inside the QR',
      oninput: e => { f.key = e.target.value; fieldsChanged(); } }));
    if (f.ai) { const unsure = f.ai.how === 'model' && f.ai.score < 0.45;
      labelCell.firstChild.after(el('span', { className: 'ai-mark' + (unsure ? ' unsure' : ''), textContent: unsure ? '✦ ?' : '✦',
        title: f.ai.how === 'rule' ? 'Recognised from the value’s pattern' : `Named by on-device AI · match ${Math.round(f.ai.score * 100)}%` + (unsure ? ' (unsure, please check)' : '') })); }
    const multi = f.value.includes('\n') || f.value.length > 70;
    const value = el(multi ? 'textarea' : 'input', { className: 'kv-value', value: f.value, ariaLabel: f.label, spellcheck: false,
      oninput: e => { f.value = e.target.value; fieldsChanged(); if (i === idIdx) prefillRange(); } });
    if (multi) value.rows = Math.min(6, f.value.split('\n').length + 1);
    const actions = el('div', { className: 'kv-actions' },
      el('button', { className: 'ghost id-toggle', textContent: 'ID', title: 'Use this field as the ID that counts up in a series', ariaPressed: String(i === idIdx),
        onclick: () => { idIdx = i; renderFields(); prefillRange(); refresh(); } }),
      el('button', { className: 'ghost', textContent: '✕', title: 'Remove field', ariaLabel: 'Remove ' + f.label, disabled: f.fixed || P.fields.length < 2,
        onclick: () => { P.fields.splice(i, 1); if (idIdx >= i && idIdx) idIdx--; renderFields(); fieldsChanged(); prefillRange(); } }));
    box.append(el('div', { className: 'kv' + (i === idIdx ? ' is-id' : '') }, labelCell, value, actions));
  });
}
$('addField').onclick = () => {
  const n = P.fields.length;
  P.fields.push(Q.keyed(P)
    ? { key: ['vcard', 'mecard'].includes(P.format) ? 'NOTE' : P.format === 'scheme' ? 'body' : 'field_' + (n + 1), label: 'New field', value: '' }
    : { key: String(n), label: 'Field ' + (n + 1), value: '' });
  renderFields(); fieldsChanged();
  $('fields').lastChild.querySelector('.kv-value').focus();
};

// ---------- On-device AI: small embedding model names the fields (labeler.js) ----------
const aiSay = (html, cls = 'muted') => { $('aiBox').hidden = false; $('aiStatus').className = cls; $('aiStatus').innerHTML = html; };
let labeler = null; // module, loaded on first use
const SPEC_FORMATS = ['vcard', 'mecard', 'scheme', 'url']; // names come from the standard or the link itself
// Auto mode only renames what rules couldn't: keyless values and cryptic keys like "dpt".
const needsName = f => !f.fixed && (!Q.keyed(P) || f.key.replace(/[^a-z]/gi, '').length < 4);

async function nameFields(all) {
  $('aiBox').hidden = true;
  if (!P || (!all && SPEC_FORMATS.includes(P.format))) return;
  const target = P, idx = P.fields.map((f, i) => i).filter(i => all ? !P.fields[i].fixed : needsName(P.fields[i]));
  if (!idx.length) return;
  $('aiBtn').disabled = true;
  try {
    if (!labeler) {
      aiSay('✦ Loading on-device AI to name the fields (23 MB, first time only)…');
      const m = await import('./labeler.js'); await m.load('./'); labeler = m;
    }
    const sug = await labeler.suggest(idx.map(i => P.fields[i]), Q.keyed(P));
    if (P !== target) return; // user opened something else meanwhile
    let named = 0, unsure = 0, idAt = -1;
    idx.forEach((i, k) => {
      const s = sug[k]; if (!s) return;
      const f = P.fields[i];
      f.label = s.label; f.ai = s; named++;
      if (s.how === 'model' && s.score < 0.45) unsure++;
      if (labeler.isIdLabel(s.label) && idAt < 0) idAt = i;
    });
    if (idAt >= 0) idIdx = idAt;
    renderFields(); prefillRange(); refresh();
    aiSay(named ? `✦ Field names were suggested by AI on your device` + (unsure ? `. Check the ${unsure} marked <b>?</b>; it wasn’t sure.` : '. Click a name to change it.')
      : 'The AI wasn’t confident about any field names. Click a name to type your own.');
  } catch (err) {
    aiSay('AI naming isn’t available right now. Everything else works; click a field name to rename it.', 'warn');
    console.warn(err);
  } finally { $('aiBtn').disabled = false; }
}
$('aiBtn').onclick = () => P && nameFields(true);

// ---------- 3. Encode ----------
function makeQR(text) {
  const ec = $('ec').value, ver = +$('ver').value || 0;
  try { const q = qrcode(ver, ec); q.addData(text, 'Byte'); q.make(); return { q, fellBack: false }; }
  catch { const q = qrcode(0, ec); q.addData(text, 'Byte'); q.make(); return { q, fellBack: ver !== 0 }; } // too long for that size
}
const LOGO_FRAC = 0.22; // logo box as share of the code width; H error correction tolerates it

function draw(canvas, q, caption) {
  const cell = +$('cell').value || 10, margin = +$('margin').value || 0, n = q.getModuleCount();
  const size = (n + 2 * margin) * cell, capH = caption ? Math.max(18, Math.round(size * 0.1)) : 0;
  canvas.width = size; canvas.height = size + capH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = $('bg').value; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = $('fg').value;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (q.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  if (logo) {
    const box = Math.round(n * cell * LOGO_FRAC), x = Math.round((size - box) / 2), pad = Math.max(2, Math.round(cell * 0.6));
    ctx.fillStyle = $('bg').value; ctx.beginPath(); ctx.roundRect(x - pad, x - pad, box + 2 * pad, box + 2 * pad, pad * 1.5); ctx.fill();
    const s = Math.min(box / logo.img.width, box / logo.img.height), w = logo.img.width * s, h = logo.img.height * s;
    ctx.drawImage(logo.img, x + (box - w) / 2, x + (box - h) / 2, w, h);
  }
  if (caption) {
    ctx.fillStyle = $('fg').value;
    ctx.font = `600 ${Math.round(capH * 0.6)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(caption, size / 2, size + capH * 0.4, size - 2 * cell);
  }
}
const captionFor = fields => $('caption').checked && fields?.[idIdx] ? fields[idIdx].value : '';

function toSVG(q, caption) {
  const m = +$('margin').value || 0, n = q.getModuleCount(), size = n + 2 * m, capH = caption ? Math.max(2, size * 0.1) : 0, cell = +$('cell').value || 10;
  const fg = $('fg').value, bg = $('bg').value, x = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
  let extra = '';
  if (logo) {
    const box = n * LOGO_FRAC, p = (size - box) / 2, pad = 0.6;
    extra += `<rect x="${p - pad}" y="${p - pad}" width="${box + 2 * pad}" height="${box + 2 * pad}" rx="${pad * 1.5}" fill="${bg}"/><image href="${logo.url}" x="${p}" y="${p}" width="${box}" height="${box}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  if (caption) extra += `<text x="${size / 2}" y="${size + capH * 0.4}" font-size="${capH * 0.6}" font-weight="600" font-family="system-ui, sans-serif" text-anchor="middle" dominant-baseline="middle" fill="${fg}">${x(caption)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size + capH}" width="${size * cell}" height="${Math.round((size + capH) * cell)}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path fill="${fg}" d="${d}"/>${extra}</svg>`;
}

// Scan test: decode our own output like a phone would (no colour inversion) and compare.
function scanTest(canvas, expected) {
  const s = Math.min(1, 520 / canvas.width), c = el('canvas', { width: Math.round(canvas.width * s), height: Math.round(canvas.height * s) });
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(canvas, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return jsQR(d.data, c.width, c.height, { inversionAttempts: 'dontInvert' })?.data === expected;
}
const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
let verifyT;
function verify() {
  clearTimeout(verifyT);
  const text = $('raw').value;
  if (!text) return ($('verify').hidden = true);
  verifyT = setTimeout(() => {
    const ok = scanTest($('single'), text), lf = lum($('fg').value), lb = lum($('bg').value), ratio = (Math.max(lf, lb) + .05) / (Math.min(lf, lb) + .05);
    const v = $('verify'); v.hidden = false;
    // Colour problems first: they're the usual cause and the fix is specific.
    const msg = lf > lb ? '✗ Light-on-dark codes fail on many phones. Make the dark colour darker than the light one.'
      : ratio < 4 ? (ok ? '⚠ Low contrast: scans here, but may fail in poor light.' : '✗ Not enough contrast between the two colours to scan.')
      : ok ? '✓ Scan-tested: reads back exactly'
      : '✗ Doesn’t scan reliably. ' + (logo ? 'Make the logo smaller or raise error correction.' : 'Try higher error correction or fewer characters.');
    v.className = 'verify ' + (msg.startsWith('✓') ? 'ok' : 'bad'); v.textContent = msg;
  }, 150);
}

function renderQR() {
  const text = $('raw').value, canvas = $('single');
  if (!text) { canvas.width = canvas.height = 0; $('singleInfo').textContent = ''; $('verify').hidden = true; return; }
  let made;
  try { made = makeQR(text); } catch { $('singleInfo').innerHTML = '<span class="err">Too much data for a single QR code (max ≈ 2,900 characters).</span>'; $('verify').hidden = true; return; }
  const { q, fellBack } = made;
  draw(canvas, q, captionFor(P?.fields));
  const v = (q.getModuleCount() - 17) / 4;
  $('singleInfo').innerHTML = `Version ${v} · error correction ${$('ec').value} · ${text.length} characters` +
    (fellBack ? '<br><span class="warn">Too much data for the original size, so the grid was enlarged.</span>'
      : sourceVersion && v === sourceVersion ? '<br><span style="color:var(--ok)">Same size as the code you opened.</span>' : '');
  verify();
}
['ec', 'ver', 'cell', 'margin', 'fg', 'bg', 'caption'].forEach(id => $(id).addEventListener('input', renderQR));

const fileBase = () => safeName(P?.fields[idIdx]?.value || $('raw').value);
$('dlOne').onclick = () => $('raw').value && download($('single').toDataURL('image/png'), fileBase() + '.png');
$('dlSvg').onclick = () => { if (!$('raw').value) return; const { q } = makeQR($('raw').value);
  download(URL.createObjectURL(new Blob([toSVG(q, captionFor(P?.fields))], { type: 'image/svg+xml' })), fileBase() + '.svg'); };
$('copyText').onclick = async () => { await navigator.clipboard.writeText($('raw').value); toast('Text copied'); };
$('copyImg').onclick = async () => {
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Promise(r => $('single').toBlob(r, 'image/png')) })]); toast('Image copied, paste it anywhere'); }
  catch { toast('Your browser blocked copying images. Use Download instead.'); }
};

// Logo
$('logoPick').onclick = () => $('logoFile').click();
$('logoFile').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { const img = new Image(); img.onload = () => {
    logo = { img, url: rd.result }; $('logoPrev').src = rd.result; $('logoPrev').hidden = false; $('logoRemove').hidden = false;
    if ($('ec').value !== 'H') { $('ec').value = 'H'; toast('Error correction set to Max so the code still scans with a logo'); }
    renderQR(); }; img.src = rd.result; };
  rd.readAsDataURL(f);
};
$('logoRemove').onclick = () => { logo = null; $('logoPrev').hidden = true; $('logoRemove').hidden = true; renderQR(); };

// ---------- 4. Series ----------
let mode = 'modeRange';
$('seriesTabs').addEventListener('tabchange', e => { mode = e.detail; });

function prefillRange() {
  if (!P) return;
  const v = P.fields[idIdx].value;
  $('start').value = Q.bump(v, 1);
  $('rangeHint').innerHTML = /\d/.test(v) ? `Counts up from the <b>${escapeHtml(P.fields[idIdx].label)}</b> field, keeping leading zeros.`
    : `<span class="warn">“${escapeHtml(P.fields[idIdx].label)}” has no number, so one will be added at the end.</span>`;
}

function variant(over) {
  const fields = P.fields.map((f, i) => i in over ? { ...f, value: over[i] } : f);
  return { fields, text: Q.serialize({ ...P, fields }), id: fields[idIdx].value };
}

function batch() {
  if (!P) { $('batchInfo').innerHTML = '<span class="warn">Open a QR code or pick a template first.</span>'; return []; }
  let items;
  if (mode === 'modeRange') {
    const start = $('start').value, count = Math.max(1, Math.min(+$('count').value || 1, 5000));
    items = Array.from({ length: count }, (_, i) => variant({ [idIdx]: i ? Q.bump(start, i) : start }));
  } else {
    if (!csvRows) { $('batchInfo').innerHTML = '<span class="warn">Choose a CSV file first.</span>'; return []; }
    const [head, ...rows] = csvRows, norm = s => s.trim().toLowerCase();
    const map = head.map(h => P.fields.findIndex(f => norm(f.label) === norm(h) || (f.key && norm(f.key) === norm(h))));
    items = rows.map(r => variant(Object.fromEntries(map.flatMap((fi, c) => fi >= 0 && r[c] !== undefined ? [[fi, r[c]]] : []))));
  }
  const seen = new Set(), dup = new Set();
  for (const it of items) (seen.has(it.id) ? dup : seen).add(it.id);
  $('batchInfo').innerHTML = `${items.length} codes` + (dup.size
    ? ` · <span class="err">duplicate ${escapeHtml(P.fields[idIdx].label)}: ${escapeHtml([...dup].slice(0, 5).join(', '))}${dup.size > 5 ? '…' : ''}</span>`
    : ` · every ${escapeHtml(P.fields[idIdx].label)} is unique`);
  return items;
}
const renderItem = it => { const c = el('canvas'); draw(c, makeQR(it.text).q, captionFor(it.fields)); return c; };

$('preview').onclick = () => {
  const items = batch().slice(0, 60);
  $('batchGrid').replaceChildren(...items.map(it => el('figure', { title: it.text }, renderItem(it), el('figcaption', { textContent: it.id }))));
};

$('zip').onclick = async () => {
  const items = batch();
  if (!items.length) return;
  toast(`Making ${items.length} codes…`);
  const zip = new JSZip(), used = new Set();
  let csv = ['file', ...P.fields.map(f => f.label), 'payload'].map(Q.csvCell).join(',') + '\n';
  for (const it of items) {
    let name = safeName(it.id), k = 1;
    while (used.has(name)) name = safeName(it.id) + '_' + k++;
    used.add(name);
    zip.file(name + '.png', renderItem(it).toDataURL('image/png').split(',')[1], { base64: true });
    csv += [name + '.png', ...it.fields.map(f => f.value), it.text].map(Q.csvCell).join(',') + '\n';
  }
  zip.file('index.csv', csv);
  download(URL.createObjectURL(await zip.generateAsync({ type: 'blob' })), 'qr-codes.zip');
};

// Print sheet: a grid of codes with the ID (and a name, if there is one) as real text under each.
$('print').onclick = () => {
  const items = batch();
  if (!items.length) return;
  const nameIdx = P.fields.findIndex((f, i) => i !== idIdx && /\bname\b/i.test(f.label));
  $('printSheet').style.setProperty('--label', $('labelSize').value + 'mm');
  $('printSheet').replaceChildren(...items.map(it => {
    const c = el('canvas'); draw(c, makeQR(it.text).q, '');
    return el('figure', {}, el('img', { src: c.toDataURL('image/png'), alt: '' }),
      el('figcaption', {}, el('b', { textContent: it.id }), nameIdx >= 0 ? el('span', { textContent: it.fields[nameIdx].value }) : ''));
  }));
  window.print();
};

$('csvTemplate').onclick = () => {
  if (!P) return toast('Open a QR code or pick a template first.');
  const csv = P.fields.map(f => Q.csvCell(f.label)).join(',') + '\n' + P.fields.map(f => Q.csvCell(f.value)).join(',') + '\n';
  download(URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), 'qr-template.csv'); // BOM so Excel reads UTF-8
};
$('csvPick').onclick = () => $('csvFile').click();
$('csvFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  csvRows = Q.parseCSV((await f.text()).replace(/^﻿/, ''));
  const head = csvRows[0] || [], norm = s => s.trim().toLowerCase();
  const unknown = head.filter(h => P && !P.fields.some(fl => norm(fl.label) === norm(h) || (fl.key && norm(fl.key) === norm(h))));
  $('csvInfo').innerHTML = `${escapeHtml(f.name)}: ${Math.max(0, csvRows.length - 1)} rows` + (unknown.length ? ` · <span class="warn">ignored columns: ${escapeHtml(unknown.join(', '))}</span>` : '');
};

const safeName = s => (s.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'qr');
function download(href, name) { el('a', { href, download: name }).click(); }

if (tool.preload) load(TEMPLATES[tool.preload]);
