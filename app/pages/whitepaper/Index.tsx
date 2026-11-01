import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { generatePageTitle } from "@/utils/utils";
import { withBasePath } from "@/utils/base-path";
import { Zap, Shield, DollarSign, Globe, Layers, TrendingUp, BookOpen, Snowflake, ChevronRight, Map, Rocket } from "lucide-react";

const CYAN = "rgba(56,224,248,0.9)";
const GREEN = "#0ecb81";

function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`oui-rounded-2xl oui-p-6 md:oui-p-8 ${className}`}
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="oui-inline-flex oui-items-center oui-gap-1.5 oui-text-xs oui-font-semibold oui-px-3 oui-py-1 oui-rounded-full"
      style={{ background: `${CYAN}15`, color: CYAN, border: `1px solid ${CYAN}30` }}>
      {children}
    </span>
  );
}

export default function WhitepaperIndex() {
  return (
    <>
      <Helmet><title>{generatePageTitle("Whitepaper")}</title></Helmet>
      <div className="oui-min-h-screen oui-bg-base-9 oui-text-base-contrast-80">
        <div className="oui-max-w-5xl oui-mx-auto oui-px-4 oui-py-8 oui-space-y-8">

          {/* ── Hero image ── */}
          <div className="oui-rounded-2xl oui-overflow-hidden oui-relative" style={{ border: "1px solid rgba(56,224,248,0.15)" }}>
            <img
              src={withBasePath("/whitepaper-hero.webp")}
              alt="FrostDex — A Next-Generation Decentralized Exchange"
              className="oui-w-full oui-object-cover"
              style={{ maxHeight: "360px", objectPosition: "center" }}
            />
          </div>

          {/* ── Title block ── */}
          <div className="oui-text-center oui-space-y-3">
            <div className="oui-flex oui-justify-center oui-gap-2 oui-flex-wrap">
              <Badge><Snowflake size={12} /> FrostDex Whitepaper</Badge>
              <Badge>v1.0 — 2025</Badge>
            </div>
            <h1 className="oui-text-3xl md:oui-text-5xl oui-font-black oui-text-base-contrast oui-leading-tight">
              A Next-Generation<br />
              <span style={{ color: CYAN }}>Decentralized Exchange</span>
            </h1>
            <p className="oui-text-base oui-text-base-contrast-54 oui-max-w-2xl oui-mx-auto">
              Built for <span style={{ color: GREEN }} className="oui-font-semibold">fast, secure</span> and{" "}
              <span style={{ color: GREEN }} className="oui-font-semibold">limitless</span> DeFi trading with
              ultra-low fees and true financial freedom.
            </p>
            <div className="oui-flex oui-justify-center oui-pt-2">
              <Link
                to="/"
                className="oui-inline-flex oui-items-center oui-gap-2 oui-px-8 oui-py-3 oui-rounded-xl oui-font-bold oui-text-sm oui-transition-all"
                style={{
                  background: "linear-gradient(135deg, rgba(56,224,248,0.2) 0%, rgba(14,203,129,0.15) 100%)",
                  color: "rgba(56,224,248,0.95)",
                  border: "1px solid rgba(56,224,248,0.35)",
                  boxShadow: "0 0 24px rgba(56,224,248,0.12)",
                }}
              >
                <Rocket size={15} />
                Launch App
              </Link>
            </div>
          </div>

          {/* ── Feature cards ── */}
          <div className="oui-grid oui-grid-cols-2 md:oui-grid-cols-4 oui-gap-4">
            {[
              { icon: <Zap size={22} />, title: "Fast Trading", desc: "Sub-second order execution powered by FrostDex's shared orderbook", color: CYAN },
              { icon: <Shield size={22} />, title: "Secure & Trustless", desc: "Non-custodial architecture — your keys, your funds, always", color: "#a78bfa" },
              { icon: <DollarSign size={22} />, title: "Ultra-Low Fees", desc: "Maker rebates and taker fees starting from 0.02%", color: GREEN },
              { icon: <Globe size={22} />, title: "Financial Freedom", desc: "Trade permissionlessly from anywhere, any time, any asset", color: "#fb923c" },
            ].map((f) => (
              <div key={f.title} className="oui-rounded-xl oui-p-5 oui-text-center oui-space-y-3"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="oui-flex oui-justify-center">
                  <div className="oui-rounded-xl oui-p-3" style={{ background: `${f.color}15`, color: f.color }}>
                    {f.icon}
                  </div>
                </div>
                <p className="oui-text-sm oui-font-bold oui-text-base-contrast">{f.title}</p>
                <p className="oui-text-xs oui-text-base-contrast-36 oui-leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* ── Abstract ── */}
          <Section>
            <div className="oui-flex oui-items-center oui-gap-2 oui-mb-4">
              <BookOpen size={16} style={{ color: CYAN }} />
              <h2 className="oui-text-lg oui-font-bold oui-text-base-contrast">Abstract</h2>
            </div>
            <p className="oui-text-sm oui-text-base-contrast-54 oui-leading-relaxed oui-mb-3">
              FrostDex is a high-performance, non-custodial perpetuals DEX built on top of
              <span className="oui-text-base-contrast oui-font-semibold"> FrostDex</span>'s
              shared infrastructure. By leveraging a unified cross-chain orderbook, FrostDex delivers
              a centralized-exchange-grade trading experience while preserving full self-custody and
              on-chain settlement guarantees.
            </p>
            <p className="oui-text-sm oui-text-base-contrast-54 oui-leading-relaxed">
              Traders on FrostDex benefit from deep, aggregated liquidity contributed by every broker
              connected to the FrostDex network, resulting in tighter spreads and superior price discovery
              compared to isolated AMM-based venues. Positions are settled on-chain — ensuring
              transparency, censorship-resistance, and permissionless access for all users globally.
            </p>
          </Section>

          {/* ── Built on FrostDex ── */}
          <Section>
            <div className="oui-flex oui-items-center oui-gap-2 oui-mb-6">
              <Layers size={16} style={{ color: CYAN }} />
              <h2 className="oui-text-lg oui-font-bold oui-text-base-contrast">Built on FrostDex</h2>
            </div>
            <div className="oui-grid oui-grid-cols-1 md:oui-grid-cols-2 oui-gap-4 oui-mb-6">
              {[
                { title: "Shared Orderbook", desc: "Every trade is matched against the deepest unified liquidity pool across all FrostDex-connected brokers, ensuring best-in-class execution." },
                { title: "Cross-Chain Settlement", desc: "FrostDex supports Arbitrum, Optimism, Base, Blast, and more — letting traders deposit, trade, and withdraw on their preferred chain." },
                { title: "Permissioned Matching", desc: "The FrostDex matching engine operates off-chain for speed, with on-chain settlement ensuring all trades are verifiable and final." },
                { title: "Risk Engine", desc: "Built-in cross-margin risk management, liquidation engine, and insurance fund protect traders and maintain market integrity at all times." },
              ].map((item) => (
                <div key={item.title} className="oui-flex oui-gap-3">
                  <div className="oui-mt-1 oui-flex-shrink-0">
                    <ChevronRight size={14} style={{ color: CYAN }} />
                  </div>
                  <div>
                    <p className="oui-text-sm oui-font-semibold oui-text-base-contrast oui-mb-1">{item.title}</p>
                    <p className="oui-text-xs oui-text-base-contrast-36 oui-leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Supported chains */}
            <div>
              <p className="oui-text-xs oui-font-semibold oui-text-base-contrast-36 oui-uppercase oui-tracking-widest oui-mb-3">Supported Networks</p>
              <div className="oui-flex oui-flex-wrap oui-gap-2">
                {["Arbitrum", "Optimism", "Base", "Blast", "Polygon", "Mantle", "zkSync"].map((chain) => (
                  <span key={chain}
                    className="oui-text-xs oui-font-semibold oui-px-3 oui-py-1.5 oui-rounded-full"
                    style={{
                      background: chain === "Blast" ? `${GREEN}15` : "rgba(255,255,255,0.05)",
                      color: chain === "Blast" ? GREEN : "rgba(255,255,255,0.6)",
                      border: chain === "Blast" ? `1px solid ${GREEN}40` : "1px solid rgba(255,255,255,0.08)",
                    }}>
                    {chain === "Blast" ? "⚡ " : ""}{chain}
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Platform Features ── */}
          <Section>
            <div className="oui-flex oui-items-center oui-gap-2 oui-mb-6">
              <TrendingUp size={16} style={{ color: CYAN }} />
              <h2 className="oui-text-lg oui-font-bold oui-text-base-contrast">Platform Features</h2>
            </div>
            <div className="oui-grid oui-grid-cols-1 sm:oui-grid-cols-2 oui-gap-3">
              {[
                "Perpetual futures on 50+ assets",
                "Up to 100× leverage",
                "Portfolio margin with cross-collateral",
                "Advanced order types — limit, market, stop, TP/SL, trailing stop",
                "TradingView-powered professional charts",
                "One-click trading mode",
                "Affiliate & referral program (up to 20% rebate)",
                "FrostAI — AI trading assistant powered by Groq",
                "Real-time whale alert tracker",
                "Market sentiment dashboard",
                "Grid & DCA trading bots",
                "PnL sharing cards",
                "Multi-language interface",
                "Dark-mode only — optimized for traders",
              ].map((feat) => (
                <div key={feat} className="oui-flex oui-items-start oui-gap-2">
                  <span className="oui-font-bold oui-text-xs oui-mt-0.5 oui-flex-shrink-0" style={{ color: CYAN }}>✦</span>
                  <p className="oui-text-sm oui-text-base-contrast-54">{feat}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Roadmap ── */}
          <Section>
            <div className="oui-flex oui-items-center oui-gap-2 oui-mb-6">
              <Map size={16} style={{ color: CYAN }} />
              <h2 className="oui-text-lg oui-font-bold oui-text-base-contrast">Roadmap</h2>
            </div>
            <div className="oui-relative">
              <div className="oui-absolute oui-left-3 oui-top-0 oui-bottom-0 oui-w-px" style={{ background: "rgba(56,224,248,0.12)" }} />
              <div className="oui-space-y-6">
                {[
                  { quarter: "Q1 2025", title: "Platform Launch", items: ["DEX live on Arbitrum & Base", "Perpetual futures trading", "TradingView charts integration", "Wallet connect (EVM + Solana)"], done: true },
                  { quarter: "Q2 2025", title: "Advanced Features", items: ["FrostAI trading assistant", "Grid & DCA trading bots", "Whale alert tracker", "Referral program launch"], done: true },
                  { quarter: "Q3 2025", title: "FROST Token & Swap", items: ["FROST token deployed & live", "FROST available on FrostDex Swap", "Fee discounts for FROST holders", "Community distribution program"], done: true },
                  { quarter: "Q4 2025", title: "Ecosystem Expansion", items: ["Multi-language support (10+ langs)", "Vaults & yield strategies"], done: true },
                  { quarter: "2026", title: "Launchpad & DeFi Hub", items: ["Mobile app (iOS & Android)", "Staking & governance", "Token Launchpad — create & list tokens", "Cross-chain bridge integration", "Institutional API access", "DAO governance activation"], done: false },
                ].map((phase, i) => (
                  <div key={i} className="oui-flex oui-gap-5 oui-pl-8 oui-relative">
                    <div className="oui-absolute oui-left-0 oui-top-1 oui-w-6 oui-h-6 oui-rounded-full oui-flex oui-items-center oui-justify-center oui-flex-shrink-0"
                      style={{
                        background: phase.done ? `${GREEN}20` : "rgba(255,255,255,0.05)",
                        border: `2px solid ${phase.done ? GREEN : "rgba(255,255,255,0.12)"}`,
                        boxShadow: phase.done ? `0 0 10px ${GREEN}50` : "none",
                      }}>
                      {phase.done
                        ? <span style={{ color: GREEN, fontSize: "11px", fontWeight: 700 }}>✓</span>
                        : <span style={{ color: "rgba(56,224,248,0.5)", fontSize: "8px" }}>●</span>
                      }
                    </div>
                    <div className="oui-flex-1">
                      <div className="oui-flex oui-items-center oui-gap-2 oui-flex-wrap oui-mb-2">
                        <span className="oui-text-xs oui-font-bold oui-px-2 oui-py-0.5 oui-rounded"
                          style={{
                            background: phase.done ? `${GREEN}15` : `${CYAN}10`,
                            color: phase.done ? GREEN : CYAN,
                          }}>
                          {phase.quarter}
                        </span>
                        <span className="oui-text-sm oui-font-bold oui-text-base-contrast">{phase.title}</span>
                        {phase.done && (
                          <span className="oui-text-xs oui-font-semibold oui-px-2 oui-py-0.5 oui-rounded-full"
                            style={{ background: `${GREEN}15`, color: GREEN }}>Completed</span>
                        )}
                      </div>
                      <div className="oui-flex oui-flex-wrap oui-gap-1.5">
                        {phase.items.map((item) => (
                          <span key={item} className="oui-text-xs oui-px-2 oui-py-1 oui-rounded-md"
                            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.06)" }}>
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Create Your Own Token ── */}
          <div className="oui-rounded-2xl oui-overflow-hidden oui-relative oui-p-8 md:oui-p-10"
            style={{
              background: "linear-gradient(135deg, rgba(56,224,248,0.06) 0%, rgba(14,203,129,0.04) 50%, rgba(11,14,17,0) 100%)",
              border: "1px solid rgba(56,224,248,0.15)",
            }}>
            <div className="oui-absolute oui-inset-0 oui-pointer-events-none"
              style={{ background: "radial-gradient(ellipse 70% 60% at 80% 50%, rgba(56,224,248,0.05) 0%, transparent 70%)" }} />
            <div className="oui-relative oui-flex oui-items-center oui-justify-between oui-flex-wrap oui-gap-6">
              <div>
                <div className="oui-flex oui-items-center oui-gap-2 oui-mb-3">
                  <span className="oui-text-xs oui-font-bold oui-px-3 oui-py-1 oui-rounded-full oui-animate-pulse"
                    style={{ background: `${GREEN}15`, color: GREEN, border: `1px solid ${GREEN}30` }}>
                    🚀 Preview available
                  </span>
                </div>
                <h2 className="oui-text-2xl md:oui-text-3xl oui-font-black oui-text-base-contrast oui-mb-2">
                  Create Your Own Token
                </h2>
                <p className="oui-text-sm oui-text-base-contrast-54 oui-max-w-lg oui-leading-relaxed">
                  Explore the no-code launch flow for Ethereum, Solana, BNB Chain,
                  and Robinhood Chain. Live token deployment will follow after
                  each chain&apos;s contracts and liquidity migration are ready.
                </p>
              </div>
              <div className="oui-flex oui-flex-col oui-items-center oui-gap-3">
                <div className="oui-w-20 oui-h-20 oui-rounded-2xl oui-flex oui-items-center oui-justify-center"
                  style={{ background: `${CYAN}12`, border: `2px solid ${CYAN}25` }}>
                  <Snowflake size={36} style={{ color: CYAN, opacity: 0.7 }} />
                </div>
                <Link
                  to="/launch"
                  className="oui-inline-flex oui-items-center oui-gap-2 oui-px-6 oui-py-3 oui-rounded-xl oui-text-sm oui-font-bold oui-no-underline"
                  style={{ background: `${CYAN}12`, color: CYAN, border: `1px solid ${CYAN}35` }}>
                  Open launch preview <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          </div>

          {/* ── Disclaimer ── */}
          <div className="oui-text-xs oui-text-base-contrast-36 oui-text-center oui-pb-4 oui-leading-relaxed">
            This document is for informational purposes only and does not constitute financial advice or a solicitation to invest.
            FrostDex is a non-custodial protocol — users are solely responsible for their own funds and trading decisions.
          </div>

        </div>
      </div>
    </>
  );
}
