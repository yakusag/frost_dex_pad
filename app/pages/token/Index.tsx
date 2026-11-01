import { useState, useEffect, useRef, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { generatePageTitle } from "@/utils/utils";
import { Search, TrendingUp, TrendingDown, Star, ExternalLink, X } from "lucide-react";

/* ─── Types ─── */
interface CoinResult {
  id: string;
  name: string;
  symbol: string;
  thumb: string;
  market_cap_rank: number | null;
}

interface CoinDetail {
  id: string;
  name: string;
  symbol: string;
  image: { large: string };
  market_cap_rank: number | null;
  market_data: {
    current_price: { usd: number };
    market_cap: { usd: number };
    total_volume: { usd: number };
    price_change_percentage_24h: number;
    price_change_percentage_7d: number;
    price_change_percentage_30d: number;
    high_24h: { usd: number };
    low_24h: { usd: number };
    circulating_supply: number;
    total_supply: number | null;
    ath: { usd: number };
    atl: { usd: number };
  };
  description: { en: string };
  links: {
    homepage: string[];
    twitter_screen_name: string;
    telegram_channel_identifier: string;
    repos_url: { github: string[] };
  };
}

interface TrendingCoin {
  item: {
    id: string;
    name: string;
    symbol: string;
    thumb: string;
    market_cap_rank: number;
    data: { price_change_percentage_24h: { usd: number } };
  };
}

/* ─── Formatters ─── */
const fmt = (n: number, compact = false) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: compact ? "compact" : "standard",
        maximumFractionDigits: n < 1 ? 6 : n < 100 ? 4 : 2,
      }).format(n);

const fmtCompact = (n: number) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(n);

const pct = (n: number) => {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
};

/* ─── Pct badge ─── */
function PctBadge({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span
      className={`oui-inline-flex oui-items-center oui-gap-1 oui-text-sm oui-font-semibold ${
        up ? "oui-text-green-400" : "oui-text-red-400"
      }`}
    >
      {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {pct(value)}
    </span>
  );
}

/* ─── Stat card ─── */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="oui-bg-base-7 oui-rounded-xl oui-p-4 oui-border oui-border-line-12">
      <p className="oui-text-xs oui-text-base-contrast-36 oui-mb-1">{label}</p>
      <p className="oui-text-sm oui-font-semibold oui-text-base-contrast-80 oui-break-all">{value}</p>
    </div>
  );
}

/* ─── Main ─── */
export default function TokenIndex() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CoinResult[]>([]);
  const [detail, setDetail] = useState<CoinDetail | null>(null);
  const [trending, setTrending] = useState<TrendingCoin[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* fetch trending on mount */
  useEffect(() => {
    fetch("https://api.coingecko.com/api/v3/search/trending")
      .then(r => r.json())
      .then(d => setTrending((d.coins || []).slice(0, 8)))
      .catch(() => {});
  }, []);

  /* search */
  const search = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); setShowDropdown(false); return; }
    setLoading(true);
    fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => {
        setResults((d.coins || []).slice(0, 8));
        setShowDropdown(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(v), 350);
  };

  /* load coin detail */
  const loadDetail = (id: string) => {
    setShowDropdown(false);
    setDetailLoading(true);
    setDetail(null);
    fetch(
      `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&community_data=false&developer_data=false`
    )
      .then(r => r.json())
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  };

  const clearSearch = () => {
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    setDetail(null);
    inputRef.current?.focus();
  };

  return (
    <>
      <Helmet>
        <title>{generatePageTitle("Token Search")}</title>
      </Helmet>

      <div className="oui-min-h-screen oui-bg-base-9 oui-text-base-contrast-80">
        <div className="oui-max-w-3xl oui-mx-auto oui-px-4 oui-py-10">

          {/* Header */}
          <div className="oui-mb-8 oui-text-center">
            <h1 className="oui-text-2xl oui-font-bold oui-text-base-contrast-80 oui-mb-2">
              Token Search
            </h1>
            <p className="oui-text-sm oui-text-base-contrast-36">
              Search any cryptocurrency for live price and market data
            </p>
          </div>

          {/* Search box */}
          <div className="oui-relative oui-mb-8">
            <div className="oui-flex oui-items-center oui-gap-3 oui-bg-base-8 oui-border oui-border-line-12 oui-rounded-xl oui-px-4 oui-py-3 focus-within:oui-border-primary oui-transition-colors">
              <Search size={18} className="oui-text-base-contrast-36 oui-flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInput}
                placeholder="Search Bitcoin, ETH, SOL..."
                className="oui-flex-1 oui-bg-transparent oui-border-none oui-outline-none oui-text-base-contrast-80 oui-text-sm placeholder:oui-text-base-contrast-36"
                onFocus={() => results.length > 0 && setShowDropdown(true)}
              />
              {loading && (
                <div className="oui-w-4 oui-h-4 oui-border-2 oui-border-primary/30 oui-border-t-primary oui-rounded-full oui-animate-spin oui-flex-shrink-0" />
              )}
              {query && (
                <button
                  onClick={clearSearch}
                  className="oui-text-base-contrast-36 hover:oui-text-base-contrast-80 oui-bg-transparent oui-border-none oui-cursor-pointer oui-p-0"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Dropdown */}
            {showDropdown && results.length > 0 && (
              <div className="oui-absolute oui-z-50 oui-top-full oui-left-0 oui-right-0 oui-mt-1 oui-bg-base-8 oui-border oui-border-line-12 oui-rounded-xl oui-overflow-hidden oui-shadow-2xl">
                {results.map(coin => (
                  <button
                    key={coin.id}
                    onClick={() => { loadDetail(coin.id); setQuery(coin.name); }}
                    className="oui-flex oui-items-center oui-gap-3 oui-w-full oui-px-4 oui-py-3 hover:oui-bg-base-7 oui-bg-transparent oui-border-none oui-cursor-pointer oui-text-left oui-transition-colors oui-border-b oui-border-line-12/50 last:oui-border-0"
                  >
                    {coin.thumb ? (
                      <img src={coin.thumb} alt={coin.name} className="oui-w-7 oui-h-7 oui-rounded-full oui-flex-shrink-0" />
                    ) : (
                      <div className="oui-w-7 oui-h-7 oui-rounded-full oui-bg-base-6 oui-flex-shrink-0" />
                    )}
                    <div className="oui-flex-1 oui-min-w-0">
                      <span className="oui-text-sm oui-font-semibold oui-text-base-contrast-80">{coin.name}</span>
                      <span className="oui-text-xs oui-text-base-contrast-36 oui-ml-2 oui-uppercase">{coin.symbol}</span>
                    </div>
                    {coin.market_cap_rank && (
                      <span className="oui-text-xs oui-text-base-contrast-36 oui-flex-shrink-0">#{coin.market_cap_rank}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail view */}
          {detailLoading && (
            <div className="oui-flex oui-justify-center oui-py-16">
              <div className="oui-w-8 oui-h-8 oui-border-2 oui-border-primary/30 oui-border-t-primary oui-rounded-full oui-animate-spin" />
            </div>
          )}

          {detail && !detailLoading && <CoinDetail coin={detail} />}

          {/* Trending (when no detail) */}
          {!detail && !detailLoading && trending.length > 0 && (
            <div>
              <div className="oui-flex oui-items-center oui-gap-2 oui-mb-4">
                <Star size={16} className="oui-text-yellow-400" />
                <h2 className="oui-text-sm oui-font-semibold oui-text-base-contrast-54">Trending</h2>
              </div>
              <div className="oui-grid oui-grid-cols-2 md:oui-grid-cols-4 oui-gap-3">
                {trending.map(({ item }) => (
                  <button
                    key={item.id}
                    onClick={() => { loadDetail(item.id); setQuery(item.name); }}
                    className="oui-flex oui-items-center oui-gap-3 oui-bg-base-8 oui-border oui-border-line-12 oui-rounded-xl oui-p-3 hover:oui-border-primary/50 hover:oui-bg-base-7 oui-cursor-pointer oui-text-left oui-transition-colors oui-w-full"
                  >
                    {item.thumb ? (
                      <img src={item.thumb} alt={item.name} className="oui-w-8 oui-h-8 oui-rounded-full oui-flex-shrink-0" />
                    ) : (
                      <div className="oui-w-8 oui-h-8 oui-rounded-full oui-bg-base-6 oui-flex-shrink-0" />
                    )}
                    <div className="oui-min-w-0">
                      <p className="oui-text-xs oui-font-semibold oui-text-base-contrast-80 oui-truncate">{item.symbol}</p>
                      {item.data?.price_change_percentage_24h?.usd != null && (
                        <p className={`oui-text-xs ${item.data.price_change_percentage_24h.usd >= 0 ? "oui-text-green-400" : "oui-text-red-400"}`}>
                          {pct(item.data.price_change_percentage_24h.usd)}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Coin Detail Component ─── */
function CoinDetail({ coin }: { coin: CoinDetail }) {
  const md = coin.market_data;
  const price = md.current_price.usd;
  const change24h = md.price_change_percentage_24h;
  const change7d = md.price_change_percentage_7d;
  const change30d = md.price_change_percentage_30d;

  const links = [
    coin.links.homepage?.[0] && { label: "Website", href: coin.links.homepage[0] },
    coin.links.twitter_screen_name && { label: "Twitter", href: `https://twitter.com/${coin.links.twitter_screen_name}` },
    coin.links.telegram_channel_identifier && { label: "Telegram", href: `https://t.me/${coin.links.telegram_channel_identifier}` },
    coin.links.repos_url?.github?.[0] && { label: "GitHub", href: coin.links.repos_url.github[0] },
  ].filter(Boolean) as { label: string; href: string }[];

  const desc = coin.description?.en?.replace(/<[^>]*>/g, "").split(". ").slice(0, 3).join(". ") + ".";

  return (
    <div className="oui-space-y-4">
      {/* Header */}
      <div className="oui-bg-base-8 oui-border oui-border-line-12 oui-rounded-xl oui-p-6">
        <div className="oui-flex oui-items-center oui-gap-4 oui-mb-4">
          <img src={coin.image.large} alt={coin.name} className="oui-w-14 oui-h-14 oui-rounded-full" />
          <div className="oui-flex-1">
            <div className="oui-flex oui-items-center oui-gap-2 oui-flex-wrap">
              <h2 className="oui-text-xl oui-font-bold oui-text-base-contrast-80">{coin.name}</h2>
              <span className="oui-text-xs oui-bg-base-6 oui-text-base-contrast-36 oui-px-2 oui-py-0.5 oui-rounded-md oui-uppercase oui-font-semibold">
                {coin.symbol}
              </span>
              {coin.market_cap_rank && (
                <span className="oui-text-xs oui-bg-primary/10 oui-text-primary oui-px-2 oui-py-0.5 oui-rounded-md oui-font-semibold">
                  #{coin.market_cap_rank}
                </span>
              )}
            </div>
            <div className="oui-flex oui-items-baseline oui-gap-3 oui-mt-1 oui-flex-wrap">
              <span className="oui-text-2xl oui-font-bold oui-text-base-contrast-80">{fmt(price)}</span>
              <PctBadge value={change24h} />
            </div>
          </div>
        </div>

        {/* 24h range */}
        <div className="oui-mb-4">
          <div className="oui-flex oui-justify-between oui-text-xs oui-text-base-contrast-36 oui-mb-1">
            <span>24h Low: {fmt(md.low_24h.usd)}</span>
            <span>24h High: {fmt(md.high_24h.usd)}</span>
          </div>
          <div className="oui-relative oui-h-1.5 oui-bg-base-6 oui-rounded-full oui-overflow-hidden">
            {md.high_24h.usd > md.low_24h.usd && (
              <div
                className="oui-absolute oui-left-0 oui-top-0 oui-h-full oui-bg-primary oui-rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, ((price - md.low_24h.usd) / (md.high_24h.usd - md.low_24h.usd)) * 100))}%`,
                }}
              />
            )}
          </div>
        </div>

        {/* Period changes */}
        <div className="oui-grid oui-grid-cols-3 oui-gap-3">
          {[
            { label: "24h", value: change24h },
            { label: "7d", value: change7d },
            { label: "30d", value: change30d },
          ].map(({ label, value }) => (
            <div key={label} className="oui-bg-base-7 oui-rounded-lg oui-p-3 oui-text-center">
              <p className="oui-text-xs oui-text-base-contrast-36 oui-mb-1">{label}</p>
              {value != null ? <PctBadge value={value} /> : <span className="oui-text-xs oui-text-base-contrast-36">—</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="oui-grid oui-grid-cols-2 md:oui-grid-cols-3 oui-gap-3">
        <Stat label="Market Cap" value={fmt(md.market_cap.usd, true)} />
        <Stat label="24h Volume" value={fmt(md.total_volume.usd, true)} />
        <Stat label="Circulating Supply" value={`${fmtCompact(md.circulating_supply)} ${coin.symbol.toUpperCase()}`} />
        <Stat label="Total Supply" value={md.total_supply ? `${fmtCompact(md.total_supply)} ${coin.symbol.toUpperCase()}` : "∞"} />
        <Stat label="All-Time High" value={fmt(md.ath.usd)} />
        <Stat label="All-Time Low" value={fmt(md.atl.usd)} />
      </div>

      {/* Description */}
      {desc && desc.length > 5 && (
        <div className="oui-bg-base-8 oui-border oui-border-line-12 oui-rounded-xl oui-p-5">
          <h3 className="oui-text-sm oui-font-semibold oui-text-base-contrast-80 oui-mb-2">About</h3>
          <p className="oui-text-sm oui-text-base-contrast-54 oui-leading-relaxed">{desc}</p>
        </div>
      )}

      {/* Links */}
      {links.length > 0 && (
        <div className="oui-flex oui-flex-wrap oui-gap-2">
          {links.map(l => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="oui-inline-flex oui-items-center oui-gap-1.5 oui-bg-base-8 oui-border oui-border-line-12 oui-rounded-lg oui-px-3 oui-py-2 oui-text-xs oui-font-semibold oui-text-base-contrast-54 hover:oui-text-base-contrast-80 hover:oui-border-primary/50 oui-no-underline oui-transition-colors"
            >
              <ExternalLink size={12} />
              {l.label}
            </a>
          ))}
        </div>
      )}

      {/* CoinGecko credit */}
      <p className="oui-text-xs oui-text-base-contrast-36 oui-text-center oui-pt-2">
        Data powered by{" "}
        <a href="https://coingecko.com" target="_blank" rel="noopener noreferrer" className="oui-text-primary">
          CoinGecko
        </a>
      </p>
    </div>
  );
}
