#!/bin/bash

echo "🚀 Setting up Solana Bonding Curve Project..."

# Source environment variables
source ~/.cargo/env 2>/dev/null || true
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Check if required tools are installed
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        echo "Visit: $2"
        exit 1
    else
        echo "✅ $1 is installed"
    fi
}

echo "Checking prerequisites..."
check_tool "rustc" "https://rustup.rs/"
check_tool "solana" "https://docs.solana.com/cli/install-solana-cli-tools"
check_tool "anchor" "https://book.anchor-lang.com/getting_started/installation.html"
check_tool "node" "https://nodejs.org/"

# Configure Solana
echo "🔧 Configuring Solana for local development..."
solana config set --url localhost

# Generate keypair if it doesn't exist
if [ ! -f ~/.config/solana/id.json ]; then
    echo "🔑 Generating new keypair..."
    solana-keygen new --no-passphrase
else
    echo "✅ Keypair already exists"
fi

# Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Add additional testing dependencies
echo "📦 Installing additional testing dependencies..."
npm install --save-dev chai @types/chai

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Start local validator: solana-test-validator"
echo "2. Build project: anchor build"
echo "3. Update program ID in lib.rs and Anchor.toml"
echo "4. Run tests: anchor test --skip-local-validator"
echo ""
echo "Happy coding! 🦀" 