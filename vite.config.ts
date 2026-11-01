import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";
import { defineConfig, Plugin } from "vite";
import { cjsInterop } from "vite-plugin-cjs-interop";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import tsconfigPaths from "vite-tsconfig-paths";

function loadConfigTitle(): string {
  try {
    const configPath = path.join(__dirname, "public/config.js");
    if (!fs.existsSync(configPath)) {
      return "Orderly Network";
    }

    const configText = fs.readFileSync(configPath, "utf-8");
    const jsonText = configText
      .replace(/window\.__RUNTIME_CONFIG__\s*=\s*/, "")
      .replace(/;\s*$/, "")
      .trim();

    const config = JSON.parse(jsonText);
    return config.VITE_ORDERLY_BROKER_NAME || "Orderly Network";
  } catch (error) {
    console.warn("Failed to load title from config.js:", error);
    return "Orderly Network";
  }
}

function htmlTitlePlugin(): Plugin {
  const title = loadConfigTitle();
  console.log(`Using title from config.js: ${title}`);

  return {
    name: "html-title-transform",
    transformIndexHtml(html) {
      return html.replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
    },
  };
}

export default defineConfig(() => {
  const basePath = process.env.PUBLIC_PATH || "/";
  const usePrivy = !!process.env.VITE_PRIVY_APP_ID;
  const dropConfig: Array<"console" | "debugger"> =
    process.env.NODE_ENV === "production" ? ["console", "debugger"] : [];

  const esbuildOptions = {
    drop: dropConfig,
    legalComments: "none" as const,
    treeShaking: true,
    target: "es2022",
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
  } as const;

  const privyAlias: Record<string, string> = usePrivy
    ? {}
    : {
        "@orderly.network/wallet-connector-privy": path.resolve(
          __dirname,
          "app/stubs/privy-wallet.tsx",
        ),
      };

  return {
    server: {
      open: false,
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true as const,
    },
    base: basePath,
    resolve: {
      alias: privyAlias,
    },
    plugins: [
      react(),
      tsconfigPaths(),
      htmlTitlePlugin(),
      cjsInterop({
        dependencies: ["bs58", "@coral-xyz/anchor", "lodash"],
      }),
      nodePolyfills({
        include: ["buffer", "crypto", "stream"],
      }),
    ],
    build: {
      outDir: "build/client",
      target: "es2022",
      chunkSizeWarningLimit: 2000,
      cssCodeSplit: true,
      reportCompressedSize: false,
      sourcemap: false,
      minify: "esbuild" as const,
      assetsInlineLimit: 8192,
      modulePreload: { polyfill: false },
      rollupOptions: {
        maxParallelFileOps: 4,
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-orderly-a": [
              "@orderly.network/react-app",
              "@orderly.network/ui",
            ],
            "vendor-orderly-b": [
              "@orderly.network/ui-scaffold",
              "@orderly.network/trading",
            ],
            "vendor-orderly-c": [
              "@orderly.network/markets",
              "@orderly.network/portfolio",
            ],
            "vendor-orderly-d": [
              "@orderly.network/affiliate",
              "@orderly.network/vaults",
            ],
            "vendor-orderly-e": ["@orderly.network/wallet-connector"],
            "vendor-web3": ["wagmi"],
            "vendor-solana": [
              "@solana/wallet-adapter-base",
              "@solana/wallet-adapter-wallets",
            ],
          },
          compact: true,
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom"],
      force: false,
    },
    esbuild: esbuildOptions,
    css: {
      devSourcemap: false,
    },
  };
});
