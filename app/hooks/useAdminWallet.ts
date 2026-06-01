const PLATFORM_FEE_WALLET = "EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ";

export function useAdminWallet() {
  const adminWallet = PLATFORM_FEE_WALLET;
  const isVerified = true;

  return {
    adminWallet,
    isVerified,
    signature: "platform-hardcoded",
    saveAdminWallet: () => {},
    clearAdminWallet: () => {},
  };
}

export { PLATFORM_FEE_WALLET };
