import type { IncomingMessage, ServerResponse } from "node:http";

const GROQ_MODELS = new Set(["openai/gpt-oss-120b", "openai/gpt-oss-20b"]);
const MAX_BODY_BYTES = 20_000;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 4_000;
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const requestsByIp = new Map<string, { count: number; resetAt: number }>();

const SYSTEM_PROMPT =
  "You are FrostAI, an expert crypto trading assistant for FrostDex — a decentralized exchange on Orderly Network. You help traders with market analysis and price action, trading strategies, risk management and position sizing, DeFi, perpetual futures, leverage, FROST token (contract: 0x80A98400b405Fcba615952c3201869E5C4Ca3BC6 on Arbitrum), Orderly Network, and FrostDex. Keep answers concise, practical, and actionable. Use bullet points for clarity. Never give financial advice — always remind users to DYOR.";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ApiRequest = IncomingMessage & { body?: unknown };

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req: ApiRequest): Promise<unknown> {
  if (req.body !== undefined) {
    return req.body;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.length > 0 &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
}

function isChatRequest(
  value: unknown,
): value is { model: string; messages: ChatMessage[] } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Record<string, unknown>;
  if (
    typeof request.model !== "string" ||
    !GROQ_MODELS.has(request.model) ||
    !Array.isArray(request.messages) ||
    request.messages.length === 0 ||
    request.messages.length > MAX_MESSAGES ||
    !request.messages.every(isChatMessage)
  ) {
    return false;
  }

  return (
    request.messages.reduce(
      (total, message) => total + message.content.length,
      0,
    ) <= MAX_BODY_BYTES
  );
}

function isAllowedOrigin(req: ApiRequest): boolean {
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] ?? req.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") {
    return false;
  }

  try {
    return new URL(origin).host === host.split(",")[0].trim();
  } catch {
    return false;
  }
}

function isRateLimited(req: ApiRequest): boolean {
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const ip =
    (typeof realIp === "string" ? realIp : "") ||
    (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : "");
  if (!ip) {
    return true;
  }

  const now = Date.now();
  if (requestsByIp.size >= 5_000) {
    for (const [key, entry] of requestsByIp) {
      if (entry.resetAt <= now) {
        requestsByIp.delete(key);
      }
    }
    if (requestsByIp.size >= 5_000 && !requestsByIp.has(ip)) {
      return true;
    }
  }
  const current = requestsByIp.get(ip);
  if (!current || current.resetAt <= now) {
    requestsByIp.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (current.count >= RATE_LIMIT) {
    return true;
  }

  current.count += 1;
  return false;
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  if (!isAllowedOrigin(req)) {
    return sendJson(res, 403, { error: "Request origin is not allowed." });
  }
  if (isRateLimited(req)) {
    res.setHeader("Retry-After", "60");
    return sendJson(res, 429, {
      error: "Too many requests. Please try again shortly.",
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return sendJson(res, 503, { error: "FrostAI is not configured yet." });
  }
  if (!req.headers["content-type"]?.includes("application/json")) {
    return sendJson(res, 415, {
      error: "Expected an application/json request.",
    });
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid or oversized request body." });
  }

  if (!isChatRequest(body)) {
    return sendJson(res, 400, { error: "Invalid chat request." });
  }
  const { model, messages } = body;

  try {
    const upstream = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 800,
          temperature: 0.7,
        }),
      },
    );

    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      console.error("Groq API request failed with status", upstream.status);
      return sendJson(res, status, {
        error:
          status === 429
            ? "FrostAI is busy. Please try again shortly."
            : "FrostAI could not complete the request.",
      });
    }

    const result = (await upstream.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = result.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      return sendJson(res, 502, {
        error: "FrostAI returned an invalid response.",
      });
    }
    return sendJson(res, 200, { content });
  } catch (error) {
    console.error("FrostAI request failed:", error);
    return sendJson(res, 502, { error: "FrostAI is temporarily unavailable." });
  }
}
