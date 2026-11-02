import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight,
  Check,
  CircleHelp,
  ImagePlus,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  X,
} from "lucide-react";
import { withBasePath } from "@/utils/base-path";
import { generatePageTitle } from "@/utils/utils";

const chains = [
  { id: "ethereum", name: "Ethereum", ticker: "ETH", mark: "Ξ" },
  { id: "solana", name: "Solana", ticker: "SOL", mark: "◎" },
  { id: "bnb", name: "BNB Chain", ticker: "BNB", mark: "◆" },
  { id: "robinhood", name: "Robinhood Chain", ticker: "RH", mark: "R" },
] as const;
const MAX_TOKEN_IMAGE_SIZE = 5 * 1024 * 1024;
const TOKEN_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  const [tokenImage, setTokenImage] = useState<File | null>(null);
  const [tokenImagePreview, setTokenImagePreview] = useState<string | null>(
    null,
  );
  const [initialBuySol, setInitialBuySol] = useState("");
  const [message, setMessage] = useState("");
  const tokenImageInputRef = useRef<HTMLInputElement>(null);
  const selectedChain = chains.find((chain) => chain.id === chainId)!;
  const initialBuyAmount = Number(initialBuySol);
  const validInitialBuy =
    Number.isFinite(initialBuyAmount) && initialBuyAmount > 0;
  const creationFee = validInitialBuy ? initialBuyAmount * 0.145 : 0;
  const initialTradeFee = validInitialBuy ? initialBuyAmount * 0.045 : 0;
  const firstBuyTotalFees = creationFee + initialTradeFee;

  useEffect(() => {
    if (!tokenImage) {
      setTokenImagePreview(null);
      return;
    }

    const previewUrl = URL.createObjectURL(tokenImage);
    setTokenImagePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [tokenImage]);

  const selectTokenImage = (file: File | undefined) => {
    if (!file) return;
    if (!TOKEN_IMAGE_TYPES.includes(file.type)) {
      setMessage("Choose a PNG, JPG, or WebP image for your token logo.");
      if (tokenImageInputRef.current) tokenImageInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_TOKEN_IMAGE_SIZE) {
      setMessage("Token logo must be 5 MB or smaller.");
      if (tokenImageInputRef.current) tokenImageInputRef.current.value = "";
      return;
    }

    setTokenImage(file);
    setMessage("");
  };

  const removeTokenImage = () => {
    setTokenImage(null);
    setMessage("");
    if (tokenImageInputRef.current) tokenImageInputRef.current.value = "";
  };

  const previewLaunch = () => {
    if (!name.trim() || !symbol.trim()) {
      setMessage("Enter a token name and ticker to preview your launch.");
      return;
    }
    if (!validInitialBuy) {
      setMessage("Enter a valid initial buy amount in SOL to review the fees.");
      return;
    }

    setMessage(
      "Launch details ready. This preview does not request a wallet or submit a transaction.",
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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 14,
              }}
            >
              <img
                src={withBasePath("/logo.webp")}
                alt="FrostDex"
                style={{
                  width: 68,
                  height: 68,
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
              <span style={eyebrowStyle}>FROSTDEX LAUNCHPAD</span>
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 800, margin: "12px 0 8px" }}>
              Create your token
            </h1>
            <p style={introStyle}>
              Review the planned Solana bonding-curve launch and its Raydium
              CPMM graduation destination. Other listed chains are concepts
              only; live launch transactions are not enabled.
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
                  {selectedChain.id === "solana"
                    ? "Solana tokens are planned to graduate to a Raydium CPMM pool. The migration contract is not implemented or deployed yet."
                    : `${selectedChain.name} is a visual concept only. The selected Raydium CPMM route applies to Solana; live launches on other chains are not supported.`}
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
                  <div style={{ gridColumn: "1 / -1" }}>
                    <span style={labelStyle}>Token logo (optional)</span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: 14,
                        border: "1px dashed rgba(56,224,248,0.28)",
                        borderRadius: 10,
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          display: "grid",
                          placeItems: "center",
                          flexShrink: 0,
                          overflow: "hidden",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 12,
                          background: "rgba(255,255,255,0.04)",
                        }}
                      >
                        {tokenImagePreview ? (
                          <img
                            src={tokenImagePreview}
                            alt={`${name.trim() || "Token"} logo preview`}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <ImagePlus
                            size={23}
                            aria-hidden="true"
                            color="rgba(180,190,210,0.55)"
                          />
                        )}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p
                          style={{
                            margin: "0 0 5px",
                            color: "#eaecef",
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        >
                          {tokenImage?.name || "Add your token image"}
                        </p>
                        <p
                          style={{
                            margin: "0 0 9px",
                            color: "rgba(180,190,210,0.52)",
                            fontSize: 10,
                            lineHeight: 1.5,
                          }}
                        >
                          PNG, JPG, or WebP · up to 5 MB. Preview only; the
                          image stays on this device.
                        </p>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              tokenImageInputRef.current?.click()
                            }
                            style={{
                              padding: 0,
                              border: 0,
                              background: "transparent",
                              color: "#38e0f8",
                              cursor: "pointer",
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {tokenImage ? "Change image" : "Choose image"}
                          </button>
                          {tokenImage && (
                            <button
                              type="button"
                              onClick={removeTokenImage}
                              aria-label="Remove token logo"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 3,
                                padding: 0,
                                border: 0,
                                background: "transparent",
                                color: "rgba(220,100,100,0.85)",
                                cursor: "pointer",
                                fontSize: 11,
                              }}
                            >
                              <X size={13} />
                              Remove
                            </button>
                          )}
                        </div>
                        <input
                          ref={tokenImageInputRef}
                          id="launch-token-image"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          aria-hidden="true"
                          tabIndex={-1}
                          onChange={(event) =>
                            selectTokenImage(event.currentTarget.files?.[0])
                          }
                          style={{ display: "none" }}
                        />
                      </div>
                    </div>
                  </div>
                  <label
                    htmlFor="launch-initial-buy"
                    style={{ gridColumn: "1 / -1" }}
                  >
                    <span style={labelStyle}>Creator initial buy (SOL)</span>
                    <input
                      id="launch-initial-buy"
                      inputMode="decimal"
                      min="0"
                      onChange={(event) => {
                        setInitialBuySol(event.target.value);
                        setMessage("");
                      }}
                      placeholder="Enter the planned initial buy"
                      step="any"
                      style={inputStyle}
                      type="number"
                      value={initialBuySol}
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
                Review launch details
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
                  Fees and destination
                </h2>
                <SummaryRow
                  label="Creation fee"
                  value={`14.5% · ${creationFee.toFixed(4)} SOL`}
                />
                <SummaryRow
                  label="Initial buy fee"
                  value={`4.5% · ${initialTradeFee.toFixed(4)} SOL`}
                />
                <SummaryRow
                  label="Initial buy fees total"
                  value={`19% · ${firstBuyTotalFees.toFixed(4)} SOL`}
                />
                <SummaryRow label="Every later buy" value="4.5% · no exemption" />
                <SummaryRow label="Every sell" value="4.5% · no exemption" />
                <SummaryRow
                  label="Graduation DEX"
                  value={
                    selectedChain.id === "solana"
                      ? "Raydium CPMM (planned)"
                      : "Not selected"
                  }
                />
                <Rule icon={<LockKeyhole size={14} />}>
                  These are the requested rates. Solana network fees, account
                  rent, and Raydium pool costs are separate.
                </Rule>
                <Rule icon={<ShieldCheck size={14} />}>
                  On-chain fee enforcement and Raydium migration are not
                  implemented or deployed.
                </Rule>
                <p style={finePrintStyle}>
                  For a creator initial buy of{" "}
                  {validInitialBuy ? initialBuyAmount.toFixed(4) : "0.0000"}{" "}
                  SOL, the planned 14.5% creation fee and 4.5% buy fee total{" "}
                  {validInitialBuy ? firstBuyTotalFees.toFixed(4) : "0.0000"}{" "}
                  SOL. No first-buy exemption is planned.
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    marginBottom: 8,
                  }}
                >
                  {tokenImagePreview ? (
                    <img
                      src={tokenImagePreview}
                      alt={`${name.trim() || "Token"} logo`}
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 12,
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      aria-label="No token logo selected"
                      style={{
                        width: 52,
                        height: 52,
                        display: "grid",
                        placeItems: "center",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 12,
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      <ImagePlus
                        size={20}
                        aria-hidden="true"
                        color="rgba(180,190,210,0.45)"
                      />
                    </div>
                  )}
                  <span
                    style={{
                      color: "rgba(180,190,210,0.52)",
                      fontSize: 11,
                    }}
                  >
                    {tokenImage ? "Token logo preview" : "No token logo yet"}
                  </span>
                </div>
                <SummaryRow label="Name" value={name.trim() || "Token name"} />
                <SummaryRow label="Ticker" value={symbol || "TICKER"} />
                <SummaryRow label="Network" value={selectedChain.name} />
                <SummaryRow label="Supply" value="Set by published rules" />
                <SummaryRow
                  label="Initial buy"
                  value={
                    validInitialBuy
                      ? `${initialBuyAmount.toFixed(4)} SOL`
                      : "Not set"
                  }
                />
                <SummaryRow
                  label="Trading"
                  value={
                    selectedChain.id === "solana"
                      ? "Bonding curve → Raydium CPMM (planned)"
                      : "Not available on this chain"
                  }
                />
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
                The smart contract and Raydium CPMM migration still need to be
                implemented, reviewed, and deployed before real trading.
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
