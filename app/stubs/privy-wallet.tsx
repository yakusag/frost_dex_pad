import type { ReactNode } from "react";

export const Network = {
  mainnet: "mainnet",
  testnet: "testnet",
} as const;

export function WalletConnectorPrivyProvider({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
