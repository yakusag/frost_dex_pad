import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  Copy,
  Check,
  Users,
  DollarSign,
  TrendingUp,
  Gift,
  ArrowRight,
  Zap,
  Link2,
  ExternalLink,
} from "lucide-react";
import {
  ReferralProvider,
  useReferralContext,
} from "@orderly.network/affiliate";
import { useReferralInfo } from "@orderly.network/hooks";
import { useAccount } from "@orderly.network/hooks";
import { AccountStatusEnum } from "@orderly.network/types";
import { getRuntimeConfig } from "@/utils/runtime-config";
import { generatePageTitle } from "@/utils/utils";

function ReferralDashboardInner() {
  const { state } = useAccount();
  const { data, isLoading, getFirstRefCode } = useReferralInfo();
  const { generateCode } = useReferralContext();

  const [copied, setCopied] = useState(false);

  const brokerName = getRuntimeConfig("VITE_ORDERLY_BROKER_NAME") || "FrostDex";
  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://frostdex.pw";

  const isConnected = state?.status >= AccountStatusEnum.Connected;
  const referrer = data?.referrer_info;
  const firstCode = getFirstRefCode?.();
  const referralLink = firstCode ? `${siteUrl}/?ref=${firstCode.code}` : null;

  const totalCommissions = referrer?.total_referrer_rebate ?? 0;
  const totalInvites = referrer?.total_invites ?? 0;
  const totalTraded = referrer?.total_traded ?? 0;
  const codes = referrer?.referral_codes ?? [];
  const commissionRate = firstCode
    ? Math.round((firstCode.referrer_rebate_rate ?? 0) * 100)
    : 20;
  const rebateRate = firstCode
    ? Math.round((firstCode.referee_rebate_rate ?? 0) * 100)
    : 10;

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="oui-min-h-screen oui-bg-base-9 oui-text-base-contrast-80">
      <div className="oui-max-w-5xl oui-mx-auto oui-px-4 oui-py-8 oui-space-y-8">
        {/* ── Hero banner ── */}
        <div
          className="oui-rounded-2xl oui-overflow-hidden oui-relative"
          style={{
            background:
              "linear-gradient(135deg, rgba(56,224,248,0.08) 0%, rgba(56,224,248,0.03) 50%, rgba(11,14,17,0.9) 100%)",
            border: "1px solid rgba(56,224,248,0.15)",
          }}
        >
          <div
            className="oui-absolute oui-inset-0 oui-pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 60% 80% at 80% 50%, rgba(56,224,248,0.06) 0%, transparent 70%)",
            }}
          />
          <div className="oui-relative oui-p-6 md:oui-p-10">
            <div className="oui-flex oui-items-center oui-gap-2 oui-mb-3">
              <Gift size={18} className="oui-text-primary" />
              <span className="oui-text-xs oui-font-semibold oui-uppercase oui-tracking-widest oui-text-primary">
                Referral Program
              </span>
            </div>
            <h1 className="oui-text-2xl md:oui-text-4xl oui-font-bold oui-text-base-contrast oui-mb-2">
              Invite Friends,{" "}
              <span style={{ color: "rgba(56,224,248,0.9)" }}>
                Earn Rewards
              </span>
            </h1>
            <p className="oui-text-sm oui-text-base-contrast-54 oui-mb-6 oui-max-w-xl">
              Share your referral link and earn up to{" "}
              <span className="oui-text-primary oui-font-semibold">
                {commissionRate}%
              </span>{" "}
              commission on your friends' trading fees. Your friends also get{" "}
              <span className="oui-text-primary oui-font-semibold">
                {rebateRate}%
              </span>{" "}
              fee rebate.
            </p>

            {/* referral link box */}
            {!isConnected ? (
              <div
                className="oui-inline-flex oui-items-center oui-gap-3 oui-px-5 oui-py-3 oui-rounded-xl oui-text-sm oui-text-base-contrast-54"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <Link2 size={15} />
                Connect wallet to get your referral link
              </div>
            ) : isLoading ? (
              <div
                className="oui-inline-flex oui-items-center oui-gap-3 oui-px-5 oui-py-3 oui-rounded-xl oui-text-sm oui-text-base-contrast-54 oui-animate-pulse"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                Loading referral link…
              </div>
            ) : referralLink ? (
              <div className="oui-flex oui-items-center oui-gap-2 oui-flex-wrap">
                <div
                  className="oui-flex oui-items-center oui-gap-3 oui-px-4 oui-py-3 oui-rounded-xl oui-text-sm oui-font-mono oui-text-base-contrast"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(56,224,248,0.2)",
                    maxWidth: "420px",
                  }}
                >
                  <Link2
                    size={14}
                    className="oui-text-primary oui-flex-shrink-0"
                  />
                  <span className="oui-truncate">{referralLink}</span>
                </div>
                <button
                  onClick={handleCopy}
                  className="oui-flex oui-items-center oui-gap-2 oui-px-4 oui-py-3 oui-rounded-xl oui-text-sm oui-font-semibold oui-transition-all"
                  style={{
                    background: copied
                      ? "rgba(56,224,248,0.15)"
                      : "rgba(56,224,248,0.1)",
                    border: "1px solid rgba(56,224,248,0.3)",
                    color: "rgba(56,224,248,0.9)",
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied!" : "Copy Link"}
                </button>
              </div>
            ) : (
              <p className="oui-text-sm oui-text-base-contrast-36">
                No referral code yet. You may need more trading volume to
                qualify.
              </p>
            )}
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="oui-grid oui-grid-cols-1 sm:oui-grid-cols-3 oui-gap-4">
          {[
            {
              icon: <DollarSign size={18} />,
              label: "Total Commissions",
              value:
                isConnected && !isLoading
                  ? `$${totalCommissions.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—",
              sub: "USDC earned",
              color: "rgba(56,224,248,0.9)",
            },
            {
              icon: <Users size={18} />,
              label: "Total Referrals",
              value:
                isConnected && !isLoading ? totalInvites.toLocaleString() : "—",
              sub: "friends invited",
              color: "#a78bfa",
            },
            {
              icon: <TrendingUp size={18} />,
              label: "Active Traders",
              value:
                isConnected && !isLoading ? totalTraded.toLocaleString() : "—",
              sub: "actively trading",
              color: "#34d399",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="oui-rounded-xl oui-p-5 oui-flex oui-items-start oui-gap-4"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                className="oui-rounded-lg oui-p-2 oui-flex-shrink-0"
                style={{ background: `${s.color}18`, color: s.color }}
              >
                {s.icon}
              </div>
              <div>
                <p className="oui-text-xs oui-text-base-contrast-36 oui-mb-1">
                  {s.label}
                </p>
                <p
                  className="oui-text-2xl oui-font-bold oui-text-base-contrast"
                  style={{ color: s.color }}
                >
                  {s.value}
                </p>
                <p className="oui-text-xs oui-text-base-contrast-36 oui-mt-0.5">
                  {s.sub}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Referral codes table ── */}
        {isConnected && !isLoading && codes.length > 0 && (
          <div
            className="oui-rounded-xl oui-overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="oui-px-5 oui-py-4"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
            >
              <h2 className="oui-text-sm oui-font-semibold oui-text-base-contrast">
                Your Referral Codes
              </h2>
            </div>
            <div className="oui-overflow-x-auto">
              <table className="oui-w-full oui-text-sm">
                <thead>
                  <tr
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    {[
                      "Code",
                      "Your Commission",
                      "Friend's Rebate",
                      "Invites",
                      "Active Traders",
                      "Total Volume",
                      "Total Rebate",
                    ].map((h) => (
                      <th
                        key={h}
                        className="oui-px-5 oui-py-3 oui-text-left oui-text-xs oui-font-semibold oui-text-base-contrast-36 oui-whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code) => (
                    <tr
                      key={code.code}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <td className="oui-px-5 oui-py-3">
                        <div className="oui-flex oui-items-center oui-gap-2">
                          <span
                            className="oui-font-mono oui-font-bold oui-text-xs oui-px-2 oui-py-1 oui-rounded"
                            style={{
                              background: "rgba(56,224,248,0.1)",
                              color: "rgba(56,224,248,0.9)",
                            }}
                          >
                            {code.code}
                          </span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                `${siteUrl}/?ref=${code.code}`,
                              );
                            }}
                            className="oui-text-base-contrast-36 hover:oui-text-primary oui-transition-colors"
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="oui-px-5 oui-py-3 oui-text-base-contrast">
                        {Math.round((code.referrer_rebate_rate ?? 0) * 100)}%
                      </td>
                      <td className="oui-px-5 oui-py-3 oui-text-base-contrast">
                        {Math.round((code.referee_rebate_rate ?? 0) * 100)}%
                      </td>
                      <td className="oui-px-5 oui-py-3 oui-text-base-contrast">
                        {code.total_invites.toLocaleString()}
                      </td>
                      <td className="oui-px-5 oui-py-3 oui-text-base-contrast">
                        {code.total_traded.toLocaleString()}
                      </td>
                      <td className="oui-px-5 oui-py-3 oui-text-base-contrast">
                        $
                        {(code.total_volume ?? 0).toLocaleString("en-US", {
                          maximumFractionDigits: 0,
                        })}
                      </td>
                      <td
                        className="oui-px-5 oui-py-3"
                        style={{ color: "rgba(56,224,248,0.9)" }}
                      >
                        $
                        {(code.total_rebate ?? 0).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── How it works ── */}
        <div>
          <h2 className="oui-text-base oui-font-semibold oui-text-base-contrast oui-mb-4">
            How It Works
          </h2>
          <div className="oui-grid oui-grid-cols-1 sm:oui-grid-cols-3 oui-gap-4">
            {[
              {
                step: "01",
                icon: <Link2 size={20} />,
                title: "Get Your Link",
                desc: "Connect your wallet and copy your unique referral link from above.",
                color: "rgba(56,224,248,0.9)",
              },
              {
                step: "02",
                icon: <Users size={20} />,
                title: "Invite Friends",
                desc: "Share your link on social media, Telegram, or Discord. Friends sign up and start trading.",
                color: "#a78bfa",
              },
              {
                step: "03",
                icon: <DollarSign size={20} />,
                title: "Earn Commissions",
                desc: `Earn ${commissionRate}% of your friends' trading fees in USDC — paid out automatically on-chain.`,
                color: "#34d399",
              },
            ].map((s) => (
              <div
                key={s.step}
                className="oui-rounded-xl oui-p-5 oui-relative oui-overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div
                  className="oui-absolute oui-top-3 oui-right-4 oui-text-4xl oui-font-black oui-opacity-5 oui-select-none"
                  style={{ color: s.color }}
                >
                  {s.step}
                </div>
                <div
                  className="oui-rounded-lg oui-p-2 oui-inline-flex oui-mb-3"
                  style={{ background: `${s.color}15`, color: s.color }}
                >
                  {s.icon}
                </div>
                <h3 className="oui-text-sm oui-font-semibold oui-text-base-contrast oui-mb-1">
                  {s.title}
                </h3>
                <p className="oui-text-xs oui-text-base-contrast-54 oui-leading-relaxed">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── CTA to full affiliate dashboard ── */}
        <div
          className="oui-rounded-xl oui-p-5 oui-flex oui-items-center oui-justify-between oui-gap-4 oui-flex-wrap"
          style={{
            background: "rgba(56,224,248,0.05)",
            border: "1px solid rgba(56,224,248,0.12)",
          }}
        >
          <div>
            <p className="oui-text-sm oui-font-semibold oui-text-base-contrast oui-mb-0.5">
              Want advanced analytics?
            </p>
            <p className="oui-text-xs oui-text-base-contrast-54">
              View detailed charts, daily volume breakdowns, and manage multiple
              referral codes in the full Affiliate Dashboard.
            </p>
          </div>
          <Link
            to="/rewards/affiliate"
            className="oui-flex oui-items-center oui-gap-2 oui-px-4 oui-py-2.5 oui-rounded-lg oui-text-sm oui-font-semibold oui-whitespace-nowrap oui-transition-all"
            style={{
              background: "rgba(56,224,248,0.1)",
              border: "1px solid rgba(56,224,248,0.25)",
              color: "rgba(56,224,248,0.9)",
            }}
          >
            Affiliate Dashboard
            <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ReferralIndex() {
  const brokerName = getRuntimeConfig("VITE_ORDERLY_BROKER_NAME") || "FrostDex";
  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://frostdex.pw";

  return (
    <>
      <Helmet>
        <title>{generatePageTitle("Refer & Earn")}</title>
      </Helmet>
      <ReferralProvider
        referralLinkUrl={siteUrl}
        becomeAnAffiliateUrl={`${siteUrl}/rewards/affiliate`}
        learnAffiliateUrl={`${siteUrl}/rewards/affiliate`}
        overwrite={{ shortBrokerName: brokerName, brokerName }}
      >
        <ReferralDashboardInner />
      </ReferralProvider>
    </>
  );
}
