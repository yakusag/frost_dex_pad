import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAdminWallet } from "@/hooks/useAdminWallet";

export default function WalletSetup() {
    const wallet = useWallet();
    const { adminWallet, programId, savedWallet, pinataJwt, setPinataJwtToken } = useAdminWallet();
    const [jwtInput, setJwtInput] = useState("");
    const [showJwtInput, setShowJwtInput] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleSaveJwt = () => {
        if (jwtInput.trim()) {
            setPinataJwtToken(jwtInput);
            setJwtInput("");
            setShowJwtInput(false);
            alert("✅ Pinata JWT saved!");
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={{ padding: "20px", background: "rgba(22, 27, 38, 0.8)", border: "1px solid rgba(56, 224, 248, 0.2)", borderRadius: "12px", marginBottom: "20px" }}>
            <h3 style={{ color: "#38e0f8", marginBottom: "16px", fontSize: "16px", fontWeight: 700 }}>
                🔑 Wallet & Configuration Setup
            </h3>

            {/* Wallet Connection */}
            <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "rgba(180, 190, 210, 0.6)", marginBottom: "8px", textTransform: "uppercase" }}>
                    Connected Wallet
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <div style={{ flex: 1 }}>
                        <WalletMultiButton />
                    </div>
                </div>
                {wallet.publicKey && (
                    <div style={{ fontSize: "11px", color: "#0ecb81", marginTop: "4px" }}>
                        ✓ Connected: {wallet.publicKey.toBase58().slice(0, 8)}...{wallet.publicKey.toBase58().slice(-4)}
                    </div>
                )}
            </div>

            {/* Admin Wallet Display */}
            <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(56, 224, 248, 0.05)", borderRadius: "8px", border: "1px solid rgba(56, 224, 248, 0.1)" }}>
                <label style={{ display: "block", fontSize: "12px", color: "rgba(180, 190, 210, 0.6)", marginBottom: "6px", textTransform: "uppercase" }}>
                    Admin Wallet (Fee Recipient)
                </label>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <code style={{ fontSize: "11px", color: "#38e0f8", wordBreak: "break-all" }}>
                        {adminWallet}
                    </code>
                    <button
                        onClick={() => copyToClipboard(adminWallet)}
                        style={{
                            padding: "4px 8px",
                            background: "rgba(56, 224, 248, 0.15)",
                            border: "1px solid rgba(56, 224, 248, 0.3)",
                            borderRadius: "4px",
                            color: "#38e0f8",
                            cursor: "pointer",
                            fontSize: "10px",
                            whiteSpace: "nowrap",
                            transition: "all 0.2s",
                        }}
                    >
                        {copied ? "✓ Copied" : "Copy"}
                    </button>
                </div>
                {savedWallet && (
                    <div style={{ fontSize: "10px", color: "#0ecb81", marginTop: "4px" }}>
                        ✓ Saved {new Date(savedWallet.createdAt).toLocaleDateString()}
                    </div>
                )}
            </div>

            {/* Program ID Display */}
            <div style={{ marginBottom: "16px", padding: "12px", background: "rgba(14, 203, 129, 0.05)", borderRadius: "8px", border: "1px solid rgba(14, 203, 129, 0.1)" }}>
                <label style={{ display: "block", fontSize: "12px", color: "rgba(180, 190, 210, 0.6)", marginBottom: "6px", textTransform: "uppercase" }}>
                    Program ID
                </label>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <code style={{ fontSize: "11px", color: "#0ecb81", wordBreak: "break-all" }}>
                        {programId}
                    </code>
                    <button
                        onClick={() => copyToClipboard(programId)}
                        style={{
                            padding: "4px 8px",
                            background: "rgba(14, 203, 129, 0.15)",
                            border: "1px solid rgba(14, 203, 129, 0.3)",
                            borderRadius: "4px",
                            color: "#0ecb81",
                            cursor: "pointer",
                            fontSize: "10px",
                            whiteSpace: "nowrap",
                            transition: "all 0.2s",
                        }}
                    >
                        {copied ? "✓ Copied" : "Copy"}
                    </button>
                </div>
            </div>

            {/* Pinata JWT Setup */}
            <div style={{ marginBottom: "0", padding: "12px", background: "rgba(246, 70, 93, 0.05)", borderRadius: "8px", border: "1px solid rgba(246, 70, 93, 0.1)" }}>
                <label style={{ display: "block", fontSize: "12px", color: "rgba(180, 190, 210, 0.6)", marginBottom: "6px", textTransform: "uppercase" }}>
                    Pinata JWT (IPFS Storage)
                </label>
                {pinataJwt ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                        <code style={{ fontSize: "10px", color: "#f6465d", wordBreak: "break-all" }}>
                            {pinataJwt.slice(0, 20)}...{pinataJwt.slice(-10)}
                        </code>
                        <button
                            onClick={() => setShowJwtInput(!showJwtInput)}
                            style={{
                                padding: "4px 8px",
                                background: "rgba(246, 70, 93, 0.15)",
                                border: "1px solid rgba(246, 70, 93, 0.3)",
                                borderRadius: "4px",
                                color: "#f6465d",
                                cursor: "pointer",
                                fontSize: "10px",
                                whiteSpace: "nowrap",
                            }}
                        >
                            Edit
                        </button>
                    </div>
                ) : (
                    <div style={{ color: "rgba(180, 190, 210, 0.5)", fontSize: "11px" }}>
                        Not configured
                    </div>
                )}

                {showJwtInput && (
                    <div style={{ marginTop: "10px", display: "flex", gap: "8px", flexDirection: "column" }}>
                        <input
                            type="password"
                            value={jwtInput}
                            onChange={(e) => setJwtInput(e.target.value)}
                            placeholder="Paste your Pinata JWT token here..."
                            style={{
                                width: "100%",
                                boxSizing: "border-box",
                                padding: "8px",
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(246, 70, 93, 0.2)",
                                borderRadius: "6px",
                                color: "#eaecef",
                                fontSize: "12px",
                                outline: "none",
                            }}
                        />
                        <div style={{ display: "flex", gap: "8px" }}>
                            <button
                                onClick={handleSaveJwt}
                                disabled={!jwtInput.trim()}
                                style={{
                                    flex: 1,
                                    padding: "8px",
                                    background: "#f6465d",
                                    border: "none",
                                    borderRadius: "6px",
                                    color: "#fff",
                                    cursor: jwtInput.trim() ? "pointer" : "not-allowed",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                    opacity: jwtInput.trim() ? 1 : 0.5,
                                }}
                            >
                                Save JWT
                            </button>
                            <button
                                onClick={() => setShowJwtInput(false)}
                                style={{
                                    flex: 1,
                                    padding: "8px",
                                    background: "rgba(255, 255, 255, 0.06)",
                                    border: "1px solid rgba(255, 255, 255, 0.1)",
                                    borderRadius: "6px",
                                    color: "rgba(180, 190, 210, 0.6)",
                                    cursor: "pointer",
                                    fontSize: "11px",
                                    fontWeight: 600,
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Get Pinata JWT Instructions */}
            {!showJwtInput && !pinataJwt && (
                <div style={{ marginTop: "12px", padding: "10px", background: "rgba(56, 224, 248, 0.08)", borderRadius: "6px", fontSize: "11px", color: "rgba(180, 190, 210, 0.7)", lineHeight: "1.5" }}>
                    <strong>📝 Get Pinata JWT:</strong>
                    <br />
                    1. Go to <a href="https://app.pinata.cloud" target="_blank" rel="noopener noreferrer" style={{ color: "#38e0f8" }}>pinata.cloud</a>
                    <br />
                    2. Create API Key → Select "Admin" scope
                    <br />
                    3. Copy the JWT token and paste here
                </div>
            )}
        </div>
    );
}
