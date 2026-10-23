#!/usr/bin/env bash
# 学习资料平台启动脚本
# 凭证存放于 ~/.config/study-platform/env（权限 600，不进项目、不进仓库）
# 用法: ./start.sh        前台启动
#       ./start.sh stop   停止服务

set -euo pipefail
cd "$(dirname "$0")"

ENV_FILE="$HOME/.config/study-platform/env"
PID_FILE="$HOME/.config/study-platform/server.pid"

if [ ! -f "$ENV_FILE" ]; then
  echo "缺少凭证文件 $ENV_FILE" >&2
  exit 1
fi

case "${1:-}" in
  stop)
    if [ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "已停止"
    else
      echo "服务未在运行"
    fi
    exit 0
    ;;
esac

echo $$ > "$PID_FILE"
exec node --env-file="$ENV_FILE" server/server.mjs
