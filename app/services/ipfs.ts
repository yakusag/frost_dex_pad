import { PINATA_CONFIG } from "@/utils/wallet-config";

const GATEWAY = PINATA_CONFIG.GATEWAY_URL;
const UPLOAD_URL = `${PINATA_CONFIG.PINATA_API_URL}/pinning/pinFileToIPFS`;
const JSON_URL = `${PINATA_CONFIG.PINATA_API_URL}/pinning/pinJSONToIPFS`;

// ─── JWT Management ──────────────────────────────────────────────────────────
function getJwt(): string {
  const jwt = PINATA_CONFIG.getJWT();
  return jwt;
}

export function isPinataConfigured(): boolean {
  return PINATA_CONFIG.isConfigured();
}

export function getPinataStatus(): {
  isConfigured: boolean;
  hasEnvVar: boolean;
  hasLocalStorage: boolean;
  gatewayUrl: string;
  apiUrl: string;
} {
  const info = PINATA_CONFIG.getCredentialsInfo();
  return {
    ...info,
    gatewayUrl: GATEWAY,
    apiUrl: PINATA_CONFIG.PINATA_API_URL,
  };
}

// ─── Image Upload ────────────────────────────────────────────────────────────
export async function uploadImageToIPFS(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  const jwt = getJwt();

  // Fallback: return data URL if no JWT
  if (!jwt || jwt.length < 50) {
    onProgress?.(100);
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result as string);
      r.onerror = rej;
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
      if (e.lengthComputable) {
        const progress = Math.round((e.loaded / e.total) * 95);
        onProgress?.(progress);
      }
    };

    xhr.onload = () => {
      onProgress?.(100);
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.IpfsHash) {
            resolve(`${GATEWAY}/ipfs/${data.IpfsHash}`);
          } else {
            reject(new Error("No IPFS hash returned"));
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e}`));
        }
      } else {
        reject(new Error(`Pinata error ${xhr.status}: ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error uploading to Pinata"));
    };

    xhr.onabort = () => {
      reject(new Error("Upload cancelled"));
    };

    xhr.send(form);
  });
}

// ─── JSON/Metadata Upload ────────────────────────────────────────────────────
export async function uploadJSONToIPFS(jsonData: object): Promise<string> {
  const jwt = getJwt();

  if (!jwt || jwt.length < 50) {
    console.warn("Pinata JWT not configured, metadata will not be pinned");
    return "";
  }

  try {
    const res = await fetch(JSON_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pinataContent: jsonData,
        pinataOptions: { cidVersion: 1 },
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Pinata error ${res.status}: ${error}`);
    }

    const data = await res.json();
    if (data.IpfsHash) {
      return `${GATEWAY}/ipfs/${data.IpfsHash}`;
    } else {
      throw new Error("No IPFS hash returned");
    }
  } catch (error) {
    console.error("Failed to upload JSON to Pinata:", error);
    throw error;
  }
}

// ─── Pinata Health Check ─────────────────────────────────────────────────────
export async function testPinataConnection(): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  const jwt = getJwt();

  if (!jwt || jwt.length < 50) {
    return {
      success: false,
      message: "Pinata JWT not configured",
      error: "No valid JWT token found",
    };
  }

  try {
    const res = await fetch(`${PINATA_CONFIG.PINATA_API_URL}/data/testAuthentication`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        message: `Connected to Pinata as ${data.email || "user"}`,
      };
    } else {
      return {
        success: false,
        message: "Failed to connect to Pinata",
        error: `HTTP ${res.status}`,
      };
    }
  } catch (error) {
    return {
      success: false,
      message: "Network error testing Pinata connection",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ─── Pinata File Operations ──────────────────────────────────────────────────
export async function unpinFile(ipfsHash: string): Promise<boolean> {
  const jwt = getJwt();

  if (!jwt || jwt.length < 50) {
    console.warn("Pinata JWT not configured, cannot unpin file");
    return false;
  }

  try {
    const res = await fetch(`${PINATA_CONFIG.PINATA_API_URL}/pinning/unpin/${ipfsHash}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    return res.ok;
  } catch (error) {
    console.error("Failed to unpin file:", error);
    return false;
  }
}
