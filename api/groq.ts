// Vercel serverless function that proxies FrostAI chat requests to Groq.
//
// The frontend (app/components/AIAssistant.tsx) POSTs to `/api/groq`. In local
// development this path is handled by the Vite dev-server proxy (see
// vite.config.ts). In production on Vercel — a static build — there is no Vite
// proxy, so without this function the SPA catch-all rewrite returns the
// index.html for a POST and the browser reports "Groq API error 405".
//
// The Groq API key is read from the GROQ_API_KEY environment variable and never
// reaches the client. Set GROQ_API_KEY in the Vercel project settings.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Abuse controls — this endpoint is a public proxy to a paid API key, so we cap
// what callers can request to limit cost/quota exhaustion.
const ALLOWED_MODELS = new Set([
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768",
]);
const DEFAULT_MODEL = "llama-3.1-8b-instant";
const MAX_TOKENS_CAP = 1024;
const MAX_BODY_BYTES = 64 * 1024; // 64 KB is plenty for a chat turn.

export default async function handler(req: any, res: any) {
  // Allow browsers (CORS) — the key never leaves this function.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed. Use POST." } });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: "GROQ_API_KEY is not configured on the server." } });
    return;
  }

  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (raw.length > MAX_BODY_BYTES) {
      res.status(413).json({ error: { message: "Request too large." } });
      return;
    }

    let payload: any;
    try {
      payload = typeof req.body === "object" && req.body != null ? req.body : JSON.parse(raw);
    } catch {
      res.status(400).json({ error: { message: "Invalid JSON body." } });
      return;
    }

    // Enforce a known model and a hard max_tokens ceiling.
    payload.model = ALLOWED_MODELS.has(payload?.model) ? payload.model : DEFAULT_MODEL;
    const requested = Number(payload?.max_tokens) || MAX_TOKENS_CAP;
    payload.max_tokens = Math.min(requested, MAX_TOKENS_CAP);

    const upstream = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (e: any) {
    res.status(502).json({ error: { message: e?.message || "Upstream request to Groq failed." } });
  }
}
