// node test_parse.js — every example must round-trip, and bump must keep padding.
require('./assets/parse.js');
const Q = globalThis.QRPayload, assert = require('assert');
const cases = {
  text: 'ACME-EMP-00123',
  delimited: 'ACME|EMP00123|Priya Sharma|Engineering|2024-06-01',
  kv: 'Name: Priya Sharma\nEmployee ID: EMP-00123\nDepartment: Engineering',
  kvInline: 'Name: Priya, Dept: Eng, ID=77',
  query: 'id=EMP%2000123&name=Priya+S',
  json: '{"org":"ACME","member_id":"M-0457","n":5,"ok":true}',
  url: 'https://example.org/verify?id=STU-2024-0081&campus=north',
  vcard: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Sharma;Priya;;;\r\nFN:Priya Sharma\r\nTEL;TYPE=CELL:+91 98765 43210\r\nNOTE:a\\, b\r\nEND:VCARD',
  wifi: String.raw`WIFI:T:WPA;S:ACME\;Guest;P:welcome123;;`,
  mecard: 'MECARD:N:Sharma,Priya;TEL:123;;',
};
for (const [name, t] of Object.entries(cases)) {
  const p = Q.parse(t);
  const out = Q.serialize(p);
  const same = name === 'query' ? Q.parse(out).fields.map(f => f.value).join() === p.fields.map(f => f.value).join() : out === t;
  assert(same, `${name}: ${JSON.stringify(out)} != ${JSON.stringify(t)}`);
  console.log(name.padEnd(10), p.format.padEnd(10), 'id→', p.fields[Q.idFieldIndex(p.fields)].label.padEnd(12), p.fields.map(f => `${f.label}=${f.value}`).join(' | '));
}
// edit then serialize keeps structure
const p = Q.parse(cases.wifi); p.fields[2].value = 'new;pass'; assert.equal(Q.serialize(p), String.raw`WIFI:T:WPA;S:ACME\;Guest;P:new\;pass;;`);
assert.equal(Q.bump('EMP-0099', 1), 'EMP-0100'); assert.equal(Q.bump('A9', 1), 'A10'); assert.equal(Q.bump('X', 2), 'X2');
assert.deepEqual(Q.parseCSV('a,"b,c"\r\n"x""y",z\n'), [['a', 'b,c'], ['x"y', 'z']]);
// sloppy unescaped ';' is kept, and re-escaped on output
assert.equal(Q.serialize(Q.parse('WIFI:S:A;B;P:x;;')), String.raw`WIFI:S:A\;B;P:x;;`);
assert.equal(Q.humanize('member_id'), 'Member ID');
console.log('ok');

// ---- action links + UPI ----
for (const t of ['tel:+919876543210', 'SMSTO:+911234567:Hello there', 'mailto:hr@acme.com?subject=Badge%20request&body=Hi', 'geo:12.9716,77.5946?q=Office', 'upi://pay?pa=shop@okicici&pn=Ravi%20Stores&am=250&cu=INR']) {
  const p = Q.parse(t);
  assert.equal(Q.serialize(p), t, `${p.format} round-trip`);
  console.log(p.formatName.padEnd(16), p.fields.map(f => `${f.label}=${f.value}`).join(' | '));
}
const m = Q.parse('mailto:a@b.com?subject=Hi'); m.fields[1].value = 'New subject & more'; assert.equal(Q.serialize(m), 'mailto:a@b.com?subject=New%20subject%20%26%20more');
assert.equal(Q.canAddField(Q.parse('tel:123')), false); assert.equal(Q.canAddField(Q.parse('mailto:a@b.co')), true);

// ---- insights ----
require('./assets/insights.js');
const I = globalThis.QRInsights;
const d = t => I.describe(Q.parse(t), t);
const levels = t => d(t).flags.map(f => f.level).join(',');
assert.match(d('https://example.org').head, /example\.org/); assert.equal(levels('https://example.org'), 'ok');
assert.match(levels('http://paypal.com.secure-login.xyz/verify'), /danger/, 'brand impersonation');
assert.match(d('http://paypal.com.secure-login.xyz/').flags[0].text, /secure-login\.xyz/);
assert.equal(levels('https://pineapple.com'), 'ok', 'no false positive on substring brand');
assert.equal(levels('https://accounts.google.co.in/x'), 'ok', 'real google domain');
assert.match(levels('https://bit.ly/3abc'), /warn/);
assert.match(levels('http://192.168.1.4/login'), /danger/);
assert.match(levels('https://xn--pypal-4ve.com'), /danger/);
assert.match(levels('https://google.com@evil.io/x'), /danger/);
assert.match(levels('https://files.example.com/app.apk'), /warn/);
assert.match(d('upi://pay?pa=shop@okicici&pn=Ravi%20Stores&am=250').head, /Ravi Stores.*₹250/);
assert.match(d('WIFI:T:nopass;S:Cafe;;').flags[0].text, /Open network/);
assert.match(d('WIFI:T:WPA;S:ACME;P:x;;').head, /ACME.*WPA/);
assert.match(d('ACME|EMP1|https://bit.ly/x').flags[0].text, /^Field 3|Link: Shortened/);
assert.match(d('BEGIN:VCARD\nVERSION:3.0\nFN:Priya\nORG:ACME\nEND:VCARD').head, /Priya.*ACME/);
assert.match(levels('javascript:alert(1)'), /danger/);
assert.equal(I.registrable('a.b.example.co.uk'), 'example.co.uk');
console.log('insights ok');
