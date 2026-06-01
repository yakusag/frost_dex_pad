---
name: code-review validation keys off the assigned project task scope
description: Why a "push-only" project task can make mark_task_complete's code review reject the real feature diff
---

# Code-review validation scopes against the assigned/most-recent project task

When `mark_task_complete` runs its code-review validation, the reviewer reads the
**assigned project task's description** as the objective and judges the git diff
against it.

**The trap:** if you create a narrowly-scoped "push to GitHub — no code changes"
project task (to satisfy the replit.md auto-push preference) while the working tree
still contains the actual feature diff, the code review will REJECT: it sees code
changes that the task declared out-of-scope, and finds no push evidence in a diff.

**Why:** the push task is *operational* (verified by `git ls-remote`, not by a diff),
but code review only knows how to review code diffs against the task text.

**How to apply:**
- Frame the project task around the real deliverable (the feature/code change) with
  the push as the final delivery step — do NOT write "out of scope: any code changes"
  when the diff for that change is what's being committed.
- Still separately address any *legitimate* functional findings the reviewer raises
  (those are real regardless of the scope confusion).
- If the review still mis-scopes after realignment, use `request_fresh_code_review:true`
  and, only if truly inapplicable, `skip_validation_reason` explaining the mismatch.
