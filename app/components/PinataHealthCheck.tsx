import { useState, useEffect } from "react";
import { testPinataConnection, getPinataStatus } from "@/services/ipfs";

export default function PinataHealthCheck() {
    const [checking, setChecking] = useState(false);
    const [status, setStatus] = useState<any>(null);
    const [connection, setConnection] = useState<any>(null);

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        setChecking(true);
        try {
            const configStatus = getPinataStatus();
            const connStatus = await testPinataConnection();

            setStatus(configStatus);
            setConnection(connStatus);
        } catch (error) {
            console.error("Error checking Pinata:", error);
        } finally {
            setChecking(false);
        }
    };

    if (!status) return null;

    return (
        <div
            style={{
                background: "rgba(56,224,248,0.06)",
                border: "1px solid rgba(56,224,248,0.15)",
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#38e0f8" }}>📦 Pinata Status</span>
                <button
                    onClick={checkStatus}
                    disabled={checking}
                    style={{
                        background: "transparent",
                        border: "1px solid rgba(56,224,248,0.3)",
                        color: "#38e0f8",
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: checking ? "not-allowed" : "pointer",
                        fontSize: 11,
                        fontWeight: 600,
                    }}
                >
                    {checking ? "Checking…" : "Refresh"}
                </button>
            </div>

            <div style={{ fontSize: 12, color: "rgba(180,190,210,0.8)" }}>
                <div style={{ marginBottom: 6 }}>
                    <span style={{ color: "rgba(180,190,210,0.6)" }}>Configuration:</span>
                    <div style={{ marginLeft: 16, marginTop: 4 }}>
                        <div>
                            • Env Var: {status.hasEnvVar ? "✓" : "✗"}
                        </div>
                        <div>
                            • LocalStorage: {status.hasLocalStorage ? "✓" : "✗"}
                        </div>
                        <div>
                            • Status: {status.isConfigured ? (
                                <span style={{ color: "#0ecb81" }}>✓ Configured</span>
                            ) : (
                                <span style={{ color: "#f6465d" }}>✗ Not Configured</span>
                            )}
                        </div>
                    </div>
                </div>

                {connection && (
                    <div style={{ borderTop: "1px solid rgba(56,224,248,0.15)", paddingTop: 6 }}>
                        <span style={{ color: "rgba(180,190,210,0.6)" }}>Connection Test:</span>
                        <div style={{ marginLeft: 16, marginTop: 4 }}>
                            <div>
                                Status: {connection.success ? (
                                    <span style={{ color: "#0ecb81" }}>✓ {connection.message}</span>
                                ) : (
                                    <span style={{ color: "#f6465d" }}>✗ {connection.message}</span>
                                )}
                            </div>
                            {connection.error && (
                                <div style={{ color: "#f6465d", fontSize: 11 }}>
                                    Error: {connection.error}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div style={{ borderTop: "1px solid rgba(56,224,248,0.15)", paddingTop: 6, marginTop: 6 }}>
                    <span style={{ color: "rgba(180,190,210,0.6)" }}>URLs:</span>
                    <div style={{ marginLeft: 16, marginTop: 4, fontSize: 10 }}>
                        <div style={{ fontFamily: "monospace", color: "rgba(56,224,248,0.7)", wordBreak: "break-all" }}>
                            Gateway: {status.gatewayUrl}
                        </div>
                        <div style={{ fontFamily: "monospace", color: "rgba(56,224,248,0.7)", wordBreak: "break-all", marginTop: 2 }}>
                            API: {status.apiUrl}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
