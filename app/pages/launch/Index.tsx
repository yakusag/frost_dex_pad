import { useState, type CSSProperties } from "react";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight,
  Check,
  CircleHelp,
  LockKeyhole,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { generatePageTitle } from "@/utils/utils";

const chains = [
  { id: "ethereum", name: "Ethereum", ticker: "ETH", mark: "Ξ" },
  { id: "solana", name: "Solana", ticker: "SOL", mark: "◎" },
  { id: "bnb", name: "BNB Chain", ticker: "BNB", mark: "◆" },
  { id: "robinhood", name: "Robinhood Chain", ticker: "RH", mark: "R" },
] as const;

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 9,
  padding: "11px 12px",
  color: "#eaecef",
  fontSize: 14,
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: "rgba(180,190,210,0.65)",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

export default function LaunchIndex() {
  const [chainId, setChainId] = useState<(typeof chains)[number]["id"]>(
    "solana",
  );
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const selectedChain = chains.find((chain) => chain.id === chainId)!;

  const previewLaunch = () => {
    if (!name.trim() || !symbol.trim()) {
      setMessage("Enter a token name and ticker to preview your launch.");
      return;
    }

    setMessage(
      "Launch preview ready. No wallet request or blockchain transaction was created.",
    );
  };

  return (
    <>
      <Helmet>
        <title>{generatePageTitle("Launch Your Token")}</title>
      </Helmet>
      <main
        style={{
          minHeight: "100vh",
          background: "#0b0e11",
          color: "#eaecef",
          padding: "36px 16px 56px",
        }}
      >
        <div style={{ maxWidth: 1050, margin: "0 auto" }}>
          <header style={{ marginBottom: 25 }}>
            <span style={eyebrowStyle}>FROSTDEX LAUNCHPAD</span>
            <h1 style={{ fontSize: 34, fontWeight: 800, margin: "12px 0 8px" }}>
              Create your token
            </h1>
            <p style={introStyle}>
              Preview a transparent, bonding-curve launch for Ethereum, Solana,
              BNB Chain, or Robinhood Chain. No coding is needed to explore the
              flow.
            </p>
          </header>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
              gap: 18,
              alignItems: "start",
            }}
          >
            <section style={panelStyle}>
              <StepTitle number="01" title="Choose a chain" />
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 9,
                  marginTop: 14,
                }}
              >
                {chains.map((chain) => {
                  const active = chain.id === chainId;
                  return (
                    <button
                      key={chain.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setChainId(chain.id);
                        setMessage("");
                      }}
                      style={{
                        minHeight: 78,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: 11,
                        textAlign: "left",
                        color: "#eaecef",
                        background: active
                          ? "rgba(56,224,248,0.08)"
                          : "rgba(255,255,255,0.025)",
                        border: `1px solid ${active ? "rgba(56,224,248,0.55)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 10,
                        cursor: "pointer",
                      }}
                    >
                      <span style={chainMarkStyle(active)}>{chain.mark}</span>
                      <span style={{ minWidth: 0 }}>
                        <span
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {chain.name}
                        </span>
                        <span
                          style={{
                            display: "block",
                            marginTop: 4,
                            color: "rgba(180,190,210,0.48)",
                            fontSize: 10,
                          }}
                        >
                          Preview only
                        </span>
                      </span>
                      {active && (
                        <Check
                          size={15}
                          style={{ marginLeft: "auto", color: "#38e0f8" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              <div style={noticeStyle}>
                <CircleHelp size={16} style={{ flexShrink: 0 }} />
                <span>
                  {selectedChain.name} is available here as a UI preview only.
                  Live launches require a reviewed contract, wallet
                  integration, and tested liquidity plan for that chain.
                </span>
              </div>

              <div style={{ marginTop: 24 }}>
                <StepTitle number="02" title="Token details" />
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  <label htmlFor="launch-token-name">
                    <span style={labelStyle}>Token name</span>
                    <input
                      id="launch-token-name"
                      maxLength={32}
                      onChange={(event) => {
                        setName(event.target.value);
                        setMessage("");
                      }}
                      placeholder="e.g. Frost Coin"
                      style={inputStyle}
                      value={name}
                    />
                  </label>
                  <label htmlFor="launch-token-symbol">
                    <span style={labelStyle}>Ticker</span>
                    <input
                      id="launch-token-symbol"
                      maxLength={10}
                      onChange={(event) => {
                        setSymbol(
                          event.target.value
                            .replace(/[^a-zA-Z0-9]/g, "")
                            .toUpperCase(),
                        );
                        setMessage("");
                      }}
                      placeholder="e.g. FROST"
                      style={inputStyle}
                      value={symbol}
                    />
                  </label>
                  <label
                    htmlFor="launch-token-description"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <span style={labelStyle}>Description (optional)</span>
                    <textarea
                      id="launch-token-description"
                      maxLength={280}
                      onChange={(event) => {
                        setDescription(event.target.value);
                        setMessage("");
                      }}
                      placeholder="What is your token about?"
                      rows={3}
                      style={{ ...inputStyle, resize: "vertical" }}
                      value={description}
                    />
                  </label>
                </div>
              </div>

              <button
                onClick={previewLaunch}
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  marginTop: 18,
                  padding: "12px 16px",
                  border: 0,
                  borderRadius: 9,
                  background: "linear-gradient(135deg,#38e0f8,#0ecb81)",
                  color: "#0b0e11",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
                type="button"
              >
                Preview launch
                <ArrowRight size={15} />
              </button>
              {message && (
                <p
                  aria-live="polite"
                  style={{
                    margin: "12px 0 0",
                    color: "rgba(180,190,210,0.76)",
                    fontSize: 12,
                  }}
                >
                  {message}
                </p>
              )}
            </section>

            <aside style={{ display: "grid", gap: 16 }}>
              <section style={panelStyle}>
                <h2 style={{ margin: "0 0 15px", fontSize: 15 }}>
                  Launch principles
                </h2>
                <Rule icon={<Check size={14} />}>
                  Fixed supply and clear mint permissions
                </Rule>
                <Rule icon={<Check size={14} />}>
                  Public bonding-curve pricing and fees
                </Rule>
                <Rule icon={<LockKeyhole size={14} />}>
                  Show graduation threshold and liquidity destination up front
                </Rule>
                <Rule icon={<ShieldCheck size={14} />}>
                  Review and test contracts before accepting funds
                </Rule>
                <p style={finePrintStyle}>
                  These are proposed launch principles, not final on-chain
                  parameters. Fees, supply, curve, and migration rules must be
                  published before real launches are enabled.
                </p>
              </section>

              <section style={panelStyle}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    marginBottom: 14,
                  }}
                >
                  <Rocket size={17} color="#38e0f8" />
                  <h2 style={{ margin: 0, fontSize: 15 }}>Launch preview</h2>
                </div>
                <SummaryRow label="Name" value={name.trim() || "Token name"} />
                <SummaryRow label="Ticker" value={symbol || "TICKER"} />
                <SummaryRow label="Network" value={selectedChain.name} />
                <SummaryRow label="Supply" value="Set by published rules" />
                <SummaryRow label="Trading" value="Bonding curve (planned)" />
                {description.trim() && (
                  <p
                    style={{
                      margin: "12px 0 0",
                      color: "rgba(180,190,210,0.58)",
                      fontSize: 11,
                      lineHeight: 1.55,
                    }}
                  >
                    {description}
                  </p>
                )}
              </section>

              <p style={finePrintStyle}>
                Preview only. This page does not connect a wallet, upload
                metadata, create a token, collect funds, or send a transaction.
                Trading and listings on other DEXs require a separately
                implemented and verified liquidity migration.
              </p>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

const eyebrowStyle: CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  border: "1px solid rgba(56,224,248,0.22)",
  borderRadius: 999,
  background: "rgba(56,224,248,0.07)",
  color: "#38e0f8",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.08em",
};

const introStyle: CSSProperties = {
  maxWidth: 680,
  margin: 0,
  color: "rgba(180,190,210,0.58)",
  fontSize: 14,
  lineHeight: 1.65,
};

const panelStyle: CSSProperties = {
  padding: 18,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  background: "rgba(255,255,255,0.025)",
};

const noticeStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  marginTop: 14,
  padding: 12,
  border: "1px solid rgba(240,185,11,0.22)",
  borderRadius: 9,
  background: "rgba(240,185,11,0.055)",
  color: "rgba(220,210,180,0.78)",
  fontSize: 11,
  lineHeight: 1.55,
};

const finePrintStyle: CSSProperties = {
  margin: "16px 0 0",
  color: "rgba(180,190,210,0.48)",
  fontSize: 11,
  lineHeight: 1.6,
};

function chainMarkStyle(active: boolean): CSSProperties {
  return {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.06)",
    color: active ? "#38e0f8" : "#c2cad5",
    fontSize: 18,
    fontWeight: 800,
  };
}

function StepTitle({ number, title }: { number: string; title: string }) {
  return (
    <h2
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        margin: 0,
        fontSize: 15,
        fontWeight: 700,
      }}
    >
      <span style={{ color: "#38e0f8", fontSize: 11 }}>{number}</span>
      {title}
    </h2>
  );
}

function Rule({ icon, children }: { icon: React.ReactNode; children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 9,
        marginTop: 12,
        color: "rgba(210,218,230,0.7)",
        fontSize: 12,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: "#0ecb81", marginTop: 1 }}>{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
        borderBottom: "1px solid rgba(255,255,255,0.055)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "rgba(180,190,210,0.48)" }}>{label}</span>
      <span style={{ color: "rgba(230,235,242,0.82)", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}
