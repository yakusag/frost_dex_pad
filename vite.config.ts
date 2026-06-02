import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { cjsInterop } from "vite-plugin-cjs-interop";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import fs from "fs";
import path from "path";

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

  return {
    server: {
      open: false,
      host: "0.0.0.0",
      port: 5000,
      allowedHosts: true,
      proxy: {
        "/api/groq": {
          target: "https://api.groq.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/groq/, "/openai/v1/chat/completions"),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              const apiKey = process.env.GROQ_API_KEY || "";
              proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
            });
          },
        },
      },
    },
    define: {
      __GROQ_KEY__: JSON.stringify(process.env.GROQ_API_KEY || ""),
      __ADMIN_WALLET__: JSON.stringify("EPAZFYgj87LuUBP8JaAs3EiJvsTQnh2EoMtmSvC7iEzZ"),
    },
    base: basePath,
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
      target: "esnext",
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react":    ["react", "react-dom", "react-router-dom"],
            "vendor-orderly":  ["@orderly.network/react-app", "@orderly.network/ui", "@orderly.network/ui-scaffold"],
            "vendor-orderly2": ["@orderly.network/trading", "@orderly.network/markets", "@orderly.network/portfolio"],
            "vendor-orderly3": ["@orderly.network/affiliate", "@orderly.network/vaults", "@orderly.network/wallet-connector"],
            "vendor-web3":     ["wagmi"],
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom"],
    },
  };
});
