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
      warmup: {
        clientFiles: [
          "./app/main.tsx",
          "./app/App.tsx",
          "./app/pages/perp/Layout.tsx",
          "./app/pages/perp/Symbol.tsx",
        ],
      },
      hmr: {
        overlay: false,
      },
    },
    define: {
      __GROQ_KEY__: JSON.stringify(process.env.GROQ_API_KEY || ""),
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
      chunkSizeWarningLimit: 1500,
      cssCodeSplit: true,
      reportCompressedSize: false,
      sourcemap: false,
      minify: "esbuild",
      assetsInlineLimit: 8192,
      modulePreload: { polyfill: false },
      rollupOptions: {
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          unknownGlobalSideEffects: false,
        },
        output: {
          manualChunks: {
            "vendor-react":    ["react", "react-dom", "react-router-dom"],
            "vendor-orderly":  ["@orderly.network/react-app", "@orderly.network/ui", "@orderly.network/ui-scaffold"],
            "vendor-orderly2": ["@orderly.network/trading", "@orderly.network/markets", "@orderly.network/portfolio"],
            "vendor-orderly3": ["@orderly.network/affiliate", "@orderly.network/vaults", "@orderly.network/wallet-connector"],
            "vendor-web3":     ["wagmi"],
          },
          compact: true,
          generatedCode: {
            arrowFunctions: true,
            constBindings: true,
            objectShorthand: true,
          },
        },
      },
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-router-dom"],
      force: false,
      esbuildOptions: {
        target: "esnext",
        treeShaking: true,
      },
    },
    esbuild: {
      drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
      legalComments: "none",
      treeShaking: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      minifyWhitespace: true,
      target: "esnext",
    },
  };
});
