// api/admin/keys.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-secret");

  if (req.method === "OPTIONS") return res.status(200).end();

  const secret = req.headers["x-admin-secret"];
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method === "POST") {
    const { key, label, expiresInDays } = req.body || {};
    const finalKey = key ? key.trim().toUpperCase() : generateKey();

    if (await kv.get(`key:${finalKey}`)) {
      return res.status(409).json({ error: "Key already exists" });
    }

    const record = {
      label: label || null,
      createdAt: Date.now(),
      expiresAt: expiresInDays ? Date.now() + expiresInDays * 86400000 : null,
      disabled: false,
      useCount: 0,
      lastUsed: null,
    };

    await kv.set(`key:${finalKey}`, JSON.stringify(record));
    const index = await getKeyIndex();
    index.push(finalKey);
    await kv.set("keys:index", JSON.stringify(index));

    return res.status(201).json({ key: finalKey, ...record });
  }

  if (req.method === "GET") {
    const index = await getKeyIndex();
    const keys = await Promise.all(
      index.map(async (k) => {
        const raw = await kv.get(`key:${k}`);
        if (!raw) return null;
        const record = typeof raw === "string" ? JSON.parse(raw) : raw;
        return { key: k, ...record };
      })
    );
    return res.status(200).json({ keys: keys.filter(Boolean) });
  }

  if (req.method === "DELETE") {
    const { key } = req.body || req.query || {};
    if (!key) return res.status(400).json({ error: "Key required" });
    const finalKey = key.trim().toUpperCase();
    const raw = await kv.get(`key:${finalKey}`);
    if (!raw) return res.status(404).json({ error: "Key not found" });
    const record = typeof raw === "string" ? JSON.parse(raw) : raw;
    record.disabled = true;
    await kv.set(`key:${finalKey}`, JSON.stringify(record));
    return res.status(200).json({ success: true, key: finalKey });
  }

  return res.status(405).json({ error: "Method not allowed" });
}

function generateKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [4, 4, 4, 4]
    .map((len) =>
      Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
    )
    .join("-");
}

async function getKeyIndex() {
  const raw = await kv.get("keys:index");
  if (!raw) return [];
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

const kv = {
  async get(key) {
    const res = await fetch(`${process.env.KV_REST_API_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` },
    });
    if (!res.ok) return null;
    const { result } = await res.json();
    return result ?? null;
  },
  async set(key, value) {
    const res = await fetch(`${process.env.KV_REST_API_URL}/set/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ value }),
    });
    return res.ok;
  },
};
