#!/bin/bash

# 配置变量（DIRECTORY 相对于脚本所在目录，与从何处运行无关）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="hotel-tvn"
DIRECTORY="$SCRIPT_DIR/../output"

# 1. 生成 manifest (文件名: 哈希值)
# 使用 sha256sum 计算并构建 JSON
MANIFEST="{"
for file in $(ls $DIRECTORY); do
  HASH=$(sha256sum "$DIRECTORY/$file" | awk '{print $1}')
  MANIFEST="$MANIFEST\"/$file\":\"$HASH\","
done
# 去掉最后一个逗号并闭合 JSON
MANIFEST="${MANIFEST%,}}"

# 2. 创建 deployment，获取 id
RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -F "manifest=$MANIFEST")

if command -v jq &>/dev/null; then
  DEPLOYMENT_ID=$(echo "$RESPONSE" | jq -r '.result.id // empty')
else
  # 兼容 "id": "xxx" 或 "id":"xxx"（冒号后可有空格）
  DEPLOYMENT_ID=$(echo "$RESPONSE" | grep -oE '"id"[ \t]*:[ \t]*"[^"]*"' | head -1 | sed -E 's/"id"[ \t]*:[ \t]*"([^"]*)"/\1/')
fi
if [ -z "$DEPLOYMENT_ID" ]; then
  echo "创建 deployment 失败，响应: $RESPONSE"
  exit 1
fi
echo "Deployment ID: $DEPLOYMENT_ID"

# 3. 上传文件完成部署
curl -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments/${DEPLOYMENT_ID}/files" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -F "lives.txt=@$DIRECTORY/lives.txt" \
  -F "lives.m3u=@$DIRECTORY/lives.m3u"