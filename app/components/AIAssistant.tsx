import { useState, useRef, useEffect } from "react";
import { FROST_TOKEN } from "@/utils/customTokens";
import { useDraggable } from "@/hooks/useDraggable";

interface Message { role: "user" | "assistant"; content: string; }

const SYSTEM_PROMPT = `You are FrostAI, an expert crypto trading assistant for FrostDex — a decentralized exchange on Orderly Network. You help traders with:
- Market analysis and price action interpretation
- Trading strategies (scalping, swing, position trading)
- Risk management and position sizing
- DeFi concepts, perpetual futures, leverage trading
- FROST token information (contract: ${FROST_TOKEN.address}, on Arbitrum)
- Orderly Network and FrostDex features
Keep answers concise, practical, and actionable. Use bullet points for clarity. Never give financial advice — always remind users to DYOR.`;

const GROQ_MODELS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
  { id: "llama-3.1-8b-instant",    label: "Llama 3.1 8B (Fast)" },
  { id: "mixtral-8x7b-32768",      label: "Mixtral 8x7B" },
];

async function askGroq(messages: Message[], model: string): Promise<string> {
  const payload = {
    model,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    max_tokens: 800,
    temperature: 0.7,
  };

  // 1. Try the Vercel serverless proxy first (keeps the key server-side).
  let proxyOk = false;
  try {
    const res = await fetch("/api/groq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "No response.";
    }
    // 4xx that isn't a "not found / method not allowed" → real error, surface it.
    if (res.status !== 404 && res.status !== 405 && res.status < 500) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error ${res.status}`);
    }
    // 404 / 405 / 5xx → proxy not available; fall through to direct call.
  } catch (e: any) {
    if (e?.message?.startsWith("Groq API error")) throw e;
    // Network/fetch error or proxy not found — fall through.
  }

  // 2. Direct fallback: the key is embedded at build time via vite.config define.
  const key: string = (globalThis as any).__GROQ_KEY__ ?? "";
  if (!key) throw new Error("FrostAI unavailable — GROQ_API_KEY not configured.");

  const res2 = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  if (!res2.ok) {
    const err = await res2.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Groq API error ${res2.status}`);
  }
  const data2 = await res2.json();
  void proxyOk; // suppress lint
  return data2.choices?.[0]?.message?.content ?? "No response.";
}

const SUGGESTIONS = [
  "What is FROST token?",
  "Best strategy for perp trading?",
  "How to manage leverage risk?",
  "Explain funding rates",
  "What is Orderly Network?",
];

interface Props { onHide: () => void; }

export default function AIAssistant({ onHide }: Props) {
  const [open, setOpen]         = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [hovered, setHovered]   = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [model, setModel] = useState(() => localStorage.getItem("frost_groq_model") || GROQ_MODELS[0].id);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  const defaultPos = { x: 12, y: typeof window !== "undefined" ? window.innerHeight - 122 : 600 };
  const { pos, isDragging, isSnapping, elementRef, isBottomHalf, dragHandleProps, wasDragged } =
    useDraggable("ai-assistant", defaultPos);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const saveModel = (m: string) => { setModel(m); localStorage.setItem("frost_groq_model", m); };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const reply = await askGroq(newMessages, model);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setError(e.message || "Request failed. Please try again.");
    } finally { setLoading(false); }
  };

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", left: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", left: 0 };

  return (
    <div
      ref={elementRef}
      {...dragHandleProps}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 200, userSelect: isDragging ? "none" : "auto", cursor: isDragging ? "grabbing" : "grab", transition: isSnapping ? "left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1)" : "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || isMobile) && !open && (
        <div className="widget-controls">
          <button className="widget-hide-btn" onMouseDown={e => e.stopPropagation()} onClick={onHide} title="Hide widget">✕</button>
        </div>
      )}

      <button className="ai-assistant-fab" onClick={() => { if (wasDragged()) return; setOpen(v => !v); }} aria-label="AI Trading Assistant">
        {open
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12h6M9 16h4M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4h6v2H9V4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        }
        <span>FrostAI</span>
      </button>

      {open && (
        <div className="ai-assistant-panel" style={{ ...panelStyle, width: 340, maxWidth: "calc(100vw - 24px)" }}>
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-panel-icon">❄</span>
              <div>
                <div className="ai-panel-name">FrostAI</div>
                <div className="ai-panel-sub" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ color: "#0ecb81", fontSize: 9 }}>●</span>
                  <span>Powered by Groq</span>
                </div>
              </div>
            </div>
            <div className="ai-panel-actions">
              <button className="ai-icon-btn" onClick={() => setShowSettings(v => !v)} title="Settings">⚙</button>
              {messages.length > 0 && <button className="ai-icon-btn" onClick={() => setMessages([])} title="Clear chat">🗑</button>}
            </div>
          </div>

          {showSettings && (
            <div className="ai-key-box" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
              <p className="ai-key-label" style={{ color: "#38e0f8" }}>Model</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {GROQ_MODELS.map(m => (
                  <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: model === m.id ? "#38e0f8" : "rgba(180,190,210,0.7)", cursor: "pointer" }}>
                    <input type="radio" name="groq-model" value={m.id} checked={model === m.id} onChange={() => saveModel(m.id)} style={{ accentColor: "#38e0f8" }} />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="ai-messages" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            {messages.length === 0 && !showSettings && (
              <div className="ai-welcome">
                <div className="ai-welcome-icon">❄</div>
                <div className="ai-welcome-title">FrostAI</div>
                <div className="ai-welcome-sub">Ask me anything about crypto trading, market analysis, or FrostDex.</div>
                <div className="ai-suggestions">
                  {SUGGESTIONS.map(s => <button key={s} className="ai-suggestion" onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg ai-msg--${msg.role}`}>
                {msg.role === "assistant" && <span className="ai-msg-avatar">❄</span>}
                <div className="ai-msg-bubble">
                  {msg.content.split("\n").map((line, j) => <span key={j}>{line}{j < msg.content.split("\n").length - 1 && <br />}</span>)}
                </div>
              </div>
            ))}
            {loading && <div className="ai-msg ai-msg--assistant"><span className="ai-msg-avatar">❄</span><div className="ai-msg-bubble ai-thinking"><span/><span/><span/></div></div>}
            {error && <div className="ai-error">{error}</div>}
            <div ref={bottomRef} />
          </div>

          <div className="ai-input-row" onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()}>
            <input ref={inputRef} className="ai-input" placeholder="Ask about markets, strategies…" value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} disabled={loading} />
            <button className="ai-send-btn" onClick={() => send()} disabled={loading || !input.trim()}>↑</button>
          </div>
        </div>
      )}
    </div>
  );
}
