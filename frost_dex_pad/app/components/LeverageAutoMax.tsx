import { useEffect, useRef } from "react";
import { useLeverage, useAccount } from "@orderly.network/hooks";

const STORAGE_KEY = "frostdex_leverage_set";

export default function LeverageAutoMax() {
  const { state } = useAccount();
  const { curLeverage, maxLeverage, update } = useLeverage() as {
    curLeverage: number;
    maxLeverage: number;
    update: (params: { leverage: number }) => Promise<any>;
  };
  const didSet = useRef(false);

  useEffect(() => {
    if (didSet.current) return;
    if (!state?.accountId) return;
    if (!maxLeverage || !curLeverage) return;

    const key = `${STORAGE_KEY}_${state.accountId}`;
    const alreadySet = localStorage.getItem(key);
    if (alreadySet) return;

    if (curLeverage < maxLeverage) {
      didSet.current = true;
      update({ leverage: maxLeverage })
        .then(() => {
          localStorage.setItem(key, "1");
        })
        .catch(() => { didSet.current = false; });
    } else {
      localStorage.setItem(key, "1");
    }
  }, [state?.accountId, curLeverage, maxLeverage, update]);

  return null;
}
