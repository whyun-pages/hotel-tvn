#!/bin/bash
set -e

# 0. 生成 schedule-config.json
node /app/docker/gen-config.mjs

# 1. 后台启动 crond (不带 -f 参数)
busybox crond -L /dev/stderr
exec node /app/dist/cjs/server.mjs