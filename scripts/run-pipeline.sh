#!/usr/bin/env bash
# ZCyberNews — Automated AI content pipeline
#
# PRIMARY runner: .github/workflows/ai-content-pipeline.yml (hourly, on GitHub Actions)
# This script is kept as a LOCAL BACKUP only — run manually if you need to
# generate articles from the VPS (e.g. when GitHub Actions is down).
#
# Responsibilities:
#   - pull latest code
#   - run the AI pipeline (generate + translate + write MDX)
#   - commit and push new content
#   - send a Telegram notification
#
# NOT responsible for:
#   - rebuilding Next.js  (handled by deploy-vps.yml on push)
#   - restarting PM2      (handled by deploy-vps.yml on push)
#
# Usage: bash scripts/run-pipeline.sh [--max-articles=N]
# Default: 3 articles per run

set -euo pipefail

REPO_DIR="/home/zcybernews/zcybernews"
LOG_FILE="$REPO_DIR/.pipeline-logs/pipeline-$(TZ='Asia/Singapore' date +%Y-%m-%d).log"
MAX_ARTICLES="${1:-3}"

# Strip --max-articles= prefix if passed directly
MAX_ARTICLES="${MAX_ARTICLES#--max-articles=}"

cd "$REPO_DIR"

mkdir -p "$(dirname "$LOG_FILE")"

# ── Log rotation: delete logs older than 30 days ──────────────────────────
find "$REPO_DIR/.pipeline-logs" -name "*.log" -mtime +30 -delete 2>/dev/null || true

exec >> "$LOG_FILE" 2>&1

# ── Load env vars (for API keys + Telegram config) ─────────────────────────
if [ -f "$REPO_DIR/.env.local" ]; then
  set -a
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
    key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    export "$key=$value"
  done < "$REPO_DIR/.env.local"
  set +a
fi

# ── Telegram notification helper ────────────────────────────────────────────
notify() {
  local message="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      --data-urlencode chat_id="${TELEGRAM_CHAT_ID}" \
      --data-urlencode parse_mode="HTML" \
      --data-urlencode disable_web_page_preview="true" \
      --data-urlencode text="${message}" \
      > /dev/null 2>&1 || true
  fi
}

echo ""
echo "=============================================="
echo "  ZCyberNews Pipeline — $(TZ='Asia/Singapore' date '+%Y-%m-%d %H:%M:%S SGT')"
echo "=============================================="

# 1. Pull latest code from GitHub
echo "[deploy] Syncing to latest remote main..."
git fetch origin main || echo "[deploy] ⚠️  git fetch failed — continuing with current code."
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  git rebase origin/main || {
    echo "[deploy] ⚠️  rebase failed — hard-resetting to origin/main"
    git rebase --abort 2>/dev/null || true
    git reset --hard origin/main
  }
fi

# 2. Run the AI pipeline (partial failures OK — publish whatever succeeded)
echo "[pipeline] Starting — max articles: $MAX_ARTICLES"
set +e
npx tsx --env-file=.env.local scripts/pipeline/index.ts --max-articles="$MAX_ARTICLES"
PIPELINE_EXIT=$?
set -e

if [ $PIPELINE_EXIT -ne 0 ]; then
  echo "[pipeline] ⚠️  Pipeline exited with code $PIPELINE_EXIT (some articles may have failed)"
fi

# 3. Check if any new content was written
NEW_FILES=$(git status --short content/ 2>/dev/null | wc -l | tr -d ' ')

if [ "$NEW_FILES" -eq 0 ]; then
  echo "[pipeline] No new articles written (all stories already processed). Done."
  exit 0
fi

echo "[pipeline] $NEW_FILES new file(s) detected — committing."

# 4. Commit new content to GitHub (deploy-vps.yml will rebuild + restart on push)
git config user.name "zcybernews-bot"
git config user.email "bot@zcybernews.com"
git add content/ .pipeline-cache/ data/ public/images/articles/ 2>/dev/null || true
git diff --staged --quiet || git commit -m "chore: ai pipeline $(TZ='Asia/Singapore' date +%Y-%m-%dT%H:%M:%S+08:00)"
echo "[git] Pushing to origin main..."
git push origin main 2>&1 || echo "[git] ⚠️  Push failed — will retry on next run"

# 5. Collect article titles for notification
ARTICLE_TITLES=$(git log -1 --name-only --pretty=format: -- content/en/ 2>/dev/null \
  | awk 'NF' \
  | xargs -I{} basename {} .mdx 2>/dev/null \
  | head -5 \
  | sed 's/-/ /g' \
  | sed 's/^/• /' || echo "")

ARTICLE_COUNT=$(echo "$ARTICLE_TITLES" | grep -c '^•' || echo 0)

notify "✅ <b>ZCyberNews Published ${ARTICLE_COUNT} article(s)</b>
Time: $(TZ='Asia/Singapore' date '+%H:%M SGT')

${ARTICLE_TITLES}

🔗 https://zcybernews.com"

echo "[pipeline] ✅ Done — $(TZ='Asia/Singapore' date '+%Y-%m-%d %H:%M:%S SGT')"
