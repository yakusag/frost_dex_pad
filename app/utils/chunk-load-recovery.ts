const LAST_RELOAD_KEY = "frost-chunk-load-reload";
const RELOAD_COOLDOWN_MS = 30_000;

export function recoverFromChunkLoadError(): boolean {
  const now = Date.now();

  try {
    const lastReload = Number(sessionStorage.getItem(LAST_RELOAD_KEY));
    if (lastReload && now - lastReload < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(LAST_RELOAD_KEY, String(now));
  } catch (error) {
    console.error("Unable to safely retry the failed module load:", error);
    return false;
  }

  window.location.reload();
  return true;
}
