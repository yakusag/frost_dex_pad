# 📦 PINATA IPFS Configuration Guide

## Overview
This project uses **Pinata** for decentralized storage of token images and metadata on IPFS.

## Setup Instructions

### 1. Get Your Pinata JWT

1. Visit [https://pinata.cloud](https://pinata.cloud)
2. Sign up or log in to your account
3. Go to **API Keys** → **Create New Key**
4. Select scopes: `pinFileToIPFS`, `pinJSONToIPFS`, `unpin`
5. Copy the **JWT Token**

### 2. Add JWT to Project

#### Option A: Environment Variable (.env)
```bash
# .env or .env.local
VITE_PINATA_JWT=your_jwt_token_here
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
VITE_PINATA_API=https://api.pinata.cloud
```

#### Option B: LocalStorage (Runtime)
The JWT can also be set dynamically via localStorage:
```typescript
import { PINATA_CONFIG } from "@/utils/wallet-config";

PINATA_CONFIG.setJWT("your_jwt_token_here");
```

#### Option C: Configuration File
A `.env.pinata` file has been created with your JWT. Load it in your development:
```bash
source .env.pinata
```

### 3. Verify Configuration

Use the `PinataHealthCheck` component to verify your setup:

```typescript
import PinataHealthCheck from "@/components/PinataHealthCheck";

export default function App() {
  return <PinataHealthCheck />;
}
```

Or use the test function directly:

```typescript
import { testPinataConnection, getPinataStatus } from "@/services/ipfs";

const status = getPinataStatus();
const connection = await testPinataConnection();

console.log("Status:", status);
console.log("Connection:", connection);
```

## API Reference

### Upload Image
```typescript
import { uploadImageToIPFS } from "@/services/ipfs";

const file = new File([...], "token.png", { type: "image/png" });
const ipfsUrl = await uploadImageToIPFS(file, (progress) => {
  console.log(`Upload progress: ${progress}%`);
});
```

### Upload Metadata
```typescript
import { uploadJSONToIPFS } from "@/services/ipfs";

const metadata = {
  name: "My Token",
  symbol: "MTK",
  description: "Token description",
  image: "https://gateway.pinata.cloud/ipfs/Qm...",
};

const metadataUrl = await uploadJSONToIPFS(metadata);
```

### Check Configuration
```typescript
import { isPinataConfigured, getPinataStatus } from "@/services/ipfs";

if (isPinataConfigured()) {
  const status = getPinataStatus();
  console.log("Gateway:", status.gatewayUrl);
  console.log("Has Env Var:", status.hasEnvVar);
  console.log("Has LocalStorage:", status.hasLocalStorage);
}
```

### Test Connection
```typescript
import { testPinataConnection } from "@/services/ipfs";

const result = await testPinataConnection();
console.log(result);
// { success: true, message: "Connected to Pinata as user@example.com" }
```

## Token Creation with IPFS

When creating a token via the token creation page:

1. **Image Upload**: Token image is uploaded to Pinata via IPFS
2. **Metadata Upload**: Token metadata (name, symbol, description, image URL) is uploaded as JSON
3. **Metadata URL**: The metadata URL is stored with the token for future reference

### Storage Keys

```typescript
// Token storage
localStorage.setItem("frostdex_tokens_v2_pump", JSON.stringify(tokens));

// Pinata JWT storage
localStorage.setItem("frost_dex_pinata_jwt_v1", jwtToken);
```

## Security Notes

⚠️ **Important**: Your JWT token should be treated like a password.

- **Never** commit JWT to version control
- **Never** expose JWT in client-side code in production
- Use `.env.local` for local development
- In production, load JWT from secure environment variables only
- Consider using rate limiting and monitoring for unauthorized access

## Pinata API Limits

- **Free tier**: Up to 1GB storage
- **Pay-as-you-go**: Beyond 1GB
- **Rate limits**: 30 requests/second for authenticated requests

## Gateway URLs

Primary Gateway (Used):
```
https://gateway.pinata.cloud/ipfs/{HASH}
```

Alternative Gateways (in case of primary failure):
```
https://ipfs.io/ipfs/{HASH}
https://cloudflare-ipfs.com/ipfs/{HASH}
https://nft.storage/ipfs/{HASH}
```

## Troubleshooting

### JWT Not Found
```typescript
const status = getPinataStatus();
console.log(status);
// Check hasEnvVar and hasLocalStorage
```

### Upload Failed
- Verify JWT is valid: Run `testPinataConnection()`
- Check file size (Pinata has limits per file)
- Ensure proper CORS headers are set
- Check network connectivity

### IPFS Hash Not Returned
- Verify Pinata account has storage available
- Check if token has proper scopes: `pinFileToIPFS`, `pinJSONToIPFS`

## Files Modified

- `app/services/ipfs.ts` - Enhanced IPFS service with JWT support
- `app/utils/wallet-config.ts` - Pinata configuration management
- `app/components/PinataHealthCheck.tsx` - Health check component
- `.env.pinata` - Pinata configuration (with your JWT)

## Environment Variables

```typescript
// .env or .env.local
VITE_PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud
VITE_PINATA_API=https://api.pinata.cloud
```

## Next Steps

1. ✅ JWT configured in `.env.pinata`
2. Test with `testPinataConnection()`
3. Use `PinataHealthCheck` component to verify
4. Create tokens with image upload
5. Monitor storage usage on Pinata dashboard

---

**Documentation**: [Pinata API Docs](https://docs.pinata.cloud/)
