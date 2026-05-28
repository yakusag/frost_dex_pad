import { useState, useEffect, useCallback, useRef } from "react";
import { useWalletConnector } from "@orderly.network/hooks";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
  encodeFunctionData,
  type Address,
} from "viem";
import { arbitrum } from "viem/chains";
import { FROST_TOKEN } from "@/utils/customTokens";

const WETH: Address = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const FROST: Address = FROST_TOKEN.address as Address;
const SWAP_ROUTER: Address = "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45";
const QUOTER_V2: Address = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e";
const POOL_FEE = 10000;
const SLIPPAGE_BPS = 50;
const ARBITRUM_ID = 42161;

const ARB_RPC = "https://arb1.arbitrum.io/rpc";

const publicClient = createPublicClient({ chain: arbitrum, transport: http(ARB_RPC) });

const QUOTER_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{
      name: "params", type: "tuple",
      components: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "fee", type: "uint24" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [{
      name: "params", type: "tuple",
      components: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "fee", type: "uint24" },
        { name: "recipient", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "amountOutMinimum", type: "uint256" },
        { name: "sqrtPriceLimitX96", type: "uint160" },
      ],
    }],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "multicall",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "data", type: "bytes[]" }],
    outputs: [{ name: "results", type: "bytes[]" }],
  },
  {
    name: "unwrapWETH9",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "amountMinimum", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [],
  },
] as const;

const ERC20_ABI = [
  {
    name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type Direction = "buy" | "sell";
type TxStatus = "idle" | "approving" | "swapping" | "success" | "error";

export default function FrostSwapWidget() {
  const { wallet, setChain, connectedChain, connect } = useWalletConnector();
  const [dir, setDir] = useState<Direction>("buy");
  const [inputVal, setInputVal] = useState("");
  const [quote, setQuote] = useState<bigint | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [frostBalance, setFrostBalance] = useState<bigint>(0n);
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout>>();

  const address = wallet?.accounts?.[0]?.address as Address | undefined;
  const isConnected = !!address;
  const isArbitrum = connectedChain?.id === ARBITRUM_ID;

  useEffect(() => {
    if (!address) return;
    (async () => {
      try {
        const [eth, frost, allow] = await Promise.all([
          publicClient.getBalance({ address }),
          publicClient.readContract({ address: FROST, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }),
          publicClient.readContract({ address: FROST, abi: ERC20_ABI, functionName: "allowance", args: [address, SWAP_ROUTER] }),
        ]);
        setEthBalance(eth);
        setFrostBalance(frost as bigint);
        setAllowance(allow as bigint);
      } catch {}
    })();
  }, [address, txStatus]);

  useEffect(() => {
    clearTimeout(quoteTimer.current);
    const val = parseFloat(inputVal);
    if (!val || val <= 0) { setQuote(null); return; }
    setQuoteLoading(true);
    quoteTimer.current = setTimeout(async () => {
      try {
        const amountIn = dir === "buy"
          ? parseEther(inputVal)
          : parseUnits(inputVal, FROST_TOKEN.decimals);
        const [tokenIn, tokenOut] = dir === "buy" ? [WETH, FROST] : [FROST, WETH];
        const result = await publicClient.simulateContract({
          address: QUOTER_V2,
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn, tokenOut, amountIn, fee: POOL_FEE, sqrtPriceLimitX96: 0n }],
        });
        setQuote((result.result as [bigint])[0]);
      } catch { setQuote(null); }
      setQuoteLoading(false);
    }, 600);
  }, [inputVal, dir]);

  const getWalletClient = useCallback(() => {
    if (!wallet?.provider) return null;
    return createWalletClient({ chain: arbitrum, transport: custom(wallet.provider) });
  }, [wallet]);

  const switchToArbitrum = useCallback(async () => {
    await setChain({ chainId: ARBITRUM_ID });
  }, [setChain]);

  const handleSwap = useCallback(async () => {
    if (!address || !quote || !isArbitrum) return;
    const wc = getWalletClient();
    if (!wc) return;
    setErrMsg(null);
    try {
      const amountIn = dir === "buy"
        ? parseEther(inputVal)
        : parseUnits(inputVal, FROST_TOKEN.decimals);
      const amountOutMin = quote - (quote * BigInt(SLIPPAGE_BPS)) / 10000n;

      if (dir === "sell") {
        if (allowance < amountIn) {
          setTxStatus("approving");
          const approveHash = await wc.writeContract({
            account: address,
            address: FROST,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [SWAP_ROUTER, amountIn],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveHash });
          setAllowance(amountIn);
        }
      }

      setTxStatus("swapping");

      if (dir === "buy") {
        const hash = await wc.writeContract({
          account: address,
          address: SWAP_ROUTER,
          abi: ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [{
            tokenIn: WETH,
            tokenOut: FROST,
            fee: POOL_FEE,
            recipient: address,
            amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0n,
          }],
          value: amountIn,
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      } else {
        const swapData = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: "exactInputSingle",
          args: [{
            tokenIn: FROST,
            tokenOut: WETH,
            fee: POOL_FEE,
            recipient: SWAP_ROUTER,
            amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0n,
          }],
        });
        const unwrapData = encodeFunctionData({
          abi: ROUTER_ABI,
          functionName: "unwrapWETH9",
          args: [amountOutMin, address],
        });
        const hash = await wc.writeContract({
          account: address,
          address: SWAP_ROUTER,
          abi: ROUTER_ABI,
          functionName: "multicall",
          args: [[swapData, unwrapData]],
          value: 0n,
        });
        setTxHash(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      }

      setTxStatus("success");
      setInputVal("");
      setQuote(null);
    } catch (e: any) {
      setTxStatus("error");
      const msg = e?.shortMessage || e?.message || "Transaction failed";
      setErrMsg(msg.length > 100 ? msg.slice(0, 100) + "…" : msg);
    }
  }, [address, quote, dir, inputVal, allowance, isArbitrum, getWalletClient]);

  const fmt = (val: bigint, dec: number, digits = 4) =>
    parseFloat(formatUnits(val, dec)).toLocaleString("en-US", { maximumFractionDigits: digits });

  const inputDec = dir === "buy" ? 18 : FROST_TOKEN.decimals;
  const inputBalance = dir === "buy" ? ethBalance : frostBalance;
  const inputSym = dir === "buy" ? "ETH" : "FROST";
  const outputSym = dir === "buy" ? "FROST ❄" : "ETH";
  const needsApproval = dir === "sell" && inputVal
    ? parseUnits(inputVal || "0", FROST_TOKEN.decimals) > allowance
    : false;

  const btnDisabled = txStatus === "approving" || txStatus === "swapping" ||
    !inputVal || parseFloat(inputVal) <= 0 || quoteLoading;

  const s = (c: string) => ({ style: c });

  return (
    <div
      className="w-full max-w-md mx-auto rounded-2xl p-5 flex flex-col gap-4"
      style={{
        background: "rgb(var(--oui-color-base-2))",
        border: "1px solid rgba(var(--oui-color-primary), 0.2)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(60,230,255,0.05)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-base" style={{ color: "rgb(var(--oui-color-base-foreground))" }}>
          ❄ Swap FROST
        </span>
        <span className="text-xs px-2 py-1 rounded-full font-medium" style={{
          background: "rgba(var(--oui-color-primary), 0.12)",
          color: "rgb(var(--oui-color-primary))",
        }}>
          Arbitrum · Uniswap V3
        </span>
      </div>

      <div className="flex gap-1 p-1 rounded-xl" style={{ background: "rgb(var(--oui-color-base-3))" }}>
        {(["buy", "sell"] as Direction[]).map((d) => (
          <button
            key={d}
            onClick={() => { setDir(d); setInputVal(""); setQuote(null); setTxStatus("idle"); setErrMsg(null); }}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
            style={dir === d ? {
              background: "rgb(var(--oui-color-primary))",
              color: "rgb(var(--oui-color-base-1))",
            } : {
              background: "transparent",
              color: "rgba(var(--oui-color-base-foreground), 0.5)",
            }}
          >
            {d === "buy" ? "Buy FROST" : "Sell FROST"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between text-xs px-1" style={{ color: "rgba(var(--oui-color-base-foreground), 0.5)" }}>
          <span>You pay</span>
          {isConnected && (
            <button
              className="hover:opacity-80"
              style={{ color: "rgb(var(--oui-color-primary))" }}
              onClick={() => setInputVal(formatUnits(inputBalance, inputDec))}
            >
              Balance: {fmt(inputBalance, inputDec)} {inputSym}
            </button>
          )}
        </div>
        <div
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: "rgb(var(--oui-color-base-3))" }}
        >
          <input
            type="number"
            min="0"
            placeholder="0.0"
            value={inputVal}
            onChange={(e) => { setInputVal(e.target.value); setTxStatus("idle"); setErrMsg(null); }}
            className="flex-1 bg-transparent outline-none text-lg font-semibold"
            style={{ color: "rgb(var(--oui-color-base-foreground))" }}
          />
          <span
            className="text-sm font-bold px-3 py-1 rounded-lg"
            style={{
              background: "rgba(var(--oui-color-primary), 0.12)",
              color: "rgb(var(--oui-color-primary))",
            }}
          >
            {inputSym}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center text-lg" style={{ color: "rgba(var(--oui-color-primary), 0.6)" }}>↓</div>

      <div className="flex flex-col gap-1">
        <div className="text-xs px-1" style={{ color: "rgba(var(--oui-color-base-foreground), 0.5)" }}>
          You receive (est.)
        </div>
        <div
          className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: "rgb(var(--oui-color-base-3))" }}
        >
          <div className="flex-1 text-lg font-semibold" style={{ color: quote ? "rgb(var(--oui-color-primary))" : "rgba(var(--oui-color-base-foreground), 0.3)" }}>
            {quoteLoading ? "…" : quote ? fmt(quote, dir === "buy" ? FROST_TOKEN.decimals : 18, dir === "buy" ? 2 : 6) : "0.0"}
          </div>
          <span
            className="text-sm font-bold px-3 py-1 rounded-lg"
            style={{
              background: "rgba(var(--oui-color-primary), 0.12)",
              color: "rgb(var(--oui-color-primary))",
            }}
          >
            {outputSym}
          </span>
        </div>
      </div>

      {quote && (
        <div className="text-xs px-1 flex justify-between" style={{ color: "rgba(var(--oui-color-base-foreground), 0.4)" }}>
          <span>Slippage: 0.5%</span>
          <span>Uniswap V3 · 1% fee tier</span>
        </div>
      )}

      {errMsg && (
        <div
          className="text-xs p-3 rounded-xl"
          style={{ background: "rgba(255,80,110,0.1)", color: "rgb(255,130,150)", border: "1px solid rgba(255,80,110,0.2)" }}
        >
          {errMsg}
        </div>
      )}

      {txStatus === "success" && txHash && (
        <div
          className="text-xs p-3 rounded-xl flex items-center justify-between"
          style={{ background: "rgba(60,230,180,0.1)", color: "rgb(60,230,180)", border: "1px solid rgba(60,230,180,0.2)" }}
        >
          <span>Swap successful!</span>
          <a
            href={`https://arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            View on Arbiscan ↗
          </a>
        </div>
      )}

      {!isConnected ? (
        <button
          onClick={() => connect()}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "rgb(var(--oui-color-primary))", color: "rgb(var(--oui-color-base-1))" }}
        >
          Connect Wallet
        </button>
      ) : !isArbitrum ? (
        <button
          onClick={switchToArbitrum}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "rgba(255,200,80,0.15)", color: "rgb(255,200,80)", border: "1px solid rgba(255,200,80,0.3)" }}
        >
          Switch to Arbitrum
        </button>
      ) : (
        <button
          onClick={handleSwap}
          disabled={btnDisabled}
          className="w-full py-3.5 rounded-xl font-bold text-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "rgb(var(--oui-color-primary))", color: "rgb(var(--oui-color-base-1))" }}
        >
          {txStatus === "approving" ? "Approving…"
            : txStatus === "swapping" ? "Swapping…"
            : needsApproval ? `Approve FROST`
            : `Swap ${inputSym} → ${outputSym}`}
        </button>
      )}
    </div>
  );
}
