import { useState } from "react";
import { useWalletConnector } from "@orderly.network/hooks";
import { useAdminWallet } from "@/hooks/useAdminWallet";

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function AdminWalletSetup() {
  const { wallet, connect } = useWalletConnector();
  const { adminWallet, isVerified, saveAdminWallet, clearAdminWallet } = useAdminWallet();
  const [status, setStatus] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [expanded, setExpanded] = useState(!isVerified);

  const connectedAddress = wallet?.address || "";

  const handleSign = async () => {
    if (!connectedAddress || !wallet?.provider) {
      setErrorMsg("Connect your wallet first.");
      setStatus("error");
      return;
    }

    setStatus("signing");
    setErrorMsg("");

    try {
      const message = `FrostDex Admin Wallet Setup\n\nI confirm that this wallet is authorized as the FrostDex Program ID and fee recipient.\n\nAddress: ${connectedAddress}\nTimestamp: ${Date.now()}`;

      const msgHex = "0x" + Array.from(new TextEncoder().encode(message))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      const sig = await wallet.provider.request({
        method: "personal_sign",
        params: [msgHex, connectedAddress],
      });

      saveAdminWallet(connectedAddress, sig as string);
      setStatus("done");
      setExpanded(false);
    } catch (e: any) {
      setErrorMsg(e?.message || "Signature rejected.");
      setStatus("error");
    }
  };

  const handleReset = () => {
    clearAdminWallet();
    setStatus("idle");
    setErrorMsg("");
    setExpanded(true);
  };

  return (
    <div style={{
      background: "rgba(56,224,248,0.04)",
      border: `1px solid ${isVerified ? "rgba(14,203,129,0.35)" : "rgba(56,224,248,0.2)"}`,
      borderRadius: 14,
      marginBottom: 24,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>{isVerified ? "✅" : "🔑"}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: isVerified ? "#0ecb81" : "#38e0f8" }}>
              {isVerified ? "Program ID — Confirmed" : "Setup Program ID (Fee Wallet)"}
            </div>
            {isVerified && (
              <div style={{ fontSize: 11, color: "rgba(180,190,210,0.5)", fontFamily: "monospace", marginTop: 2 }}>
                {shortAddr(adminWallet)}
              </div>
            )}
          </div>
        </div>
        <span style={{ color: "rgba(180,190,210,0.4)", fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ padding: "0 18px 18px" }}>
          {isVerified ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "rgba(14,203,129,0.07)", border: "1px solid rgba(14,203,129,0.2)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 11, color: "rgba(180,190,210,0.5)", marginBottom: 4 }}>Program ID / Fee Recipient</div>
                <div style={{ fontFamily: "monospace", fontSize: 13, color: "#0ecb81", wordBreak: "break-all" }}>{adminWallet}</div>
                <div style={{ marginTop: 8, fontSize: 11, color: "rgba(14,203,129,0.6)" }}>
                  ✓ Signature verified — all platform fees go to this wallet
                </div>
              </div>
              <button
                onClick={handleReset}
                style={{ alignSelf: "flex-start", background: "rgba(246,70,93,0.1)", border: "1px solid rgba(246,70,93,0.3)", borderRadius: 8, padding: "8px 16px", color: "#f6465d", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
              >
                🔄 Change Wallet
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <p style={{ fontSize: 12, color: "rgba(180,190,210,0.55)", margin: 0, lineHeight: 1.6 }}>
                Connect your wallet and sign a message to set it as the <b style={{ color: "#38e0f8" }}>Program ID</b>. All platform fees (buy, sell, token creation) will be sent to this address.
              </p>

              {!connectedAddress ? (
                <button
                  onClick={() => connect()}
                  style={{ width: "100%", padding: "13px 0", borderRadius: 10, border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer", background: "linear-gradient(135deg,#38e0f8,#0ecb81)", color: "#0b0e11" }}
                >
                  🔗 Connect Wallet
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ background: "rgba(56,224,248,0.07)", borderRadius: 8, padding: "10px 14px", fontSize: 12 }}>
                    <span style={{ color: "rgba(180,190,210,0.5)" }}>Connected: </span>
                    <span style={{ color: "#38e0f8", fontFamily: "monospace" }}>{shortAddr(connectedAddress)}</span>
                  </div>

                  <button
                    onClick={handleSign}
                    disabled={status === "signing"}
                    style={{
                      width: "100%", padding: "13px 0", borderRadius: 10, border: "none",
                      fontWeight: 700, fontSize: 14, cursor: status === "signing" ? "not-allowed" : "pointer",
                      background: status === "signing" ? "rgba(56,224,248,0.2)" : "linear-gradient(135deg,#38e0f8,#0ecb81)",
                      color: status === "signing" ? "rgba(180,190,210,0.5)" : "#0b0e11",
                      opacity: status === "signing" ? 0.7 : 1,
                      transition: "all 0.15s",
                    }}
                  >
                    {status === "signing" ? "⏳ Waiting for signature…" : "✍️ Sign & Set as Program ID"}
                  </button>
                </div>
              )}

              {status === "error" && (
                <div style={{ padding: "10px 14px", background: "rgba(246,70,93,0.1)", border: "1px solid rgba(246,70,93,0.3)", borderRadius: 8, color: "#f6465d", fontSize: 12 }}>
                  ❌ {errorMsg}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
