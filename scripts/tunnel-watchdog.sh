#!/data/data/com.termux/files/usr/bin/bash
# 隧道与平台服务守护脚本
# 检查项：
#   1) 本地服务 8787 是否响应（不通则拉起 study-platform）
#   2) cloudflared 进程是否在跑（sv 状态）
#   3) 隧道 metrics 的 ha_connections 是否 > 0（连续 3 次为 0 判定断线，重启隧道）
# 异常时：自动拉起 + 安卓通知（termux-notification），并写日志（自动截断）。

set -uo pipefail

LOG="$HOME/.cloudflared/watchdog.log"
PIDFILE="$HOME/.cloudflared/watchdog.pid"
STATE_DIR="$HOME/.cloudflared/watchdog-state"
mkdir -p "$STATE_DIR"
FAIL_COUNT_FILE="$STATE_DIR/metrics_fail_count"
LOCAL_FAIL_FILE="$STATE_DIR/local_fail_count"
METRICS_URL="http://127.0.0.1:20241/metrics"
LOCAL_URL="http://localhost:8787/"
MAX_LOG_LINES=800

log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG"
  # 日志截断，避免无限增长
  if [ -f "$LOG" ] && [ "$(wc -l <"$LOG")" -gt "$MAX_LOG_LINES" ]; then
    tail -n $((MAX_LOG_LINES / 2)) "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
}

notify() {
  # $1=标题 $2=内容 $3=优先级(high/default)
  if command -v termux-notification >/dev/null 2>&1; then
    termux-notification \
      --title "$1" \
      --content "$2" \
      --id watchdog-tunnel \
      --priority "${3:-default}" \
      --vibrate 200 \
      >/dev/null 2>&1 || true
  fi
}

read_count() { [ -f "$1" ] && cat "$1" 2>/dev/null || echo 0; }
write_count() { printf '%s' "$2" >"$1"; }

# ---------- 1. 本地平台服务 ----------
if ! curl -s -o /dev/null --max-time 8 "$LOCAL_URL"; then
  n=$(( $(read_count "$LOCAL_FAIL_FILE") + 1 ))
  write_count "$LOCAL_FAIL_FILE" "$n"
  log "本地服务 8787 无响应（连续 ${n} 次）"
  if [ "$n" -ge 2 ]; then
    sv up study-platform >/dev/null 2>&1 || true
    log "已尝试拉起 study-platform"
    notify "学习资料平台离线" "本地 8787 无响应，已自动重启服务" "high"
    write_count "$LOCAL_FAIL_FILE" 0
  fi
else
  write_count "$LOCAL_FAIL_FILE" 0
fi

# ---------- 2. cloudflared 进程 ----------
SV_STATE="$(sv status cloudflared 2>/dev/null || true)"
if ! printf '%s' "$SV_STATE" | grep -q '^run:'; then
  log "cloudflared 未运行：${SV_STATE:-无状态输出}"
  sv up cloudflared >/dev/null 2>&1 || true
  sleep 6
  sv up cloudflared >/dev/null 2>&1 || true
  log "已尝试拉起 cloudflared"
  notify "Cloudflare 隧道已断开" "隧道进程未运行，已自动重启" "high"
  write_count "$FAIL_COUNT_FILE" 0
else
  # ---------- 3. 隧道连接数（metrics） ----------
  conns="$(curl -s --max-time 5 "$METRICS_URL" 2>/dev/null | awk '/^cloudflared_tunnel_ha_connections /{print $2; exit}')"
  if [ -z "${conns:-}" ]; then
    # metrics 还没起来时不算失败，仅记录
    log "metrics 暂不可用（忽略本周期）"
  elif [ "${conns%.*}" -le 0 ]; then
    n=$(( $(read_count "$FAIL_COUNT_FILE") + 1 ))
    write_count "$FAIL_COUNT_FILE" "$n"
    log "隧道连接数为 0（连续 ${n} 次）"
    if [ "$n" -ge 3 ]; then
      sv restart cloudflared >/dev/null 2>&1 || { sv down cloudflared >/dev/null 2>&1; sleep 2; sv up cloudflared >/dev/null 2>&1; }
      log "已重启 cloudflared"
      notify "Cloudflare 隧道断线" "隧道无有效连接，已自动重启" "high"
      write_count "$FAIL_COUNT_FILE" 0
    fi
  else
    write_count "$FAIL_COUNT_FILE" 0
  fi
fi

exit 0
