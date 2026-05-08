// REDIS_URL format: rediss://default:TOKEN@HOST:PORT
let KV_URL = null, KV_TOKEN = null;
try {
  const u = new URL(process.env.REDIS_URL || '');
  KV_URL   = `https://${u.hostname}`;
  KV_TOKEN = decodeURIComponent(u.password);
} catch(e) {
  console.error('Failed to parse REDIS_URL:', e.message);
}
const STATE_KEY = 'golf_draft_state';

console.log('REDIS_URL present:', !!process.env.REDIS_URL);
console.log('KV_URL:', KV_URL);
console.log('KV_TOKEN present:', !!KV_TOKEN);

async function kvGet() {
  const r = await fetch(`${KV_URL}/get/${STATE_KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const { result } = await r.json();
  return result ? JSON.parse(result) : null;
}

async function kvSet(value) {
  const r = await fetch(KV_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', STATE_KEY, JSON.stringify(value)]),
  });
  if (!r.ok) throw new Error(`KV write failed: ${r.status}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'GET') {
    try {
      const data = await kvGet();
      return res.status(200).json(data);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      await kvSet(req.body);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
