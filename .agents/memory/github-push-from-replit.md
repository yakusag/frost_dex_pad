---
name: Pushing this repl to GitHub
description: How git push to the GitHub origin behaves from the Replit main agent
---

# Pushing main to GitHub origin

This repl mirrors to GitHub `yakusag/frost_dex_pad` (remote `origin`). Vercel deploys from that
GitHub repo, so changes only reach the live site (frostdexpad.vercel.app) after a push.

**Behavior:** a plain `git push origin main` from the main agent **succeeds** — you will see the
`old..new main -> main` line — but it is always followed by a harmless error:
`update_ref failed for ref 'refs/remotes/origin/main': cannot lock ref ... main.lock: File exists`.
That only fails to update the *local tracking ref*; the remote is updated. Removing the stale
`.git/refs/remotes/origin/main.lock` is blocked (treated as a destructive git op), so ignore it.

**Verify** the push really landed with:
`git ls-remote origin refs/heads/main` and compare to `git rev-parse HEAD`.

**User preference:** auto-push to GitHub after finishing any task (also noted in `replit.md`).
The agent's own uncommitted edits commit at loop-end checkpoint, so a push task scheduled then
will include them.
