import { PLATFORM_FEE_WALLET } from "@/hooks/useAdminWallet";

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function AdminWalletSetup() {
  return (
    <div style={{
      background: "rgba(14,203,129,0.04)",
      border: "1px solid rgba(14,203,129,0.25)",
      borderRadius: 14,
      marginBottom: 24,
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px" }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0ecb81" }}>
            Platform Fee Wallet — Active
          </div>
          <div style={{ fontSize: 11, color: "rgba(180,190,210,0.5)", fontFamily: "monospace", marginTop: 2 }}>
            {shortAddr(PLATFORM_FEE_WALLET)}
          </div>
        </div>
        <div style={{ fontSize: 10, color: "rgba(14,203,129,0.5)", background: "rgba(14,203,129,0.08)", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>
          VERIFIED
        </div>
      </div>
      <div style={{ padding: "0 18px 14px" }}>
        <div style={{ background: "rgba(14,203,129,0.07)", border: "1px solid rgba(14,203,129,0.15)", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
          <div style={{ color: "rgba(180,190,210,0.5)", marginBottom: 4 }}>All fees (buy, sell, token creation, advanced options) → </div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#0ecb81", wordBreak: "break-all" }}>{PLATFORM_FEE_WALLET}</div>
        </div>
      </div>
    </div>
  );
}
