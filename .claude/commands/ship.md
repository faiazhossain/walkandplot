---
description: Run quality gates (lint, typecheck, test, build) then commit and push if all pass
allowed-tools:
  - Bash(npm run lint)
  - Bash(npm run lint:*)
  - Bash(npm run typecheck)
  - Bash(npm run test)
  - Bash(npm run build)
  - Bash(git status)
  - Bash(git status:*)
  - Bash(git diff)
  - Bash(git diff:*)
  - Bash(git log:*)
  - Bash(git add:*)
  - Bash(git commit:*)
  - Bash(git push)
  - Bash(git push:*)
  - Bash(git branch:*)
  - Bash(git rev-parse:*)
---

# Ship

Run every quality gate. Commit and push only if all gates pass.

Arguments: $ARGUMENTS

Treat arguments as hints: free text becomes commit-message guidance; `--skip-test` or `--skip-build` skips that one gate (never skip lint or typecheck).

## Quality gates

Run from the repo root, in order. If one fails, do not move on:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test` (vitest; skipped only with `--skip-test`)
4. `npm run build` (skipped only with `--skip-build`)

## If a gate fails

Fix the errors yourself where you can, then re-run the failed gate and every gate after it. If a failure cannot be fixed, stop: report the failing output and do not commit or push. Never commit on a red gate, and never work around a gate with `--no-verify`, skipped config, or forced flags.

## If all gates pass

1. Run `git status --porcelain` and `git diff --stat` to see what will ship.
   - Clean tree: report "nothing to ship" and stop.
   - Untracked files that look sensitive (.env, keys, credentials, large binaries): leave them out, say so, and suggest gitignore entries.
2. `git add .`
3. Commit with a conventional-commit message (feat/fix/chore/docs/refactor/test), past tense, describing what changed. Keep it atomic — if the changes span unrelated concerns, ask before splitting or lumping.
4. `git push`. If the branch has no upstream, `git push -u origin <branch>`. Never force-push.
5. Close any beads issues this work completed (`bd close <id>`), then report: gates run and results, commit hash and message, push result.
