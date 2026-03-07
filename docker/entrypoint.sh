#!/bin/bash
set -e

# 1. 后台启动 crond (不带 -f 参数)
busybox crond -L /dev/stderr
exec node /app/dist/cjs/server.mjs