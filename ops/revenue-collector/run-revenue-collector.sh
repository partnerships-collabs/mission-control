#!/bin/bash
# Boot-safe wrapper for the revenue collector. launchd runs this as a named,
# non-root service user; no GUI session or inherited shell environment is used.

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVICE_HOME="${HOME:?HOME must be set by launchd}"

VENV_PYTHON="${REVENUE_VENV_PYTHON:-$SERVICE_HOME/Services/venvs/mission-control-revenue/bin/python}"
SECRET_LOADER="${REVENUE_SECRET_LOADER:-$SERVICE_HOME/.openclaw/workspace/scripts/secret_loader.py}"
LOG_DIR="${REVENUE_LOG_DIR:-$SERVICE_HOME/Library/Logs/CreatorsAgency/revenue-collector}"
STATE_DIR="${REVENUE_STATE_DIR:-$SERVICE_HOME/Library/Application Support/CreatorsAgency/revenue-collector}"
TELEGRAM_CHAT_ID_FILE="${REVENUE_TELEGRAM_CHAT_ID_FILE:-$STATE_DIR/telegram-chat-id}"
COLLECTOR_LOG="$LOG_DIR/collector.log"
LOCK_FILE="$STATE_DIR/collector.lock"
MAX_ATTEMPTS=3
RETRY_DELAYS=(300 900)

mkdir -p "$LOG_DIR" "$STATE_DIR"
chmod 700 "$LOG_DIR" "$STATE_DIR"
touch "$COLLECTOR_LOG" "$LOCK_FILE"
chmod 600 "$COLLECTOR_LOG" "$LOCK_FILE"

log_line() {
  printf '%s -- %s\n' "$(TZ=America/Chicago date '+%Y-%m-%d %H:%M:%S %Z')" "$*" >> "$COLLECTOR_LOG"
}

send_failure_alert() {
  local message="$1"
  local secret_python="$VENV_PYTHON"
  local telegram_chat_id=""
  local telegram_chat_id_owner
  local telegram_chat_id_mode
  local telegram_bot_token

  if [[ ! -r "$TELEGRAM_CHAT_ID_FILE" || -L "$TELEGRAM_CHAT_ID_FILE" ]]; then
    log_line "failure alert was not sent: private Telegram destination file is unavailable"
    return 1
  fi
  if ! telegram_chat_id_owner=$(/usr/bin/stat -f '%u' "$TELEGRAM_CHAT_ID_FILE") ||
    ! telegram_chat_id_mode=$(/usr/bin/stat -f '%Lp' "$TELEGRAM_CHAT_ID_FILE"); then
    log_line "failure alert was not sent: private Telegram destination metadata is unavailable"
    return 1
  fi
  if [[ "$telegram_chat_id_owner" != "$(/usr/bin/id -u)" || "$telegram_chat_id_mode" != "600" ]]; then
    log_line "failure alert was not sent: private Telegram destination must be owned by the service user and mode 0600"
    return 1
  fi
  IFS= read -r telegram_chat_id < "$TELEGRAM_CHAT_ID_FILE" || true
  if [[ ! "$telegram_chat_id" =~ ^-?[0-9]+$ ]]; then
    log_line "failure alert was not sent: private Telegram destination is invalid"
    return 1
  fi

  if [[ ! -x "$secret_python" ]]; then
    secret_python="/opt/homebrew/bin/python3"
  fi
  if [[ ! -x "$secret_python" || ! -r "$SECRET_LOADER" ]]; then
    log_line "failure alert was not sent: secret-loading runtime unavailable"
    return 1
  fi
  if ! telegram_bot_token=$("$secret_python" "$SECRET_LOADER" ari_telegram_bot 2>> "$COLLECTOR_LOG"); then
    log_line "failure alert was not sent: Telegram credential unavailable"
    return 1
  fi

  # Pass the token through curl's standard-input configuration so it is not
  # exposed in the process argument list.
  if ! printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$telegram_bot_token" |
    /usr/bin/curl --config - --silent --show-error --fail \
      --request POST \
      --data-urlencode "chat_id=$telegram_chat_id" \
      --data-urlencode "text=$message" \
      --data-urlencode "parse_mode=Markdown" \
      >/dev/null 2>> "$COLLECTOR_LOG"; then
    log_line "failure alert was not sent: Telegram request failed"
    return 1
  fi
}

if [[ ! -x "$VENV_PYTHON" ]]; then
  log_line "collector aborted: virtual-environment Python is unavailable"
  send_failure_alert "⚠️ *revenue collector did not start*: virtual-environment Python is unavailable on \`$(hostname -s)\`" || true
  exit 78
fi
if [[ ! -r "$SECRET_LOADER" ]]; then
  log_line "collector aborted: approved secret loader is unavailable"
  send_failure_alert "⚠️ *revenue collector did not start*: approved secret loader is unavailable on \`$(hostname -s)\`" || true
  exit 78
fi

# Hold an advisory lock for the life of this shell. A second scheduler or a
# manual invocation exits instead of posting an overlapping snapshot.
exec 9> "$LOCK_FILE"
if ! /usr/bin/lockf -s -t 0 9; then
  log_line "collector skipped: another collector process holds the lock"
  exit 75
fi

SECRET_LOADER_ROOT="$(cd "$(dirname "$SECRET_LOADER")/.." && pwd)"
last_exit=1

for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1)); do
  log_line "revenue collector attempt $attempt/$MAX_ATTEMPTS starting"
  if (
    cd "$REPO_ROOT" || exit 72
    PYTHONPATH="$SECRET_LOADER_ROOT${PYTHONPATH:+:$PYTHONPATH}" \
      "$VENV_PYTHON" scripts/collect_all_revenue.py
  ) >> "$COLLECTOR_LOG" 2>&1; then
    log_line "revenue collector completed OK on attempt $attempt"
    exit 0
  else
    last_exit=$?
  fi

  log_line "revenue collector attempt $attempt failed (exit $last_exit)"
  if ((attempt < MAX_ATTEMPTS)); then
    delay="${RETRY_DELAYS[$((attempt - 1))]}"
    log_line "retrying in $delay seconds"
    /bin/sleep "$delay"
  fi
done

tail_text=$(/usr/bin/tail -c 500 "$COLLECTOR_LOG")
send_failure_alert "⚠️ *revenue collector failed after $MAX_ATTEMPTS attempts* (exit $last_exit)
\`\`\`
$tail_text
\`\`\`
Host: \`$(hostname -s)\`" || true
exit "$last_exit"
