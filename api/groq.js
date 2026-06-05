export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(500).json({
      error: { message: "AI assistant is not configured (GROQ_API_KEY missing on server)." },
    });
    return;
  }

  try {
    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body,
    });

    const data = await groqRes.json().catch(() => ({
      error: { message: `Groq API error ${groqRes.status}` },
    }));

    res.status(groqRes.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: e?.message || "Proxy error" } });
  }
}
