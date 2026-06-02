const GATEWAY = "https://gateway.pinata.cloud/ipfs";
const UPLOAD_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function getJwt(): string {
  return (import.meta as any).env?.VITE_PINATA_JWT ?? "";
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

export async function uploadJSONToIPFS(jsonData: object): Promise<string> {
  const jwt = getJwt();
  if (!jwt || jwt.length < 10) return "";

  const res = await fetch(JSON_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataContent: jsonData, pinataOptions: { cidVersion: 1 } }),
  });

  if (!res.ok) throw new Error(`Pinata JSON error ${res.status}`);
  const data = await res.json();
  return `${GATEWAY}/${data.IpfsHash}`;
}
