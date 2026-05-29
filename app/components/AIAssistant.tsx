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

async function askAI(messages: Message[], apiKey: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 600,
      temperature: 0.7,
    }),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error?.message || `API error ${res.status}`); }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No response.";
}

const SUGGESTIONS = ["What is FROST token?", "Best strategy for perp trading?", "How to manage leverage risk?", "Explain funding rates", "What is Orderly Network?"];

interface Props { onHide: () => void; }

export default function AIAssistant({ onHide }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("frost_ai_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const defaultPos = { x: 12, y: typeof window !== "undefined" ? window.innerHeight - 122 : 600 };
  const { pos, isDragging, elementRef, isBottomHalf, dragHandleProps } = useDraggable("ai-assistant", defaultPos);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 100); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }
  }, [open, messages]);

  const saveKey = (key: string) => { setApiKey(key); localStorage.setItem("frost_ai_key", key); setShowKeyInput(false); setError(""); };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    if (!apiKey) { setShowKeyInput(true); return; }
    const userMsg: Message = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages); setInput(""); setLoading(true); setError("");
    try {
      const reply = await askAI(newMessages, apiKey);
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) { setError(e.message || "Error. Check your API key."); } finally { setLoading(false); }
  };

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", left: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", left: 0 };

  return (
    <div
      ref={elementRef}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 200, userSelect: isDragging ? "none" : "auto" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle + hide — shown on hover when panel closed */}
      {hovered && !open && (
        <div className="widget-controls">
          <span className="widget-drag-handle" {...dragHandleProps} title="Drag to move">⠿</span>
          <button className="widget-hide-btn" onClick={onHide} title="Hide widget">✕</button>
        </div>
      )}

      {/* FAB */}
      <button className="ai-assistant-fab" onClick={() => setOpen(v => !v)} aria-label="AI Trading Assistant">
        {open
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 12h6M9 16h4M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4h6v2H9V4z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        }
        <span>FrostAI</span>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="ai-assistant-panel" style={{ ...panelStyle, width: 340, maxWidth: "calc(100vw - 24px)" }}>
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-panel-icon">❄</span>
              <div><div className="ai-panel-name">FrostAI</div><div className="ai-panel-sub">Trading Assistant</div></div>
            </div>
            <div className="ai-panel-actions">
              <button className="ai-icon-btn" onClick={() => setShowKeyInput(v => !v)} title="Set API Key">⚙</button>
              {messages.length > 0 && <button className="ai-icon-btn" onClick={() => setMessages([])} title="Clear chat">🗑</button>}
            </div>
          </div>

          {showKeyInput && (
            <div className="ai-key-box">
              <p className="ai-key-label">Enter your OpenAI API key</p>
              <p className="ai-key-sub">Stored locally in your browser only</p>
              <div className="ai-key-row">
                <input type="password" placeholder="sk-..." defaultValue={apiKey} className="ai-key-input"
                  onKeyDown={e => { if (e.key === "Enter") saveKey((e.target as HTMLInputElement).value); }} id="ai-key-field" />
                <button className="ai-key-save" onClick={() => { const v = (document.getElementById("ai-key-field") as HTMLInputElement)?.value; if (v) saveKey(v); }}>Save</button>
              </div>
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="ai-key-link">Get a free API key →</a>
            </div>
          )}

          <div className="ai-messages">
            {messages.length === 0 && !showKeyInput && (
              <div className="ai-welcome">
                <div className="ai-welcome-icon">❄</div>
                <div className="ai-welcome-title">FrostAI</div>
                <div className="ai-welcome-sub">Ask me anything about crypto trading, market analysis, or FrostDex.</div>
                <div className="ai-suggestions">{SUGGESTIONS.map(s => <button key={s} className="ai-suggestion" onClick={() => send(s)}>{s}</button>)}</div>
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

          <div className="ai-input-row">
            <input ref={inputRef} className="ai-input" placeholder="Ask about markets, strategies…" value={input}
              onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} disabled={loading} />
            <button className="ai-send-btn" onClick={() => send()} disabled={loading || !input.trim()}>↑</button>
          </div>
        </div>
      )}
    </div>
  );
}
