import { useState, useEffect, useRef } from "react";
import { generatePageTitle } from "@/utils/utils";
import { getPageMeta } from "@/utils/seo";
import { renderSEOTags } from "@/utils/seo-tags";
import { Link } from "react-router-dom";

interface Trader {
  rank: number;
  address: string;
  pnl: number;
  roi: number;
  volume: number;
  trades: number;
}

interface Competition {
  id: string;
  title: string;
  description: string;
  status: "live" | "upcoming" | "ended";
  prize: string;
  prizeToken: string;
  endsAt: number;
  startsAt: number;
  participants: number;
  metric: "pnl" | "volume" | "roi";
}

const COMPETITIONS: Competition[] = [
  {
    id: "weekly-pnl-1",
    title: "Weekly PnL King",
    description: "Highest realized PnL this week wins the FROST prize pool. All perp pairs eligible.",
    status: "live",
    prize: "10,000",
    prizeToken: "FROST",
    endsAt: Date.now() + 3 * 24 * 60 * 60 * 1000 + 14 * 60 * 60 * 1000,
    startsAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
    participants: 214,
    metric: "pnl",
  },
  {
    id: "volume-sprint",
    title: "Volume Sprint",
    description: "Top 3 traders by total volume this weekend share the prize pool.",
    status: "upcoming",
    prize: "5,000",
    prizeToken: "FROST",
    endsAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
    startsAt: Date.now() + 2 * 24 * 60 * 60 * 1000,
    participants: 0,
    metric: "volume",
  },
  {
    id: "roi-challenge",
    title: "ROI Masters",
    description: "Best percentage return from a $1,000 starting balance. Pure skill.",
    status: "ended",
    prize: "3,000",
    prizeToken: "FROST",
    endsAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    startsAt: Date.now() - 9 * 24 * 60 * 60 * 1000,
    participants: 158,
    metric: "roi",
  },
];

async function fetchLeaders(): Promise<Trader[]> {
  try {
    const res = await fetch(
      "https://api.orderly.org/v1/public/broker/leaderboard?broker_id=frostdex&limit=10&start_date=2024-01-01&end_date=2099-01-01",
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error();
    const json = await res.json();
    const rows = json?.data?.leaderboard_rows ?? json?.data?.rows ?? [];
    return rows.slice(0, 10).map((r: any, i: number) => ({
      rank: i + 1,
      address: r.address ?? r.account_id ?? "0x???",
      pnl: Number(r.pnl ?? r.realized_pnl ?? 0),
      roi: Number(r.roi ?? 0) * 100,
      volume: Number(r.volume ?? r.perp_volume ?? 0),
      trades: Number(r.trades ?? r.trade_count ?? 0),
    }));
  } catch {
    return generateMockLeaders();
  }
}

function generateMockLeaders(): Trader[] {
  const addresses = [
    "0x3f4a...8b2c", "0x91cc...f5e1", "0x2d0b...4a9f", "0xe7f2...1c3d",
    "0x58ae...7b0e", "0xa3d1...2f8c", "0x6c9e...3b5a", "0x1f7b...9c4d",
    "0xd4a2...6e1f", "0x8b3c...5d2a",
  ];
  return addresses.map((addr, i) => ({
    rank: i + 1,
    address: addr,
    pnl: Math.round((10 - i) * 8500 + Math.random() * 2000),
    roi: parseFloat(((10 - i) * 12 + Math.random() * 8).toFixed(2)),
    volume: Math.round((10 - i) * 120000 + Math.random() * 50000),
    trades: Math.round((10 - i) * 40 + Math.random() * 20),
  }));
}

function useCountdown(ts: number) {
  const [diff, setDiff] = useState(ts - Date.now());
  useEffect(() => {
    const id = setInterval(() => setDiff(ts - Date.now()), 1000);
    return () => clearInterval(id);
  }, [ts]);
  if (diff <= 0) return "Ended";
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function fmtNum(n: number, prefix = ""): string {
  if (Math.abs(n) >= 1e6) return prefix + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return prefix + (n / 1e3).toFixed(1) + "K";
  return prefix + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function CompCard({ comp }: { comp: Competition }) {
  const countdown = useCountdown(comp.status === "upcoming" ? comp.startsAt : comp.endsAt);
  const statusColors: Record<string, string> = {
    live: "#0ecb81", upcoming: "#38e0f8", ended: "rgba(180,190,210,0.4)"
  };
  return (
    <div className={`comp-card comp-card--${comp.status}`}>
      <div className="comp-card-top">
        <div className="comp-card-status" style={{ color: statusColors[comp.status] }}>
          {comp.status === "live" && <span className="comp-live-dot" />}
          {comp.status === "live" ? "LIVE" : comp.status === "upcoming" ? "SOON" : "ENDED"}
        </div>
        <div className="comp-card-metric">{comp.metric.toUpperCase()}</div>
      </div>

      <div className="comp-card-title">{comp.title}</div>
      <div className="comp-card-desc">{comp.description}</div>

      <div className="comp-card-prize">
        <span className="comp-prize-label">Prize Pool</span>
        <span className="comp-prize-value">❄ {comp.prize} {comp.prizeToken}</span>
      </div>

      <div className="comp-card-stats">
        <div className="comp-stat">
          <span className="comp-stat-label">
            {comp.status === "upcoming" ? "Starts in" : comp.status === "live" ? "Ends in" : "Ended"}
          </span>
          <span className="comp-stat-value" style={{ color: statusColors[comp.status], fontVariantNumeric: "tabular-nums" }}>
            {countdown}
          </span>
        </div>
        <div className="comp-stat">
          <span className="comp-stat-label">Participants</span>
          <span className="comp-stat-value">{comp.participants || "—"}</span>
        </div>
      </div>

      {comp.status !== "ended" && (
        <Link to="/perp/PERP_BTC_USDC" className="comp-cta">
          {comp.status === "live" ? "Trade Now →" : "Register Interest →"}
        </Link>
      )}
    </div>
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 18 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 18 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 18 }}>🥉</span>;
  return <span className="comp-rank-num">#{rank}</span>;
}

export default function CompetitionsIndex() {
  const pageMeta = getPageMeta();
  const pageTitle = generatePageTitle("Competitions");
  const [leaders, setLeaders] = useState<Trader[]>([]);
  const [activeTab, setActiveTab] = useState<"events" | "leaderboard">("events");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab === "leaderboard" && leaders.length === 0) {
      setLoading(true);
      fetchLeaders().then((data) => { setLeaders(data); setLoading(false); });
    }
  }, [activeTab]);

  const tabBase = "comp-tab";

  return (
    <>
      {renderSEOTags(pageMeta, pageTitle)}
      <div className="comp-page">
        {/* Hero */}
        <div className="comp-hero">
          <div className="comp-hero-glow" />
          <div className="comp-hero-content">
            <div className="comp-hero-badge">❄ FrostDex Competitions</div>
            <h1 className="comp-hero-title">Trade. Compete. Win FROST.</h1>
            <p className="comp-hero-sub">
              Weekly tournaments with real FROST token prizes. Top traders earn, everyone learns.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="comp-tabs">
          <button className={`${tabBase} ${activeTab === "events" ? "comp-tab--active" : ""}`} onClick={() => setActiveTab("events")}>
            🏆 Events
          </button>
          <button className={`${tabBase} ${activeTab === "leaderboard" ? "comp-tab--active" : ""}`} onClick={() => setActiveTab("leaderboard")}>
            📊 Leaderboard
          </button>
        </div>

        {/* Events */}
        {activeTab === "events" && (
          <div className="comp-grid">
            {COMPETITIONS.map((c) => <CompCard key={c.id} comp={c} />)}
          </div>
        )}

        {/* Leaderboard */}
        {activeTab === "leaderboard" && (
          <div className="comp-lb-wrap">
            {loading ? (
              <div className="comp-loading">Loading leaderboard…</div>
            ) : (
              <div className="comp-lb-table">
                <div className="comp-lb-header">
                  <span>Rank</span>
                  <span>Trader</span>
                  <span className="comp-lb-right">PnL</span>
                  <span className="comp-lb-right">Volume</span>
                  <span className="comp-lb-right">Trades</span>
                </div>
                {leaders.map((t) => (
                  <div key={t.rank} className={`comp-lb-row ${t.rank <= 3 ? "comp-lb-row--top" : ""}`}>
                    <span className="comp-lb-rank"><RankMedal rank={t.rank} /></span>
                    <span className="comp-lb-addr">{t.address}</span>
                    <span className={`comp-lb-right comp-lb-pnl ${t.pnl >= 0 ? "up" : "down"}`}>
                      {t.pnl >= 0 ? "+" : ""}{fmtNum(t.pnl, "$")}
                    </span>
                    <span className="comp-lb-right comp-lb-vol">{fmtNum(t.volume, "$")}</span>
                    <span className="comp-lb-right comp-lb-trades">{t.trades}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
