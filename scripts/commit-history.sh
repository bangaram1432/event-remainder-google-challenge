#!/usr/bin/env bash
# Creates a clean, single-branch history of small, self-contained commits (each with its tests), the way a
# trunk-based team would land them. Run once, from a fresh checkout, after `npm install` has produced package-lock.json.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -d .git ]; then echo "A git repository already exists here; refusing to rewrite history." >&2; exit 1; fi
if [ ! -f package-lock.json ]; then echo "Run 'npm install' first so package-lock.json exists and is committed." >&2; exit 1; fi
if [ -z "$(git config --global user.name || true)" ] || [ -z "$(git config --global user.email || true)" ]; then
  echo "Set your identity first: git config --global user.name \"Your Name\" && git config --global user.email you@example.com" >&2
  exit 1
fi

git init -q -b main
land() {
  local message="$1"; shift
  git add -- "$@"
  git commit -q -m "$message"
  echo "committed: $message"
}

land "chore: scaffold Next.js 16 with strict TypeScript, ESLint and Vitest" \
  package.json package-lock.json tsconfig.json eslint.config.mjs vitest.config.mts next.config.ts vercel.json \
  .gitignore .env.example .nvmrc .editorconfig LICENSE
land "feat(domain): exact budget engine with explainable allocation" \
  src/domain/types.ts src/domain/catalog.ts src/domain/format.ts src/domain/dates.ts src/domain/budget.ts \
  tests/helpers.ts tests/budget.test.ts tests/dates.test.ts
land "feat(domain): dated timeline, vendor checklists, ideas and ICS export" \
  src/domain/timeline.ts src/domain/checklist.ts src/domain/ideas.ts src/domain/plan.ts src/domain/ics.ts \
  tests/timeline.test.ts tests/plan.test.ts tests/ics.test.ts
land "feat(security): sanitiser, guardrails and rate limiters" \
  src/security src/server/ttl-cache.ts src/server/config.ts src/server/logger.ts \
  tests/sanitize.test.ts tests/guardrails.test.ts tests/infra.test.ts
land "feat(ai): schema-constrained Gemini enhancer with timeout, cache and canary" src/ai tests/ai.test.ts
land "feat(api): guarded plan and enhance endpoints" \
  src/server/validate-request.ts src/server/plan-handler.ts src/server/container.ts src/app/api src/proxy.ts \
  tests/validate-request.test.ts tests/plan-handler.test.ts
land "feat(ui): accessible planner form and results view" src/app src/components src/lib
land "ci: GitHub Actions, CodeQL and preflight gates" .github scripts
land "docs: README, SECURITY and CONTRIBUTING" README.md SECURITY.md CONTRIBUTING.md

if [ -n "$(git status --porcelain)" ]; then
  echo "warning: some files were not committed:" >&2
  git status --short >&2
  exit 1
fi
echo "Done. Next: git remote add origin <your-public-repo-url> && git push -u origin main"
