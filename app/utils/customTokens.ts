export interface CustomToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
  poolAddress?: string;
  pairWith?: string;
  uniswapPoolUrl?: string;
}

export const CUSTOM_TOKENS: CustomToken[] = [
  {
    address: "0x80A98400b405Fcba615952c3201869E5C4Ca3BC6",
    symbol: "FROST",
    name: "Frost Token",
    decimals: 18,
    chainId: 42161,
    logoURI: "https://cdn.jsdelivr.net/gh/free-whiteboard-online/Free-Erasorio-Alternative-for-Collaborative-Design@e38378154a3e9b30cef9789a22e287fe840c433b/uploads/2026-05-27T01-57-58-340Z-b6ppbdnwk.png",
    poolAddress: "0x4bec5199b83ad5a616f81927cabb8bfd7a41c652",
    pairWith: "WETH",
    uniswapPoolUrl:
      "https://app.uniswap.org/swap?inputCurrency=0x82aF49447D8a07e3bd95BD0d56f35241523fBab1&outputCurrency=0x80A98400b405Fcba615952c3201869E5C4Ca3BC6&chain=arbitrum",
  },
];

export const FROST_TOKEN = CUSTOM_TOKENS[0];
