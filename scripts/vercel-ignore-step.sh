#!/usr/bin/env bash
# Vercel "Ignored Build Step". Exit 0 = skip the build, exit 1 = build.
#
# THIS FILE IS THE AUTHORITY FOR THIS PROJECT'S BUILD-SKIP POLICY.
# vercel.json sets "ignoreCommand" to run it, and ignoreCommand OVERRIDES the
# dashboard "Ignored Build Step" field. Changing that dashboard field has no
# effect at all while vercel.json names this script. Measured 2026-11-03
# (LAC-6380): a dashboard-only preview policy was written, read back as
# present, and silently ignored for 20 hours while the script in the repo went
# on building every preview. Change the policy HERE.
#
# Policy (CEO ruling LAC-7127 decision 2a, 2026-11-05; landed LAC-7149).
# Preview builds are OPT-IN, on this project and on every other one:
#   production                       -> always build
#   preview, "[preview]" in message   -> build
#   anything else                     -> skip
#
# Production always builds. buildandserve.com is the live business site and a
# skipped production build would leave it on an older deployment after a merge.
# That is why VERCEL_ENV is tested first and why scripts/test-vercel-ignore-step.sh
# runs this file for real instead of reading it.
#
# Why previews are off here: 96 previews in 14 days, 95 of them on agent issue
# branches or dependabot, and the one human branch was a security bump. The
# 2026-11-05 burst of 25 previews was `fix(lint)`, `style: prettier --write on
# 80 files` and `docs(ops)`. Nobody opens a preview URL for a prettier commit.
# 69 min/wk of build time, and the preview build's implicit job -- typecheck,
# lint, unit tests -- now runs per PR in .github/workflows/ci.yml (PR #117), so
# it was being paid for twice.
#
# Two things a skipped preview does NOT break:
#   - .github/workflows/db-neon-branch-on-pr.yaml triggers on pull_request, not
#     on the Vercel build, so a skipped preview cannot orphan a Neon branch.
#   - `main` has no branch protection and no rulesets, so no preview deployment
#     is a required status check and a skip cannot deadlock a merge.
#
# The match is a plain substring, so a commit that merely TALKS about the
# marker opts itself in. That is a real trip hazard when you are editing this
# policy or writing a changelog entry about it: word such a message around the
# marker, or accept the build.
#
# To get a preview build, put [preview] anywhere in the commit message. No
# ticket and no approval needed. You can also redeploy from the Vercel
# dashboard, which bypasses this step entirely. If you already pushed without
# it, an empty commit with [preview] in the message is enough.
set -eu

if [ "${VERCEL_ENV:-}" = "production" ]; then
  echo "production: building"
  exit 1
fi

# Vercel exports the commit message; fall back to git for a local run.
MSG="${VERCEL_GIT_COMMIT_MESSAGE:-}"
if [ -z "$MSG" ]; then
  MSG="$(git log -1 --pretty=%B 2>/dev/null || true)"
fi

case "$MSG" in
  *"[preview]"*)
    echo "preview + [preview] marker: building"
    exit 1
    ;;
esac

echo "preview without [preview] marker: skipping build"
exit 0
