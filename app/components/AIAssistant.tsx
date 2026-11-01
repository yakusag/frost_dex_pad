import { useState, useRef, useEffect } from "react";
import { useDraggable } from "@/hooks/useDraggable";
import { FROST_TOKEN } from "@/utils/customTokens";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are FrostAI, an expert crypto trading assistant for FrostDex — a decentralized exchange on Orderly Network. You help traders with:
- Market analysis and price action interpretation
- Trading strategies (scalping, swing, position trading)
- Risk management and position sizing
- DeFi concepts, perpetual futures, leverage trading
- FROST token information (contract: ${FROST_TOKEN.address}, on Arbitrum)
- Orderly Network and FrostDex features
Keep answers concise, practical, and actionable. Use bullet points for clarity. Never give financial advice — always remind users to DYOR.`;

const GROQ_MODELS = [
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
  { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B (Fast)" },
];

const LS_KEY = "frost_groq_key";
const LS_MODEL = "frost_groq_model";

function getSavedModel(): string {
  const savedModel = localStorage.getItem(LS_MODEL);
  return (
    GROQ_MODELS.find(({ id }) => id === savedModel)?.id ?? GROQ_MODELS[0].id
  );
}

function getApiKey(): string {
  return localStorage.getItem(LS_KEY) || "";
}

async function askGroq(
  messages: Message[],
  apiKey: string,
  model: string,
): Promise<string> {
  const usePersonalKey = Boolean(apiKey);
  const res = await fetch(
    usePersonalKey
      ? "https://api.groq.com/openai/v1/chat/completions"
      : "/api/frostai",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(usePersonalKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(
        usePersonalKey
          ? {
              model,
              messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...messages,
              ],
              max_tokens: 800,
              temperature: 0.7,
            }
          : { model, messages },
      ),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || err?.error || `Groq API error ${res.status}`,
    );
  }
  const data = await res.json();
  return usePersonalKey
    ? (data.choices?.[0]?.message?.content ?? "No response.")
    : (data.content ?? "No response.");
}

const SUGGESTIONS = [
  "What is FROST token?",
  "Best strategy for perp trading?",
  "How to manage leverage risk?",
  "Explain funding rates",
  "What is Orderly Network?",
];

interface Props {
  onHide: () => void;
}

export default function AIAssistant({ onHide }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hovered, setHovered] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [apiKey, setApiKey] = useState(getApiKey);
  const [keyInput, setKeyInput] = useState("");
  const [keySaved, setKeySaved] = useState(false);

  const [model, setModel] = useState(getSavedModel);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(LS_MODEL, model);
  }, [model]);

  const defaultPos = {
    x: 12,
    y: typeof window !== "undefined" ? window.innerHeight - 122 : 600,
  };
  const {
    pos,
    isDragging,
    isSnapping,
    elementRef,
    isBottomHalf,
    dragHandleProps,
    wasDragged,
  } = useDraggable("ai-assistant", defaultPos);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [open, messages]);

  const saveModel = (m: string) => {
    setModel(m);
    localStorage.setItem(LS_MODEL, m);
  };

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    localStorage.setItem(LS_KEY, k);
    setApiKey(k);
    setKeyInput("");
    setKeySaved(true);
    setTimeout(() => {
      setKeySaved(false);
      setShowSettings(false);
    }, 1200);
  };

  const removeKey = () => {
    localStorage.removeItem(LS_KEY);
    setApiKey(getApiKey());
  };

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
      const reply = await askGroq(newMessages, apiKey, model);
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setError(e.message || "Error. Check API key.");
    } finally {
      setLoading(false);
    }
  };

  const panelStyle: React.CSSProperties = isBottomHalf
    ? { position: "absolute", bottom: "calc(100% + 8px)", left: 0 }
    : { position: "absolute", top: "calc(100% + 8px)", left: 0 };

  const storedKey = localStorage.getItem(LS_KEY);

  return (
    <div
      ref={elementRef}
      {...dragHandleProps}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 200,
        userSelect: isDragging ? "none" : "auto",
        cursor: isDragging ? "grabbing" : "grab",
        transition: isSnapping
          ? "left 0.25s cubic-bezier(.22,1,.36,1), top 0.25s cubic-bezier(.22,1,.36,1)"
          : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || isMobile) && !open && (
        <div className="widget-controls">
          <button
            className="widget-hide-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onHide}
            title="Hide widget"
          >
            ✕
          </button>
        </div>
      )}

      <button
        className="ai-assistant-fab"
        onClick={() => {
          if (wasDragged()) return;
          setOpen((v) => !v);
        }}
        aria-label="AI Trading Assistant"
      >
        {open ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M9 12h6M9 16h4M7 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2M9 4h6v2H9V4z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
        <span>FrostAI</span>
      </button>

      {open && (
        <div
          className="ai-assistant-panel"
          style={{ ...panelStyle, width: 340, maxWidth: "calc(100vw - 24px)" }}
        >
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-panel-icon">❄</span>
              <div>
                <div className="ai-panel-name">FrostAI</div>
                <div
                  className="ai-panel-sub"
                  style={{ display: "flex", alignItems: "center", gap: 4 }}
                >
                  <span
                    style={{
                      color: "#0ecb81",
                      fontSize: 9,
                    }}
                  >
                    ●
                  </span>
                  <span>Powered by Groq</span>
                </div>
              </div>
            </div>
            <div className="ai-panel-actions">
              <button
                className="ai-icon-btn"
                onClick={() => setShowSettings((v) => !v)}
                title="Settings"
              >
                ⚙
              </button>
              {messages.length > 0 && (
                <button
                  className="ai-icon-btn"
                  onClick={() => setMessages([])}
                  title="Clear chat"
                >
                  🗑
                </button>
              )}
            </div>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div
              className="ai-key-box"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              {/* API Key section */}
              <div style={{ marginBottom: 12 }}>
                <p
                  className="ai-key-label"
                  style={{ color: "#38e0f8", marginBottom: 6 }}
                >
                  Optional Groq API Key
                  {storedKey && (
                    <span
                      style={{ color: "#0ecb81", fontSize: 10, marginLeft: 6 }}
                    >
                      ✓ saved
                    </span>
                  )}
                </p>
                {storedKey ? (
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: "rgba(180,190,210,0.5)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {storedKey.slice(0, 8)}••••••••{storedKey.slice(-4)}
                    </span>
                    <button
                      onClick={removeKey}
                      style={{
                        fontSize: 10,
                        color: "#f6465d",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px 4px",
                        flexShrink: 0,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="password"
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveKey();
                        }}
                        placeholder="gsk_..."
                        style={{
                          flex: 1,
                          background: "rgba(255,255,255,0.06)",
                          border: "1px solid rgba(56,224,248,0.2)",
                          borderRadius: 6,
                          padding: "6px 10px",
                          color: "#e0e6f0",
                          fontSize: 12,
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={saveKey}
                        style={{
                          background: keySaved ? "#0ecb81" : "#38e0f8",
                          color: "#000",
                          border: "none",
                          borderRadius: 6,
                          padding: "6px 12px",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {keySaved ? "✓" : "Save"}
                      </button>
                    </div>
                    <p
                      style={{
                        fontSize: 10,
                        color: "rgba(180,190,210,0.4)",
                        marginTop: 5,
                      }}
                    >
                      Optional. Otherwise FrostDex provides access. Personal
                      keys are available at{" "}
                      <a
                        href="https://console.groq.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#38e0f8" }}
                      >
                        console.groq.com
                      </a>
                      . Stored locally only.
                    </p>
                  </>
                )}
              </div>

              {/* Model picker */}
              <p
                className="ai-key-label"
                style={{ color: "#38e0f8", marginBottom: 6 }}
              >
                Model
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {GROQ_MODELS.map((m) => (
                  <label
                    key={m.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12,
                      color:
                        model === m.id ? "#38e0f8" : "rgba(180,190,210,0.7)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name="groq-model"
                      value={m.id}
                      checked={model === m.id}
                      onChange={() => saveModel(m.id)}
                      style={{ accentColor: "#38e0f8" }}
                    />
                    {m.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div
            className="ai-messages"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {messages.length === 0 && !showSettings && (
              <div className="ai-welcome">
                <div className="ai-welcome-icon">❄</div>
                <div className="ai-welcome-title">FrostAI</div>
                <div className="ai-welcome-sub">
                  Ask me anything about crypto trading, market analysis, or
                  FrostDex.
                </div>
                <div className="ai-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      className="ai-suggestion"
                      onClick={() => send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`ai-msg ai-msg--${msg.role}`}>
                {msg.role === "assistant" && (
                  <span className="ai-msg-avatar">❄</span>
                )}
                <div className="ai-msg-bubble">
                  {msg.content.split("\n").map((line, j) => (
                    <span key={j}>
                      {line}
                      {j < msg.content.split("\n").length - 1 && <br />}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {loading && (
              <div className="ai-msg ai-msg--assistant">
                <span className="ai-msg-avatar">❄</span>
                <div className="ai-msg-bubble ai-thinking">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            {error && <div className="ai-error">{error}</div>}
            <div ref={bottomRef} />
          </div>

          <div
            className="ai-input-row"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              className="ai-input"
              placeholder="Ask about markets, strategies…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              disabled={loading}
            />
            <button
              className="ai-send-btn"
              onClick={() => send()}
              disabled={loading || !input.trim()}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
