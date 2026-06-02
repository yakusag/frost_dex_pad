---
name: Vercel deployment — env vars & API routes
description: Why this app's prod-only failures (FrostAI 405, RPC "internal error") happen and how the static-site /api proxy works.
---

# Vercel deployment quirks for this DEX template

This app is a **static** Vite build deployed on Vercel from GitHub `yakusag/frost_dex_pad` (branch `main`), output `build/client`, with a SPA catch-all rewrite (`/(.*) -> /index.html`) in `vercel.json`.

## Rule: Replit secrets are NOT on Vercel
Secrets/env vars configured in Replit only exist in the Replit (dev) environment. The Vercel production build/runtime needs the same vars set **in the Vercel project settings**, or you get production-only failures while dev works fine.

**Why:** FrostAI showed "Groq API error 405" and the launchpad showed "internal error" in production only. Root cause was the Vercel project missing `GROQ_API_KEY` (runtime, for the serverless proxy) and `VITE_SOLANA_RPC` (build-time, the Alchemy URL) — both were present in Replit. `VITE_*` vars must exist at **build** time; serverless-function vars are read at **runtime**.

**How to apply:** When a fix works in dev but not on the deployed site, first suspect a missing Vercel env var before changing code. After setting Vercel env vars, the user must trigger a redeploy.

## Rule: POST endpoints need an `api/*` serverless function
A POST to a path like `/api/groq` on the static site hits the SPA catch-all and returns `index.html` for a POST → browser reports **405**. Dev works because `vite.config.ts` proxies `/api/groq`. Production needs a real Vercel serverless function at `api/groq.ts` (Vercel auto-detects the root `/api` dir regardless of framework preset; functions match before top-level `rewrites`).

**How to apply:** Any client `fetch('/api/...')` that must work in production needs both a vite dev proxy entry AND a matching `api/*.ts` serverless function. `api/*.ts` is type-checked by `tsc` (tsconfig includes `**/*.ts`); type `req/res` as `any` to avoid needing `@vercel/node`. Keep paid-API proxies guarded (model allowlist, max_tokens cap, body-size cap) since they're public and unauthenticated.
