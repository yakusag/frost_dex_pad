import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { generatePageTitle } from "@/utils/utils";
import { getRuntimeConfig } from "@/utils/runtime-config";
import { Shield, Globe, Zap, Lock, BookOpen, Scale, Eye, FileText, Cookie, AlertTriangle } from "lucide-react";

type Section = "about" | "terms" | "privacy" | "risk" | "cookies" | "aml";

const sections: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: "about",   label: "About FrostDex",    icon: <Globe size={15} /> },
  { id: "terms",   label: "Terms of Service",  icon: <FileText size={15} /> },
  { id: "privacy", label: "Privacy Policy",    icon: <Eye size={15} /> },
  { id: "risk",    label: "Risk Disclosure",   icon: <AlertTriangle size={15} /> },
  { id: "cookies", label: "Cookie Policy",     icon: <Cookie size={15} /> },
  { id: "aml",     label: "AML / KYC",         icon: <Shield size={15} /> },
];

export default function AboutIndex() {
  const [active, setActive] = useState<Section>("about");
  const name = getRuntimeConfig("VITE_ORDERLY_BROKER_NAME") || "FrostDex";
  const siteUrl = getRuntimeConfig("VITE_SEO_SITE_URL") || "https://frostdex.pw";
  let hostname = "frostdex.pw";
  try { hostname = new URL(siteUrl).hostname; } catch {}

  return (
    <>
      <Helmet>
        <title>{generatePageTitle("Legal & Policies")}</title>
      </Helmet>

      <div className="oui-min-h-screen oui-bg-base-9 oui-text-base-contrast-80">
        <div className="oui-max-w-5xl oui-mx-auto oui-px-4 oui-py-8">

          {/* ── Mobile tab bar (top, full-width) ── */}
          <div className="md:oui-hidden oui-mb-6">
            <div className="oui-flex oui-overflow-x-auto oui-gap-2 oui-pb-1 oui-scrollbar-hide">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={`oui-flex-shrink-0 oui-flex oui-items-center oui-gap-1.5 oui-px-4 oui-py-2 oui-rounded-full oui-text-xs oui-font-semibold oui-border-none oui-cursor-pointer oui-transition-all ${
                    active === s.id
                      ? "oui-bg-primary oui-text-white"
                      : "oui-bg-base-7 oui-text-base-contrast-54"
                  }`}
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Desktop layout: sidebar + content ── */}
          <div className="oui-flex oui-gap-6">

            {/* Sidebar (desktop only) */}
            <aside className="oui-hidden md:oui-block oui-w-52 oui-flex-shrink-0">
              <div className="oui-sticky oui-top-24 oui-bg-base-8 oui-rounded-xl oui-p-3 oui-border oui-border-line-12">
                <p className="oui-text-xs oui-font-semibold oui-text-base-contrast-36 oui-uppercase oui-tracking-wider oui-mb-3 oui-px-2">
                  Legal
                </p>
                <nav className="oui-flex oui-flex-col oui-gap-1">
                  {sections.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setActive(s.id)}
                      className={`oui-flex oui-items-center oui-gap-2 oui-text-left oui-px-3 oui-py-2.5 oui-rounded-lg oui-text-sm oui-font-medium oui-transition-colors oui-w-full oui-border-none oui-cursor-pointer ${
                        active === s.id
                          ? "oui-bg-primary oui-text-white"
                          : "oui-text-base-contrast-54 hover:oui-bg-base-7 oui-bg-transparent hover:oui-text-base-contrast-80"
                      }`}
                    >
                      {s.icon}
                      {s.label}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Content (always visible) */}
            <main className="oui-flex-1 oui-min-w-0">
              <div className="oui-bg-base-8 oui-rounded-xl oui-border oui-border-line-12 oui-p-6 md:oui-p-8">
                {active === "about"   && <AboutContent   name={name} hostname={hostname} />}
                {active === "terms"   && <TermsContent   name={name} />}
                {active === "privacy" && <PrivacyContent name={name} />}
                {active === "risk"    && <RiskContent    name={name} />}
                {active === "cookies" && <CookiesContent name={name} />}
                {active === "aml"     && <AmlContent     name={name} />}
              </div>
            </main>
          </div>

        </div>
      </div>
    </>
  );
}

/* ─── Shared helpers ─── */

function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="oui-text-2xl oui-font-bold oui-text-base-contrast-80 oui-mb-2">{children}</h1>;
}
function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="oui-text-base oui-font-semibold oui-text-base-contrast-80 oui-mt-7 oui-mb-2.5">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="oui-text-sm oui-leading-relaxed oui-text-base-contrast-54 oui-mb-3">{children}</p>;
}
function Updated({ date }: { date: string }) {
  return <p className="oui-text-xs oui-text-base-contrast-36 oui-mb-5">Last updated: {date}</p>;
}
function Divider() {
  return <hr className="oui-border-line-12 oui-my-5" />;
}
function InfoBox({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="oui-flex oui-gap-3 oui-bg-base-7 oui-border oui-border-line-12 oui-rounded-xl oui-p-4 oui-mb-4">
      <div className="oui-text-primary oui-mt-0.5 oui-flex-shrink-0">{icon}</div>
      <div>
        <p className="oui-text-sm oui-font-semibold oui-text-base-contrast-80 oui-mb-1">{title}</p>
        <p className="oui-text-xs oui-text-base-contrast-54 oui-leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="oui-bg-yellow-500/10 oui-border oui-border-yellow-500/30 oui-rounded-xl oui-p-4 oui-mb-5">
      <p className="oui-text-sm oui-font-semibold oui-text-yellow-400 oui-mb-1">⚠ Important</p>
      <p className="oui-text-sm oui-text-base-contrast-54 oui-leading-relaxed">{children}</p>
    </div>
  );
}

/* ─── About ─── */
function AboutContent({ name, hostname }: { name: string; hostname: string }) {
  return (
    <>
      <H1>{name}</H1>
      <Updated date="June 2025" />

      <P>
        {name} is a non-custodial, permissionless decentralized exchange (DEX) built on top of
        Orderly Network — a shared liquidity infrastructure for on-chain derivatives. We believe
        in financial freedom: every trader, anywhere in the world, should have access to
        professional-grade trading tools without surrendering custody of their assets.
      </P>
      <P>
        No sign-ups. No KYC for trading. No intermediaries. Just connect your wallet and trade.
        Your keys, your funds — always.
      </P>

      <div className="oui-grid oui-grid-cols-1 md:oui-grid-cols-2 oui-gap-3 oui-my-5">
        <InfoBox icon={<Lock size={16} />} title="Non-Custodial">
          {name} never holds or controls your funds. Every deposit, withdrawal, and trade is executed
          directly by smart contracts on-chain. Only you control your assets.
        </InfoBox>
        <InfoBox icon={<Zap size={16} />} title="Deep Liquidity, Low Fees">
          Powered by Orderly Network's shared order book, {name} provides tight spreads,
          deep liquidity across multiple assets, and competitive maker/taker fees.
        </InfoBox>
        <InfoBox icon={<Globe size={16} />} title="Multi-Chain">
          Trade seamlessly across Ethereum, Arbitrum, Base, BNB Chain, Optimism, and Solana
          with unified liquidity on all supported networks.
        </InfoBox>
        <InfoBox icon={<Shield size={16} />} title="On-Chain Transparency">
          All trades are settled on-chain via audited smart contracts. Every position, every
          transaction — fully transparent and verifiable by anyone.
        </InfoBox>
        <InfoBox icon={<BookOpen size={16} />} title="Perpetual Futures">
          Trade perpetual contracts with up to 100× leverage on major crypto assets.
          No expiry dates — hold your position as long as you want.
        </InfoBox>
        <InfoBox icon={<Scale size={16} />} title="Financial Freedom">
          {name} is built for the world. Decentralized infrastructure means no single entity
          can freeze your account, block your trades, or seize your funds.
        </InfoBox>
      </div>

      <Divider />
      <H2>Powered by Orderly Network</H2>
      <P>
        {name} is a broker-layer DEX built on{" "}
        <a href="https://orderly.network" target="_blank" rel="noopener noreferrer" className="oui-text-primary">
          Orderly Network
        </a>{" "}
        — a decentralized, permissionless liquidity layer that provides professional-grade
        order-book infrastructure for on-chain perpetual futures. Orderly handles the matching
        engine, settlement, and risk management, while {name} provides the trading interface
        and user experience.
      </P>

      <Divider />
      <H2>Supported Networks</H2>
      <div className="oui-flex oui-flex-wrap oui-gap-2 oui-mb-4">
        {["Ethereum", "Arbitrum", "Base", "BNB Chain", "Optimism", "Solana"].map((c) => (
          <span key={c} className="oui-bg-primary/10 oui-text-primary oui-text-xs oui-font-semibold oui-px-3 oui-py-1.5 oui-rounded-full">
            {c}
          </span>
        ))}
      </div>

      <Divider />
      <H2>Our Mission</H2>
      <P>
        The legacy financial system is built on gatekeepers — banks, brokers, and custodians
        that collect fees, impose restrictions, and hold your money. {name} exists to dismantle
        that model. DeFi gives every person on earth equal access to financial markets,
        regardless of country, net worth, or identity. We are building the tools to make that
        future real.
      </P>

      <Divider />
      <H2>Contact</H2>
      <P>
        For support, partnerships, or legal inquiries:{" "}
        <a href={`mailto:contact@${hostname}`} className="oui-text-primary">
          contact@{hostname}
        </a>
      </P>
    </>
  );
}

/* ─── Terms ─── */
function TermsContent({ name }: { name: string }) {
  return (
    <>
      <H1>Terms of Service</H1>
      <Updated date="June 2025" />
      <P>
        These Terms of Service ("Terms") govern your access to and use of {name} and all related
        services (the "Protocol"). By connecting your wallet or using the Protocol in any way,
        you agree to be bound by these Terms. If you disagree, do not use the Protocol.
      </P>

      <H2>1. Eligibility</H2>
      <P>
        You must be at least 18 years of age and a legal resident of a jurisdiction where
        access to decentralized derivative trading is permitted. You must not be a resident of
        or located in any restricted jurisdiction including the United States, Canada, Cuba, Iran,
        North Korea, Syria, or the Crimea region, and must not be on any sanctions list.
      </P>
      <P>
        By using the Protocol, you represent and warrant that you meet all eligibility
        requirements. {name} reserves the right to restrict access based on geographic location.
      </P>

      <H2>2. Non-Custodial Nature</H2>
      <P>
        {name} is a non-custodial interface. It does not hold, control, or take custody of any
        user funds at any time. All transactions are executed via smart contracts deployed on
        public blockchains. You are solely responsible for the security of your private keys,
        seed phrases, and wallet. Loss of private keys means permanent loss of funds.
      </P>

      <H2>3. No Financial Advice</H2>
      <P>
        Nothing on {name} constitutes financial, investment, legal, tax, or trading advice.
        All information provided is for informational and educational purposes only. Trading
        decisions are made solely by you and at your own risk. Past performance is not indicative
        of future results.
      </P>

      <H2>4. Risk Acknowledgment</H2>
      <P>
        You acknowledge that trading perpetual futures involves substantial risk of loss and is
        not appropriate for all users. Leverage amplifies both gains and losses, and you can lose
        your entire invested capital. You must have read and understood the Risk Disclosure before
        using the trading features.
      </P>

      <H2>5. Prohibited Activities</H2>
      <P>You may not use the Protocol to: (a) violate any applicable laws or regulations; (b) launder money or finance terrorism or any other illegal activity; (c) manipulate markets, engage in wash trading, or create artificial volume; (d) circumvent geographic restrictions through VPNs, proxies, or other technical means; (e) exploit, attack, or reverse-engineer the Protocol in any way; (f) impersonate any other user or entity.</P>

      <H2>6. Smart Contract and Protocol Risk</H2>
      <P>
        Smart contracts may contain bugs, vulnerabilities, or be subject to exploits despite
        audits. Orderly Network infrastructure may experience outages, oracle failures, or
        unexpected behaviors. {name} is not responsible for any losses arising from smart
        contract or protocol failures.
      </P>

      <H2>7. Intellectual Property</H2>
      <P>
        The {name} interface, branding, and original content are proprietary. The underlying
        Orderly Network protocol is open-source. You may not copy, reproduce, or repurpose
        the {name} brand or interface without written permission.
      </P>

      <H2>8. Limitation of Liability</H2>
      <P>
        To the maximum extent permitted by applicable law, {name} and its contributors, officers,
        employees, and partners shall not be liable for any indirect, incidental, special,
        consequential, or exemplary damages arising from your use of the Protocol, including
        but not limited to trading losses, liquidations, smart contract exploits, or service
        interruptions.
      </P>

      <H2>9. Indemnification</H2>
      <P>
        You agree to indemnify and hold harmless {name} and its contributors from any claims,
        damages, losses, or expenses (including legal fees) arising from your use of the
        Protocol or your violation of these Terms.
      </P>

      <H2>10. Modifications</H2>
      <P>
        These Terms may be updated at any time without prior notice. Continued use of the
        Protocol after any modification constitutes your acceptance of the revised Terms.
        We encourage you to review these Terms periodically.
      </P>

      <H2>11. Governing Law & Dispute Resolution</H2>
      <P>
        These Terms shall be governed by the laws of a neutral jurisdiction, without regard to
        conflicts of law principles. Any disputes arising from these Terms or your use of the
        Protocol shall be resolved through binding arbitration on an individual basis. Class
        action lawsuits are expressly waived.
      </P>

      <H2>12. Severability</H2>
      <P>
        If any provision of these Terms is found to be invalid or unenforceable, the remaining
        provisions shall continue in full force and effect. The invalid provision shall be
        modified to the minimum extent necessary to make it enforceable.
      </P>
    </>
  );
}

/* ─── Privacy ─── */
function PrivacyContent({ name }: { name: string }) {
  return (
    <>
      <H1>Privacy Policy</H1>
      <Updated date="June 2025" />
      <P>
        {name} is committed to protecting your privacy. This policy explains how we collect,
        use, and protect information when you use the Protocol. Because {name} is a non-custodial
        DEX, we collect significantly less personal data than traditional financial platforms.
      </P>

      <H2>1. Information We Collect</H2>
      <P>
        <strong className="oui-text-base-contrast-80">Wallet addresses:</strong> When you connect your wallet, your public blockchain address is recorded. This is necessary for the Protocol to function and is publicly visible on-chain by design.
      </P>
      <P>
        <strong className="oui-text-base-contrast-80">On-chain transaction data:</strong> All trades, deposits, and withdrawals are recorded on public blockchains and are permanently visible to anyone. This data cannot be deleted.
      </P>
      <P>
        <strong className="oui-text-base-contrast-80">Usage analytics (optional):</strong> If analytics is enabled, we may collect anonymized data such as page views, device type, browser type, referral source, and session duration. This data cannot be used to identify you personally.
      </P>
      <P>
        <strong className="oui-text-base-contrast-80">Local preferences:</strong> Settings such as language, leverage configuration, widget positions, and trading preferences are stored in your browser's local storage. This data never leaves your device.
      </P>

      <H2>2. What We Do NOT Collect</H2>
      <P>
        We do not collect your name, email address, phone number, government ID, or any other
        personally identifying information. We do not require registration. We do not store
        passwords. We do not build profiles linked to real-world identities.
      </P>

      <H2>3. How We Use Information</H2>
      <P>
        Wallet addresses are used solely to display your trading activity and account status
        within the Protocol. Analytics data is used in aggregate form to improve Protocol
        performance and user experience. We do not sell, rent, or trade your data.
      </P>

      <H2>4. Third-Party Integrations</H2>
      <P>
        {name} integrates with Orderly Network (trade execution and settlement), WalletConnect
        (wallet connection infrastructure), TradingView (charting), and optionally analytics
        providers. Each third party operates under its own privacy policy. We are not responsible
        for how these third parties handle data.
      </P>

      <H2>5. Cookies and Local Storage</H2>
      <P>
        We use browser local storage to save your preferences (not cookies for tracking). If
        analytics is enabled, analytics providers may set cookies. See our Cookie Policy for
        details. You can clear your local storage at any time via your browser developer tools.
      </P>

      <H2>6. Blockchain Immutability</H2>
      <P>
        All on-chain transactions are permanent by the nature of blockchain technology. We
        cannot delete, modify, or obscure any transaction that has been broadcast to a public
        blockchain. If you request data deletion, we can only delete any off-chain data we hold —
        which is limited to anonymized analytics data.
      </P>

      <H2>7. Security Measures</H2>
      <P>
        We implement reasonable technical measures to protect any off-chain data. The Protocol
        is non-custodial, meaning we never hold your funds or private keys, which significantly
        reduces the risk of data breaches affecting your assets. However, no internet-based
        system is 100% secure.
      </P>

      <H2>8. Children's Privacy</H2>
      <P>
        The Protocol is not intended for users under 18 years of age. We do not knowingly
        collect information from minors. If you believe a minor has used the Protocol, please
        contact us.
      </P>

      <H2>9. Your Rights</H2>
      <P>
        You may request deletion of any off-chain analytics data we hold. You may opt out of
        analytics at any time. On-chain data is immutable and cannot be changed or removed
        by anyone. Contact us at our support address for any privacy-related requests.
      </P>

      <H2>10. Changes to This Policy</H2>
      <P>
        We may update this Privacy Policy from time to time. We encourage you to review it
        periodically. Continued use of the Protocol after changes constitutes acceptance.
      </P>
    </>
  );
}

/* ─── Risk ─── */
function RiskContent({ name }: { name: string }) {
  return (
    <>
      <H1>Risk Disclosure</H1>
      <Updated date="June 2025" />

      <WarningBox>
        Trading perpetual futures contracts involves a very high degree of risk and may not be
        suitable for all participants. You can lose all of your invested capital and more.
        Only trade with funds you can afford to lose entirely. This disclosure does not cover
        all possible risks.
      </WarningBox>

      <H2>1. Leverage and Liquidation Risk</H2>
      <P>
        {name} offers leveraged perpetual futures trading. Leverage multiplies both potential
        gains and losses. With 10× leverage, a 10% adverse price move eliminates your entire
        margin. If your margin balance falls below the maintenance margin threshold, your
        position will be automatically liquidated by the protocol. Liquidation may occur at
        prices less favorable than displayed due to market conditions. You may lose 100% of
        your margin with no recourse.
      </P>

      <H2>2. Market Volatility</H2>
      <P>
        Cryptocurrency markets operate 24/7 and are highly volatile. Prices can move 10–50%
        in a single day. Market events, news, regulatory announcements, large whale activity,
        and technical failures can cause sudden and severe price movements. There is no circuit
        breaker or trading halt in decentralized markets.
      </P>

      <H2>3. Funding Rate Risk</H2>
      <P>
        Perpetual futures contracts charge periodic funding rates to keep contract prices
        anchored to spot prices. Depending on market conditions, you may pay or receive funding.
        In extreme market conditions, funding rates can be very high and erode your position
        value significantly over time even if price moves in your favor.
      </P>

      <H2>4. Slippage and Execution Risk</H2>
      <P>
        Large orders may experience slippage — your trade executes at a worse price than
        displayed due to insufficient liquidity at your target price. During high volatility
        periods, market orders may fill at significantly different prices. Limit orders do not
        guarantee execution.
      </P>

      <H2>5. Smart Contract Risk</H2>
      <P>
        The Protocol relies on smart contracts, which are immutable computer programs. Despite
        audits by reputable security firms, smart contracts may contain undiscovered bugs or
        vulnerabilities that could be exploited. An exploit could result in partial or total
        loss of funds held in the Protocol. Audits are not guarantees of security.
      </P>

      <H2>6. Oracle Risk</H2>
      <P>
        Perpetual futures prices are determined by oracle price feeds. If an oracle is
        manipulated, experiences downtime, or reports incorrect prices, trades may execute at
        wrong prices and liquidations may be triggered incorrectly. Oracle failure is a known
        risk in all DeFi derivatives protocols.
      </P>

      <H2>7. Counterparty and Protocol Risk</H2>
      <P>
        {name} relies on Orderly Network for trade matching and settlement. Issues with
        Orderly Network — including technical failures, regulatory actions, or insolvency —
        could adversely affect your positions and your ability to access funds. {name} is not
        responsible for Orderly Network's operations.
      </P>

      <H2>8. Regulatory Risk</H2>
      <P>
        The regulatory environment for DeFi is rapidly changing. Future laws or regulations
        may restrict, prohibit, or impose requirements on your use of decentralized exchanges.
        This could affect your ability to access the Protocol or your funds. You are responsible
        for understanding and complying with the laws applicable in your jurisdiction.
      </P>

      <H2>9. Technology and Security Risk</H2>
      <P>
        You are solely responsible for securing your wallet, private keys, and seed phrase.
        Never share these with anyone. Phishing websites, browser extensions, and social
        engineering attacks are common in crypto. Always verify you are on the correct URL.
        {name} will never ask for your private key or seed phrase.
      </P>

      <H2>10. Network and Gas Risk</H2>
      <P>
        Blockchain network congestion can cause transactions to fail, be delayed, or require
        high gas fees. During network outages, you may be unable to manage or close positions.
        Gas fee spikes can make small position adjustments economically impractical.
      </P>

      <H2>11. Past Performance</H2>
      <P>
        Past trading performance, historical returns, backtested results, or any performance
        data shown on {name} does not guarantee future results. Markets change continuously.
        Strategies that worked historically may fail in current conditions.
      </P>
    </>
  );
}

/* ─── Cookies ─── */
function CookiesContent({ name }: { name: string }) {
  return (
    <>
      <H1>Cookie Policy</H1>
      <Updated date="June 2025" />
      <P>
        This Cookie Policy explains how {name} uses cookies and similar technologies when
        you use the Protocol. We aim to use only what is strictly necessary to provide a
        good user experience.
      </P>

      <H2>1. What Are Cookies?</H2>
      <P>
        Cookies are small text files stored on your device by your browser when you visit a
        website. We also use browser local storage — a similar technology that stores data
        locally on your device without expiry unless manually cleared.
      </P>

      <H2>2. Types of Storage We Use</H2>
      <div className="oui-overflow-x-auto oui-mb-5">
        <table className="oui-w-full oui-text-sm oui-border-collapse">
          <thead>
            <tr className="oui-border-b oui-border-line-12">
              {["Type", "Purpose", "Storage", "Duration"].map(h => (
                <th key={h} className="oui-text-left oui-py-2 oui-pr-4 oui-text-base-contrast-54 oui-font-semibold oui-text-xs">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Essential", "Protocol functionality (language, settings)", "localStorage", "Persistent"],
              ["Preferences", "Widget positions, leverage, last symbol", "localStorage", "Persistent"],
              ["Analytics", "Anonymized page views & performance data", "Cookie", "Up to 24 months"],
              ["Third-party", "WalletConnect, TradingView functionality", "Cookie / localStorage", "Varies"],
            ].map(([type, purpose, storage, duration]) => (
              <tr key={type} className="oui-border-b oui-border-line-12/40">
                <td className="oui-py-2.5 oui-pr-4 oui-text-base-contrast-80 oui-font-medium oui-text-xs">{type}</td>
                <td className="oui-py-2.5 oui-pr-4 oui-text-base-contrast-54 oui-text-xs">{purpose}</td>
                <td className="oui-py-2.5 oui-pr-4 oui-text-base-contrast-36 oui-text-xs oui-whitespace-nowrap">{storage}</td>
                <td className="oui-py-2.5 oui-text-base-contrast-36 oui-text-xs oui-whitespace-nowrap">{duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>3. Essential Storage (Cannot Be Disabled)</H2>
      <P>
        We use browser local storage to remember your preferences such as selected language,
        UI theme, widget positions, leverage settings, and last-viewed trading pair. Without
        this storage, the Protocol cannot remember your preferences between sessions. This
        storage is strictly necessary for the Protocol to function and cannot be disabled.
      </P>

      <H2>4. Analytics Cookies (Optional)</H2>
      <P>
        If analytics is enabled for {name}, anonymized usage data is collected to help improve
        the Protocol. This includes pages visited, time spent, device type, and general
        geographic region (country-level only). Analytics data cannot identify you personally
        and is never linked to your wallet address.
      </P>

      <H2>5. Third-Party Cookies</H2>
      <P>
        Integrated services such as TradingView (charting library) and WalletConnect (wallet
        connection) may set their own cookies or use local storage as part of their operation.
        {name} has no control over these third-party technologies. Please refer to TradingView's
        and WalletConnect's respective privacy and cookie policies for details.
      </P>

      <H2>6. Managing Cookies</H2>
      <P>
        You can control and delete cookies through your browser settings. You can clear
        localStorage through your browser's developer tools (DevTools → Application → Local
        Storage). Note that clearing essential storage will reset all your preferences and
        you will need to reconfigure settings on your next visit.
      </P>

      <H2>7. Cookie Updates</H2>
      <P>
        This Cookie Policy may be updated as the Protocol evolves and new features are added.
        We will note the date of last update at the top of this page. Continued use of the
        Protocol after changes constitutes acceptance of the updated policy.
      </P>
    </>
  );
}

/* ─── AML ─── */
function AmlContent({ name }: { name: string }) {
  return (
    <>
      <H1>AML / KYC Policy</H1>
      <Updated date="June 2025" />
      <P>
        {name} is committed to operating ethically and in compliance with applicable laws
        regarding anti-money laundering (AML), counter-terrorism financing (CTF), and
        international sanctions. This policy describes our approach given {name}'s nature as
        a non-custodial, decentralized exchange.
      </P>

      <H2>1. Non-Custodial Architecture</H2>
      <P>
        Because {name} is a non-custodial DEX, we do not hold user funds, process fiat
        currency, or act as a money transmitter. We do not collect identity documents or
        perform traditional Know Your Customer (KYC) verification. Compliance is enforced at
        the smart contract and protocol level by Orderly Network and the underlying blockchains.
      </P>

      <H2>2. On-Chain Screening</H2>
      <P>
        The Orderly Network infrastructure performs automated on-chain screening of wallet
        addresses against OFAC and other international sanctions lists. Wallets identified as
        sanctioned may be automatically blocked from accessing the Protocol at the smart
        contract level. This screening is conducted by Orderly Network, not {name} directly.
      </P>

      <H2>3. Prohibited Uses</H2>
      <P>You must not use {name} to:</P>
      <ul className="oui-list-none oui-space-y-2 oui-mb-4">
        {[
          "Launder the proceeds of criminal, fraudulent, or otherwise illegal activity",
          "Finance terrorism, arms trafficking, or any other illegal activities",
          "Circumvent international sanctions or trade restrictions",
          "Engage in market manipulation, wash trading, or pump-and-dump schemes",
          "Conduct transactions on behalf of sanctioned persons or entities",
          "Violate any applicable tax reporting requirements",
        ].map((item, i) => (
          <li key={i} className="oui-flex oui-items-start oui-gap-2 oui-text-sm oui-text-base-contrast-54">
            <span className="oui-text-primary oui-font-bold oui-mt-0.5 oui-flex-shrink-0">—</span>
            {item}
          </li>
        ))}
      </ul>

      <H2>4. Blockchain Transparency</H2>
      <P>
        All transactions on {name} are permanently recorded on public blockchains and are
        fully traceable by law enforcement agencies, blockchain analytics companies, and the
        general public. The pseudonymous nature of blockchain addresses does not provide
        true anonymity. Sophisticated blockchain analytics can often link wallet addresses
        to real-world identities.
      </P>

      <H2>5. Cooperation with Authorities</H2>
      <P>
        To the extent technically feasible and legally required, {name} will cooperate with
        law enforcement and regulatory authorities. While our non-custodial architecture
        limits the data we hold, we will provide any available information in response to
        valid legal process. We may be required to block certain addresses or restrict access
        upon receipt of government orders.
      </P>

      <H2>6. User Responsibility</H2>
      <P>
        Each user is solely responsible for ensuring their use of {name} complies with all
        applicable laws in their jurisdiction, including AML laws, tax reporting obligations,
        and any licensing requirements. Ignorance of applicable laws is not a defense.
      </P>

      <H2>7. Reporting Suspicious Activity</H2>
      <P>
        If you become aware of any suspicious activity, potential money laundering, or
        terrorist financing involving the Protocol, please report it to us immediately through
        our official contact channels. We take all reports seriously and will investigate
        appropriately.
      </P>
    </>
  );
}
