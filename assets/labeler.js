// On-device field naming with a small sentence-embedding model (all-MiniLM-L6-v2, 23 MB, int8 ONNX,
// runs on CPU via WASM, so any device). Picked by measurement over MediaPipe's USE/BERT embedders; see eval.html.
// Each value (and key, if the payload has keys) is compared with example values of known field types.
// It only suggests display names; it never touches the encoded data.

// label -> { keys: how people name it, values: what it looks like }
export const CATALOGUE = {
  'Full Name': { keys: ['name', 'full name', 'employee name', 'holder name', 'student name', 'attendee'],
    values: ['Priya Sharma', 'John Smith', 'Maria Garcia', 'Mohammed Ali Khan', 'Chen Wei', 'Aisha Bello', 'Lakshmi Narayanan', 'Emily Clarke', 'Hiroshi Tanaka', 'Gurpreet Singh', 'Ana Souza', 'Dmitri Ivanov'] },
  'Employee ID': { keys: ['employee id', 'emp id', 'staff id', 'employee number', 'emp code'], values: ['EMP00123', 'EMP-2024-0081', 'E-10442', 'STAFF-5521'] },
  'Student ID': { keys: ['student id', 'roll number', 'enrollment number', 'admission number', 'registration number'], values: ['STU-2024-0081', '21BCS1042', '2023UCS0045', 'ROLL-42'] },
  'Member ID': { keys: ['member id', 'membership number', 'card number', 'customer id'], values: ['M-0457', 'MEM10023', 'LIB-3321', 'CUST-88120'] },
  'Ticket ID': { keys: ['ticket id', 'booking id', 'ticket number', 'pnr', 'order id'], values: ['TKT-88213', 'BK20240601A', 'ORD-55123', 'PNR4521789'] },
  'Asset Tag': { keys: ['asset tag', 'asset id', 'serial number', 'inventory number'], values: ['AST-00991', 'SN-7F3K2L9', 'INV-2023-114', 'LAPTOP-0042'] },
  'Organisation': { keys: ['company', 'organisation', 'organization', 'employer', 'school', 'institution', 'org', 'issuer'],
    values: ['ACME Corp', 'Infosys', 'Tata Motors', 'IIT Madras', 'Google', 'Delhi Public School', 'Red Cross', 'Microsoft', 'State Bank of India', 'Fortis Healthcare', 'Cult.fit', 'Oxford University', 'Deloitte', 'Swiggy'] },
  'Department': { keys: ['department', 'dept', 'team', 'division', 'unit', 'function'],
    values: ['Engineering', 'Sales', 'Human Resources', 'Marketing', 'Finance', 'Operations', 'IT Support', 'Accounts', 'HR', 'Supply Chain', 'Facilities', 'Compliance', 'Design', 'Customer Success'] },
  'Job Title': { keys: ['designation', 'job title', 'role', 'position'],
    values: ['Software Engineer', 'Manager', 'Senior Analyst', 'Intern', 'Director', 'Data Scientist', 'Nurse', 'Vice President', 'Team Lead', 'Receptionist', 'Professor', 'Head of Marketing', 'Driver', 'Consultant'] },
  'Course': { keys: ['course', 'class', 'program', 'batch', 'grade', 'stream', 'standard'],
    values: ['B.Tech CSE', 'Class 10 B', 'MBA 2024', 'BS Data Science', 'Grade 7', 'Batch 2023', 'B.Com Hons', 'MBBS Year 3', 'Std VIII', 'Diploma in Nursing', 'PhD Chemistry'] },
  'Blood Group': { keys: ['blood group', 'blood type', 'bg'], values: ['O+', 'A-', 'B+ve', 'AB positive', 'O negative'] },
  'Gender': { keys: ['gender', 'sex'], values: ['Male', 'Female', 'Other', 'Non-binary', 'M', 'F'] },
  'Address': { keys: ['address', 'residence', 'addr'], values: ['12 MG Road, Bengaluru 560001', '221B Baker Street, London', 'Flat 4, Sector 21, Noida', '1600 Amphitheatre Pkwy', 'H.No 5-2-11, Kukatpally'] },
  'City': { keys: ['city', 'town', 'district'], values: ['Mumbai', 'Chennai', 'London', 'New York', 'Dubai', 'Pune', 'Lagos', 'Jaipur', 'Sydney', 'Nairobi', 'Lucknow', 'Paris'] },
  'Country': { keys: ['country', 'nationality'], values: ['India', 'United States', 'UAE', 'Germany', 'Singapore', 'Nigeria', 'Japan', 'Mexico', 'Australia', 'Kenya'] },
  'Event': { keys: ['event', 'event name', 'conference', 'show'],
    values: ['TechConf 2026', 'Annual Day', 'Diwali Mela', 'City Marathon 10K', 'Product Launch', 'Music Festival', 'Global AI Summit', 'Alumni Meet 2025', 'Startup Expo', 'Book Fair'] },
  'Seat': { keys: ['seat', 'row', 'gate', 'zone', 'section'], values: ['Seat 14', 'Row C-12', 'Gate 3', 'A-27', 'Zone B', 'Section 204', 'Block B Seat 9', 'Pavilion End'] },
  'Location': { keys: ['location', 'venue', 'campus', 'site', 'office', 'branch', 'building', 'floor'],
    values: ['North Campus', 'Hall B', 'Floor 3, Tower A', 'Mumbai Office', 'Main Stadium', 'Warehouse 2', 'Conference Room 4', 'Head Office', 'Library Wing', 'Plant 2'] },
  'Tier': { keys: ['tier', 'level', 'plan', 'category', 'membership type', 'pass type', 'access'],
    values: ['Gold', 'Platinum', 'Premium', 'VIP', 'Basic', 'Visitor', 'All Access', 'Staff', 'Guest', 'Economy', 'Contractor'] },
  'Status': { keys: ['status', 'state'], values: ['Active', 'Inactive', 'Verified', 'Pending', 'Expired', 'Approved', 'Blocked', 'Cancelled'] },
  'Notes': { keys: ['note', 'notes', 'remarks', 'comment'], values: ['Allergic to peanuts', 'Please return if found', 'Handle with care'] },
};
const ID_LABELS = new Set(['Employee ID', 'Student ID', 'Member ID', 'Ticket ID', 'Asset Tag', 'ID']);
export const isIdLabel = l => ID_LABELS.has(l);

// Patterns and words a model shouldn't have to guess.
const ORG_WORDS = /\b(college|university|school|institute|academy|gym|club|hospitals?|clinic|bank|corp|corporation|inc|ltd|limited|llc|pvt|plc|gmbh|industries|technologies|solutions|systems|group|foundation|trust|society|company|labs|enterprises|motors)\b\.?$/i;
const EVENT_WORDS = /\b(tour|fest|festival|summit|conference|conclave|concert|expo|meetup|hackathon|marathon|tedx|championship|workshop|webinar|gala|ceremony|convocation|premiere|carnival)\b/i;
export function ruleLabel(v) {
  v = v.trim();
  if (/^[^@\s]+@[^@\s]+\.\w+$/.test(v)) return 'Email';
  if (/^(https?:\/\/|www\.)/i.test(v)) return 'Website';
  if (/^(A|B|AB|O)\s?([+-]|\s?(\+?ve|-ve|pos(itive)?|neg(ative)?))$/i.test(v)) return 'Blood Group';
  const d = parseDate(v);
  if (d) { const years = (Date.now() - d) / 3.156e10; return years < 0 ? 'Valid Until' : years > 12 ? 'Date of Birth' : 'Date'; }
  if (/^\+?[\d\s()-]{8,}$/.test(v) && v.replace(/\D/g, '').length >= 8 && /[\s()+-]/.test(v)) return 'Phone';
  if (/\b(department|dept)\b/i.test(v)) return 'Department';
  if (EVENT_WORDS.test(v)) return 'Event';
  if (ORG_WORDS.test(v)) return 'Organisation';
  return null;
}
function parseDate(v) {
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], m[2] - 1, +m[3]);
  m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/); // dd/mm/yyyy; ponytail: mm/dd ambiguity only shifts the day, not the label
  if (m) return new Date(+m[3], m[2] - 1, +m[1]);
  return null;
}

let extractor = null, protos = null;

const ROOT = new URL('../', import.meta.url).href; // site root, whatever page imported us

export async function load() {
  if (extractor) return;
  const T = await import(ROOT + 'vendor/transformers/transformers.min.js');
  T.env.allowRemoteModels = false; T.env.allowLocalModels = true; // model files are served with the site
  T.env.localModelPath = ROOT + 'models/';
  T.env.backends.onnx.wasm.wasmPaths = ROOT + 'vendor/transformers/';
  extractor = await T.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8', device: 'wasm' });
  const items = Object.entries(CATALOGUE).flatMap(([label, { keys, values }]) => [
    ...keys.map(t => ({ label, kind: 'key', t })), ...values.map(t => ({ label, kind: 'value', t }))]);
  const vecs = await embed(items.map(i => i.t));
  protos = items.map((it, k) => ({ ...it, v: vecs[k] }));
}
const embed = async texts => texts.length ? (await extractor(texts, { pooling: 'mean', normalize: true })).tolist() : [];
const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

// fields: [{key, value}], useKeys: payload keys are meaningful
// -> [{label, score, how} | null] per field, labels unique across fields
export async function suggest(fields, useKeys, threshold = 0.3) {
  const cands = [];
  const out = fields.map(() => null);
  const need = [];
  fields.forEach((f, i) => {
    const rule = f.value.trim() && ruleLabel(f.value);
    if (rule) cands.push({ i, label: rule, score: 2, how: 'rule' });
    else need.push(i);
  });
  const vv = await embed(need.map(i => fields[i].value.trim().slice(0, 200) || '-'));
  const kv = useKeys ? await embed(need.map(i => (fields[i].key || '-').replace(/[_\-.]+/g, ' '))) : [];
  need.forEach((i, n) => {
    const best = {};
    for (const p of protos) {
      const s = p.kind === 'value' ? (fields[i].value.trim() ? dot(vv[n], p.v) : 0) : useKeys && fields[i].key ? dot(kv[n], p.v) + 0.1 : 0; // a real key is the stronger signal
      if (!(s <= best[p.label])) best[p.label] = s;
    }
    for (const [label, score] of Object.entries(best)) cands.push({ i, label, score, how: 'model' });
    // Looks like a code but no ID type matched well: generic ID.
    if (/\d/.test(fields[i].value) && /^[\w\-/]{3,}$/.test(fields[i].value.trim())) cands.push({ i, label: 'ID', score: threshold, how: 'model' });
  });
  // Greedy unique assignment, best (field, label) pairs first: two fields can't both be "Full Name".
  const used = new Set();
  for (const c of cands.sort((a, b) => b.score - a.score)) {
    if (c.score < threshold || out[c.i] || used.has(c.label)) continue;
    out[c.i] = { label: c.label, score: Math.min(1, c.score), how: c.how };
    used.add(c.label);
  }
  return out;
}
