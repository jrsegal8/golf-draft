const KV_URL   = process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN  = process.env.UPSTASH_REDIS_REST_TOKEN;
const STATE_KEY = 'golf_draft_state';

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
