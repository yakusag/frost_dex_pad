import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

const STORAGE_KEY = "referral_code";

export default function ReferralHandler() {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref") || searchParams.get("referral");
    if (ref && ref.trim()) {
      const existing = localStorage.getItem(STORAGE_KEY);
      if (!existing) {
        localStorage.setItem(STORAGE_KEY, ref.trim());
      }
    }
  }, [searchParams]);

  return null;
}
