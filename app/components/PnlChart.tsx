import { useMemo, useState } from "react";
import { useStatisticsDaily } from "@orderly.network/hooks";

type Period = "7D" | "30D" | "90D";

function SparkLine({ data, positive }: { data: number[]; positive: boolean }) {
  if (data.length < 2) return null;
  const W = 600, H = 120, PAD = 4;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const pathD = "M " + pts.join(" L ");
  const areaD = `M ${PAD},${H} L ${pts[0]} L ${pts.join(" L ")} L ${W - PAD},${H} Z`;
  const color = positive ? "#0ecb81" : "#f6465d";
  const gradId = `pnl-grad-${positive ? "g" : "r"}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function fmt(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}

function dateStr(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export default function PnlChart() {
  const [period, setPeriod] = useState<Period>("30D");
  const days = period === "7D" ? 7 : period === "30D" ? 30 : 90;

  const params = useMemo(() => ({
    startDate: dateStr(days),
    endDate: dateStr(0),
  }), [days]);

  const [rows, { aggregateValue }] = useStatisticsDaily(params);

  const { cumulative, todayPnl, labels } = useMemo(() => {
    if (!rows || rows.length === 0) return { cumulative: [], todayPnl: 0, labels: [] };
    const sorted = [...rows].sort((a: any, b: any) =>
      new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime()
    );
    let running = 0;
    const cumulative: number[] = [];
    const labels: string[] = [];
    for (const row of sorted as any[]) {
      running += Number(row.pnl ?? 0);
      cumulative.push(running);
      const d = new Date(row.date ?? Date.now());
      labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
    const last = sorted[sorted.length - 1] as any;
    return { cumulative, todayPnl: Number(last?.pnl ?? 0), labels };
  }, [rows]);

  const totalPnl = aggregateValue?.pnl ?? 0;
  const totalVol  = aggregateValue?.vol  ?? 0;
  const positive  = totalPnl >= 0;
  const todayPos  = todayPnl >= 0;
  const color     = positive ? "#0ecb81" : "#f6465d";
  const periods: Period[] = ["7D", "30D", "90D"];
  const noData    = rows !== undefined && rows.length === 0;

  return (
    <div style={{
      background: "var(--oui-color-base-8, #141720)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16,
      padding: "20px 20px 16px",
      marginBottom: 16,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(180,190,210,0.4)", marginBottom: 4, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Cumulative PnL · {period}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
            {totalPnl !== 0 ? (positive ? "+" : "") + fmt(totalPnl) : "—"}
            {totalPnl !== 0 && <span style={{ fontSize: 13, fontWeight: 500, color: "rgba(180,190,210,0.35)", marginLeft: 4 }}>USDC</span>}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
            <span style={{ fontSize: 12, color: "rgba(180,190,210,0.4)" }}>
              Today: <span style={{ color: todayPos ? "#0ecb81" : "#f6465d", fontWeight: 600 }}>{todayPnl !== 0 ? (todayPos ? "+" : "") + fmt(todayPnl) : "—"} USDC</span>
            </span>
            {totalVol > 0 && (
              <span style={{ fontSize: 12, color: "rgba(180,190,210,0.4)" }}>
                Vol: <span style={{ color: "rgba(180,190,210,0.7)", fontWeight: 600 }}>{fmt(totalVol)} USDC</span>
              </span>
            )}
          </div>
        </div>

        {/* Period selector */}
        <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 3, alignSelf: "flex-start" }}>
          {periods.map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: period === p ? "rgba(56,224,248,0.12)" : "transparent",
              color: period === p ? "#38e0f8" : "rgba(180,190,210,0.4)",
              transition: "all 0.15s",
            }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div style={{ height: 90, position: "relative" }}>
        {rows === undefined ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#38e0f8", animation: "pulse 1s infinite" }} />
            <span style={{ color: "rgba(180,190,210,0.3)", fontSize: 12 }}>Loading…</span>
          </div>
        ) : noData ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 4 }}>
            <span style={{ color: "rgba(180,190,210,0.2)", fontSize: 28 }}>📈</span>
            <span style={{ color: "rgba(180,190,210,0.25)", fontSize: 12 }}>Connect wallet to see your PnL</span>
          </div>
        ) : cumulative.length >= 2 ? (
          <SparkLine data={cumulative} positive={positive} />
        ) : null}
      </div>

      {/* X-axis */}
      {labels.length >= 2 && (
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 10, color: "rgba(180,190,210,0.25)" }}>{labels[0]}</span>
          <span style={{ fontSize: 10, color: "rgba(180,190,210,0.25)" }}>{labels[Math.floor(labels.length / 2)]}</span>
          <span style={{ fontSize: 10, color: "rgba(180,190,210,0.25)" }}>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}
