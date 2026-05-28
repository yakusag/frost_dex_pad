import { useEffect, useState } from "react";

export function NetworkStatus() {
  const [status, setStatus] = useState<"online" | "offline" | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout>;

    const handleOffline = () => {
      setStatus("offline");
    };

    const handleOnline = () => {
      setStatus("online");
      hideTimer = setTimeout(() => setStatus(null), 3000);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!status) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "72px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99998,
        padding: "10px 20px",
        borderRadius: "9999px",
        fontSize: "13px",
        fontWeight: 600,
        letterSpacing: "0.3px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
        animation: "net-slide-up 0.3s ease-out",
        background:
          status === "offline"
            ? "rgba(255,80,110,0.15)"
            : "rgba(60,230,180,0.15)",
        border:
          status === "offline"
            ? "1px solid rgba(255,80,110,0.4)"
            : "1px solid rgba(60,230,180,0.4)",
        color: status === "offline" ? "rgb(255,130,150)" : "rgb(60,230,180)",
        backdropFilter: "blur(12px)",
        boxShadow:
          status === "offline"
            ? "0 4px 20px rgba(255,80,110,0.2)"
            : "0 4px 20px rgba(60,230,180,0.2)",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background:
            status === "offline" ? "rgb(255,80,110)" : "rgb(60,230,180)",
          boxShadow:
            status === "offline"
              ? "0 0 6px rgb(255,80,110)"
              : "0 0 6px rgb(60,230,180)",
        }}
      />
      {status === "offline" ? "No internet connection" : "Back online"}
    </div>
  );
}
