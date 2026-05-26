// api/validate-key.js
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://www.roblox.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { key } = req.body || {};
  if (!key || typeof key !== "string") {
    return res.status(400).json({ valid: false, error: "Key is required" });
  }

  const trimmedKey = key.trim().toUpperCase();

  try {
    const stored = await kv.get(`key:${trimmedKey}`);
    if (!stored) return res.status(200).json({ valid: false, error: "Invalid key" });

    const record = typeof stored === "string" ? JSON.parse(stored) : stored;

    if (record.disabled) return res.status(200).json({ valid: false, error: "Key has been revoked" });
    if (record.expiresAt && Date.now() > record.expiresAt)
      return res.status(200).json({ valid: false, error: "Key has expired" });

    record.lastUsed = Date.now();
    record.useCount = (record.useCount || 0) + 1;
    await kv.set(`key:${trimmedKey}`, JSON.stringify(record));

    return res.status(200).json({ valid: true, label: record.label || null });
  } catch (err) {
    console.error("validate-key error:", err);
    return res.status(500).json({ valid: false, error: "Server error" });
  }
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
