const GATEWAY = "https://gateway.pinata.cloud/ipfs";
const UPLOAD_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PIN_LIST_URL = "https://api.pinata.cloud/data/pinList";

// Tag attached to every launched token's pinned metadata so the whole platform
// shares one discoverable registry — any visitor can list every token created
// through the site, not just the ones in their own browser.
const REGISTRY_TAG = "frostdexToken";

function getJwt(): string {
  return (import.meta as any).env?.VITE_PINATA_JWT ?? "";
}

// Build a public gateway URL from a raw IPFS CID.
export function ipfsGateway(cid: string): string {
  return `${GATEWAY}/${cid}`;
}

export function isPinataConfigured(): boolean {
  const jwt = getJwt();
  return jwt.length > 10;
}

export async function uploadImageToIPFS(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const jwt = getJwt();

  if (!jwt || jwt.length < 10) {
    onProgress?.(100);
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = () => rej(new Error("Could not read the image file."));
      r.readAsDataURL(file);
    });
  }

  const form = new FormData();
  form.append("file", file);
  form.append("pinataMetadata", JSON.stringify({ name: file.name }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", UPLOAD_URL);
    xhr.setRequestHeader("Authorization", `Bearer ${jwt}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 95));
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        onProgress?.(100);
        resolve(`${GATEWAY}/${data.IpfsHash}`);
      } else {
        reject(new Error(`Pinata error ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Network error uploading to IPFS"));
    xhr.send(form);
  });
}

export async function uploadJSONToIPFS(
  jsonData: object,
  keyvalues?: Record<string, string | number>,
): Promise<string> {
  const jwt = getJwt();
  if (!jwt || jwt.length < 10) return "";

  // Pinata keyvalues must be strings; we attach them so the pin can later be
  // found via the shared registry listing (see listFrostdexTokens).
  const pinataMetadata: { name: string; keyvalues?: Record<string, string> } = {
    name: "frostdex-token-metadata",
  };
  if (keyvalues) {
    pinataMetadata.keyvalues = Object.fromEntries(
      Object.entries(keyvalues).map(([k, v]) => [k, String(v)]),
    );
  }

  const res = await fetch(JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataContent: jsonData, pinataMetadata, pinataOptions: { cidVersion: 1 } }),
  });

  if (!res.ok) throw new Error(`Pinata JSON error ${res.status}`);
  const data = await res.json();
  return `${GATEWAY}/${data.IpfsHash}`;
}

// A token discovered from the shared Pinata registry. Holds just enough to fetch
// the full metadata JSON (cid) and to map it to its on-chain curve (mint).
export interface RemoteTokenRef {
  cid: string;
  mint: string;
  name: string;
  symbol: string;
  creator: string;
  createdAt: number;
}

// List every token launched through the platform, by querying the shared Pinata
// account for pins tagged with the registry marker. This is what makes tokens
// visible to *everyone*, not just their creator's browser.
export async function listFrostdexTokens(): Promise<RemoteTokenRef[]> {
  const jwt = getJwt();
  if (!jwt || jwt.length < 10) return [];

  const q = new URLSearchParams();
  q.set("status", "pinned");
  q.set("pageLimit", "1000");
  q.set("metadata[keyvalues]", JSON.stringify({ [REGISTRY_TAG]: { value: "1", op: "eq" } }));

  const res = await fetch(`${PIN_LIST_URL}?${q.toString()}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  if (!res.ok) return [];

  const data = await res.json();
  const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
  return rows
    .map((r) => {
      const kv = r?.metadata?.keyvalues ?? {};
      const createdAt =
        Number(kv.createdAt) || (r?.date_pinned ? Date.parse(r.date_pinned) : 0) || 0;
      return {
        cid: r?.ipfs_pin_hash ?? "",
        mint: kv.mint ?? "",
        name: kv.name ?? "",
        symbol: kv.symbol ?? "",
        creator: kv.creator ?? "",
        createdAt,
      } as RemoteTokenRef;
    })
    .filter((t) => !!t.cid && !!t.mint);
}

// Fetch a pinned metadata JSON document by CID (image, description, socials).
export async function fetchTokenJSON(cid: string): Promise<any | null> {
  try {
    const res = await fetch(`${GATEWAY}/${cid}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
