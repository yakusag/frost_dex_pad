---
name: Stale duplicate dir frost_dex_pad
description: Why tsc reports errors outside app/ that you should not try to fix.
---

# `frost_dex_pad/` is a stale duplicate of `app/`

The repo root has a `frost_dex_pad/` directory that is an older copy of the active
source in `app/`. The root `tsconfig` include globs (`**/*.tsx` etc.) pick it up,
so `npx tsc --noEmit` reports a pile of errors that originate there (and in some
unrelated widgets). These are pre-existing and unrelated to active work.

**How to apply:** When validating a change, filter tsc output to the files you
actually touched (e.g. `npx tsc --noEmit 2>&1 | grep <yourfile>`). Don't try to
make the whole tree typecheck clean — `frost_dex_pad/` is not the app that runs.
The active app served by Vite is `app/` (see `app/main.tsx` router).
