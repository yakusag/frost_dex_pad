# Wallet & Pinata JWT Setup Guide

## Overview
This guide explains how to set up wallet integration, PROGRAM_ID generation, and Pinata JWT for your FrostDex platform.

## Features

✅ **Wallet Connection**: Connect your Solana wallet to the platform
✅ **Program ID Generation**: Automatically generate a program ID based on your wallet
✅ **Pinata JWT Storage**: Store and manage IPFS access via Pinata
✅ **Persistent Storage**: All configurations are saved in localStorage
✅ **Fee Management**: Receive platform fees on your wallet

## Setup Instructions

### 1. Connect Your Wallet

1. Navigate to the Wallet Setup section in the app
2. Click "Select Wallet" and choose your wallet provider (Phantom, Solflare, etc.)
3. Approve the connection in your wallet
4. Your wallet address will be automatically saved and used for fee collection

### 2. Set Up Pinata JWT

#### Get Your Pinata JWT:

1. Visit [https://app.pinata.cloud](https://app.pinata.cloud)
2. Sign in or create an account
3. Go to **API Keys** section
4. Click **"Create Key"**
5. Select **"Admin"** scope for full access
6. Copy the **JWT token** (long string starting with `eyJ`)

#### Add JWT to FrostDex:

1. Click **"Edit"** next to "Pinata JWT" in the Wallet Setup panel
2. Paste your JWT token in the input field
3. Click **"Save JWT"**
4. Your token is now saved and will be used for IPFS uploads

### 3. Understand Program ID

- **Program ID** is automatically generated based on your wallet address
- It's used to interact with your Solana program
- The ID is stored in localStorage for persistence
- You can view and copy it from the Wallet Setup panel

### 4. Environment Variables

Create a `.env.local` file in your project root:

```env
# Solana Configuration
VITE_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
VITE_SOLANA_NETWORK=mainnet-beta

# Program Configuration (auto-generated, but can override)
VITE_PROGRAM_ID=your_program_id_here

# Pinata Configuration (optional, will use localStorage if not set)
VITE_PINATA_JWT=your_jwt_token_here
VITE_PINATA_GATEWAY=https://gateway.pinata.cloud

# Admin Wallet (optional, will use connected wallet if not set)
VITE_ADMIN_WALLET=your_wallet_address_here
```

## File Structure

```
app/
├── utils/
│   └── wallet-config.ts          # Wallet & Pinata configuration
├── hooks/
│   └── useAdminWallet.ts         # Enhanced wallet hook
├── components/
│   └── WalletSetup.tsx           # Wallet setup UI component
└── services/
    └── ipfs.ts                   # Updated IPFS service
```

## API Reference

### `useAdminWallet()` Hook

```typescript
const {
  adminWallet,          // Current admin wallet address
  programId,           // Generated or configured program ID
  isVerified,          // Is wallet verified
  savedWallet,         // Saved wallet state object
  pinataJwt,          // Stored Pinata JWT
  pinataConfigured,   // Is Pinata JWT configured
  saveAdminWallet,    // Function to save wallet
  setPinataJwtToken,  // Function to set JWT
  clearAdminWallet    // Function to clear wallet
} = useAdminWallet();
```

### `WalletState` Interface

```typescript
interface WalletState {
  address: string;      // Wallet address
  programId: string;    // Generated program ID
  createdAt: number;    // Timestamp of creation
  lastUsed: number;     // Last usage timestamp
}
```

### Storage Keys

- `frost_dex_wallet_v1`: Stores wallet state
- `frost_dex_program_id_v1`: Stores program ID
- `frost_dex_pinata_jwt_v1`: Stores Pinata JWT

## Security Notes

⚠️ **Important Security Guidelines:**

1. **Never commit JWT tokens** to version control
2. **Keep JWT tokens private** - treat them like passwords
3. **Use environment variables** for production deployment
4. **Rotate JWT tokens** regularly in Pinata dashboard
5. **Never share** your admin wallet private key
6. **Use wallet signing** for transaction authentication

## Troubleshooting

### Wallet Not Connecting
- Make sure you have a Solana wallet extension installed
- Try a different wallet provider
- Clear browser cache and reload

### Pinata JWT Not Working
- Verify JWT token format (should start with `eyJ`)
- Check if JWT has expired in Pinata dashboard
- Ensure you selected "Admin" scope when creating API key
- Try creating a new API key

### IPFS Uploads Failing
- Verify Pinata JWT is properly set
- Check if IPFS file size is under 2GB
- Ensure network connection is stable

## Fee Structure

Platform fees are sent to your admin wallet:
- **Buy trades**: 15% (1500 basis points)
- **Sell trades**: 15% (1500 basis points)
- **Advanced options**: Variable based on service

## Next Steps

1. ✅ Connect your wallet
2. ✅ Get and store Pinata JWT
3. ✅ View your Program ID
4. 🔜 Start creating tokens
5. 🔜 Monitor fee collection

## Support

For issues or questions:
- Check the troubleshooting section above
- Review environment variables setup
- Ensure wallet is properly connected
- Verify Pinata account status

## Related Files

- [Token Creation](./app/pages/create-token/Index.tsx)
- [IPFS Service](./app/services/ipfs.ts)
- [Solana Utilities](./app/services/solana.ts)
